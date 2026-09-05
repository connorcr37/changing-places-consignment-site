import { handleIntake, handleIntakeQueue, recoverIntake } from './intake.mjs';

const GRAPH_RESPONSE_LIMIT_BYTES = 500_000;
const FEED_CACHE_TTL_SECONDS = 7 * 24 * 60 * 60;
const FEED_FRESHNESS_MS = 15 * 60 * 1000;
const GRAPH_REQUEST_TIMEOUT_MS = 8_000;
const FACEBOOK_VIDEO_FIELDS = [
  "id",
  "created_time",
  "live_status",
  "permalink_url",
  "picture",
  "thumbnails{uri,height,width}",
].join(",");
const FACEBOOK_LIVE_POST_FIELDS = [
  "id",
  "created_time",
  "permalink_url",
  "is_fb_live_videos",
  "was_fb_live_videos",
  "status_type",
  "attachments{media_type,target,url,media}",
].join(",");

export class FacebookFeedError extends Error {
  constructor(code) {
    super(code);
    this.name = "FacebookFeedError";
    this.code = code;
  }
}

const isPlainObject = (value) =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

export const isSafeFacebookUrl = (value) => {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      (url.hostname === "facebook.com" || url.hostname.endsWith(".facebook.com"))
    );
  } catch {
    return false;
  }
};

export const isSafeFacebookImageUrl = (value) => {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      (url.hostname === "fbcdn.net" || url.hostname.endsWith(".fbcdn.net"))
    );
  } catch {
    return false;
  }
};

const normalizeGraphVersion = (value) =>
  /^v\d{1,2}\.\d$/.test(value || "") ? value : "v26.0";

const normalizePageId = (value) =>
  value === "me" || /^\d{5,30}$/.test(value || "") ? value : "me";

export const buildFacebookGraphUrl = ({
  graphVersion = "v26.0",
  pageId = "me",
} = {}) => {
  const url = new URL(
    `https://graph.facebook.com/${normalizeGraphVersion(graphVersion)}/${normalizePageId(pageId)}/videos`,
  );
  url.searchParams.set("type", "UPLOADED");
  url.searchParams.set("fields", FACEBOOK_VIDEO_FIELDS);
  url.searchParams.set("limit", "25");
  return url;
};

export const buildFacebookLivePostsUrl = ({
  graphVersion = "v26.0",
  pageId = "me",
} = {}) => {
  const url = new URL(
    `https://graph.facebook.com/${normalizeGraphVersion(graphVersion)}/${normalizePageId(pageId)}/posts`,
  );
  url.searchParams.set("fields", FACEBOOK_LIVE_POST_FIELDS);
  url.searchParams.set("limit", "25");
  return url;
};

export const buildFacebookManagedPagesUrl = ({ graphVersion = "v26.0" } = {}) => {
  const url = new URL(
    `https://graph.facebook.com/${normalizeGraphVersion(graphVersion)}/me/accounts`,
  );
  url.searchParams.set("fields", "id,access_token");
  url.searchParams.set("limit", "100");
  return url;
};

const chooseThumbnail = (video) => {
  if (!isPlainObject(video)) return "";

  const candidates = [];
  if (isSafeFacebookImageUrl(video.picture)) {
    candidates.push({ url: video.picture, area: 0 });
  }

  if (isPlainObject(video.thumbnails) && Array.isArray(video.thumbnails.data)) {
    for (const thumbnail of video.thumbnails.data) {
      if (!isPlainObject(thumbnail) || !isSafeFacebookImageUrl(thumbnail.uri)) {
        continue;
      }
      const width = Number(thumbnail.width);
      const height = Number(thumbnail.height);
      const calculatedArea = width * height;
      const area =
        Number.isFinite(width) &&
        width > 0 &&
        Number.isFinite(height) &&
        height > 0 &&
        Number.isFinite(calculatedArea)
          ? calculatedArea
          : 0;
      candidates.push({ url: thumbnail.uri, area });
    }
  }

  candidates.sort((left, right) => right.area - left.area);
  return candidates[0]?.url || "";
};

const resolveFacebookPermalink = (value, videoId) => {
  if (typeof value === "string" && value.trim()) {
    try {
      const resolvedUrl = new URL(value.trim(), "https://www.facebook.com/").href;
      if (isSafeFacebookUrl(resolvedUrl)) return resolvedUrl;
    } catch {
      // Fall through to the canonical watch URL.
    }
  }

  const fallbackUrl = new URL("https://www.facebook.com/watch/");
  fallbackUrl.searchParams.set("v", videoId);
  return fallbackUrl.href;
};

export const normalizeMetaFeed = (payload) => {
  if (!isPlainObject(payload) || !Array.isArray(payload.data)) return [];

  const videos = payload.data.flatMap((video) => {
    if (!isPlainObject(video) || video.live_status !== "VOD") return [];

    const videoId = typeof video.id === "string" ? video.id.trim() : "";
    if (!/^\d{5,30}$/.test(videoId)) return [];

    const permalinkUrl = resolveFacebookPermalink(video.permalink_url, videoId);
    const thumbnailUrl = chooseThumbnail(video);
    const rawCreatedTime =
      typeof video.created_time === "string" ? video.created_time.trim() : "";
    const createdDate = new Date(rawCreatedTime);

    if (
      !isSafeFacebookUrl(permalinkUrl) ||
      !thumbnailUrl ||
      Number.isNaN(createdDate.getTime())
    ) {
      return [];
    }

    const normalized = {
      id: videoId,
      permalinkUrl,
      thumbnailUrl,
      createdTime: createdDate.toISOString(),
    };
    return [normalized];
  });

  const uniqueVideos = new Map();
  for (const video of videos) {
    if (!uniqueVideos.has(video.id)) uniqueVideos.set(video.id, video);
  }

  return [...uniqueVideos.values()]
    .sort((left, right) => right.createdTime.localeCompare(left.createdTime))
    .slice(0, 5);
};

const getPostAttachments = (post) =>
  isPlainObject(post?.attachments) && Array.isArray(post.attachments.data)
    ? post.attachments.data.filter(isPlainObject)
    : [];

const getFacebookVideoIdFromUrl = (value) => {
  if (!isSafeFacebookUrl(value)) return "";
  const url = new URL(value);
  const pathMatch = url.pathname.match(/\/videos\/(\d{5,30})(?:\/|$)/);
  if (pathMatch) return pathMatch[1];
  const queryId = url.searchParams.get("v") || "";
  return /^\d{5,30}$/.test(queryId) ? queryId : "";
};

const getLivePostVideoId = (post, attachments) => {
  for (const attachment of attachments) {
    const target = isPlainObject(attachment.target) ? attachment.target : {};
    const targetId = typeof target.id === "string" ? target.id.trim() : "";
    if (/^\d{5,30}$/.test(targetId)) return targetId;

    const targetUrlId = getFacebookVideoIdFromUrl(target.url);
    if (targetUrlId) return targetUrlId;
    const attachmentUrlId = getFacebookVideoIdFromUrl(attachment.url);
    if (attachmentUrlId) return attachmentUrlId;
  }
  return getFacebookVideoIdFromUrl(post.permalink_url);
};

const getLivePostPermalink = (post, attachments, videoId) => {
  const candidates = [post.permalink_url];
  for (const attachment of attachments) {
    const target = isPlainObject(attachment.target) ? attachment.target : {};
    candidates.push(target.url, attachment.url);
  }
  const safeCandidate = candidates.find(
    (value) => typeof value === "string" && isSafeFacebookUrl(value.trim()),
  );
  return resolveFacebookPermalink(safeCandidate, videoId);
};

const chooseLivePostThumbnail = (attachments) => {
  const candidates = [];
  for (const attachment of attachments) {
    const media = isPlainObject(attachment.media) ? attachment.media : {};
    const image = isPlainObject(media.image) ? media.image : {};
    if (!isSafeFacebookImageUrl(image.src)) continue;
    const width = Number(image.width);
    const height = Number(image.height);
    const area =
      Number.isFinite(width) && width > 0 && Number.isFinite(height) && height > 0
        ? width * height
        : 0;
    candidates.push({ url: image.src, area });
  }
  candidates.sort((left, right) => right.area - left.area);
  return candidates[0]?.url || "";
};

export const normalizeMetaLivePosts = (payload) => {
  if (!isPlainObject(payload) || !Array.isArray(payload.data)) return [];

  const videos = payload.data.flatMap((post) => {
    if (
      !isPlainObject(post) ||
      (post.is_fb_live_videos !== true && post.was_fb_live_videos !== true)
    ) {
      return [];
    }

    const attachments = getPostAttachments(post);
    const videoId = getLivePostVideoId(post, attachments);
    if (!/^\d{5,30}$/.test(videoId)) return [];

    const permalinkUrl = getLivePostPermalink(post, attachments, videoId);
    const thumbnailUrl = chooseLivePostThumbnail(attachments);
    const rawCreatedTime =
      typeof post.created_time === "string" ? post.created_time.trim() : "";
    const createdDate = new Date(rawCreatedTime);

    if (
      !isSafeFacebookUrl(permalinkUrl) ||
      !thumbnailUrl ||
      Number.isNaN(createdDate.getTime())
    ) {
      return [];
    }

    return [
      {
        id: videoId,
        permalinkUrl,
        thumbnailUrl,
        createdTime: createdDate.toISOString(),
      },
    ];
  });

  const uniqueVideos = new Map();
  for (const video of videos) {
    if (!uniqueVideos.has(video.id)) uniqueVideos.set(video.id, video);
  }

  return [...uniqueVideos.values()]
    .sort((left, right) => right.createdTime.localeCompare(left.createdTime))
    .slice(0, 5);
};

const getEmptyFeedDiagnosticCode = (payload) => {
  const data =
    isPlainObject(payload) && Array.isArray(payload.data) ? payload.data : [];
  const counts = {
    dataItems: data.length,
    vodStatuses: 0,
    missingOrOtherStatus: 0,
    validNumericId: 0,
    validDate: 0,
    safePermalink: 0,
    safeThumbnail: 0,
  };

  for (const video of data) {
    if (!isPlainObject(video)) {
      counts.missingOrOtherStatus += 1;
      continue;
    }

    if (video.live_status === "VOD") {
      counts.vodStatuses += 1;
    } else {
      counts.missingOrOtherStatus += 1;
    }

    const videoId = typeof video.id === "string" ? video.id.trim() : "";
    const hasValidNumericId = /^\d{5,30}$/.test(videoId);
    if (hasValidNumericId) counts.validNumericId += 1;

    const rawCreatedTime =
      typeof video.created_time === "string" ? video.created_time.trim() : "";
    if (!Number.isNaN(new Date(rawCreatedTime).getTime())) {
      counts.validDate += 1;
    }

    if (
      hasValidNumericId &&
      isSafeFacebookUrl(resolveFacebookPermalink(video.permalink_url, videoId))
    ) {
      counts.safePermalink += 1;
    }

    if (chooseThumbnail(video)) counts.safeThumbnail += 1;
  }

  return [
    "facebook_graph_empty_feed",
    "data_items",
    counts.dataItems,
    "vod_statuses",
    counts.vodStatuses,
    "missing_or_other_status",
    counts.missingOrOtherStatus,
    "valid_numeric_id",
    counts.validNumericId,
    "valid_date",
    counts.validDate,
    "safe_permalink",
    counts.safePermalink,
    "safe_thumbnail",
    counts.safeThumbnail,
  ].join("_");
};

const getEmptyLivePostsDiagnosticCode = (payload) => {
  const data =
    isPlainObject(payload) && Array.isArray(payload.data) ? payload.data : [];
  const counts = {
    dataItems: data.length,
    currentLivePosts: 0,
    archivedLivePosts: 0,
    attachments: 0,
    validNumericId: 0,
    validDate: 0,
    safePermalink: 0,
    safeThumbnail: 0,
  };

  for (const post of data) {
    if (!isPlainObject(post)) continue;
    if (post.is_fb_live_videos === true) counts.currentLivePosts += 1;
    if (post.was_fb_live_videos === true) counts.archivedLivePosts += 1;
    const attachments = getPostAttachments(post);
    counts.attachments += attachments.length;

    const videoId = getLivePostVideoId(post, attachments);
    const hasValidNumericId = /^\d{5,30}$/.test(videoId);
    if (hasValidNumericId) counts.validNumericId += 1;

    const rawCreatedTime =
      typeof post.created_time === "string" ? post.created_time.trim() : "";
    if (!Number.isNaN(new Date(rawCreatedTime).getTime())) counts.validDate += 1;

    if (
      hasValidNumericId &&
      isSafeFacebookUrl(getLivePostPermalink(post, attachments, videoId))
    ) {
      counts.safePermalink += 1;
    }

    if (chooseLivePostThumbnail(attachments)) counts.safeThumbnail += 1;
  }

  return [
    "facebook_graph_posts_empty_feed",
    "data_items",
    counts.dataItems,
    "current_live_posts",
    counts.currentLivePosts,
    "archived_live_posts",
    counts.archivedLivePosts,
    "attachments",
    counts.attachments,
    "valid_numeric_id",
    counts.validNumericId,
    "valid_date",
    counts.validDate,
    "safe_permalink",
    counts.safePermalink,
    "safe_thumbnail",
    counts.safeThumbnail,
  ].join("_");
};

const readBoundedGraphResponse = async (response) => {
  const contentLength = response.headers.get("content-length");
  const declaredLength = contentLength === null ? NaN : Number(contentLength);
  if (Number.isFinite(declaredLength) && declaredLength > GRAPH_RESPONSE_LIMIT_BYTES) {
    try {
      await response.body?.cancel("facebook_graph_response_too_large");
    } catch {
      // The sanitized size error below remains the public failure reason.
    }
    throw new FacebookFeedError("facebook_graph_response_too_large");
  }

  if (!response.body) return "";

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let totalBytes = 0;
  let responseText = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      totalBytes += value.byteLength;
      if (totalBytes > GRAPH_RESPONSE_LIMIT_BYTES) {
        try {
          await reader.cancel("facebook_graph_response_too_large");
        } catch {
          // The sanitized size error below remains the public failure reason.
        }
        throw new FacebookFeedError("facebook_graph_response_too_large");
      }

      responseText += decoder.decode(value, { stream: true });
    }

    return responseText + decoder.decode();
  } finally {
    reader.releaseLock();
  }
};

const normalizeMetaErrorNumber = (value) =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    ? String(value)
    : "";

const getFacebookGraphErrorNumbers = (responseText) => {
  try {
    const payload = JSON.parse(responseText);
    const metaError = isPlainObject(payload) && isPlainObject(payload.error)
      ? payload.error
      : null;
    return {
      code: normalizeMetaErrorNumber(metaError?.code),
      subcode: normalizeMetaErrorNumber(metaError?.error_subcode),
    };
  } catch {
    return { code: "", subcode: "" };
  }
};

const getFacebookGraphHttpErrorCode = (status, responseText) => {
  const codeParts = [`facebook_graph_http_${status}`];
  const { code, subcode } = getFacebookGraphErrorNumbers(responseText);
  if (code) codeParts.push("meta_code", code);
  if (subcode) codeParts.push("error_subcode", subcode);

  return codeParts.join("_");
};

const requiresPageAccessToken = (responseText) => {
  const { code, subcode } = getFacebookGraphErrorNumbers(responseText);
  return code === "190" && subcode === "2069032";
};

const findManagedPageAccessToken = (payload, pageId) => {
  if (!/^\d{5,30}$/.test(pageId || "")) return "";
  if (!isPlainObject(payload) || !Array.isArray(payload.data)) return "";

  const page = payload.data.find(
    (candidate) => isPlainObject(candidate) && candidate.id === pageId,
  );
  if (!page || typeof page.access_token !== "string") return "";
  const token = page.access_token.trim();
  return token && token.length <= 4096 && !/[\u0000-\u001f\u007f]/.test(token)
    ? token
    : "";
};

export const fetchFacebookFeed = async ({
  accessToken,
  graphVersion = "v26.0",
  pageId = "me",
  fetchImpl = fetch,
}) => {
  const trimmedAccessToken =
    typeof accessToken === "string" ? accessToken.trim() : "";
  if (!trimmedAccessToken) {
    throw new FacebookFeedError("facebook_token_missing");
  }

  const abortController = new AbortController();
  const timeout = setTimeout(() => abortController.abort(), GRAPH_REQUEST_TIMEOUT_MS);

  try {
    const response = await fetchImpl(
      buildFacebookGraphUrl({ graphVersion, pageId }),
      {
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${trimmedAccessToken}`,
        },
        signal: abortController.signal,
      },
    );

    if (!response.ok) {
      const responseText = await readBoundedGraphResponse(response);
      throw new FacebookFeedError(
        getFacebookGraphHttpErrorCode(response.status, responseText),
      );
    }

    const responseText = await readBoundedGraphResponse(response);

    let payload;
    try {
      payload = JSON.parse(responseText);
    } catch {
      throw new FacebookFeedError("facebook_graph_invalid_json");
    }

    const videos = normalizeMetaFeed(payload);
    if (videos.length) return videos;

    const uploadedVideosAreEmpty =
      isPlainObject(payload) &&
      Array.isArray(payload.data) &&
      payload.data.length === 0;
    if (!uploadedVideosAreEmpty) {
      throw new FacebookFeedError(getEmptyFeedDiagnosticCode(payload));
    }

    let postsResponse = await fetchImpl(
      buildFacebookLivePostsUrl({ graphVersion, pageId }),
      {
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${trimmedAccessToken}`,
        },
        signal: abortController.signal,
      },
    );
    let postsResponseText = await readBoundedGraphResponse(postsResponse);

    if (!postsResponse.ok && requiresPageAccessToken(postsResponseText)) {
      const managedPagesResponse = await fetchImpl(
        buildFacebookManagedPagesUrl({ graphVersion }),
        {
          headers: {
            Accept: "application/json",
            Authorization: `Bearer ${trimmedAccessToken}`,
          },
          signal: abortController.signal,
        },
      );
      const managedPagesResponseText =
        await readBoundedGraphResponse(managedPagesResponse);
      if (!managedPagesResponse.ok) {
        throw new FacebookFeedError(
          getFacebookGraphHttpErrorCode(
            managedPagesResponse.status,
            managedPagesResponseText,
          ),
        );
      }

      let managedPagesPayload;
      try {
        managedPagesPayload = JSON.parse(managedPagesResponseText);
      } catch {
        throw new FacebookFeedError("facebook_graph_accounts_invalid_json");
      }

      const resolvedPageAccessToken = findManagedPageAccessToken(
        managedPagesPayload,
        normalizePageId(pageId),
      );
      if (!resolvedPageAccessToken) {
        throw new FacebookFeedError("facebook_graph_page_token_not_found");
      }

      postsResponse = await fetchImpl(
        buildFacebookLivePostsUrl({ graphVersion, pageId }),
        {
          headers: {
            Accept: "application/json",
            Authorization: `Bearer ${resolvedPageAccessToken}`,
          },
          signal: abortController.signal,
        },
      );
      postsResponseText = await readBoundedGraphResponse(postsResponse);
    }

    if (!postsResponse.ok) {
      throw new FacebookFeedError(
        getFacebookGraphHttpErrorCode(postsResponse.status, postsResponseText),
      );
    }

    let postsPayload;
    try {
      postsPayload = JSON.parse(postsResponseText);
    } catch {
      throw new FacebookFeedError("facebook_graph_posts_invalid_json");
    }

    const livePosts = normalizeMetaLivePosts(postsPayload);
    if (!livePosts.length) {
      throw new FacebookFeedError(getEmptyLivePostsDiagnosticCode(postsPayload));
    }

    return livePosts;
  } catch (error) {
    if (error instanceof FacebookFeedError) throw error;
    if (abortController.signal.aborted) {
      throw new FacebookFeedError("facebook_graph_timeout");
    }
    throw new FacebookFeedError("facebook_graph_request_failed");
  } finally {
    clearTimeout(timeout);
  }
};

const isValidPublicFeed = (payload) => {
  if (!isPlainObject(payload) || !Array.isArray(payload.videos)) return false;
  if (!payload.videos.length || payload.videos.length > 5) return false;
  if (typeof payload.updatedAt !== "string") return false;
  if (Number.isNaN(new Date(payload.updatedAt).getTime())) return false;

  return payload.videos.every(
    (video) =>
      isPlainObject(video) &&
      typeof video.id === "string" &&
      /^\d{5,30}$/.test(video.id) &&
      isSafeFacebookUrl(video.permalinkUrl) &&
      isSafeFacebookImageUrl(video.thumbnailUrl) &&
      typeof video.createdTime === "string" &&
      !Number.isNaN(new Date(video.createdTime).getTime()),
  );
};

const getCacheKey = (env) =>
  new Request(
    `https://facebook-feed-cache.invalid/${normalizeGraphVersion(env.FACEBOOK_GRAPH_VERSION)}/${normalizePageId(env.FACEBOOK_PAGE_ID)}/v2`,
  );

const readCachedFeed = async (cache, cacheKey) => {
  const response = await cache.match(cacheKey);
  if (!response) return null;

  try {
    const payload = await response.json();
    return isValidPublicFeed(payload) ? payload : null;
  } catch {
    return null;
  }
};

const cacheFeed = async (cache, cacheKey, payload) => {
  await cache.put(
    cacheKey,
    new Response(JSON.stringify(payload), {
      headers: {
        "Cache-Control": `public, max-age=${FEED_CACHE_TTL_SECONDS}`,
        "Content-Type": "application/json; charset=utf-8",
      },
    }),
  );
};

const fetchFreshFeed = async (env, { fetchImpl = fetch, now = Date.now } = {}) => {
  const videos = await fetchFacebookFeed({
    accessToken: env.FACEBOOK_PAGE_ACCESS_TOKEN,
    graphVersion: env.FACEBOOK_GRAPH_VERSION,
    pageId: env.FACEBOOK_PAGE_ID,
    fetchImpl,
  });
  return { updatedAt: new Date(now()).toISOString(), videos };
};

const refreshFeed = async (env, cache, cacheKey, dependencies = {}) => {
  const payload = await fetchFreshFeed(env, dependencies);
  await cacheFeed(cache, cacheKey, payload);
  return payload;
};

const logFeedFailure = (error, phase) => {
  const reason =
    error instanceof FacebookFeedError ? error.code : "facebook_feed_unexpected_error";
  console.error(JSON.stringify({ event: "facebook_feed_refresh_failed", phase, reason }));
};

const publicFeedResponse = (payload, { head = false, source = "fresh" } = {}) =>
  new Response(head ? null : JSON.stringify(payload), {
    headers: {
      "Cache-Control": "public, max-age=300",
      "Content-Type": "application/json; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
      "X-Facebook-Feed-Source": source,
    },
  });

const jsonError = (status, code, { head = false } = {}) =>
  new Response(head ? null : JSON.stringify({ error: code }), {
    status,
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "application/json; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
    },
  });

export const handleFacebookFeed = async (
  request,
  env,
  ctx,
  {
    cache = globalThis.caches?.default,
    fetchImpl = fetch,
    now = Date.now,
    logFailure = logFeedFailure,
  } = {},
) => {
  const head = request.method === "HEAD";

  if (request.method !== "GET" && !head) {
    const response = jsonError(405, "method_not_allowed");
    response.headers.set("Allow", "GET, HEAD");
    return response;
  }

  if (!env.FACEBOOK_PAGE_ACCESS_TOKEN) {
    return jsonError(503, "feed_unavailable", { head });
  }

  const cacheKey = getCacheKey(env);
  let cachedFeed = null;

  try {
    cachedFeed = await readCachedFeed(cache, cacheKey);
  } catch (error) {
    logFailure(error, "cache_read");
  }

  if (cachedFeed) {
    const age = now() - new Date(cachedFeed.updatedAt).getTime();
    if (age <= FEED_FRESHNESS_MS) {
      return publicFeedResponse(cachedFeed, { head, source: "cache" });
    }

    ctx.waitUntil(
      refreshFeed(env, cache, cacheKey, { fetchImpl, now }).catch((error) => {
        logFailure(error, "background_refresh");
      }),
    );
    return publicFeedResponse(cachedFeed, { head, source: "stale" });
  }

  try {
    const payload = await fetchFreshFeed(env, { fetchImpl, now });
    ctx.waitUntil(
      cacheFeed(cache, cacheKey, payload).catch((error) => {
        logFailure(error, "cache_write");
      }),
    );
    return publicFeedResponse(payload, { head });
  } catch (error) {
    logFailure(error, "initial_refresh");
    return jsonError(503, "feed_unavailable", { head });
  }
};

export const handleWorkerRequest = async (request, env, ctx, dependencies) => {
  const url = new URL(request.url);

  if (url.pathname.startsWith('/api/intake/')) {
    return handleIntake(request, env, ctx);
  }

  if (url.pathname === "/api/facebook-live") {
    return handleFacebookFeed(request, env, ctx, dependencies);
  }

  if (url.pathname.startsWith("/api/")) {
    return jsonError(404, "not_found", { head: request.method === "HEAD" });
  }

  return env.ASSETS.fetch(request);
};

export default {
  async fetch(request, env, ctx) {
    return handleWorkerRequest(request, env, ctx);
  },
  async queue(batch, env) { await handleIntakeQueue(batch, env); },
  async scheduled(_event, env, ctx) { ctx.waitUntil(recoverIntake(env)); },
};

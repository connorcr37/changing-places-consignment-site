import assert from "node:assert/strict";
import test from "node:test";

import {
  FacebookFeedError,
  buildFacebookGraphUrl,
  buildFacebookLivePostsUrl,
  buildFacebookManagedPagesUrl,
  fetchFacebookFeed,
  handleFacebookFeed,
  handleWorkerRequest,
  isSafeFacebookImageUrl,
  isSafeFacebookUrl,
  normalizeMetaFeed,
  normalizeMetaLivePosts,
} from "../worker/index.mjs";

const metaFixture = {
  data: [
    {
      id: "993937397000870",
      created_time: "2026-08-26T16:00:00Z",
      live_status: "VOD",
      permalink_url: "/1951050912865332/videos/993937397000870/",
      picture: "https://scontent-ord5-3.xx.fbcdn.net/small.jpg",
      thumbnails: {
        data: [
          {
            uri: "https://scontent-ord5-3.xx.fbcdn.net/medium.jpg",
            width: 480,
            height: 480,
          },
          {
            uri: "https://scontent-ord5-3.xx.fbcdn.net/large.jpg",
            width: 960,
            height: 960,
          },
        ],
      },
      title: "August 26 live sale",
      description: "Archived live sale",
    },
    {
      id: "2083571119197496",
      created_time: "2026-09-02T16:00:00Z",
      live_status: "VOD",
      permalink_url: "/1951050912865332/videos/2083571119197496/",
      picture: "https://scontent-ord5-3.xx.fbcdn.net/latest.jpg",
      thumbnails: { data: [] },
    },
    {
      id: "2083571119197497",
      created_time: "2026-09-03T16:00:00Z",
      live_status: "LIVE",
      permalink_url: "/1951050912865332/videos/2083571119197497/",
      picture: "https://scontent-ord5-3.xx.fbcdn.net/live.jpg",
    },
  ],
};

test("buildFacebookGraphUrl creates a token-free uploaded-video request", () => {
  const url = buildFacebookGraphUrl({ graphVersion: "v26.0", pageId: "me" });

  assert.equal(url.origin, "https://graph.facebook.com");
  assert.equal(url.pathname, "/v26.0/me/videos");
  assert.equal(url.searchParams.get("type"), "UPLOADED");
  assert.equal(url.searchParams.get("limit"), "25");
  assert.equal(
    url.searchParams.get("fields"),
    "id,created_time,live_status,permalink_url,picture,thumbnails{uri,height,width}",
  );
  assert.equal(url.searchParams.has("broadcast_status"), false);
  assert.equal(url.searchParams.has("source"), false);
  assert.equal(url.searchParams.has("access_token"), false);
});

test("buildFacebookLivePostsUrl creates a token-free Page-post fallback request", () => {
  const url = buildFacebookLivePostsUrl({
    graphVersion: "v26.0",
    pageId: "2057064944306840",
  });

  assert.equal(url.origin, "https://graph.facebook.com");
  assert.equal(url.pathname, "/v26.0/2057064944306840/posts");
  assert.equal(url.searchParams.get("limit"), "25");
  assert.equal(
    url.searchParams.get("fields"),
    "id,created_time,permalink_url,is_fb_live_videos,was_fb_live_videos,status_type,attachments{media_type,target,url,media}",
  );
  assert.equal(url.searchParams.has("access_token"), false);
});

test("buildFacebookManagedPagesUrl keeps user credentials out of the URL", () => {
  const url = buildFacebookManagedPagesUrl({ graphVersion: "v26.0" });

  assert.equal(url.origin, "https://graph.facebook.com");
  assert.equal(url.pathname, "/v26.0/me/accounts");
  assert.equal(url.searchParams.get("fields"), "id,access_token");
  assert.equal(url.searchParams.get("limit"), "100");
  assert.equal(url.searchParams.has("access_token"), false);
});

test("normalizeMetaLivePosts keeps safe current and archived Facebook Live video posts", () => {
  const videos = normalizeMetaLivePosts({
    data: [
      {
        id: "2057064944306840_2083571119197496",
        created_time: "2026-09-02T16:00:00Z",
        permalink_url:
          "https://www.facebook.com/ChangingPlacesDSM/videos/2083571119197496/",
        is_fb_live_videos: true,
        status_type: "added_video",
        attachments: {
          data: [
            {
              target: {
                id: "2083571119197496",
                url: "https://www.facebook.com/ChangingPlacesDSM/videos/2083571119197496/",
              },
              media: {
                image: {
                  src: "https://scontent-ord5-3.xx.fbcdn.net/live-small.jpg",
                  width: 480,
                  height: 480,
                },
              },
            },
            {
              target: { id: "2083571119197496" },
              media: {
                image: {
                  src: "https://scontent-ord5-3.xx.fbcdn.net/live-large.jpg",
                  width: 960,
                  height: 960,
                },
              },
            },
          ],
        },
      },
      {
        id: "2057064944306840_2083571119197497",
        created_time: "2026-09-03T16:00:00Z",
        permalink_url:
          "https://www.facebook.com/ChangingPlacesDSM/videos/2083571119197497/",
        is_fb_live_videos: false,
        attachments: { data: [] },
      },
      {
        id: "2057064944306840_2083571119197498",
        created_time: "2026-08-25T23:52:00Z",
        permalink_url:
          "https://www.facebook.com/ChangingPlacesDSM/videos/2083571119197498/",
        is_fb_live_videos: false,
        was_fb_live_videos: true,
        status_type: "added_video",
        attachments: {
          data: [
            {
              media_type: "video",
              target: {
                id: "2083571119197498",
                url: "https://www.facebook.com/ChangingPlacesDSM/videos/2083571119197498/",
              },
              media: {
                image: {
                  src: "https://scontent-ord5-3.xx.fbcdn.net/archived-live.jpg",
                  width: 540,
                  height: 960,
                },
              },
            },
          ],
        },
      },
    ],
  });

  assert.deepEqual(videos, [
    {
      id: "2083571119197496",
      permalinkUrl:
        "https://www.facebook.com/ChangingPlacesDSM/videos/2083571119197496/",
      thumbnailUrl: "https://scontent-ord5-3.xx.fbcdn.net/live-large.jpg",
      createdTime: "2026-09-02T16:00:00.000Z",
    },
    {
      id: "2083571119197498",
      permalinkUrl:
        "https://www.facebook.com/ChangingPlacesDSM/videos/2083571119197498/",
      thumbnailUrl:
        "https://scontent-ord5-3.xx.fbcdn.net/archived-live.jpg",
      createdTime: "2026-08-25T23:52:00.000Z",
    },
  ]);
});

test("normalizeMetaFeed keeps only VODs, resolves permalinks, and chooses the largest thumbnail", () => {
  const videos = normalizeMetaFeed(metaFixture);

  assert.equal(videos.length, 2);
  assert.equal(videos[0].id, "2083571119197496");
  assert.equal("durationSeconds" in videos[0], false);
  assert.equal(
    videos[0].permalinkUrl,
    "https://www.facebook.com/1951050912865332/videos/2083571119197496/",
  );
  assert.equal(
    videos[1].thumbnailUrl,
    "https://scontent-ord5-3.xx.fbcdn.net/large.jpg",
  );
});

test("normalizeMetaFeed drops unsafe or incomplete entries", () => {
  const videos = normalizeMetaFeed({
    data: [
      {
        id: "2083571119197496",
        created_time: "2026-09-02T16:00:00Z",
        live_status: "VOD",
        permalink_url: "https://attacker.example/video",
        picture: "https://attacker.example/image.jpg",
      },
    ],
  });

  assert.deepEqual(videos, []);
});

test("Facebook and CDN URL allowlists reject deceptive hosts", () => {
  assert.equal(
    isSafeFacebookUrl("https://www.facebook.com/ChangingPlacesDSM/videos/12345/"),
    true,
  );
  assert.equal(isSafeFacebookUrl("https://facebook.com.attacker.example/"), false);
  assert.equal(
    isSafeFacebookImageUrl("https://scontent-ord5-3.xx.fbcdn.net/image.jpg"),
    true,
  );
  assert.equal(isSafeFacebookImageUrl("https://fbcdn.net.attacker.example/image.jpg"), false);
});

test("normalizeMetaFeed never follows a cross-origin relative permalink", () => {
  const [video] = normalizeMetaFeed({
    data: [
      {
        id: "2083571119197496",
        created_time: "2026-09-02T16:00:00Z",
        live_status: "VOD",
        permalink_url: "//attacker.example/collect",
        picture: "https://scontent-ord5-3.xx.fbcdn.net/latest.jpg",
      },
    ],
  });

  assert.equal(
    video.permalinkUrl,
    "https://www.facebook.com/watch/?v=2083571119197496",
  );
});

test("fetchFacebookFeed trims and keeps the token in the Authorization header", async () => {
  const secret = "page-token-for-test-only";
  let capturedUrl;
  let capturedAuthorization;

  const videos = await fetchFacebookFeed({
    accessToken: `  ${secret}\r\n`,
    fetchImpl: async (url, options) => {
      capturedUrl = String(url);
      capturedAuthorization = options.headers.Authorization;
      return new Response(JSON.stringify(metaFixture), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    },
  });

  assert.equal(videos.length, 2);
  assert.equal(capturedAuthorization, `Bearer ${secret}`);
  assert.equal(capturedUrl.includes(secret), false);
});

test("fetchFacebookFeed falls back to Page posts when the retired videos edge is empty", async () => {
  const secret = "page-token-for-test-only";
  const calls = [];
  const livePostsFixture = {
    data: [
      {
        id: "2057064944306840_2083571119197496",
        created_time: "2026-09-02T16:00:00Z",
        permalink_url:
          "https://www.facebook.com/ChangingPlacesDSM/videos/2083571119197496/",
        is_fb_live_videos: true,
        attachments: {
          data: [
            {
              target: { id: "2083571119197496" },
              media: {
                image: {
                  src: "https://scontent-ord5-3.xx.fbcdn.net/live.jpg",
                  width: 960,
                  height: 960,
                },
              },
            },
          ],
        },
      },
    ],
  };

  const videos = await fetchFacebookFeed({
    accessToken: secret,
    pageId: "2057064944306840",
    fetchImpl: async (url, options) => {
      calls.push({ url: new URL(url), authorization: options.headers.Authorization });
      const payload = calls.length === 1 ? { data: [] } : livePostsFixture;
      return new Response(JSON.stringify(payload), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    },
  });

  assert.equal(calls.length, 2);
  assert.equal(calls[0].url.pathname, "/v26.0/2057064944306840/videos");
  assert.equal(calls[1].url.pathname, "/v26.0/2057064944306840/posts");
  assert.equal(calls[0].authorization, `Bearer ${secret}`);
  assert.equal(calls[1].authorization, `Bearer ${secret}`);
  assert.equal(calls.some((call) => call.url.href.includes(secret)), false);
  assert.deepEqual(videos, [
    {
      id: "2083571119197496",
      permalinkUrl:
        "https://www.facebook.com/ChangingPlacesDSM/videos/2083571119197496/",
      thumbnailUrl: "https://scontent-ord5-3.xx.fbcdn.net/live.jpg",
      createdTime: "2026-09-02T16:00:00.000Z",
    },
  ]);
});

test("fetchFacebookFeed resolves an exact managed Page token without exposing either credential", async () => {
  const userToken = "user-token-for-test-only";
  const pageToken = "derived-page-token-for-test-only";
  const calls = [];
  const responses = [
    { status: 200, payload: { data: [] } },
    {
      status: 400,
      payload: {
        error: {
          code: 190,
          error_subcode: 2069032,
          message: `must not expose ${userToken}`,
        },
      },
    },
    {
      status: 200,
      payload: {
        data: [
          { id: "9999999999999999", access_token: "wrong-page-token" },
          { id: "2057064944306840", access_token: pageToken },
        ],
        paging: { next: `https://graph.facebook.com/?access_token=${userToken}` },
      },
    },
    {
      status: 200,
      payload: {
        data: [
          {
            id: "2057064944306840_2083571119197496",
            created_time: "2026-09-02T16:00:00Z",
            permalink_url:
              "https://www.facebook.com/ChangingPlacesDSM/videos/2083571119197496/",
            is_fb_live_videos: true,
            attachments: {
              data: [
                {
                  target: { id: "2083571119197496" },
                  media: {
                    image: {
                      src: "https://scontent-ord5-3.xx.fbcdn.net/live.jpg",
                      width: 960,
                      height: 960,
                    },
                  },
                },
              ],
            },
          },
        ],
      },
    },
  ];

  const videos = await fetchFacebookFeed({
    accessToken: userToken,
    pageId: "2057064944306840",
    fetchImpl: async (url, options) => {
      calls.push({ url: new URL(url), authorization: options.headers.Authorization });
      const response = responses[calls.length - 1];
      return new Response(JSON.stringify(response.payload), {
        status: response.status,
        headers: { "Content-Type": "application/json" },
      });
    },
  });

  assert.deepEqual(
    calls.map((call) => call.url.pathname),
    [
      "/v26.0/2057064944306840/videos",
      "/v26.0/2057064944306840/posts",
      "/v26.0/me/accounts",
      "/v26.0/2057064944306840/posts",
    ],
  );
  assert.deepEqual(
    calls.map((call) => call.authorization),
    [`Bearer ${userToken}`, `Bearer ${userToken}`, `Bearer ${userToken}`, `Bearer ${pageToken}`],
  );
  assert.equal(
    calls.some(
      (call) => call.url.href.includes(userToken) || call.url.href.includes(pageToken),
    ),
    false,
  );
  const serializedVideos = JSON.stringify(videos);
  assert.equal(serializedVideos.includes(userToken), false);
  assert.equal(serializedVideos.includes(pageToken), false);
  assert.equal(serializedVideos.includes("wrong-page-token"), false);
  assert.equal(videos[0].id, "2083571119197496");
});

test("fetchFacebookFeed logs only sanitized numeric Meta diagnostics", async () => {
  const secret = "sensitive-token-for-test-only";
  const traceId = "sensitive-fbtrace-id";

  await assert.rejects(
    fetchFacebookFeed({
      accessToken: secret,
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            error: {
              message: `Graph rejected ${secret}`,
              type: "OAuthException",
              code: 190,
              error_subcode: 463,
              fbtrace_id: traceId,
            },
          }),
          { status: 401, headers: { "Content-Type": "application/json" } },
        ),
    }),
    (error) => {
      assert.equal(error instanceof FacebookFeedError, true);
      assert.equal(
        error.code,
        "facebook_graph_http_401_meta_code_190_error_subcode_463",
      );
      assert.equal(error.message.includes(secret), false);
      assert.equal(error.message.includes(traceId), false);
      assert.equal(error.message.includes("OAuthException"), false);
      return true;
    },
  );
});

test("fetchFacebookFeed falls back to a status-only code for unsafe diagnostics", async () => {
  await assert.rejects(
    fetchFacebookFeed({
      accessToken: "page-token-for-test-only",
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            error: {
              code: "190-and-sensitive-data",
              error_subcode: { identifier: "do-not-log" },
              message: "do-not-log",
            },
          }),
          { status: 403, headers: { "Content-Type": "application/json" } },
        ),
    }),
    (error) => {
      assert.equal(error instanceof FacebookFeedError, true);
      assert.equal(error.code, "facebook_graph_http_403");
      return true;
    },
  );
});

test("empty Meta feeds expose only aggregate diagnostics and a generic public error", async () => {
  const secret = "sensitive-page-token-for-test-only";
  const privateMarker = "private-upstream-marker";
  const cache = makeMemoryCache();
  const ctx = makeExecutionContext();
  const failures = [];
  const response = await handleFacebookFeed(
    new Request("https://example.com/api/facebook-live"),
    makeEnvironment({ FACEBOOK_PAGE_ACCESS_TOKEN: secret }),
    ctx,
    {
      cache,
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            data: [
              {
                id: "2083571119197496",
                created_time: "2026-09-03T16:00:00Z",
                live_status: "VOD",
                permalink_url: "/private-page/videos/2083571119197496/",
                picture: `https://attacker.example/${privateMarker}.jpg`,
                title: privateMarker,
                message: `${privateMarker}-${secret}`,
              },
              {
                id: "2083571119197497",
                created_time: privateMarker,
                live_status: "LIVE",
                permalink_url: `https://attacker.example/${privateMarker}`,
                picture: "https://scontent-ord5-3.xx.fbcdn.net/live.jpg",
              },
              {
                id: privateMarker,
                created_time: privateMarker,
                permalink_url: `https://attacker.example/${privateMarker}`,
                picture: `https://attacker.example/${privateMarker}.jpg`,
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      logFailure: (error, phase) =>
        failures.push({ code: error.code, message: error.message, phase }),
    },
  );

  const diagnosticCode =
    "facebook_graph_empty_feed_data_items_3_vod_statuses_1_" +
    "missing_or_other_status_2_valid_numeric_id_2_valid_date_1_" +
    "safe_permalink_2_safe_thumbnail_1";

  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: "feed_unavailable" });
  assert.deepEqual(failures, [
    {
      code: diagnosticCode,
      message: diagnosticCode,
      phase: "initial_refresh",
    },
  ]);

  const serializedFailure = JSON.stringify(failures);
  assert.equal(serializedFailure.includes(secret), false);
  assert.equal(serializedFailure.includes(privateMarker), false);
  assert.match(
    failures[0].code,
    /^facebook_graph_empty_feed(?:_[a-z_]+_\d+)+$/,
  );
});

test("fetchFacebookFeed bounds a streaming body without Content-Length", async () => {
  const oversizedChunk = new TextEncoder().encode("x".repeat(500_001));

  await assert.rejects(
    fetchFacebookFeed({
      accessToken: "page-token-for-test-only",
      fetchImpl: async () => {
        const response = new Response(
          new ReadableStream({
            start(controller) {
              controller.enqueue(oversizedChunk);
              controller.close();
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
        assert.equal(response.headers.has("content-length"), false);
        return response;
      },
    }),
    (error) => {
      assert.equal(error instanceof FacebookFeedError, true);
      assert.equal(error.code, "facebook_graph_response_too_large");
      return true;
    },
  );
});

test("fetchFacebookFeed also bounds non-OK Graph bodies", async () => {
  const oversizedChunk = new TextEncoder().encode("x".repeat(500_001));

  await assert.rejects(
    fetchFacebookFeed({
      accessToken: "page-token-for-test-only",
      fetchImpl: async () =>
        new Response(
          new ReadableStream({
            start(controller) {
              controller.enqueue(oversizedChunk);
              controller.close();
            },
          }),
          { status: 401, headers: { "Content-Type": "application/json" } },
        ),
    }),
    (error) => {
      assert.equal(error instanceof FacebookFeedError, true);
      assert.equal(error.code, "facebook_graph_response_too_large");
      return true;
    },
  );
});

const makeEnvironment = (overrides = {}) => ({
  FACEBOOK_PAGE_ACCESS_TOKEN: "page-token-for-test-only",
  FACEBOOK_GRAPH_VERSION: "v26.0",
  FACEBOOK_PAGE_ID: "me",
  ASSETS: {
    fetch: async () => new Response("static asset"),
  },
  ...overrides,
});

const makeExecutionContext = () => {
  const promises = [];
  return {
    promises,
    waitUntil(promise) {
      promises.push(Promise.resolve(promise));
    },
  };
};

const makeMemoryCache = ({ cachedPayload = null, putError = null } = {}) => {
  const puts = [];
  return {
    puts,
    async match() {
      return cachedPayload
        ? new Response(JSON.stringify(cachedPayload), {
            headers: { "Content-Type": "application/json" },
          })
        : null;
    },
    async put(request, response) {
      if (putError) throw putError;
      puts.push({ request: String(request.url), payload: await response.json() });
    },
  };
};

const successfulMetaFetch = async () =>
  new Response(JSON.stringify(metaFixture), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });

test("cold feed returns fresh data and schedules a cache write", async () => {
  const cache = makeMemoryCache();
  const ctx = makeExecutionContext();
  const now = () => Date.parse("2026-09-03T16:00:00Z");
  const response = await handleFacebookFeed(
    new Request("https://example.com/api/facebook-live"),
    makeEnvironment(),
    ctx,
    { cache, fetchImpl: successfulMetaFetch, now, logFailure: () => {} },
  );

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("X-Facebook-Feed-Source"), "fresh");
  assert.equal((await response.json()).videos.length, 2);
  assert.equal(ctx.promises.length, 1);
  await Promise.all(ctx.promises);
  assert.equal(cache.puts.length, 1);
  assert.equal(
    cache.puts[0].request,
    "https://facebook-feed-cache.invalid/v26.0/me/v2",
  );
});

test("cache-write failure does not discard a successful Meta response", async () => {
  const cache = makeMemoryCache({ putError: new Error("cache unavailable") });
  const ctx = makeExecutionContext();
  const failures = [];
  const response = await handleFacebookFeed(
    new Request("https://example.com/api/facebook-live"),
    makeEnvironment(),
    ctx,
    {
      cache,
      fetchImpl: successfulMetaFetch,
      logFailure: (_error, phase) => failures.push(phase),
    },
  );

  assert.equal(response.status, 200);
  await Promise.all(ctx.promises);
  assert.deepEqual(failures, ["cache_write"]);
});

test("Meta diagnostics stay internal while the endpoint returns a generic 503", async () => {
  const cache = makeMemoryCache();
  const ctx = makeExecutionContext();
  const failures = [];
  const response = await handleFacebookFeed(
    new Request("https://example.com/api/facebook-live"),
    makeEnvironment(),
    ctx,
    {
      cache,
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            error: {
              message: "Invalid OAuth access token",
              code: 190,
              error_subcode: 463,
              fbtrace_id: "private-trace-id",
            },
          }),
          { status: 401, headers: { "Content-Type": "application/json" } },
        ),
      logFailure: (error, phase) => failures.push({ code: error.code, phase }),
    },
  );

  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: "feed_unavailable" });
  assert.deepEqual(failures, [
    {
      code: "facebook_graph_http_401_meta_code_190_error_subcode_463",
      phase: "initial_refresh",
    },
  ]);
});

test("stale feed responds immediately and refreshes in the background", async () => {
  const cachedPayload = {
    updatedAt: "2026-09-03T14:00:00.000Z",
    videos: normalizeMetaFeed(metaFixture),
  };
  const cache = makeMemoryCache({ cachedPayload });
  const ctx = makeExecutionContext();
  const response = await handleFacebookFeed(
    new Request("https://example.com/api/facebook-live"),
    makeEnvironment(),
    ctx,
    {
      cache,
      fetchImpl: successfulMetaFetch,
      now: () => Date.parse("2026-09-03T16:00:00Z"),
      logFailure: () => {},
    },
  );

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("X-Facebook-Feed-Source"), "stale");
  assert.equal(ctx.promises.length, 1);
  await Promise.all(ctx.promises);
  assert.equal(cache.puts.length, 1);
});

test("feed endpoint handles missing credentials, HEAD, and unsupported methods", async () => {
  const freshPayload = {
    updatedAt: "2026-09-03T16:00:00.000Z",
    videos: normalizeMetaFeed(metaFixture),
  };
  const cache = makeMemoryCache({ cachedPayload: freshPayload });
  const now = () => Date.parse("2026-09-03T16:05:00Z");

  const missingToken = await handleFacebookFeed(
    new Request("https://example.com/api/facebook-live"),
    makeEnvironment({ FACEBOOK_PAGE_ACCESS_TOKEN: "" }),
    makeExecutionContext(),
    { cache, now, logFailure: () => {} },
  );
  assert.equal(missingToken.status, 503);
  assert.deepEqual(await missingToken.json(), { error: "feed_unavailable" });

  const head = await handleFacebookFeed(
    new Request("https://example.com/api/facebook-live", { method: "HEAD" }),
    makeEnvironment(),
    makeExecutionContext(),
    { cache, now, logFailure: () => {} },
  );
  assert.equal(head.status, 200);
  assert.equal(head.headers.get("X-Facebook-Feed-Source"), "cache");
  assert.equal(await head.text(), "");

  const post = await handleFacebookFeed(
    new Request("https://example.com/api/facebook-live", { method: "POST" }),
    makeEnvironment(),
    makeExecutionContext(),
    { cache, now, logFailure: () => {} },
  );
  assert.equal(post.status, 405);
  assert.equal(post.headers.get("Allow"), "GET, HEAD");
});

test("worker routing keeps unknown APIs isolated and delegates static assets", async () => {
  let assetRequestUrl = "";
  const env = makeEnvironment({
    ASSETS: {
      fetch: async (request) => {
        assetRequestUrl = request.url;
        return new Response("asset response");
      },
    },
  });

  const missingApi = await handleWorkerRequest(
    new Request("https://example.com/api/unknown"),
    env,
    makeExecutionContext(),
  );
  assert.equal(missingApi.status, 404);

  const asset = await handleWorkerRequest(
    new Request("https://example.com/styles.css"),
    env,
    makeExecutionContext(),
  );
  assert.equal(asset.status, 200);
  assert.equal(await asset.text(), "asset response");
  assert.equal(assetRequestUrl, "https://example.com/styles.css");
});

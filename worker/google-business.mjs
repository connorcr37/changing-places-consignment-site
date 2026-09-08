// Official Business Profile APIs only. Website rendering never imports this service.
import { query, nowSeconds, fail, dateKey, googlePeriod, storeToday, HolidayError } from './holiday-utils.mjs';
import { googleJSON, accessToken, appOrigin, digest, GoogleError } from './google-oauth.mjs';

const INFO = 'https://mybusinessbusinessinformation.googleapis.com/v1';
const ACCOUNTS = 'https://mybusinessaccountmanagement.googleapis.com/v1';
const POSTS = 'https://mybusiness.googleapis.com/v4';
const accountPattern = /^accounts\/\d+$/;
const locationPattern = /^locations\/\d+$/;
export const connection = env => query(env, 'SELECT * FROM holiday_google_connection WHERE id=1').first();
const api = (url, token, options = {}, fetchImpl) => googleJSON(url, {
  ...options, headers: { Authorization: `Bearer ${token}`, ...(options.body ? { 'Content-Type': 'application/json' } : {}) },
}, fetchImpl);
async function allPages(url, key, token, fetchImpl) {
  const rows = [], next = new URL(url);
  // A failed/incomplete scan must never be mistaken for an empty result.
  for (let page = 0; page < 20; page++) {
    const body = await api(next, token, {}, fetchImpl);
    if (body[key] != null && !Array.isArray(body[key])) throw new GoogleError(503, 'Google returned an invalid list. Retry the operation.');
    rows.push(...(body[key] || []));
    if (!body.nextPageToken) return rows;
    next.searchParams.set('pageToken', body.nextPageToken);
  }
  throw new GoogleError(400, 'This account has too many results for a complete safe scan. Use a Google account with direct access to the store location.');
}
export async function listAccounts(env, fetchImpl) {
  const token = await accessToken(env, await connection(env), fetchImpl);
  return (await allPages(`${ACCOUNTS}/accounts?pageSize=20`, 'accounts', token, fetchImpl))
    .map(account => ({ name: account.name, title: account.accountName || account.name }));
}
export async function listLocations(env, account, fetchImpl) {
  if (!accountPattern.test(account)) fail(400, 'Choose a valid Google Business Profile account.');
  const token = await accessToken(env, await connection(env), fetchImpl);
  return (await allPages(`${INFO}/${account}/locations?readMask=name,title,storefrontAddress,metadata&pageSize=100`, 'locations', token, fetchImpl))
    .map(location => ({ name: location.name, title: location.title, address: formatAddress(location.storefrontAddress), canPost: Boolean(location.metadata?.canOperateLocalPost) }));
}
const formatAddress = address => [...(address?.addressLines || []), address?.locality, address?.administrativeArea, address?.postalCode].filter(Boolean).join(', ');

export async function withGoogleLock(env, action) {
  const lock = crypto.randomUUID(), now = nowSeconds();
  const row = await query(env, 'UPDATE holiday_google_connection SET lock_token=?,lock_until=? WHERE id=1 AND lock_until<? RETURNING *', lock, now + 240, now).first();
  if (!row) fail(409, 'Google sync is already running. Please try again in a few minutes.');
  // Renew before each bounded Google request so a long paginated scan cannot
  // outlive the lease and allow another worker to write to the same location.
  const guardedFetch = (fetchImpl = fetch) => async (...args) => {
    const time = nowSeconds();
    const renewed = await query(env, 'UPDATE holiday_google_connection SET lock_until=? WHERE id=1 AND lock_token=? AND lock_until>? RETURNING id', time + 240, lock, time).first();
    if (!renewed) fail(409, 'Google sync was interrupted. Retry after the current operation finishes.');
    return fetchImpl(...args);
  };
  try { return await action(row, guardedFetch); }
  finally { await query(env, 'UPDATE holiday_google_connection SET lock_token=NULL,lock_until=0 WHERE id=1 AND lock_token=?', lock).run(); }
}
export async function selectLocation(env, account, location, fetchImpl) {
  if (!accountPattern.test(account) || !locationPattern.test(location)) fail(400, 'Choose a valid Google account and location.');
  return withGoogleLock(env, async (current, guardedFetch) => {
    if (current.location_name && (current.location_name !== location || current.account_name !== account)) {
      // Never strand managed hours or posts on the old location.
      const owned = await query(env, 'SELECT (SELECT COUNT(*) FROM holiday_google_dates) + (SELECT COUNT(*) FROM holiday_google_posts WHERE post_name IS NOT NULL OR attempted=1) AS count').first();
      const pending = await query(env, "SELECT COUNT(*) AS count FROM holiday_sync_jobs WHERE status NOT IN ('synced','published','removed','off')").first();
      if (owned.count || pending.count) fail(409, 'Turn off Google options on existing entries and finish their removal sync before changing locations.');
    }
    const locations = await listLocations(env, account, guardedFetch(fetchImpl));
    const chosen = locations.find(item => item.name === location);
    if (!chosen) fail(403, 'This location is not available under the selected account.');
    await query(env, 'UPDATE holiday_google_connection SET account_name=?,location_name=?,location_title=?,location_address=?,can_post=? WHERE id=1',
      account, location, chosen.title, chosen.address, Number(chosen.canPost)).run();
    return chosen;
  });
}
export async function disconnectGoogle(env) {
  return withGoogleLock(env, async () => {
    // Stop future access, but keep ownership and destination for safe reconnection.
    await query(env, 'UPDATE holiday_google_connection SET refresh_token=NULL,connected_by=NULL,connected_at=NULL WHERE id=1').run();
  });
}

export function mergeSpecialHours(remote, desired, owned) {
  const dates = new Set([...desired.map(day => day.date), ...owned.map(day => day.date)]);
  for (const period of remote) {
    const start = dateKey(period.startDate), end = dateKey(period.endDate) || start;
    if (start !== end && [...dates].some(date => date >= start && date <= end)) {
      fail(409, 'Google has overnight hours overlapping a managed date. Resolve that overlap in Google Business Profile before retrying.');
    }
  }
  const active = new Set(desired.map(day => day.date));
  return [
    ...remote.filter(period => !dates.has(dateKey(period.startDate))),
    ...owned.filter(day => !active.has(day.date)).flatMap(day => JSON.parse(day.original_json)),
    ...desired.map(googlePeriod),
  ].sort((a, b) => dateKey(a.startDate).localeCompare(dateKey(b.startDate)) || (a.openTime?.hours || 0) - (b.openTime?.hours || 0));
}
async function syncHours(env, current, token, fetchImpl) {
  const desired = (await query(env, "SELECT c.* FROM holiday_calendar c JOIN holiday_entries e ON e.id=c.entry_id WHERE e.google_hours=1 AND c.date>=? ORDER BY c.date", storeToday()).all()).results;
  const result = await api(`${INFO}/${current.location_name}?readMask=name,specialHours`, token, {}, fetchImpl);
  const remote = result.specialHours?.specialHourPeriods || [];
  if (!Array.isArray(remote)) throw new GoogleError(503, 'Google returned invalid special hours. Retry later.');
  let owned = (await query(env, 'SELECT * FROM holiday_google_dates').all()).results;
  // Validate overlaps before claiming dates. Persist originals BEFORE the remote write.
  mergeSpecialHours(remote, desired, owned);
  const tracked = new Set(owned.map(day => day.date));
  const additions = desired.filter(day => !tracked.has(day.date)).map(day => query(env,
    'INSERT INTO holiday_google_dates(date,original_json) VALUES(?,?) ON CONFLICT(date) DO NOTHING', day.date,
    JSON.stringify(remote.filter(period => dateKey(period.startDate) === day.date))));
  if (additions.length) await env.INTAKE_DB.batch(additions);
  owned = (await query(env, 'SELECT * FROM holiday_google_dates').all()).results;
  const periods = mergeSpecialHours(remote, desired, owned);
  await api(`${INFO}/${current.location_name}?updateMask=specialHours`, token, {
    method: 'PATCH', body: JSON.stringify({ name: current.location_name, specialHours: { specialHourPeriods: periods } }),
  }, fetchImpl);
  const active = new Set(desired.map(day => day.date));
  const releases = owned.filter(day => !active.has(day.date)).map(day => query(env, 'DELETE FROM holiday_google_dates WHERE date=?', day.date));
  if (releases.length) await env.INTAKE_DB.batch(releases);
}
const postParent = current => `${current.account_name}/${current.location_name}`;
const postMarker = (env, id) => `${appOrigin(env)}/?announcement=${encodeURIComponent(id)}`;
const postState = post => post.state === 'LIVE' ? 'published' : post.state === 'REJECTED' ? 'rejected' : 'processing';
async function syncPost(env, current, entry, token, fetchImpl, job) {
  const wanted = entry.state === 'published' && Boolean(entry.google_post);
  let record = await query(env, 'SELECT * FROM holiday_google_posts WHERE entry_id=?', entry.id).first();
  const parent = postParent(current);
  if (!record) {
    await query(env, 'INSERT INTO holiday_google_posts(entry_id) VALUES(?)', entry.id).run();
    record = { attempted: 0, post_name: null, fingerprint: null };
  }
  if (!wanted && !record.post_name && !record.attempted) return 'removed';
  if (wanted) {
    const location = await api(`${INFO}/${current.location_name}?readMask=metadata`, token, {}, fetchImpl);
    await query(env, 'UPDATE holiday_google_connection SET can_post=? WHERE id=1', Number(Boolean(location.metadata?.canOperateLocalPost))).run();
    if (!location.metadata?.canOperateLocalPost) return 'unsupported';
  }
  if (!record.post_name) {
    const posts = await allPages(`${POSTS}/${parent}/localPosts?pageSize=100`, 'localPosts', token, fetchImpl);
    const matches = posts.filter(post => post.callToAction?.url === postMarker(env, entry.id));
    if (matches.length > 1) fail(409, 'Multiple matching announcements exist on Google. Remove duplicates in Google before retrying.');
    if (matches[0]) {
      record.post_name = matches[0].name;
      await query(env, 'UPDATE holiday_google_posts SET post_name=? WHERE entry_id=?', record.post_name, entry.id).run();
    } else if (record.attempted) {
      // Google has no create idempotency key. Never blindly repeat an uncertain POST.
      return 'uncertain';
    } else if (!wanted) return 'removed';
  }
  if (record.post_name && !record.post_name.startsWith(`${parent}/localPosts/`)) fail(409, 'The saved Google post belongs to a different location. Reconnect the original location.');
  if (!wanted) {
    try { await api(`${POSTS}/${record.post_name}`, token, { method: 'DELETE' }, fetchImpl); }
    catch (error) { if (error.status !== 404) throw error; }
    await query(env, 'DELETE FROM holiday_google_posts WHERE entry_id=?', entry.id).run();
    return 'removed';
  }
  const payload = { languageCode: 'en-US', topicType: 'STANDARD', summary: entry.message,
    callToAction: { actionType: 'LEARN_MORE', url: postMarker(env, entry.id) } };
  const fingerprint = await digest(JSON.stringify(payload));
  let post;
  if (record.post_name && record.fingerprint === fingerprint) {
    post = await api(`${POSTS}/${record.post_name}`, token, {}, fetchImpl);
  } else if (record.post_name) {
    post = await api(`${POSTS}/${record.post_name}?updateMask=summary,callToAction`, token,
      { method: 'PATCH', body: JSON.stringify({ summary: payload.summary, callToAction: payload.callToAction }) }, fetchImpl);
  } else {
    // Check the entry is still current immediately before creating a public post.
    const latest = await query(env, 'SELECT version FROM holiday_entries WHERE id=?', entry.id).first();
    if (latest.version !== job.version) return 'superseded';
    await query(env, 'UPDATE holiday_google_posts SET attempted=1 WHERE entry_id=?', entry.id).run();
    try { post = await api(`${POSTS}/${parent}/localPosts`, token, { method: 'POST', body: JSON.stringify(payload) }, fetchImpl); }
    catch (error) {
      if (error.status >= 400 && error.status < 500 && error.status !== 408) {
        await query(env, 'UPDATE holiday_google_posts SET attempted=0 WHERE entry_id=?', entry.id).run();
        throw error;
      }
      return 'uncertain';
    }
    if (!post.name?.startsWith(`${parent}/localPosts/`)) return 'uncertain';
  }
  await query(env, 'UPDATE holiday_google_posts SET post_name=?,fingerprint=?,attempted=1 WHERE entry_id=?', post.name || record.post_name, fingerprint, entry.id).run();
  return postState(post);
}
const statusMessages = {
  unsupported: 'Google reports that this location cannot publish posts. Special-hours sync is separate and can still succeed.',
  rejected: 'Google rejected this announcement. Edit the message and publish again, or review it in Google Business Profile.',
  uncertain: 'Google may have created the post but did not confirm it. Retry checks for an existing post. If none appears in Google, use the confirmation below to allow another creation attempt.',
};
export async function processGoogleJobs(env, { fetchImpl = fetch } = {}) {
  if (!env.INTAKE_DB) return;
  try {
    await withGoogleLock(env, async (current, guardedFetch) => {
      const lockedFetch = guardedFetch(fetchImpl);
      const jobs = (await query(env, "SELECT * FROM holiday_sync_jobs WHERE status IN ('pending','retry','processing') AND next_at<=? ORDER BY next_at,entry_id,kind LIMIT 2", nowSeconds()).all()).results;
      if (!jobs.length) return;
      let token;
      for (const job of jobs) {
        const entry = await query(env, 'SELECT * FROM holiday_entries WHERE id=?', job.entry_id).first();
        if (!entry || entry.version !== job.version) continue;
        try {
          if (!current.location_name || !current.account_name) fail(409, 'Connect Google Business Profile and select the store location, then Retry.');
          token ||= await accessToken(env, current, lockedFetch);
          let status;
          if (job.kind === 'hours') {
            await syncHours(env, current, token, lockedFetch);
            status = entry.state === 'published' && entry.google_hours ? 'synced' : 'removed';
          } else status = await syncPost(env, current, entry, token, lockedFetch, job);
          if (status === 'superseded') continue;
          await query(env, 'UPDATE holiday_sync_jobs SET status=?,attempts=0,error=?,next_at=?,updated_at=? WHERE entry_id=? AND kind=? AND version=?',
            status, statusMessages[status] || '', status === 'processing' ? nowSeconds() + 300 : 0, nowSeconds(), job.entry_id, job.kind, job.version).run();
        } catch (error) {
          const message = error instanceof GoogleError || error instanceof HolidayError ? error.message : 'Google sync could not finish. The website is saved. Retry this operation.';
          const attempts = job.attempts + 1;
          await query(env, 'UPDATE holiday_sync_jobs SET status=?,attempts=?,error=?,next_at=?,updated_at=? WHERE entry_id=? AND kind=? AND version=?',
            attempts >= 5 ? 'failed' : 'retry', attempts, message, nowSeconds() + Math.min(3600, 60 * 2 ** attempts), nowSeconds(), job.entry_id, job.kind, job.version).run();
        }
      }
    });
  } catch (error) {
    if (error instanceof HolidayError && error.status === 409) return;
    // No exception text or request URLs in logs (OAuth codes may be present).
    console.error(JSON.stringify({ event: 'holiday_google_recovery_failed' }));
  }
}

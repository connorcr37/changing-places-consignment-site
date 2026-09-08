import { HolidayError, fail, query, json, nowSeconds, validateEntry, bannerState, localDateTime, storeToday, STORE_TIME_ZONE } from './holiday-utils.mjs';
import { readBoundedBody } from './intake-utils.mjs';
import { requireAdmin, session, sameOrigin, startOAuth, finishOAuth, logout, allowedEmails } from './admin-auth.mjs';
import { appOrigin, oauthReady, GoogleError } from './google-oauth.mjs';
import { connection, listAccounts, listLocations, selectLocation, disconnectGoogle, processGoogleJobs, withGoogleLock } from './google-business.mjs';
import { adminPage } from './holiday-admin-page.mjs';
import { isValidEmail } from '../intake-shared.js';

const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const getJSON = async request => {
  if (!request.headers.get('Content-Type')?.startsWith('application/json')) fail(415, 'Please send JSON.');
  try {
    const body = JSON.parse(new TextDecoder().decode(await readBoundedBody(request, 24000)));
    if (!body || Array.isArray(body) || typeof body !== 'object') throw Error();
    return body;
  }
  catch { fail(400, 'The submitted information could not be read.'); }
};
const safeWork = (ctx, env) => ctx.waitUntil(processGoogleJobs(env));
export async function publicHours(env, clock = Date.now()) {
  const banners = (await query(env, "SELECT id,message,animation,starts_at,ends_at FROM holiday_entries WHERE state='published' AND banner_enabled=1 AND ends_at>? ORDER BY starts_at,id", new Date(clock).toISOString()).all()).results;
  const specialHours = (await query(env, 'SELECT date,closed,opens,closes FROM holiday_calendar WHERE date>=? ORDER BY date', storeToday(clock)).all()).results;
  return { timeZone: STORE_TIME_ZONE, serverNow: new Date(clock).toISOString(), banners: banners.map(row => ({ id: row.id,
    message: row.message, animation: row.animation, startsAt: row.starts_at, endsAt: row.ends_at })),
    specialHours: specialHours.map(day => ({ ...day, closed: Boolean(day.closed) })) };
}
export async function listEntries(env) {
  const entries = (await query(env, 'SELECT * FROM holiday_entries ORDER BY updated_at DESC,id').all()).results;
  const jobs = (await query(env, 'SELECT * FROM holiday_sync_jobs').all()).results;
  return entries.map(row => ({ id: row.id, name: row.name, message: row.message, animation: row.animation,
    bannerEnabled: Boolean(row.banner_enabled), startsAt: row.starts_at ? localDateTime(row.starts_at) : '',
    endsAt: row.ends_at ? localDateTime(row.ends_at) : '', dates: JSON.parse(row.dates_json), googleHours: Boolean(row.google_hours),
    googlePost: Boolean(row.google_post), state: row.state, version: row.version, bannerState: bannerState(row),
    updatedAt: row.updated_at, updatedBy: row.updated_by,
    sync: Object.fromEntries(jobs.filter(job => job.entry_id === row.id).map(job => [job.kind, { status: job.status,
      error: job.error, updatedAt: job.updated_at, nextAt: job.next_at, attempts: job.attempts }])) }));
}
export async function saveEntry(env, id, body, admin) {
  if (!uuid.test(id)) fail(400, 'Invalid entry identifier.');
  if (!Number.isInteger(body?.version) || body.version < 0) fail(400, 'Reload the entry before saving.');
  const value = validateEntry(body), old = await query(env, 'SELECT * FROM holiday_entries WHERE id=?', id).first();
  if ((old?.version || 0) !== body.version) fail(409, 'Someone changed this entry. Reload it before saving your changes.');
  const token = crypto.randomUUID(), now = nowSeconds(), version = body.version + 1;
  const args = [value.name, value.message, value.animation, Number(value.bannerEnabled), value.startsAt, value.endsAt,
    JSON.stringify(value.dates), Number(value.googleHours), Number(value.googlePost), value.state, version, token, now, admin.email];
  const statements = [old ? query(env, 'UPDATE holiday_entries SET name=?,message=?,animation=?,banner_enabled=?,starts_at=?,ends_at=?,dates_json=?,google_hours=?,google_post=?,state=?,version=?,write_token=?,updated_at=?,updated_by=? WHERE id=? AND version=?', ...args, id, body.version)
    : query(env, 'INSERT INTO holiday_entries(name,message,animation,banner_enabled,starts_at,ends_at,dates_json,google_hours,google_post,state,version,write_token,updated_at,updated_by,id,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING', ...args, id, now)];
  // Every statement is guarded by the unique write token in the same D1 transaction.
  const guard = 'EXISTS(SELECT 1 FROM holiday_entries WHERE id=? AND write_token=?)';
  statements.push(query(env, `DELETE FROM holiday_calendar WHERE entry_id=? AND ${guard}`, id, id, token));
  if (value.state === 'published') for (const day of value.dates) statements.push(query(env,
    `INSERT INTO holiday_calendar(date,entry_id,closed,opens,closes) SELECT ?,?,?,?,? WHERE ${guard}`,
    day.date, id, Number(day.closed), day.opens, day.closes, id, token));
  const jobs = (await query(env, 'SELECT kind FROM holiday_sync_jobs WHERE entry_id=?', id).all()).results;
  for (const [kind, enabled] of [['hours', value.googleHours], ['post', value.googlePost]]) {
    if ((enabled && value.state === 'published') || jobs.some(job => job.kind === kind)) {
      statements.push(query(env, `INSERT INTO holiday_sync_jobs(entry_id,kind,version,status,updated_at) SELECT ?,?,?,'pending',? WHERE ${guard}
        ON CONFLICT(entry_id,kind) DO UPDATE SET version=excluded.version,status='pending',attempts=0,next_at=0,error='',updated_at=excluded.updated_at`, id, kind, version, now, id, token));
    }
  }
  try {
    const results = await env.INTAKE_DB.batch(statements);
    if (!(results[0].meta?.changes ?? results[0].changes)) fail(409, 'Someone changed this entry. Reload before saving.');
  } catch (error) {
    if (error instanceof HolidayError) throw error;
    if (/UNIQUE constraint failed: holiday_calendar.date/.test(error.message)) fail(409, 'Another published entry already covers one of these dates. Edit or unpublish that entry first.');
    throw error;
  }
  return { id, version, saved: true };
}
async function sendInvite(env, email) {
  const row = await query(env, 'SELECT * FROM holiday_staff WHERE email=? AND revoked_at IS NULL', email).first();
  if (!row) fail(404, 'This invitation is no longer active.');
  // Claim delivery to prevent double-clicks from issuing duplicate emails.
  const claimed = await query(env, "UPDATE holiday_staff SET email_status='sending',email_error='' WHERE email=? AND email_status IN ('pending','failed') RETURNING email", email).first();
  if (!claimed) return;
  try {
    if (!env.ADMIN_EMAIL) throw Error('not_configured');
    await env.ADMIN_EMAIL.send({ from: env.ADMIN_EMAIL_FROM || 'intake@changing-places-dsm.com', to: email,
      subject: 'Your Changing Places website admin invitation',
      text: `You have been invited to manage holiday hours and announcements for Changing Places Consignment Shop.\n\nOpen ${appOrigin(env)}/admin and sign in with this Google account: ${email}\n\nAdmins can manage announcements, Google Business Profile updates, and invite other admins. If you were not expecting this invitation, contact the shop.`,
    });
    await query(env, "UPDATE holiday_staff SET email_status='sent' WHERE email=?", email).run();
  } catch {
    await query(env, "UPDATE holiday_staff SET email_status='failed',email_error=? WHERE email=?", 'Invitation saved, but email could not be sent. Check the Cloudflare ADMIN_EMAIL binding and sender/recipient permissions, then resend. You can also share the admin URL directly.', email).run();
  }
}
async function inviteStaff(env, body, admin) {
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
  if (!isValidEmail(email)) fail(400, 'Enter the admin’s Google email address.');
  if (allowedEmails(env).includes(email)) fail(409, 'That account already has owner access.');
  const count = await query(env, 'SELECT COUNT(*) AS count FROM holiday_staff WHERE invited_at>?', nowSeconds() - 86400).first();
  if (count.count >= 20) fail(429, 'The daily invitation limit has been reached.');
  const row = await query(env, "INSERT INTO holiday_staff(email,invited_by,invited_at) VALUES(?,?,?) ON CONFLICT(email) DO UPDATE SET invited_by=excluded.invited_by,invited_at=excluded.invited_at,accepted_at=NULL,revoked_at=NULL,email_status='pending',email_error='' WHERE holiday_staff.revoked_at IS NOT NULL RETURNING email", email, admin.email, nowSeconds()).first();
  if (!row) fail(409, 'That person already has an active invitation or admin access.');
  await sendInvite(env, email);
}
export async function handleHolidayRequest(request, env, ctx) {
  const url = new URL(request.url), path = url.pathname;
  try {
    if (path === '/admin' || path === '/admin/') {
      if (!['GET','HEAD'].includes(request.method)) return json({ error: 'Method not allowed.' }, 405);
      return adminPage(request.method === 'HEAD');
    }
    if (!env.INTAKE_DB) fail(503, 'Holiday hours are not configured yet.');
    if (path === '/api/holiday-hours') {
      if (request.method !== 'GET') return json({ error: 'Method not allowed.' }, 405);
      return json(await publicHours(env));
    }
    if (path === '/api/admin/session' && request.method === 'GET') {
      const admin = await session(request, env);
      return json({ email: admin?.email || null, loginReady: oauthReady(env) && allowedEmails(env).length > 0, timeZone: STORE_TIME_ZONE });
    }
    if (path === '/api/admin/auth/login' && request.method === 'GET') return await startOAuth(request, env, 'login');
    if (path === '/api/admin/oauth/callback' && request.method === 'GET') return await finishOAuth(request, env);
    if (path === '/api/admin/logout' && request.method === 'POST') return await logout(request, env);
    const admin = await requireAdmin(request, env);
    if (request.method !== 'GET') sameOrigin(request, env);
    if (path === '/api/admin/holidays' && request.method === 'GET') return json({ entries: await listEntries(env) });
    const entryRoute = path.match(/^\/api\/admin\/holidays\/([a-f0-9-]+)(?:\/(retry))?$/);
    if (entryRoute && uuid.test(entryRoute[1])) {
      const id = entryRoute[1];
      if (!entryRoute[2] && request.method === 'PUT') {
        const result = await saveEntry(env, id, await getJSON(request), admin); safeWork(ctx, env); return json(result);
      }
      if (entryRoute[2] && request.method === 'POST') {
        const body = await getJSON(request);
        if (!['hours','post'].includes(body.kind)) fail(400, 'Choose which Google operation to retry.');
        await withGoogleLock(env, async () => {
          if (body.confirmNoPost === true) {
            const job = await query(env, 'SELECT status FROM holiday_sync_jobs WHERE entry_id=? AND kind=?', id, body.kind).first();
            if (body.kind !== 'post' || job?.status !== 'uncertain') fail(409, 'Only an uncertain post can be reset after checking Google.');
            await query(env, 'UPDATE holiday_google_posts SET attempted=0 WHERE entry_id=? AND post_name IS NULL', id).run();
          }
          const changed = await query(env, "UPDATE holiday_sync_jobs SET status='pending',attempts=0,next_at=0,error='' WHERE entry_id=? AND kind=? RETURNING entry_id", id, body.kind).first();
          if (!changed) fail(404, 'There is no Google operation to retry.');
        });
        safeWork(ctx, env); return json({ queued: true });
      }
    }
    if (path === '/api/admin/google' && request.method === 'GET') {
      const current = await connection(env);
      return json({ connected: Boolean(current?.refresh_token), encryptionReady: Boolean(env.GOOGLE_TOKEN_ENCRYPTION_KEY),
        account: current?.account_name, location: current?.location_name, title: current?.location_title,
        address: current?.location_address, canPost: current?.can_post == null ? null : Boolean(current.can_post) });
    }
    if (path === '/api/admin/google/connect' && request.method === 'POST') return await startOAuth(request, env, 'connect');
    if (path === '/api/admin/google/disconnect' && request.method === 'POST') { await disconnectGoogle(env); return json({ ok: true }); }
    if (path === '/api/admin/google/accounts' && request.method === 'GET') return json({ accounts: await listAccounts(env) });
    if (path === '/api/admin/google/locations' && request.method === 'GET') return json({ locations: await listLocations(env, url.searchParams.get('account')) });
    if (path === '/api/admin/google/location' && request.method === 'POST') {
      const body = await getJSON(request); return json(await selectLocation(env, body.account, body.location));
    }
    if (path === '/api/admin/staff' && request.method === 'GET') return json({ owners: allowedEmails(env),
      staff: (await query(env, 'SELECT * FROM holiday_staff ORDER BY invited_at DESC').all()).results });
    if (path === '/api/admin/staff' && request.method === 'POST') { await inviteStaff(env, await getJSON(request), admin); return json({ invited: true }); }
    if (path === '/api/admin/staff/resend' && request.method === 'POST') {
      const body = await getJSON(request);
      await query(env, "UPDATE holiday_staff SET email_status='pending' WHERE email=? AND revoked_at IS NULL AND email_status='sent' AND accepted_at IS NULL AND invited_at<?", body.email, nowSeconds() - 60).run();
      await sendInvite(env, body.email); return json({ ok: true });
    }
    if (path === '/api/admin/staff/revoke' && request.method === 'POST') {
      const body = await getJSON(request);
      if (body.email === admin.email || allowedEmails(env).includes(body.email)) fail(403, 'Owner access and your own access cannot be removed here.');
      await env.INTAKE_DB.batch([query(env, 'UPDATE holiday_staff SET revoked_at=? WHERE email=?', nowSeconds(), body.email),
        query(env, 'DELETE FROM holiday_admin_sessions WHERE email=?', body.email)]);
      return json({ ok: true });
    }
    return json({ error: 'Not found.' }, 404);
  } catch (error) {
    if (error instanceof HolidayError || error instanceof GoogleError) {
      if (path === '/api/admin/oauth/callback') console.warn(JSON.stringify({ event: 'holiday_oauth_failed', status: error.status, reason: error instanceof GoogleError ? error.code : 'validation' }));
      if (path === '/api/admin/oauth/callback') return new Response(`<!doctype html><title>Admin sign-in</title><p>${error.status === 403 ? 'This Google account is not authorized for admin access.' : 'Sign-in or connection could not finish. Check the Google configuration and try again.'}</p><p><a href="/admin">Return to admin sign-in</a></p>`, { status: error.status, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', 'Content-Security-Policy': "default-src 'none'; base-uri 'none'; frame-ancestors 'none'" } });
      return json({ error: error.message }, error.status);
    }
    console.error(JSON.stringify({ event: 'holiday_request_failed' }));
    return json({ error: 'Holiday hours could not be loaded or saved. Check the database migration and try again.' }, 503);
  }
}
export async function recoverHolidays(env) {
  if (!env.INTAKE_DB) return;
  try {
    const now = nowSeconds();
    await env.INTAKE_DB.batch([
      query(env, 'DELETE FROM holiday_admin_sessions WHERE expires_at<=?', now),
      query(env, 'DELETE FROM holiday_oauth_states WHERE expires_at<=?', now),
      query(env, 'DELETE FROM holiday_auth_limits WHERE expires_at<=?', now),
      query(env, "UPDATE holiday_staff SET email_status='failed',email_error='Email delivery was interrupted. Resend the invitation or share the admin URL.' WHERE email_status='sending' AND invited_at<?", now - 600),
    ]);
    await processGoogleJobs(env);
  } catch { console.error(JSON.stringify({ event: 'holiday_recovery_failed' })); }
}

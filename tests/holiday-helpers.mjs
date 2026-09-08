import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { digest, encryptToken, randomToken } from '../worker/google-oauth.mjs';
import { handleHolidayRequest } from '../worker/holiday-hours.mjs';
export const origin = 'https://changing-places-dsm.com';
export const owner = { email: 'owner@example.com' };
export const sampleEntry = (overrides = {}) => ({ version: 0, name: 'Thanksgiving 2099', message: 'Closed Thursday. See you Friday!', animation: 'automatic',
  state: 'published', bannerEnabled: true, startsAt: '2099-11-20T09:00', endsAt: '2099-11-28T18:00',
  dates: [{ date: '2099-11-26', closed: true }], googleHours: false, googlePost: false, ...overrides });
export async function setup() {
  const db = new DatabaseSync(':memory:'); db.exec('PRAGMA foreign_keys=ON');
  const migrations = new URL('../migrations/intake/', import.meta.url);
  for (const file of readdirSync(migrations).filter(file => file.endsWith('.sql')).sort()) db.exec(readFileSync(new URL(file, migrations),'utf8'));
  const prepare = sql => ({ bind: (...args) => ({ first: async () => db.prepare(sql).get(...args) || null,
    all: async () => ({ results: db.prepare(sql).all(...args) }), run: async () => ({ meta: db.prepare(sql).run(...args) }) }) });
  const env = { INTAKE_DB: { prepare, batch: async stmts => {
    db.exec('BEGIN'); try { const results = []; for (const stmt of stmts) results.push(await stmt.run()); db.exec('COMMIT'); return results; }
    catch (error) { db.exec('ROLLBACK'); throw error; }
  } }, APP_ORIGIN: origin, ADMIN_EMAILS: owner.email, GOOGLE_CLIENT_ID: 'test.apps.googleusercontent.com', GOOGLE_CLIENT_SECRET: 'fixture-only',
  GOOGLE_TOKEN_ENCRYPTION_KEY: randomToken() };
  const token = randomToken(), sessionHash = await digest(token), pending = [], emails = [];
  db.prepare('INSERT INTO holiday_admin_sessions VALUES(?,?,?)').run(sessionHash, owner.email, Math.floor(Date.now()/1000) + 3600);
  env.ADMIN_EMAIL = { send: async message => { emails.push(message); return { messageId: 'fixture-message' }; } };
  const request = (path, method='GET', body, headers = {}) => handleHolidayRequest(new Request(origin + path, {
    method, headers: { Cookie: `__Host-cpc_admin=${token}`, Origin: origin, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  }), env, { waitUntil: p => pending.push(p) });
  const connect = async () => db.prepare('UPDATE holiday_google_connection SET refresh_token=?,account_name=?,location_name=?,location_title=?,can_post=1 WHERE id=1').run(await encryptToken(env,'fixture-refresh'), 'accounts/1','locations/2','Changing Places');
  return { db, env, request, token, sessionHash, pending, emails, connect };
}
export function googleMock({ periods = [], postFailure, canPost = true } = {}) {
  const calls = [], posts = new Map(); let specialHours = periods, created = 0;
  const fetchImpl = async (input, options = {}) => {
    const url = new URL(input), body = options.body && !(options.body instanceof URLSearchParams) ? JSON.parse(options.body) : undefined;
    calls.push({ url: url.href, method: options.method || 'GET', body, headers: options.headers });
    if (url.hostname === 'oauth2.googleapis.com') return Response.json({ access_token: 'fixture-access' });
    if (url.hostname === 'mybusinessbusinessinformation.googleapis.com') {
      if (options.method === 'PATCH') { specialHours = body.specialHours.specialHourPeriods; return Response.json(body); }
      return Response.json({ name: 'locations/2', metadata: { canOperateLocalPost: canPost }, specialHours: { specialHourPeriods: specialHours } });
    }
    if (url.pathname.endsWith('/localPosts') && options.method === 'POST') {
      created++; const post = { ...body, name: `accounts/1/locations/2/localPosts/${created}`, state: 'LIVE' }; posts.set(post.name, post);
      if (postFailure) return postFailure(post);
      return Response.json(post);
    }
    if (url.pathname.endsWith('/localPosts')) return Response.json({ localPosts: [...posts.values()] });
    const name = url.pathname.replace('/v4/','');
    if (options.method === 'DELETE') { posts.delete(name); return new Response(null, { status: 204 }); }
    if (options.method === 'PATCH') { const post = { ...posts.get(name), ...body }; posts.set(name,post); return Response.json(post); }
    if (posts.has(name)) return Response.json(posts.get(name));
    throw Error(`Unexpected fixture request ${url}`);
  };
  return { fetchImpl, calls, posts, get created() { return created; }, get periods() { return specialHours; } };
}

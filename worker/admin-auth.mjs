import { fail, json, query, nowSeconds } from './holiday-utils.mjs';
import { appOrigin, authorizationURL, digest, randomToken, exchangeCode, verifyIdentity, encryptToken, BUSINESS_SCOPE, oauthReady } from './google-oauth.mjs';

export const allowedEmails = env => (env.ADMIN_EMAILS || '').split(',').map(email => email.trim().toLowerCase()).filter(Boolean);
export async function hasAccess(env, email) {
  if (allowedEmails(env).includes(email)) return true;
  return Boolean(await query(env, 'SELECT email FROM holiday_staff WHERE email=? AND revoked_at IS NULL', email).first());
}
const cookieName = (env, purpose) => `${appOrigin(env).startsWith('https:') ? '__Host-' : ''}cpc_${purpose}`;
const cookie = (env, purpose, value, maxAge) => `${cookieName(env, purpose)}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${appOrigin(env).startsWith('https:') ? '; Secure' : ''}`;
const getCookie = (request, env, purpose) => (request.headers.get('Cookie') || '').split(';').map(part => part.trim()).find(part => part.startsWith(`${cookieName(env, purpose)}=`))?.split('=')[1] || '';
export const sameOrigin = (request, env) => {
  if (new URL(request.url).origin !== appOrigin(env) || request.headers.get('Origin') !== appOrigin(env)) fail(403, 'Use the administrator page on this website.');
};
export async function session(request, env) {
  const raw = getCookie(request, env, 'admin');
  if (!/^[\w-]{43}$/.test(raw)) return null;
  const tokenHash = await digest(raw);
  const row = await query(env, 'SELECT * FROM holiday_admin_sessions WHERE token_hash=? AND expires_at>?', tokenHash, nowSeconds()).first();
  if (!row || !await hasAccess(env, row.email)) return null;
  return { email: row.email, tokenHash };
}
export async function requireAdmin(request, env) {
  const admin = await session(request, env);
  if (!admin) fail(401, 'Please sign in with an approved staff Google account.');
  return admin;
}
export async function startOAuth(request, env, purpose) {
  if (new URL(request.url).origin !== appOrigin(env)) fail(403, 'Use the configured website address to sign in.');
  let admin;
  if (purpose === 'connect') { sameOrigin(request, env); admin = await requireAdmin(request, env); await encryptToken(env, 'configuration-check'); }
  if (!allowedEmails(env).length || !oauthReady(env)) fail(503, 'Staff sign-in needs configuration. See HOLIDAY-HOURS.md.');
  const now = nowSeconds(), ip = await digest(request.headers.get('CF-Connecting-IP') || 'local');
  const count = await query(env, 'INSERT INTO holiday_auth_limits(key,count,expires_at) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1 RETURNING count', `${ip}:${Math.floor(now / 600)}`, now + 1200).first();
  if (count.count > 20) fail(429, 'Too many sign-in attempts. Please try again in ten minutes.');
  const state = randomToken(), browser = randomToken(), verifier = randomToken(), nonce = randomToken();
  await query(env, 'INSERT INTO holiday_oauth_states(state_hash,browser_hash,purpose,session_hash,verifier,nonce,expires_at) VALUES(?,?,?,?,?,?,?)',
    await digest(state), await digest(browser), purpose, admin?.tokenHash || null, verifier, nonce, now + 600).run();
  const url = authorizationURL(env, { state, nonce, challenge: await digest(verifier), connect: purpose === 'connect' });
  const headers = { 'Set-Cookie': cookie(env, 'oauth', browser, 600) };
  return purpose === 'connect' ? json({ url }, 200, headers) : new Response(null, { status: 302, headers: { ...headers, Location: url, 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } });
}
export async function finishOAuth(request, env, fetchImpl) {
  const url = new URL(request.url);
  if (url.origin !== appOrigin(env)) fail(403, 'Use the configured OAuth callback URL.');
  const raw = url.searchParams.get('state') || '', browser = getCookie(request, env, 'oauth');
  if (!/^[\w-]{43}$/.test(raw) || !/^[\w-]{43}$/.test(browser)) fail(400, 'The sign-in request expired. Start again.');
  const state = await query(env, 'DELETE FROM holiday_oauth_states WHERE state_hash=? AND browser_hash=? AND expires_at>? RETURNING *', await digest(raw), await digest(browser), nowSeconds()).first();
  if (!state) fail(400, 'The sign-in request expired or has already been used. Start again.');
  const responseHeaders = new Headers({ Location: '/admin', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' });
  responseHeaders.append('Set-Cookie', cookie(env, 'oauth', '', 0));
  if (url.searchParams.has('error')) {
    responseHeaders.set('Location', '/admin?notice=cancelled');
    return new Response(null, { status: 303, headers: responseHeaders });
  }
  const code = url.searchParams.get('code');
  if (!code || code.length > 8000) fail(400, 'Google did not return an authorization code. Start again.');
  let admin;
  if (state.purpose === 'connect') {
    admin = await requireAdmin(request, env);
    if (admin.tokenHash !== state.session_hash) fail(403, 'Sign in again before connecting Google.');
  }
  const tokens = await exchangeCode(env, code, state.verifier, fetchImpl);
  if (state.purpose === 'login') {
    const email = await verifyIdentity(tokens.id_token, env, state.nonce, fetchImpl);
    if (!await hasAccess(env, email)) fail(403, 'This Google account has not been invited to the staff area.');
    await query(env, 'UPDATE holiday_staff SET accepted_at=COALESCE(accepted_at,?) WHERE email=? AND revoked_at IS NULL', nowSeconds(), email).run();
    const token = randomToken();
    await env.INTAKE_DB.batch([
      query(env, 'DELETE FROM holiday_admin_sessions WHERE token_hash=?', await digest(getCookie(request, env, 'admin'))),
      query(env, 'INSERT INTO holiday_admin_sessions(token_hash,email,expires_at) VALUES(?,?,?)', await digest(token), email, nowSeconds() + 8 * 3600),
    ]);
    responseHeaders.append('Set-Cookie', cookie(env, 'admin', token, 8 * 3600));
  } else {
    if (!tokens.scope?.split(' ').includes(BUSINESS_SCOPE) || !tokens.refresh_token) fail(400, 'Google Business Profile permission was not granted. Connect again and allow Business Profile access.');
    const encrypted = await encryptToken(env, tokens.refresh_token);
    const result = await query(env, 'UPDATE holiday_google_connection SET refresh_token=?,connected_by=?,connected_at=? WHERE id=1 AND lock_until<? RETURNING id', encrypted, admin.email, nowSeconds(), nowSeconds()).first();
    if (!result) fail(409, 'Google sync is running. Wait a minute and connect again.');
    responseHeaders.set('Location', '/admin?notice=connected');
  }
  return new Response(null, { status: 303, headers: responseHeaders });
}
export async function logout(request, env) {
  sameOrigin(request, env);
  const admin = await requireAdmin(request, env);
  await query(env, 'DELETE FROM holiday_admin_sessions WHERE token_hash=?', admin.tokenHash).run();
  return json({ ok: true }, 200, { 'Set-Cookie': cookie(env, 'admin', '', 0) });
}

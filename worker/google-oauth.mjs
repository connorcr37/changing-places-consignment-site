import { readBoundedBody } from './intake-utils.mjs';
import { fail } from './holiday-utils.mjs';

export const BUSINESS_SCOPE = 'https://www.googleapis.com/auth/business.manage';
export const bytesToBase64 = bytes => btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
export const base64ToBytes = value => Uint8Array.from(atob(value.replaceAll('-', '+').replaceAll('_', '/')), char => char.charCodeAt(0));
export const randomToken = () => bytesToBase64(crypto.getRandomValues(new Uint8Array(32)));
export const digest = async value => bytesToBase64(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))));

export class GoogleError extends Error {
  constructor(status, message, code = 'google_error') { super(message); this.status = status; this.code = code; }
}
// Never return Google response bodies: they can contain credentials or submitted data.
export async function googleJSON(url, options = {}, fetchImpl = fetch) {
  let response;
  try {
    // Workers' pinned runtime supports manual/follow. Reject redirects explicitly
    // so an OAuth code or Authorization header can never follow another host.
    response = await fetchImpl(url, { ...options, redirect: 'manual', signal: AbortSignal.timeout(8000) });
    if (response.status >= 300 && response.status < 400) {
      await response.body?.cancel();
      throw new GoogleError(503, 'Google returned an unexpected redirect. Retry later.', 'redirect');
    }
    const bytes = await readBoundedBody(response, 1000000);
    const body = bytes.length ? JSON.parse(new TextDecoder().decode(bytes)) : {};
    if (response.ok) return body;
    if (body.error === 'invalid_grant') throw new GoogleError(401, 'Google authorization expired or was revoked. Reconnect Google Business Profile.', 'reconnect');
    const reasons = body.error?.details?.map(detail => detail.reason) || [];
    if (reasons.includes('SERVICE_DISABLED')) throw new GoogleError(403, 'Enable the required Business Profile API in the Google Cloud project, then Retry.', 'api_disabled');
    if (response.status === 401) throw new GoogleError(401, 'Google authorization is no longer valid. Reconnect Google Business Profile.', 'reconnect');
    if (response.status === 403) throw new GoogleError(403, 'Google denied access. Check API approval, enabled APIs, granted scope, and owner/manager access to this location.', 'permission');
    if (response.status === 429) throw new GoogleError(429, 'Google quota was exceeded. Check that Business Profile API quota is above zero, then Retry.', 'quota');
    if (response.status === 404) throw new GoogleError(404, 'Google could not find this location or post. Check the selected location.', 'not_found');
    if (response.status >= 500) throw new GoogleError(response.status, 'Google is temporarily unavailable. The website is saved; retry Google sync.', 'unavailable');
    throw new GoogleError(response.status, 'Google rejected this update. Check the dates, opening/closing times, regular hours on Google, and post content.', 'rejected');
  } catch (error) {
    if (error instanceof GoogleError) throw error;
    const timeout = ['TimeoutError', 'AbortError'].includes(error.name);
    throw new GoogleError(response?.status >= 400 ? response.status : 503,
      timeout ? 'The Google request timed out. Retry the operation.' : 'Google did not return a usable response. Retry the operation.',
      timeout ? 'timeout' : response ? 'invalid_response' : 'network');
  }
}
export function appOrigin(env) {
  const value = env.APP_ORIGIN || 'https://changing-places-dsm.com';
  const url = new URL(value);
  if (url.origin !== value || (url.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(url.hostname))) fail(503, 'The administrator must configure APP_ORIGIN.');
  return value;
}
export const callbackURL = env => `${appOrigin(env)}/api/admin/oauth/callback`;
export const oauthReady = env => Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
export function authorizationURL(env, { state, nonce, challenge, connect }) {
  if (!oauthReady(env)) fail(503, 'Google sign-in is unavailable. Please contact the website owner.');
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  Object.entries({ client_id: env.GOOGLE_CLIENT_ID, redirect_uri: callbackURL(env), response_type: 'code',
    scope: connect ? BUSINESS_SCOPE : 'openid email', state, nonce, code_challenge: challenge,
    code_challenge_method: 'S256', prompt: connect ? 'consent select_account' : 'select_account',
    ...(connect ? { access_type: 'offline' } : {}),
  }).forEach(([key, value]) => url.searchParams.set(key, value));
  return url.href;
}
export const exchangeCode = (env, code, verifier, fetchImpl) => googleJSON('https://oauth2.googleapis.com/token', {
  method: 'POST', body: new URLSearchParams({ client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET,
    code, code_verifier: verifier, redirect_uri: callbackURL(env), grant_type: 'authorization_code' }),
}, fetchImpl);

export async function verifyIdentity(token, env, nonce, fetchImpl) {
  try {
    if (typeof token !== 'string' || token.length > 16000) throw Error();
    const [headerPart, payloadPart, signature, extra] = token.split('.');
    if (extra !== undefined || !signature) throw Error();
    const decode = value => JSON.parse(new TextDecoder().decode(base64ToBytes(value)));
    const header = decode(headerPart), claims = decode(payloadPart);
    if (header.alg !== 'RS256' || !header.kid) throw Error();
    const jwks = await googleJSON('https://www.googleapis.com/oauth2/v3/certs', {}, fetchImpl);
    const jwk = jwks.keys?.find(key => key.kid === header.kid && key.kty === 'RSA');
    if (!jwk) throw Error();
    const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
    if (!await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, base64ToBytes(signature), new TextEncoder().encode(`${headerPart}.${payloadPart}`))) throw Error();
    const now = Date.now() / 1000;
    if (!['https://accounts.google.com', 'accounts.google.com'].includes(claims.iss) || claims.aud !== env.GOOGLE_CLIENT_ID ||
      (claims.azp && claims.azp !== env.GOOGLE_CLIENT_ID) || !Number.isFinite(claims.exp) || claims.exp <= now ||
      !Number.isFinite(claims.iat) || claims.iat > now + 60 || claims.nonce !== nonce || claims.email_verified !== true ||
      typeof claims.email !== 'string' || !claims.sub) throw Error();
    return claims.email.toLowerCase();
  } catch { fail(401, 'Google sign-in could not be verified. Please sign in again.'); }
}
async function encryptionKey(env) {
  try {
    const bytes = base64ToBytes(env.GOOGLE_TOKEN_ENCRYPTION_KEY || '');
    if (bytes.length !== 32) throw Error();
    return await crypto.subtle.importKey('raw', bytes, 'AES-GCM', false, ['encrypt', 'decrypt']);
  } catch { fail(503, 'Configure the Google token encryption secret before connecting Business Profile.'); }
}
export async function encryptToken(env, value) {
  const key = await encryptionKey(env), iv = crypto.getRandomValues(new Uint8Array(12));
  const bytes = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: new TextEncoder().encode('holiday-google-v1') }, key, new TextEncoder().encode(value));
  return `v1.${bytesToBase64(iv)}.${bytesToBase64(new Uint8Array(bytes))}`;
}
export async function decryptToken(env, value) {
  try {
    const [version, iv, bytes] = value.split('.');
    if (version !== 'v1') throw Error();
    return new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: base64ToBytes(iv), additionalData: new TextEncoder().encode('holiday-google-v1') }, await encryptionKey(env), base64ToBytes(bytes)));
  } catch { fail(503, 'The saved Google connection cannot be decrypted. Restore the encryption secret or reconnect Google.'); }
}
export async function accessToken(env, connection, fetchImpl) {
  if (!connection?.refresh_token) fail(409, 'Connect Google Business Profile and select the store location, then Retry.');
  const result = await googleJSON('https://oauth2.googleapis.com/token', { method: 'POST', body: new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET,
    refresh_token: await decryptToken(env, connection.refresh_token), grant_type: 'refresh_token',
  }) }, fetchImpl);
  if (!result.access_token) throw new GoogleError(503, 'Google did not issue an access token. Reconnect Google Business Profile.');
  return result.access_token;
}

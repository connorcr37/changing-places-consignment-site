import { analyzeSubmission } from './intake-ai.mjs';
import { photoKey, readBoundedBody, INTAKE_RETENTION_SECONDS as RETENTION_SECONDS } from './intake-utils.mjs';
import { INTAKE_LIMITS, isValidEmail, isValidPhone } from '../intake-shared.js';
import { sendReviewEmail } from './intake-email.mjs';
import { alertDeliveryFailure } from './intake-alerts.mjs';

const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const tokenPattern = /^[a-f0-9-]{72}$/i;
const DAY = 86400;
const UPLOAD_SESSION_SECONDS = 2 * 3600;
const intakeEnabled = env => env.INTAKE_ENABLED === 'true' && Boolean(env.INTAKE_DB && env.OPENAI_API_KEY && env.INTAKE_EMAIL && env.INTAKE_QUEUE && env.INTAKE_PHOTOS);
const isExpired = row => row.submitted_at != null && row.submitted_at <= now() - RETENTION_SECONDS;
const now = () => Math.floor(Date.now() / 1000);
const query = (env, sql, ...args) => env.INTAKE_DB.prepare(sql).bind(...args);
export const hash = async (value) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', typeof value === 'string' ? new TextEncoder().encode(value) : value))].map(x => x.toString(16).padStart(2, '0')).join('');
const headers = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'X-Robots-Tag': 'noindex, nofollow, noarchive', 'Referrer-Policy': 'no-referrer' };
const json = (value, status = 200, extra = {}) => new Response(JSON.stringify(value), { status, headers: { ...headers, ...extra } });
class IntakeError extends Error { constructor(status, message) { super(message); this.status = status; } }
const fail = (status, message) => { throw new IntakeError(status, message); };
const safeLog = (event, id) => console.error(JSON.stringify({ event, submissionId: id }));
const getJson = async (request, limit = 16000) => {
  if (!request.headers.get('content-type')?.startsWith('application/json')) fail(415, 'Please send JSON.');
  try { return JSON.parse(new TextDecoder().decode(await readBoundedBody(request, limit))); }
  catch { fail(400, 'Please check the submitted information.'); }
};
const textField = (value, max) => typeof value === 'string' && value.length <= max ? value.trim() : fail(400, 'Please shorten the information entered.');
export function validateContact(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) fail(400, 'Please check the submitted information.');
  const name = textField(body.name, 120);
  const phone = textField(body.phone ?? '', 40);
  const email = textField(body.email ?? '', 254);
  const notes = textField(body.notes ?? '', 4000);
  if (!name || /[\r\n\x00-\x1f]/.test(name)) fail(400, 'Please enter your name.');
  if (!phone && !email) fail(400, 'Please enter a phone number or email address.');
  if (email && !isValidEmail(email)) fail(400, 'Please check your email address.');
  if (phone && !isValidPhone(phone)) fail(400, 'Please check your phone number.');
  if (!Number.isInteger(body.photoCount) || body.photoCount < 1 || body.photoCount > INTAKE_LIMITS.maxPhotos) fail(400, 'Please choose between 1 and 30 photos.');
  if (body.consent !== true || body.website) fail(400, 'Please confirm that these photos can be reviewed.');
  return { name, phone, email, notes };
}

async function limit(env, key, maximum, seconds) {
  const bucket = Math.floor(now() / seconds);
  const row = await query(env, 'INSERT INTO intake_limits(key,count,expires_at) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1 RETURNING count', `${key}:${bucket}`, (bucket + 1) * seconds).first();
  if (row.count > maximum) {
    const error = new IntakeError(429, 'Please try again later, or text your photos to 620-255-8901 or email ChangingPlacesDSM@gmail.com.');
    error.retryAt = (bucket + 1) * seconds;
    throw error;
  }
}
async function authorizedUpload(request, env, id) {
  const credential = request.headers.get('Authorization')?.replace(/^Bearer /, '') || '';
  if (!tokenPattern.test(credential)) fail(401, 'Upload session expired. Please start again.');
  const row = await query(env, 'SELECT * FROM intake_submissions WHERE upload_id=? AND token_hash=?', id, await hash(credential)).first();
  if (!row || row.created_at < now() - UPLOAD_SESSION_SECONDS) fail(401, 'Upload session expired. Please start again.');
  return row;
}
async function startUpload(request, env) {
  if (!intakeEnabled(env)) fail(503, 'Photo submissions are not available just yet. Please try again later.');
  const body = await getJson(request);
  const contact = validateContact(body);
  if (!uuid.test(body.uploadId) || !tokenPattern.test(body.uploadToken)) fail(400, 'Please reload the form and try again.');
  const digest = await hash(body.uploadToken);
  const existing = await query(env, 'SELECT token_hash,created_at FROM intake_submissions WHERE upload_id=?', body.uploadId).first();
  if (existing) {
    if (existing.token_hash !== digest || existing.created_at < now() - UPLOAD_SESSION_SECONDS) fail(409, 'Please reload the form and try again.');
    return json({ uploadId: body.uploadId });
  }
  await limit(env, `upload:${await hash(request.headers.get('CF-Connecting-IP') || 'local')}`, 3, 3600);
  await limit(env, 'daily-intake', Number(env.INTAKE_DAILY_LIMIT) || 50, 86400);
  await query(env, 'INSERT INTO intake_submissions(upload_id,token_hash,name,phone,email,notes,photo_count,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(upload_id) DO NOTHING', body.uploadId, digest, contact.name, contact.phone, contact.email, contact.notes, body.photoCount, now(), now()).run();
  const created = await query(env, 'SELECT token_hash FROM intake_submissions WHERE upload_id=?', body.uploadId).first();
  if (created?.token_hash !== digest) fail(409, 'Please reload the form and try again.');
  return json({ uploadId: body.uploadId }, 201);
}
async function uploadPhoto(request, env, id, ordinal) {
  const submission = await authorizedUpload(request, env, id);
  if (submission.state !== 'uploading' || ordinal < 1 || ordinal > submission.photo_count) fail(409, 'This upload can no longer be changed.');
  if (!request.headers.get('Content-Type')?.startsWith('multipart/form-data;')) fail(415, 'Please upload photos using the form.');
  let bytes, preview;
  try {
    const bounded = await readBoundedBody(request, INTAKE_LIMITS.maxPhotoBytes + INTAKE_LIMITS.maxPreviewBytes + 10000);
    const form = await new Response(bounded, { headers: { 'Content-Type': request.headers.get('Content-Type') } }).formData();
    const main = form.get('photo'), small = form.get('preview');
    if (!main?.arrayBuffer || !small?.arrayBuffer || main.type !== 'image/jpeg' || small.type !== 'image/jpeg' || main.size > INTAKE_LIMITS.maxPhotoBytes || small.size > INTAKE_LIMITS.maxPreviewBytes) fail(413, 'This photo is too large or could not be read.');
    bytes = new Uint8Array(await main.arrayBuffer()); preview = new Uint8Array(await small.arrayBuffer());
  } catch (error) { if (error instanceof IntakeError) throw error; fail(413, 'This photo is too large or could not be read. Please choose another photo.'); }
  for (const image of [bytes, preview]) if (image.length < 100 || image[0] !== 0xff || image[1] !== 0xd8 || image[2] !== 0xff) fail(415, 'This photo could not be read. Please choose another image.');
  const digest = await hash(`${await hash(bytes)}:${await hash(preview)}`);
  const key = photoKey(id, ordinal);
  await query(env, 'INSERT INTO intake_photos(upload_id,ordinal,object_key,digest,bytes) VALUES(?,?,?,?,?) ON CONFLICT(upload_id,ordinal) DO NOTHING', id, ordinal, key, digest, bytes.length).run();
  const photo = await query(env, 'SELECT digest,ready FROM intake_photos WHERE upload_id=? AND ordinal=?', id, ordinal).first();
  if (photo.digest !== digest) fail(409, 'This photo slot is already in use. Please start a new submission.');
  if (!photo.ready) {
    await env.INTAKE_PHOTOS.put(key, bytes, { httpMetadata: { contentType: 'image/jpeg', cacheControl: 'private, no-store' } });
    await env.INTAKE_PHOTOS.put(photoKey(id, ordinal, true), preview, { httpMetadata: { contentType: 'image/jpeg', cacheControl: 'private, no-store' } });
    await query(env, 'UPDATE intake_photos SET ready=1 WHERE upload_id=? AND ordinal=?', id, ordinal).run();
  }
  return json({ ok: true });
}
async function finishUpload(request, env, ctx, id) {
  const submission = await authorizedUpload(request, env, id);
  if (submission.state === 'uploading') {
    const count = await query(env, 'SELECT COUNT(*) AS count FROM intake_photos WHERE upload_id=? AND ready=1', id).first();
    if (count.count !== submission.photo_count) fail(409, 'Some photos are still uploading. Please try again.');
    await query(env, "UPDATE intake_submissions SET state='submitted',submitted_at=?,updated_at=? WHERE upload_id=? AND state='uploading'", now(), now(), id).run();
  }
  // The database is the durable outbox. Scheduled recovery resends missed queue work.
  ctx.waitUntil(env.INTAKE_QUEUE.send({ uploadId: id }).catch(() => safeLog('intake_enqueue_failed', submission.id)));
  return json({ received: true }, 202);
}

export async function handleIntake(request, env, ctx) {
  try {
    if (!env.INTAKE_DB) fail(503, 'Photo submissions are not available just yet.');
    const url = new URL(request.url);
    if (!['GET', 'HEAD'].includes(request.method) && request.headers.get('Origin') !== url.origin) fail(403, 'Please use the form on this website.');
    if (url.pathname === '/api/intake/config' && request.method === 'GET') return json({ enabled: intakeEnabled(env), maxPhotos: INTAKE_LIMITS.maxPhotos });
    if (url.pathname === '/api/intake/submissions' && request.method === 'POST') return await startUpload(request, env);
    const upload = url.pathname.match(/^\/api\/intake\/submissions\/([a-f0-9-]+)\/(photos\/(\d+)|complete)$/i);
    if (upload && uuid.test(upload[1])) {
      if (upload[3] && request.method === 'PUT') return await uploadPhoto(request, env, upload[1], Number(upload[3]));
      if (upload[2] === 'complete' && request.method === 'POST') return await finishUpload(request, env, ctx, upload[1]);
    }
    return json({ error: 'Not found.' }, 404);
  } catch (error) {
    if (error instanceof IntakeError) return json({ error: error.message, ...(error.retryAt ? { retryAt: error.retryAt } : {}) }, error.status, error.retryAt ? { 'Retry-After': String(Math.max(1, error.retryAt - now())) } : {});
    safeLog('intake_request_failed');
    return json({ error: 'Something went wrong. Your photos may already be saved; please try again.' }, 503);
  }
}

export async function processIntake(env, uploadId, { analyze = analyzeSubmission, mail = sendReviewEmail } = {}) {
  let row = await query(env, 'SELECT * FROM intake_submissions WHERE upload_id=?', uploadId).first();
  if (!row || isExpired(row) || ['uploading', 'deleting'].includes(row.state)) return;
  if (!row.analysis_json && row.state !== 'needs_review') {
    row = await query(env, "UPDATE intake_submissions SET state='processing',processing_until=?,analysis_attempts=analysis_attempts+1,updated_at=? WHERE upload_id=? AND state IN ('submitted','processing') AND processing_until<? AND analysis_attempts<3 RETURNING *", now() + 600, now(), uploadId, now()).first();
    if (!row) return;
    try {
      const photos = await query(env, 'SELECT * FROM intake_photos WHERE upload_id=? AND ready=1 ORDER BY ordinal', uploadId).all();
      if (photos.results.length !== row.photo_count) throw new Error('missing_photos');
      const assessment = await analyze(env, row, photos.results);
      await query(env, "UPDATE intake_submissions SET state='ready',analysis_json=?,processing_until=0,updated_at=? WHERE upload_id=? AND state='processing'", JSON.stringify(assessment), now(), uploadId).run();
    } catch {
      safeLog('intake_analysis_failed', row.id);
      await query(env, 'UPDATE intake_submissions SET state=?,processing_until=0,updated_at=? WHERE upload_id=? AND state=\'processing\'', row.analysis_attempts >= 3 ? 'needs_review' : 'submitted', now(), uploadId).run();
      if (row.analysis_attempts < 3) throw new Error('retry_analysis');
    }
  }
  row = await query(env, 'SELECT * FROM intake_submissions WHERE upload_id=?', uploadId).first();
  if (!row || isExpired(row) || !['ready', 'needs_review'].includes(row.state) || row.notification_sent) return;
  if (row.notification_attempts >= 5) { await alertDeliveryFailure(env, uploadId); return; }
  // Lease notifications too: queue delivery is at least once.
  const claim = await query(env, "UPDATE intake_submissions SET processing_until=?,notification_attempts=notification_attempts+1 WHERE upload_id=? AND state IN ('ready','needs_review') AND notification_sent=0 AND notification_attempts<5 AND processing_until<? RETURNING id", now() + 120, uploadId, now()).first();
  if (!claim) return;
  try {
    const assessment = row.analysis_json ? JSON.parse(row.analysis_json) : null;
    await mail(env, row, assessment);
    await query(env, 'UPDATE intake_submissions SET notification_sent=1,processing_until=0 WHERE upload_id=?', uploadId).run();
  } catch {
    await query(env, 'UPDATE intake_submissions SET processing_until=0,updated_at=? WHERE upload_id=?', now(), uploadId).run();
    safeLog('intake_notification_failed', row.id);
    if (row.notification_attempts === 4) await alertDeliveryFailure(env, uploadId);
    throw new Error('retry_notification');
  }
}
export async function handleIntakeQueue(batch, env) {
  for (const message of batch.messages) {
    if (!uuid.test(message.body?.uploadId)) { message.ack(); continue; }
    try { await processIntake(env, message.body.uploadId); message.ack(); }
    catch { message.retry({ delaySeconds: 120 }); }
  }
}
export async function deleteSubmission(env, row) {
  await query(env, "UPDATE intake_submissions SET state='deleting' WHERE upload_id=?", row.upload_id).run();
  // Derive all possible keys, including an interrupted upload not marked ready.
  await env.INTAKE_PHOTOS.delete(Array.from({ length: row.photo_count }, (_, i) => [photoKey(row.upload_id, i + 1), photoKey(row.upload_id, i + 1, true)]).flat());
  await query(env, 'DELETE FROM intake_submissions WHERE upload_id=?', row.upload_id).run();
}
export async function recoverIntake(env) {
  if (!env.INTAKE_DB || !env.INTAKE_PHOTOS) return;
  // Retention must run even when the queue is unavailable or a different deletion fails.
  const expired = await query(env, "SELECT * FROM intake_submissions WHERE state='deleting' OR (state='uploading' AND created_at<=?) OR (submitted_at IS NOT NULL AND submitted_at<=?) LIMIT 20", now() - DAY, now() - RETENTION_SECONDS).all();
  for (const row of expired.results) {
    try { await deleteSubmission(env, row); }
    catch { safeLog('intake_deletion_failed', row.id); }
  }
  await query(env, 'DELETE FROM intake_limits WHERE expires_at<?', now()).run();
  const alerts = await query(env, "SELECT upload_id FROM intake_submissions WHERE state IN ('ready','needs_review') AND notification_sent=0 AND notification_attempts>=5 AND alert_sent=0 AND alert_after<=? AND submitted_at>? LIMIT 20", now(), now() - RETENTION_SECONDS).all();
  for (const row of alerts.results) {
    try { await alertDeliveryFailure(env, row.upload_id); }
    catch { safeLog('intake_alert_recovery_failed'); }
  }
  if (!env.INTAKE_QUEUE) return;
  await query(env, "UPDATE intake_submissions SET state='needs_review',processing_until=0 WHERE state IN ('submitted','processing') AND analysis_attempts>=3 AND processing_until<?", now()).run();
  const pending = await query(env, "SELECT id,upload_id FROM intake_submissions WHERE submitted_at>? AND processing_until<? AND updated_at<? AND (state IN ('submitted','processing') OR (state IN ('ready','needs_review') AND notification_sent=0 AND notification_attempts<5)) LIMIT 20", now() - RETENTION_SECONDS, now(), now() - 120).all();
  for (const row of pending.results) {
    try { await env.INTAKE_QUEUE.send({ uploadId: row.upload_id }); }
    catch { safeLog('intake_enqueue_failed', row.id); }
  }
}

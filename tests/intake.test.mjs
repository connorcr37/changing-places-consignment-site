import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { handleIntake, hash, processIntake, recoverIntake } from '../worker/intake.mjs';
import { buildReviewEmail, sendReviewEmail } from '../worker/intake-email.mjs';
import { analyzeSubmission, readBoundedBody, validateAssessment } from '../worker/intake-ai.mjs';

const origin = 'https://changing-places-dsm.com';
const now = () => Math.floor(Date.now() / 1000);
const sample = () => ({ approximate_item_count: 1, overview: 'One chair in two views.', grouping_uncertainty: '', items: [{ item: 'Chair', quantity: 1, category: 'Seating', likely_brand: 'Unknown / label needed', photo_numbers: [1], visible_condition: 'Light surface wear', obvious_flaws: ['Small scratch'], information_needed: ['Brand label'], recommendation: 'needs_review', assessment: 'Ask for measurements.' }], information_needed: ['Measurements'], suggested_response: 'Thank you for the photos. Could you share measurements?' });
function setup() {
  const db = new DatabaseSync(':memory:'); db.exec('PRAGMA foreign_keys=ON'); db.exec(readFileSync(new URL('../migrations/intake/0001_intake.sql', import.meta.url), 'utf8'));
  const objects = new Map(), messages = [], emails = [], pending = [];
  const prepare = sql => ({ bind: (...args) => ({ first: async () => db.prepare(sql).get(...args) || null, all: async () => ({ results: db.prepare(sql).all(...args) }), run: async () => db.prepare(sql).run(...args) }) });
  const env = { OPENAI_API_KEY: 'test-key', INTAKE_ENABLED: 'true', INTAKE_NOTIFICATION_EMAIL: 'connorcr37+cpcs@gmail.com', INTAKE_EMAIL_FROM: 'intake@changing-places-dsm.com', INTAKE_DB: { prepare, batch: async stmts => Promise.all(stmts.map(stmt => stmt.run())) }, INTAKE_PHOTOS: { put: async (key, value) => objects.set(key, new Uint8Array(value)), get: async key => { const value = objects.get(key); return value ? { size: value.length, arrayBuffer: async () => value.buffer, body: value } : null; }, delete: async keys => { for (const key of Array.isArray(keys) ? keys : [keys]) objects.delete(key); } }, INTAKE_QUEUE: { send: async message => messages.push(message) }, INTAKE_EMAIL: { send: async message => emails.push(message) } };
  const request = async (path, method = 'GET', body, extra = {}) => {
    const response = await handleIntake(new Request(origin + '/api/intake' + path, { method, headers: { Origin: origin, ...(body && !(body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}), ...extra }, ...(body ? { body: body instanceof FormData ? body : JSON.stringify(body) } : {}) }), env, { waitUntil: p => pending.push(p) });
    return response;
  };
  const start = async (count = 1) => { const info = { uploadId: crypto.randomUUID(), uploadToken: crypto.randomUUID() + crypto.randomUUID(), name: 'Mary Smith', email: 'mary@example.com', notes: 'Two views of the chair', photoCount: count, consent: true }; assert.equal((await request('/submissions', 'POST', info)).status, 201); return info; };
  const photo = new Uint8Array(120); photo.set([255, 216, 255]);
  const upload = async (info, number) => { const form = new FormData(); form.append('photo', new Blob([photo], { type: 'image/jpeg' }), 'photo.jpg'); form.append('preview', new Blob([photo], { type: 'image/jpeg' }), 'preview.jpg'); return request(`/submissions/${info.uploadId}/photos/${number}`, 'PUT', form, { Authorization: `Bearer ${info.uploadToken}` }); };
  const complete = async info => request(`/submissions/${info.uploadId}/complete`, 'POST', null, { Authorization: `Bearer ${info.uploadToken}` });
  return { db, env, objects, emails, messages, request, start, upload, complete, pending };
}

test('there is no public inbox, staff dashboard, photo download, or assessment endpoint', async () => {
  const s = setup(); const info = await s.start();
  for (const path of ['/staff/submissions', '/staff/submissions/1', '/staff/submissions/1/photos/1']) {
    const response = await s.request(path, 'GET', null, { Authorization: `Bearer ${info.uploadToken}` }); assert.equal(response.status, 404); assert.equal(response.headers.get('cache-control'), 'no-store');
  }
  assert.equal((await s.request('/staff/submissions/1', 'DELETE')).status, 404);
});
test('cross-origin mutations fail closed', async () => {
  const s = setup();
  for (const path of ['/submissions', '/login', '/verify', '/staff/logout']) assert.equal((await s.request(path, 'POST', {}, { Origin: 'https://other.example' })).status, 403);
});
test('requires contact, consent, and 1–30 photos, rejects invalid or oversize fields', async () => {
  const s = setup(); const base = { name: 'Mary', phone: '5155550123', consent: true, photoCount: 1 };
  for (const bad of [{ phone: '' }, { consent: false }, { photoCount: 31 }, { photoCount: 0 }, { name: 'a'.repeat(121) }, { email: 'bad' }, { website: 'spam' }]) assert.equal((await s.request('/submissions', 'POST', { ...base, ...bad })).status, 400);
});
test('thirty photos upload privately, finish idempotently and return only a receipt', async () => {
  const s = setup(); const info = await s.start(30);
  assert.equal((await s.complete(info)).status, 409);
  for (let i = 1; i <= 30; i++) assert.equal((await s.upload(info, i)).status, 200);
  assert.equal((await s.upload(info, 30)).status, 200);
  assert.equal(s.objects.size, 60);
  const receipt = await s.complete(info); assert.equal(receipt.status, 202); assert.deepEqual(await receipt.json(), { received: true });
  assert.deepEqual(await (await s.complete(info)).json(), { received: true });
  assert.equal((await s.upload(info, 1)).status, 409);
  assert.equal(s.db.prepare('SELECT COUNT(*) AS n FROM intake_submissions').get().n, 1);
});
test('upload sessions cannot be stolen, read publicly, or used after expiration', async () => {
  const s = setup(); const info = await s.start();
  assert.equal((await s.request('/submissions', 'POST', { ...info, uploadToken: crypto.randomUUID() + crypto.randomUUID() })).status, 409);
  assert.equal((await s.request(`/submissions/${info.uploadId}/photos/1`)).status, 404);
  s.db.prepare('UPDATE intake_submissions SET created_at=?').run(now() - 7201);
  assert.equal((await s.upload(info, 1)).status, 401);
});
test('AI and notifications process once on repeated queue delivery', async () => {
  const s = setup(); const info = await s.start(); await s.upload(info, 1); await s.complete(info);
  let analyses = 0, emails = 0;
  const dependencies = { analyze: async () => { analyses++; return sample(); }, mail: async (env, row, assessment) => { emails++; const email = buildReviewEmail(env, row, assessment, []); assert.match(email.subject, /Web Submission #1 - Mary Smith - 1 Photos/); assert.match(email.html, /Approximately 1 items/); } };
  await processIntake(s.env, info.uploadId, dependencies); await processIntake(s.env, info.uploadId, dependencies);
  assert.equal(analyses, 1); assert.equal(emails, 1); assert.equal(s.db.prepare('SELECT state FROM intake_submissions').get().state, 'ready');
});
test('three failed assessments preserve photos and notify for manual review', async () => {
  const s = setup(); const info = await s.start(); await s.upload(info, 1); await s.complete(info); let notified = 0;
  const dependencies = { analyze: async () => { throw Error('private provider failure'); }, mail: async () => { notified++; } };
  await assert.rejects(processIntake(s.env, info.uploadId, dependencies)); await assert.rejects(processIntake(s.env, info.uploadId, dependencies)); await processIntake(s.env, info.uploadId, dependencies);
  assert.equal(s.objects.size, 2); assert.equal(s.db.prepare('SELECT state FROM intake_submissions').get().state, 'needs_review'); assert.equal(notified, 1);
});
test('email retry does not repeat AI analysis', async () => {
  const s = setup(); const info = await s.start(); await s.upload(info, 1); await s.complete(info); let analyses = 0;
  await assert.rejects(processIntake(s.env, info.uploadId, { analyze: async () => { analyses++; return sample(); }, mail: async () => { throw Error('delivery failed'); } }));
  await processIntake(s.env, info.uploadId, { analyze: async () => { analyses++; return sample(); }, mail: async () => {} }); assert.equal(analyses, 1);
});
test('recovery requeues saved work and deletes abandoned uploads', async () => {
  const s = setup(); const first = await s.start(); await s.upload(first, 1); await s.complete(first); const second = await s.start(); await s.upload(second, 1);
  s.db.prepare('UPDATE intake_submissions SET updated_at=? WHERE upload_id=?').run(now() - 300, first.uploadId);
  s.db.prepare('UPDATE intake_submissions SET created_at=? WHERE upload_id=?').run(now() - 90000, second.uploadId);
  await recoverIntake(s.env); assert.equal(s.objects.size, 2); assert.ok(s.messages.some(m => m.uploadId === first.uploadId)); assert.equal(s.db.prepare('SELECT COUNT(*) AS n FROM intake_submissions').get().n, 1);
});
test('schema rejects out-of-range photo references and malformed AI decisions', () => {
  assert.equal(validateAssessment(sample(), 1).approximate_item_count, 1);
  const bad = sample(); bad.items[0].photo_numbers = [2]; assert.throws(() => validateAssessment(bad, 1)); bad.items[0].recommendation = 'approved'; assert.throws(() => validateAssessment(bad, 30));
});
test('AI request omits contact fields, keeps credentials server-side, and disables stored responses', async () => {
  const s = setup(); const info = await s.start(); await s.upload(info, 1); let payload;
  const result = await analyzeSubmission({ ...s.env, OPENAI_API_KEY: 'test-secret' }, { notes: 'A chair', name: 'Mary', email: 'mary@example.com' }, s.db.prepare('SELECT * FROM intake_photos').all(), async (url, options) => { assert.equal(url, 'https://api.openai.com/v1/responses'); assert.equal(options.headers.Authorization, 'Bearer test-secret'); payload = JSON.parse(options.body); return Response.json({ status: 'completed', output: [{ content: [{ type: 'output_text', text: JSON.stringify(sample()) }] }] }); });
  assert.equal(result.approximate_item_count, 1); assert.equal(payload.store, false); assert.equal(payload.text.format.strict, true); assert.ok(!JSON.stringify(payload).includes('mary@example.com')); assert.match(payload.instructions, /never instructions/);
});
test('oversized streaming bodies without Content-Length are bounded', async () => {
  await assert.rejects(readBoundedBody(new Response(new ReadableStream({ start(c) { c.enqueue(new Uint8Array(11)); c.close(); } })), 10));
});

test('email contains screening notes, contact, all numbered photos and a reply-to address', async () => {
  const s = setup(); const info = await s.start(30); for (let i = 1; i <= 30; i++) await s.upload(info, i);
  const row = s.db.prepare('SELECT * FROM intake_submissions').get(); row.notes = '<img src=x onerror=alert(1)>';
  await sendReviewEmail(s.env, row, sample());
  const email = s.emails[0]; assert.equal(email.to, 'connorcr37+cpcs@gmail.com'); assert.equal(email.replyTo, 'mary@example.com'); assert.equal(email.attachments.length, 30);
  for (let index = 0; index < email.attachments.length; index++) {
    const attachment = email.attachments[index];
    assert.ok(attachment.content instanceof Uint8Array);
    assert.deepEqual(attachment.content, s.objects.get(`${info.uploadId}/${index + 1}-email.jpg`));
    assert.deepEqual([...attachment.content.slice(0, 3)], [255, 216, 255]);
    assert.ok(email.html.includes(`cid:${attachment.contentId}`));
  }
  assert.match(email.html, /Watch:/); assert.match(email.html, /To ask the customer/); assert.match(email.html, /Reply draft/); assert.match(email.html, /cid:photo-30@changing-places/); assert.match(email.html, /&lt;img/); assert.ok(!email.html.includes('<img src=x')); assert.ok(!email.html.includes('intake-review'));
});
test('a shared photo sits beside each associated item, with other views retained', () => {
  const assessment = sample();
  assessment.items.push({ ...sample().items[0], item: 'Table', photo_numbers: [1, 2], recommendation: 'likely_decline' });
  const attachments = [1, 2, 3].map(i => ({ contentId: `photo-${i}`, content: new Uint8Array() }));
  const email = buildReviewEmail({}, { id: 1, name: 'Mary', photo_count: 3 }, assessment, attachments);
  for (let i = 1; i <= 3; i++) assert.equal(email.html.split(`src="cid:photo-${i}"`).length - 1, 1);
  assert.match(email.html, /Chair/); assert.match(email.html, /Table/);
  assert.match(email.html, /aria-label="Likely no"/);
  assert.ok(!email.html.includes('●</span> Likely'));
});
test('email payload for 30 maximum-size previews remains below the sending limit', () => {
  const content = Buffer.alloc(100000).toString('base64');
  const attachments = Array.from({ length: 30 }, (_, i) => ({ content, filename: `photo-${i}.jpg`, type: 'image/jpeg', disposition: 'inline', contentId: `photo-${i}` }));
  const email = buildReviewEmail({}, { id: 1, name: 'Mary', photo_count: 30 }, sample(), attachments);
  assert.ok(Buffer.byteLength(JSON.stringify(email)) < 4.5 * 1024 * 1024);
});
test('preview upload limits reject oversized images and replaced photo slots', async () => {
  const s = setup(); const info = await s.start(); await s.upload(info, 1);
  const make = (length, valid = true) => { const bytes = new Uint8Array(length); if (valid) bytes.set([255,216,255]); const body = new FormData(); body.append('photo', new Blob([bytes], { type: 'image/jpeg' }), 'photo.jpg'); body.append('preview', new Blob([bytes], { type: 'image/jpeg' }), 'preview.jpg'); return body; };
  const auth = { Authorization: `Bearer ${info.uploadToken}` }, path = `/submissions/${info.uploadId}/photos/1`;
  assert.equal((await s.request(path, 'PUT', make(121), auth)).status, 409);
  assert.equal((await s.request(path, 'PUT', make(100001), auth)).status, 413);
  assert.equal((await s.request(path, 'PUT', make(120, false), auth)).status, 415);
  assert.equal((await s.upload(info, 31)).status, 409);
});

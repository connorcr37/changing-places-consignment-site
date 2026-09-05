import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { handleIntake, hash, processIntake, recoverIntake } from '../worker/intake.mjs';
import { buildReviewEmail, sendReviewEmail } from '../worker/intake-email.mjs';
import { analyzeSubmission, assessmentSchema, readBoundedBody, validateAssessment } from '../worker/intake-ai.mjs';

const origin = 'https://changing-places-dsm.com';
const now = () => Math.floor(Date.now() / 1000);
const sample = () => ({ approximate_item_count: 1, overview: 'One chair in two views.', grouping_uncertainty: '', items: [{ item: 'Chair', quantity: 1, category: 'Seating', likely_brand: 'Unknown / label needed', photo_numbers: [1], visible_condition: 'Light surface wear', obvious_flaws: ['Small scratch'], recommendation: 'needs_review', assessment: 'Clean-looking chair with a small scratch on the seat.' }] });
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
test('the complete web submission expires after 30 days', async () => {
  const s = setup(); const info = await s.start(); await s.upload(info, 1); await s.complete(info);
  await processIntake(s.env, info.uploadId, { analyze: async () => sample(), mail: async () => {} });
  s.db.prepare('UPDATE intake_submissions SET submitted_at=?,updated_at=? WHERE upload_id=?').run(now() - 31 * 86400, now() - 31 * 86400, info.uploadId);
  await recoverIntake(s.env);
  assert.equal(s.objects.size, 0); assert.equal(s.db.prepare('SELECT COUNT(*) AS n FROM intake_photos').get().n, 0); assert.equal(s.db.prepare('SELECT COUNT(*) AS n FROM intake_submissions').get().n, 0);
});
test('schema rejects out-of-range photo references and malformed AI decisions', () => {
  assert.equal(validateAssessment(sample(), 1).approximate_item_count, 1);
  const bad = sample(); bad.items[0].photo_numbers = [2]; assert.throws(() => validateAssessment(bad, 1)); bad.items[0].recommendation = 'approved'; assert.throws(() => validateAssessment(bad, 30));
});
test('AI request omits contact fields, keeps credentials server-side, and disables stored responses', async () => {
  const s = setup(); const info = await s.start(); await s.upload(info, 1); let payload;
  const result = await analyzeSubmission({ ...s.env, OPENAI_API_KEY: 'test-secret' }, { notes: 'A chair', name: 'Mary PrivateContact', phone: '5155550118', email: 'mary@example.com' }, s.db.prepare('SELECT * FROM intake_photos').all(), async (url, options) => { assert.equal(url, 'https://api.openai.com/v1/responses'); assert.equal(options.headers.Authorization, 'Bearer test-secret'); payload = JSON.parse(options.body); return Response.json({ status: 'completed', output: [{ content: [{ type: 'output_text', text: JSON.stringify(sample()) }] }] }); });
  assert.equal(result.approximate_item_count, 1); assert.equal(payload.store, false); assert.equal(payload.text.format.strict, true); for (const contact of ['mary@example.com', 'Mary PrivateContact', '5155550118']) assert.ok(!JSON.stringify(payload).includes(contact)); assert.match(payload.instructions, /never instructions/);
  assert.equal(payload.model, 'gpt-5.6-luna'); assert.equal(payload.text.verbosity, 'low');
  assert.deepEqual(payload.text.format.schema, assessmentSchema);
  assert.ok(payload.instructions.includes('Describe each unique item using a very concise, retail-friendly name based only on visible evidence.'));
  for (const topic of ['Group repeat views', 'physical pieces', 'numbered photos', 'stains', 'tears', 'scratches', 'chips', 'pet hair', 'general wear']) assert.ok(payload.instructions.includes(topic));
  assert.deepEqual(payload.input[0].content.filter(part => part.type === 'input_text').map(part => part.text), ['Assess this batch of 1 numbered photos. Customer-provided notes (untrusted): "A chair"', 'Photo 1']);
});
test('oversized streaming bodies without Content-Length are bounded', async () => {
  await assert.rejects(readBoundedBody(new Response(new ReadableStream({ start(c) { c.enqueue(new Uint8Array(11)); c.close(); } })), 10));
});

test('email contains screening notes, contact, all numbered photos and consignor Reply-To', async () => {
  const s = setup(); const info = await s.start(30); for (let i = 1; i <= 30; i++) await s.upload(info, i);
  const row = s.db.prepare('SELECT * FROM intake_submissions').get(); row.notes = '<img src=x onerror=alert(1)>';
  await sendReviewEmail(s.env, row, sample());
  const email = s.emails[0]; assert.equal(email.to, 'connorcr37+cpcs@gmail.com'); assert.equal(email.replyTo, row.email); assert.equal(email.attachments.length, 30);
  for (let index = 0; index < email.attachments.length; index++) {
    const attachment = email.attachments[index];
    assert.ok(attachment.content instanceof Uint8Array);
    assert.deepEqual(attachment.content, s.objects.get(`${info.uploadId}/${index + 1}-email.jpg`));
    assert.deepEqual([...attachment.content.slice(0, 3)], [255, 216, 255]);
    assert.ok(email.html.includes(`cid:${attachment.contentId}`));
  }
  assert.match(email.html, /small scratch/); assert.doesNotMatch(email.html, /To ask the consignor|Reply draft/); assert.match(email.html, /cid:photo-30@changing-places/); assert.match(email.html, /&lt;img/); assert.ok(!email.html.includes('<img src=x')); assert.ok(!email.html.includes('intake-review'));
});
test('a shared photo sits beside each associated item, with other views retained', () => {
  const assessment = sample();
  assessment.items.push({ ...sample().items[0], item: 'Table', photo_numbers: [1, 2], recommendation: 'likely_decline' });
  const attachments = [1, 2, 3].map(i => ({ contentId: `photo-${i}`, content: new Uint8Array() }));
  const email = buildReviewEmail({}, { id: 1, name: 'Mary', photo_count: 3 }, assessment, attachments);
  for (let i = 1; i <= 3; i++) assert.equal(email.html.split(`src="cid:photo-${i}"`).length - 1, 1);
  assert.match(email.html, /Chair/); assert.match(email.html, /Table/);
  assert.match(email.html, /aria-label="Unlikely fit"/);
  assert.ok(!email.html.includes('●</span> Likely'));
});
test('strict assessment excludes pricing, follow-ups and draft fields', () => {
  for (const [scope, key] of [['item', 'pricing'], ['item', 'information_needed'], ['root', 'information_needed'], ['root', 'suggested_response']]) {
    const value = sample(); (scope === 'item' ? value.items[0] : value)[key] = 'unused';
    assert.throws(() => validateAssessment(value, 1), /invalid_assessment/);
  }
  const value = sample(); value.items[0].assessment = Array(23).fill('word').join(' ');
  assert.throws(() => validateAssessment(value, 1), /screening_text_too_long/);
});
test('physical-piece counts sum groups without counting repeated photo references', () => {
  const value = sample(); value.approximate_item_count = 99;
  value.items[0] = { ...value.items[0], item: 'Dining set', quantity: 7, photo_numbers: [1, 2, 3] };
  value.items.push({ ...sample().items[0], item: 'Sofa', photo_numbers: [4, 5] });
  assert.equal(validateAssessment(value, 5).approximate_item_count, 8);
});
test('email ignores legacy pricing, questions and drafts and preserves Reply-To', () => {
  const value = sample(), row = { id: 4, name: 'Mary Smith', phone: '5155550118', email: 'connorcr37+cpcs@gmail.com', notes: 'My notes', photo_count: 1 };
  value.items[0].pricing = { evidence: 'sufficient', comparable_new: { low: 400, high: 800 }, used_resale: { low: 100, high: 300 } };
  value.information_needed = ['Legacy question?']; value.suggested_response = 'Legacy reply draft';
  for (const assessment of [value, null]) {
    const email = buildReviewEmail({}, row, assessment, []);
    assert.equal(email.replyTo, row.email);
    for (const output of [email.html, email.text]) for (const omitted of ['To ask the consignor', 'Reply draft', 'Legacy question', 'Legacy reply', 'mailto:', 'Email with suggested reply', 'Write my own email', 'Comparable new', 'Used resale', '$400']) assert.ok(!output.includes(omitted));
  }
  for (const invalid of ['', 'mary@example.com\\r\\nBcc:bad@example.com', 'mary@example.com,other@example.com']) {
    assert.ok(!Object.hasOwn(buildReviewEmail({}, { ...row, email: invalid }, value, []), 'replyTo'));
  }
});
test('email header shows contact details and the actual submission time in Central Time', () => {
  const row={id:4,name:'Mary Smith',phone:'5155550118',email:'mary@example.com',photo_count:1,submitted_at:Date.parse('2026-09-05T15:14:00Z')/1000};
  const email=buildReviewEmail({},row,sample(),[]);
  for (const body of [email.html,email.text]) {
    assert.match(body,/515-555-0118 · mary@example.com/);
    assert.match(body,/Submitted September 5 at 10:14 AM CT/);
    assert.match(body,/PRELIMINARY PHOTO REVIEW/);
    assert.match(body,/AI-assisted guidance based on submitted photos\. Staff makes the final decision\./);
    assert.ok(body.indexOf('Submitted September')<body.indexOf('PRELIMINARY PHOTO REVIEW'));
    assert.ok(body.indexOf('PRELIMINARY PHOTO REVIEW')<body.indexOf('Approximately 1 items'));
    assert.ok(body.indexOf('Mary Smith')<body.indexOf('515-555-0118'));
    assert.ok(body.indexOf('mary@example.com')<body.indexOf('Submitted September'));
  }
  const winter=buildReviewEmail({}, {...row,submitted_at:Date.parse('2026-12-05T16:14:00Z')/1000,phone:''},sample(),[]);
  assert.match(winter.text,/Submitted December 5 at 10:14 AM CT/);
  assert.ok(winter.text.startsWith('Mary Smith\nmary@example.com\nSubmitted'));
  const phoneOnly=buildReviewEmail({}, {...row,email:''},sample(),[]);
  for (const body of [phoneOnly.html,phoneOnly.text]) assert.match(body,/515-555-0118 · No email provided/);
  assert.ok(!Object.hasOwn(phoneOnly,'replyTo'));
});
test('email payload for 30 maximum-size previews remains below the sending limit', () => {
  const content = Buffer.alloc(100000).toString('base64');
  const attachments = Array.from({ length: 30 }, (_, i) => ({ content, filename: `photo-${i}.jpg`, type: 'image/jpeg', disposition: 'inline', contentId: `photo-${i}` }));
  const email = buildReviewEmail({}, { id: 1, name: 'Mary', photo_count: 30 }, sample(), attachments);
  assert.ok(Buffer.byteLength(JSON.stringify(email)) < 4.5 * 1024 * 1024);
});
test('action panel follows the last photo and switches to phone instructions without email', () => {
  const row = { id: 1, name: 'Mary Smith', phone: '5155550118', email: 'mary@example.com', photo_count: 2 };
  const attachments = [1, 2].map(i => ({ contentId: `photo-${i}` }));
  for (const email of [row.email, '']) {
    const message = buildReviewEmail({}, { ...row, email }, sample(), attachments);
    const expected = email ? 'Reply to this email to contact Mary directly.' : 'No email was provided. Call or text Mary at 515-555-0118.';
    for (const body of [message.html, message.text]) {
      assert.ok(body.includes(expected));
      assert.equal(body.split('Ready to follow up?').length - 1, 1);
    }
    assert.ok(message.html.indexOf('Ready to follow up?') > message.html.lastIndexOf('<img '));
    assert.match(message.html, /background:#f1f3ec;padding:16px/);
  }
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

// Run with Playwright installed or its package directory supplied through NODE_PATH.
// Uses a loopback server and mocked API only; never sends submissions or email.
const { chromium } = require('playwright');
const { createServer } = require('node:http');
const { readFile } = require('node:fs/promises');
const { readFileSync } = require('node:fs');
const { resolve, extname } = require('node:path');
const assert = require('node:assert/strict');
const root = resolve(__dirname, '..');
const policies = [];
let headerPattern = '';
for (const line of readFileSync(resolve(root, '_headers'), 'utf8').split(/\r?\n/)) {
  if (line.startsWith('/')) headerPattern = line.trim();
  if (line.trim().startsWith('Content-Security-Policy:')) policies.push({ pattern: headerPattern, value: line.trim().slice('Content-Security-Policy:'.length).trim() });
}
const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.jpg': 'image/jpeg', '.woff2': 'font/woff2' };
const server = createServer(async (req, res) => {
  const path = new URL(req.url, 'http://localhost').pathname;
  if (!/^\/(submit-items\.html|text-consignor\.(html|js|css)|intake-[\w-]+\.js|intake\.css|styles\.css|vendor\/[\w/.-]+|images\/[\w/.-]+|fonts\/[\w/.-]+)$/.test(path) || path.includes('..')) { res.writeHead(404).end(); return; }
  if (path.endsWith('.html')) res.setHeader('Content-Security-Policy', policies.filter(p => p.pattern.endsWith('*') && path.startsWith(p.pattern.slice(0, -1))).map(p => p.value));
  try { res.setHeader('Content-Type', types[extname(path)] || 'application/octet-stream'); res.end(await readFile(resolve(root, '.' + path))); }
  catch { res.writeHead(404).end(); }
});
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ headless: true });
  try {
    const origin = `http://127.0.0.1:${server.address().port}`;
    const loading = await browser.newPage();
    let releaseScript;
    const scriptGate = new Promise(resolve => { releaseScript = resolve; });
    await loading.route('**/intake-form.js*', async route => { await scriptGate; await route.continue(); });
    await loading.route('**/api/intake/config', route => route.fulfill({ json: { enabled: true, maxPhotos: 30 } }));
    await loading.goto(origin + '/submit-items.html', { waitUntil: 'commit' });
    try {
      assert.equal(await loading.locator('#submit-button').isDisabled(), true, 'Do not submit before initialization');
      assert.equal(await loading.locator('#photo-input').isDisabled(), true, 'Do not lose photos selected before event handlers load');
    } finally { releaseScript(); }
    await loading.waitForFunction(() => !document.getElementById('submit-button').disabled);
    assert.equal(await loading.locator('#photo-input').isDisabled(), false);
    await loading.close();
    const bytes = await readFile(resolve(root, 'images/banner.jpg'));
    const uploadFile = name => ({ name, mimeType: 'image/jpeg', buffer: bytes });
    const setup = async (width, failure) => {
      const page = await browser.newPage({ viewport: { width, height: 850 } });
      const calls = { starts: [], uploads: 0, completes: 0 };
      const violations = [];
      page.on('console', message => { if (/violates.*Content Security Policy|Refused to/.test(message.text())) violations.push(message.text()); });
      await page.route('**/api/intake/**', async route => {
        const path = new URL(route.request().url()).pathname;
        const json = data => route.fulfill({ json: data });
        if (path.endsWith('/config')) return json({ enabled: true, maxPhotos: 30 });
        if (path.endsWith('/submissions')) {
          calls.starts.push(route.request().postDataJSON());
          if (failure === 'limited') return route.fulfill({ status: 429, json: { error: 'Please try again later.', retryAt: Math.floor(Date.now() / 1000) + 1800 } });
          return json({ uploadId: calls.starts.at(-1).uploadId });
        }
        if (path.includes('/photos/')) {
          calls.uploads++;
          if (failure === 'oversize') return route.fulfill({ status: 413, json: { error: 'Photo too large.' } });
          return json({ ok: true });
        }
        calls.completes++;
        if (failure === 'connection' && calls.completes === 1) return route.abort();
        return json({ received: true });
      });
      await page.goto(origin + '/submit-items.html');
      await page.waitForFunction(() => !document.getElementById('submit-button').disabled);
      await page.locator('#customer-name').fill('Mary Smith');
      await page.locator('#customer-phone').fill('5155550118');
      await page.locator('#consent').check();
      return { page, calls, violations };
    };
    const { page, calls } = await setup(390, 'connection');
    await page.locator('#photo-input').setInputFiles([uploadFile('sofa.jpg'), uploadFile('detail.jpg')]);
    await page.waitForFunction(() => document.getElementById('photo-count').textContent === '2 of 30 photos');
    assert.equal(await page.locator('.photo-preview img').evaluateAll(images => images.filter(i => i.complete && i.naturalWidth).length), 2);
    const size = await page.locator('.photo-preview img').first().boundingBox();
    assert.ok(Math.abs(size.width - size.height) < 2, 'Mobile photo thumbnails should be square');
    await page.locator('#customer-phone').fill('123');
    await page.locator('#submit-button').click();
    assert.match(await page.locator('#form-error').textContent(), /phone number/);
    assert.equal(calls.starts.length, 0);
    await page.locator('#customer-phone').fill('5155550118');
    await page.locator('#submit-button').click();
    await page.waitForFunction(() => document.getElementById('submit-button').textContent.includes('Retry'));
    assert.equal(calls.uploads, 2);
    assert.equal(await page.locator('#customer-name').isDisabled(), true);
    await page.locator('#submit-button').click();
    await page.locator('#intake-success').waitFor({ state: 'visible' });
    assert.equal(calls.uploads, 2, 'Retry must not resend uploaded photos');
    assert.equal(calls.starts[0].uploadId, calls.starts[1].uploadId, 'Retry must preserve the submission');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.close();
    const oversize = await setup(1280, 'oversize');
    await oversize.page.locator('#photo-input').setInputFiles(uploadFile('sofa.jpg'));
    await oversize.page.waitForFunction(() => document.getElementById('photo-count').textContent === '1 of 30 photos');
    await oversize.page.locator('#submit-button').click();
    await oversize.page.locator('#form-error').waitFor({ state: 'visible' });
    assert.equal(await oversize.page.locator('#customer-name').isDisabled(), false);
    await oversize.page.getByRole('button', { name: 'Remove photo 1: sofa.jpg', exact: true }).click();
    assert.equal(await oversize.page.locator('.photo-preview').count(), 0);
    await oversize.page.close();
    const batch = await setup(390);
    await batch.page.locator('#photo-input').setInputFiles(Array.from({ length: 31 }, (_, i) => uploadFile(`photo-${i}.jpg`)));
    await batch.page.waitForFunction(() => !document.getElementById('photo-fields').disabled, null, { timeout: 30000 });
    assert.equal(await batch.page.locator('.photo-preview').count(), 30);
    assert.match(await batch.page.locator('#photo-error').textContent(), /Extra photos were not added/);
    await batch.page.locator('#clear-photos').click();
    assert.equal(await batch.page.locator('.photo-preview').count(), 0);
    await batch.page.close();
    const compression = await setup(390);
    const preparedUploads = [];
    await compression.page.route('**/api/intake/submissions/*/photos/*', async route => {
      const request = route.request();
      const form = await new Response(request.postDataBuffer(), { headers: { 'Content-Type': request.headers()['content-type'] } }).formData();
      preparedUploads.push({ photo: form.get('photo').size, preview: form.get('preview').size });
      await route.fulfill({ json: { ok: true } });
    });
    const detailedBytes = await compression.page.evaluate(async () => {
      const tile = document.createElement('canvas'); tile.width = tile.height = 256;
      const context = tile.getContext('2d'), pixels = context.createImageData(256, 256);
      let seed = 1;
      for (let i = 0; i < pixels.data.length; i += 4) {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        pixels.data[i] = seed & 255; pixels.data[i + 1] = (seed >>> 8) & 255; pixels.data[i + 2] = (seed >>> 16) & 255; pixels.data[i + 3] = 255;
      }
      context.putImageData(pixels, 0, 0);
      const canvas = document.createElement('canvas'); canvas.width = 3024; canvas.height = 4032;
      const ctx = canvas.getContext('2d');
      for (let y = 0; y < canvas.height; y += 256) for (let x = 0; x < canvas.width; x += 256) ctx.drawImage(tile, x, y);
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', .2));
      return Array.from(new Uint8Array(await blob.arrayBuffer()));
    });
    assert.ok(detailedBytes.length <= 3200000);
    const phoneBytes = Buffer.alloc(3200000); Buffer.from(detailedBytes).copy(phoneBytes);
    await compression.page.locator('#photo-input').setInputFiles({ name: 'IMG_9490.jpeg', mimeType: 'image/jpeg', buffer: phoneBytes });
    await compression.page.waitForFunction(() => !document.getElementById('photo-fields').disabled);
    assert.equal(await compression.page.locator('.photo-preview').count(), 1, 'A detailed 3.2 MB, 12 MP JPEG should be accepted');
    // Simulate a browser encoder exceeding 100 KB at every size tried by the old
    // preview loop, even when quality is reduced. The smaller fallback must work.
    await compression.page.evaluate(() => {
      const encode = HTMLCanvasElement.prototype.toBlob;
      window.photoEncodingMode = 'oversize'; window.photoEncodingAttempts = 0;
      HTMLCanvasElement.prototype.toBlob = function(callback, type, quality) {
        window.photoEncodingAttempts++;
        if (window.photoEncodingMode === 'null') { callback(null); return; }
        const edge = Math.max(this.width, this.height);
        encode.call(this, blob => callback(blob && edge >= 600 && edge <= 1200 ? new Blob([blob, new Uint8Array(100001)], { type: 'image/jpeg' }) : blob), type, quality);
      };
    });
    await compression.page.locator('#photo-input').setInputFiles({ name: 'browser-encoder.jpeg', mimeType: 'image/jpeg', buffer: phoneBytes });
    await compression.page.waitForFunction(() => !document.getElementById('photo-fields').disabled);
    assert.equal(await compression.page.locator('.photo-preview').count(), 2, 'Preview over budget at 600px must shrink further automatically');
    const fallbackSize = await compression.page.locator('.photo-preview img').last().evaluate(img => Math.max(img.naturalWidth, img.naturalHeight));
    assert.ok(fallbackSize > 0 && fallbackSize < 600);
    await compression.page.evaluate(() => { window.photoEncodingMode = 'null'; window.photoEncodingAttempts = 0; });
    await compression.page.locator('#photo-input').setInputFiles(uploadFile('cannot-encode.jpg'));
    await compression.page.waitForFunction(() => !document.getElementById('photo-fields').disabled);
    assert.equal(await compression.page.locator('.photo-preview').count(), 2);
    assert.match(await compression.page.locator('#photo-error').textContent(), /browser could not prepare this photo/);
    assert.doesNotMatch(await compression.page.locator('#photo-error').textContent(), /smaller/);
    assert.ok(await compression.page.evaluate(() => window.photoEncodingAttempts < 40), 'Failed encoding must stop after bounded retries');
    await compression.page.locator('#submit-button').click();
    await compression.page.locator('#intake-success').waitFor({ state: 'visible' });
    assert.equal(preparedUploads.length, 2);
    for (const upload of preparedUploads) {
      assert.ok(upload.photo > 0 && upload.photo <= 600000);
      assert.ok(upload.preview > 0 && upload.preview <= 100000);
    }
    assert.deepEqual(compression.violations, []);
    await compression.page.close();
    const formats = await setup(390);
    let decoderLoads = 0;
    formats.page.on('request', request => { if (request.url().includes('/vendor/')) decoderLoads++; });
    const fixture = async (filename, mimeType) => ({ name: filename, mimeType, buffer: await readFile(resolve(root, 'tests/fixtures', filename)) });
    await formats.page.locator('#photo-input').setInputFiles([await fixture('phone-rotated.jpg', 'image/jpeg'), await fixture('phone-photo.png', ''), await fixture('phone-photo.webp', 'image/webp')]);
    await formats.page.waitForFunction(() => document.getElementById('photo-count').textContent === '3 of 30 photos');
    assert.equal(decoderLoads, 0, 'Standard photos must not load the HEIC decoder');
    const rotation = await formats.page.locator('.photo-preview img').first().evaluate(img => ({ width: img.naturalWidth, height: img.naturalHeight }));
    assert.equal(rotation.width, 64); assert.equal(rotation.height, 96, 'Phone EXIF rotation must be applied');
    const heic = await fixture('phone-photo.heic', '');
    await formats.page.locator('#photo-input').setInputFiles([heic]);
    await formats.page.waitForFunction(() => document.getElementById('photo-count').textContent === '4 of 30 photos', null, { timeout: 60000 });
    assert.equal(decoderLoads, 1);
    assert.equal(await formats.page.locator('.photo-preview img').evaluateAll(images => images.filter(i => i.complete && i.naturalWidth).length), 4);
    assert.deepEqual(formats.violations, [], 'Conversion must obey the production CSP');
    if (process.env.INTAKE_PHONE_PHOTO) {
      await formats.page.locator('#photo-input').setInputFiles(process.env.INTAKE_PHONE_PHOTO);
      await formats.page.waitForFunction(() => document.getElementById('photo-count').textContent === '5 of 30 photos', null, { timeout: 60000 });
      const dimensions = await formats.page.locator('.photo-preview img').last().evaluate(img => [img.naturalWidth, img.naturalHeight]);
      assert.ok(Math.max(...dimensions) <= 1200 && Math.min(...dimensions) > 0);
      await formats.page.locator('.photo-preview button').last().click();
    }
    await formats.page.locator('#photo-input').setInputFiles({ name: 'broken.heic', mimeType: 'image/heic', buffer: heic.buffer.subarray(0, 64) });
    await formats.page.waitForFunction(() => !document.getElementById('photo-fields').disabled);
    assert.equal(await formats.page.locator('.photo-preview').count(), 4);
    assert.match(await formats.page.locator('#photo-error').textContent(), /could not be opened/);
    await formats.page.locator('#clear-photos').click();
    await formats.page.locator('#photo-input').setInputFiles(Array.from({ length: 30 }, (_, i) => ({ ...heic, name: `phone-${i}.heic` })));
    await formats.page.waitForFunction(() => document.getElementById('photo-count').textContent === '30 of 30 photos', null, { timeout: 60000 });
    await formats.page.locator('#submit-button').click();
    await formats.page.locator('#intake-success').waitFor({ state: 'visible' });
    assert.equal(formats.calls.uploads, 30);
    await formats.page.close();
    const limited = await setup(390, 'limited');
    await limited.page.locator('#photo-input').setInputFiles(uploadFile('sofa.jpg'));
    await limited.page.waitForFunction(() => document.getElementById('photo-count').textContent === '1 of 30 photos');
    await limited.page.locator('#submit-button').click();
    await limited.page.locator('#form-error').waitFor({ state: 'visible' });
    assert.match(await limited.page.locator('#form-error').textContent(), /try again after/);
    assert.equal(await limited.page.locator('#customer-name').isDisabled(), false);
    assert.equal(await limited.page.locator('.photo-preview').count(), 1);
    assert.equal(await limited.page.locator('a[href="sms:6202558901"]').count(), 1);
    await limited.page.close();
    const texting = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const requests = [];
    texting.on('request', request => requests.push(request.url()));
    await texting.goto(origin + '/text-consignor.html#phone=%2B15155550118');
    await texting.locator('#text-contact').waitFor({ state: 'visible' });
    assert.equal(await texting.locator('#text-number').textContent(), '515-555-0118');
    assert.equal(await texting.locator('#open-message').getAttribute('href'), 'sms:+15155550118');
    assert.equal(new URL(texting.url()).hash, '', 'Remove phone from browser history');
    assert.ok(requests.every(url => !url.includes('5155550118') && url.startsWith(origin)), 'No contact data or external requests');
    assert.equal(await texting.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    for (const fragment of ['', '#phone=javascript%3Aalert(1)', '#phone=%2B15155550118%3Fbody%3Dprivate', '#phone=%3Cimg%20src%3Dx%3E']) {
      await texting.goto(origin + '/text-consignor.html' + fragment);
      await texting.waitForFunction(() => document.readyState === 'complete' && !location.hash);
      assert.equal(await texting.locator('#text-contact').isVisible(), false);
      assert.equal(await texting.locator('#text-error').isVisible(), true);
      assert.equal(await texting.locator('#open-message').getAttribute('href'), null);
    }
    await texting.close();
    console.log('Texting page checks passed: validated SMS target, no automatic launch, no contact data in requests/history, and safe invalid-link recovery.');
    console.log('Browser checks passed: mobile previews, retry/recovery, limits, detailed 3.2 MB phone photo, oversized-preview fallback, bounded encoding failure, mixed phone formats, EXIF orientation, lazy HEIC conversion under production CSP, damaged HEIC recovery, and 30 HEIC uploads.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => server.close());

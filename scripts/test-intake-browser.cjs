// Run with Playwright installed or its package directory supplied through NODE_PATH.
// Uses a loopback server and mocked API only; never sends submissions or email.
const { chromium } = require('playwright');
const { createServer } = require('node:http');
const { readFile } = require('node:fs/promises');
const { readFileSync } = require('node:fs');
const { resolve, extname } = require('node:path');
const assert = require('node:assert/strict');
const root = resolve(__dirname, '..');
const policies = readFileSync(resolve(root, '_headers'), 'utf8').split(/\r?\n/).filter(line => line.trim().startsWith('Content-Security-Policy:')).map(line => line.trim().slice('Content-Security-Policy:'.length).trim());
const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.jpg': 'image/jpeg', '.woff2': 'font/woff2' };
const server = createServer(async (req, res) => {
  const path = new URL(req.url, 'http://localhost').pathname;
  if (!/^\/(submit-items\.html|intake-[\w-]+\.js|intake\.css|styles\.css|vendor\/[\w/.-]+|images\/[\w/.-]+|fonts\/[\w/.-]+)$/.test(path) || path.includes('..')) { res.writeHead(404).end(); return; }
  if (path.endsWith('.html')) res.setHeader('Content-Security-Policy', policies);
  try { res.setHeader('Content-Type', types[extname(path)] || 'application/octet-stream'); res.end(await readFile(resolve(root, '.' + path))); }
  catch { res.writeHead(404).end(); }
});
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ headless: true });
  try {
    const origin = `http://127.0.0.1:${server.address().port}`;
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
    console.log('Browser checks passed: mobile previews, retry/recovery, limits, mixed phone formats, EXIF orientation, lazy HEIC conversion under production CSP, damaged HEIC recovery, and 30 HEIC uploads.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => server.close());

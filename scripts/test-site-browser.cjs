// Run with Playwright installed or its package directory supplied through NODE_PATH.
// Loopback only; external resources and APIs are mocked. SITE_TEST_ORIGIN can point
// to a local Wrangler server to verify its real static-asset/404 routing as well.
const { chromium } = require('playwright');
const { createServer } = require('node:http');
const { readFile, readdir } = require('node:fs/promises');
const { resolve, extname } = require('node:path');
const assert = require('node:assert/strict');
const root = resolve(__dirname, '..');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.jpg': 'image/jpeg', '.png': 'image/png', '.woff2': 'font/woff2', '.avif': 'image/avif', '.webp': 'image/webp' };
const server = createServer(async (req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  if (!/^\/[\w/.-]*$/.test(pathname) || pathname.includes('..')) return res.writeHead(404).end();
  const name = pathname === '/' ? '/index.html' : extname(pathname) ? pathname : pathname + '.html';
  try {
    const body = await readFile(resolve(root, '.' + name));
    res.setHeader('Content-Type', types[extname(name)] || 'application/octet-stream');
    res.end(body);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/html' });
    res.end(await readFile(resolve(root, '404.html')));
  }
});

(async () => {
  await new Promise(done => server.listen(0, '127.0.0.1', done));
  const origin = process.env.SITE_TEST_ORIGIN || `http://127.0.0.1:${server.address().port}`;
  assert.match(origin, /^http:\/\/(127\.0\.0\.1|localhost):\d+$/);
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext();
    await context.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.origin !== origin) return route.abort();
      if (url.pathname.startsWith('/api/')) return route.fulfill({ status: 503, json: {} });
      return route.continue();
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const checkReplayHints = async () => {
      for (const link of await page.locator('.facebook-card__link').all()) {
        const hint = link.locator('.visually-hidden');
        const style = await hint.evaluate(el => {
          const css = getComputedStyle(el);
          const bounds = el.getBoundingClientRect();
          return { position: css.position, width: bounds.width, height: bounds.height, clipPath: css.clipPath };
        });
        assert.equal(style.position, 'absolute', 'Replay accessibility hints must not occupy card layout');
        assert.ok(style.width <= 1 && style.height <= 1, 'Replay hints must be visually clipped');
        assert.equal(style.clipPath, 'inset(50%)');
        assert.match(await link.ariaSnapshot(), /on Facebook; opens in a new tab/, 'Keep the hint accessible');
      }
    };
    const checkNames = async () => {
      const mismatches = await page.locator('a[aria-label], button[aria-label]').evaluateAll(elements => {
        const normalize = s => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
        return elements.flatMap(element => {
          if (!element.getClientRects().length) return [];
          const clone = element.cloneNode(true);
          clone.querySelectorAll('[aria-hidden="true"], .visually-hidden, svg').forEach(n => n.remove());
          const visible = normalize(clone.textContent);
          const name = normalize(element.getAttribute('aria-label'));
          return visible && !name.includes(visible) ? [{ visible, name }] : [];
        });
      });
      assert.deepEqual(mismatches, [], 'Accessible names must contain visible control text');
    };
    for (const name of (await readdir(root)).filter(n => n.endsWith('.html'))) {
      await page.goto(origin + '/' + name);
      await checkNames();
    }
    await page.goto(origin + '/');
    await checkReplayHints();
    for (const link of await page.locator('.facebook-card__link').all()) {
      const title = await link.locator('.facebook-card__title').innerText();
      assert.equal(await page.getByRole('link', { name: new RegExp(title) }).count(), 1);
    }
    // Exercise generated cards, including the visible duration and weekday.
    await page.route('**/api/facebook-live', route => route.fulfill({ json: { videos: [
      { id: '123456789', permalinkUrl: 'https://www.facebook.com/watch/?v=123456789', thumbnailUrl: 'https://example.fbcdn.net/replay.jpg', createdTime: new Date().toISOString(), durationSeconds: 754 },
    ] } }));
    await page.route('https://example.fbcdn.net/replay.jpg', async route => route.fulfill({ contentType: 'image/jpeg', body: await readFile(resolve(root, 'images/logo.jpg')) }));
    await page.reload();
    await page.locator('.facebook-showcase').scrollIntoViewIfNeeded();
    await page.waitForFunction(() => document.querySelector('[data-facebook-video-id="123456789"]'));
    const generated = page.locator('[data-facebook-video-id="123456789"] a');
    assert.match(await generated.ariaSnapshot(), /Replay.*12:34/);
    await checkReplayHints();
    await page.locator('.facebook-showcase').screenshot({ path: resolve(root, 'tmp/feedback-replays-desktop.png') });
    await page.setViewportSize({ width: 390, height: 844 });
    await checkReplayHints();
    await page.locator('.facebook-showcase').screenshot({ path: resolve(root, 'tmp/feedback-replays-mobile.png') });
    await page.setViewportSize({ width: 1280, height: 720 });
    await checkNames();
    await page.unroute('**/api/facebook-live');
    await page.clock.install({ time: new Date('2030-01-01T12:00:00Z') });
    await page.goto(origin + '/');
    await page.locator('.facebook-showcase').scrollIntoViewIfNeeded();
    await page.waitForFunction(() => document.querySelector('.facebook-showcase').dataset.facebookFeedState === 'fallback');
    assert.equal(await page.getByRole('link', { name: /Facebook Browse recent videos/ }).count(), 5);
    await checkNames();
    await page.clock.setFixedTime(new Date());

    for (const pathname of ['/missing-feedback-page', '/missing/nested/page']) {
      const response = await page.goto(origin + pathname);
      assert.equal(response.status(), 404);
      assert.equal(await page.getByRole('heading', { level: 1 }).innerText(), "Let's get you back to the shop.");
      assert.equal(await page.locator('.logo-img').evaluate(img => img.complete && img.naturalWidth > 0), true);
      assert.equal(await page.getByRole('link', { name: 'Back to home', exact: true }).getAttribute('href'), '/');
      assert.ok(await page.locator('.resource-hero').evaluate(el => parseFloat(getComputedStyle(el.querySelector('.container')).paddingTop)) > 0);
      await page.locator('.footer-icon').scrollIntoViewIfNeeded();
      await page.waitForFunction(() => [...document.images].every(img => img.complete && img.naturalWidth > 0));
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => scrollTo(0, 0));
    await page.screenshot({ path: resolve(root, 'tmp/feedback-404-mobile.png'), fullPage: true });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    assert.deepEqual(errors, []);
    await context.close();

    if (process.env.SITE_TEST_SKIP_GAME) {
      console.log('Site page checks passed: accessible labels, generated/stale feed, nested 404 routing and mobile layout.');
      return;
    }

    for (const storageMode of ['getter', 'read', 'write', 'invalid', 'normal']) {
      const gameContext = await browser.newContext();
      await gameContext.addInitScript(mode => {
        Math.random = () => 0.5;
        if (mode === 'getter') Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('Blocked', 'SecurityError'); } });
        if (mode === 'read') Storage.prototype.getItem = () => { throw new DOMException('Blocked', 'SecurityError'); };
        if (mode === 'write') Storage.prototype.setItem = () => { throw new DOMException('Full', 'QuotaExceededError'); };
        if (mode === 'invalid') localStorage.setItem('couchDashBest', 'Infinity');
      }, storageMode);
      const game = await gameContext.newPage();
      const gameErrors = [];
      game.on('pageerror', error => gameErrors.push(error.message));
      await game.clock.install();
      await game.goto(origin + '/couch-dash.html?test');
      assert.equal(await game.locator('#best').innerText(), '00000');
      const sound = game.locator('#sound-button');
      await sound.focus();
      await game.keyboard.press('Space');
      assert.equal(await sound.innerText(), 'Sound: Off', `${storageMode}: Space activates sound button`);
      assert.equal(await game.locator('#game-message').isVisible(), true, 'Sound button must not start game');
      await game.locator('#start-button').focus();
      await game.keyboard.press('Space');
      assert.equal(await game.locator('#game-message').isVisible(), false);
      assert.equal(await game.locator('#game').evaluate(el => el === document.activeElement), true);
      await game.keyboard.press('p');
      assert.equal(await game.locator('#start-button').innerText(), 'Keep moving');
      await game.locator('#crew-open').focus();
      await game.keyboard.press('Enter');
      await game.keyboard.press('p');
      assert.equal(await game.locator('#game-message').isVisible(), true, 'Modal keys must not resume game');
      await game.keyboard.press('Space');
      assert.equal(await game.locator('#crew-modal').isVisible(), false, 'Space activates modal close');
      assert.equal(await game.locator('#game-message').isVisible(), true);
      await game.locator('#game').focus();
      await game.keyboard.press('Control+p');
      assert.equal(await game.locator('#game-message').isVisible(), true, 'Modified shortcuts are ignored');
      await game.keyboard.press('p');
      assert.equal(await game.locator('#game-message').isVisible(), false);
      await game.locator('.back-link').focus();
      await game.keyboard.press('p');
      assert.equal(await game.locator('#game-message').isVisible(), false, 'Keys outside the game must not pause it');
      await game.locator('[data-test-radio="sunset"]').focus();
      await game.keyboard.press('Enter');
      assert.equal(await sound.innerText(), 'Sound: On', 'Radio changes survive failed storage writes');
      await sound.focus();
      await game.keyboard.press('Enter');
      // Let three deterministic collisions happen, including saving a new best.
      await game.clock.runFor(45000);
      assert.equal(await game.locator('#start-button').innerText(), 'Try again');
      assert.ok(Number(await game.locator('#best').innerText()) > 0);
      await game.locator('#start-button').focus();
      await game.keyboard.press('Enter');
      assert.equal(await game.locator('#game-message').isVisible(), false, 'Can restart after saving a best score');
      assert.deepEqual(gameErrors, [], `${storageMode}: no game errors`);
      console.log(`Game passed: ${storageMode} storage; buttons, modal, shortcuts, game over, restart.`);
      await gameContext.close();
    }
    console.log('Site browser checks passed: visible labels, generated/stale feed, nested 404, mobile layout, storage and keyboard regressions.');
  } finally {
    await browser.close();
    server.close();
  }
})().catch(error => { console.error(error); server.close(); process.exitCode = 1; });

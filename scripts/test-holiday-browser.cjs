// Local-only end-to-end checks using the real Worker handlers and in-memory D1.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const { mkdir } = require('node:fs/promises');

(async () => {
  const { startHolidayTestServer } = await import('./holiday-test-server.mjs');
  const s=await startHolidayTestServer(), browser=await chromium.launch({headless:true});
  try {
    const context=await browser.newContext({viewport:{width:1440,height:1100}});
    await context.route('**/*', route => new URL(route.request().url()).origin === s.origin ? route.continue() : route.abort());
    const page=await context.newPage(), errors=[]; page.on('pageerror',error=>errors.push(error.message));
    await page.goto(s.origin+'/admin'); await page.locator('#login').waitFor({state:'visible'});
    assert.equal(await page.locator('#workspace').isVisible(),false);
    await context.addCookies([s.cookie]); await page.reload(); await page.locator('#workspace').waitFor({state:'visible'});
    await page.locator('#entry-name').fill('Thanksgiving browser check');
    await page.locator('#entry-message').fill('Closed for Thanksgiving.\nSee you Friday! <script>unsafe</script>');
    await page.locator('#starts-at').fill('2099-11-20T09:00'); await page.locator('#ends-at').fill('2099-11-28T18:00');
    await page.locator('.day-date').fill('2099-11-26');
    assert.match(await page.locator('#preview-message').innerText(),/<script>unsafe<\/script>/);
    assert.equal(await page.locator('#preview-banner script').count(),0);
    await page.locator('#save-draft').click(); await page.getByText('Draft saved.',{exact:true}).waitFor();
    assert.match(await page.locator('#entries').innerText(),/Website: Draft/);
    let data=await (await context.request.get(s.origin+'/api/holiday-hours')).json(); assert.equal(data.banners.length,0);
    await page.locator('#publish').click(); await page.getByText('Website: Published. Google updates, when selected, are queued separately.',{exact:true}).waitFor();
    data=await (await context.request.get(s.origin+'/api/holiday-hours')).json(); assert.equal(data.banners.length,1); assert.equal(data.specialHours.length,1);
    await page.locator('#add-date').click(); await page.locator('.day-date').nth(1).fill('2099-11-27');
    await page.locator('.day-mode').nth(1).selectOption('open'); await page.locator('.day-opens').nth(1).fill('10:30'); await page.locator('.day-closes').nth(1).fill('14:00');
    await page.locator('#publish').click(); await page.getByText('Website: Published. Google updates, when selected, are queued separately.',{exact:true}).waitFor();
    await page.waitForFunction(()=>document.getElementById('entry-meta').textContent.includes('Version 3'));
    data=await (await context.request.get(s.origin+'/api/holiday-hours')).json(); assert.equal(data.specialHours[1].opens,'10:30');
    await page.locator('#banner-enabled').uncheck(); assert.equal(await page.locator('#preview-banner').isVisible(),false);
    await page.locator('#banner-enabled').check();
    await page.locator('#animation').selectOption('snow-closure'); await page.locator('#replay-animation').scrollIntoViewIfNeeded();
    await page.locator('#replay-animation').click(); await page.locator('.seasonal-logo-flair').waitFor({state:'visible'});
    await mkdir('tmp',{recursive:true}); await page.screenshot({path:'tmp/holiday-admin-desktop.png',fullPage:true});
    await page.emulateMedia({reducedMotion:'reduce'}); await page.locator('#replay-animation').click();
    assert.equal(await page.locator('.seasonal-logo-flair').count(),0); assert.match(await page.locator('#preview-animation-note').innerText(),/reduced-motion/);
    await page.locator('#invite-email').fill('invited@example.com'); await page.locator('#invite-form button').click();
    await page.getByText('invited@example.com · Invited',{exact:true}).waitFor(); assert.equal(s.emails.length,1);
    page.once('dialog',dialog=>dialog.accept()); await page.locator('.staff-item').filter({hasText:'invited@example.com'}).getByRole('button',{name:'Remove access'}).click();
    await page.getByText('invited@example.com · Access removed',{exact:true}).waitFor();
    await page.setViewportSize({width:390,height:844}); await page.screenshot({path:'tmp/holiday-admin-mobile.png',fullPage:true});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth),true,'Admin must fit mobile width');
    page.once('dialog',dialog=>dialog.accept()); await page.locator('#remove-entry').click(); await page.getByText('Entry removed. Google cleanup is queued if needed.',{exact:true}).waitFor();
    data=await (await context.request.get(s.origin+'/api/holiday-hours')).json(); assert.equal(data.banners.length,0); assert.equal(data.specialHours.length,0);
    await page.locator('#show-removed').check(); await page.getByRole('button',{name:'Restore / edit'}).waitFor();
    // A server-supplied schedule works even with a wildly incorrect client clock.
    const publicPage=await context.newPage(); await publicPage.clock.install({time:new Date('2000-01-01T00:00:00Z')});
    const start=Date.parse('2099-11-20T15:00:00Z');
    await publicPage.route('**/api/holiday-hours',route=>route.fulfill({json:{serverNow:new Date(start-2000).toISOString(),banners:[{id:'boundary',message:'Scheduled snow closure',animation:'snow-closure',startsAt:new Date(start).toISOString(),endsAt:new Date(start+4000).toISOString()}],specialHours:[]}}));
    await publicPage.goto(s.origin); await publicPage.waitForResponse('**/api/holiday-hours');
    assert.equal(await publicPage.locator('[data-holiday-banner]').isVisible(),false);
    await publicPage.clock.fastForward(2100); assert.equal(await publicPage.locator('[data-holiday-banner]').isVisible(),true);
    await publicPage.clock.fastForward(4100); assert.equal(await publicPage.locator('[data-holiday-banner]').isVisible(),false);
    assert.deepEqual(errors,[]); console.log('Holiday browser checks passed: staff auth, draft/publish/edit/remove, hours, preview, snow animation, reduced motion, invitations, mobile layout, server-clock boundaries.');
  } finally {await browser.close();await s.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});

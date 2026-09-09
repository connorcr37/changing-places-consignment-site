export function adminPage(head = false) {
  return new Response(head ? null : `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Admin | Changing Places</title><meta name="robots" content="noindex,nofollow">
  <link rel="icon" href="/images/favicon.ico">
  <link rel="stylesheet" href="/styles.css?v=20260908-1">
  <link rel="stylesheet" href="/admin-hours.css?v=20260908-2">
  <script type="module" src="/admin-hours.js?v=20260908-3"></script>
</head>
<body class="admin-body is-signed-out">
  <a class="skip-link" href="#admin-main">Skip to main content</a>
  <header class="admin-header">
    <a href="/" class="admin-brand"><img src="/images/logo.jpg" width="48" height="48" alt=""><span>Changing Places<small>Admin</small></span></a>
    <div class="admin-actions"><span id="signed-in"></span><button id="logout" type="button" hidden>Sign out</button><a class="website-link" href="/">View website</a></div>
  </header>
  <main id="admin-main" class="admin-main">
    <p id="notice" role="status" aria-live="polite" class="admin-notice" hidden></p>
    <section id="login-panel" class="admin-card login-card" aria-labelledby="login-heading">
      <h1 id="login-heading">Admin sign in</h1>
      <p id="login-help" class="admin-help">Checking sign-in…</p>
      <a id="login" class="button" href="/api/admin/auth/login" hidden>Sign in with Google</a>
      <noscript><p>Enable JavaScript to sign in.</p></noscript>
    </section>
    <div id="workspace" hidden>
      <div class="workspace-heading"><h1>Holiday &amp; special hours</h1><nav aria-label="Admin sections"><a href="#google-settings">Google Business Profile</a><a href="#admin-access">Admin access</a></nav></div>
      <section class="admin-card preview-card" aria-labelledby="preview-heading">
        <div class="admin-section-heading"><div><p class="eyebrow">Live preview</p><h2 id="preview-heading">Banner &amp; logo</h2></div><button id="replay-animation" type="button" disabled>Replay animation</button></div>
        <div class="preview-site">
          <aside class="holiday-banner" id="preview-banner" aria-label="Banner preview" hidden><p id="preview-message"></p></aside>
          <div class="preview-logo"><img class="logo-img" id="preview-logo" src="/images/logo.jpg" alt="Changing Places Consignment Shop" width="120" height="120"><div class="preview-nav" aria-hidden="true"><span>Highlights</span><span>Consign</span><span>FAQ</span><span>About</span><span>Visit</span></div></div>
        </div>
        <div class="preview-caption"><p id="preview-schedule" class="admin-help">Choose an announcement or template to preview. All times are Central.</p><p id="preview-animation-note" class="admin-help" aria-live="polite"></p></div>
      </section>
      <div class="admin-layout">
        <section class="admin-card entry-list" aria-labelledby="announcements-heading">
          <div class="admin-section-heading"><h2 id="announcements-heading">Announcements</h2><button id="new-entry" type="button">New</button></div>
          <div id="entries"></div>
          <label class="admin-check removed-toggle"><input id="show-removed" type="checkbox"> Show removed</label>
        </section>
        <section class="admin-card editor" aria-labelledby="editor-title">
          <div class="admin-section-heading"><div><p id="editor-state" class="eyebrow">Get started</p><h2 id="editor-title">Create an announcement</h2></div><button id="cancel-new" type="button" hidden>Cancel</button></div>
          <div id="template-picker">
            <p class="admin-help">Start with a template, then edit the message and choose your dates.</p>
            <div class="template-grid">
              <button type="button" class="template-card" data-template="snow"><span class="template-symbol" aria-hidden="true">❄</span><strong>Snow / icy roads</strong><span>A weather closure with the snow animation.</span></button>
              <button type="button" class="template-card" data-template="holiday"><span class="template-symbol" aria-hidden="true">✦</span><strong>Holiday closure</strong><span>A day off with the seasonal logo animation.</span></button>
              <button type="button" class="template-card" data-template="hours"><span class="template-symbol" aria-hidden="true">◷</span><strong>Special hours</strong><span>A late opening or an early close.</span></button>
            </div>
            <button type="button" class="blank-template" data-template="blank">Start from scratch</button>
          </div>
          <form id="entry-form" hidden>
            <label>Internal name<input id="entry-name" maxlength="120" required placeholder="Thanksgiving 2026"></label>
            <label>Banner message<textarea id="entry-message" rows="3" maxlength="1500" placeholder="What would you like customers to know?"></textarea></label>
            <fieldset><legend>Website banner</legend>
              <label class="admin-check"><input id="banner-enabled" type="checkbox" checked> Show a website banner</label>
              <div class="admin-pair"><label>Start displaying<input id="starts-at" type="datetime-local"></label><label>Stop displaying<input id="ends-at" type="datetime-local"></label></div>
            </fieldset>
            <fieldset><legend>Affected store dates</legend><div id="dates"></div><button type="button" id="add-date">Add date</button></fieldset>
            <fieldset><legend>Logo animation</legend>
              <label>During this banner<select id="animation"><option value="automatic">Use the normal seasonal calendar</option><option value="off">No logo animation</option><option value="snow-closure">Snow / icy roads closure</option><option value="new-year">New Year confetti</option><option value="valentines-day">Valentine’s hearts</option><option value="st-patricks-day">St. Patrick’s clovers</option><option value="easter">Easter eggs</option><option value="earth-day">Earth Day leaves</option><option value="mothers-day">Mother’s Day flowers</option><option value="fathers-day">Father’s Day ties</option><option value="independence-day">Independence Day fireworks</option><option value="halloween">Halloween bats</option><option value="thanksgiving">Thanksgiving leaves</option><option value="winter-holidays">Winter holiday snow</option></select></label>
              <details><summary>Seasonal animation calendar</summary><ul id="seasonal-calendar"></ul></details>
            </fieldset>
            <fieldset><legend>Google Business Profile <span class="optional-label">Optional</span></legend>
              <label class="admin-check"><input id="google-hours" type="checkbox"> Sync these special hours to Google</label>
              <label class="admin-check"><input id="google-post" type="checkbox"> Publish the message as a Google announcement post</label>
              <p class="admin-help">Google updates start when you publish. Posts use their own timing; the website banner schedule does not remove them.</p>
            </fieldset>
            <div class="admin-actions editor-actions"><button type="submit" name="intent" value="published" class="button" id="publish">Publish announcement</button><button type="submit" name="intent" value="draft" id="save-draft">Save draft</button><button type="button" id="remove-entry" class="danger" hidden>Remove entry</button></div>
            <p class="admin-help" id="entry-meta" hidden></p>
          </form>
        </section>
      </div>
      <div class="admin-settings">
        <section id="google-settings" class="admin-card" aria-labelledby="google-heading">
          <h2 id="google-heading">Google Business Profile</h2><p id="google-status" class="admin-help"></p>
          <div class="admin-actions"><button id="connect-google" type="button">Connect Google Business Profile</button><button id="load-accounts" type="button" hidden>Choose / change location</button><button id="disconnect-google" type="button" hidden>Disconnect</button></div>
          <form id="location-form" hidden><div class="admin-pair"><label>Google account<select id="google-account" required></select></label><label>Store location<select id="google-location" required></select></label></div><button class="button" type="submit">Use this location</button></form>
        </section>
        <section id="admin-access" class="admin-card" aria-labelledby="staff-heading">
          <div class="admin-section-heading"><h2 id="staff-heading">Admin access</h2><span id="access-count" class="access-count"></span></div>
          <div id="staff-list"></div>
          <details id="removed-access" hidden><summary>Removed access</summary><div id="removed-staff-list"></div></details>
          <form id="invite-form"><label>Invite an admin<input type="email" id="invite-email" required maxlength="254" autocomplete="email" placeholder="Google email address"></label><button type="submit" class="button">Send invitation</button></form>
        </section>
      </div>
    </div>
  </main>
</body></html>`, { headers: {
    'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow',
    'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer',
    'Content-Security-Policy': "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; script-src 'self'; style-src 'self'; img-src 'self'; font-src 'self'; connect-src 'self'",
  } });
}

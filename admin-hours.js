import { setupSeasonalLogo, getSeasonalOccasion, seasonalCalendar } from './seasonal-logo.js';

const $ = id => document.getElementById(id);
let entries = [], selected = null, stopPreview, previewRun = 0, busy = false;
const notice = (message, error = false) => { $('notice').textContent = message; $('notice').hidden = !message; $('notice').classList.toggle('error', error); };
const api = async (path, method = 'GET', body) => {
  const response = await fetch(`/api/admin${path}`, { method, credentials: 'same-origin', cache: 'no-store',
    headers: body === undefined ? {} : { 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const result = await response.json();
  if (!response.ok) {
    if (response.status === 401) { $('workspace').hidden = true; $('login-panel').hidden = false; $('login').hidden = false; }
    throw Error(result.error || 'The request did not finish. Please try again.');
  }
  return result;
};
const action = callback => async event => {
  event?.preventDefault();
  if (busy) return;
  busy = true;
  const controls = [...document.querySelectorAll('button')];
  controls.forEach(button => { button.disabled = true; });
  try { await callback(event); }
  catch (error) { notice(error.message, true); $('notice').scrollIntoView({ block: 'nearest' }); }
  finally { busy = false; controls.forEach(button => { button.disabled = false; }); }
};
const element = (tag, text, className) => { const node = document.createElement(tag); if (text) node.textContent = text; if (className) node.className = className; return node; };
const button = (text, callback) => { const node = element('button', text); node.type = 'button'; node.addEventListener('click', action(callback)); return node; };
const localTime = instant => {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(instant).map(p => [p.type,p.value]));
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
};
const labels = { pending: 'Queued', retry: 'Sync failed / retry scheduled', failed: 'Sync failed', synced: 'Synced', published: 'Published',
  processing: 'Processing at Google', removed: 'Removed', unsupported: 'Not supported', rejected: 'Rejected by Google', uncertain: 'Needs review', off: 'Off' };
const bannerLabels = { showing: 'banner showing', scheduled: 'banner scheduled', ended: 'banner ended', disabled: 'banner disabled' };
function renderEntries() {
  $('entries').replaceChildren();
  const visible = entries.filter(entry => $('show-removed').checked || entry.state !== 'removed');
  if (!visible.length) $('entries').append(element('p', 'No announcements yet. Create one to get started.', 'admin-help'));
  for (const entry of visible) {
    const card = element('article', '', 'entry-item');
    card.append(element('h3', entry.name), element('p', `Website: ${entry.state === 'published' ? `Published · ${bannerLabels[entry.bannerState]}` : entry.state === 'removed' ? 'Removed' : 'Draft'}`, 'status'));
    for (const [kind, name] of [['hours', 'Google hours'], ['post', 'Google post']]) {
      const job = entry.sync[kind];
      card.append(element('p', `${name}: ${labels[job?.status] || 'Off'}`, `status${job?.error ? ' problem' : ''}`));
      if (job?.error) card.append(element('p', job.error));
      if (job && !['published','synced','removed','off','pending'].includes(job.status)) {
        card.append(button(`Retry ${kind === 'hours' ? 'hours' : 'post'}`, async () => { await api(`/holidays/${entry.id}/retry`, 'POST', { kind }); notice('Google retry queued.'); await refreshEntries(); }));
        if (kind === 'post' && job.status === 'uncertain') card.append(button('Confirm no post exists', async () => {
          if (!window.confirm('Check the selected location in Google Business Profile first. Confirm that no post for this announcement exists. A new post may be created if you confirm.')) return;
          await api(`/holidays/${entry.id}/retry`, 'POST', { kind, confirmNoPost: true }); notice('A new Google post attempt is queued.'); await refreshEntries();
        }));
      }
    }
    const actions = element('div', '', 'admin-actions'); actions.append(button(entry.state === 'removed' ? 'Restore / edit' : 'Edit', () => edit(entry)));
    card.append(actions); $('entries').append(card);
  }
}
async function refreshEntries() { entries = (await api('/holidays')).entries; renderEntries(); }
function dateRow(day = {}) {
  const row = element('div', '', 'date-row');
  const input = (labelText, type, value, cls) => {
    const label = element('label', labelText), control = document.createElement('input');
    control.type = type; control.value = value || ''; control.className = cls; label.append(control); return [label,control];
  };
  const [dateLabel,date] = input('Affected date', 'date', day.date || '', 'day-date'); date.required = true;
  const choiceLabel = element('label', 'Store hours'), choice = document.createElement('select'); choice.className = 'day-mode';
  for (const [value,text] of [['closed','Closed all day'],['open','Special hours']]) { const option = element('option',text); option.value = value; choice.append(option); }
  choice.value = day.closed === false ? 'open' : 'closed'; choiceLabel.append(choice);
  const pair = element('div', '', 'admin-pair'); const [opensLabel,opens] = input('Opens', 'time', day.opens || '10:00', 'day-opens'); const [closesLabel,closes] = input('Closes', 'time', day.closes || '17:00', 'day-closes'); pair.append(opensLabel,closesLabel);
  const change = () => { pair.hidden = choice.value === 'closed'; opens.required = closes.required = !pair.hidden; opens.disabled = closes.disabled = pair.hidden; };
  choice.addEventListener('change', change); change();
  row.append(dateLabel, choiceLabel, pair, button('Remove date', () => { row.remove(); updatePreview(); }));
  $('dates').append(row);
}
function edit(entry) {
  selected = entry ? structuredClone(entry) : { id: crypto.randomUUID(), version: 0, state: 'draft' };
  $('editor-title').textContent = entry ? entry.name : 'New announcement';
  $('entry-name').value = entry?.name || ''; $('entry-message').value = entry?.message || '';
  $('banner-enabled').checked = entry?.bannerEnabled ?? true;
  $('starts-at').value = entry?.startsAt || localTime(new Date());
  $('ends-at').value = entry?.endsAt || '';
  $('google-hours').checked = entry?.googleHours || false; $('google-post').checked = entry?.googlePost || false;
  $('animation').value = entry?.animation || 'automatic';
  $('dates').replaceChildren(); (entry?.dates || [{ date: localTime(new Date()).slice(0,10), closed: true }]).forEach(dateRow);
  $('save-draft').textContent = entry?.state === 'published' ? 'Unpublish & save draft' : 'Save draft';
  $('publish').textContent = entry?.state === 'published' ? 'Save & publish changes' : 'Publish announcement';
  $('remove-entry').hidden = !entry || entry.state === 'removed';
  $('entry-meta').textContent = entry ? `Last saved by ${entry.updatedBy}. Version ${entry.version}.` : 'A draft is visible only to staff.';
  updatePreview();
}
function readEntry(state) {
  return { version: selected.version, state, name: $('entry-name').value, message: $('entry-message').value,
    bannerEnabled: $('banner-enabled').checked, startsAt: $('starts-at').value, endsAt: $('ends-at').value,
    googleHours: $('google-hours').checked, googlePost: $('google-post').checked, animation: $('animation').value,
    dates: [...$('dates').children].map(row => ({ date: row.querySelector('.day-date').value, closed: row.querySelector('.day-mode').value === 'closed',
      opens: row.querySelector('.day-opens').value, closes: row.querySelector('.day-closes').value })) };
}
function updatePreview() {
  $('preview-banner').hidden = !$('banner-enabled').checked;
  $('preview-message').textContent = $('entry-message').value || 'Your announcement will appear here.';
  $('starts-at').required = $('ends-at').required = $('banner-enabled').checked;
  $('entry-message').required = $('banner-enabled').checked || $('google-post').checked;
  $('preview-schedule').textContent = $('banner-enabled').checked ? `Banner: ${$('starts-at').value.replace('T',' ') || 'choose a start'} → ${$('ends-at').value.replace('T',' ') || 'choose a stop'} Central time.` : 'Website banner is disabled. Published special hours will still appear on the website.';
}
async function replay() {
  stopPreview?.(); const run = ++previewRun;
  const value = $('animation').value;
  const date = $('starts-at').value ? new Date(`${$('starts-at').value}Z`) : new Date();
  // Noon on the chosen civil date avoids shifting the calendar date for preview.
  const calendarDate = new Date(`${date.toISOString().slice(0,10)}T18:00:00Z`);
  const occasion = getSeasonalOccasion(calendarDate, value === 'automatic' ? null : value);
  $('preview-animation-note').textContent = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'Your reduced-motion preference is on; animation is skipped.' : occasion ? `Previewing ${value === 'automatic' ? occasion.id.replaceAll('-',' ') : $('animation').selectedOptions[0].textContent}. Plays for 4.2 seconds.` : 'No animation for this selection or calendar date.';
  const stop = await setupSeasonalLogo($('preview-logo'), { preview: true, occasion });
  if (run !== previewRun) stop?.(); else stopPreview = stop;
}
async function loadGoogle() {
  const google = await api('/google');
  $('google-status').textContent = google.connected ? google.location ? `Connected: ${google.title} · ${google.address}. Google posts: ${google.canPost ? 'supported' : 'not available for this location'}.` : 'Google account connected. Choose the store location below.' : 'Not connected. Website announcements work independently of Google.';
  $('connect-google').textContent = google.connected ? 'Reconnect Google account' : 'Connect Google Business Profile';
  $('load-accounts').hidden = $('disconnect-google').hidden = !google.connected;
}
const options = (select, items, placeholder) => {
  select.replaceChildren(); const first = element('option',placeholder); first.value = ''; select.append(first);
  for (const item of items) { const option = element('option', `${item.title}${item.address ? ` · ${item.address}` : ''}`); option.value = item.name; select.append(option); }
};
async function loadStaff() {
  const result = await api('/staff'); $('staff-list').replaceChildren();
  result.owners.forEach(email => $('staff-list').append(element('p', `${email} · Owner`, 'admin-help')));
  for (const staff of result.staff) {
    const item = element('div', '', 'staff-item'); item.append(element('p', `${staff.email} · ${staff.revoked_at ? 'Access removed' : staff.accepted_at ? 'Active staff' : 'Invited'}`));
    if (!staff.revoked_at && !staff.accepted_at) {
      item.append(element('p', `Invitation email: ${staff.email_status}`));
      if (staff.email_error) item.append(element('p', staff.email_error));
      item.append(button('Resend invitation', async () => { await api('/staff/resend', 'POST', { email: staff.email }); await loadStaff(); }));
    }
    if (!staff.revoked_at) item.append(button('Remove access', async () => {
      if (!window.confirm(`Remove staff access for ${staff.email}?`)) return;
      await api('/staff/revoke','POST',{ email: staff.email }); await loadStaff(); notice('Staff access removed.');
    }));
    $('staff-list').append(item);
  }
}
$('new-entry').addEventListener('click', () => { edit(null); $('entry-name').focus(); });
$('show-removed').addEventListener('change', renderEntries);
$('add-date').addEventListener('click', () => dateRow());
$('entry-form').addEventListener('input', updatePreview);
$('animation').addEventListener('change', action(replay));
$('replay-animation').addEventListener('click', action(replay));
$('entry-form').addEventListener('submit', action(async event => {
  const state = event.submitter?.value || 'draft';
  if (state === 'draft' && selected.state === 'published' && !window.confirm('Unpublish this announcement from the website and remove its Google updates?')) return;
  await api(`/holidays/${selected.id}`, 'PUT', readEntry(state)); await refreshEntries(); edit(entries.find(entry => entry.id === selected.id));
  notice(state === 'published' ? 'Website: Published. Google updates, when selected, are queued separately.' : 'Draft saved.');
}));
$('remove-entry').addEventListener('click', action(async () => {
  if (!window.confirm('Remove this entry from the website and queue removal of its Google updates? You can restore it later.')) return;
  // Removal uses the last saved content, so incomplete edits cannot prevent removal.
  await api(`/holidays/${selected.id}`, 'PUT', { ...selected, state: 'removed' }); await refreshEntries(); edit(null); notice('Entry removed. Google cleanup is queued if needed.');
}));
$('logout').addEventListener('click', action(async () => { await api('/logout','POST'); window.location.assign('/admin'); }));
$('connect-google').addEventListener('click', action(async () => { const result = await api('/google/connect','POST'); window.location.assign(result.url); }));
$('disconnect-google').addEventListener('click', action(async () => {
  if (!window.confirm('Disconnect Google? Website announcements remain published. Existing Google hours/posts remain until you reconnect and remove them.')) return;
  await api('/google/disconnect','POST'); await loadGoogle(); notice('Google disconnected.');
}));
$('load-accounts').addEventListener('click', action(async () => { const result = await api('/google/accounts'); options($('google-account'), result.accounts, 'Choose account'); options($('google-location'), [], 'Choose account first'); $('location-form').hidden = false; }));
$('google-account').addEventListener('change', action(async () => {
  if (!$('google-account').value) return;
  const result = await api(`/google/locations?account=${encodeURIComponent($('google-account').value)}`); options($('google-location'), result.locations, 'Choose store location');
}));
$('location-form').addEventListener('submit', action(async () => { await api('/google/location','POST',{ account: $('google-account').value, location: $('google-location').value }); await loadGoogle(); $('location-form').hidden = true; notice('Google location saved. Use Retry on any waiting announcements.'); }));
$('invite-form').addEventListener('submit', action(async () => { await api('/staff','POST',{ email: $('invite-email').value }); $('invite-email').value = ''; await loadStaff(); notice('Staff invitation saved. Delivery status appears below.'); }));
seasonalCalendar.forEach(item => $('seasonal-calendar').append(element('li', `${item.name}: ${item.window}.`)));
try {
  const info = await api('/session');
  $('login-help').textContent = info.loginReady ? 'Sign in with your invited Google account to manage store announcements.' : 'Google sign-in needs its OAuth client credentials. Ask the website administrator to finish the steps in HOLIDAY-HOURS.md.';
  $('login').hidden = !info.loginReady;
  if (info.email) {
    $('signed-in').textContent = info.email; $('logout').hidden = false; $('login-panel').hidden = true; $('workspace').hidden = false;
    await Promise.all([refreshEntries(), loadGoogle(), loadStaff()]); edit(null);
    const status = new URLSearchParams(window.location.search).get('notice');
    if (status) { notice(status === 'connected' ? 'Google connected. Choose the store location below.' : 'Google sign-in or connection was cancelled.'); history.replaceState(null,'','/admin'); }
    window.setInterval(() => { if (!document.hidden && !busy) refreshEntries().catch(error => notice(error.message,true)); }, 15000);
  }
} catch (error) { notice(error.message,true); }

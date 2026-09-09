import { setupSeasonalLogo, getSeasonalOccasion, seasonalCalendar } from './seasonal-logo.js';

const $ = id => document.getElementById(id);
let entries = [], selected = null, stopPreview, previewRun = 0, busy = false, currentEmail = '', dirty = false;
const templates = {
  snow: { name: 'Snow / icy roads closure', message: 'We’re closed due to snow and icy roads. Stay safe, and check back for reopening updates.', animation: 'snow-closure', closed: true },
  holiday: { name: 'Holiday closure', message: 'We’re taking a short holiday break. Thank you for understanding. We look forward to seeing you soon!', animation: 'automatic', closed: true },
  hours: { name: 'Special hours', message: 'We have special hours coming up. Please check our hours before stopping by. We look forward to seeing you!', animation: 'automatic', closed: false },
  blank: { name: '', message: '', animation: 'automatic', closed: true },
};
const notice = (message, error = false) => { $('notice').textContent = message; $('notice').hidden = !message; $('notice').classList.toggle('error', error); };
const api = async (path, method = 'GET', body) => {
  const response = await fetch(`/api/admin${path}`, { method, credentials: 'same-origin', cache: 'no-store',
    headers: body === undefined ? {} : { 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const result = await response.json();
  if (!response.ok) {
    if (response.status === 401) {
      stopPreview?.(); document.body.classList.add('is-signed-out');
      $('workspace').hidden = true; $('login-panel').hidden = false; $('login').hidden = false;
      $('logout').hidden = true; $('signed-in').textContent = ''; $('login-help').hidden = true;
    }
    throw Error(result.error || 'The request did not finish. Please try again.');
  }
  return result;
};
const action = callback => async event => {
  event?.preventDefault();
  if (busy) return;
  busy = true;
  const controls = [...document.querySelectorAll('button')].map(button => [button, button.disabled]);
  controls.forEach(([button]) => { button.disabled = true; });
  try { await callback(event); }
  catch (error) { notice(error.message, true); $('notice').scrollIntoView({ block: 'nearest' }); }
  finally { busy = false; controls.forEach(([button, disabled]) => { button.disabled = disabled; }); $('replay-animation').disabled = !selected; }
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
  if (!visible.length) {
    const empty = element('div', '', 'entry-empty');
    empty.append(element('strong', 'No saved announcements'), element('p', 'Your drafts and published announcements will appear here.', 'admin-help'));
    $('entries').append(empty);
  }
  for (const entry of visible) {
    const card = element('article', '', `entry-item${selected?.id === entry.id ? ' is-selected' : ''}`);
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
    const actions = element('div', '', 'admin-actions'); actions.append(button(entry.state === 'removed' ? 'Restore / edit' : 'Edit', () => {
      if (!discardChanges()) return;
      edit(entry); $('entry-name').focus();
    }));
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
  row.append(dateLabel, choiceLabel, pair, button('Remove date', () => { row.remove(); dirty = true; updatePreview(); }));
  $('dates').append(row);
}
function discardChanges() { return !dirty || window.confirm('Discard your unsaved changes?'); }
function chooseTemplate() {
  selected = null; dirty = false; stopPreview?.(); ++previewRun;
  $('entry-form').hidden = true; $('template-picker').hidden = false; $('new-entry').hidden = true;
  $('editor-state').textContent = 'Get started'; $('editor-title').textContent = 'Create an announcement';
  $('cancel-new').hidden = !entries.some(entry => entry.state !== 'removed');
  $('preview-banner').hidden = true; $('preview-animation-note').textContent = '';
  $('preview-schedule').textContent = 'Choose an announcement or template to preview. All times are Central.';
  $('replay-animation').disabled = true; renderEntries();
}
function edit(entry, template = templates.blank) {
  selected = entry ? structuredClone(entry) : { id: crypto.randomUUID(), version: 0, state: 'draft' };
  dirty = false; stopPreview?.(); ++previewRun;
  $('entry-form').hidden = false; $('template-picker').hidden = true; $('new-entry').hidden = false; $('cancel-new').hidden = Boolean(entry);
  $('editor-state').textContent = entry ? entry.state === 'published' ? 'Published' : entry.state === 'removed' ? 'Removed' : 'Draft' : 'Unsaved announcement';
  $('editor-title').textContent = 'Announcement details';
  $('entry-name').value = entry?.name ?? template.name; $('entry-message').value = entry?.message ?? template.message;
  $('banner-enabled').checked = entry?.bannerEnabled ?? true;
  $('starts-at').value = entry?.startsAt || localTime(new Date());
  $('ends-at').value = entry?.endsAt || '';
  $('google-hours').checked = entry?.googleHours || false; $('google-post').checked = entry?.googlePost || false;
  $('animation').value = entry?.animation || template.animation;
  // Templates never choose the affected date or publish/sync anything by themselves.
  $('dates').replaceChildren(); (entry?.dates || [{ date: '', closed: template.closed }]).forEach(dateRow);
  $('save-draft').textContent = entry?.state === 'published' ? 'Unpublish & save draft' : 'Save draft';
  $('publish').textContent = entry?.state === 'published' ? 'Save & publish changes' : 'Publish announcement';
  $('remove-entry').hidden = !entry || entry.state === 'removed';
  $('entry-meta').textContent = entry ? `Last saved by ${entry.updatedBy}.` : '';
  $('entry-meta').hidden = !entry;
  $('replay-animation').disabled = false; $('preview-animation-note').textContent = `Logo: ${$('animation').selectedOptions[0].textContent}`;
  updatePreview(); renderEntries();
}
function readEntry(state) {
  return { version: selected.version, state, name: $('entry-name').value, message: $('entry-message').value,
    bannerEnabled: $('banner-enabled').checked, startsAt: $('starts-at').value, endsAt: $('ends-at').value,
    googleHours: $('google-hours').checked, googlePost: $('google-post').checked, animation: $('animation').value,
    dates: [...$('dates').children].map(row => ({ date: row.querySelector('.day-date').value, closed: row.querySelector('.day-mode').value === 'closed',
      opens: row.querySelector('.day-opens').value, closes: row.querySelector('.day-closes').value })) };
}
function updatePreview() {
  if (!selected) return;
  $('preview-banner').hidden = !$('banner-enabled').checked;
  $('preview-message').textContent = $('entry-message').value || 'Your announcement will appear here.';
  $('starts-at').required = $('ends-at').required = $('banner-enabled').checked;
  $('entry-message').required = $('banner-enabled').checked || $('google-post').checked;
  const displayTime = value => value ? new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(`${value}Z`)) : '';
  $('preview-schedule').textContent = $('banner-enabled').checked ? `${displayTime($('starts-at').value) || 'Choose a start'} to ${displayTime($('ends-at').value) || 'choose a stop'} · Central Time` : 'Banner off · All dates and times are Central.';
}
async function replay() {
  if (!selected) return;
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
  const result = await api('/staff'); $('staff-list').replaceChildren(); $('removed-staff-list').replaceChildren();
  const people = [...result.owners.map(email => ({ email, owner: true })), ...result.staff.filter(staff => !result.owners.includes(staff.email))];
  const active = people.filter(person => !person.revoked_at);
  const pending = active.filter(person => !person.owner && !person.accepted_at).length;
  const admins = active.length - pending;
  $('access-count').textContent = `${admins} ${admins === 1 ? 'admin' : 'admins'}${pending ? ` · ${pending} invited` : ''}`;
  $('removed-access').hidden = !people.some(person => person.revoked_at);
  for (const person of people) {
    const item = element('div', '', 'staff-item'), identity = element('div', '', 'staff-identity'), actions = element('div', '', 'admin-actions');
    const invited = !person.owner && !person.accepted_at && !person.revoked_at;
    identity.append(element('p', `${person.email}${person.email === currentEmail ? ' (you)' : ''}`), element('span', person.revoked_at ? 'Access removed' : person.owner ? 'Owner' : invited ? 'Invited' : 'Admin', `access-role${invited ? ' pending' : ''}`));
    if (invited) {
      const delivery = { pending: 'Invitation queued', sending: 'Sending invitation', sent: 'Invitation sent', failed: 'Invitation email failed' };
      identity.append(element('p', delivery[person.email_status] || 'Invitation saved', 'admin-help'));
      if (person.email_error) identity.append(element('p', person.email_error, 'admin-help'));
      actions.append(button('Resend invitation', async () => { await api('/staff/resend', 'POST', { email: person.email }); await loadStaff(); }));
    }
    if (!person.revoked_at && !person.owner && person.email !== currentEmail) {
      const remove = button('Remove access', async () => {
        if (!window.confirm(`Remove admin access for ${person.email}?`)) return;
        await api('/staff/revoke','POST',{ email: person.email }); await loadStaff(); notice('Admin access removed.');
      });
      remove.className = 'danger'; actions.append(remove);
    }
    item.append(identity, actions); $(person.revoked_at ? 'removed-staff-list' : 'staff-list').append(item);
  }
}
$('new-entry').addEventListener('click', action(() => { if (discardChanges()) { chooseTemplate(); document.querySelector('[data-template]').focus(); } }));
$('cancel-new').addEventListener('click', action(() => {
  if (!discardChanges()) return;
  if (selected) { chooseTemplate(); document.querySelector('[data-template]').focus(); }
  else { edit(entries.find(entry => entry.state !== 'removed')); $('entry-name').focus(); }
}));
document.querySelectorAll('[data-template]').forEach(control => control.addEventListener('click', action(async () => {
  edit(null, templates[control.dataset.template]); $('entry-name').focus(); await replay();
})));
$('show-removed').addEventListener('change', renderEntries);
$('add-date').addEventListener('click', () => { dateRow(); dirty = true; });
$('entry-form').addEventListener('input', () => { dirty = true; updatePreview(); });
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
  await api(`/holidays/${selected.id}`, 'PUT', { ...selected, state: 'removed' }); await refreshEntries(); chooseTemplate(); notice('Entry removed. Google cleanup is queued if needed.');
}));
$('logout').addEventListener('click', action(async () => {
  if (!discardChanges()) return;
  await api('/logout','POST'); dirty = false; window.location.assign('/admin');
}));
$('connect-google').addEventListener('click', action(async () => {
  if (!discardChanges()) return;
  const result = await api('/google/connect','POST'); dirty = false; window.location.assign(result.url);
}));
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
$('invite-form').addEventListener('submit', action(async () => { await api('/staff','POST',{ email: $('invite-email').value }); $('invite-email').value = ''; await loadStaff(); notice('Admin invitation saved. Delivery status appears in Admin access.'); }));
window.addEventListener('beforeunload', event => { if (dirty) { event.preventDefault(); event.returnValue = ''; } });
seasonalCalendar.forEach(item => $('seasonal-calendar').append(element('li', `${item.name}: ${item.window}.`)));
try {
  const info = await api('/session');
  $('login-help').textContent = info.loginReady ? '' : 'Sign-in is unavailable. Please contact the website owner.';
  $('login-help').hidden = info.loginReady;
  $('login').hidden = !info.loginReady;
  if (info.email) {
    currentEmail = info.email; document.body.classList.remove('is-signed-out');
    $('signed-in').textContent = info.email; $('logout').hidden = false; $('login-panel').hidden = true; $('workspace').hidden = false;
    await Promise.all([refreshEntries(), loadGoogle(), loadStaff()]);
    const first = entries.find(entry => entry.state !== 'removed'); if (first) edit(first); else chooseTemplate();
    const status = new URLSearchParams(window.location.search).get('notice');
    if (status) { notice(status === 'connected' ? 'Google connected. Choose the store location below.' : 'Google sign-in or connection was cancelled.'); history.replaceState(null,'','/admin'); }
    window.setInterval(() => { if (!document.hidden && !busy) refreshEntries().catch(error => notice(error.message,true)); }, 15000);
  }
} catch (error) { notice(error.message,true); }

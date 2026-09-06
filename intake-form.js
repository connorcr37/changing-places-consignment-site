import { INTAKE_LIMITS, isValidEmail, isValidPhone } from './intake-shared.js';
import { openPhoto, resizePhoto } from './intake-photo.js';

(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const form = $('intake-form');
  const files = [];
  let busy = false;
  let session = null;
  let available = false;
  const showError = (id, message) => { $(id).textContent = message; $(id).hidden = !message; };
  const progress = (value, message) => { $('upload-progress').hidden = false; $('progress-bar').value = value; $('progress-label').textContent = message; };
  const lock = (value) => {
    busy = value;
    for (const id of ['contact-fields', 'photo-fields', 'consent-fields']) $(id).disabled = value || Boolean(session);
    $('submit-button').disabled = value || !available;
    $('submit-button').textContent = value ? 'Sending your photos…' : session ? 'Retry sending photos →' : 'Send for review →';
  };
  async function api(path, options = {}) {
    const response = await fetch(path, { ...options, signal: AbortSignal.timeout(90000) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      let message = data.error || 'We could not send your photos. Please try again.';
      if (response.status === 429 && Number.isFinite(data.retryAt)) {
        const retry = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }).format(new Date(data.retryAt * 1000));
        message = `Please try again after ${retry}. You can also send your photos directly to the shop using the contact options below.`;
      }
      const error = new Error(message); error.status = response.status; throw error;
    }
    return data;
  }
  function renderPhotos() {
    $('photo-previews').replaceChildren();
    files.forEach((photo, index) => {
      const figure = document.createElement('figure'); figure.className = 'photo-preview';
      const img = document.createElement('img'); img.src = photo.preview; img.alt = `Selected photo ${index + 1}: ${photo.name}`; img.width = 200; img.height = 200;
      const caption = document.createElement('figcaption'); caption.textContent = `${index + 1}. ${photo.name}`;
      const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = '×'; remove.setAttribute('aria-label', `Remove photo ${index + 1}: ${photo.name}`);
      remove.addEventListener('click', () => { if (busy || session) return; files.splice(index, 1); renderPhotos(); });
      figure.append(img, remove, caption); $('photo-previews').append(figure);
    });
    $('photo-count').textContent = `${files.length} of ${INTAKE_LIMITS.maxPhotos} photos`;
    $('clear-photos').hidden = !files.length;
  }
  async function preparePhoto(file) {
    if (file.size > INTAKE_LIMITS.maxSourceBytes) throw new Error(`${file.name}: please choose a photo smaller than 20 MB.`);
    const bitmap = await openPhoto(file);
    try {
      let blob, emailBlob;
      try {
        blob = await resizePhoto(bitmap, { maxEdge: 1600, maxBytes: INTAKE_LIMITS.maxPhotoBytes, quality: .86 });
        emailBlob = await resizePhoto(bitmap, { maxEdge: 1200, maxBytes: INTAKE_LIMITS.maxPreviewBytes, quality: .68 });
      } catch {
        throw new Error(`${file.name}: your browser could not prepare this photo. Please try again or save a new JPG copy.`);
      }
      // Data previews work with both the shared and intake page image policies.
      const preview = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error(`${file.name}: could not prepare the preview.`));
        reader.readAsDataURL(emailBlob);
      });
      return { name: file.name, blob, emailBlob, preview, identity: `${file.name}:${file.size}:${file.lastModified}` };
    } finally { bitmap.close(); }
  }
  async function addPhotos(selected) {
    if (busy || session) return;
    lock(true); showError('photo-error', '');
    const errors = [];
    const selectedFiles = Array.from(selected);
    if (selectedFiles.length + files.length > INTAKE_LIMITS.maxPhotos) errors.push('You can send up to 30 photos. Extra photos were not added.');
    for (const file of selectedFiles) {
      if (files.length >= INTAKE_LIMITS.maxPhotos) break;
      if (files.some(photo => photo.identity === `${file.name}:${file.size}:${file.lastModified}`)) continue;
      $('photo-count').textContent = `Preparing photo ${files.length + 1}…`;
      try { files.push(await preparePhoto(file)); } catch (error) { errors.push(error.message); }
    }
    renderPhotos(); showError('photo-error', errors.join(' ')); $('photo-input').value = ''; lock(false);
  }
  $('photo-input').addEventListener('change', event => { void addPhotos(event.target.files); });
  $('clear-photos').addEventListener('click', () => { if (busy || session) return; files.length = 0; renderPhotos(); });
  for (const event of ['dragenter', 'dragover']) $('drop-zone').addEventListener(event, e => { e.preventDefault(); if (!busy && !session) $('drop-zone').classList.add('dragover'); });
  for (const event of ['dragleave', 'drop']) $('drop-zone').addEventListener(event, e => { e.preventDefault(); $('drop-zone').classList.remove('dragover'); });
  $('drop-zone').addEventListener('drop', event => { void addPhotos(event.dataTransfer.files); });
  window.addEventListener('beforeunload', event => { if (busy || session) { event.preventDefault(); event.returnValue = ''; } });
  form.addEventListener('submit', async event => {
    event.preventDefault(); if (busy || !available) return;
    showError('form-error', '');
    if (!session) {
      if (!form.reportValidity()) return;
      if (!$('customer-phone').value.trim() && !$('customer-email').value.trim()) { showError('form-error', 'Please add a phone number or email address so we can get in touch.'); $('customer-phone').focus(); return; }
      for (const [id, validate, label] of [['customer-email', isValidEmail, 'email address'], ['customer-phone', isValidPhone, 'phone number']]) {
        if ($(id).value.trim() && !validate($(id).value.trim())) { showError('form-error', `Please check your ${label}.`); $(id).focus(); return; }
      }
      if (!files.length) { showError('form-error', 'Please choose at least one photo of your items.'); $('photo-input').focus(); return; }
    }
    lock(true);
    try {
      if (!session) session = { uploadId: crypto.randomUUID(), uploadToken: crypto.randomUUID() + crypto.randomUUID(), name: $('customer-name').value.trim(), phone: $('customer-phone').value.trim(), email: $('customer-email').value.trim(), notes: $('customer-notes').value.trim(), consent: $('consent').checked, website: $('company-website').value, photoCount: files.length };
      progress(0, 'Getting your photos ready to send…');
      await api('/api/intake/submissions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(session) });
      for (let index = 0; index < files.length; index++) {
        if (!files[index].uploaded) {
          progress(Math.round(index / files.length * 95), `Uploading photo ${index + 1} of ${files.length}. Please keep this page open.`);
          const body = new FormData(); body.append('photo', files[index].blob, 'photo.jpg'); body.append('preview', files[index].emailBlob, 'preview.jpg');
          await api(`/api/intake/submissions/${session.uploadId}/photos/${index + 1}`, { method: 'PUT', headers: { Authorization: `Bearer ${session.uploadToken}` }, body });
          files[index].uploaded = true;
        }
      }
      progress(98, 'Saving your submission…');
      await api(`/api/intake/submissions/${session.uploadId}/complete`, { method: 'POST', headers: { Authorization: `Bearer ${session.uploadToken}` } });
      session = null; busy = false; files.length = 0;
      $('intake-content').hidden = true; $('intake-success').hidden = false; $('intake-success').focus(); window.scrollTo({ top: 0, behavior: 'instant' });
    } catch (error) {
      if ([400, 401, 409, 413, 415, 429].includes(error.status)) { session = null; files.forEach(photo => { photo.uploaded = false; }); }
      showError('form-error', `${error.name === 'TimeoutError' || error.name === 'TypeError' ? 'The connection was interrupted. Your selected photos are still here.' : error.message} ${session ? 'Use Retry below to continue. Please keep this page open.' : ''}`);
      lock(false); $('form-error').scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  });
  $('submit-button').disabled = true;
  void api('/api/intake/config').then(config => {
    available = config.enabled; lock(busy);
    if (!available) { $('availability').textContent = 'We’re putting the finishing touches on this form. Photo submissions will open soon.'; $('availability').hidden = false; }
  }).catch(() => { $('availability').textContent = 'We couldn’t connect to the submission service. Please refresh this page to try again.'; $('availability').hidden = false; });
})();

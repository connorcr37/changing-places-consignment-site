import { formatPhone } from './intake-shared.js?v=20260905-contact';

function showContact() {
  const phone = new URLSearchParams(location.hash.slice(1)).get('phone') || '';
  // Fragments stay out of server requests; also remove this one from browser history.
  history.replaceState(null, '', location.pathname);
  const valid = /^\+?\d{7,40}$/.test(phone);
  document.getElementById('text-contact').hidden = !valid;
  document.getElementById('text-error').hidden = valid;
  document.getElementById('text-number').textContent = valid ? formatPhone(phone) : '';
  const action = document.getElementById('open-message');
  if (valid) action.href = `sms:${phone}`;
  else action.removeAttribute('href');
}
showContact();
window.addEventListener('hashchange', showContact);

const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const fit = {
  likely_accept: ['#347854', 'Likely yes', '🟢'],
  likely_decline: ['#b34c3a', 'Likely no', '🔴'],
  needs_review: ['#b88a24', 'Needs review', '🟡'],
};
const name = item => `${item.item}${item.quantity > 1 ? ` (${item.quantity} pieces)` : ''}`;
const fallbackReply = 'Thanks for sending your photos! Can you get the items to the store, or would you need pickup? What timing works best for you?';
export function customerMessage(email, draft) {
  if (!email || !/^[^\s@<>,;:"\\]+@[^\s@<>,;:"\\]+\.[^\s@<>,;:"\\]+$/.test(email)) return '';
  const [local, domain] = email.split('@');
  return `mailto:${encodeURIComponent(local)}@${encodeURIComponent(domain)}?subject=${encodeURIComponent('Your furniture photos — Changing Places')}&body=${encodeURIComponent(draft)}`;
}
const priceText = item => {
  if (item.pricing?.evidence !== 'sufficient' || !item.pricing.basis?.trim()) return '';
  const range = value => value && Number.isInteger(value.low) && Number.isInteger(value.high) && value.low > 0 && value.high > value.low && value.high <= 100000 && value.low % 25 === 0 && value.high % 25 === 0 ? `$${value.low.toLocaleString('en-US')}–$${value.high.toLocaleString('en-US')}` : '';
  const fresh = range(item.pricing.comparable_new), used = range(item.pricing.used_resale);
  return [fresh && `Comparable new: ${fresh}`, used && `Used resale: ${used}`].filter(Boolean).join(' · ');
};
const dot = item => {
  const [color, label] = fit[item.recommendation];
  return `<span role="img" aria-label="${label}" title="${label}" style="color:${color};font:20px/1 Arial,sans-serif">●</span>`;
};
const image = (photo, width) => `<img src="cid:${escape(photo.attachment.contentId)}" width="${width}" alt="Photo ${photo.number}" style="display:block;width:100%;max-width:${width}px;height:auto;border:0;border-radius:4px" />`;
const caption = photo => `<div style="font:11px/1.4 Arial,sans-serif;color:#74796e;margin-top:3px">Photo ${photo.number}</div>`;
const gallery = photos => {
  let rows = '';
  for (let index = 0; index < photos.length; index += 2) {
    rows += `<tr>${photos.slice(index, index + 2).map(photo => `<td width="50%" valign="top" style="width:50%;padding:4px">${image(photo, 290)}${caption(photo)}</td>`).join('')}${photos.length - index === 1 ? '<td width="50%"></td>' : ''}</tr>`;
  }
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="table-layout:fixed">${rows}</table>`;
};

export function buildReviewEmail(env, row, assessment, attachments) {
  const title = `Web Submission #${row.id} - ${row.name} - ${row.photo_count} Photos`;
  const items = assessment?.items || [];
  const photos = attachments.map((attachment, index) => ({ attachment, number: index + 1 }));
  const shown = new Set();
  const groups = new Map();
  for (const item of items) {
    const key = item.photo_numbers[0];
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }
  const itemRows = [...groups.values()].map(group => {
    const matching = [...new Set(group.flatMap(item => item.photo_numbers))].map(number => photos[number - 1]).filter(Boolean);
    matching.forEach(photo => shown.add(photo.number));
    const primary = matching[0];
    const notes = group.map(item => {
    const brand = item.likely_brand && !/unknown|label needed|not (visible|identified|clear)|unbranded/i.test(item.likely_brand) ? item.likely_brand : '';
    const prices = priceText(item);
    return `<div style="margin-bottom:9px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td valign="top" style="font:bold 16px/1.3 Arial,sans-serif;color:#294e43">${escape(name(item))}</td><td width="22" valign="top" align="right">${dot(item)}</td></tr></table>${brand ? `<div style="font-size:12px;color:#6c7568;margin-top:3px">${escape(brand)}</div>` : ''}<p style="margin:5px 0 0;font-size:13px;line-height:1.4;color:#606858">${escape(item.assessment)}</p>${prices ? `<p style="margin:6px 0 0;font-size:12px;line-height:1.4">${escape(prices).replace(' · ', '<br />')}</p>` : ''}</div>`;
    }).join('');
    return `<tr><td style="padding:10px 0;border-bottom:1px solid #e6e7df"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="table-layout:fixed"><tr>${primary ? `<td width="46%" valign="top" style="width:46%;padding-right:12px">${image(primary, 270)}${caption(primary)}</td>` : ''}<td valign="top" style="overflow-wrap:anywhere">${notes}</td></tr></table>${matching.length > 1 ? gallery(matching.slice(1)) : ''}</td></tr>`;
  }).join('');
  const remaining = photos.filter(photo => !shown.has(photo.number));
  const contact = `<strong>Phone:</strong> ${escape(row.phone || 'Not provided')}<br /><strong>Email:</strong> ${escape(row.email || 'Not provided')}`;
  const requests = (assessment?.information_needed || []).slice(0, 3);
  const candidate = assessment?.suggested_response?.trim() || '';
  const reply = candidate && candidate.split(/\s+/).length < 40 ? candidate : fallbackReply;
  const messageUrl = customerMessage(row.email, reply);
  const summary = `${row.photo_count} photos${assessment ? ` · Approximately ${assessment.approximate_item_count} items` : ' · Manual review needed'}`;
  const html = `<!doctype html><html lang="en"><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /></head><body style="margin:0;padding:0;background:#f7f5ef;color:#303a30;font:14px/1.4 Arial,sans-serif"><div style="max-width:600px;margin:0 auto;padding:16px;background:#fffefa"><p style="margin:0 0 5px;font-size:10px;letter-spacing:1px;color:#69755e">CHANGING PLACES · SUBMISSION #${escape(row.id)}</p><h1 style="margin:0;font:25px/1.2 Georgia,serif;color:#294e43">${escape(row.name)}</h1><p style="margin:8px 0;font-size:13px;line-height:1.6;overflow-wrap:anywhere">${contact}</p><p style="margin:8px 0;font-size:13px"><strong>Notes:</strong> ${escape(row.notes || 'None provided').replace(/\n/g, '<br />')}</p><p style="margin:10px 0 0;font-size:12px;color:#74796e">${escape(summary)}</p>${items.length ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="table-layout:fixed">${itemRows}</table>` : `<p style="margin:10px 0;font-size:13px">${escape(assessment?.overview || 'AI review unavailable. Please screen the photos below.')}</p>`}${remaining.length ? `${items.length ? '<p style="margin:12px 0 2px;font-size:12px;font-weight:bold">More submitted photos</p>' : ''}${gallery(remaining)}` : ''}${requests.length ? `<div style="margin-top:14px"><h2 style="margin:0 0 4px;font-size:14px">To ask the customer</h2><ul style="margin:0;padding-left:18px;font-size:13px">${requests.map(request => `<li style="margin:3px 0">${escape(request)}</li>`).join('')}</ul></div>` : ''}${reply ? `<div style="margin-top:14px;padding-top:10px;border-top:1px solid #e6e7df"><h2 style="margin:0 0 5px;font-size:14px">Reply draft</h2><p style="margin:0;font-size:13px">${escape(reply).replace(/\n/g, '<br />')}</p>${messageUrl ? `<p style="margin:12px 0 0"><a href="${escape(messageUrl)}" style="display:inline-block;background:#294e43;color:#ffffff;border:12px solid #294e43;border-radius:4px;font:bold 14px Arial,sans-serif;text-decoration:none">Email customer</a></p><p style="margin:5px 0 0;font-size:11px;color:#74796e">Opens a new message with this draft only.</p>` : ''}</div>` : ''}<p style="margin:14px 0 0;font-size:11px;color:#74796e">Dots are AI suggestions. Staff decide. Nothing has been sent to the customer.</p></div></body></html>`;
  const text = `${row.name}\nPhone: ${row.phone || 'Not provided'}\nEmail: ${row.email || 'Not provided'}\nNotes: ${row.notes || 'None provided'}\n${title}\n${summary}\n\n${items.map(item => `${fit[item.recommendation][2]} ${name(item)} — Photos ${item.photo_numbers.join(', ')}\n${item.assessment}${priceText(item) ? `\n${priceText(item)} (ballpark USD${item.quantity > 1 ? '; entire group' : ''})` : ''}`).join('\n\n') || 'Please screen the attached photos.'}${requests.length ? `\n\nTo ask the customer:\n${requests.map(value => `• ${value}`).join('\n')}` : ''}${reply ? `\n\nReply draft:\n${reply}` : ''}${messageUrl ? `\n\nEmail customer (new message): ${messageUrl}` : ''}\n\nAll ${row.photo_count} numbered photos are included. Dots are AI suggestions. Staff decide. Nothing has been sent to the customer.`;
  const conciseHtml = html.replace('<p style="margin:14px 0 0;font-size:11px;color:#74796e">Dots are AI suggestions. Staff decide. Nothing has been sent to the customer.</p>', '');
  const conciseText = text.replace(/ \(ballpark USD(?:; entire group)?\)/g, '').replace(' Dots are AI suggestions. Staff decide. Nothing has been sent to the customer.', '');
  return { from: env.INTAKE_EMAIL_FROM, to: env.INTAKE_NOTIFICATION_EMAIL, subject: title, html: conciseHtml, text: conciseText, attachments };
}

const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const fit = {
  likely_accept: ['#347854', 'Likely yes', '🟢'],
  likely_decline: ['#b34c3a', 'Likely no', '🔴'],
  needs_review: ['#b88a24', 'Needs review', '🟡'],
};
const name = item => `${item.item}${item.quantity > 1 ? ` (${item.quantity} pieces)` : ''}`;
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
    const flaws = item.obvious_flaws.filter(fl => !item.assessment.toLowerCase().includes(fl.toLowerCase()));
    return `<div style="margin-bottom:9px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td valign="top" style="font:bold 16px/1.3 Arial,sans-serif;color:#294e43">${escape(name(item))}</td><td width="22" valign="top" align="right">${dot(item)}</td></tr></table>${brand ? `<div style="font-size:12px;color:#6c7568;margin-top:3px">${escape(brand)}</div>` : ''}<p style="margin:5px 0 0;font-size:13px;line-height:1.4;color:#606858">${escape(item.assessment)}</p>${flaws.length ? `<p style="margin:5px 0 0;font-size:12px;line-height:1.4;color:#8c4839"><strong>Watch:</strong> ${escape(flaws.join('; '))}</p>` : ''}</div>`;
    }).join('');
    return `<tr><td style="padding:10px 0;border-bottom:1px solid #e6e7df"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="table-layout:fixed"><tr>${primary ? `<td width="46%" valign="top" style="width:46%;padding-right:12px">${image(primary, 270)}${caption(primary)}</td>` : ''}<td valign="top" style="overflow-wrap:anywhere">${notes}</td></tr></table>${matching.length > 1 ? gallery(matching.slice(1)) : ''}</td></tr>`;
  }).join('');
  const remaining = photos.filter(photo => !shown.has(photo.number));
  const contact = [row.phone, row.email].filter(Boolean).map(escape).join(' · ');
  const requests = assessment?.information_needed || [];
  const reply = assessment?.suggested_response || '';
  const summary = `${row.photo_count} photos${assessment ? ` · Approximately ${assessment.approximate_item_count} items` : ' · Manual review needed'}`;
  const html = `<!doctype html><html lang="en"><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /></head><body style="margin:0;padding:0;background:#f7f5ef;color:#303a30;font:14px/1.4 Arial,sans-serif"><div style="max-width:600px;margin:0 auto;padding:16px;background:#fffefa"><p style="margin:0 0 5px;font-size:10px;letter-spacing:1px;color:#69755e">CHANGING PLACES · SUBMISSION #${escape(row.id)}</p><h1 style="margin:0;font:25px/1.2 Georgia,serif;color:#294e43">${escape(row.name)}</h1><p style="margin:5px 0;font-size:13px">${escape(summary)}</p>${contact ? `<p style="margin:0 0 8px;font-size:12px;overflow-wrap:anywhere">${contact}</p>` : ''}${row.notes ? `<p style="margin:8px 0;font-size:13px"><strong>Customer:</strong> ${escape(row.notes).replace(/\n/g, '<br />')}</p>` : ''}${items.length ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="table-layout:fixed">${itemRows}</table>` : `<p style="margin:10px 0;font-size:13px">${escape(assessment?.overview || 'AI review unavailable. Please screen the photos below.')}</p>`}${remaining.length ? `${items.length ? '<p style="margin:12px 0 2px;font-size:12px;font-weight:bold">More submitted photos</p>' : ''}${gallery(remaining)}` : ''}${requests.length ? `<div style="margin-top:14px"><h2 style="margin:0 0 4px;font-size:14px">To ask the customer</h2><ul style="margin:0;padding-left:18px;font-size:13px">${requests.map(request => `<li style="margin:3px 0">${escape(request)}</li>`).join('')}</ul></div>` : ''}${reply ? `<div style="margin-top:14px;padding-top:10px;border-top:1px solid #e6e7df"><h2 style="margin:0 0 5px;font-size:14px">Reply draft</h2><p style="margin:0;font-size:13px">${escape(reply).replace(/\n/g, '<br />')}</p></div>` : ''}<p style="margin:14px 0 0;font-size:11px;color:#74796e">Dots are AI suggestions. Staff decide. Nothing has been sent to the customer.</p></div></body></html>`;
  const text = `${title}\n${summary}\n${[row.phone, row.email].filter(Boolean).join(' · ')}${row.notes ? `\nCustomer: ${row.notes}` : ''}\n\n${items.map(item => `${fit[item.recommendation][2]} ${name(item)} — Photos ${item.photo_numbers.join(', ')}\n${item.assessment}${item.obvious_flaws.length ? `\nWatch: ${item.obvious_flaws.join('; ')}` : ''}`).join('\n\n') || 'Please screen the attached photos.'}${requests.length ? `\n\nTo ask the customer:\n${requests.map(value => `• ${value}`).join('\n')}` : ''}${reply ? `\n\nReply draft:\n${reply}` : ''}\n\nAll ${row.photo_count} numbered photos are included. Dots are AI suggestions. Staff decide. Nothing has been sent to the customer.`;
  return { from: env.INTAKE_EMAIL_FROM, to: env.INTAKE_NOTIFICATION_EMAIL, subject: title, ...(row.email ? { replyTo: row.email } : {}), html, text, attachments };
}

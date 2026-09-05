import { isValidEmail } from '../intake-shared.js';

const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);

const formatPhone = value => {
  const digits = String(value || '').replace(/\D/g, '');
  const local = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
  return local.length === 10 ? `${local.slice(0, 3)}-${local.slice(3, 6)}-${local.slice(6)}` : value;
};
const submittedLabel = seconds => {
  if (!Number.isFinite(seconds) || seconds <= 0) return '';
  const date = new Date(seconds * 1000);
  const day = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', month: 'long', day: 'numeric' }).format(date);
  const time = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', hour: 'numeric', minute: '2-digit' }).format(date);
  return `Submitted ${day} at ${time} CT`;
};

const fit = {
  likely_accept: ['#347854', 'Promising', '🟢'],
  likely_decline: ['#b34c3a', 'Unlikely fit', '🔴'],
  needs_review: ['#b88a24', 'Review', '🟡'],
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
  const title = `Web Submission #${row.id} - ${row.name} - ${row.photo_count} ${row.photo_count === 1 ? 'Photo' : 'Photos'}`;
  const items = assessment?.items || [];
  const photos = attachments.map((attachment, index) => ({ attachment, number: index + 1 }));
  const shown = new Set();
  // Merge groups sharing any photo so every submitted image appears only once.
  const groups = [];
  for (const item of items) {
    const linked = groups.filter(group => group.some(other => other.photo_numbers.some(number => item.photo_numbers.includes(number))));
    if (!linked.length) groups.push([item]);
    else {
      linked[0].push(item, ...linked.slice(1).flat());
      for (const group of linked.slice(1)) groups.splice(groups.indexOf(group), 1);
    }
  }
  const itemRows = groups.map(group => {
    const matching = [...new Set(group.flatMap(item => item.photo_numbers))].map(number => photos[number - 1]).filter(Boolean);
    matching.forEach(photo => shown.add(photo.number));
    const primary = matching[0];
    const notes = group.map(item => {
    const brand = item.likely_brand && !/unknown|label needed|not (visible|identified|clear)|unbranded/i.test(item.likely_brand) ? item.likely_brand : '';
    return `<div style="margin-bottom:9px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td valign="top" style="font:bold 16px/1.3 Arial,sans-serif;color:#294e43">${escape(name(item))}</td><td width="22" valign="top" align="right">${dot(item)}</td></tr></table>${brand ? `<div style="font-size:12px;color:#6c7568;margin-top:3px">${escape(brand)}</div>` : ''}<p style="margin:5px 0 0;font-size:13px;line-height:1.4;color:#606858">${escape(item.assessment)}</p></div>`;
    }).join('');
    return `<tr><td style="padding:10px 0;border-bottom:1px solid #e6e7df"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="table-layout:fixed"><tr>${primary ? `<td width="46%" valign="top" style="width:46%;padding-right:12px">${image(primary, 270)}${caption(primary)}</td>` : ''}<td valign="top" style="overflow-wrap:anywhere">${notes}</td></tr></table>${matching.length > 1 ? gallery(matching.slice(1)) : ''}</td></tr>`;
  }).join('');
  const remaining = photos.filter(photo => !shown.has(photo.number));
  const contact = [formatPhone(row.phone), row.email || 'No email provided'].filter(Boolean).join(' · ');
  const submitted = submittedLabel(row.submitted_at);
  const firstName = String(row.name || '').trim().split(/\s+/)[0];
  const followUp = isValidEmail(row.email)
    ? `Reply to this email to contact ${firstName} directly.`
    : `No email was provided. Call or text ${firstName} at ${formatPhone(row.phone)}.`;
  const actionPanel = `<div style="margin-top:16px;border-top:1px solid #dce4d6;background:#f1f3ec;padding:16px"><h2 style="margin:0 0 4px;font:bold 14px/1.4 Arial,sans-serif;color:#294e43">Ready to follow up?</h2><p style="margin:0;font-size:13px;line-height:1.5;color:#606858">${escape(followUp)}</p></div>`;
  const summary = `${row.photo_count} ${row.photo_count === 1 ? 'photo' : 'photos'}${assessment ? ` · Approximately ${assessment.approximate_item_count} ${assessment.approximate_item_count === 1 ? 'item' : 'items'}` : ' · Manual review needed'}`;
  const reviewNote = 'AI-assisted guidance based on submitted photos. Staff makes the final decision.';
  const legend = ['likely_accept', 'needs_review', 'likely_decline'].map(key => {
    const [color, label] = fit[key];
    return `<span style="white-space:nowrap"><span aria-hidden="true" style="color:${color};font-size:16px">●</span> ${label}</span>`;
  }).join(' · ');
  const reviewIntro = assessment ? `<div style="margin:12px 0 8px;padding:10px 12px;background:#f1f3ec;border-radius:4px"><h2 style="margin:0 0 4px;font:bold 11px/1.4 Arial,sans-serif;letter-spacing:0.7px;color:#294e43">PRELIMINARY PHOTO REVIEW</h2><p style="margin:0 0 5px;font-size:12px;line-height:1.5;color:#606858">${reviewNote}</p><p style="margin:0;font-size:12px;line-height:1.6;color:#303a30">${legend}</p></div>` : '';
  const html = `<!doctype html><html lang="en"><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /></head><body style="margin:0;padding:0;background:#f7f5ef;color:#303a30;font:14px/1.4 Arial,sans-serif"><div style="max-width:600px;margin:0 auto;padding:16px;background:#fffefa"><h1 style="margin:0;font:bold 25px/1.2 Georgia,serif;color:#294e43">${escape(row.name)}</h1><p style="margin:6px 0 3px;font-size:13px;line-height:1.5;overflow-wrap:anywhere">${escape(contact)}</p>${submitted ? `<p style="margin:0 0 14px;font-size:12px;line-height:1.5;color:#74796e">${escape(submitted)}</p>` : ''}<p style="margin:8px 0;font-size:13px"><strong>Notes:</strong> ${escape(row.notes || 'None provided').replace(/\n/g, '<br />')}</p>${reviewIntro}<p style="margin:10px 0 0;font-size:12px;color:#74796e">${escape(summary)}</p>${items.length ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="table-layout:fixed">${itemRows}</table>` : `<p style="margin:10px 0;font-size:13px">${escape(assessment?.overview || 'AI review unavailable. Please screen the photos below.')}</p>`}${remaining.length ? `${items.length ? '<p style="margin:12px 0 2px;font-size:12px;font-weight:bold">More submitted photos</p>' : ''}${gallery(remaining)}` : ''}${actionPanel}</div></body></html>`;
  const text = `${row.name}\n${contact}${submitted ? `\n${submitted}` : ''}\nNotes: ${row.notes || 'None provided'}\n${title}${assessment ? `\n\nPRELIMINARY PHOTO REVIEW\n${reviewNote}\n🟢 Promising · 🟡 Review · 🔴 Unlikely fit` : ''}\n${summary}\n\n${items.map(item => `${fit[item.recommendation][2]} ${name(item)} — Photos ${item.photo_numbers.join(', ')}\n${item.assessment}`).join('\n\n') || 'Please screen the attached photos.'}\n\nAll ${row.photo_count} numbered photos are included.\n\nReady to follow up?\n${followUp}`;
  return { from: env.INTAKE_EMAIL_FROM, to: env.INTAKE_NOTIFICATION_EMAIL, ...(isValidEmail(row.email) ? { replyTo: row.email } : {}), subject: title, html, text, attachments };
}

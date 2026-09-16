import { isValidEmail, formatPhone } from '../intake-shared.js';

const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);

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
const image = (photo, width) => `<img src="cid:${escape(photo.attachment.contentId)}" width="${width}" alt="Photo ${photo.number}" style="display:block;width:100%;max-width:${width}px;height:auto;border:0;border-radius:10px" />`;
const caption = photo => `<div style="font:11px/1.4 Arial,sans-serif;color:#5d5852;margin-top:6px">Photo ${photo.number}</div>`;
const gallery = photos => {
  let rows = '';
  for (let index = 0; index < photos.length; index += 2) {
    rows += `<tr>${photos.slice(index, index + 2).map(photo => `<td width="50%" valign="top" style="width:50%;padding:6px">${image(photo, 290)}${caption(photo)}</td>`).join('')}${photos.length - index === 1 ? '<td width="50%"></td>' : ''}</tr>`;
  }
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="table-layout:fixed">${rows}</table>`;
};

export function buildReviewEmail(env, row, assessment, attachments) {
  const title = `Web Submission #${row.id} - ${row.name} - ${row.photo_count} ${row.photo_count === 1 ? 'Photo' : 'Photos'}`;
  const items = assessment?.items || [];
  const photos = attachments.map((attachment, index) => ({ attachment, number: index + 1 }));
  const shown = new Set();
  // Anchor descriptions to each item's primary photo. Shared secondary views must
  // not merge unrelated primary photos or steal a photo from another item's row.
  const groups = new Map();
  for (const item of items) {
    const primaryNumber = item.photo_numbers[0];
    if (!groups.has(primaryNumber)) groups.set(primaryNumber, []);
    groups.get(primaryNumber).push(item);
  }
  const primaryNumbers = new Set(groups.keys());
  const itemRows = [...groups.entries()].map(([primaryNumber, group]) => {
    const numbers = [...new Set(group.flatMap(item => item.photo_numbers))];
    const matching = numbers
      .filter(number => number === primaryNumber || (!primaryNumbers.has(number) && !shown.has(number)))
      .map(number => photos[number - 1]).filter(Boolean);
    matching.forEach(photo => shown.add(photo.number));
    const primary = matching[0];
    const notes = group.map(item => {
      const brand = item.likely_brand && !/unknown|label needed|not (visible|identified|clear)|unbranded/i.test(item.likely_brand) ? item.likely_brand : '';
      return `<div style="margin-bottom:12px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="table-layout:fixed"><tr><td width="20" valign="top" style="width:20px;padding-top:2px">${dot(item)}</td><td valign="top"><div style="font:bold 16px/1.35 Arial,sans-serif;color:#2e5c50">${escape(name(item))}</div>${brand ? `<div style="font-size:12px;color:#5d5852;margin-top:4px">${escape(brand)}</div>` : ''}<p class="item-note" style="margin:7px 0 0;font:14px/1.5 Arial,sans-serif;color:#5d5852">${escape(item.assessment)}</p></td></tr></table></div>`;
    }).join('');
    return `<tr><td style="padding:0 0 12px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="table-layout:fixed;border:1px solid #e5ded5;border-radius:16px;border-collapse:separate;background:#ffffff"><tr><td style="padding:12px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="table-layout:fixed"><tr>${primary ? `<td class="photo-gap" width="46%" valign="top" style="width:46%;padding-right:14px">${image(primary, 270)}${caption(primary)}</td>` : ''}<td valign="top" style="word-wrap:break-word;overflow-wrap:anywhere">${notes}</td></tr></table>${matching.length > 1 ? gallery(matching.slice(1)) : ''}</td></tr></table></td></tr>`;
  }).join('');
  const remaining = photos.filter(photo => !shown.has(photo.number));
  const notes = row.notes ? `“${row.notes}”` : 'None provided';
  const phone = formatPhone(row.phone);
  const digits = String(row.phone || '').replace(/\D/g, '');
  const phoneTarget = digits.length === 10 ? `+1${digits}` : digits.length === 11 && digits.startsWith('1') ? `+${digits}` : `${String(row.phone || '').startsWith('+') ? '+' : ''}${digits}`;
  const textUrl = `https://changing-places-dsm.com/text-consignor#phone=${encodeURIComponent(phoneTarget)}`;
  const contact = [phone, row.email || 'No email provided'].filter(Boolean).join('\n');
  const contactLink = (href, label, action, style = '') => `<a href="${escape(href)}" aria-label="${escape(action)}" style="color:#2e5c50;text-decoration:underline;${style}">${escape(label)}</a>`;
  const actionStyle = 'display:inline-block;min-width:28px;white-space:nowrap;vertical-align:middle;text-align:center;padding:5px 14px;border:1px solid #2e5c50;border-radius:999px;background:#ffffff;text-decoration:none;font:bold 13px/20px Arial,sans-serif;';
  const contactDetails = [
    phone ? contactLink(`tel:${phoneTarget}`, phone, `Call ${row.name}`, 'display:block;white-space:nowrap;text-decoration:none;font-weight:bold') : '',
    row.email ? contactLink(`mailto:${encodeURIComponent(row.email)}`, row.email, `Email ${row.name}`, `display:block;max-width:100%;margin-top:${phone ? 2 : 0}px;word-wrap:break-word;overflow-wrap:anywhere`) : '<span style="display:block;margin-top:2px">No email provided</span>',
  ].join('');
  // A separate action column keeps button height out of the phone/email spacing.
  const contactHtml = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="table-layout:fixed"><tr><td valign="top" style="padding:0;font:14px/1.6 Arial,sans-serif;word-wrap:break-word;overflow-wrap:anywhere">${contactDetails}</td>${phone ? `<td class="contact-gap" width="16" style="width:16px;padding:0"></td><td class="contact-actions" width="124" align="right" valign="middle" style="width:124px;padding:0;white-space:nowrap;font-size:0;line-height:0">${contactLink(`tel:${phoneTarget}`, 'Call', `Call ${row.name}`, actionStyle)}${contactLink(textUrl, 'Text', `Text ${row.name}`, `${actionStyle}margin-left:8px;background:#2e5c50;color:#ffffff`)}</td>` : ''}</tr></table>`;
  const submitted = submittedLabel(row.submitted_at);
  const firstName = String(row.name || '').trim().split(/\s+/)[0];
  const followUp = isValidEmail(row.email)
    ? `Reply to this email to contact ${firstName} directly.`
    : `No email was provided. Call or text ${firstName} at ${formatPhone(row.phone)}.`;
  const actionPanel = `<div style="margin-top:12px;border-top:4px solid #f5c7aa;border-radius:16px;background:#2e5c50;padding:20px"><h2 style="margin:0 0 8px;font:bold 23px/1.25 Georgia,serif;color:#ffffff">Ready to follow up?</h2><p style="margin:0;font:14px/1.6 Arial,sans-serif;color:#fcfbfa">${escape(followUp)}</p></div>`;
  const summary = `${row.photo_count} ${row.photo_count === 1 ? 'photo' : 'photos'}${assessment ? ` · Approximately ${assessment.approximate_item_count} ${assessment.approximate_item_count === 1 ? 'item' : 'items'}` : ' · Manual review needed'}`;
  const reviewNote = 'AI-assisted guidance based on submitted photos. The final decision is yours.';
  const legendBackground = { likely_accept: '#edf5ef', needs_review: '#fff5df', likely_decline: '#fceee8' };
  const legend = ['likely_accept', 'needs_review', 'likely_decline'].map(key => {
    const [color, label] = fit[key];
    return `<span style="display:inline-block;white-space:nowrap;margin:4px 6px 0 0;padding:4px 9px;border-radius:999px;background:${legendBackground[key]}"><span aria-hidden="true" style="color:${color};font-size:14px">●</span> ${label}</span>`;
  }).join(' ');
  const reviewIntro = assessment ? `<div style="margin:24px 0 14px"><h2 style="margin:0 0 7px;font:bold 11px/1.5 Arial,sans-serif;letter-spacing:1.3px;color:#8a4c36">PRELIMINARY PHOTO REVIEW</h2><p style="margin:0 0 6px;font:13px/1.6 Arial,sans-serif;color:#5d5852">${reviewNote}</p><p style="margin:0;font:12px/1.6 Arial,sans-serif;color:#2b2b2b">${legend}</p></div>` : '';
  // Keep essential styling inline and the photo layout table-based. Media queries
  // only tighten spacing; the email remains usable when a client strips the head.
  const html = `<!doctype html><html lang="en"><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
<style>@media screen and (max-width:600px){.email-gutter{padding:12px 8px!important}.email-content{padding:22px 18px!important}.email-name{font-size:29px!important}.contact-gap{width:12px!important}.photo-gap{padding-right:10px!important}.item-note{font-size:13px!important}}</style>
</head><body style="margin:0;padding:0;background:#f8f5f1;color:#2b2b2b;font:14px/1.5 Arial,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#f8f5f1"><tr><td class="email-gutter" align="center" style="padding:28px 12px">
<!--[if mso]><table role="presentation" width="640" cellpadding="0" cellspacing="0"><tr><td><![endif]-->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#ffffff" style="max-width:640px;table-layout:fixed;border:1px solid #e5ded5;border-radius:24px;border-collapse:separate;text-align:left">
<tr><td style="padding:0"><table role="presentation" aria-hidden="true" width="100%" cellpadding="0" cellspacing="0"><tr><td width="60%" height="7" bgcolor="#2e5c50" style="height:7px;line-height:7px;font-size:0;border-top-left-radius:24px">&nbsp;</td><td width="20%" height="7" bgcolor="#8da597" style="height:7px;line-height:7px;font-size:0">&nbsp;</td><td width="20%" height="7" bgcolor="#f5c7aa" style="height:7px;line-height:7px;font-size:0;border-top-right-radius:24px">&nbsp;</td></tr></table></td></tr>
<tr><td class="email-content" style="padding:26px;word-wrap:break-word;overflow-wrap:anywhere">
<h1 class="email-name" style="margin:0;font:bold 32px/1.2 Georgia,serif;color:#2b2b2b">${escape(row.name)}</h1>
<div style="margin:14px 0 8px">${contactHtml}</div>
${submitted ? `<p style="margin:0 0 20px;font:12px/1.5 Arial,sans-serif;color:#5d5852">${escape(submitted)}</p>` : ''}
<div style="margin:18px 0 0;padding:14px 16px;border-left:3px solid #f5c7aa;border-radius:0 12px 12px 0;background:#fff3ea"><p style="margin:0;font:14px/1.6 Arial,sans-serif;color:#2b2b2b"><strong style="color:#8a4c36">Notes:</strong> ${escape(notes).replace(/\n/g, '<br />')}</p></div>
${reviewIntro}<p style="margin:18px 0 10px;font:12px/1.5 Arial,sans-serif;color:#5d5852">${escape(summary)}</p>
${items.length ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="table-layout:fixed">${itemRows}</table>` : `<p style="margin:10px 0;font:14px/1.6 Arial,sans-serif;color:#5d5852">${escape(assessment?.overview || 'AI review unavailable. Please screen the photos below.')}</p>`}
${remaining.length ? `${items.length ? '<p style="margin:12px 0 6px;font: bold 13px/1.5 Arial,sans-serif;color:#2e5c50">More submitted photos</p>' : ''}${gallery(remaining)}` : ''}
${actionPanel}<p style="margin:20px 0 0;text-align:center;font:11px/1.5 Arial,sans-serif;letter-spacing:1px;color:#5d5852">CHANGING PLACES CONSIGNMENT SHOP</p>
</td></tr></table><!--[if mso]></td></tr></table><![endif]-->
</td></tr></table></body></html>`;
  const text = `${row.name}\n${contact}${submitted ? `\n${submitted}` : ''}\nNotes: ${notes}\n${title}${assessment ? `\n\nPRELIMINARY PHOTO REVIEW\n${reviewNote}\n🟢 Promising  🟡 Review  🔴 Unlikely fit` : ''}\n${summary}\n\n${items.map(item => `${fit[item.recommendation][2]} ${name(item)} — Photos ${item.photo_numbers.join(', ')}\n${item.assessment}`).join('\n\n') || 'Please screen the attached photos.'}\n\nAll ${row.photo_count} numbered photos are included.\n\nReady to follow up?\n${followUp}`;
  return { from: env.INTAKE_EMAIL_FROM, to: env.INTAKE_NOTIFICATION_EMAIL, ...(isValidEmail(env.INTAKE_BCC_EMAIL) && env.INTAKE_BCC_EMAIL.toLowerCase() !== env.INTAKE_NOTIFICATION_EMAIL.toLowerCase() ? { bcc: [env.INTAKE_BCC_EMAIL] } : {}), ...(isValidEmail(row.email) ? { replyTo: row.email } : {}), subject: title, html, text, attachments };
}

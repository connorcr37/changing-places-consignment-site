const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);

export function consignorReplyTo(email) {
  return typeof email === 'string' && /^[^\s@<>,;:"\\]+@[^\s@<>,;:"\\]+\.[^\s@<>,;:"\\]+$/.test(email) ? email : undefined;
}

// This module deliberately receives no assessment: both message bodies are safe to quote.
export function buildReviewEmail(env, row, photos, reportAttachment) {
  const replyTo = consignorReplyTo(row.email);
  const gallery = [];
  for (let index = 0; index < photos.length; index += 2) {
    const cells = photos.slice(index, index + 2).map((photo, offset) => `<td width="50%" valign="top" style="width:50%;padding:4px"><img src="cid:${escape(photo.contentId)}" width="290" alt="Photo ${index + offset + 1}" style="display:block;width:100%;max-width:290px;height:auto;border:0;border-radius:4px" /><p style="margin:4px 0 8px;font:12px Arial,sans-serif;color:#687367">Photo ${index + offset + 1}</p></td>`).join('');
    gallery.push(`<tr>${cells}${photos.length - index === 1 ? '<td width="50%"></td>' : ''}</tr>`);
  }
  const html = `<!doctype html><html lang="en"><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /></head><body style="margin:0;background:#f7f5ef;color:#303a30;font:14px/1.5 Arial,sans-serif"><div style="max-width:600px;margin:0 auto;padding:16px;background:#fffefa"><p style="margin:0 0 5px;font-size:11px;color:#687367">CHANGING PLACES · SUBMISSION #${escape(row.id)}</p><h1 style="margin:0;font:25px/1.2 Georgia,serif;color:#294e43">${escape(row.name)}</h1><p style="margin:8px 0;overflow-wrap:anywhere"><strong>Phone:</strong> ${escape(row.phone || 'Not provided')}<br /><strong>Email:</strong> ${escape(row.email || 'Not provided')}</p><p style="margin:8px 0"><strong>Notes:</strong> ${escape(row.notes || 'None provided').replace(/\n/g, '<br />')}</p><h2 style="margin:14px 0 6px;font:bold 15px Arial,sans-serif">${escape(row.photo_count)} submitted photos</h2><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="table-layout:fixed">${gallery.join('')}</table></div></body></html>`;
  const text = `Changing Places - Submission #${row.id}\n${row.name}\nPhone: ${row.phone || 'Not provided'}\nEmail: ${row.email || 'Not provided'}\nNotes: ${row.notes || 'None provided'}\n\n${row.photo_count} submitted photos are included, numbered in submission order.`;
  return {
    from: env.INTAKE_EMAIL_FROM, to: env.INTAKE_NOTIFICATION_EMAIL,
    subject: `Your Changing Places Submission #${row.id}`,
    ...(replyTo ? { replyTo } : {}), html, text,
    attachments: [...photos, ...(reportAttachment ? [reportAttachment] : [])],
  };
}

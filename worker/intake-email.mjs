import { buildReviewEmail } from './intake-email-layout.mjs';
import { buildAssessmentPdf } from './intake-report.mjs';
export { buildReviewEmail };

export async function sendReviewEmail(env, row, assessment) {
  const attachments = [];
  for (let ordinal = 1; ordinal <= row.photo_count; ordinal++) {
    const photo = await env.INTAKE_PHOTOS.get(`${row.upload_id}/${ordinal}-email.jpg`);
    if (!photo || photo.size > 100000) throw new Error('email_photo_unavailable');
    // Give the Worker binding actual JPEG bytes so it controls transfer encoding.
    attachments.push({ content: new Uint8Array(await photo.arrayBuffer()), filename: `submission-${row.id}-photo-${String(ordinal).padStart(2, '0')}.jpg`, type: 'image/jpeg', disposition: 'inline', contentId: `photo-${ordinal}@changing-places` });
  }
  const report = { content: await buildAssessmentPdf(row, assessment), filename: `AI-Assessment-${row.id}.pdf`, type: 'application/pdf', disposition: 'attachment' };
  await env.INTAKE_EMAIL.send(buildReviewEmail(env, row, attachments, report));
}

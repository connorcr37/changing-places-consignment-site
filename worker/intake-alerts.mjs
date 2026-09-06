import { INTAKE_RETENTION_SECONDS } from './intake-utils.mjs';

const now = () => Math.floor(Date.now() / 1000);

export function buildDeliveryAlert(env, row) {
  const expires = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', dateStyle: 'long' }).format(new Date((row.submitted_at + INTAKE_RETENTION_SECONDS) * 1000));
  return {
    from: env.INTAKE_EMAIL_FROM,
    to: env.INTAKE_ALERT_TO,
    subject: `Action needed: Changing Places submission #${row.id}`,
    text: `We couldn't confirm delivery of the store's email for submission #${row.id} after five attempts.\n\n${row.photo_count} submitted photos and the saved review remain in private storage until ${expires}.\n\nPlease check the email service and recipient settings, then retry this submission using the delivery recovery steps in INTAKE.md. Check the inbox first to avoid sending a duplicate. No reply has been sent to the consignor.`,
  };
}

// A durable lease prevents routine duplicate alerts. Retry a failed alert independently
// of the exhausted report, including after an email-service outage has ended.
export async function alertDeliveryFailure(env, uploadId) {
  if (!env.INTAKE_ALERT_EMAIL || !env.INTAKE_ALERT_TO) return;
  const query = (sql, ...args) => env.INTAKE_DB.prepare(sql).bind(...args);
  const row = await query("UPDATE intake_submissions SET alert_after=?,alert_attempts=alert_attempts+1 WHERE upload_id=? AND state IN ('ready','needs_review') AND notification_sent=0 AND notification_attempts>=5 AND alert_sent=0 AND alert_after<=? AND submitted_at>? RETURNING *", now() + 120, uploadId, now(), now() - INTAKE_RETENTION_SECONDS).first();
  if (!row) return;
  try {
    await env.INTAKE_ALERT_EMAIL.send(buildDeliveryAlert(env, row));
    await query('UPDATE intake_submissions SET alert_sent=1 WHERE upload_id=?', uploadId).run();
  } catch {
    await query('UPDATE intake_submissions SET alert_after=? WHERE upload_id=?', now() + Math.min(3600, 300 * 2 ** Math.min(row.alert_attempts - 1, 4)), uploadId).run();
    console.error(JSON.stringify({ event: 'intake_delivery_alert_failed', submissionId: row.id }));
  }
}

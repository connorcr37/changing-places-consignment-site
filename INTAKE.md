# Photo submissions by email

`/submit-items` is a standalone, noindex page. It is intentionally absent from the navigation, footer, and sitemap. Consignors provide a name, phone and/or email, optional notes, consent, and 1–30 photos. JPG, PNG, and WebP are supported; HEIC must be exported as JPEG first.

The consignor sees a thank-you once the complete batch has been durably saved. The store receives **one email** titled `Your Changing Places Submission #…`. Its compact phone layout contains only the consignor's name, phone, email, notes, and all numbered photos in submission order. The submission number keeps separate submissions distinguishable. No AI-generated content appears in the subject, HTML body, or plain-text body.

The private **AI Assessment** PDF attachment contains the approximate item count, item names and photo references, green/yellow/red fit dots, useful category/brand information, and one brief sentence about visible cleanliness, condition, and meaningful flaws per item. Optional comparable-new and used-resale ranges are broad model estimates for the entire named item/group, not researched listings or appraisals. Weak or malformed evidence suppresses pricing. Up to three concise follow-up questions and a reply draft under 40 words appear at the end. Questions prioritize visible condition, then unanswered delivery/pickup, timing, smoke-free-home, move-out timing, or original-price questions. Measurements/materials are requested only when they could change acceptance. The PDF is titled **AI Assessment**, named `AI-Assessment-<number>.pdf`, and marked **Private - do not forward** inside.

The message's **Reply-To** is the consignor's validated email address. The store uses the normal **Reply** button; there are no compose buttons. Replying ordinarily omits the PDF attachment, but behavior depends on the mail client and forwarding can carry it along. Review outgoing attachments before sending. The From address remains the store's authenticated intake sender. Phone-only submissions omit Reply-To and show the provided phone number. The AI never sends a consignor reply. There is no staff login or dashboard.

## Infrastructure

- OpenAI project: **Changing Places Site Intake**. Local key is in ignored `.dev.vars`; production uses the encrypted `OPENAI_API_KEY` Worker secret.
- Cloudflare D1: `changing-places-intake`, binding `INTAKE_DB`.
- Private R2 bucket: `changing-places-intake-photos`, binding `INTAKE_PHOTOS`. Do not enable public access.
- Queue: `changing-places-intake`, binding `INTAKE_QUEUE`. Consumer concurrency and batch size are 1 to bound memory use.
- Email binding `INTAKE_EMAIL` restricts delivery to `connorcr37+cpcs@gmail.com`. This destination is verified, and Email Routing is active on `changing-places-dsm.com`. The recipient confirmed that both photos display in the corrected test email on September 5, 2026. Send JPEG bytes to the Worker binding; pre-encoded base64 strings caused unreadable images.
- `INTAKE_ENABLED=true` opens the unlinked pilot form. Set it to `false` to pause new submissions.
- Model defaults to `gpt-4.1-mini` and is configurable through `OPENAI_INTAKE_MODEL`.

## Processing and privacy

The browser prepares a detailed JPEG for the AI (up to 1600 pixels / 600 KB) and an email copy (up to 1200 pixels / 100 KB). Sequential uploads avoid one large request. Thirty email copies plus the text-only PDF fit within the email service's 5 MiB limit and 32-attachment limit. The PDF references the numbered email photos instead of duplicating their image bytes. It is generated in memory with pdf-lib inside the Worker, never uploaded or sent to another conversion service. Standard PDF fonts cover Latin characters; unsupported characters in the private report are represented as Unicode code points so unusual text cannot block email delivery. The original name and notes remain intact in the email. Resizing strips original EXIF metadata. No public photo URLs exist.

Only photos and optional notes go to OpenAI; name, phone, and email fields do not. Requests use Structured Outputs and `store:false`. The prompt groups duplicate views, asks for missing labels and measurements, distinguishes observations from guesses, and reserves final decisions for staff. The store criteria live in `worker/intake-ai.mjs`.

Upload capabilities expire in two hours and only authorize writing that batch. Same-origin checks, bounded streaming reads, server-side validation, a honeypot, and a pilot limit of 3 starts per IP per hour / 20 starts globally per day bound abuse. Interrupted uploads can resume using Retry while the page stays open. Reloading requires reselecting photos.

D1 is the durable outbox: cron recovery every five minutes requeues work missed by the queue. AI errors retry up to three times; persistent errors send the photos and a manual-review notice. Email errors retry up to five times without rerunning a saved AI assessment. Failed attempts log only event names and submission numbers. Email delivery is at least once; an ambiguous provider timeout can produce a duplicate email, so identify submissions by their number.

Incomplete uploads are deleted after one day. Every submitted web record—including private R2 image copies, contact details, notes, and the saved assessment—is deleted after 30 days. Emails remain in the recipient mailbox. The retention job runs every five minutes in bounded batches.

## Verification

```powershell
npm ci
node --test tests/intake.test.mjs tests/facebook-feed.test.mjs
node scripts/sync-shared-shell.mjs --check
node scripts/audit-site.mjs
node --check worker/intake.mjs
node --check worker/intake-ai.mjs
node --check worker/intake-email.mjs
node --check worker/intake-report.mjs
node --check intake-form.js
```

Use Wrangler v4, run `wrangler d1 migrations apply INTAKE_DB --local` for local development, and `--remote` before release. Keep local persistent state outside the asset root, as described in README.md. Wrangler's `secrets.required` includes both Facebook and OpenAI secrets.

For release checks, verify a synthetic email has the correct Reply-To, only consignor-safe content in both bodies, all numbered photos, and a separate AI Assessment PDF. Render a representative PDF and check page breaks, legibility, and the privacy footer. No consignor decision/reply is sent automatically. Use the existing GitHub/Cloudflare release process and preserve unrelated site edits.

## Delivery recovery

Inspect failures with a read-only D1 query:

```sql
SELECT id, state, analysis_attempts, notification_attempts
FROM intake_submissions
WHERE submitted_at IS NOT NULL AND notification_sent = 0;
```

After fixing email configuration, reset `notification_attempts=0`, `processing_until=0`, and `updated_at=0` for only the affected submission IDs. The next scheduled run resends their emails using the saved assessments. Do not replay already-delivered submissions. Verify `notification_sent=1` after the retry.

# Photo submissions by email

`/submit-items` is a standalone, noindex page. Public links are held until the business recipient is verified (see launch status below). Consignors provide a name, phone and/or email, optional notes, consent, and 1–30 photos. JPG, PNG, WebP, and HEIC/HEIF are supported. The browser tries native decoding first, then lazily loads the pinned, self-hosted HEIC decoder when needed. Original photos are never sent to an external conversion service. RAW photos and videos are not supported.

The consignor sees a thank-you once the complete batch has been durably saved. The store receives **one private email** titled `Web Submission #… - Name - … Photos`. Its compact phone layout puts numbered photos beside item names, green/yellow/red dots, and brief AI screening notes. Items sharing a primary photo appear together; each primary photo stays beside its own descriptions. Additional views and unassigned photos are retained without repeating images. Known brands and meaningful flaws appear when relevant. The fuller structured assessment stays in private storage. There is no staff login or dashboard. The AI never sends a consignor reply.

The email starts with the consignor name, phone, email and notes, including in realistic synthetic tests. Each item has one brief sentence about visible cleanliness/condition and meaningful flaws. The analysis and email omit pricing, follow-up questions, and reply drafts.

The contact header shows the phone number once with separate **☎️ Call** (`tel:`) and **💬 Text** (`sms:`) links, separated by spacing only. The email address appears below as a plain, pre-addressed `mailto:` link with no subject or body parameters; the submission timestamp follows. Missing phone details omit the call/text row, and missing email displays “No email provided”.

A pale-green action panel follows the final photo, with a thin divider and 16px padding. It says “Ready to follow up?” and reminds the recipient to reply to contact the consignor by first name. Without an email, it instead gives the consignor's formatted phone number for calling or texting.

The report sets `Reply-To` to the consignor's validated email address, so the store uses its mail app's normal **Reply** button. There are no compose buttons. Normal replies may quote the review body. Phone-only submissions omit Reply-To and show the provided phone number with “No email provided”. No message is sent automatically. After each intake-email update, send one fresh test submission to `connorcr37+cpcs@gmail.com` and confirm processing and notification delivery.

## Infrastructure

- OpenAI project: **Changing Places Site Intake**. Local key is in ignored `.dev.vars`; production uses the encrypted `OPENAI_API_KEY` Worker secret.
- Cloudflare D1: `changing-places-intake`, binding `INTAKE_DB`.
- Private R2 bucket: `changing-places-intake-photos`, binding `INTAKE_PHOTOS`. Do not enable public access.
- Queue: `changing-places-intake`, binding `INTAKE_QUEUE`. Consumer concurrency and batch size are 1 to bound memory use.
- Email binding `INTAKE_EMAIL` restricts delivery to `connorcr37+cpcs@gmail.com`. This destination is verified, and Email Routing is active on `changing-places-dsm.com`. The recipient confirmed that both photos display in the corrected test email on September 5, 2026. Send JPEG bytes to the Worker binding; pre-encoded base64 strings caused unreadable images.
- `INTAKE_BCC_EMAIL` is the monitoring recipient. BCC is omitted when it matches To to avoid duplicate copies during the pilot. At public launch, To changes to `ChangingPlacesDSM@gmail.com`, with Connor remaining BCC. `INTAKE_ALERT_EMAIL` is a separate, restricted send binding for operational alerts to `INTAKE_ALERT_TO` (`connorcr37+cpcs@gmail.com`).
- `INTAKE_ENABLED=true` opens the unlinked pilot form. Set it to `false` to pause new submissions.
- Model defaults to `gpt-5.6-luna` with low text verbosity and is configurable through `OPENAI_INTAKE_MODEL`.

## Processing and privacy

The browser prepares a detailed JPEG for the AI (up to 1600 pixels / 600 KB) and an email copy (up to 1200 pixels / 100 KB). Sequential uploads avoid one large request. Thirty email copies fit within the email service's size limit. Resizing strips original EXIF metadata. Public validation rules and photo limits live in `intake-shared.js`, shared by the browser and Worker. Storage keys and bounded body reading live in `worker/intake-utils.mjs`. No public photo URLs exist.

Only photos and optional notes go to OpenAI; name, phone, and email fields do not. Requests use Structured Outputs and `store:false`. The prompt groups duplicate views, counts physical pieces, links items to numbered photos, distinguishes observations from guesses, and reserves final decisions for staff. The store criteria live in `worker/intake-ai.mjs`.

Upload capabilities expire in two hours and only authorize writing that batch. Same-origin checks, bounded streaming reads, server-side validation, a honeypot, and a limit of 3 starts per IP per hour / 50 starts globally per day bound abuse. Limits use fixed UTC hour/day windows; the form displays the actual reset time in the visitor's timezone and offers the shop's text/email alternatives. Idempotent retries do not count as new starts. Interrupted uploads can resume using Retry while the page stays open. Reloading requires reselecting photos.

D1 is the durable outbox: cron recovery every five minutes requeues work missed by the queue. AI errors retry up to three times; persistent errors send the photos and a manual-review notice. Email errors retry up to five times without rerunning a saved AI assessment. Failed attempts log only event names and submission numbers. Email delivery is at least once; an ambiguous provider timeout can produce a duplicate email, so identify submissions by their number.

After five failed report sends, an operational alert identifies the submission and storage expiry date. The alert has its own durable lease and retries, backing off from five minutes to one hour until successful or until the submission expires. Recovery handles alerts even if the queue is unavailable. Alert state is part of the submission and shares its 30-day deletion. An email-service outage may delay the alert too. These alerts cover application send failures; provider acceptance does not prove inbox delivery or detect later bounces.

Incomplete uploads are deleted after one day. Every submitted web record—including private R2 image copies, contact details, notes, and the saved assessment—is deleted after 30 days. Emails remain in the recipient mailbox. The retention job runs every five minutes in bounded batches, before queue recovery; queue outages and individual deletion failures do not block other cleanup. Expired submissions are never analyzed or emailed.

## Verification

```powershell
node --test tests/intake.test.mjs tests/facebook-feed.test.mjs
node scripts/sync-shared-shell.mjs --check
node scripts/audit-site.mjs
node --check worker/intake.mjs
node --check worker/intake-ai.mjs
node --check worker/intake-email.mjs
node --check intake-form.js
```

Use Wrangler v4, run `wrangler d1 migrations apply INTAKE_DB --local` for local development, and `--remote` before release. Keep local persistent state outside the asset root, as described in README.md. Wrangler's `secrets.required` includes both Facebook and OpenAI secrets.

For browser checks, run `node scripts/test-intake-browser.cjs` with Playwright installed (or available through `NODE_PATH`). This uses mocked API responses and sends no real emails. It covers mobile previews, validation, interrupted retries, rejected-photo recovery, actual limit messaging, JPEG/PNG/WebP/HEIC, EXIF orientation, a 30-HEIC batch, damaged HEIC recovery, and conversion under both production CSP policies. Set `INTAKE_PHONE_PHOTO` to an additional full-resolution HEIC file to include it. Synthetic fixtures are in `tests/fixtures/`. Physical iPhone and Android device checks remain a useful final hands-on check; browser emulation is not a physical-device test.

For release checks, submit a test batch and verify the email includes the compact screening assessment and all numbered photos. No consignor decision/reply is sent automatically. Use the existing GitHub/Cloudflare release process and preserve unrelated site edits.

## Delivery recovery

Inspect failures with a read-only D1 query:

```sql
SELECT id, state, analysis_attempts, notification_attempts
FROM intake_submissions
WHERE submitted_at IS NOT NULL AND notification_sent = 0;
```

After fixing email configuration, reset `notification_attempts=0`, `processing_until=0`, and `updated_at=0` for only the affected submission IDs. The next scheduled run resends their emails using the saved assessments. Do not replay already-delivered submissions. Verify `notification_sent=1` after the retry.

## Public launch status — September 5, 2026

The business address `ChangingPlacesDSM@gmail.com` has been sent a Cloudflare verification email but is still unverified. The user does not control that mailbox. Keep To set to Connor until verification is confirmed; public links remain unpublished.

`launch/intake-public.patch` prepares the approved, small homepage/selling-page links and switches the report recipient to the business with Connor BCC. It retains text/email alternatives and makes no layout changes. Once Cloudflare confirms verification, apply the patch, run the site checks, deploy through GitHub, and submit a fresh form to verify business delivery plus BCC. Do not apply while the store cannot receive submissions. Keep the form out of the sitemap and header/footer navigation.

The HEIC decoder and corresponding source/license materials are pinned in `vendor/heic-to/1.5.2/`; see its README before updating. JPEG/PNG/WebP submissions do not download the decoder. No `unsafe-eval` CSP allowance is used.

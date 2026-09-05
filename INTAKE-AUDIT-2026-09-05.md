# Intake audit — September 5, 2026

Reviewed the form, photo preparation and upload sessions, Worker routes, queue recovery, retention, AI schema, email rendering, privacy copy, deployment configuration, and tests.

## Issues corrected

- **Email validation mismatch:** the API accepted some email strings that the email renderer would reject for Reply-To. The browser, API, and renderer now share one validator. Phone validation also runs before upload starts.
- **Retention depended on queue health:** queue recovery ran before expiry, so a failed queue send could prevent cleanup. Cleanup now runs first, works without a queue binding, and isolates individual deletion failures. Expired submissions cannot be analyzed, emailed, or requeued.
- **Repeated email photos:** item groups could repeat an image when their photo references overlapped. Each item now stays anchored to its primary photo. Primary photos are reserved for their own rows, and shared additional views appear once without merging unrelated item descriptions.
- **Tall mobile previews:** the HTML image height overrode the intended square thumbnails. CSS now scales height with width.
- **Rejected-photo retry trap:** a 413 response left the form locked to the same upload session. It now unlocks the selection so a consignor can replace the rejected photo.
- **Availability race:** a delayed configuration response could enable the submit button while photos were being prepared. Availability now uses the same locking function as preparation and upload.
- **Singular wording:** one-photo/one-item emails now use singular labels.

## DRY and consistency changes

- Added a public shared module for photo limits and contact validation; the form uses an ES module and the Worker imports the same rules.
- Centralized photo object keys so upload, email delivery, and deletion cannot drift apart.
- Moved bounded-body reading out of the AI module into a general Worker utility.
- Consolidated intake availability checks and named upload-session and retention durations.
- Updated the operational notes and added a repeatable browser test script.

## Confirmed

- Intake remains unlinked and noindex; the public API exposes neither photos nor saved assessments.
- Upload authorization is scoped to a batch, and retries preserve completed photo uploads.
- Photos are resized to separate analysis/email limits, with metadata removed through canvas encoding.
- AI still receives only photos and optional notes, uses GPT-5.6 Luna with low verbosity, strict structured output, and disabled response storage.
- Pricing, follow-up questions, reply drafts, compose buttons, and PDF generation are absent from the active pipeline.
- Reply-To and the final action panel use the consignor's contact details; phone-only submissions explicitly show “No email provided.”
- Web data expires after 30 days and incomplete uploads after one day. Existing mailbox copies are separate, as disclosed in the privacy policy.
- The original database migration retains inert columns from the abandoned staff-dashboard design. No active route or code reads or writes them; removing historical columns would require a separate database migration and offers no runtime benefit.

## Verification

50 Node tests cover intake and shared Worker routing, including new regressions for validation consistency, expiry during queue outages, deletion retries, and overlapping photo references with distinct primary photos. Browser checks cover real photo preparation at phone and desktop widths, successful retry after a dropped completion response, invalid contact details, rejected-photo recovery, 30-photo limits, and clear/remove actions. Shared-shell and static-site audits also pass.

Email-client rendering can vary; the browser checks complement a fresh delivery through the production intake pipeline.

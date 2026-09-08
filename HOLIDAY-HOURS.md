# Holiday hours, announcements, and staff access

## Current setup and remaining activation

The feature uses the existing Cloudflare Worker and D1 database and has passed its
local implementation checks. Production releases follow the repository's Git workflow.
The new **CPCS Website** Google Cloud project was created on September 8, 2026:

- Project ID: `cpcs-website-508013`
- Project number: `688879808648`
- Initial website owner: `connorcr37@gmail.com`
- Production staff URL: `https://changing-places-dsm.com/admin`

Do not use `cpc-new-inventory-audit` for this website.

OAuth branding, the Web application client, callback URLs, scope declarations,
and the initial owner test user are configured. The owner accepted Google's policy
and downloaded the credential; local secrets are in ignored `.dev.vars`.
The Business Profile API access application was submitted September 8, 2026 for
the verified Changing Places profile at 3250 100th Street. Google's confirmation
estimates 7–10 business days for review. The production Google secrets and additive
database migration are configured. Business Profile API approval and enabling the
required APIs remain outstanding.
Real Google listing writes and real invitation delivery have not been tested or performed.
Real Google staff sign-in was verified locally through the Cloudflare Worker and D1.
All 81 Node tests, both site/admin browser suites, the site/shared-shell audits, and
the Cloudflare deployment dry run pass.

## Google Cloud: exact screens and values

### 1. Google Auth Platform configuration

Open [Google Auth Platform](https://console.cloud.google.com/auth/overview?project=cpcs-website-508013)
with **CPCS Website** selected. The saved configuration uses:

| Setting | Value |
| --- | --- |
| App name | Changing Places Website Admin |
| User support email | connorcr37@gmail.com |
| Audience | External (this project is not in a Google Workspace organization) |
| Developer/contact email | connorcr37@gmail.com |

The owner completed Google's policy agreement. Under **Branding**, these values
are saved:

| Setting | Value |
| --- | --- |
| Application home page | `https://changing-places-dsm.com/` |
| Privacy policy | `https://changing-places-dsm.com/privacy` |
| Authorized domain | `changing-places-dsm.com` |
| Logo | Optional; the shop logo can be added if needed |

Do not invent a terms-of-service URL. The site currently has no such page. Domain
ownership verification may be requested by Google; use the shop's verified domain
owner account in Search Console if prompted.

Under **Audience → Test users**, `connorcr37@gmail.com` is configured. Add each
Google account that will connect Business Profile during testing. A website staff invitation does not add someone
to Google's test-user list. Before routine staff use, change the Google app's
publishing status to **In production** and complete any verification Google requires.
Google's Testing mode expires Business Profile refresh tokens after seven days;
the basic sign-in scopes are an exception. Reconnect Business Profile after switching
to production. OAuth verification and Business Profile API approval are separate.
See [Google's refresh-token rules](https://developers.google.com/identity/protocols/oauth2#expiration).

### 2. Configure scopes

Under **Google Auth Platform → Data Access**, these scopes are saved:

- `openid`
- `https://www.googleapis.com/auth/userinfo.email`
- `https://www.googleapis.com/auth/business.manage`

The app requests `openid email` for staff login. It requests `business.manage` with
offline access only when a signed-in staff member clicks **Connect Google Business
Profile**. Staff do not have to grant Business Profile access just to edit website
announcements. There is no need for Gmail, Drive, Calendar, Maps/Places, service
account keys, or the Google Cloud `cloud-platform` scope.

The Business Profile scope is Google's official permission for hours and local
posts; Google does not offer a narrower holiday-hours-only scope.
See [Business Profile OAuth](https://developers.google.com/my-business/content/implement-oauth).

### 3. Create the OAuth client

The owner created **Google Auth Platform → Clients → CPCS Website Admin** with:

| Setting | Value |
| --- | --- |
| Application type | Web application |
| Name | CPCS Website Admin |
| Authorized redirect URI (production) | `https://changing-places-dsm.com/api/admin/oauth/callback` |
| Authorized redirect URI (optional local testing) | `http://localhost:8787/api/admin/oauth/callback` |
| Authorized JavaScript origins | Leave blank; this app uses a server-side redirect flow |

The same callback handles staff login and the separately initiated Business Profile
connection. The URI must match exactly, including scheme, host, path, and port.
Do not add a trailing slash, `/admin`, a preview domain, or OAuth Playground as the
callback. For local OAuth testing, browse **localhost**, not `127.0.0.1`, and set
the local override `--var APP_ORIGIN:http://localhost:8787` when starting Wrangler.

The downloaded client credentials were validated and loaded into ignored local
configuration. Store the production values using the secret settings below.
Do not paste the client secret into a chat, source file, or Git.
See [Google's server-side OAuth flow](https://developers.google.com/identity/protocols/oauth2/web-server).

### 4. Request Business Profile API access

The application is submitted and awaiting Google's review. Do not submit duplicates.
Google's [current access workflow](https://support.google.com/business/workflow/16726127)
asks you to confirm the Google account, select its verified business, and provide
the following project/company information. Its last Continue button submits the
request and opens a support case.

- Use project number **688879808648** (not the project ID).
- Project ID: **cpcs-website-508013**.
- Business: **Changing Places Consignment Shop**.
- Website: `https://changing-places-dsm.com/`.
- Purpose: authorized shop staff maintain special opening hours and optional store
  announcements for their own Business Profile from the shop website's staff admin.
- Apply using an email that is an owner/manager of the shop's verified Business Profile.
  Website admin access by itself does not grant access to the Google listing.
- Google currently requires a verified, active profile aged at least 60 days and a
  matching business website. Keep the listing complete and current.

Approval is granted by Google. In **APIs & Services → the Business Profile API →
Quotas & System Limits**, a zero request quota indicates the project is not approved.
Google's prerequisite page describes 300 QPM as the approved default. Do not treat
an enabled API or a working Google login as proof that Business Profile access was approved.

### 5. Enable APIs in the new project

After approval, open **APIs & Services → Library**, find each API, and choose Enable.
These three are called by this feature:

| API | Service name | Used for |
| --- | --- | --- |
| My Business Account Management API | `mybusinessaccountmanagement.googleapis.com` | List accessible accounts |
| My Business Business Information API | `mybusinessbusinessinformation.googleapis.com` | Locations, eligibility metadata, special hours |
| Google My Business API | `mybusiness.googleapis.com` | Optional local announcement posts (v4 API) |

Google's current [basic setup instructions](https://developers.google.com/my-business/content/basic-setup)
also call for enabling My Business Lodging, Place Actions, Notifications, and
Verifications as part of the associated Business Profile API suite. This feature
does not call those four. The Google My Business API may remain hidden in the library
until Google grants access. If Google prompts for terms or billing setup, have the
account owner review that prompt; creating this feature does not require buying Maps
credits or creating an API key.

There is no Business Profile sandbox. Use the application's automated mocks for
testing. Real publishing changes the chosen Google listing. The optional post
switch is supported only when the selected location's `metadata.canOperateLocalPost`
is true; the admin reports unsupported, processing, rejected, and published states.

## Environment and release

The existing `wrangler.jsonc` is the configuration source. It already contains the
production origin, initial owner, existing D1 binding, five-minute recovery cron,
and a new `ADMIN_EMAIL` sender binding. No runtime package was added.

Add production credentials through **Cloudflare → Workers & Pages →
changing-places-consignment-site → Settings → Variables and Secrets** as Secret values,
or run these from the repository:

```powershell
npx wrangler secret put GOOGLE_CLIENT_ID
npx wrangler secret put GOOGLE_CLIENT_SECRET
# Generates a key directly into Wrangler's stdin without printing it or writing it to Git.
node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('base64'))" | npx wrangler secret put GOOGLE_TOKEN_ENCRYPTION_KEY
```

Keep the encryption key stable. Refresh tokens are AES-GCM encrypted in D1. Replacing
the key without retaining the old value requires reconnecting the Business Profile.
For local work, use `.dev.vars` with the placeholders in `.dev.vars.example`. Do not
copy test fixture identities or keys into production. The three Google names are
declared in `secrets.required`, consistent with the existing Facebook/intake secrets.
Wrangler loads only declared secret names during local development and validates
them before deployment. `APP_ORIGIN` is a normal config variable; override it with
`--var` for local OAuth, not through `.dev.vars`. Runtime Google failures remain
independent of website publishing and intake.

Staff invitation emails use the same structured Cloudflare `send_email` pattern as
the existing intake emails, from `intake@changing-places-dsm.com`. The `ADMIN_EMAIL`
binding has no hard-coded recipient restriction because invitations can go to newly
invited staff. The server restricts this feature to signed-in administrators and
limits new invitations to 20 per day. Verify that the domain is enabled for outbound
Cloudflare Email Service and supports the invited recipients. If the account still
requires recipient verification, complete that in Cloudflare; failed invitations
show a stored error and Resend button. The saved invite also works by sharing
`https://changing-places-dsm.com/admin`; the recipient must sign in as the invited
Google address. See [Cloudflare's email binding API](https://developers.cloudflare.com/email-service/api/send-emails/workers-api/).

Before the normal Git release, apply the additive migration to the **existing** database:

```powershell
npx wrangler d1 migrations list changing-places-intake --remote
npx wrangler d1 migrations apply changing-places-intake --remote
node scripts/sync-shared-shell.mjs --check
node scripts/audit-site.mjs
node --test tests/facebook-feed.test.mjs tests/intake.test.mjs tests/holiday-hours.test.mjs
node scripts/test-site-browser.cjs
node scripts/test-holiday-browser.cjs
npx wrangler deploy --dry-run
```

The browser commands require Playwright installed or supplied via `NODE_PATH`, as in
the existing site checks. Commit the complete change and push `main` only when ready
to release; Cloudflare Workers Builds deploys `main`. Do not use a direct deployment
for the normal release. Apply the migration before the new Worker code goes live.
The migration does not change intake tables and starts with no public announcements;
the expired, hard-coded Labor Day notice is removed.

For local Wrangler checks keep both state and logs outside the served source tree:

```powershell
$holidayState = Join-Path ([IO.Path]::GetTempPath()) 'cpcs-holiday-worker-state'
$env:WRANGLER_LOG_PATH = Join-Path ([IO.Path]::GetTempPath()) 'cpcs-holiday-wrangler-logs'
npx wrangler d1 migrations apply changing-places-intake --local --persist-to $holidayState
npx wrangler dev --local --persist-to $holidayState --var APP_ORIGIN:http://localhost:8787
```

After release, verify `/api/holiday-hours` returns 200 and `/api/admin/holidays`
returns 401 without a session. Sign in at `/admin`, create a draft, review its
preview and dates, then publish a real announcement when appropriate. Connect the
Google account, choose its account and the location matching **3250 100th St,
Urbandale**, then use Retry for any updates that were waiting for setup.

## Staff workflow and behavior

- Create an announcement with an internal name, message, one or more dates, and
  Closed or a same-day opening/closing time for each date. Overnight and split-shift
  periods are not currently editable in this store-focused form.
- Set the website banner start/stop in Central time. Save a draft or publish it.
  Special hours appear in the home page's Visit section independently of the banner.
- The preview displays your message immediately. Choose a seasonal effect, Snow /
  icy roads closure, no animation, or the existing automatic seasonal calendar.
  Replay runs the actual logo renderer. Reduced-motion preferences are honored.
- Website: Published describes saved publication. The banner also shows a separate
  showing/scheduled/ended/disabled status. Multiple active messages are displayed;
  the latest-starting banner with an explicit animation choice controls the logo.
- Google special hours and announcement posts are independent opt-ins. They start
  syncing on publication, including before the website banner's scheduled start.
  A Google post does not disappear just because the website banner ends.
- Unpublish, Remove, or turn off a Google option to queue its Google cleanup. Remove
  hides the entry but retains it for recovery; Show removed entries lets staff restore it.
- Two published entries cannot claim the same store date. Edits use a version check
  so one staff member cannot silently overwrite another's changes.
- Send invitation grants the named Google account staff access. Staff may invite
  other staff. Remove access revokes that person's sessions immediately. The initial
  owner in `ADMIN_EMAILS` cannot be removed through the staff UI.

## Reliability and implementation notes

The existing D1 database is the source of truth. Atomic batches save an entry,
published calendar dates, and per-operation sync jobs. The HTTP save returns before
Google work. `waitUntil` starts work promptly; the existing five-minute cron retries
durable pending jobs after interruptions. Failures back off, stop after five attempts,
and remain visible with a manual Retry option. Post moderation is checked separately.
An uncertain post requires review rather than an automatic second creation attempt.

`worker/google-business.mjs` contains all Business Profile operations. A database
lease, renewed before each bounded Google request, serializes location changes and
sync runs. Hours reconciliation combines all
published, opted-in dates, patches only `specialHours`, preserves unrelated Google
exceptions, and stores originals before overwriting a managed date. Disabling/removing
an override restores its original Google exception. Overlapping overnight Google
periods produce an actionable error instead of being silently removed. Avoid parallel
manual edits to app-managed dates in Google's UI while a sync is running.

Google local posts have no create idempotency key. Each announcement uses a stable
website link marker and stores the returned Google post name. Updates patch that post.
If a creation response is lost, Retry lists posts and reconciles the marker. It never
blindly creates another. If the post remains absent, staff must check Google and use
Confirm no post exists before a fresh creation attempt. That explicit override can
create a duplicate if an earlier Google post appears later. Uncertain deletions also
retain their job and retry safely.

Changing locations is blocked while managed hours/posts or unresolved jobs remain
on the old location. Disconnect deletes the encrypted refresh token but retains the
selected destination and ownership records for recovery; it does not delete Google's
existing hours/posts or revoke the Google-side grant. To revoke that grant, use
Google Account → Security → Your connections to third-party apps and services.

Public pages fetch only `/api/holiday-hours`, use server time for boundaries, and
refresh every minute and when returning to a tab. Known schedules continue to expire
even if a later request fails. A newly opened page needs the site's API and JavaScript
to obtain the data, just like the existing dynamic feed. No Google availability is
required. Public JSON excludes names, staff records, errors, and tokens.

Staff auth uses verified Google ID-token signatures and claims, a single-use,
browser-bound state, PKCE, nonce, short-lived OAuth records, hashed session tokens,
HttpOnly/SameSite cookies, a live database/config access check, bounded requests,
and same-origin mutation checks. Public rendering uses text nodes. OAuth codes,
tokens, and Google response bodies are not written to application logs.

The tests cover real SQLite migrations/transactions, calendar boundaries and DST,
auth/CSRF/invitations, encryption, Google merge/cleanup/retry/idempotency, and browser
editing, previews, motion preferences, mobile layout, and client clock skew.

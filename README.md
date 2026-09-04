# Changing Places Consignment Site

Static website for Changing Places Consignment Shop, a curated furniture and home decor consignment store based in Urbandale and serving Greater Des Moines and Central Iowa.

The site is intentionally lightweight: plain HTML, CSS, one shared JavaScript file, image assets, and SEO metadata.

## Shared site shell

The primary header and footer live in `partials/` and are expanded into each public HTML page before deployment so the live site remains fast, resilient, and search-friendly.

- Run `node scripts/sync-shared-shell.mjs` after editing either partial.
- Run `node scripts/sync-shared-shell.mjs --check` to verify every page is synchronized.
- `couch-dash.html` is intentionally excluded because the After Hours game has its own layout.
- `tv/` contains the noindex, employee-facing in-store screensavers and has its own layout.

The Remotion source for the prerendered screensaver is tracked in `tools/tv-video/`.
Run its `pnpm lint` and `pnpm run render` commands from that directory. Rendered
AVC and HEVC files are written directly to `tv/media/`.

## Pre-production checks

Run these checks before publishing:

```powershell
node scripts/sync-shared-shell.mjs --check
node scripts/audit-site.mjs
node --check site.js
node --check game.js
node --check worker/index.mjs
node --test tests/facebook-feed.test.mjs
```

The site audit verifies public-page metadata, canonical and social URLs, JSON-LD, sitemap coverage, internal routes and fragments, local assets, unique IDs, ARIA references, image dimensions, iframe titles, safe new-tab links, and common encoding problems.

## Automatic Facebook Live feed

The home-page carousel is static-first. Five checked-in cards render immediately and remain as the last-known-good fallback. Near the carousel, `site.js` requests the same-origin `/api/facebook-live` endpoint and replaces those cards only when it receives a complete, valid feed.

The Worker keeps the Page access token server-side and caches successful Meta responses. Put a local token in `.dev.vars` (never commit that file):

```dotenv
FACEBOOK_PAGE_ACCESS_TOKEN="your-page-access-token"
```

The Worker first checks Meta's legacy uploaded-video edge for compatibility. If Meta returns an empty collection, it falls back to the currently readable Page posts edge and keeps only current or archived broadcasts marked `is_fb_live_videos=true` or `was_fb_live_videos=true`. Both requests are bounded to 25 records; the Worker sorts safe results newest-first and returns at most five:

```text
/v26.0/{PAGE_ID}/videos?type=UPLOADED&fields=id,created_time,live_status,permalink_url,picture,thumbnails{uri,height,width}&limit=25
/v26.0/{PAGE_ID}/posts?fields=id,created_time,permalink_url,is_fb_live_videos,was_fb_live_videos,status_type,attachments{media_type,target,url,media}&limit=25
```

Meta's dedicated `/live_videos` edge is intentionally not used because current Meta documentation no longer supports reading it. Page posts are the documented fallback for Page-owned Live content and avoid requiring the separate Live Video API feature.

Production uses the Changing Places numeric Page ID (`2057064944306840`) so the feed does not depend on how Meta resolves `me` for a particular token. The deployment is configured to require `FACEBOOK_PAGE_ACCESS_TOKEN`, so it cannot silently publish an unusable automatic feed. A long-lived Page token is preferred. If Meta supplies a User token instead, the Worker uses `/me/accounts` to resolve only the matching Changing Places Page token in memory; neither credential is returned, logged, cached, or placed in a URL. The token needs `pages_read_engagement`, `pages_read_user_content`, and `pages_show_list`, issued by a person who has the Page's `CREATE_CONTENT` task.

For local Worker testing, keep Wrangler's generated state outside the repository because the repository root is also the static-assets directory:

```powershell
$workerState = Join-Path ([System.IO.Path]::GetTempPath()) "changing-places-worker-state"
npx wrangler dev --local --persist-to $workerState
```

Without a token, `/api/facebook-live` returns a controlled unavailable response and the carousel keeps its fallback cards.

## Production

The production domain is `https://changing-places-dsm.com/`.

- GitHub `main` is the production source of truth. Cloudflare Workers Builds is connected to this repository and automatically deploys each push to `main`.
- The normal release workflow is to run the checks above, commit the complete local change, and push `main`. Reserve direct `wrangler deploy` commands for recovery, and follow any recovery deployment with the equivalent Git commit immediately.
- Site files are served through the Cloudflare Worker configured in `wrangler.jsonc`.
- `_headers` is the source of production security headers.
- `robots.txt`, `sitemap.xml`, canonical URLs, Open Graph tags, and the web manifest use the production domain.

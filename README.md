# Changing Places Consignment Site

Static website for Changing Places Consignment Shop, a curated furniture and home decor consignment store based in Urbandale and serving Greater Des Moines and Central Iowa.

The site is intentionally lightweight: plain HTML, CSS, one shared JavaScript file, image assets, and SEO metadata.

## Shared site shell

The primary header and footer live in `partials/` and are expanded into each public HTML page before deployment so the live site remains fast, resilient, and search-friendly.

- Run `node scripts/sync-shared-shell.mjs` after editing either partial.
- Run `node scripts/sync-shared-shell.mjs --check` to verify every page is synchronized.
- `couch-dash.html` is intentionally excluded because the After Hours game has its own layout.

## Pre-production checks

Run these checks before publishing:

```powershell
node scripts/sync-shared-shell.mjs --check
node scripts/audit-site.mjs
node --check site.js
node --check game.js
```

The site audit verifies public-page metadata, canonical and social URLs, JSON-LD, sitemap coverage, internal routes and fragments, local assets, unique IDs, ARIA references, image dimensions, iframe titles, safe new-tab links, and common encoding problems.

## Production

The production domain is `https://changing-places-dsm.com/`.

- Site files are stored in GitHub and served through a Cloudflare Worker.
- `_headers` is the source of production security headers.
- `robots.txt`, `sitemap.xml`, canonical URLs, Open Graph tags, and the web manifest use the production domain.

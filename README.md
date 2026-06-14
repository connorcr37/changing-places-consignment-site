# Changing Places Consignment Site

Static website for Changing Places Consignment Shop, a curated furniture and home decor consignment store in Urbandale, Iowa.

The site is intentionally lightweight: plain HTML, CSS, image assets, SEO metadata, and a PHP form handler for online consignment submissions.

## Production

The production domain is `https://changing-places-dsm.com/`.

- `CNAME` points GitHub Pages-compatible deployments at the custom domain.
- `robots.txt`, `sitemap.xml`, canonical URLs, Open Graph tags, and the web manifest use the production domain.
- `consignment-form-handler.php` requires PHP mail support on the production host.

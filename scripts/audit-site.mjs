import { access, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, "..");
const productionOrigin = "https://changing-places-dsm.com";
const excludedFromSearch = new Set([
  "couch-dash.html",
  "tv/index.html",
  "tv/video.html",
]);
const issues = [];

const htmlLocations = [
  { directory: projectRoot, prefix: "" },
  { directory: path.join(projectRoot, "tv"), prefix: "tv/" },
];
const pageNames = (
  await Promise.all(
    htmlLocations.map(async ({ directory, prefix }) =>
      (await readdir(directory, { withFileTypes: true }))
        .filter((entry) => entry.isFile() && entry.name.endsWith(".html"))
        .map((entry) => `${prefix}${entry.name}`),
    ),
  )
).flat().sort();

const pages = new Map(
  await Promise.all(
    pageNames.map(async (pageName) => [
      pageName,
      await readFile(path.join(projectRoot, pageName), "utf8"),
    ]),
  ),
);

const routeToPage = new Map([["/", "index.html"]]);

const routeForPage = (pageName) => {
  const baseName = pageName.replace(/\.html$/, "");

  if (baseName === "index") return "/";
  if (baseName.endsWith("/index")) return `/${baseName.slice(0, -"/index".length)}`;
  return `/${baseName}`;
};

for (const pageName of pageNames) {
  routeToPage.set(`/${pageName}`, pageName);
  routeToPage.set(routeForPage(pageName), pageName);

  if (pageName.endsWith("/index.html")) {
    routeToPage.set(`${routeForPage(pageName)}/`, pageName);
  }
}

const getAttribute = (tag, attributeName) => {
  const match = tag.match(
    new RegExp(`\\b${attributeName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}="([^"]*)"`, "i"),
  );
  return match?.[1] ?? "";
};

const getTags = (source, tagName) =>
  source.match(new RegExp(`<${tagName}\\b[^>]*>`, "gi")) ?? [];

const getMetaContent = (source, attributeName, attributeValue) => {
  const tag = getTags(source, "meta").find(
    (candidate) =>
      getAttribute(candidate, attributeName).toLowerCase() ===
      attributeValue.toLowerCase(),
  );
  return tag ? getAttribute(tag, "content") : "";
};

const getCanonical = (source) => {
  const tag = getTags(source, "link").find(
    (candidate) => getAttribute(candidate, "rel").toLowerCase() === "canonical",
  );
  return tag ? getAttribute(tag, "href") : "";
};

const routeFromHref = (href) => {
  const [withoutFragment] = href.split("#", 1);
  const [withoutQuery] = withoutFragment.split("?", 1);
  return withoutQuery || "/";
};

const fragmentFromHref = (href) => {
  const hashIndex = href.indexOf("#");
  return hashIndex === -1 ? "" : href.slice(hashIndex + 1);
};

const isExternalOrFragment = (value) =>
  /^(?:[a-z][a-z\d+.-]*:|\/\/|#)/i.test(value);

const canAccess = async (targetPath) => {
  try {
    await access(targetPath);
    return true;
  } catch {
    return false;
  }
};

const pageDetails = [];

for (const [pageName, source] of pages) {
  if (/(?:â€¦|â€”|â€“|Â|�)/.test(source)) {
    issues.push(`${pageName}: contains likely mojibake`);
  }

  if (!/^<!doctype html>/i.test(source.trimStart())) {
    issues.push(`${pageName}: missing HTML doctype`);
  }

  if (!/<html\b[^>]*\blang="en"/i.test(source)) {
    issues.push(`${pageName}: missing lang="en"`);
  }

  if (!getMetaContent(source, "charset", "UTF-8") && !/<meta\s+charset="UTF-8"/i.test(source)) {
    issues.push(`${pageName}: missing UTF-8 charset declaration`);
  }

  if (!getMetaContent(source, "name", "viewport")) {
    issues.push(`${pageName}: missing viewport metadata`);
  }

  const ids = [...source.matchAll(/\bid="([^"]+)"/gi)].map((match) => match[1]);
  const idCounts = new Map();

  for (const id of ids) {
    idCounts.set(id, (idCounts.get(id) ?? 0) + 1);
  }

  for (const [id, count] of idCounts) {
    if (count > 1) issues.push(`${pageName}: duplicate id "${id}"`);
  }

  for (const control of source.matchAll(/\baria-controls="([^"]+)"/gi)) {
    if (!idCounts.has(control[1])) {
      issues.push(`${pageName}: aria-controls points to missing id "${control[1]}"`);
    }
  }

  for (const tag of getTags(source, "a")) {
    if (
      getAttribute(tag, "target").toLowerCase() === "_blank" &&
      !getAttribute(tag, "rel").split(/\s+/).includes("noopener")
    ) {
      issues.push(`${pageName}: target="_blank" link is missing rel="noopener"`);
    }
  }

  for (const tag of getTags(source, "img")) {
    if (!/\balt="/i.test(tag)) {
      issues.push(`${pageName}: image is missing alt text`);
    }
    if (!/\bwidth="/i.test(tag) || !/\bheight="/i.test(tag)) {
      issues.push(`${pageName}: image is missing intrinsic width or height`);
    }
  }

  for (const tag of getTags(source, "iframe")) {
    if (!getAttribute(tag, "title")) {
      issues.push(`${pageName}: iframe is missing a title`);
    }
  }

  for (const script of source.matchAll(
    /<script\s+type="application\/ld\+json">([\s\S]*?)<\/script>/gi,
  )) {
    try {
      JSON.parse(script[1]);
    } catch (error) {
      issues.push(`${pageName}: invalid JSON-LD (${error.message})`);
    }
  }

  const references = [
    ...source.matchAll(/\b(?:href|src)="([^"]+)"/gi),
  ].map((match) => match[1]);

  for (const reference of references) {
    if (!reference || isExternalOrFragment(reference)) continue;
    const localPath = reference.split(/[?#]/, 1)[0];
    const normalizedRoute = localPath === "/index.html" ? "/" : localPath;

    if (localPath.startsWith("/") && routeToPage.has(normalizedRoute)) continue;

    const pageDirectory = path.dirname(path.join(projectRoot, pageName));
    const targetPath = localPath.startsWith("/")
      ? path.join(projectRoot, localPath.replace(/^\/+/, ""))
      : path.resolve(pageDirectory, localPath);

    if (!(await canAccess(targetPath))) {
      issues.push(`${pageName}: missing local asset "${localPath}"`);
    }
  }

  const hrefs = getTags(source, "a").map((tag) => getAttribute(tag, "href"));

  for (const href of hrefs) {
    if (!href.startsWith("/") && !href.startsWith("#")) continue;

    const route = href.startsWith("#") ? routeForPage(pageName) : routeFromHref(href);
    const normalizedRoute = route === "/index.html" ? "/" : route;
    const targetPageName = routeToPage.get(normalizedRoute);

    if (!targetPageName) {
      issues.push(`${pageName}: internal link points to missing route "${href}"`);
      continue;
    }

    const fragment = fragmentFromHref(href);
    if (fragment && !new RegExp(`\\bid="${fragment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`, "i").test(pages.get(targetPageName))) {
      issues.push(`${pageName}: internal link points to missing fragment "${href}"`);
    }
  }

  const isSearchPage = !excludedFromSearch.has(pageName);
  const title = source.match(/<title>([\s\S]*?)<\/title>/i)?.[1].trim() ?? "";
  const description = getMetaContent(source, "name", "description");
  const canonical = getCanonical(source);
  const ogUrl = getMetaContent(source, "property", "og:url");
  const ogImage = getMetaContent(source, "property", "og:image");
  const twitterImage = getMetaContent(source, "name", "twitter:image");
  const h1Count = (source.match(/<h1\b/gi) ?? []).length;
  const mainCount = (source.match(/<main\b/gi) ?? []).length;

  if (isSearchPage) {
    if (!title) issues.push(`${pageName}: missing title`);
    if (!description) issues.push(`${pageName}: missing meta description`);
    if (!canonical.startsWith(`${productionOrigin}/`)) {
      issues.push(`${pageName}: canonical URL is missing or off-domain`);
    }
    if (!getMetaContent(source, "property", "og:title")) {
      issues.push(`${pageName}: missing og:title`);
    }
    if (!getMetaContent(source, "property", "og:description")) {
      issues.push(`${pageName}: missing og:description`);
    }
    if (!ogImage) {
      issues.push(`${pageName}: missing og:image`);
    }
    if (!getMetaContent(source, "property", "og:image:width") || !getMetaContent(source, "property", "og:image:height")) {
      issues.push(`${pageName}: missing Open Graph image dimensions`);
    }
    if (ogImage.startsWith(`${productionOrigin}/`)) {
      const imagePath = new URL(ogImage).pathname.replace(/^\/+/, "");
      if (!(await canAccess(path.join(projectRoot, imagePath)))) {
        issues.push(`${pageName}: Open Graph image is missing locally`);
      }
    }
    if (ogUrl !== canonical) {
      issues.push(`${pageName}: og:url does not match canonical URL`);
    }
    if (!getMetaContent(source, "name", "twitter:card")) {
      issues.push(`${pageName}: missing Twitter card metadata`);
    }
    if (twitterImage !== ogImage) {
      issues.push(`${pageName}: Twitter image does not match Open Graph image`);
    }
    if (h1Count !== 1) issues.push(`${pageName}: expected one h1, found ${h1Count}`);
    if (mainCount !== 1) issues.push(`${pageName}: expected one main element, found ${mainCount}`);
    if (!/<a\b[^>]*class="skip-link"[^>]*href="#main-content"/i.test(source)) {
      issues.push(`${pageName}: missing main-content skip link`);
    }
  } else if (!/\bname="robots"\s+content="[^"]*\bnoindex\b/i.test(source)) {
    issues.push(`${pageName}: excluded page is missing noindex`);
  }

  pageDetails.push({ pageName, title, description, canonical, isSearchPage });
}

const publicDetails = pageDetails.filter((page) => page.isSearchPage);

for (const field of ["title", "description", "canonical"]) {
  const values = new Map();
  for (const page of publicDetails) {
    const value = page[field];
    if (!value) continue;
    const existingPage = values.get(value);
    if (existingPage) {
      issues.push(
        `${page.pageName}: duplicate ${field} also used by ${existingPage}`,
      );
    } else {
      values.set(value, page.pageName);
    }
  }
}

const sitemap = await readFile(path.join(projectRoot, "sitemap.xml"), "utf8");
const sitemapUrls = new Set(
  [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]),
);

for (const { pageName, canonical } of publicDetails) {
  if (!sitemapUrls.has(canonical)) {
    issues.push(`${pageName}: canonical URL is missing from sitemap.xml`);
  }
}

for (const sitemapUrl of sitemapUrls) {
  if (!publicDetails.some((page) => page.canonical === sitemapUrl)) {
    issues.push(`sitemap.xml: unexpected or non-canonical URL "${sitemapUrl}"`);
  }
}

const robots = await readFile(path.join(projectRoot, "robots.txt"), "utf8");
if (!robots.includes(`Sitemap: ${productionOrigin}/sitemap.xml`)) {
  issues.push("robots.txt: production sitemap declaration is missing");
}

const wranglerSource = await readFile(path.join(projectRoot, "wrangler.jsonc"), "utf8");
let wrangler;

try {
  wrangler = JSON.parse(wranglerSource);
} catch (error) {
  issues.push(`wrangler.jsonc: invalid configuration JSON (${error.message})`);
}

if (wrangler) {
  if (wrangler.main !== "worker/index.mjs") {
    issues.push('wrangler.jsonc: expected Worker entry point "worker/index.mjs"');
  }
  if (wrangler.assets?.directory !== ".") {
    issues.push('wrangler.jsonc: assets.directory must remain "."');
  }
  if (wrangler.assets?.binding !== "ASSETS") {
    issues.push('wrangler.jsonc: expected assets binding "ASSETS"');
  }
  if (!wrangler.assets?.run_worker_first?.includes("/api/*")) {
    issues.push('wrangler.jsonc: API routes must run the Worker first');
  }
  if (wrangler.assets?.html_handling !== "drop-trailing-slash") {
    issues.push('wrangler.jsonc: expected html_handling "drop-trailing-slash"');
  }
  if (!wrangler.secrets?.required?.includes("FACEBOOK_PAGE_ACCESS_TOKEN")) {
    issues.push('wrangler.jsonc: Facebook Page access token must be a required secret');
  }
}

const assetIgnore = await readFile(path.join(projectRoot, ".assetsignore"), "utf8");
for (const requiredRule of ["!/*.html", "!/*.css", "!/*.js", "!/*.txt", "!/*.xml", "!/_headers", "!/fonts/**", "!/images/**", "!/tv/**"]) {
  if (!assetIgnore.includes(requiredRule)) {
    issues.push(`.assetsignore: missing required allow rule "${requiredRule}"`);
  }
}

const gitIgnore = await readFile(path.join(projectRoot, ".gitignore"), "utf8");
if (!gitIgnore.includes(".dev.vars*")) {
  issues.push('.gitignore: local Wrangler secrets must remain ignored');
}

const productionHeaders = await readFile(path.join(projectRoot, "_headers"), "utf8");
for (const requiredHeader of [
  "Content-Security-Policy:",
  "Strict-Transport-Security:",
  "X-Content-Type-Options: nosniff",
  "Referrer-Policy:",
  "Permissions-Policy:",
]) {
  if (!productionHeaders.includes(requiredHeader)) {
    issues.push(`_headers: missing "${requiredHeader}"`);
  }
}

if (issues.length) {
  console.error(`Site audit failed with ${issues.length} issue${issues.length === 1 ? "" : "s"}:`);
  for (const issue of issues) console.error(`- ${issue}`);
  process.exitCode = 1;
} else {
  console.log(
    `Site audit passed: ${publicDetails.length} public pages, ${pageNames.length} total HTML pages, and ${sitemapUrls.size} sitemap URLs checked.`,
  );
}

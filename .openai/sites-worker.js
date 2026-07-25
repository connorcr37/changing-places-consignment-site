const prettyRoutes = new Map([
  ["/", "/index.html"],
  ["/privacy", "/privacy.html"],
  ["/sell-furniture", "/sell-furniture.html"],
  ["/selling-options", "/selling-options.html"],
  ["/moving-downsizing", "/moving-downsizing.html"],
  ["/estate-furniture", "/estate-furniture.html"],
  ["/professional-partners", "/professional-partners.html"],
  ["/furnishing-new-home", "/furnishing-new-home.html"],
  ["/furniture-for-college-apartments", "/furniture-for-college-apartments.html"],
  ["/short-term-rental-furniture", "/short-term-rental-furniture.html"],
  ["/unique-furniture", "/unique-furniture.html"],
]);

const canonicalResourcePaths = new Set([
  "/sell-furniture",
  "/selling-options",
  "/moving-downsizing",
  "/estate-furniture",
  "/professional-partners",
  "/unique-furniture",
  "/furnishing-new-home",
  "/furniture-for-college-apartments",
  "/short-term-rental-furniture",
]);

const securityHeaders = {
  "Content-Security-Policy":
    "default-src 'self'; base-uri 'self'; object-src 'none'; form-action 'self'; frame-ancestors 'none'; frame-src https://cdn.lightwidget.com https://www.google.com; img-src 'self' data: https://*.google.com https://*.googleusercontent.com https://*.cdninstagram.com https://*.fbcdn.net; font-src 'self'; style-src 'self'; script-src 'self' https://static.cloudflareinsights.com; connect-src 'self'; upgrade-insecure-requests",
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "X-Content-Type-Options": "nosniff",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
};

function assetPathFor(pathname) {
  if (prettyRoutes.has(pathname)) return prettyRoutes.get(pathname);

  if (pathname.length > 1 && pathname.endsWith("/")) {
    return prettyRoutes.get(pathname.slice(0, -1)) ?? pathname;
  }

  return pathname;
}

function pathWithoutTrailingSlash(pathname) {
  return pathname.length > 1 && pathname.endsWith("/")
    ? pathname.slice(0, -1)
    : pathname;
}

function redirectPathFor(pathname) {
  const normalizedPath = pathWithoutTrailingSlash(pathname);
  const extensionlessPath = normalizedPath.endsWith(".html")
    ? normalizedPath.slice(0, -5)
    : normalizedPath;

  if (
    canonicalResourcePaths.has(extensionlessPath) &&
    (normalizedPath.endsWith(".html") || normalizedPath !== pathname)
  ) {
    return extensionlessPath;
  }

  return null;
}

function withSecurityHeaders(response) {
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(securityHeaders)) {
    headers.set(name, value);
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export default {
  async fetch(request, env) {
    if (request.method !== "GET" && request.method !== "HEAD") {
      return withSecurityHeaders(
        new Response("Method Not Allowed", {
          status: 405,
          headers: { Allow: "GET, HEAD" },
        }),
      );
    }

    const assetUrl = new URL(request.url);
    const redirectPath = redirectPathFor(assetUrl.pathname);

    if (redirectPath) {
      assetUrl.pathname = redirectPath;

      return withSecurityHeaders(
        new Response(null, {
          status: 301,
          headers: {
            Location: assetUrl.toString(),
          },
        }),
      );
    }

    assetUrl.pathname = assetPathFor(assetUrl.pathname);
    const response = await env.ASSETS.fetch(new Request(assetUrl, request));

    return withSecurityHeaders(response);
  },
};

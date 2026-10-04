// Pure URL helpers, shared by the crawler and the in-PDF link rewriter.

/** Canonical form of a page URL: no hash, no query, no trailing slash. */
export function normalizeUrl(url) {
  const u = new URL(url);
  const path = u.pathname.replace(/\/+$/, "") || "/";
  return `${u.origin}${path}`;
}

/**
 * Where a link should point inside the PDF.
 * pageIndex maps normalizeUrl(pageUrl) -> page number.
 * Returns "#p3" / "#p3-heading" for crawled pages, or null to keep the original URL.
 */
export function anchorFor(url, pageIndex) {
  let u;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  const n = pageIndex.get(normalizeUrl(u.href));
  if (n === undefined) return null;
  const hash = decodeURIComponent(u.hash.slice(1));
  return hash ? `#p${n}-${hash}` : `#p${n}`;
}

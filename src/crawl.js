// Walks each section's "Next" links and extracts a cleaned copy of every page.
import { normalizeUrl } from "./links.js";

export const DEFAULT_EXCLUDE = [
  ".theme-doc-breadcrumbs",
  ".theme-doc-toc-mobile",
  ".theme-doc-footer",
  ".theme-doc-version-badge",
  ".theme-doc-version-banner",
  ".pagination-nav",
  ".hash-link",
  ".theme-code-block button",
];

export async function crawl(
  browser,
  { starts, content, next, exclude, timeout, log },
) {
  const page = await browser.newPage();
  page.setDefaultTimeout(timeout);
  // Desktop width, so Docusaurus renders its desktop TOC (read by extractPage).
  await page.setViewport({ width: 1440, height: 900 });
  await page.emulateMediaFeatures([
    { name: "prefers-color-scheme", value: "light" },
  ]);
  await page.evaluateOnNewDocument(() => {
    try {
      localStorage.setItem("theme", "light");
    } catch {
      // Storage blocked: the prefers-color-scheme emulation above still forces light.
    }
  });

  const visited = new Set();
  const sections = [];
  const startOwner = new Map(starts.map((s, i) => [normalizeUrl(s), i]));
  let site = null;

  for (const [si, start] of starts.entries()) {
    let section = { title: "", group: "", pages: [] };
    let url = start;
    // A section ends when "Next" runs out, loops, or reaches the start of another section.
    while (
      url &&
      !visited.has(normalizeUrl(url)) &&
      (startOwner.get(normalizeUrl(url)) ?? si) === si
    ) {
      visited.add(normalizeUrl(url));
      const res = await page.goto(url, { waitUntil: "networkidle0" });
      if (!res?.ok())
        throw new Error(`${url}: HTTP ${res?.status() ?? "no response"}`);
      visited.add(normalizeUrl(page.url()));
      if (!(await page.$(content)))
        throw new Error(`${url}: no element matches "${content}"`);
      await waitForRender(page);

      const data = await page.evaluate(extractPage, {
        content,
        next,
        exclude: [...DEFAULT_EXCLUDE, ...exclude],
      });
      site ??= data.site;
      url = data.nextUrl;
      // A category's generated index only lists cards for the pages that follow it: skip it.
      if (data.generatedIndex) {
        log(`  (skipped category index: ${page.url()})`);
        continue;
      }
      // Each top-level sidebar entry (e.g. "Overview", "Orientation") becomes its own part.
      if (section.pages.length && data.group && data.group !== section.group) {
        sections.push(endSection(section, log));
        section = { title: "", group: "", pages: [] };
      }
      section.group ||= data.group;
      section.title ||= data.group || data.navTitle || data.title;
      section.pages.push({
        url: page.url(),
        title: data.title,
        headings: data.headings,
        html: data.html,
      });
      log(`  ${section.pages.length}. ${data.title}`);
    }
    if (section.pages.length) sections.push(endSection(section, log));
  }
  await page.close();
  if (!sections.length)
    throw new Error("No pages to print: every page was skipped");
  return { sections, site };
}

function endSection({ title, pages }, log) {
  log(`Section "${title}": ${pages.length} page(s)`);
  return { title, pages };
}

/** Wait for client-side rendering that networkidle doesn't cover (Mermaid, web fonts). */
async function waitForRender(page) {
  await page.waitForFunction(
    () =>
      [...document.querySelectorAll(".docusaurus-mermaid-container")].every(
        (c) => c.querySelector("svg"),
      ),
    { timeout: 15_000 },
  );
  await page.evaluate(() => document.fonts.ready);
}

/** Runs in the browser: returns a cleaned, self-contained copy of the page body. */
function extractPage({ content, next, exclude }) {
  const root = document.querySelector(content).cloneNode(true);
  root.querySelectorAll(exclude.join(",")).forEach((el) => el.remove());

  // Absolute URLs so the assembled document can live anywhere.
  root
    .querySelectorAll("a[href]")
    .forEach((a) => a.setAttribute("href", a.href));
  root
    .querySelectorAll("img[src]")
    .forEach((img) => img.setAttribute("src", img.src));

  // Print every tab panel, each labelled with its tab name, instead of only the selected one.
  root.querySelectorAll(".tabs-container").forEach((box) => {
    const labels = [...box.querySelectorAll('[role="tab"]')].map((t) =>
      t.textContent.trim(),
    );
    box.querySelectorAll('[role="tablist"]').forEach((el) => el.remove());
    box.querySelectorAll('[role="tabpanel"]').forEach((panel, i) => {
      panel.removeAttribute("hidden");
      const label = document.createElement("div");
      label.className = "pdf-tab-label";
      label.textContent = labels[i] ?? "";
      panel.prepend(label);
    });
  });

  // Same headings as the site's own TOC (it honours toc_min/max_heading_level). Pages without one
  // (hide_table_of_contents, or a custom theme): every h2–h6 outside tab panels and admonitions.
  const tocIds = [
    ...document.querySelectorAll('.theme-doc-toc-desktop a[href^="#"]'),
  ].map((a) => decodeURIComponent(a.hash.slice(1)));
  const headings = [
    ...root.querySelectorAll("h2[id], h3[id], h4[id], h5[id], h6[id]"),
  ]
    .filter((h) =>
      tocIds.length
        ? tocIds.includes(h.id)
        : !h.closest('[role="tabpanel"], .theme-admonition'),
    )
    .map((h) => ({
      level: Number(h.tagName[1]),
      id: h.id,
      // Docusaurus puts a zero-width space before the "#" link.
      text: h.textContent.replace(/\u200b/g, "").trim(),
    }));

  const logo = document.querySelector(".navbar__logo img");
  return {
    html: root.outerHTML,
    title: root.querySelector("h1, h2")?.textContent.trim() || document.title,
    headings,
    // The top-level sidebar entry (category or plain link) this page sits in.
    group:
      document
        .querySelector('.theme-doc-sidebar-menu a[aria-current="page"]')
        ?.closest(
          ".theme-doc-sidebar-item-category-level-1, .theme-doc-sidebar-item-link-level-1",
        )
        ?.querySelector(".menu__link")
        ?.textContent.trim() || "",
    // Part name for pages outside any sidebar (e.g. the blog).
    navTitle:
      document.querySelector(".navbar__link--active")?.textContent.trim() || "",
    nextUrl: document.querySelector(next)?.href ?? null,
    // Category page made by Docusaurus (`link: {type: 'generated-index'}`), not a written doc.
    generatedIndex: !!document.querySelector('[class*="generatedIndexPage"]'),
    site: {
      title:
        document.querySelector(".navbar__title")?.textContent.trim() ||
        document.title,
      origin: location.origin,
      logo: logo?.src ?? null,
      accent:
        getComputedStyle(document.documentElement)
          .getPropertyValue("--ifm-color-primary")
          .trim() || "#2e8555",
      stylesheets: [...document.querySelectorAll('link[rel="stylesheet"]')].map(
        (l) => l.href,
      ),
    },
  };
}

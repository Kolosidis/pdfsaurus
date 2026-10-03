// Walks each section's "Next" links and extracts a cleaned copy of every page.
import {normalizeUrl} from './links.js';

export const DEFAULT_EXCLUDE = [
  '.theme-doc-breadcrumbs',
  '.theme-doc-toc-mobile',
  '.theme-doc-footer',
  '.theme-doc-version-badge',
  '.theme-doc-version-banner',
  '.pagination-nav',
  '.hash-link',
  '.theme-code-block button',
];

export async function crawl(browser, {starts, content, next, exclude, timeout, log}) {
  const page = await browser.newPage();
  page.setDefaultTimeout(timeout);
  await page.emulateMediaFeatures([{name: 'prefers-color-scheme', value: 'light'}]);
  await page.evaluateOnNewDocument(() => {
    try {
      localStorage.setItem('theme', 'light');
    } catch {}
  });

  const visited = new Set();
  const sections = [];
  const startOwner = new Map(starts.map((s, i) => [normalizeUrl(s), i]));
  let site = null;

  for (const [si, start] of starts.entries()) {
    const section = {title: '', pages: []};
    let url = start;
    // A section ends when "Next" runs out, loops, or reaches the start of another section.
    while (url && !visited.has(normalizeUrl(url)) && (startOwner.get(normalizeUrl(url)) ?? si) === si) {
      visited.add(normalizeUrl(url));
      const res = await page.goto(url, {waitUntil: 'networkidle0'});
      if (!res?.ok()) throw new Error(`${url}: HTTP ${res?.status() ?? 'no response'}`);
      visited.add(normalizeUrl(page.url()));
      if (!(await page.$(content))) throw new Error(`${url}: no element matches "${content}"`);
      await waitForRender(page);

      const data = await page.evaluate(extractPage, {content, next, exclude: [...DEFAULT_EXCLUDE, ...exclude]});
      site ??= data.site;
      section.title ||= data.sectionTitle || data.title;
      section.pages.push({url: page.url(), title: data.title, headings: data.headings, html: data.html});
      log(`  ${section.pages.length}. ${data.title}`);
      url = data.nextUrl;
    }
    log(`Section "${section.title}": ${section.pages.length} page(s)`);
    sections.push(section);
  }
  await page.close();
  return {sections, site};
}

/** Wait for client-side rendering that networkidle doesn't cover (Mermaid, web fonts). */
async function waitForRender(page) {
  await page.waitForFunction(
    () => [...document.querySelectorAll('.docusaurus-mermaid-container')].every((c) => c.querySelector('svg')),
    {timeout: 15_000},
  );
  await page.evaluate(() => document.fonts.ready);
}

/** Runs in the browser: returns a cleaned, self-contained copy of the page body. */
function extractPage({content, next, exclude}) {
  const root = document.querySelector(content).cloneNode(true);
  root.querySelectorAll(exclude.join(',')).forEach((el) => el.remove());

  // Absolute URLs so the assembled document can live anywhere.
  root.querySelectorAll('a[href]').forEach((a) => a.setAttribute('href', a.href));
  root.querySelectorAll('img[src]').forEach((img) => img.setAttribute('src', img.src));

  // Print every tab panel, each labelled with its tab name, instead of only the selected one.
  root.querySelectorAll('.tabs-container').forEach((box) => {
    const labels = [...box.querySelectorAll('[role="tab"]')].map((t) => t.textContent.trim());
    box.querySelectorAll('[role="tablist"]').forEach((el) => el.remove());
    box.querySelectorAll('[role="tabpanel"]').forEach((panel, i) => {
      panel.removeAttribute('hidden');
      const label = document.createElement('div');
      label.className = 'pdf-tab-label';
      label.textContent = labels[i] ?? '';
      panel.prepend(label);
    });
  });

  const headings = [...root.querySelectorAll('h2[id], h3[id]')]
    .filter((h) => !h.closest('[role="tabpanel"], .theme-admonition'))
    .map((h) => ({level: Number(h.tagName[1]), id: h.id, text: h.textContent.trim()}));

  const logo = document.querySelector('.navbar__logo img');
  return {
    html: root.outerHTML,
    title: root.querySelector('h1, h2')?.textContent.trim() || document.title,
    headings,
    // Section name: the top-level sidebar category this page sits in, else the active navbar item.
    sectionTitle:
      [...document.querySelectorAll('.theme-doc-sidebar-item-category-level-1')]
        .find((li) => li.querySelector('a[aria-current="page"]'))
        ?.querySelector('.menu__link')
        ?.textContent.trim() ||
      document.querySelector('.navbar__link--active')?.textContent.trim() ||
      '',
    nextUrl: document.querySelector(next)?.href ?? null,
    site: {
      title: document.querySelector('.navbar__title')?.textContent.trim() || document.title,
      origin: location.origin,
      logo: logo?.src ?? null,
      accent: getComputedStyle(document.documentElement).getPropertyValue('--ifm-color-primary').trim() || '#2e8555',
      stylesheets: [...document.querySelectorAll('link[rel="stylesheet"]')].map((l) => l.href),
    },
  };
}

import { writeFile } from "node:fs/promises";
import puppeteer from "puppeteer";
import { crawl, DEFAULT_EXCLUDE } from "./crawl.js";
import {
  bodyHtml,
  coverHtml,
  footerTemplate,
  headerTemplate,
  loadStyles,
} from "./html.js";
import { anchorFor, normalizeUrl } from "./links.js";
import { finishPdf, readDestinations } from "./pdf.js";
import { MAX_TOC_DEPTH, tocEntries } from "./toc.js";

export { DEFAULT_EXCLUDE, tocEntries };

export const DEFAULT_MARGIN = {
  top: "22mm",
  bottom: "20mm",
  left: "16mm",
  right: "16mm",
};

/**
 * Crawl one or more Docusaurus sections and print them into a single PDF.
 * @param {object} o
 * @param {string[]} o.starts       first page of each section, in output order
 * @param {string} [o.out]          output file
 * @param {string} [o.title]        cover / header title (default: site title)
 * @param {string} [o.subtitle]
 * @param {string} [o.content]      selector of the page body to keep
 * @param {string} [o.next]         selector of the "next page" link to follow
 * @param {string[]} [o.exclude]    extra selectors removed from every page
 * @param {string} [o.format]       paper format, e.g. A4 or Letter
 * @param {object} [o.margin]       page margins {top, bottom, left, right}, CSS lengths
 * @param {string[]} [o.css]        extra CSS files, applied after the built-in styles; set --pdf-* variables
 *                                  (see src/styles/*.css) or override any rule
 * @param {number} [o.tocDepth]     cap on heading nesting in the TOC: 0 none, 1 top level … 5 (default:
 *                                  no cap, so each page lists what the site's own TOC lists)
 * @param {number} [o.timeout]      per-page navigation timeout, ms
 * @param {(msg: string) => void} [o.log]
 */
export async function generatePdf({
  starts,
  out = "docs.pdf",
  title,
  subtitle = "",
  content = "article",
  next = "a.pagination-nav__link--next",
  exclude = [],
  format = "A4",
  margin = {},
  css = [],
  tocDepth = MAX_TOC_DEPTH,
  timeout = 60_000,
  log = () => {},
}) {
  if (!starts?.length) throw new Error("At least one start URL is required");
  if (!Number.isInteger(tocDepth) || tocDepth < 0 || tocDepth > MAX_TOC_DEPTH) {
    throw new Error(
      `tocDepth must be a whole number from 0 to ${MAX_TOC_DEPTH}, got ${tocDepth}`,
    );
  }
  margin = { ...DEFAULT_MARGIN, ...margin };

  const browser = await puppeteer.launch({ headless: true });
  try {
    const { sections, site } = await crawl(browser, {
      starts,
      content,
      next,
      exclude,
      timeout,
      log,
    });
    const docTitle = title || site.title;
    const date = new Date().toLocaleDateString("en", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
    const toc = tocEntries(sections, tocDepth);
    const styles = await loadStyles({
      vars: {
        accent: site.accent,
        marginLeft: margin.left,
        marginRight: margin.right,
      },
      css,
    });

    // Body (TOC + parts + pages), printed twice: pass 1 tells us which page every TOC
    // target lands on (Chrome writes them as named destinations), pass 2 prints those numbers.
    const body = await browser.newPage();
    body.setDefaultTimeout(timeout);
    await body.emulateMediaType("print");
    await body.setContent(
      bodyHtml({
        sections,
        site,
        title: docTitle,
        toc,
        style: styles.document,
      }),
      {
        waitUntil: "networkidle0",
      },
    );
    await body.evaluate(() => document.fonts.ready);
    const { fallbacks, outside } = await rewriteLinks(body, sections);
    if (fallbacks)
      log(
        `Note: ${fallbacks} link(s) point to a heading that doesn't exist; they open the page instead.`,
      );
    if (outside.length)
      log(
        `Note: ${outside.length} link(s) go to site pages not in the PDF:\n  ${outside.join("\n  ")}`,
      );

    const pdfOptions = {
      format,
      margin,
      printBackground: true,
      tagged: true,
      displayHeaderFooter: true,
      headerTemplate: headerTemplate({
        title: docTitle,
        subtitle,
        style: styles.margins,
      }),
      footerTemplate: footerTemplate({ date, style: styles.margins }),
    };
    const missing = await fillPageNumbers(
      body,
      await readDestinations(await body.pdf(pdfOptions)),
    );
    if (missing.length)
      log(
        `Warning: no page number found for ${missing.length} TOC entr(y/ies): ${missing.join(", ")}`,
      );
    const bodyPdf = await body.pdf(pdfOptions);

    const cover = await browser.newPage();
    await cover.setContent(
      coverHtml({
        site,
        title: docTitle,
        subtitle,
        date,
        style: styles.document,
      }),
      {
        waitUntil: "networkidle0",
      },
    );
    const coverPdf = await cover.pdf({
      format,
      printBackground: true,
      margin: { top: 0, bottom: 0, left: 0, right: 0 },
    });

    await writeFile(
      out,
      await finishPdf(bodyPdf, coverPdf, [
        { level: 0, title: "Contents", page: 1 },
        ...toc,
      ]),
    );
    const total = sections.reduce((n, s) => n + s.pages.length, 0);
    log(
      `Wrote ${out} (${sections.length} section(s), ${total} page(s), ${toc.length} TOC entries)`,
    );
    return {
      out,
      sections: sections.map((s) => ({
        title: s.title,
        pages: s.pages.map((p) => p.url),
      })),
    };
  } finally {
    await browser.close();
  }
}

/** Write each TOC target's page number into its entry; returns the targets with no page. */
function fillPageNumbers(pdfPage, pages) {
  return pdfPage.evaluate((pages) => {
    const missing = [];
    document.querySelectorAll(".toc-page").forEach((el) => {
      const page = pages[el.dataset.target];
      if (page) el.textContent = page;
      else missing.push(el.dataset.target);
    });
    return missing;
  }, Object.fromEntries(pages));
}

/** Point links at crawled pages to their in-PDF anchors; prefix ids so they stay unique. */
async function rewriteLinks(pdfPage, sections) {
  const index = new Map();
  let n = 0;
  for (const s of sections)
    for (const p of s.pages) index.set(normalizeUrl(p.url), n++);

  const hrefs = await pdfPage.$$eval(".pdf-page a[href]", (as) => [
    ...new Set(as.map((a) => a.getAttribute("href"))),
  ]);
  const mapping = Object.fromEntries(
    hrefs.map((h) => [h, anchorFor(h, index)]).filter(([, a]) => a),
  );

  const fallbacks = await pdfPage.evaluate((mapping) => {
    document.querySelectorAll(".pdf-page").forEach((page) => {
      // SVG ids are left alone: Mermaid's embedded styles and markers reference them.
      page
        .querySelectorAll("[id]:not(svg, svg *)")
        .forEach((el) => (el.id = `${page.id}-${el.id}`));
    });
    let fallbacks = 0;
    document.querySelectorAll(".pdf-page a[href]").forEach((a) => {
      let target = mapping[a.getAttribute("href")];
      if (!target) return;
      // Anchor to a heading that doesn't exist (broken in the source docs): land on the page instead.
      if (!document.getElementById(target.slice(1))) {
        target = target.replace(/^#(p\d+)-.*$/, "#$1");
        fallbacks++;
      }
      a.setAttribute("href", target);
    });
    return fallbacks;
  }, mapping);

  const origin = new URL(sections[0].pages[0].url).origin;
  const outside = hrefs.filter((h) => !mapping[h] && h.startsWith(origin));
  return { fallbacks, outside };
}

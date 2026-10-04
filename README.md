# pdfsaurus

Turn a Docusaurus site into one PDF that reads like a printed book.

## How it works

A Docusaurus site is made of separate parts: usually your **docs**, often a **blog**, and sometimes more (for example an API reference). Inside each part, pages are linked by the **Next** button at the bottom of the page. That's why you can give `--start` more than once: one start page per part, in the order you want them in the PDF. From each start page, pdfsaurus follows **Next** until the part ends.

```bash
# Only your docs
npx pdfsaurus --start http://localhost:3000/docs/intro

# Your docs, then your blog (start from the newest post)
npx pdfsaurus --start http://localhost:3000/docs/intro --start http://localhost:3000/blog/latest-post
```

Each part gets its own title page in the PDF, named after its sidebar category or navbar item (e.g. "Docs", "Blog").

## What's in the PDF

- **Cover page:** your logo, title, optional subtitle and the date.
- **Table of contents:** numbered like a book (`1.2.1 Keys ........ 5`), with clickable entries and real page numbers.
- **A title page for each part**, like a chapter divider, e.g. "PART 1 — Guides".
- **Header and footer** on every page except the cover: the title at the top, the date and "Page X of Y" at the bottom.
- **Bookmarks:** the clickable outline in your PDF viewer's sidebar.
- **Your site's own look:** code blocks, admonitions (the coloured _note_, _tip_ and _warning_ boxes) and Mermaid diagrams appear the same as on the website.
- **Every tab is printed.** A tab group is Docusaurus's `<Tabs>` box, where you click a tab (for example _npm_, _yarn_, _pnpm_) to see its panel. Paper can't be clicked, so pdfsaurus prints every panel one after another, each with its tab name above it.
- **Working links:** links between pages in the PDF jump to that place inside the PDF, and other links still open in the browser.

## Install

```bash
npm install --save-dev pdfsaurus
```

Puppeteer downloads Chrome on install. If your npm blocks install scripts, allow them with `npm approve-scripts puppeteer`, or point Puppeteer at a Chrome you already have (see below).

## Usage

Start the site (`npm run build && npm run serve`, or use a deployed URL), then run:

```bash
npx pdfsaurus \
  --start http://localhost:3000/docs/intro \
  --start http://localhost:3000/api/overview \
  --start http://localhost:3000/blog/latest-post \
  --title "My Product" --subtitle "Developer documentation" \
  --out docs.pdf
```

| Option                | Default                        | Description                                                                                                                                                |
| --------------------- | ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `-s, --start <url>`   | required                       | First page of a part (repeatable). Parts keep the order you give them.                                                                                     |
| `-o, --out <file>`    | `docs.pdf`                     | Output file                                                                                                                                                |
| `-t, --title <text>`  | site title                     | Title on the cover and in the page header                                                                                                                  |
| `--subtitle <text>`   |                                | Subtitle on the cover                                                                                                                                      |
| `--content <sel>`     | `article`                      | CSS selector for the main content of each page. Everything else, like the navbar and sidebar, is left out.                                                 |
| `--next <sel>`        | `a.pagination-nav__link--next` | CSS selector for the "next page" link                                                                                                                      |
| `-x, --exclude <sel>` |                                | Extra CSS selector to remove from every page (repeatable). Breadcrumbs, the doc footer, pagination, copy buttons and heading `#` links are always removed. |
| `--format <fmt>`      | `A4`                           | Paper size: `A4`, `Letter`, …                                                                                                                              |
| `--css <file>`        |                                | Your own stylesheet, applied after the built-in styles, to the pages and to the header/footer (repeatable). See [Styling](#styling).                       |
| `--toc-depth <n>`     | `2`                            | Heading levels listed in the table of contents under each page, from `0` (none) to `5`: `1` adds h2, `2` adds h3, … `5` adds h6                            |
| `--timeout <ms>`      | `60000`                        | Timeout per page                                                                                                                                           |

**Repeatable** options can be given more than once, and every value is used: `--start a --start b`, `--css base.css --css extra.css`. Other options take one value; if you give one twice, the last value wins.

Links between pages that are in the PDF become jumps inside the PDF. All other links stay as web links. A link to a heading that doesn't exist opens the top of its page instead. The tool also lists any links to pages on the same site that aren't in the PDF.

## Styling

The built-in styles live in [`src/styles/document.css`](src/styles/document.css) (cover, contents, pages) and [`src/styles/header-footer.css`](src/styles/header-footer.css). To change them, pass your own CSS file with `--css`. It loads after the built-in styles, so it can override any variable or rule.

```css
/* pdf.css */
:root {
  --pdf-accent: #7c3aed; /* main colour */
  --pdf-font-size: 12px; /* base text size */
}
.pdf-cover h1 {
  font-size: 3rem;
} /* cover title */
.pdf-cover::before {
  width: 6mm;
} /* accent bar on the cover */
.toc-entry.lvl-1 {
  font-weight: 500;
} /* page rows in the contents */
.pdf-part h1 {
  border-bottom: none;
} /* part title pages */
.pdf-header-title {
  letter-spacing: 0;
} /* header, left */
.pdf-page-number {
  border-radius: 2px;
} /* footer, "Page 3 of 40" */
```

```bash
npx pdfsaurus --start http://localhost:3000/docs/intro --css pdf.css
```

**Variables.** The quickest changes. Set them in `:root`:

| Variable                   | Default                                             | Changes                                                                      |
| -------------------------- | --------------------------------------------------- | ---------------------------------------------------------------------------- |
| `--pdf-accent`             | the site's `--ifm-color-primary`                    | main colour: cover bar, part pages, contents, header, page badge             |
| `--pdf-font-family`        | the site's fonts                                    | font of the body, headings and header/footer (code keeps its monospace font) |
| `--pdf-font-size`          | `13px`                                              | base text size; most other sizes scale with it                               |
| `--pdf-muted`              | `#8a8f98`                                           | grey text in the header/footer                                               |
| `--pdf-rule`               | `#d5d8de`                                           | line above the footer                                                        |
| `--pdf-on-accent`          | `#fff`                                              | text on the page-number badge                                                |
| `--pdf-header-font-family` | `--pdf-font-family` if set, else the system UI font | header/footer font only                                                      |
| `--pdf-header-font-size`   | `8px`                                               | header/footer text size                                                      |

**Classes.** For anything else, target the element directly:

| Element           | Class                                                                                                                                     |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Cover             | `.pdf-cover`, `.pdf-cover-main`, `.pdf-cover img`, `.pdf-cover h1`, `.pdf-subtitle`, `.pdf-cover-meta`                                    |
| Table of contents | `.pdf-toc`, `.toc-entry.lvl-0` (part), `.lvl-1` (page), `.lvl-2` (h2) … `.lvl-6` (h6), `.toc-num`, `.toc-title`, `.toc-dots`, `.toc-page` |
| Part title page   | `.pdf-part`, `.pdf-part span`, `.pdf-part h1`                                                                                             |
| Each site page    | `.pdf-page`                                                                                                                               |
| Tab label         | `.pdf-tab-label`                                                                                                                          |
| Header            | `.pdf-header`, `.pdf-header-row`, `.pdf-header-title`, `.pdf-header-subtitle`                                                             |
| Footer            | `.pdf-footer`, `.pdf-footer-row`, `.pdf-footer-date`, `.pdf-page-number`                                                                  |

Chrome renders the header and footer without the site's stylesheets, so a web font used there needs its own `@font-face` in your CSS. Some contents rules use `!important` (link colours); to override them, use `!important` too.

Page margins are set with the `margin` API option (see below). The header and footer follow the left and right margins.

## How page numbers work

Chrome has no CSS `target-counter()`, so the body is printed twice. After the first pass, the tool reads which page every table-of-contents target landed on (Chrome stores these as PDF named destinations). The second pass prints those numbers. The cover is rendered separately and swapped in for a blank first page with `pdf-lib`, so it has no header or footer. Page numbers in the footer and in the table of contents are the same numbers your PDF viewer shows.

## Programmatic API

```js
import { generatePdf } from "pdfsaurus";

await generatePdf({
  starts: ["http://localhost:3000/docs/intro"],
  out: "docs.pdf",
  title: "My Product",
  exclude: [".my-feedback-widget"],
  margin: { left: "20mm", right: "20mm" },
  css: ["./pdf.css"],
  log: console.log,
});
```

`generatePdf` takes every CLI option in camelCase (`starts`, `out`, `title`, `subtitle`, `content`, `next`, `exclude`, `format`, `css`, `tocDepth`, `timeout`), plus:

| Option   | Default                                                      | Description                                                                |
| -------- | ------------------------------------------------------------ | -------------------------------------------------------------------------- |
| `margin` | `{top: '22mm', bottom: '20mm', left: '16mm', right: '16mm'}` | Page margins. You can set only some sides; the others keep their defaults. |
| `log`    | no output                                                    | Called with progress messages and warnings                                 |

It resolves to `{out, sections: [{title, pages: [url, ...]}]}`.

## Troubleshooting

**`No usable sandbox!` on Ubuntu 23.10+.** AppArmor blocks Puppeteer's downloaded Chrome. Point Puppeteer at the Chrome installed on your system instead:

```bash
PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome npx pdfsaurus ...
```

## Contributing

See [DEVELOPMENT.md](DEVELOPMENT.md) for how the code works and how to run the tests.

## License

MIT

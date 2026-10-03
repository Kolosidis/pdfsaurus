# docusaurus-pdf-kit

Turn a Docusaurus site into one polished PDF: a cover page, a numbered table of contents (`1.2.1 Title ........ 5`) where every entry is a link with its real page number, a title page for each part, a styled header and footer, PDF bookmarks, and the site's own styling (code blocks, admonitions, Mermaid diagrams). Each tab in a tab group is printed with its label.

You give it the **first page of each section, in the order you want**. For each one, it follows the site's "Next" links until there is no next page, or until it reaches the first page of another section. Each section is named after its top-level sidebar category, or the active navbar item if the page isn't in a category.

## Install

```bash
npm install --save-dev docusaurus-pdf-kit
```

Puppeteer downloads Chrome on install. If your npm blocks install scripts, allow them with `npm approve-scripts puppeteer`, or point Puppeteer at a Chrome you already have (see below).

## Usage

Start the site (`npm run build && npm run serve`, or use a deployed URL), then run:

```bash
npx docusaurus-pdf-kit \
  --start http://localhost:3000/docs/intro \
  --start http://localhost:3000/api/overview \
  --start http://localhost:3000/blog/2026/09/30/latest-post \
  --title "My Product" --subtitle "Developer documentation" \
  --out docs.pdf
```

| Option | Default | Description |
| --- | --- | --- |
| `-s, --start <url>` | required | First page of a section. Repeat it for more sections; they keep the order you give them. |
| `-o, --out <file>` | `docs.pdf` | Output file |
| `-t, --title <text>` | site title | Title on the cover and in the page header |
| `--subtitle <text>` | | Subtitle on the cover |
| `--content <sel>` | `article` | CSS selector for the part of each page to keep |
| `--next <sel>` | `a.pagination-nav__link--next` | CSS selector for the "next page" link |
| `-x, --exclude <sel>` | | Extra CSS selector to remove from every page (repeatable). Breadcrumbs, the doc footer, pagination, copy buttons and heading `#` links are always removed. |
| `--format <fmt>` | `A4` | Paper size: `A4`, `Letter`, … |
| `--css <file>` | | Extra stylesheet applied after the built-in styles, to the pages and to the header/footer (repeatable) |
| `--theme <key=value>` | | Set a style variable (repeatable), e.g. `--theme accent=#e11d48 --theme fontSize=12px`. See [Styling](#styling). |
| `--toc-depth <n>` | `2` | Headings listed in the table of contents under each page: `0` none, `1` h2, `2` h2 and h3 |
| `--timeout <ms>` | `60000` | Timeout per page |

Links between pages that are in the PDF become jumps inside the PDF. All other links stay as web links. A link to a heading that doesn't exist opens the top of its page instead. The tool also lists any links to pages on the same site that aren't in the PDF.

## Styling

The built-in styles live in [`src/styles/document.css`](src/styles/document.css) (cover, contents, pages) and [`src/styles/header-footer.css`](src/styles/header-footer.css). You can change them in two ways.

**Theme variables.** A `theme` key in camelCase sets the matching `--pdf-*` CSS variable:

| Key | Variable | Default |
| --- | --- | --- |
| `accent` | `--pdf-accent` | the site's `--ifm-color-primary` |
| `fontSize` | `--pdf-font-size` | `13px` (body text) |
| `muted` | `--pdf-muted` | `#8a8f98` (header/footer text) |
| `rule` | `--pdf-rule` | `#d5d8de` (footer line) |
| `onAccent` | `--pdf-on-accent` | `#fff` (page-number text) |
| `headerFontFamily` | `--pdf-header-font-family` | system UI font |
| `headerFontSize` | `--pdf-header-font-size` | `8px` |

**Your own CSS.** Files passed with `css` load after the built-in styles, so they can override any rule. Chrome renders the header and footer without the site's stylesheets, so give fonts and sizes there explicitly.

```css
/* pdf.css */
:root { --pdf-accent: #7c3aed; }           /* same as --theme accent=#7c3aed */
.pdf-cover h1 { font-size: 3rem; }          /* cover title */
.pdf-cover::before { width: 6mm; }          /* accent bar on the cover */
.toc-entry.lvl-1 { font-weight: 500; }      /* page rows in the contents */
.pdf-part h1 { border-bottom: none; }       /* part title pages */
.pdf-header-title { letter-spacing: 0; }    /* header, left */
.pdf-page-number { border-radius: 2px; }    /* footer, "Page 3 of 40" */
```

```bash
npx docusaurus-pdf-kit --start http://localhost:3000/docs/intro --css pdf.css
```

| Element | Class |
| --- | --- |
| Cover | `.pdf-cover`, `.pdf-cover-main`, `.pdf-cover img`, `.pdf-cover h1`, `.pdf-subtitle`, `.pdf-cover-meta` |
| Table of contents | `.pdf-toc`, `.toc-entry.lvl-0` (part) … `.lvl-3` (h3), `.toc-num`, `.toc-title`, `.toc-dots`, `.toc-page` |
| Part title page | `.pdf-part`, `.pdf-part span`, `.pdf-part h1` |
| Each site page | `.pdf-page` |
| Tab label | `.pdf-tab-label` |
| Header | `.pdf-header`, `.pdf-header-row`, `.pdf-header-title`, `.pdf-header-subtitle` |
| Footer | `.pdf-footer`, `.pdf-footer-row`, `.pdf-footer-date`, `.pdf-page-number` |

Page margins are set with the `margin` API option (see below). The header and footer follow the left and right margins.

## How page numbers work

Chrome has no CSS `target-counter()`, so the body is printed twice. After the first pass, the tool reads which page every table-of-contents target landed on (Chrome stores these as PDF named destinations). The second pass prints those numbers. The cover is rendered separately and swapped in for a blank first page with `pdf-lib`, so it has no header or footer. Page numbers in the footer and in the table of contents are the same numbers your PDF viewer shows.

## Programmatic API

```js
import {generatePdf} from 'docusaurus-pdf-kit';

await generatePdf({
  starts: ['http://localhost:3000/docs/intro'],
  out: 'docs.pdf',
  title: 'My Product',
  exclude: ['.my-feedback-widget'],
  margin: {left: '20mm', right: '20mm'},
  theme: {accent: '#e11d48', fontSize: '12px'},
  css: ['./pdf.css'],
  log: console.log,
});
```

`generatePdf` takes every CLI option in camelCase (`starts`, `out`, `title`, `subtitle`, `content`, `next`, `exclude`, `format`, `css`, `tocDepth`, `timeout`), plus:

| Option | Default | Description |
| --- | --- | --- |
| `theme` | `{}` | Style variables, e.g. `{accent: '#e11d48'}`. See [Styling](#styling). |
| `margin` | `{top: '22mm', bottom: '20mm', left: '16mm', right: '16mm'}` | Page margins. You can set only some sides; the others keep their defaults. |
| `log` | no output | Called with progress messages and warnings |

It resolves to `{out, sections: [{title, pages: [url, ...]}]}`. The package also exports `tocEntries`, `DEFAULT_EXCLUDE` and `DEFAULT_MARGIN`.

## Troubleshooting

**`No usable sandbox!` on Ubuntu 23.10+.** AppArmor blocks Puppeteer's downloaded Chrome. Point Puppeteer at the Chrome installed on your system instead:

```bash
PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome npx docusaurus-pdf-kit ...
```

## Contributing

See [DEVELOPMENT.md](DEVELOPMENT.md) for how the code works and how to run the tests.

## License

MIT

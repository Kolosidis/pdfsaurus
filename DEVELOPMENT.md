# Development

How pdfsaurus works, file by file. For how to use it, see [README.md](README.md).

## Setup

```bash
npm install
npm test          # node --test, no browser needed
```

Requires Node 24+ (`.nvmrc`; run `nvm use`). The only dependencies are `puppeteer` (crawling and printing) and `pdf-lib` (PDF post-processing).

To try a change end to end, run the CLI against any Docusaurus site:

```bash
node bin/cli.js --start http://localhost:3000/docs/intro --out /tmp/test.pdf
```

On Ubuntu 23.10+ prefix it with `PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome` (see the README's Troubleshooting section).

## Layout

```
bin/cli.js                    CLI: parses arguments, calls generatePdf
src/index.js                  generatePdf: runs the whole pipeline
src/crawl.js                  follows "Next" links and extracts each page
src/html.js                   builds the HTML documents and loads the styles
src/toc.js                    numbers the table of contents (pure)
src/links.js                  URL helpers (pure)
src/pdf.js                    reads and edits Chrome's PDF output with pdf-lib
src/styles/document.css       styles for the cover, contents, part pages and body
src/styles/header-footer.css  styles for the running header and footer
test/*.test.js                unit tests for the pure modules
```

The package ships `bin/` and `src/` (`files` in `package.json`), so the CSS files are published with the code. The package entry point is `src/index.js`, which exports `generatePdf`, `tocEntries`, `DEFAULT_EXCLUDE` and `DEFAULT_MARGIN`.

## Pipeline

`generatePdf` in `src/index.js` runs these steps with one headless Chrome:

1. **Crawl** (`crawl.js`). Visit every page in every section and keep a cleaned copy of its content.
2. **Number the contents** (`toc.js`). Turn the sections into numbered TOC entries, each with the id of the element it links to.
3. **Load styles** (`html.js`). Combine the built-in CSS, the variables computed from the site and options, and the user's CSS files.
4. **Assemble the body** (`html.js`). Build one HTML document with a blank first page, the contents, and every part and page. Load it into a fresh tab.
5. **Rewrite links** (`index.js`, `rewriteLinks`). Give every id a per-page prefix and point links to crawled pages at their in-document anchors.
6. **Print twice** (`index.js` + `pdf.js`). The first print tells us which page every TOC target lands on. Those numbers go into the contents (`fillPageNumbers`), then the body is printed again.
7. **Cover** (`html.js` + `pdf.js`). Print the cover on its own with no margins, header or footer, and swap it in for the blank first page.
8. Write the file.

### 1. Crawling (`src/crawl.js`)

`crawl(browser, options)` opens one tab and forces the light theme: it emulates `prefers-color-scheme: light` and sets `localStorage.theme` before any page script runs.

For each start URL it follows `next` (the "Next" link selector) page by page. The crawl for a start URL stops when:

- there is no next link,
- the next URL was already visited (this prevents loops and duplicate pages), or
- the next URL is another start URL. That page belongs to that start URL's crawl, even if it comes later in the order.

Category index pages that Docusaurus generates (`link: {type: 'generated-index'}`, detected by their `generatedIndexPage` wrapper) are skipped, but their "Next" link is still followed: they only hold a card for each page that comes right after them. If nothing is left to print, the crawl throws.

Along the way, the pages are split into sections (the PDF's parts): a new section begins whenever a page's top-level sidebar entry differs from the previous page's. Pages without one (e.g. the blog) stay in the current section, so a start URL with no sidebar yields a single section.

URLs are compared with `normalizeUrl`, so `/docs/intro`, `/docs/intro/` and `/docs/intro#x` count as the same page. Both the requested URL and the URL after redirects are marked as visited.

Before extracting, `waitForRender` waits for every Mermaid container to contain an `<svg>` and for web fonts to load. `networkidle0` alone doesn't cover client-side rendering.

`extractPage` runs **inside the browser** via `page.evaluate`, so it can't use imports or anything from the surrounding Node scope. Everything it needs comes in as arguments. It:

- clones the `content` element and removes `DEFAULT_EXCLUDE` plus the user's `exclude` selectors,
- makes `href` and `src` absolute, so the HTML still works after it's moved into another document,
- un-hides every tab panel, removes the tab bar and adds a `.pdf-tab-label` with the tab's name above each panel,
- collects the headings for the TOC: the ones the site's own TOC lists (see below), else every `h2[id]`–`h6[id]` outside tab panels and admonitions,
- finds the page's top-level sidebar entry (`group`, a level-1 category or link containing the current page) and the active navbar link (`navTitle`, the section title when there is no group),
- reads site-wide info from the first page: title, origin, logo, accent colour (`--ifm-color-primary`) and stylesheet URLs.

### 2. Table of contents (`src/toc.js`)

`tocEntries(sections, depth)` is a pure function. It returns a flat list of `{level, num, title, target}`:

| Level | What           | `num`         | `target`                        |
| ----- | -------------- | ------------- | ------------------------------- |
| 0     | part (section) | `1`           | `part1`                         |
| 1     | page           | `1.2`         | `p3` (index across _all_ pages) |
| 2     | top heading    | `1.2.1`       | `p3-<heading id>`               |
| 3     | nested once    | `1.2.1.1`     | `p3-<heading id>`               |
| 4–6   | nested deeper  | `1.2.1.1.1` … | `p3-<heading id>`               |

A heading's entry `level` is 2 plus how deeply it is nested, which is also the `.lvl-N` CSS class. Headings nest the way Docusaurus's own TOC nests them: each one goes under the closest earlier heading of a higher rank. So an h4 directly under an h2 becomes the h2's child (level 3), and an h3 before any h2 sits at the top (level 2). On a normal page this means h2 → 2, h3 → 3 and so on. `depth` caps the nesting: 0 lists pages only, 1 the top level, up to 5 (`MAX_TOC_DEPTH`, the default). `generatePdf` rejects any other value.

Which headings a page has is decided in `extractPage`: the ones the site's desktop TOC links to (`.theme-doc-toc-desktop`), which already honours `toc_min_heading_level`/`toc_max_heading_level`. The crawl tab uses a desktop-sized viewport so that TOC is rendered. A page without one falls back to every `h2`–`h6` outside tab panels and admonitions.

The targets must match the ids that `bodyHtml` and `rewriteLinks` create. If you change the id scheme in one place, change it in all three.

### 3. Styles (`src/html.js`, `src/styles/`)

There are two stylesheets, because Chrome renders the header and footer in a separate document without the page's styles:

- `document.css` is used by the body and the cover. It loads after the site's own stylesheets, so it can use Infima variables (`--ifm-*`).
- `header-footer.css` is put into the header and footer templates. It can't see site styles, so its defaults are literal values and its font sizes are explicit.

Each file starts with a `:root` block that sets the default `--pdf-*` variables.

`loadStyles({vars, css})` reads both files and the user's CSS files, then returns `{document, margins}`. Each is a complete `<style>` element in this order:

1. the built-in stylesheet (including its default variables),
2. `:root { --pdf-accent: <site colour>; --pdf-margin-left: …; --pdf-margin-right: … }`, computed by `generatePdf`. It has the same specificity as the defaults and comes later, so it wins,
3. the user's CSS files, which go into **both** stylesheets so users can restyle the header and footer too.

Any `</style` in user CSS is escaped so it can't close the tag early.

`cssVars(vars)` turns `{accent, marginLeft}` into `--pdf-accent: …; --pdf-margin-left: …;`. It drops empty values and throws on a key that isn't an identifier, or on a value containing `; { } < >`, because those could break out of the declaration (margins come from the user). Because user CSS comes last, a user's `:root { --pdf-accent: … }` overrides the site colour.

To add a new style variable: use it in a CSS file as `var(--pdf-my-thing)`, set its default in that file's `:root` block, and add it to the README's Variables table. No JavaScript changes are needed. `--pdf-font-family` is the exception to "set a default": it is left unset so `var(--pdf-font-family, <site font>)` falls back to the site's fonts.

### 4. HTML (`src/html.js`)

- `bodyHtml` builds the main document: a 1px `.pdf-cover-slot` (which uses up page 1 so it can be replaced by the cover later), `<nav class="pdf-toc">`, then for each section a `.pdf-part` title page (`id="partN"`) followed by one `.pdf-page` (`id="pN"`) per crawled page. TOC page numbers start as the placeholder `000`, so the first print has the same layout as the second.
- `coverHtml` builds the cover as its own document.
- `headerTemplate` / `footerTemplate` return Chrome's header/footer HTML with the `margins` stylesheet in front. Chrome fills in `.pageNumber` and `.totalPages`.
- Both documents set `<base href>` to the site origin and `data-theme="light"`, and link the site's stylesheets.
- Everything put into HTML goes through `esc`. Page HTML from the crawl is inserted as it is, on purpose.

### 5. Links (`src/index.js`, `src/links.js`)

Several pages often use the same heading id (`overview`, `usage`), so `rewriteLinks` first renames every id in each `.pdf-page` to `<pageId>-<id>`. SVG elements keep their ids, because Mermaid's styles and markers refer to them.

Each link `href` is then mapped with `anchorFor(url, index)`, where `index` maps normalised page URLs to page numbers:

- a link to a crawled page becomes `#pN` or `#pN-<hash>`,
- anything else (other sites, `mailto:`, pages not in the PDF) is left alone,
- a link to a heading that doesn't exist falls back to the top of the page (`#pN`) and is counted, so the user sees a note.

Same-origin links that aren't in the PDF are listed in the log.

### 6. Page numbers (`src/pdf.js`)

Chrome doesn't support CSS `target-counter()`, so the body is printed twice with the same `pdfOptions`:

1. In the first print, Chrome creates a PDF named destination for every element that an internal link points to. `readDestinations(bytes)` returns a `Map` of each destination name (the element id) to its 1-based page number. It reads both the PDF 1.2+ `/Names /Dests` name tree (including `Kids`) and the older `/Dests` dictionary.
2. `fillPageNumbers` writes those numbers into the `.toc-page` spans and returns any targets it couldn't find. The second print then has the correct numbers. The placeholder `000` is three digits wide, so swapping in the real numbers doesn't change the layout, as long as the document has fewer than 1000 pages.

### 7. Cover (`src/pdf.js`)

`finishPdf(bodyBytes, coverBytes, outline)` embeds the cover's first page as a form XObject, draws it onto a new page 0 of the body's size, and removes the old blank page. Every other page object stays the same, so links, named destinations and tagged structure still work. Because the cover takes the place of a real page, footer numbers match the page numbers shown in a PDF viewer.

It then writes the bookmarks (the outline) from the TOC entries, each pointing at the named destination Chrome emitted for its target. Chrome's own outline (`outline: true`) is not used: on real Docusaurus pages it repeats heading text ("IntroductionIntroduction") and drops the space at line breaks.

## CLI (`bin/cli.js`)

The CLI uses `node:util` `parseArgs`. Options that take a list (`--start`, `--exclude`, `--css`) are repeatable (`multiple: true`). It converts `--toc-depth` and `--timeout` to numbers and passes everything else to `generatePdf` as it is. Exit codes: `0` success or `--help`, `2` bad arguments, `1` generation failed. To add an option, add it to `parseArgs`, to `HELP`, to the JSDoc of `generatePdf` and to the README.

## Tests

`npm test` runs `node --test` on `test/`:

- `links.test.js`: `normalizeUrl` and `anchorFor`
- `toc.test.js`: numbering, unique targets, `depth`
- `html.test.js`: `cssVars` mapping and validation, and the order of styles in `loadStyles`

Only pure code has tests. Crawling and printing need a browser and a site, so check changes there by running the CLI against a real Docusaurus site and looking at the PDF. `pdftotext` and `pdftoppm` (poppler) are useful for this.

## Things to know

- Code in `page.evaluate` / `$$eval` callbacks runs in the browser. Pass any data it needs as an argument.
- The `.pdf-part` height (`225mm`) assumes A4 with the default margins. With other paper sizes or margins, the part title isn't vertically centred.
- `waitForRender` waits up to 15 s for Mermaid diagrams, separately from `timeout`.
- The date is formatted with the `en` locale.

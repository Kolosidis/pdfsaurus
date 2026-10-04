#!/usr/bin/env node
import { parseArgs } from "node:util";
import { generatePdf } from "../src/index.js";

const HELP = `Usage: pdfsaurus --start <url> [--start <url> ...] [options]

Each start URL is the first page of a part (e.g. your docs, your blog). Parts
appear in the PDF in the order given; within a part, pages follow the site's
"Next" links.

Options:
  -s, --start <url>      first page of a part (repeatable, required)
  -o, --out <file>       output file (default: docs.pdf)
  -t, --title <text>     cover/header title (default: site title)
      --subtitle <text>  cover subtitle
      --content <sel>    selector of the page body (default: article)
      --next <sel>       selector of the next-page link (default: a.pagination-nav__link--next)
  -x, --exclude <sel>    extra selector to strip from pages (repeatable)
      --format <fmt>     paper format: A4, Letter, ... (default: A4)
      --css <file>       extra stylesheet applied after the built-in styles (repeatable)
      --toc-depth <n>    cap heading nesting in the TOC: 0 pages only, 1 top level ... 5
                         (default: no cap, each page lists what the site's own TOC lists)
      --timeout <ms>     per-page timeout (default: 60000)
  -h, --help             show this help`;

let values;
try {
  ({ values } = parseArgs({
    options: {
      start: { type: "string", short: "s", multiple: true },
      out: { type: "string", short: "o" },
      title: { type: "string", short: "t" },
      subtitle: { type: "string" },
      content: { type: "string" },
      next: { type: "string" },
      exclude: { type: "string", short: "x", multiple: true },
      format: { type: "string" },
      css: { type: "string", multiple: true },
      "toc-depth": { type: "string" },
      timeout: { type: "string" },
      help: { type: "boolean", short: "h" },
    },
  }));
} catch (err) {
  console.error(`${err.message}\n\n${HELP}`);
  process.exit(2);
}

if (values.help || !values.start) {
  console.log(HELP);
  process.exit(values.help ? 0 : 2);
}

const { start, timeout, "toc-depth": tocDepth, ...rest } = values;
try {
  await generatePdf({
    ...rest,
    starts: start,
    timeout: timeout ? Number(timeout) : undefined,
    tocDepth: tocDepth ? Number(tocDepth) : undefined,
    log: (msg) => console.log(msg),
  });
} catch (err) {
  console.error(`pdfsaurus: ${err.message}`);
  process.exit(1);
}

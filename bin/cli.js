#!/usr/bin/env node
import {parseArgs} from 'node:util';
import {generatePdf} from '../src/index.js';

const HELP = `Usage: docusaurus-pdf-kit --start <url> [--start <url> ...] [options]

Each --start is the first page of a section. Sections appear in the PDF in the
order given; within a section, pages follow the site's "Next" links.

Options:
  -s, --start <url>      first page of a section (repeatable, required)
  -o, --out <file>       output file (default: docs.pdf)
  -t, --title <text>     cover/header title (default: site title)
      --subtitle <text>  cover subtitle
      --content <sel>    selector of the page body (default: article)
      --next <sel>       selector of the next-page link (default: a.pagination-nav__link--next)
  -x, --exclude <sel>    extra selector to strip from pages (repeatable)
      --format <fmt>     paper format: A4, Letter, ... (default: A4)
      --css <file>       extra stylesheet applied after the built-in styles (repeatable)
      --theme <k=v>      set a style variable, e.g. accent=#e11d48 or fontSize=12px (repeatable)
      --toc-depth <n>    headings in the TOC: 0 pages only, 1 +h2, 2 +h3 (default: 2)
      --timeout <ms>     per-page timeout (default: 60000)
  -h, --help             show this help`;

let values;
try {
  ({values} = parseArgs({
    options: {
      start: {type: 'string', short: 's', multiple: true},
      out: {type: 'string', short: 'o'},
      title: {type: 'string', short: 't'},
      subtitle: {type: 'string'},
      content: {type: 'string'},
      next: {type: 'string'},
      exclude: {type: 'string', short: 'x', multiple: true},
      format: {type: 'string'},
      css: {type: 'string', multiple: true},
      theme: {type: 'string', multiple: true},
      'toc-depth': {type: 'string'},
      timeout: {type: 'string'},
      help: {type: 'boolean', short: 'h'},
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

const {start, timeout, theme = [], 'toc-depth': tocDepth, ...rest} = values;
try {
  await generatePdf({
    ...rest,
    starts: start,
    theme: Object.fromEntries(
      theme.map((kv) => {
        const i = kv.indexOf('=');
        if (i < 1) throw new Error(`--theme expects key=value, got "${kv}"`);
        return [kv.slice(0, i), kv.slice(i + 1)];
      }),
    ),
    timeout: timeout ? Number(timeout) : undefined,
    tocDepth: tocDepth ? Number(tocDepth) : undefined,
    log: (msg) => console.log(msg),
  });
} catch (err) {
  console.error(`docusaurus-pdf-kit: ${err.message}`);
  process.exit(1);
}

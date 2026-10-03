// HTML for the cover, the body and Chrome's header/footer templates. Styles live in ./styles.
import {readFile} from 'node:fs/promises';

export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** {accent: '#f00', fontSize: '12px'} -> "--pdf-accent: #f00; --pdf-font-size: 12px;" */
export function cssVars(vars) {
  return Object.entries(vars)
    .filter(([, v]) => v != null && v !== '')
    .map(([k, v]) => {
      if (!/^[a-z][\w-]*$/i.test(k) || /[;{}<>]/.test(v)) throw new Error(`Invalid CSS value: ${k}: ${v}`);
      return `--pdf-${k.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}: ${v};`;
    })
    .join(' ');
}

/**
 * Stylesheets for the document and for the header/footer: built-in CSS, then the variables
 * computed from the site and options, then the user's CSS files (applied to both, so they can
 * override any variable or rule).
 */
export async function loadStyles({vars, css = []}) {
  const read = (file) => readFile(file, 'utf8');
  const [doc, margins, ...user] = await Promise.all([
    read(new URL('./styles/document.css', import.meta.url)),
    read(new URL('./styles/header-footer.css', import.meta.url)),
    ...css.map(read),
  ]);
  const tail = `:root { ${cssVars(vars)} }\n${user.join('\n')}`;
  // Keep </style> in user CSS from closing the tag early.
  const wrap = (base) => `<style>${`${base}\n${tail}`.replace(/<\/style/gi, '<\\/style')}</style>`;
  return {document: wrap(doc), margins: wrap(margins)};
}

function head({site, title, style}) {
  return `<meta charset="utf-8">
<base href="${esc(site.origin)}/">
<title>${esc(title)}</title>
${site.stylesheets.map((href) => `<link rel="stylesheet" href="${esc(href)}">`).join('\n')}
${style}`;
}

export function coverHtml({site, title, subtitle, date, style}) {
  return `<!doctype html>
<html lang="en" data-theme="light">
<head>${head({site, title, style})}</head>
<body class="pdf-cover-body">
<section class="pdf-cover">
  <div class="pdf-cover-main">
    ${site.logo ? `<img src="${esc(site.logo)}" alt="">` : ''}
    <h1>${esc(title)}</h1>
    ${subtitle ? `<p class="pdf-subtitle">${esc(subtitle)}</p>` : ''}
  </div>
  <p class="pdf-cover-meta">${esc(date)}</p>
</section>
</body>
</html>`;
}

export function bodyHtml({sections, site, title, toc, style}) {
  const tocHtml = toc
    .map(
      (e) =>
        `<a class="toc-entry lvl-${e.level}" href="#${esc(e.target)}">` +
        `<span class="toc-num">${e.num}</span><span class="toc-title">${esc(e.title)}</span>` +
        `<span class="toc-dots"></span><span class="toc-page" data-target="${esc(e.target)}">000</span></a>`,
    )
    .join('\n');

  let n = 0;
  const parts = sections
    .map(
      (s, i) =>
        `<section class="pdf-part" id="part${i + 1}"><span>Part ${i + 1}</span><h1>${esc(s.title)}</h1></section>` +
        s.pages.map((p) => `<section class="pdf-page" id="p${n++}">${p.html}</section>`).join(''),
    )
    .join('');

  return `<!doctype html>
<html lang="en" data-theme="light">
<head>${head({site, title, style})}</head>
<body>
<div class="pdf-cover-slot"></div>
<nav class="pdf-toc"><h1>Contents</h1>${tocHtml}</nav>
${parts}
</body>
</html>`;
}

export function headerTemplate({title, subtitle, style}) {
  return `${style}<div class="pdf-header"><div class="pdf-header-row">
  <span class="pdf-header-title">${esc(title)}</span>
  <span class="pdf-header-subtitle">${esc(subtitle)}</span>
</div></div>`;
}

export function footerTemplate({date, style}) {
  return `${style}<div class="pdf-footer"><div class="pdf-footer-row">
  <span class="pdf-footer-date">${esc(date)}</span>
  <span class="pdf-page-number">Page <span class="pageNumber"></span> of <span class="totalPages"></span></span>
</div></div>`;
}

// Pure table-of-contents model: numbering + anchor targets.

/**
 * Flatten sections → numbered TOC entries.
 * Levels: 0 part ("1"), 1 page ("1.2"), 2 h2 ("1.2.1"), 3 h3 ("1.2.1.1").
 * depth: how many in-page heading levels to include (0 = pages only, 1 = +h2, 2 = +h3).
 * Targets match the ids in the assembled document: part{i}, p{n}, p{n}-{headingId}.
 */
export function tocEntries(sections, depth = 2) {
  const out = [];
  let n = 0;
  sections.forEach((section, si) => {
    const partNum = `${si + 1}`;
    out.push({level: 0, num: partNum, title: section.title, target: `part${si + 1}`});
    section.pages.forEach((page, pi) => {
      const pageNum = `${partNum}.${pi + 1}`;
      const pageId = `p${n++}`;
      out.push({level: 1, num: pageNum, title: page.title, target: pageId});
      let h2 = 0;
      let h3 = 0;
      for (const h of page.headings ?? []) {
        if (h.level === 2 && depth >= 1) {
          h2++;
          h3 = 0;
          out.push({level: 2, num: `${pageNum}.${h2}`, title: h.text, target: `${pageId}-${h.id}`});
        } else if (h.level === 3 && depth >= 2 && h2 > 0) {
          h3++;
          out.push({level: 3, num: `${pageNum}.${h2}.${h3}`, title: h.text, target: `${pageId}-${h.id}`});
        }
      }
    });
  });
  return out;
}

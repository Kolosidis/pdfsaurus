// Pure table-of-contents model: numbering + anchor targets.

export const MAX_TOC_DEPTH = 5; // h2..h6

/**
 * Flatten sections → numbered TOC entries.
 * Levels: 0 part ("1"), 1 page ("1.2"), then the heading level: 2 h2 ("1.2.1"), 3 h3 ("1.2.1.1") … 6 h6.
 * depth: how many in-page heading levels to include (0 = pages only, 1 = +h2, 2 = +h3 … 5 = +h6).
 * A heading that skips a level (h4 right under an h2) has no number to hang off and is left out.
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
      // counts[k] = running number of the current heading at level k (2..6); counts[1] = the page itself.
      const counts = [0, 1, 0, 0, 0, 0, 0];
      for (const h of page.headings ?? []) {
        if (h.level < 2 || h.level > depth + 1 || !counts[h.level - 1]) continue;
        counts[h.level]++;
        counts.fill(0, h.level + 1);
        const num = [pageNum, ...counts.slice(2, h.level + 1)].join('.');
        out.push({level: h.level, num, title: h.text, target: `${pageId}-${h.id}`});
      }
    });
  });
  return out;
}

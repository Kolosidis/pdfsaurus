// Pure table-of-contents model: numbering + anchor targets.

export const MAX_TOC_DEPTH = 5; // h2..h6

/**
 * Flatten sections → numbered TOC entries.
 * Levels: 0 part ("1"), 1 page ("1.2"), then 2 + how deep the heading is nested ("1.2.1", "1.2.1.1" …).
 * Headings nest like Docusaurus's own TOC: under the closest earlier heading of a higher rank,
 * so an h4 right under an h2 is its child, and an h3 before any h2 sits at the top.
 * depth: how many nesting levels of headings to include (0 = pages only, 1 = top level … 5).
 * Targets match the ids in the assembled document: part{i}, p{n}, p{n}-{headingId}.
 */
export function tocEntries(sections, depth = MAX_TOC_DEPTH) {
  const out = [];
  let n = 0;
  sections.forEach((section, si) => {
    const partNum = `${si + 1}`;
    out.push({
      level: 0,
      num: partNum,
      title: section.title,
      target: `part${si + 1}`,
    });
    section.pages.forEach((page, pi) => {
      const pageNum = `${partNum}.${pi + 1}`;
      const pageId = `p${n++}`;
      out.push({ level: 1, num: pageNum, title: page.title, target: pageId });
      const open = []; // heading levels (2..6) of the current heading's ancestors, then itself
      const counts = []; // counts[d] = running number at nesting depth d
      for (const h of page.headings ?? []) {
        while (open.length && open.at(-1) >= h.level) open.pop();
        const d = open.length;
        open.push(h.level);
        if (d >= depth) continue;
        counts[d] = (counts[d] ?? 0) + 1;
        counts.length = d + 1;
        out.push({
          level: d + 2,
          num: [pageNum, ...counts].join("."),
          title: h.text,
          target: `${pageId}-${h.id}`,
        });
      }
    });
  });
  return out;
}

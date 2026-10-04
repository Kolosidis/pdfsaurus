// Post-processing of Chrome's PDF output with pdf-lib.
import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFHexString,
  PDFName,
  PDFNumber,
} from "pdf-lib";

/** Every named destination (Chrome emits one per linked-to element id) -> its [page /XYZ ...] array. */
function namedDests(doc) {
  const result = new Map();
  const add = (name, value) => {
    const dest =
      value instanceof PDFDict ? value.lookup(PDFName.of("D")) : value;
    if (dest instanceof PDFArray) result.set(name, dest);
  };

  // PDF 1.2+ name tree: /Root /Names /Dests { Names [k v k v ...], Kids [...] }
  const walk = (node) => {
    if (!(node instanceof PDFDict)) return;
    const names = node.lookup(PDFName.of("Names"));
    if (names instanceof PDFArray) {
      for (let i = 0; i + 1 < names.size(); i += 2) {
        add(names.lookup(i).decodeText(), names.lookup(i + 1));
      }
    }
    const kids = node.lookup(PDFName.of("Kids"));
    if (kids instanceof PDFArray)
      for (let i = 0; i < kids.size(); i++) walk(kids.lookup(i));
  };
  const nameTree = doc.catalog.lookup(PDFName.of("Names"));
  if (nameTree instanceof PDFDict) walk(nameTree.lookup(PDFName.of("Dests")));

  // PDF 1.1 style: /Root /Dests << /name [page /XYZ ...] >>
  const legacy = doc.catalog.lookup(PDFName.of("Dests"));
  if (legacy instanceof PDFDict) {
    for (const [key, value] of legacy.entries())
      add(key.decodeText(), legacy.context.lookup(value));
  }
  return result;
}

/** Map every named destination to the 1-based page it lands on. */
export async function readDestinations(bytes) {
  const doc = await PDFDocument.load(bytes);
  const pageOf = new Map(
    doc.getPages().map((p, i) => [p.ref.toString(), i + 1]),
  );
  const result = new Map();
  for (const [name, dest] of namedDests(doc)) {
    const page = pageOf.get(dest.get(0).toString());
    if (page) result.set(name, page);
  }
  return result;
}

/**
 * Write the bookmarks: one per entry ({level, title, target} or {level, title, page} with a 0-based
 * page index), nested by level, collapsed.
 * Chrome's own outline (`outline: true`) can repeat heading text ("IntroIntro"), so we build it here.
 * Entries without a destination (target id never printed) get no link but keep their children.
 */
function addOutline(doc, entries) {
  const { context } = doc;
  const dests = namedDests(doc);
  const root = {
    ref: context.nextRef(),
    dict: context.obj({ Type: "Outlines" }),
    level: -1,
    kids: [],
  };
  const stack = [root];
  for (const e of entries) {
    while (stack.at(-1).level >= e.level) stack.pop();
    const parent = stack.at(-1);
    const item = {
      ref: context.nextRef(),
      dict: context.obj({
        Title: PDFHexString.fromText(e.title),
        Parent: parent.ref,
      }),
      level: e.level,
      kids: [],
    };
    const dest =
      e.page != null
        ? context.obj([doc.getPage(e.page).ref, "Fit"])
        : dests.get(e.target);
    if (dest) item.dict.set(PDFName.of("Dest"), dest);
    parent.kids.push(item);
    stack.push(item);
  }

  const link = (node) => {
    node.kids.forEach((kid, i) => {
      if (i > 0) kid.dict.set(PDFName.of("Prev"), node.kids[i - 1].ref);
      if (i < node.kids.length - 1)
        kid.dict.set(PDFName.of("Next"), node.kids[i + 1].ref);
      link(kid);
      context.assign(kid.ref, kid.dict);
    });
    if (!node.kids.length) return;
    node.dict.set(PDFName.of("First"), node.kids[0].ref);
    node.dict.set(PDFName.of("Last"), node.kids.at(-1).ref);
    // Root: number of visible items; items: negative = closed with that many children.
    node.dict.set(
      PDFName.of("Count"),
      PDFNumber.of(node === root ? node.kids.length : -node.kids.length),
    );
  };
  link(root);
  context.assign(root.ref, root.dict);
  doc.catalog.set(PDFName.of("Outlines"), root.ref);
}

/**
 * Swap the body's (blank, reserved) first page for the first page of coverBytes and add the bookmarks.
 * Other page objects are untouched, so links, destinations and tags keep working.
 */
export async function finishPdf(bodyBytes, coverBytes, outline) {
  const body = await PDFDocument.load(bodyBytes);
  const [cover] = await body.embedPdf(coverBytes, [0]);
  const { width, height } = body.getPage(0).getSize();
  body
    .insertPage(0, [width, height])
    .drawPage(cover, { x: 0, y: 0, width, height });
  body.removePage(1);
  addOutline(body, outline);
  return body.save();
}

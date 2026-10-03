// Post-processing of Chrome's PDF output with pdf-lib.
import {PDFArray, PDFDict, PDFDocument, PDFName} from 'pdf-lib';

/**
 * Map every named destination (Chrome emits one per linked-to element id)
 * to the 1-based page it lands on.
 */
export async function readDestinations(bytes) {
  const doc = await PDFDocument.load(bytes);
  const pageOf = new Map(doc.getPages().map((p, i) => [p.ref.toString(), i + 1]));
  const result = new Map();

  const add = (name, value) => {
    const dest = value instanceof PDFDict ? value.lookup(PDFName.of('D')) : value;
    if (!(dest instanceof PDFArray)) return;
    const page = pageOf.get(dest.get(0).toString());
    if (page) result.set(name, page);
  };

  // PDF 1.2+ name tree: /Root /Names /Dests { Names [k v k v ...], Kids [...] }
  const walk = (node) => {
    if (!(node instanceof PDFDict)) return;
    const names = node.lookup(PDFName.of('Names'));
    if (names instanceof PDFArray) {
      for (let i = 0; i + 1 < names.size(); i += 2) {
        add(names.lookup(i).decodeText(), names.lookup(i + 1));
      }
    }
    const kids = node.lookup(PDFName.of('Kids'));
    if (kids instanceof PDFArray) for (let i = 0; i < kids.size(); i++) walk(kids.lookup(i));
  };
  const nameTree = doc.catalog.lookup(PDFName.of('Names'));
  if (nameTree instanceof PDFDict) walk(nameTree.lookup(PDFName.of('Dests')));

  // PDF 1.1 style: /Root /Dests << /name [page /XYZ ...] >>
  const legacy = doc.catalog.lookup(PDFName.of('Dests'));
  if (legacy instanceof PDFDict) {
    for (const [key, value] of legacy.entries()) add(key.decodeText(), legacy.context.lookup(value));
  }
  return result;
}

/**
 * Swap the body's (blank, reserved) first page for the first page of coverBytes.
 * Other page objects are untouched, so links, outline and tags keep working.
 */
export async function replaceFirstPage(bodyBytes, coverBytes) {
  const body = await PDFDocument.load(bodyBytes);
  const [cover] = await body.embedPdf(coverBytes, [0]);
  const {width, height} = body.getPage(0).getSize();
  body.insertPage(0, [width, height]).drawPage(cover, {x: 0, y: 0, width, height});
  body.removePage(1);
  return body.save();
}

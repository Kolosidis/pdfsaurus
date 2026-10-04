import { test } from "node:test";
import assert from "node:assert/strict";
import { PDFDocument, PDFName, PDFString } from "pdf-lib";
import { finishPdf, readDestinations } from "../src/pdf.js";

// Body like Chrome's: reserved first page, then pages with named destinations.
async function body() {
  const doc = await PDFDocument.create();
  const pages = [0, 1, 2, 3].map(() => doc.addPage());
  const dest = (i) => doc.context.obj([pages[i].ref, "XYZ", 0, 800, null]);
  const names = doc.context.obj([
    PDFString.of("part1"),
    dest(2),
    PDFString.of("p0"),
    dest(3),
    PDFString.of("p0-intro"),
    dest(3),
  ]);
  doc.catalog.set(
    PDFName.of("Names"),
    doc.context.obj({ Dests: { Names: names } }),
  );
  return doc.save();
}

function titles(
  doc,
  node = doc.catalog.lookup(PDFName.of("Outlines")),
  depth = 0,
  out = [],
) {
  for (
    let n = node.lookup(PDFName.of("First"));
    n;
    n = n.lookup(PDFName.of("Next"))
  ) {
    const dest = n.lookup(PDFName.of("Dest"));
    const page = dest
      ? doc.getPages().findIndex((p) => p.ref === dest.get(0)) + 1
      : "-";
    out.push(
      `${"  ".repeat(depth)}${n.lookup(PDFName.of("Title")).decodeText()} @${page}`,
    );
    titles(doc, n, depth + 1, out);
  }
  return out;
}

test("builds nested bookmarks from TOC entries", async () => {
  const coverDoc = await PDFDocument.create();
  coverDoc.addPage().drawText("cover");
  const cover = await coverDoc.save();
  const bytes = await finishPdf(await body(), cover, [
    { level: 0, title: "Contents", page: 1 },
    { level: 0, title: "Guide", target: "part1" },
    { level: 1, title: "Intro", target: "p0" },
    { level: 2, title: "Ελληνικά", target: "p0-intro" },
    { level: 2, title: "Gone", target: "p0-missing" },
    { level: 0, title: "API", target: "part2" },
  ]);
  const doc = await PDFDocument.load(bytes);
  assert.deepEqual(titles(doc), [
    "Contents @2",
    "Guide @3",
    "  Intro @4",
    "    Ελληνικά @4",
    "    Gone @-",
    "API @-",
  ]);
  assert.equal((await readDestinations(bytes)).get("p0-intro"), 4);
});

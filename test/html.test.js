import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { cssVars, loadStyles } from "../src/html.js";

test("cssVars maps camelCase keys to --pdf-* variables and skips empty values", () => {
  assert.equal(
    cssVars({ accent: "#f00", headerFontSize: "9px", subtitle: "" }),
    "--pdf-accent: #f00; --pdf-header-font-size: 9px;",
  );
});

test("cssVars rejects values that would break out of the declaration", () => {
  assert.throws(() => cssVars({ accent: "red; } body { display: none" }));
  assert.throws(() => cssVars({ "a b": "red" }));
});

test("loadStyles puts computed variables after the built-in defaults", async () => {
  const { document, margins } = await loadStyles({ vars: { accent: "#f00" } });
  for (const css of [document, margins]) {
    assert.ok(css.indexOf("--pdf-accent: #f00") > css.indexOf("--pdf-accent:"));
    assert.match(css, /^<style>[\s\S]*<\/style>$/);
  }
});

test("user CSS comes last, so it can override the site accent", async () => {
  const file = join(await mkdtemp(join(tmpdir(), "pdfsaurus-")), "user.css");
  await writeFile(file, ":root { --pdf-accent: #7c3aed; }");
  const { document, margins } = await loadStyles({
    vars: { accent: "#f00" },
    css: [file],
  });
  for (const css of [document, margins])
    assert.ok(css.indexOf("#7c3aed") > css.indexOf("--pdf-accent: #f00"));
});

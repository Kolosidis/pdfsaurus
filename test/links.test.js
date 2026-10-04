import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeUrl, anchorFor } from "../src/links.js";

test("normalizeUrl drops hash, query and trailing slash", () => {
  assert.equal(
    normalizeUrl("http://x.dev/docs/intro/?a=1#top"),
    "http://x.dev/docs/intro",
  );
  assert.equal(normalizeUrl("http://x.dev/"), "http://x.dev/");
});

test("anchorFor maps crawled pages and keeps everything else", () => {
  const index = new Map([
    ["http://x.dev/docs/intro", 0],
    ["http://x.dev/api/overview", 4],
  ]);
  assert.equal(anchorFor("http://x.dev/docs/intro/", index), "#p0");
  assert.equal(
    anchorFor("http://x.dev/api/overview#errors", index),
    "#p4-errors",
  );
  assert.equal(anchorFor("http://x.dev/playground", index), null);
  assert.equal(anchorFor("https://github.com", index), null);
  assert.equal(anchorFor("mailto:a@b.c", index), null);
  assert.equal(anchorFor("not a url", index), null);
});

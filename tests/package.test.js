import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createZip, readZip } from "../scripts/zip.mjs";

const source = fileURLToPath(new URL("../dmicher-generics/", import.meta.url));
test("manifest and source imports resolve without a game-system or Premium dependency", () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(source, "module.json"), "utf8"));
  assert.equal(manifest.id, "dmicher-generics");
  assert.equal(manifest.version, "1.0.0");
  assert.deepEqual(manifest.compatibility, { minimum: "13", verified: "14" });
  assert.equal(manifest.relationships, undefined);
  for (const name of [...manifest.esmodules, ...manifest.styles]) assert.ok(fs.existsSync(path.join(source, name)));
  for (const name of fs.readdirSync(path.join(source, "scripts"))) {
    const content = fs.readFileSync(path.join(source, "scripts", name), "utf8");
    for (const match of content.matchAll(/from "(\.\/[^\"]+)"/g)) {
      assert.ok(fs.existsSync(path.join(source, "scripts", match[1])));
    }
  }
});

test("shared stylesheet is scoped to explicit dmicher windows and retains both palettes", () => {
  const css = fs.readFileSync(path.join(source, "styles/dmicher-generics.css"), "utf8");
  const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)];
  for (const [, selectors] of rules) {
    assert.ok(selectors.split(",").every((selector) => selector.trim().startsWith(".dmicher-window")));
  }
  assert.equal((css.match(/\{/g) ?? []).length, rules.length);
  assert.equal((css.match(/\}/g) ?? []).length, rules.length);
  assert.match(css, /data-dmicher-theme="light"/);
  assert.match(css, /--dmicher-window-bg: #1f2023;/);
  assert.match(css, /--dmicher-window-bg: #eef4f1;/);
  assert.doesNotMatch(css, /spotlight|premium/);
});

test("release archive round-trips and rejects traversal", () => {
  const entries = [["module.json", Buffer.from("{}")], ["scripts/api.js", Buffer.from("export {};")]];
  assert.deepEqual([...readZip(createZip(entries))], entries);
  assert.throws(() => createZip([["../secret", Buffer.from("x")]]), /Unsafe ZIP/);
});

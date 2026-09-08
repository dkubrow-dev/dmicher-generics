import test from "node:test";
import assert from "node:assert/strict";
import { createPremiumBridge } from "../dmicher-generics/scripts/premium.js";
import { createAppearanceController } from "../dmicher-generics/scripts/appearance.js";
import { createWindowThemeController, setSharedThemeGetter } from "../dmicher-generics/scripts/theme.js";
import { snapWindowPosition } from "../dmicher-generics/scripts/window-snapping.js";
import { appearanceHelpContent } from "../dmicher-generics/scripts/appearance-content.js";

const viewport = { width: 1000, height: 800 };
const rect = (left, top, width = 200, height = 100) => ({ left, top, width, height });
test("screen snap follows original cursor distance and releases without cumulative drift", () => {
  assert.deepEqual(snapWindowPosition(rect(10, 100), viewport), { left: 0, top: 100 });
  assert.deepEqual(snapWindowPosition(rect(13, 100), viewport), { left: 13, top: 100 });
  assert.deepEqual(snapWindowPosition(rect(798, 699), viewport), { left: 800, top: 700 });
  assert.deepEqual(snapWindowPosition(rect(10, 100), viewport, [], { screen: false, windows: false }), { left: 10, top: 100 });
});
test("neighbor snap uses external edges, ignores distant rectangles and supports optional corner and center alignment", () => {
  const other = rect(400, 200, 300, 300);
  assert.deepEqual(snapWindowPosition(rect(207, 211), viewport, [other], { screen: false }), { left: 200, top: 200 });
  assert.deepEqual(snapWindowPosition(rect(207, 211), viewport, [other], { screen: false, corners: false }), { left: 200, top: 211 });
  assert.deepEqual(snapWindowPosition(rect(207, 307), viewport, [other], { screen: false }), { left: 200, top: 300 });
  assert.deepEqual(snapWindowPosition(rect(207, 307), viewport, [other], { screen: false, centers: false }), { left: 200, top: 307 });
  assert.deepEqual(snapWindowPosition(rect(207, 620), viewport, [other], { screen: false }), { left: 207, top: 620 });
  assert.deepEqual(snapWindowPosition(rect(407, 107), viewport, [other], { screen: false }), { left: 400, top: 100 });
});
test("alignment requires a snapped edge and honors the enabled target types", () => {
  assert.deepEqual(snapWindowPosition(rect(407, 400), viewport, [], { centers: true }), { left: 407, top: 400 });
  assert.deepEqual(snapWindowPosition(rect(407, 10), viewport), { left: 400, top: 0 });
  assert.deepEqual(snapWindowPosition(rect(407, 10), viewport, [], { centers: false }), { left: 407, top: 0 });
  assert.deepEqual(snapWindowPosition(rect(7, 10), viewport, [], { corners: false }), { left: 0, top: 10 });
});
test("one shared theme supersedes legacy consumer selections until its owner disposes", () => {
  const element = { nodeType: 1, querySelector() {}, classList: { contains: () => true }, setAttribute: (_, value) => { element.theme = value; } };
  const prior = globalThis.document;
  globalThis.document = { querySelectorAll: () => [element] };
  try {
    const controller = createWindowThemeController({ windowClass: "dmicher-consumer", getTheme: () => "light" });
    const release = setSharedThemeGetter(() => "dark");
    controller.apply("light"); assert.equal(element.theme, "dark");
    release(); controller.apply(); assert.equal(element.theme, "light");
  } finally { globalThis.document = prior; }
});
test("custom style values require an actual compatible extension and survive revoke, restore and provider removal", () => {
  const prior = globalThis.game, values = { customStyles: ".dmicher-window { --dmicher-text: red; }", theme: "light" };
  globalThis.game = { settings: { get: (_, key) => values[key] } };
  const bridge = createPremiumBridge(), appearance = createAppearanceController({ premium: bridge, help: {} });
  try {
    assert.equal(appearance.getCustomStyles(), "");
    let active = true;
    const registration = bridge.registerProvider({ apiVersion: 1, hasAccess: () => active, extensions: [
      { moduleId: "dmicher-generics", apiVersion: 1, methods: { resolveCustomStyles: (base, css) => css } }
    ] });
    assert.equal(appearance.getCustomStyles(), values.customStyles);
    active = false; registration.notifyChanged(); assert.equal(appearance.getCustomStyles(), "");
    assert.ok(values.customStyles); assert.equal(appearance.getTheme(), "light");
    active = true; registration.notifyChanged(); assert.equal(appearance.getCustomStyles(), values.customStyles);
    registration.dispose(); assert.equal(appearance.getCustomStyles(), "");
  } finally { globalThis.game = prior; }
});
test("Generics help provides matching RU and EN page IDs, footer pages and every appearance setting anchor", () => {
  const prior = globalThis.game;
  try {
    globalThis.game = { i18n: { lang: "ru" } }; const ru = appearanceHelpContent();
    globalThis.game.i18n.lang = "en"; const en = appearanceHelpContent();
    assert.deepEqual(ru.pages.map((page) => page.id), en.pages.map((page) => page.id));
    for (const content of [ru, en]) {
      assert.deepEqual(content.footer, ["author", "thanks", "premium"]);
      const html = content.pages.find((page) => page.id === "settings").html;
      for (const key of ["theme", "snapScreen", "snapWindows", "snapCorners", "snapCenters", "customStyles"]) assert.ok(html.includes(`id="${key}"`));
    }
  } finally { globalThis.game = prior; }
});

test("theme migration chooses an explicit legacy candidate once and never overwrites a saved Generics choice", async () => {
  const previousGame = globalThis.game, previousFoundry = globalThis.foundry;
  const bridge = createPremiumBridge();
  let appearance;
  try {
    const values = new Map([["theme", "dark"], ["appearanceInitialized", false]]), ready = [], hooks = new Map();
    let counter = 0;
    const bus = { on(name, callback) { hooks.set(++counter, { name, callback }); return counter; },
      once(name, callback) { if (name === "ready") ready.push(callback); return this.on(name, callback); }, off(name, id) { hooks.delete(id); } };
    globalThis.game = { settings: { get: (_, key) => values.get(key), async set(_, key, value) { values.set(key, value); } } };
    globalThis.foundry = {};
    appearance = createAppearanceController({ premium: bridge, help: {} });
    assert.equal(appearance.adoptLegacyTheme("unknown", 100), false);
    appearance.adoptLegacyTheme("dark", 10); appearance.adoptLegacyTheme("light", 30); appearance.adoptLegacyTheme("dark", 20);
    appearance.install(bus); appearance.install(bus);
    assert.equal(ready.length, 1); await ready[0]();
    assert.equal(values.get("theme"), "light"); assert.equal(values.get("appearanceInitialized"), true);
    assert.equal(appearance.adoptLegacyTheme("dark", 100), false);
    await ready[0](); assert.equal(values.get("theme"), "light");
    appearance.dispose(); appearance.dispose(); assert.equal(hooks.size, 0);
    appearance = createAppearanceController({ premium: bridge, help: {} });
    assert.equal(appearance.adoptLegacyTheme("dark", 100), false); assert.equal(appearance.getTheme(), "light");
  } finally { appearance?.dispose(); globalThis.game = previousGame; globalThis.foundry = previousFoundry; }
});

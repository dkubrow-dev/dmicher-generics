import test from "node:test";
import assert from "node:assert/strict";
import { normalizeHexColor, renderColorField, createJSONTransfer } from "../dmicher-generics/scripts/components.js";
import { collectLinkedWindowIds, resolveWindowSnap } from "../dmicher-generics/scripts/window-snapping.js";

test("color field submits one normalized hexadecimal value and escapes consumer labels", () => {
  assert.equal(normalizeHexColor(" #abcDEF "), "#ABCDEF");
  for (const value of ["red", "#abc", "#00000000", "#gg0000"]) assert.throws(() => normalizeHexColor(value));
  const html = renderColorField({ name: 'bg"x', value: "#abcdef", label: "<Caption>" });
  assert.equal((html.match(/ name=/g) ?? []).length, 1);
  assert.match(html, /bg&quot;x/); assert.match(html, /&lt;Caption&gt;/); assert.match(html, /#ABCDEF/);
});

test("JSON import validates before applying and never applies invalid/oversized input", async () => {
  const applied = [], checked = [];
  const transfer = createJSONTransfer({ filename: "example.json", maxBytes: 60, exportValue: () => ({}),
    validate: (object) => { checked.push(object); if (object?.kind !== "example") throw Error("Wrong object"); return { ...object, normalized: true }; },
    importValue: (object) => applied.push(object) });
  const file = (text) => ({ size: text.length, text: async () => text });
  await transfer.importFile(file('{"kind":"example"}'));
  assert.deepEqual(applied, [{ kind: "example", normalized: true }]);
  await assert.rejects(transfer.importFile(file("{")), SyntaxError);
  await assert.rejects(transfer.importFile(file('{"kind":"other"}')), /Wrong object/);
  await assert.rejects(transfer.importFile(file("x".repeat(61))), /size limit/);
  assert.equal(applied.length, 1); assert.equal(checked.length, 2);
});

test("a consumer must return its validated object and keep applying failures visible", async () => {
  const file = { size: 2, text: async () => "{}" };
  const options = { exportValue: () => ({}), importValue: () => {} };
  await assert.rejects(createJSONTransfer({ ...options, validate: () => true }).importFile(file), /validated object/);
  await assert.rejects(createJSONTransfer({ ...options, validate: (value) => value, importValue: () => { throw Error("stale selection"); } }).importFile(file), /stale selection/);
});

test("cascade traversal visits every stable id once, including cycles and duplicate edges", () => {
  const links = new Map([["a", ["b", "b", "c"]], ["b", ["a", "c"]], ["c", ["b", "a"]]]);
  assert.deepEqual(collectLinkedWindowIds(links, "a").sort(), ["a", "b", "c"]);
  assert.deepEqual(collectLinkedWindowIds(links, "isolated"), ["isolated"]);
});

test("snap resolution identifies the chosen neighbor but never invents a screen window id", () => {
  const viewport = { width: 1000, height: 800 };
  assert.deepEqual(resolveWindowSnap({ left: 206, top: 200, width: 200, height: 100 }, viewport,
    [{ id: "neighbor", left: 400, top: 200, width: 200, height: 100 }], { screen: false }), { position: { left: 200, top: 200 }, targetId: "neighbor" });
  assert.equal(resolveWindowSnap({ left: 5, top: 100, width: 200, height: 100 }, viewport).targetId, null);
});

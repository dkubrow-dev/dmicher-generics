import test from "node:test";
import assert from "node:assert/strict";
import { api, requireApiVersion } from "../dmicher-generics/scripts/api.js";
import { createModuleRegistry } from "../dmicher-generics/scripts/registry.js";

test("API version rejects incompatible consumers and exposes frozen namespaces", () => {
  assert.equal(requireApiVersion(1), api);
  assert.throws(() => requireApiVersion(2), /API 2 required/);
  assert.ok(Object.isFrozen(api.windows));
  assert.ok(Object.isFrozen(api.chat));
  for (const name of ["createManagedIdentity", "createMessageService", "bindActions", "renderChatPortrait"]) {
    assert.equal(typeof api.chat[name], "function");
  }
  assert.equal(api.utilities.escapeHTML('<a title="x">&\''), "&lt;a title=&quot;x&quot;&gt;&amp;&#39;");
});

test("registry discovers exact versions and keeps duplicate registration intact", () => {
  const events = [];
  const registry = createModuleRegistry({ onChange: (...args) => events.push(args) });
  const consumer = { open: () => "opened" };
  const unregister = registry.register("dmicher-test", { apiVersion: 1, api: consumer, capabilities: ["open", "open"] });
  assert.equal(registry.get("dmicher-test").open(), "opened");
  assert.equal(registry.get("dmicher-test", { apiVersion: 2 }), null);
  assert.equal(registry.get("dmicher-missing"), null);
  assert.throws(() => registry.register("dmicher-test", { apiVersion: 1, api: {} }), /already registered/);
  const descriptors = registry.list();
  descriptors[0].capabilities.push("invalid");
  assert.deepEqual(registry.list(), [{ moduleId: "dmicher-test", apiVersion: 1, capabilities: ["open"] }]);
  assert.equal(unregister(), true);
  assert.equal(unregister(), false);
  assert.equal(registry.get("dmicher-test"), null);
  assert.deepEqual(events.map(([event]) => event), ["registered", "unregistered"]);
});

test("registry validates provider IDs and executable capability declarations", () => {
  const registry = createModuleRegistry();
  assert.throws(() => registry.register("foreign-module", { apiVersion: 1, api: {} }), /module ID/);
  assert.throws(() => registry.register("dmicher-test", { apiVersion: 0, api: {} }), /positive API/);
  assert.throws(() => registry.register("dmicher-test", { apiVersion: 1, api: {}, capabilities: ["missing"] }), /capability/);
});

test("serial queue preserves order after a rejection without hiding it from its caller", async () => {
  const enqueue = api.utilities.createSerialTaskQueue();
  const events = [];
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const first = enqueue(async () => { events.push(1); await gate; events.push(2); });
  const second = enqueue(() => { events.push(3); throw Error("expected"); });
  const failed = assert.rejects(second, /expected/);
  const third = enqueue(() => { events.push(4); return "done"; });
  await Promise.resolve();
  assert.deepEqual(events, [1]);
  release();
  await first;
  await failed;
  assert.equal(await third, "done");
  assert.deepEqual(events, [1, 2, 3, 4]);
});

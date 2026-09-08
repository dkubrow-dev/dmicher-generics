import assert from "node:assert/strict";
import test from "node:test";
import { api, MODULE_ID } from "../dmicher-generics/scripts/api.js";

test("entrypoint publishes the pre-init API and consumer registry without Premium", async () => {
  const originalHooks = globalThis.Hooks;
  const originalGame = globalThis.game;
  const originalFoundry = globalThis.foundry;
  const callbacks = new Map();
  const events = [];
  const moduleRecord = { id: MODULE_ID };
  let unregister;
  try {
    globalThis.Hooks = {
      once(name, callback) { callbacks.set(name, callback); },
      on(name, callback) { return callback; },
      off() {},
      callAll(name, ...args) { events.push({ name, args }); }
    };
    const settings = new Map(), menus = new Map();
    globalThis.game = { modules: new Map([[MODULE_ID, moduleRecord]]), settings: {
      register(id, key, config) { settings.set(key, config.default); },
      registerMenu(id, key, config) { menus.set(key, config); },
      get(id, key) { return settings.get(key); },
      async set(id, key, value) { settings.set(key, value); }
    } };
    globalThis.foundry = { applications: { api: { ApplicationV2: class {}, HandlebarsApplicationMixin: base => base } } };
    const consumer = { open: () => "ready" };
    unregister = api.modules.register("dmicher-bootstrap-consumer", {
      apiVersion: 1, api: consumer, capabilities: ["open"]
    });
    await import("../dmicher-generics/scripts/dmicher-generics.js");
    assert.equal(moduleRecord.api, undefined);
    assert.deepEqual([...callbacks.keys()], ["init"]);
    callbacks.get("init")();
    assert.equal(moduleRecord.api, api);
    assert.equal(moduleRecord.api.modules.get("dmicher-bootstrap-consumer"), consumer);
    assert.equal(game.modules.has("dmicher-premium"), false);
    assert.equal(settings.get("snapScreen"), true);
    assert.equal(settings.get("snapWindows"), true);
    assert.equal(menus.get("appearanceSettings").restricted, false);
    await callbacks.get("ready")();
    assert.equal(settings.get("appearanceInitialized"), true);
    const ready = events.filter(({ name }) => name === "dmicherGenericsReady");
    assert.equal(ready.length, 1);
    assert.equal(ready[0].args[0], api);
  } finally {
    unregister?.();
    api.appearance.dispose();
    if (originalHooks === undefined) delete globalThis.Hooks;
    else globalThis.Hooks = originalHooks;
    if (originalGame === undefined) delete globalThis.game;
    else globalThis.game = originalGame;
    if (originalFoundry === undefined) delete globalThis.foundry;
    else globalThis.foundry = originalFoundry;
  }
});

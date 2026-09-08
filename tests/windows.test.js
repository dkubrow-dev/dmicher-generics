import test from "node:test";
import assert from "node:assert/strict";
import { api } from "../dmicher-generics/scripts/api.js";

test("singleton window is reused during an asynchronous first render", async () => {
  let finish;
  const rendered = new Promise((resolve) => { finish = resolve; });
  const app = { rendered: false, render: () => rendered };
  assert.equal(api.windows.openSingletonApplication(null, () => app), app);
  assert.equal(api.windows.openSingletonApplication(app, () => assert.fail("duplicate")), app);
  finish();
  await rendered;
  await Promise.resolve();
  app.rendered = true;
  let foreground = false;
  app.bringToFront = () => { foreground = true; };
  api.windows.openSingletonApplication(app, () => assert.fail("duplicate"));
  assert.equal(foreground, true);
});

test("synchronous render failure releases singleton guard", () => {
  const app = { render() { throw Error("render failed"); } };
  assert.throws(() => api.windows.openSingletonApplication(null, () => app), /render failed/);
  const replacement = { render() {} };
  assert.equal(api.windows.openSingletonApplication(app, () => replacement), replacement);
});

test("asynchronous render failure releases guard and reports consumer name", async () => {
  const warn = console.error;
  const reports = [];
  console.error = (...args) => reports.push(args);
  try {
    const app = { render: () => Promise.reject(Error("expected")) };
    api.windows.openSingletonApplication(null, () => app, { moduleId: "dmicher-consumer" });
    await Promise.resolve();
    await Promise.resolve();
    const replacement = { render() {} };
    assert.equal(api.windows.openSingletonApplication(app, () => replacement), replacement);
    assert.match(reports[0][0], /dmicher-consumer/);
  } finally { console.error = warn; }
});

test("lifecycle continuation waits for success and does not run on parent failure", async () => {
  const events = [];
  assert.equal(api.windows.runAfterApplicationLifecycle(undefined, () => events.push("sync")), undefined);
  await api.windows.runAfterApplicationLifecycle(Promise.resolve(), () => events.push("async"));
  await assert.rejects(api.windows.runAfterApplicationLifecycle(Promise.reject(Error("failed")), () => events.push("invalid")));
  assert.deepEqual(events, ["sync", "async"]);
});

function element(windowClass) {
  return { nodeType: 1, querySelector() {}, classList: { contains: (value) => value === windowClass },
    setAttribute(name, value) { this[name] = value; } };
}

test("DOM helper accepts native popout realm elements, wrapped roots, and rejects non-elements", () => {
  const root = element("dmicher-test");
  assert.equal(api.windows.getRenderedElement(root), root);
  assert.equal(api.windows.getRenderedElement({ element: root }), root);
  assert.equal(api.windows.getRenderedElement({ 0: root }), root);
  assert.equal(api.windows.getRenderedElement({ nodeType: 3 }), null);
});

test("theme controllers remain independent, retheme existing windows and install only one hook", () => {
  const previousDocument = globalThis.document;
  const first = element("dmicher-first"), second = element("dmicher-second");
  globalThis.document = { querySelectorAll: (selector) => selector === ".dmicher-first" ? [first] : [second] };
  let current = "light";
  const controller = api.theme.createWindowThemeController({ windowClass: "dmicher-first", getTheme: () => current });
  const subscriptions = [], removed = [];
  const hooks = { on: (...args) => { subscriptions.push(args); return 7; }, off: (...args) => removed.push(args) };
  try {
    assert.deepEqual(controller.classes("tool"), ["dmicher-window", "dmicher-first", "tool"]);
    controller.install(hooks);
    controller.install(hooks);
    assert.equal(subscriptions.length, 1);
    controller.apply();
    assert.equal(first["data-dmicher-theme"], "light");
    assert.equal(second["data-dmicher-theme"], undefined);
    current = "dark";
    subscriptions[0][1]({ element: first });
    assert.equal(first["data-dmicher-theme"], "dark");
    controller.apply("unknown");
    assert.equal(first["data-dmicher-theme"], "dark");
    controller.dispose();
    assert.deepEqual(removed, [["renderApplicationV2", 7]]);
  } finally { globalThis.document = previousDocument; }
});

test("native v14 popout keeps its current consumer theme after a detached change and reattachment without render", () => {
  const previousDocument = globalThis.document, previousFoundry = globalThis.foundry;
  const own = element("dmicher-first"), foreign = element("dmicher-second"), unopened = element("dmicher-first");
  own["data-dmicher-theme"] = "dark";
  foreign["data-dmicher-theme"] = "dark";
  const mainElements = [];
  const primaryDocument = { querySelectorAll: () => mainElements };
  own.ownerDocument = { title: "detached" };
  foreign.ownerDocument = { title: "other detached" };
  globalThis.document = primaryDocument;
  globalThis.foundry = { applications: { instances: new Map([
    ["own", { rendered: true, element: own }],
    ["foreign", { rendered: true, element: foreign }],
    ["unopened", { rendered: false, element: unopened }]
  ]) } };
  const controller = api.theme.createWindowThemeController({ windowClass: "dmicher-first", getTheme: () => "light" });
  try {
    controller.apply();
    assert.equal(own["data-dmicher-theme"], "light");
    assert.equal(foreign["data-dmicher-theme"], "dark");
    assert.equal(unopened["data-dmicher-theme"], undefined);
    // Foundry reattaches the same element through adoptNode; no render hook occurs.
    own.ownerDocument = primaryDocument;
    mainElements.push(own);
    assert.equal(own["data-dmicher-theme"], "light");
    globalThis.foundry.applications.instances.delete("own");
    mainElements.length = 0;
    controller.apply("dark");
    assert.equal(own["data-dmicher-theme"], "light", "closed window is no longer retained or modified");
  } finally {
    globalThis.document = previousDocument;
    globalThis.foundry = previousFoundry;
  }
});

import test from "node:test";
import assert from "node:assert/strict";
import { bindActions, renderActionButton } from "../dmicher-generics/scripts/chat/actions.js";

class Element {
  constructor(selector = "") {
    this.selector = selector;
    this.nodeType = 1;
    this.children = [];
    this.listeners = new Map();
    this.isConnected = true;
    this.attributes = new Map();
  }
  append(child) { this.children.push(child); child.parentElement = this; return child; }
  contains(element) { return element === this || this.children.some((child) => child.contains(element)); }
  querySelector(selector) {
    if (selector === "[") throw new Error("Invalid selector");
    for (const child of this.children) {
      if (child.selector === selector) return child;
      const found = child.querySelector(selector);
      if (found) return found;
    }
    return null;
  }
  closest(selector) { return this.selector === selector ? this : this.parentElement?.closest(selector); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  addEventListener(event, handler) {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event).add(handler);
  }
  removeEventListener(event, handler) { this.listeners.get(event)?.delete(handler); }
  emit(type, target = this) {
    const event = { type, target, currentTarget: this, defaultPrevented: false,
      preventDefault() { this.defaultPrevented = true; } };
    for (const handler of this.listeners.get(type) ?? []) handler(event);
    return event;
  }
}

function fixture(t) {
  const previous = globalThis.game;
  const user = { id: "player", role: 1 };
  const message = { id: "message", visible: true, isContentVisible: true, _stats: { modifiedTime: 10 } };
  globalThis.game = { user, messages: new Map([[message.id, message]]) };
  t.after(() => { globalThis.game = previous; });
  const root = new Element();
  const button = root.append(new Element(".action"));
  return { root, button, message, user, bind: (options = {}) => bindActions({
    moduleId: "dmicher-test", message, root, key: "actions",
    actions: [{ selector: ".action", authorize: () => true, handle() {} }], ...options
  }) };
}

function deferred() {
  let resolve, reject;
  const promise = new Promise((accept, fail) => { resolve = accept; reject = fail; });
  return { promise, resolve, reject };
}
const settle = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };

test("chat buttons escape all text and cannot introduce an inline handler", () => {
  assert.equal(renderActionButton({ id: '\" onclick=\"bad', label: "<img>&'", disabled: true }),
    '<button type="button" data-dmicher-chat-action="&quot; onclick=&quot;bad" disabled>&lt;img&gt;&amp;&#39;</button>');
  assert.throws(() => renderActionButton({ id: " " }), /nonempty/);
});

test("delegated controls use the fresh message and preserve synchronous local actions", (t) => {
  const { root, button, message, user, bind } = fixture(t);
  const inner = button.append(new Element("span"));
  const fresh = { ...message, label: "latest" };
  game.messages.set(message.id, fresh);
  let received;
  const dispose = bind({ actions: [{ selector: ".action", authorize: ({ message }) => message === fresh,
    handle: (context) => { received = context; } }] });
  const event = root.emit("click", inner);
  assert.equal(received.message, fresh);
  assert.equal(received.user, user);
  assert.equal(received.element, button);
  assert.equal(received.control, button);
  assert.equal(received.event.currentTarget, root);
  assert.equal(received.root, root);
  assert.equal(event.defaultPrevented, true);
  assert.equal(dispose(), true);
  assert.equal(dispose(), false);
});

test("visibility, message existence and explicit consumer authorization are all required", (t) => {
  const { root, button, message, bind } = fixture(t);
  let calls = 0, authorized = true;
  bind({ actions: [{ selector: ".action", authorize: () => authorized, handle: () => { calls++; } }] });
  for (const visibility of [false, undefined]) {
    message.visible = visibility;
    root.emit("click", button);
  }
  message.visible = true;
  message.isContentVisible = false;
  root.emit("click", button);
  message.isContentVisible = true;
  authorized = false;
  root.emit("click", button);
  authorized = "truthy-but-not-approved";
  root.emit("click", button);
  authorized = true;
  game.messages.delete(message.id);
  root.emit("click", button);
  game.messages.set(message.id, message);
  root.isConnected = false;
  root.emit("click", button);
  assert.equal(calls, 0);
  root.isConnected = true;
  root.emit("click", button);
  assert.equal(calls, 1);
});

test("binding replacement and stale disposers preserve other consumers and keys", (t) => {
  const { root, button, bind } = fixture(t);
  const calls = [];
  const action = (name) => [{ selector: ".action", authorize: () => true, handle: () => calls.push(name) }];
  const old = bind({ actions: action("old") });
  const otherModule = bind({ moduleId: "dmicher-other", actions: action("other-module") });
  const otherKey = bind({ key: "other", actions: action("other-key") });
  const replacement = bind({ actions: action("new") });
  assert.equal(old(), false);
  root.emit("click", button);
  assert.deepEqual(calls, ["other-module", "other-key", "new"]);
  replacement(); otherModule(); otherKey();
  assert.equal(root.listeners.get("click").size, 0);
});

test("asynchronous handlers suppress repeat clicks only for their own control until completion", async (t) => {
  const { root, button, bind } = fixture(t);
  const second = root.append(new Element(".action"));
  const gate = deferred();
  let calls = 0;
  bind({ actions: [{ selector: ".action", authorize: () => true, handle: () => { calls++; return gate.promise; } }] });
  root.emit("click", button);
  root.emit("click", button);
  root.emit("click", second);
  assert.equal(calls, 2);
  gate.resolve(); await settle();
  root.emit("click", button);
  assert.equal(calls, 3);
});

test("pending authorization cannot invoke an obsolete or newly forbidden action", async (t) => {
  const { root, button, message, user, bind } = fixture(t);
  let calls = 0;
  const scenarios = [
    (dispose) => dispose(),
    () => { message.isContentVisible = false; },
    () => { game.messages.delete(message.id); },
    () => { game.messages.set(message.id, { ...message }); },
    () => { message._stats.modifiedTime++; },
    () => { user.role++; },
    () => { button.disabled = true; },
    () => { root.children = []; }
  ];
  for (const mutate of scenarios) {
    root.children = [button]; button.disabled = false;
    message.isContentVisible = true; game.messages.set(message.id, message);
    const gate = deferred();
    const dispose = bind({ actions: [{ selector: ".action", authorize: () => gate.promise,
      handle: () => { calls++; } }] });
    root.emit("click", button);
    mutate(dispose);
    gate.resolve(true); await settle();
    dispose();
  }
  assert.equal(calls, 0);
});

test("sync and async failures are observed without retaining the local pending lock", async (t) => {
  const { root, button, bind } = fixture(t);
  const failures = [];
  let mode = "sync";
  bind({ onError: (error) => failures.push(error.message), actions: [{ selector: ".action", authorize: () => true,
    handle: () => {
      if (mode === "sync") throw Error("sync failure");
      if (mode === "async") return Promise.reject(Error("async failure"));
      return "ok";
    } }] });
  root.emit("click", button);
  mode = "async"; root.emit("click", button); await settle();
  mode = "ok"; root.emit("click", button);
  assert.deepEqual(failures, ["sync failure", "async failure"]);
});

test("rejected authorization and error reporters never cause unhandled rejection", async (t) => {
  const { root, button, bind } = fixture(t);
  const oldError = console.error;
  const errors = [];
  console.error = (...args) => errors.push(args);
  t.after(() => { console.error = oldError; });
  bind({ onError: () => Promise.reject(Error("report failed")), actions: [{ selector: ".action",
    authorize: () => Promise.reject(Error("authorization failed")), handle: () => assert.fail("must not execute") }] });
  root.emit("click", button); await settle();
  assert.equal(errors.length, 1);
  assert.match(errors[0][0], /error handler failed/);
});

test("custom submit events are delegated to a form and disabled controls stay inactive", (t) => {
  const { root, button, bind } = fixture(t);
  const form = root.append(new Element("form"));
  let received;
  bind({ actions: [{ selector: "form", event: "submit", authorize: () => true,
    handle: ({ control }) => { received = control; } }] });
  root.emit("submit", form);
  assert.equal(received, form);
  bind({ actions: [{ selector: ".action", authorize: () => assert.fail("disabled"), handle() {} }] });
  button.disabled = true; root.emit("click", button);
  button.disabled = false; button.attributes.set("aria-disabled", "true"); root.emit("click", button);
});

test("invalid replacement cannot remove an existing working registration", (t) => {
  const { root, button, bind } = fixture(t);
  let calls = 0;
  bind({ actions: [{ selector: ".action", authorize: () => true, handle: () => calls++ }] });
  assert.throws(() => bind({ actions: [{ selector: "[", authorize: () => true, handle() {} }] }), /selector/);
  assert.throws(() => bind({ actions: [{ selector: ".action", handle() {} }] }), /authorize/);
  root.emit("click", button);
  assert.equal(calls, 1);
});

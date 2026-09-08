import test from "node:test";
import assert from "node:assert/strict";
import { createPremiumBridge } from "../dmicher-generics/scripts/premium.js";

const target = "dmicher-example";
const consumer = (bridge, id = target, version = 1) => bridge.forModule(id, { apiVersion: version, methods: ["resolve"] });
const extension = (moduleId = target, method = (base, value) => base(value) * 2) => ({
  moduleId, apiVersion: 1, methods: { resolve: method }
});
const provider = (overrides = {}) => ({ apiVersion: 1, hasAccess: () => true, extensions: [extension()], ...overrides });

test("a consumer operates without Premium or any other target module", async () => {
  const bridge = createPremiumBridge();
  const client = consumer(bridge);
  assert.equal(client.invoke("resolve", [3], (value) => value + 1), 4);
  assert.deepEqual(client.getStatus(), { apiVersion: 1, available: false, compatible: false, active: false, settingsAvailable: false });
  assert.equal(client.openSettings(), null);
  await client.waitUntilReady();
});

test("registration order is independent and every invocation rechecks access", () => {
  const bridge = createPremiumBridge();
  const early = consumer(bridge);
  let access = false;
  const registration = bridge.registerProvider(provider({ hasAccess: () => access }));
  const late = consumer(bridge);
  const run = (client) => client.invoke("resolve", [3], (value) => value + 1);
  assert.equal(run(early), 4);
  access = true;
  assert.equal(run(early), 8);
  assert.equal(run(late), 8);
  // Expiration is authoritative even when the provider's notification timer is late.
  access = false;
  assert.equal(run(late), 4);
  assert.equal(registration.dispose(), true);
  assert.equal(run(early), 4);
});

test("target contracts, access and failures are isolated", () => {
  const bridge = createPremiumBridge();
  const first = consumer(bridge);
  const second = consumer(bridge, "dmicher-second");
  const missing = consumer(bridge, "dmicher-missing");
  let allowed = target;
  let broken = false;
  const registration = bridge.registerProvider(provider({
    hasAccess: (id) => id === allowed,
    extensions: [extension(target, (base, value) => {
      if (broken) throw Error("extension failure");
      return base(value) * 2;
    }), extension("dmicher-second", (base, value) => base(value) + 5)]
  }));
  assert.equal(first.invoke("resolve", [2], (n) => n), 4);
  assert.equal(second.invoke("resolve", [2], (n) => n), 2);
  assert.equal(missing.getStatus().compatible, false);
  assert.equal(consumer(bridge, target, 2).getStatus().active, false);
  assert.equal(bridge.forModule(target, { methods: ["resolve", "missing"] }).getStatus().compatible, false);
  broken = true;
  assert.equal(first.invoke("resolve", [2], (n) => n), 2);
  allowed = "dmicher-second";
  assert.equal(second.invoke("resolve", [2], (n) => n), 7);
  allowed = target;
  broken = false;
  assert.equal(first.getStatus().active, false);
  registration.notifyChanged();
  assert.equal(first.invoke("resolve", [2], (n) => n), 4);
});

test("invalid providers cannot replace a working registration or mutate its contract", () => {
  const bridge = createPremiumBridge();
  assert.throws(() => bridge.registerProvider(provider({ apiVersion: 2 })), /API 1/);
  assert.throws(() => bridge.registerProvider(provider({ extensions: [extension("foreign")] })), /descriptor/);
  assert.throws(() => bridge.registerProvider(provider({ extensions: [extension(), extension()] })), /Duplicate/);
  assert.throws(() => bridge.registerProvider(provider({ extensions: [{ moduleId: target, apiVersion: 1, methods: { resolve: 1 } }] })), /functions/);
  const descriptor = provider();
  const old = bridge.registerProvider(descriptor);
  descriptor.extensions[0].methods.resolve = () => 99;
  assert.equal(consumer(bridge).invoke("resolve", [2], (n) => n), 4);
  assert.throws(() => bridge.registerProvider(provider()), /already registered/);
  assert.equal(old.dispose(), true);
  const current = bridge.registerProvider(provider());
  assert.equal(old.dispose(), false);
  assert.equal(old.notifyChanged(), false);
  assert.equal(consumer(bridge).getStatus().active, true);
  current.dispose();
});

test("listeners observe grant, revoke and detach; disposed listeners do not return", () => {
  const bridge = createPremiumBridge();
  const client = consumer(bridge);
  const events = [];
  const stopBroken = client.subscribe(() => { throw Error("listener"); });
  const stop = client.subscribe((status) => events.push(status.active));
  let access = true;
  const registration = bridge.registerProvider(provider({ hasAccess: () => access }));
  access = false;
  registration.notifyChanged();
  access = true;
  registration.notifyChanged();
  registration.dispose();
  assert.deepEqual(events, [true, false, true, false]);
  assert.equal(stop(), true);
  assert.equal(stop(), false);
  stopBroken();
  bridge.registerProvider(provider());
  assert.deepEqual(events, [true, false, true, false]);
});

test("async and invalid overrides are contained, while base errors are not hidden", async () => {
  for (const method of [() => { throw Error("failure"); }, () => Promise.reject(Error("async")), () => null]) {
    const bridge = createPremiumBridge();
    const client = consumer(bridge);
    bridge.registerProvider(provider({ extensions: [extension(target, method)] }));
    assert.equal(client.invoke("resolve", [2], (n) => n, Number.isFinite), 2);
    assert.equal(client.getStatus().active, false);
  }
  const bridge = createPremiumBridge();
  let calls = 0;
  bridge.registerProvider(provider({ extensions: [extension(target, () => { calls++; return 1; })] }));
  assert.throws(() => consumer(bridge).invoke("resolve", [], () => { throw Error("base failure"); }), /base failure/);
  assert.equal(calls, 0);
  assert.throws(() => consumer(bridge).invoke("resolve", [], () => null, Number.isFinite), /base method/);
  await new Promise((resolve) => setImmediate(resolve));
});

test("non-boolean and asynchronous access checks grant nothing", async () => {
  for (const hasAccess of [() => 1, () => Promise.reject(Error("access")), () => { throw Error("access"); }]) {
    const bridge = createPremiumBridge();
    bridge.registerProvider(provider({ hasAccess }));
    assert.equal(consumer(bridge).invoke("resolve", [2], (n) => n), 2);
  }
  await new Promise((resolve) => setImmediate(resolve));
});

test("startup actions of one target share a deadline without shortening another target's wait", async () => {
  const scheduled = [];
  const cleared = [];
  const bridge = createPremiumBridge({
    setTimer(callback, delay) { scheduled.push({ callback, delay }); return scheduled.length; },
    clearTimer: (id) => cleared.push(id)
  });
  let ready;
  const registration = bridge.registerProvider(provider({ readyPromise: new Promise((resolve) => { ready = resolve; }) }));
  const first = consumer(bridge).waitUntilReady(25);
  const sameTarget = consumer(bridge).waitUntilReady(1000);
  assert.equal(first, sameTarget);
  assert.equal(scheduled.length, 1);
  assert.equal(scheduled[0].delay, 25);
  scheduled[0].callback();
  await first;
  const second = consumer(bridge, "dmicher-second").waitUntilReady(1000);
  assert.notEqual(first, second);
  assert.equal(scheduled.length, 2);
  assert.equal(scheduled[1].delay, 1000);
  let secondFinished = false;
  second.then(() => { secondFinished = true; });
  await Promise.resolve();
  assert.equal(secondFinished, false);
  registration.dispose();
  await second;
  assert.deepEqual(cleared, [1, 2]);
  ready();

  const next = bridge.registerProvider(provider({ readyPromise: new Promise(() => {}) }));
  const timeout = consumer(bridge).waitUntilReady(10);
  scheduled[2].callback();
  await timeout;
  assert.deepEqual(cleared, [1, 2, 3]);
  next.dispose();
});

test("rejected readiness settles and settings command errors never invoke an alternative", async () => {
  const bridge = createPremiumBridge();
  let calls = 0;
  bridge.registerProvider(provider({
    readyPromise: Promise.reject(Error("startup")),
    openSettings() { calls++; throw Error("gm_only"); }
  }));
  const client = consumer(bridge);
  await client.waitUntilReady(100);
  assert.equal(client.getStatus().settingsAvailable, true);
  assert.throws(() => client.openSettings(), /gm_only/);
  assert.equal(calls, 1);
});

import test from "node:test";
import assert from "node:assert/strict";
import { createManagedIdentity, isManagedIdentityUser, isManagedIdentityActor }
  from "../dmicher-generics/scripts/chat/identity.js";

function world() {
  const gm = { id: "gm-a", role: 4, active: true, name: "Master" };
  const assistant = { id: "assistant", role: 3, active: true, name: "Assistant" };
  const player = { id: "player", role: 1, active: true, name: "Player" };
  const created = { User: [], Actor: [], Folder: [] };
  const listeners = new Set();
  const pageListeners = new Set();
  const sent = [];
  let sequence = 0;
  globalThis.CONST = { USER_PERMISSIONS: { ACTOR_CREATE: {}, MESSAGE_WHISPER: {}, FILES_BROWSE: {} } };
  globalThis.foundry = { utils: { randomID: () => `request-${++sequence}` } };
  globalThis.window = {
    addEventListener(event, handler) { if (event === "pagehide") pageListeners.add(handler); },
    removeEventListener(event, handler) { if (event === "pagehide") pageListeners.delete(handler); }
  };
  globalThis.game = {
    user: gm, users: new Map([gm, assistant, player].map((user) => [user.id, user])),
    actors: new Map(), folders: new Map(), documentTypes: { Actor: ["character", "npc"] },
    socket: {
      on(_channel, handler) { listeners.add(handler); },
      off(_channel, handler) { listeners.delete(handler); },
      emit(channel, payload) { sent.push({ channel, payload }); }
    }
  };
  const createClass = (name, collection) => class {
    static async create(data) {
      await Promise.resolve();
      if (name === "User" && Array.from(collection.values()).some((user) => user.name === data.name)) throw Error("User name already occupied");
      const id = data._id ?? `${name}-${++sequence}`;
      if (collection.has(id)) throw Error("ID already occupied");
      const document = { ...structuredClone(data), id,
        getFlag(namespace, key) { return this.flags?.[namespace]?.[key]; },
        async update(changes) {
          for (const [key, value] of Object.entries(changes)) {
            const path = key.split(".");
            let current = this;
            while (path.length > 1) current = current[path.shift()] ??= {};
            current[path[0]] = structuredClone(value);
          }
          return this;
        },
        async delete() { collection.delete(id); }
      };
      collection.set(id, document);
      created[name].push(document);
      return document;
    }
  };
  globalThis.CONFIG = Object.fromEntries([["User", game.users], ["Actor", game.actors], ["Folder", game.folders]]
    .map(([name, collection]) => [name, { documentClass: createClass(name, collection) }]));
  const dispatch = (payload) => { for (const listener of listeners) listener(payload); };
  return { gm, assistant, player, created, listeners, pageListeners, sent, dispatch };
}

function identity(options = {}) {
  let saved = {};
  let enabled = true;
  const service = createManagedIdentity({
    ownerId: "dmicher-test", key: "informer", readState: () => structuredClone(saved),
    writeState: async (state) => { saved = structuredClone(state); }, enabled: () => enabled,
    defaults: () => ({ name: "Informer", folderName: "Test Tools", portrait: "modules/test/portrait.webp", password: "fixture-only" }),
    canRequest: (user) => Number(user?.role) >= 3,
    ...options
  });
  return { service, getState: () => structuredClone(saved), setState: (state) => { saved = structuredClone(state); },
    setEnabled: (value) => { enabled = value; } };
}

test("creates one hidden technical actor and minimum-permission user for concurrent callers", async () => {
  const fixture = world();
  const { service, getState } = identity();
  const results = await Promise.all(Array.from({ length: 8 }, () => service.synchronize()));
  const { actor, user, folder } = results[0];
  assert.deepEqual(Object.values(fixture.created).map((entries) => entries.length), [1, 1, 1]);
  assert.ok(results.every((result) => result.user === user));
  assert.equal(actor.type, "npc");
  assert.equal(actor.img, "modules/test/portrait.webp");
  assert.deepEqual(actor.ownership, { default: 0 });
  assert.equal(user.character, actor.id);
  assert.equal(user.role, 1);
  assert.equal(user.password, "fixture-only");
  assert.deepEqual(user.permissions, { ACTOR_CREATE: false, MESSAGE_WHISPER: true, FILES_BROWSE: false });
  assert.equal(folder.name, "Test Tools");
  assert.equal(isManagedIdentityUser(user), true);
  assert.equal(isManagedIdentityActor(actor), true);
  assert.equal(isManagedIdentityUser(fixture.player), false);
  assert.deepEqual(getState(), { name: "Informer", userId: user.id, actorId: actor.id, folderId: folder.id });
});

test("migrates legacy markers without replacing identifiers, name, password or unrelated flags", async () => {
  const fixture = world();
  const flags = { "dmicher-old": { informerIdentity: true, untouched: 42 } };
  const folder = await CONFIG.Folder.documentClass.create({ _id: "old-folder", type: "Actor", flags });
  const actor = await CONFIG.Actor.documentClass.create({ _id: "old-actor", type: "mook", name: "Old Actor", flags });
  const user = await CONFIG.User.documentClass.create({ _id: "old-user", name: "Campaign Herald", password: "changed-by-gm", role: 2, flags });
  const { service, setState, getState } = identity({ legacyFlag: { namespace: "dmicher-old", key: "informerIdentity" } });
  setState({ userId: user.id, actorId: actor.id, folderId: folder.id, extra: "preserved" });
  assert.equal(service.isUser(user), true);
  const migrated = await service.synchronize();
  assert.equal(migrated.user, user);
  assert.equal(migrated.actor, actor);
  assert.equal(user.name, "Campaign Herald");
  assert.equal(actor.name, "Campaign Herald");
  assert.equal(user.password, "changed-by-gm");
  assert.equal(user.role, 1);
  assert.equal(actor.type, "mook");
  assert.equal(user.flags["dmicher-old"].untouched, 42);
  for (const document of [user, actor, folder]) {
    assert.deepEqual(document.flags["dmicher-generics"].managedIdentity,
      { version: 1, ownerId: "dmicher-test", key: "informer" });
  }
  assert.equal(getState().extra, "preserved");
  assert.deepEqual(Object.values(fixture.created).map((entries) => entries.length), [1, 1, 1]);
});

test("foreign documents at saved IDs or the default name are never adopted, changed or deleted", async () => {
  world();
  const user = await CONFIG.User.documentClass.create({ _id: "occupied-user", name: "Informer", role: 4, active: false });
  const actor = await CONFIG.Actor.documentClass.create({ _id: "occupied-actor", name: "Villain", ownership: { default: 2 } });
  const folder = await CONFIG.Folder.documentClass.create({ _id: "occupied-folder", name: "Campaign", type: "Actor" });
  const snapshots = [user, actor, folder].map((document) => JSON.stringify(document));
  const { service, setState, setEnabled } = identity();
  setState({ userId: user.id, actorId: actor.id, folderId: folder.id });
  assert.equal(service.isUser(user), false);
  const result = await service.synchronize();
  assert.notEqual(result.user.id, user.id);
  assert.notEqual(result.actor.id, actor.id);
  assert.notEqual(result.folder.id, folder.id);
  assert.equal(result.user.name, "Informer (2)");
  setEnabled(false);
  await service.synchronize();
  assert.equal(game.users.get(user.id), user);
  assert.deepEqual([user, actor, folder].map((document) => JSON.stringify(document)), snapshots);
});

test("a current foreign owner overrides a matching legacy marker", async () => {
  world();
  const other = await CONFIG.User.documentClass.create({ _id: "other-bot", name: "Other", role: 1,
    flags: { "dmicher-test": { legacy: true }, "dmicher-generics": {
      managedIdentity: { version: 1, ownerId: "dmicher-other", key: "informer" } } } });
  const { service, setState } = identity({ legacyFlag: { namespace: "dmicher-test", key: "legacy" } });
  setState({ userId: other.id });
  assert.equal(service.isUser(other), false);
  assert.equal(isManagedIdentityUser(other), true);
  assert.notEqual((await service.synchronize()).user.id, other.id);
  assert.equal(other.name, "Other");
});

test("disable removes only the owned user; re-enable recovers its renamed identity and documents", async () => {
  const fixture = world();
  const { service, setEnabled, getState } = identity();
  const original = await service.synchronize();
  original.user.name = "Town Crier";
  setEnabled(false);
  assert.equal(await service.synchronize(), null);
  assert.equal(game.users.has(original.user.id), false);
  assert.equal(game.users.get(fixture.player.id), fixture.player);
  assert.equal(game.actors.get(original.actor.id), original.actor);
  assert.equal(game.folders.get(original.folder.id), original.folder);
  assert.equal(getState().name, "Town Crier");
  setEnabled(true);
  const restored = await service.synchronize();
  assert.equal(restored.user.id, original.user.id);
  assert.equal(restored.user.name, "Town Crier");
  assert.equal(restored.actor, original.actor);
  assert.equal(restored.actor.name, "Town Crier");
});

test("deleting a managed actor or user reconstructs only the missing document with the same ID", async () => {
  const fixture = world();
  const { service } = identity();
  const original = await service.synchronize();
  await original.actor.delete();
  const repaired = await service.synchronize();
  assert.equal(repaired.actor.id, original.actor.id);
  assert.equal(repaired.user, original.user);
  assert.equal(repaired.user.character, repaired.actor.id);
  await repaired.user.delete();
  const restored = await service.synchronize();
  assert.equal(restored.user.id, original.user.id);
  assert.equal(restored.actor, repaired.actor);
  assert.deepEqual(Object.values(fixture.created).map((entries) => entries.length), [2, 2, 1]);
});

test("a failed user creation retries with the persisted actor and folder", async () => {
  const fixture = world();
  const { service, getState } = identity();
  const create = CONFIG.User.documentClass.create;
  CONFIG.User.documentClass.create = async () => { throw Error("temporary failure"); };
  await assert.rejects(service.synchronize(), /temporary failure/);
  const partial = getState();
  assert.ok(partial.actorId);
  assert.ok(partial.folderId);
  CONFIG.User.documentClass.create = create;
  const result = await service.synchronize();
  assert.equal(result.actor.id, partial.actorId);
  assert.equal(result.folder.id, partial.folderId);
  assert.deepEqual(Object.values(fixture.created).map((entries) => entries.length), [1, 1, 1]);
});

test("two consumers own independent identities and disposing one does not affect the other", async () => {
  const fixture = world();
  const first = identity();
  const second = identity({ ownerId: "dmicher-other" });
  const [a, b] = await Promise.all([first.service.activate(), second.service.activate()]);
  assert.notEqual(a.user.id, b.user.id);
  assert.notEqual(a.user.name, b.user.name);
  assert.equal(first.service.isUser(b.user), false);
  assert.equal(second.service.isUser(a.user), false);
  assert.equal(fixture.listeners.size, 2);
  assert.equal(first.service.dispose(), true);
  assert.equal(first.service.dispose(), false);
  assert.equal(fixture.listeners.size, 1);
  assert.equal((await second.service.synchronize()).user, b.user);
  first.setEnabled(false);
  await assert.rejects(first.service.synchronize(), /Disposed/);
  assert.equal(game.users.get(a.user.id), a.user);
  second.service.dispose();
});

test("two factories for the same owner and identity serialize creation without duplicate documents", async () => {
  const fixture = world();
  const first = identity();
  const second = identity();
  const [a, b] = await Promise.all([first.service.synchronize(), second.service.synchronize()]);
  assert.equal(a.user, b.user);
  assert.equal(a.actor, b.actor);
  assert.deepEqual(Object.values(fixture.created).map((entries) => entries.length), [1, 1, 1]);
  assert.deepEqual(first.getState(), second.getState());
});

test("pagehide disposes only each identity's listeners and leaves persistent documents intact", async () => {
  const fixture = world();
  const first = identity();
  const second = identity({ key: "second" });
  const a = await first.service.activate();
  await second.service.activate();
  assert.equal(fixture.pageListeners.size, 2);
  first.service.dispose();
  assert.equal(fixture.pageListeners.size, 1);
  for (const listener of fixture.pageListeners) listener();
  assert.equal(fixture.listeners.size, 0);
  assert.equal(fixture.pageListeners.size, 0);
  assert.equal(game.users.get(a.user.id), a.user);
  await assert.rejects(second.service.synchronize(), /Disposed/);
});

test("systems with custom actor types work without granting an assistant GM privileges", async () => {
  const fixture = world();
  game.documentTypes.Actor = ["blackIce", "mook"];
  const { service } = identity();
  assert.equal((await service.synchronize()).actor.type, "mook");
  fixture.gm.active = false;
  game.user = fixture.assistant;
  const second = identity({ key: "second" });
  await assert.rejects(second.service.synchronize(), /RequiresGM/);
  assert.equal(fixture.assistant.role, 3);
  assert.equal(fixture.created.User.length, 1);
});

test("an existing identity remains readable without a connected full GM", async () => {
  const fixture = world();
  const { service } = identity();
  const original = await service.synchronize();
  fixture.gm.active = false;
  game.user = fixture.assistant;
  assert.equal((await service.synchronize()).user, original.user);
  game.user = fixture.player;
  assert.equal(service.get().user, original.user);
  await assert.rejects(service.synchronize(), /RequiresGM/);
});

test("socket ensure reads local defaults and checks requester policy; response re-reads owned documents", async () => {
  const fixture = world();
  const { service } = identity();
  await service.activate();
  await service.activate();
  assert.equal(fixture.listeners.size, 1);
  game.user = fixture.assistant;
  const promise = service.synchronize();
  const request = fixture.sent.at(-1).payload;
  game.user = fixture.gm;
  fixture.dispatch({ ...request, defaults: { name: "Injected" }, requesterId: fixture.player.id });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(fixture.sent.length, 1);
  fixture.dispatch({ ...request, defaults: { name: "Injected" } });
  await new Promise((resolve) => setImmediate(resolve));
  const response = fixture.sent.at(-1).payload;
  assert.equal(response.operation, "ready");
  game.user = fixture.assistant;
  fixture.dispatch(response);
  assert.equal((await promise).user.name, "Informer");
  service.dispose();
});

test("dispose rejects pending remote requests and releases its socket listener and timeout", async () => {
  const fixture = world();
  game.user = fixture.assistant;
  const { service } = identity();
  const promise = service.synchronize();
  const rejected = assert.rejects(promise, /Disposed/);
  assert.equal(fixture.listeners.size, 1);
  const request = fixture.sent.at(-1).payload;
  fixture.dispatch({ ...request, operation: "ready", authorityId: "unrelated" });
  assert.equal(service.dispose(), true);
  await rejected;
  assert.equal(fixture.listeners.size, 0);
  assert.equal(fixture.created.User.length, 0);
});

test("a ready message cannot manufacture a missing identity and a lost reply times out", async () => {
  const fixture = world();
  game.user = fixture.assistant;
  const { service } = identity({ timeoutMs: 5 });
  const promise = service.synchronize();
  const rejected = assert.rejects(promise, /Unavailable/);
  fixture.dispatch({ ...fixture.sent.at(-1).payload, operation: "ready", authorityId: fixture.gm.id });
  await rejected;
  await assert.rejects(service.synchronize(), /Unavailable/);
  service.dispose();
});

test("a user with a matching saved ID but no ownership marker is not technical", () => {
  const fixture = world();
  const { service, setState } = identity();
  setState({ userId: fixture.player.id });
  assert.equal(service.isUser(fixture.player), false);
  assert.equal(service.get().user, undefined);
  assert.equal(isManagedIdentityUser({ id: "bad", flags: { "dmicher-generics": { managedIdentity: { ownerId: "dmicher-test" } } } }), false);
});

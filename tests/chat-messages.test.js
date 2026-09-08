import test from "node:test";
import assert from "node:assert/strict";
import { createMessageService, getChatMetadata, isTechnicalMessage, resolveChatAudience } from "../dmicher-generics/scripts/chat/messages.js";
import { buildChatSpeaker, getMessageAuthorId } from "../dmicher-generics/scripts/chat/documents.js";

const ownerId = "dmicher-test";
class Collection extends Map {
  [Symbol.iterator]() { return this.values(); }
}
function install() {
  const gm = { id: "gm", role: 4 }, assistant = { id: "assistant", role: 3 };
  const player = { id: "player", role: 1 }, second = { id: "second", role: 2 };
  const bot = { id: "informer", role: 1, flags: { "dmicher-generics": {
    managedIdentity: { version: 1, ownerId, key: "informer" }
  } } };
  const users = [gm, assistant, player, second, bot, { id: "disabled", role: 0 }];
  globalThis.game = { user: gm, users: new Collection(users.map((user) => [user.id, user])), messages: new Collection() };
  let nextId = 0, attempts = 0, failAt, failDelete = false;
  globalThis.foundry = { utils: { randomID: () => `key-${++nextId}` } };
  globalThis.CONFIG = { ChatMessage: { documentClass: {
    async create(data) {
      await Promise.resolve();
      if (++attempts === failAt) throw new Error("Synthetic creation failure");
      const message = {
        ...structuredClone(data), id: `message-${++nextId}`,
        getFlag: function(ns, key) { return this.flags?.[ns]?.[key]; },
        canUserModify(user) { return user.role >= 3 || user.id === this.author; },
        async update(changes) {
          if (changes.content !== undefined) this.content = changes.content;
          if (changes[`flags.${ownerId}`]) this.flags[ownerId] = structuredClone(changes[`flags.${ownerId}`]);
          return this;
        },
        async delete() {
          if (failDelete) throw new Error("Synthetic deletion failure");
          game.messages.delete(this.id);
          return this;
        }
      };
      game.messages.set(message.id, message);
      return message;
    }
  } } };
  return { gm, assistant, player, second, bot, attempts: () => attempts,
    failAt: (number) => { failAt = number; }, failDelete: (value) => { failDelete = value; } };
}
const service = (options = {}) => createMessageService({ ownerId, channel: "events", ...options });
const players = { type: "players" };

test("audiences are explicit, exclude managed users, distinguish GMs/players and never widen an empty private list", async () => {
  install();
  assert.throws(() => resolveChatAudience(), /explicit/);
  assert.throws(() => resolveChatAudience({ type: "guess" }), /Unknown/);
  assert.deepEqual(resolveChatAudience({ type: "gms" }).recipients, ["gm", "assistant"]);
  assert.deepEqual(resolveChatAudience(players).recipients, ["player", "second"]);
  assert.deepEqual(resolveChatAudience({ type: "users", userIds: ["player", "missing", "player", "informer"] }).recipients, ["player"]);
  assert.deepEqual(resolveChatAudience({ type: "public" }), { public: true, recipients: [] });
  const chat = service();
  assert.deepEqual(await chat.create({ content: "private", whisper: [] }, { audience: { type: "users", userIds: [] } }), []);
  assert.deepEqual(await chat.create({ content: "private" }, { audience: { type: "users", userIds: ["missing"] } }), []);
  assert.equal(game.messages.size, 0);
  await assert.rejects(chat.create({}, { audience: { type: "public" }, delivery: "per-recipient" }), /Public/);
});

test("a real NPC can speak publicly without creating technical documents or becoming a technical event", async () => {
  install();
  const speaker = buildChatSpeaker({ alias: "Innkeeper", actor: { id: "npc" }, token: { id: "token" }, scene: "scene" });
  const [message] = await service().create({ content: "Welcome!", speaker, user: "old-author", flags: { external: { keep: true } } }, {
    audience: { type: "public" }, key: "dialogue-1", kind: "dialogue"
  });
  assert.equal(message.author, "gm");
  assert.equal(Object.hasOwn(message, "user"), false);
  assert.deepEqual(message.speaker, { actor: "npc", token: "token", scene: "scene", alias: "Innkeeper" });
  assert.deepEqual(message.whisper, []);
  assert.equal(message.flags.external.keep, true);
  assert.equal(isTechnicalMessage(message), false);
  assert.equal(game.users.size, 6);
  assert.equal(getMessageAuthorId({ author: { id: "author" }, user: "legacy" }), "author");
});

test("explicit routing overrides content whisper and metadata, while private copies have no other recipients", async () => {
  const { bot } = install();
  const chat = service();
  const messages = await chat.create(({ recipientId }) => ({ author: bot, content: `For ${recipientId}`, whisper: [],
    flags: { "dmicher-generics": { chat: { ownerId: "dmicher-foreign", key: "forged" } } } }), {
    audience: players, delivery: "per-recipient", key: "event", technical: true
  });
  assert.deepEqual(messages.map((message) => message.whisper), [["player"], ["second"]]);
  assert.equal(messages[0].content, "For player");
  assert.equal(messages[0].author, bot.id);
  for (const message of messages) {
    assert.deepEqual(getChatMetadata(message), {
      apiVersion: 1, ownerId, channel: "events", key: "event", kind: "message", technical: true,
      recipientId: message.whisper[0]
    });
    assert.equal(isTechnicalMessage(message), true);
  }
});

test("one service serializes concurrent retries and keeps logical keys isolated by module and channel", async () => {
  const fixture = install();
  const chat = service(), options = { audience: players, delivery: "per-recipient", key: "same" };
  const results = await Promise.all([chat.create({ content: "once" }, options), chat.create({ content: "retry" }, options)]);
  assert.equal(fixture.attempts(), 2);
  assert.deepEqual(results[0], results[1]);
  await service({ ownerId: "dmicher-other" }).create({ content: "other" }, options);
  await service({ channel: "dialogues" }).create({ content: "other channel" }, options);
  assert.equal(chat.find({ key: "same" }).length, 2);
  assert.equal(game.messages.size, 6);
  // Loaded metadata remains the retry source after a service is recreated (e.g. reconnect).
  const restored = await service().create({ content: "reconnect" }, options);
  assert.deepEqual(restored.map((message) => message.id), results[0].map((message) => message.id));
  assert.equal(fixture.attempts(), 6);
});

test("retry keys reject a changed message kind, technical role, delivery mode or shared audience", async () => {
  install();
  const chat = service();
  const options = { audience: players, key: "immutable", kind: "dialogue" };
  await chat.create({ content: "original" }, options);
  for (const changed of [{ kind: "event" }, { technical: true }, { delivery: "per-recipient" }, { audience: { type: "public" } }]) {
    await assert.rejects(chat.create({ content: "wrong retry" }, { ...options, ...changed }), /already belongs/);
  }
  assert.equal(game.messages.size, 1);
});

test("per-recipient retry can fill missing recipients without re-sending existing copies", async () => {
  const fixture = install();
  const chat = service(), options = { key: "growing", delivery: "per-recipient" };
  const [first] = await chat.create({ content: "original" }, { ...options, audience: { type: "users", userIds: ["player"] } });
  const all = await chat.create({ content: "additional" }, { ...options, audience: players });
  assert.equal(all[0], first);
  assert.equal(all[1].content, "additional");
  assert.equal(fixture.attempts(), 2);
});

test("legacy metadata adapter reuses historical copies without rewriting their flags", async () => {
  const fixture = install();
  const [legacy] = await service().create({ content: "old" }, { audience: { type: "users", userIds: ["player"] } });
  delete legacy.flags["dmicher-generics"].chat;
  legacy.flags[ownerId] = { oldTechnical: { key: "legacy", recipientId: "player" } };
  const chat = service({ readLegacyMetadata: (message) => message.getFlag(ownerId, "oldTechnical") });
  const [result] = await chat.create({}, { audience: { type: "users", userIds: ["player"] }, delivery: "per-recipient", key: "legacy" });
  assert.equal(result, legacy);
  assert.equal(fixture.attempts(), 1);
  assert.equal(getChatMetadata(result), null);
});

test("incompatible or foreign explicit tracking metadata always overrides legacy ownership", async () => {
  install();
  const [message] = await service().create({}, { audience: players, key: "legacy" });
  message.flags[ownerId] = { legacy: { key: "legacy" } };
  const chat = service({ readLegacyMetadata: (entry) => entry.getFlag(ownerId, "legacy") });
  for (const descriptor of [{ apiVersion: 2, ownerId, channel: "events" },
    { apiVersion: 1, ownerId: "dmicher-other", channel: "events" }, false]) {
    message.flags["dmicher-generics"].chat = descriptor;
    assert.equal(chat.get(message.id), null);
    assert.deepEqual(chat.find({ key: "legacy" }), []);
    await assert.rejects(chat.remove(message.id), /another service/);
  }
});

test("partial failure rolls back new copies, preserves reused history and leaves the queue usable", async () => {
  const fixture = install();
  const chat = service(), options = { key: "retry", delivery: "per-recipient" };
  const [existing] = await chat.create({}, { ...options, audience: { type: "users", userIds: ["gm"] } });
  fixture.failAt(3);
  await assert.rejects(chat.create({}, { ...options, audience: { type: "users", userIds: ["gm", "player", "second"] } }), /creation failure/);
  assert.deepEqual([...game.messages.values()], [existing]);
  const retry = await chat.create({}, { ...options, audience: players });
  assert.equal(retry.length, 2);
});

test("failed compensation reports surviving document IDs and the original error", async () => {
  const fixture = install();
  fixture.failAt(2);
  fixture.failDelete(true);
  const errors = [];
  await assert.rejects(service({ onRollbackError: (error) => errors.push(error) }).create({}, {
    audience: players, delivery: "per-recipient"
  }), (error) => {
    assert.match(error.cause.message, /creation failure/);
    assert.deepEqual(error.rollbackFailures.map((failure) => failure.documentId), [...game.messages.keys()]);
    return true;
  });
  assert.equal(errors.length, 1);
});

test("audience disappearing during preparation fails closed, and a player cannot impersonate an informer", async () => {
  const fixture = install();
  const chat = service();
  await assert.rejects(chat.create(async () => { game.users.delete("player"); return { content: "secret" }; }, {
    audience: { type: "users", userIds: ["player"] }
  }), /recipient no longer exists/);
  game.user = fixture.second;
  await assert.rejects(chat.create({ author: fixture.bot.id }, { audience: { type: "gms" } }), /author permission denied/);
  assert.equal(game.messages.size, 0);
});

test("a GM-only recipient losing their role during async preparation receives no content", async () => {
  const fixture = install();
  const chat = service();
  let release, started;
  const waiting = new Promise((resolve) => { release = resolve; });
  const preparing = new Promise((resolve) => { started = resolve; });
  const delivery = chat.create(async () => { started(); await waiting; return { content: "GM secret" }; }, {
    audience: { type: "gms" }
  });
  await preparing;
  fixture.assistant.role = 1;
  release();
  await assert.rejects(delivery, /audience changed/);
  assert.equal(game.messages.size, 0);
});

test("tracking management checks current ownership and Foundry rights; update cannot reroute or retag documents", async () => {
  const fixture = install();
  const chat = service();
  const [message] = await chat.create({ content: "old" }, { audience: players, key: "tracked", kind: "event" });
  assert.equal(chat.get(message.id), message);
  assert.deepEqual(chat.find({ documentIds: [message.id], kind: "event" }), [message]);
  assert.equal(service({ channel: "foreign" }).get(message.id), null);
  await assert.rejects(service({ ownerId: "dmicher-other" }).remove(message.id), /another service/);
  game.user = fixture.player;
  await assert.rejects(chat.update(message.id, { content: "not owned" }), /permission denied/);
  await assert.rejects(chat.remove(message.id), /permission denied/);
  game.user = fixture.gm;
  await chat.update(message.id, { content: "<button>Updated</button>", moduleFlags: { phase: "answered" } });
  assert.equal(message.content, "<button>Updated</button>");
  assert.equal(message.flags[ownerId].phase, "answered");
  for (const changes of [{ whisper: [] }, { flags: {} }, { author: "player" }, { key: "new" }]) {
    await assert.rejects(chat.update(message.id, changes), /routing and tracking are immutable/);
  }
  assert.equal(getChatMetadata(message).key, "tracked");
  await chat.remove(message.id);
  assert.equal(chat.get(message.id), null);
  await assert.rejects(chat.update(message.id, { content: "gone" }), /missing/);
});

test("bulk removal reports individual failures without declaring partial deletion successful", async () => {
  install();
  const chat = service();
  const messages = await chat.create({}, { audience: players, delivery: "per-recipient", key: "remove-group" });
  messages[1].delete = async () => { throw new Error("cannot delete"); };
  const result = await chat.removeAll({ key: "remove-group" });
  assert.deepEqual(result.removed, [messages[0].id]);
  assert.deepEqual(result.failed.map((entry) => entry.documentId), [messages[1].id]);
  assert.equal(chat.find().length, 1);
});

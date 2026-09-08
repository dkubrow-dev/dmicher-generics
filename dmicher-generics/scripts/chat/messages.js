import { createSerialTaskQueue } from "../utilities.js";
import { buildChatSpeaker, getChatMessageClass } from "./documents.js";
import { isManagedIdentityUser } from "./identity.js";

const NAMESPACE = "dmicher-generics";
const FLAG = "chat";
const values = (collection) => Array.from(collection?.values?.() ?? collection ?? []);

export function getChatMetadata(message) {
  const value = message?.getFlag?.(NAMESPACE, FLAG) ?? message?.flags?.[NAMESPACE]?.[FLAG];
  return value?.apiVersion === 1 ? value : null;
}

export function isTechnicalMessage(message) {
  return getChatMetadata(message)?.technical === true;
}

/** Empty or missing private recipients NEVER become a public message. */
export function resolveChatAudience(audience, { excludeUser = isManagedIdentityUser } = {}) {
  if (!audience || typeof audience !== "object") throw new TypeError("An explicit chat audience is required");
  if (audience.type === "public") return { public: true, recipients: [] };
  let users = values(game.users);
  switch (audience.type) {
    case "users": {
      if (!Array.isArray(audience.userIds)) throw new TypeError("audience.userIds must be an array");
      users = [...new Set(audience.userIds)].map((id) => game.users.get(id)).filter(Boolean);
      break;
    }
    case "gms": users = users.filter((user) => Number(user.role) >= 3); break;
    case "players": users = users.filter((user) => [1, 2].includes(Number(user.role))); break;
    case "all": break;
    default: throw new TypeError("Unknown chat audience type");
  }
  return { public: false, recipients: users.filter((user) => !excludeUser(user)).map((user) => user.id) };
}

function validKey(value, label) {
  if (typeof value !== "string" || !value.length || value.length > 256) throw new TypeError(`Invalid chat ${label}`);
  return value;
}

function assertRouting(message, whisper) {
  const ids = (list) => values(list).map((entry) => entry?.id ?? entry).sort();
  if (JSON.stringify(ids(message.whisper)) !== JSON.stringify(ids(whisper))) {
    throw new Error("Chat delivery key already belongs to a different audience");
  }
}

/** One long-lived service per module/channel. Ordering and deduplication are client-local.
 * Foundry remains the authority for document creation, updates and deletion.
 * readLegacyMetadata is a consumer-owned compatibility adapter, never a socket command.
 */
export function createMessageService({ ownerId, channel, readLegacyMetadata, onRollbackError } = {}) {
  if (!/^dmicher-[a-z0-9-]+$/.test(ownerId ?? "")) throw new TypeError("Invalid dmicher chat owner ID");
  if (!/^[a-z0-9-]+$/.test(channel ?? "")) throw new TypeError("Invalid chat channel");
  const enqueue = createSerialTaskQueue();

  function metadata(message) {
    const raw = message?.getFlag?.(NAMESPACE, FLAG) ?? message?.flags?.[NAMESPACE]?.[FLAG];
    const current = getChatMetadata(message);
    if (raw !== undefined && raw !== null) {
      return current?.ownerId === ownerId && current.channel === channel ? current : null;
    }
    return readLegacyMetadata?.(message) ?? null;
  }

  function find({ key, kind, recipientId, documentIds } = {}) {
    return values(game.messages).filter((message) => {
      const record = metadata(message);
      return record && (key === undefined || record.key === key)
        && (kind === undefined || record.kind === kind)
        && (recipientId === undefined || record.recipientId === recipientId)
        && (documentIds === undefined || documentIds.includes(message.id));
    });
  }

  function get(id) {
    const message = game.messages?.get(id);
    return message && metadata(message) ? message : null;
  }

  function mutable(id, operation) {
    const message = get(id);
    if (!message) throw new Error("Chat message is missing or belongs to another service");
    if (message.canUserModify?.(game.user, operation) !== true) throw new Error(`Chat ${operation} permission denied`);
    return message;
  }

  async function deliver(data, {
    audience, delivery = "shared", key: suppliedKey, kind = "message", technical = false,
    enabled = () => true, excludeUser = isManagedIdentityUser, errorMessage = () => "Unable to create chat message"
  } = {}) {
    if (!enabled()) return [];
    if (!["shared", "per-recipient"].includes(delivery)) throw new TypeError("Unknown chat delivery mode");
    const key = validKey(suppliedKey ?? foundry.utils.randomID(), "key");
    validKey(kind, "kind");
    const route = resolveChatAudience(audience, { excludeUser });
    if (route.public && delivery !== "shared") throw new TypeError("Public chat requires shared delivery");
    if (!route.public && !route.recipients.length) return [];
    const copies = delivery === "per-recipient" ? route.recipients.map((id) => [id]) : [route.recipients];
    if (suppliedKey !== undefined) {
      for (const previous of find({ key })) {
        const record = metadata(previous);
        const previousDelivery = record.recipientId == null ? "shared" : "per-recipient";
        if (previousDelivery !== delivery || (record.kind !== undefined && record.kind !== kind)
          || (record.technical !== undefined && record.technical !== (technical === true))) {
          throw new Error("Chat delivery key already belongs to a different message kind or delivery mode");
        }
      }
    }
    const messages = [], created = [];
    try {
      for (const whisper of copies) {
        if (!enabled()) break;
        const recipientId = delivery === "per-recipient" ? whisper[0] : null;
        const existing = suppliedKey !== undefined && find({ key, recipientId })[0];
        if (existing) {
          assertRouting(existing, whisper);
          messages.push(existing);
          continue;
        }
        const prepared = typeof data === "function" ? await data({ key, recipientId }) : data;
        if (!enabled()) break;
        if (!prepared || typeof prepared !== "object") throw new TypeError("Chat data must be an object");
        // Source content cannot accidentally override explicit routing or service ownership.
        const { user: _legacy, author = game.user.id, speaker = {}, flags = {}, ...content } = prepared;
        const authorId = author?.id ?? author;
        if (!game.users.get(authorId)) throw new Error("Chat author does not exist");
        if (!(Number(game.user.role) >= 3 || authorId === game.user.id)) throw new Error("Chat author permission denied");
        if (whisper.some((id) => !game.users.get(id))) throw new Error("Chat recipient no longer exists");
        const currentAudience = resolveChatAudience(audience, { excludeUser });
        if (!route.public && whisper.some((id) => !currentAudience.recipients.includes(id))) {
          throw new Error("Chat audience changed during preparation");
        }
        const message = await getChatMessageClass().create({
          ...content, author: authorId, speaker: buildChatSpeaker(speaker), whisper,
          flags: { ...flags, [NAMESPACE]: { ...flags[NAMESPACE], [FLAG]: {
            apiVersion: 1, ownerId, channel, key, kind, technical: technical === true, recipientId
          } } }
        });
        if (!message) throw new Error(errorMessage());
        created.push(message);
        messages.push(message);
      }
      return messages;
    } catch (error) {
      const failures = [];
      for (const message of created) {
        try { await message.delete(); }
        catch (cause) {
          failures.push({ documentId: message.id, cause });
          try { onRollbackError?.(cause, message); } catch { /* Preserve the original delivery error. */ }
        }
      }
      // Best-effort compensation only. Surface surviving copies so callers can diagnose/retry.
      if (failures.length) {
        const failure = new Error("Chat delivery failed and some partial messages could not be removed", { cause: error });
        failure.rollbackFailures = failures;
        throw failure;
      }
      throw error;
    }
  }

  return Object.freeze({
    create: (data, options) => enqueue(() => deliver(data, options)),
    find, get,
    update: (id, changes) => enqueue(async () => {
      if (!changes || Object.keys(changes).some((key) => !["content", "moduleFlags"].includes(key))) {
        throw new TypeError("Only content and moduleFlags may be changed; routing and tracking are immutable");
      }
      const update = {};
      if (Object.hasOwn(changes, "content")) {
        if (typeof changes.content !== "string") throw new TypeError("Chat content must be a string");
        update.content = changes.content;
      }
      if (Object.hasOwn(changes, "moduleFlags")) {
        if (!changes.moduleFlags || typeof changes.moduleFlags !== "object" || Array.isArray(changes.moduleFlags)) {
          throw new TypeError("moduleFlags must be an object");
        }
        if (ownerId === NAMESPACE && Object.hasOwn(changes.moduleFlags, FLAG)) {
          throw new TypeError("Chat tracking metadata is reserved");
        }
        update[`flags.${ownerId}`] = changes.moduleFlags;
      }
      return mutable(id, "update").update(update);
    }),
    remove: (id) => enqueue(() => mutable(id, "delete").delete()),
    removeAll: (query) => enqueue(async () => {
      const result = { removed: [], failed: [] };
      for (const message of find(query)) {
        try { await mutable(message.id, "delete").delete(); result.removed.push(message.id); }
        catch (error) { result.failed.push({ documentId: message.id, error }); }
      }
      return result;
    })
  });
}

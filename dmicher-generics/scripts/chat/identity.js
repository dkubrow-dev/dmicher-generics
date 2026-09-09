import { createSerialTaskQueue } from "../utilities.js";

const namespace = "dmicher-generics";
const flagKey = "managedIdentity";
const topic = "managedIdentity";
const worldQueues = new WeakMap();

function enqueueLifecycle(task) {
  let enqueue = worldQueues.get(game);
  if (!enqueue) {
    enqueue = createSerialTaskQueue();
    worldQueues.set(game, enqueue);
  }
  // Technical User names are world-wide unique, including across identity owners.
  return enqueue(task);
}

function flag(document) {
  return document?.getFlag?.(namespace, flagKey) ?? document?.flags?.[namespace]?.[flagKey];
}

function validOwner(value) {
  return value?.version === 1 && /^dmicher-[a-z0-9-]+$/.test(value.ownerId)
    && typeof value.key === "string" && value.key.length > 0;
}

/** A technical identity is not a participant, even when another dmicher module owns it. */
export function isManagedIdentityUser(user) {
  return Boolean(user?.id && validOwner(flag(user)));
}

export function isManagedIdentityActor(actor) {
  return Boolean(actor?.id && validOwner(flag(actor)));
}

function documentClass(name) {
  return globalThis.CONFIG?.[name]?.documentClass ?? globalThis.getDocumentClass?.(name)
    ?? globalThis.foundry?.documents?.[name] ?? globalThis[name];
}

function values(collection) {
  return Array.from(collection?.values?.() ?? collection ?? []);
}

/**
 * Owns only a hidden technical Actor, its folder and minimally privileged User.
 * Names, artwork, enablement and persistence belong to the caller. Real NPCs must
 * be passed as message speakers; they must never be provisioned through this API.
 * Socket requests ask the elected full GM to re-read its own configuration.
 */
export function createManagedIdentity({
  ownerId, key, readState, writeState, enabled = () => true, defaults,
  legacyFlag, canRequest = (user) => Number(user?.role) === 4,
  errorMessage = (code) => `Managed identity: ${code}`,
  channel = `module.${namespace}`, timeoutMs = 10000
}) {
  if (!/^dmicher-[a-z0-9-]+$/.test(ownerId) || !/^[a-zA-Z0-9_.:-]+$/.test(key ?? "")) {
    throw new TypeError("A dmicher owner ID and an identity key are required.");
  }
  if ([readState, writeState, enabled, defaults, canRequest, errorMessage].some((value) => typeof value !== "function")) {
    throw new TypeError("Identity configuration and persistence must use callbacks.");
  }
  if (legacyFlag && (typeof legacyFlag.namespace !== "string" || typeof legacyFlag.key !== "string")) {
    throw new TypeError("A legacy flag requires a namespace and key.");
  }
  if (typeof channel !== "string" || !channel.startsWith("module.") || !Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new TypeError("A module socket channel and positive timeout are required.");
  }
  const descriptor = { version: 1, ownerId, key };
  const pending = new Map();
  let socket;
  let lifecycleTarget;
  let disposed = false;
  const error = (code) => new Error(errorMessage(code));
  const assertLive = () => { if (disposed) throw error("Disposed"); };
  const state = () => {
    const value = readState();
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  };
  const owns = (document) => {
    if (!document?.id) return false;
    const current = flag(document);
    // An explicit current owner takes precedence over an old migration marker.
    if (current !== undefined && current !== null) {
      return validOwner(current) && current.ownerId === ownerId && current.key === key;
    }
    return Boolean(legacyFlag && (document.getFlag?.(legacyFlag.namespace, legacyFlag.key)
      ?? document.flags?.[legacyFlag.namespace]?.[legacyFlag.key]) === true);
  };
  const find = (collection, id) => {
    const saved = collection?.get?.(id);
    return owns(saved) ? saved : values(collection).find(owns);
  };
  const get = () => {
    const saved = state();
    return { user: find(game.users, saved.userId), actor: find(game.actors, saved.actorId),
      folder: find(game.folders, saved.folderId) };
  };
  const authority = () => values(game.users)
    .filter((user) => user.active && Number(user.role) === 4 && !isManagedIdentityUser(user) && !owns(user))
    .sort((a, b) => a.id.localeCompare(b.id))[0];
  const flags = () => ({
    ...(legacyFlag ? { [legacyFlag.namespace]: { [legacyFlag.key]: true } } : {}),
    [namespace]: { [flagKey]: { ...descriptor } }
  });
  const adopt = async (document) => {
    if (!document || flag(document)?.ownerId === ownerId && flag(document)?.key === key && flag(document)?.version === 1) return;
    assertLive();
    await document.update({ [`flags.${namespace}.${flagKey}`]: { ...descriptor } });
  };
  const availableId = (collection, id) => id && !collection?.get?.(id) ? { _id: id } : {};

  async function synchronizeLocally() {
    assertLive();
    if (authority()?.id !== game.user?.id) throw error("RequiresGM");
    const saved = state();
    let { user, actor, folder } = get();
    if (folder?.type !== "Actor") folder = null;
    if (!enabled()) {
      if (user) {
        await writeState({ ...saved, userId: user.id, name: user.name });
        assertLive();
        // Only owned users are found above; Actors and folders survive disabling.
        await user.delete();
      }
      return null;
    }
    const config = defaults();
    const UserClass = documentClass("User");
    const ActorClass = documentClass("Actor");
    const FolderClass = documentClass("Folder");
    if (!config || !UserClass || !ActorClass) throw error("Unavailable");
    const portrait = String(config.portrait ?? "");
    const baseName = String(user?.name || saved.name || actor?.name || config.name || ownerId);
    let name = baseName;
    for (let suffix = 2; !user && values(game.users).some((entry) => entry.name === name); suffix += 1) {
      name = `${baseName} (${suffix})`;
    }
    const nextState = { ...saved, name };
    const persist = async (field, id) => {
      nextState[field] = id;
      assertLive();
      await writeState({ ...nextState });
    };
    await adopt(folder);
    await adopt(actor);
    await adopt(user);
    if (Array.isArray(config.folderPath) && config.folderPath.length && FolderClass) {
      let parent = null;
      for (let index = 0; index < config.folderPath.length; index++) {
        const path = config.folderPath.slice(0, index + 1).join("/");
        let entry = values(game.folders).find((candidate) => {
          const marker = candidate.getFlag?.(namespace, "managedIdentityFolder") ?? candidate.flags?.[namespace]?.managedIdentityFolder;
          return candidate.type === "Actor" && marker?.ownerId === ownerId && marker.key === key && marker.path === path;
        });
        const leaf = index === config.folderPath.length - 1;
        assertLive();
        if (!entry) entry = await FolderClass.create({ name: String(config.folderPath[index]), type: "Actor", folder: parent?.id ?? null,
          flags: { [namespace]: { ...(leaf ? flags()[namespace] : {}), managedIdentityFolder: { ...descriptor, path } } } });
        if (!entry) throw error("Unavailable");
        if ((entry.folder?.id ?? entry.folder ?? null) !== (parent?.id ?? null)) await entry.update({ folder: parent?.id ?? null });
        parent = entry;
      }
      folder = parent;
      if (folder.id !== saved.folderId) await persist("folderId", folder.id);
    } else if (!folder && FolderClass) {
      try {
        assertLive();
        folder = await FolderClass.create({ ...availableId(game.folders, saved.folderId),
          name: String(config.folderName || ownerId), type: "Actor", folder: null, flags: flags() }, { keepId: true });
        if (folder) await persist("folderId", folder.id);
      } catch (cause) {
        assertLive();
        console.warn(`${namespace} | Unable to create a technical identity folder for ${ownerId}/${key}`, cause);
      }
    }
    if (!actor) {
      const types = game.documentTypes?.Actor ?? ActorClass.TYPES ?? Object.keys(globalThis.CONFIG?.Actor?.dataModels ?? {});
      const preferred = config.actorTypes ?? ["npc", "mook", "character"];
      const type = preferred.find((candidate) => types.includes(candidate)) ?? types[0];
      if (!type) throw error("ActorTypeUnavailable");
      assertLive();
      actor = await ActorClass.create({ ...availableId(game.actors, saved.actorId),
        name, type, img: portrait, folder: folder?.id ?? null,
        prototypeToken: { name, actorLink: true, texture: { src: portrait } },
        ownership: { default: 0 }, flags: flags() }, { keepId: true });
      if (!actor) throw error("Unavailable");
      await persist("actorId", actor.id);
    }
    const actorChanges = {};
    if (actor.name !== name) actorChanges.name = name;
    if (actor.img !== portrait) actorChanges.img = portrait;
    if (actor.prototypeToken?.texture?.src !== portrait) actorChanges["prototypeToken.texture.src"] = portrait;
    if (folder && (actor.folder?.id ?? actor.folder) !== folder.id) actorChanges.folder = folder.id;
    assertLive();
    if (Object.keys(actorChanges).length) await actor.update(actorChanges);
    if (Object.entries(actor.ownership ?? {}).some(([field, value]) => field !== "default" || value !== 0)
      || actor.ownership?.default !== 0) {
      assertLive();
      await actor.update({ ownership: { default: 0 } }, { diff: false, recursive: false });
    }
    const permissions = Object.fromEntries(Object.keys(globalThis.CONST?.USER_PERMISSIONS ?? {}).map((permission) => [permission, false]));
    permissions.MESSAGE_WHISPER = true;
    assertLive();
    if (!user) {
      user = await UserClass.create({ ...availableId(game.users, saved.userId), name,
        ...(typeof config.password === "string" ? { password: config.password } : {}),
        role: 1, avatar: portrait, character: actor.id, permissions, flags: flags() }, { keepId: true });
      if (!user) throw error("Unavailable");
      await persist("userId", user.id);
    } else {
      const changes = {};
      if (Number(user.role) !== 1) changes.role = 1;
      if (user.avatar !== portrait) changes.avatar = portrait;
      if ((user.character?.id ?? user.character) !== actor.id) changes.character = actor.id;
      if (Object.entries(permissions).some(([permission, value]) => user.permissions?.[permission] !== value)) changes.permissions = permissions;
      if (Object.keys(changes).length) await user.update(changes);
    }
    Object.assign(nextState, { userId: user.id, actorId: actor.id, folderId: folder?.id ?? "", name: user.name });
    assertLive();
    if (JSON.stringify(nextState) !== JSON.stringify(state())) await writeState({ ...nextState });
    return { user, actor, folder };
  }

  function receive(payload) {
    if (disposed || payload?.topic !== topic || payload.ownerId !== ownerId || payload.key !== key
      || typeof payload.id !== "string" || typeof payload.requesterId !== "string") return;
    if (payload.operation === "ensure") {
      if (authority()?.id !== game.user?.id || !canRequest(game.users.get(payload.requesterId))) return;
      const response = { topic, ownerId, key, operation: "ready", id: payload.id,
        requesterId: payload.requesterId, authorityId: game.user.id };
      void enqueueLifecycle(synchronizeLocally).then(
        () => { if (!disposed) socket?.emit(channel, response); },
        (cause) => { if (!disposed) socket?.emit(channel, { ...response, error: cause.message }); }
      );
    } else if (payload.operation === "ready" && payload.requesterId === game.user?.id) {
      const request = pending.get(payload.id);
      if (!request || request.authorityId !== payload.authorityId || authority()?.id !== payload.authorityId) return;
      pending.delete(payload.id);
      globalThis.clearTimeout(request.timeout);
      if (payload.error) request.reject(new Error(String(payload.error)));
      else {
        const identity = get();
        if (enabled() && (!identity.user || !identity.actor) || !enabled() && identity.user) request.reject(error("Unavailable"));
        else request.resolve(enabled() ? identity : null);
      }
    }
  }
  function listen() {
    assertLive();
    if (socket) return;
    if (!game.socket?.on || !game.socket?.emit) throw error("Unavailable");
    socket = game.socket;
    socket.on(channel, receive);
    const target = globalThis.window ?? globalThis;
    if (typeof target.addEventListener === "function") {
      lifecycleTarget = target;
      target.addEventListener("pagehide", dispose);
    }
  }
  async function synchronize() {
    assertLive();
    if (!canRequest(game.user)) throw error("RequiresGM");
    const gm = authority();
    if (gm?.id === game.user?.id) return enqueueLifecycle(synchronizeLocally);
    if (!gm) {
      const identity = get();
      if (enabled() && identity.user && identity.actor) return identity;
      if (!enabled() && !identity.user) return null;
      throw error("RequiresGM");
    }
    listen();
    const id = globalThis.foundry.utils.randomID();
    return new Promise((resolve, reject) => {
      const timeout = globalThis.setTimeout(() => { pending.delete(id); reject(error("Unavailable")); }, timeoutMs);
      pending.set(id, { resolve, reject, timeout, authorityId: gm.id });
      try { socket.emit(channel, { topic, operation: "ensure", ownerId, key, id, requesterId: game.user.id }); }
      catch (cause) { pending.delete(id); globalThis.clearTimeout(timeout); reject(cause); }
    });
  }
  function dispose() {
    if (disposed) return false;
    disposed = true;
    socket?.off?.(channel, receive);
    socket = undefined;
    lifecycleTarget?.removeEventListener?.("pagehide", dispose);
    lifecycleTarget = undefined;
    for (const request of pending.values()) {
      globalThis.clearTimeout(request.timeout);
      request.reject(error("Disposed"));
    }
    pending.clear();
    return true;
  }
  return Object.freeze({
    get, isUser: owns, synchronize,
    async activate() {
      listen();
      return authority()?.id === game.user?.id ? synchronize() : enabled() ? get() : null;
    },
    dispose
  });
}

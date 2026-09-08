/** Foundry document compatibility, without implicit controlled-token attribution. */
export function getChatMessageClass() {
  return globalThis.CONFIG?.ChatMessage?.documentClass ?? globalThis.foundry?.documents?.ChatMessage;
}

export function getChatMessageRenderHook() {
  const generation = Number(game.release?.generation ?? String(game.version ?? "").split(".")[0]);
  return generation >= 13 ? "renderChatMessageHTML" : "renderChatMessage";
}

export function buildChatSpeaker({ alias = "", actor = null, token = null, scene = null } = {}) {
  const id = (value) => value === null || value === undefined || value === "" ? null : String(value.id ?? value);
  return { scene: id(scene), actor: id(actor), token: id(token), alias: String(alias ?? "") };
}

export function applyChatMessageMode(data, ChatMessageClass = getChatMessageClass()) {
  if (typeof ChatMessageClass.applyMode === "function") return ChatMessageClass.applyMode(data);
  return ChatMessageClass.applyRollMode?.(data, game.settings.get("core", "rollMode"));
}

export function getMessageAuthorId(message, fallback = "") {
  const author = message?.author;
  const legacy = message?.user;
  return String(author?.id ?? (typeof author === "string" ? author : undefined)
    ?? legacy?.id ?? (typeof legacy === "string" ? legacy : undefined)
    ?? message?._source?.author ?? message?._source?.user ?? fallback ?? "");
}

export function getMessageAuthorName(message) {
  return String(message?.author?.name ?? game.users.get(getMessageAuthorId(message))?.name ?? "");
}

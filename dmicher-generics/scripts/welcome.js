import { isManagedIdentityUser } from "./chat/identity.js";
import { getChatMetadata } from "./chat/messages.js";
import { bindActions } from "./chat/actions.js";
import { renderChatPortrait } from "./chat/portraits.js";
import { getRenderedElement } from "./windows.js";
import { buildWelcomeContent, welcomeText } from "./welcome-content.js";

const MODULE_ID = "dmicher-generics", SESSION_FLAG = "welcomeSession";
const values = (collection) => Array.from(collection?.values?.() ?? []);
const human = (user) => Boolean(user && !isManagedIdentityUser(user));
const readSession = (user) => user?.getFlag?.(MODULE_ID, SESSION_FLAG) ?? user?.flags?.[MODULE_ID]?.[SESSION_FLAG];

/** A self-written User session nonce survives GM reconnects; chat keys deduplicate delivery. */
export function createWelcomeController({ informer, premium, modules, appearance, help }) {
  const messages = informer.createMessageService({ ownerId: MODULE_ID, channel: "welcome" });
  let installed = false, disposed = false, started = false;
  const hooks = [], pending = new Map();
  const authority = () => values(game.users).filter((user) => human(user) && user.active && Number(user.role) === 4).sort((a, b) => a.id.localeCompare(b.id))[0]?.id === game.user?.id;
  const enabled = () => !disposed && game.settings.get(MODULE_ID, "showWelcome") !== false;
  const registerHook = (name, handler) => hooks.push([name, Hooks.on(name, handler)]);
  const activeModules = () => values(game.modules).filter((module) => module.active && String(module.id).startsWith("dmicher")).map((module) => ({
    id: module.id, title: String(module.title ?? module.id), version: String(module.version ?? ""),
    help: module.id === MODULE_ID || typeof modules.get(module.id)?.openHelp === "function"
  })).sort((a, b) => a.title.localeCompare(b.title));

  async function send(user) {
    const session = readSession(user);
    if (!started || !enabled() || !authority() || !human(user) || !user.active || !/^[a-zA-Z0-9_-]{8,80}$/.test(session ?? "")) return;
    const key = `welcome:${user.id}:${session}`;
    if (pending.has(key)) return pending.get(key);
    const task = (async () => {
      await premium.waitUntilReady();
      if (!enabled() || !authority() || !user.active || readSession(user) !== session) return;
      const listed = activeModules(), data = { modules: listed, gm: Number(user.role) >= 3,
        premium: listed.some((module) => /^dmicher-[a-z0-9-]+$/.test(module.id) && premium.getAccessStatus(module.id).active) };
      return messages.create({ content: buildWelcomeContent(data), flags: { [MODULE_ID]: { welcome: { ...data, userId: user.id, session } } } },
        { audience: { type: "users", userIds: [user.id] }, key, kind: "welcome",
          enabled: () => enabled() && authority() && user.active && readSession(user) === session });
    })().finally(() => pending.delete(key));
    pending.set(key, task); return task;
  }
  const report = (error) => console.error(`${MODULE_ID} | Welcome could not be delivered`, error);
  const welcomeActive = () => { if (started && authority()) for (const user of values(game.users)) void send(user).catch(report); };

  function render(message, html) {
    const meta = getChatMetadata(message), data = message.getFlag?.(MODULE_ID, "welcome"), root = getRenderedElement(html);
    if (meta?.ownerId !== MODULE_ID || meta.channel !== "welcome" || !data || !root || message.isContentVisible !== true) return;
    const content = root.querySelector(".message-content");
    if (content) content.innerHTML = buildWelcomeContent(data);
    renderChatPortrait(root, { moduleId: MODULE_ID, sources: [informer.portrait], alt: message.speaker?.alias ?? "" });
    bindActions({ moduleId: MODULE_ID, key: "welcome", message, root,
      actions: [{ selector: "[data-dmicher-chat-action]", authorize: ({ message: current, user }) => {
        const own = current.getFlag?.(MODULE_ID, "welcome");
        return getChatMetadata(current)?.ownerId === MODULE_ID && Boolean(own && (own.userId === user.id || Number(user.role) >= 3));
      }, handle: ({ element }) => {
        const action = element.dataset.dmicherChatAction;
        if (action === "settings") {
          const Settings = globalThis.foundry?.applications?.settings?.SettingsConfig ?? globalThis.SettingsConfig;
          return game.settings.sheet?.render(true) ?? (Settings ? new Settings().render({ force: true }) : null);
        }
        const id = action?.startsWith("help:") ? action.slice(5) : null;
        if (id === MODULE_ID) return appearance.openHelp();
        if (id && game.modules.get(id)?.active && typeof modules.get(id)?.openHelp === "function") return modules.get(id).openHelp();
        globalThis.ui?.notifications?.warn(welcomeText().missing);
      } }], onError: (error) => globalThis.ui?.notifications?.error(error.message) });
  }
  return Object.freeze({
    registerSettings() {
      if (installed) return; installed = true;
      const t = welcomeText();
      game.settings.register(MODULE_ID, "showWelcome", { name: t.name, hint: t.hint, scope: "world", config: true, type: Boolean, default: true, onChange: welcomeActive });
      registerHook("updateUser", (user, changes, options, userId) => {
        // Foundry supplies the document author. Never accept a claimed requester from a module socket.
        if (userId !== user.id && Number(game.users.get(userId)?.role) !== 4) return;
        if (changes[`flags.${MODULE_ID}.${SESSION_FLAG}`] !== undefined || changes.flags?.[MODULE_ID]?.[SESSION_FLAG] !== undefined) void send(user).catch(report);
      });
      registerHook("userConnected", welcomeActive);
      registerHook("renderChatMessageHTML", render);
      registerHook("renderSettingsConfig", (app, html) => help.bindSettingHelp(html, { open: (page, anchor) => appearance.openHelp(page, anchor),
        entries: [{ selector: `[name="${MODULE_ID}.showWelcome"]`, pageId: "welcome", hint: welcomeText().hint }] }));
    },
    async activate() {
      if (started || disposed || !game.user || !human(game.user)) return;
      started = true;
      await game.user.setFlag(MODULE_ID, SESSION_FLAG, foundry.utils.randomID(24));
      welcomeActive();
    },
    send,
    dispose() { disposed = true; for (const [name, id] of hooks.splice(0)) Hooks.off(name, id); }
  });
}

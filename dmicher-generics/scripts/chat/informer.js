import { createManagedIdentity } from "./identity.js";
import { createMessageService } from "./messages.js";
import { buildChatSpeaker } from "./documents.js";

const MODULE_ID = "dmicher-generics";
export const INFORMER_PORTRAIT = `modules/${MODULE_ID}/assets/chat/token_dak.webp`;

/** The family informer has one owner. Consumers own their messages, never its lifecycle. */
export function createInformerController() {
  let registered = false;
  const identity = createManagedIdentity({ ownerId: MODULE_ID, key: "informer",
    readState: () => game.settings.get(MODULE_ID, "informerIdentity") ?? {},
    writeState: (value) => game.settings.set(MODULE_ID, "informerIdentity", value),
    defaults: () => ({ name: game.i18n?.lang?.startsWith("ru") ? "Информатор" : "Informer", portrait: INFORMER_PORTRAIT,
      password: foundry.utils.randomID(32), folderPath: ["dmicher modules", "generic"] }),
    canRequest: (user) => Number(user?.role) >= 3
  });
  const api = Object.freeze({
    get: identity.get,
    portrait: INFORMER_PORTRAIT,
    createMessageService(options) {
      const service = createMessageService(options);
      return Object.freeze({ ...service,
        create(data, settings) {
          if (Number(game.user?.role) < 3) return Promise.reject(new Error("Only a GM can send an informer message."));
          return service.create(async (context) => {
            const current = await identity.synchronize();
            if (!current?.user || !current.actor) throw new Error("The dmicher informer is unavailable.");
            const informer = { ...current, portrait: INFORMER_PORTRAIT };
            const content = typeof data === "function" ? await data({ ...context, informer }) : data;
            return { ...content, author: current.user.id,
              speaker: buildChatSpeaker({ actor: current.actor.id, alias: current.actor.name }),
              flags: { ...content?.flags, [MODULE_ID]: { ...content?.flags?.[MODULE_ID], informer: { portrait: INFORMER_PORTRAIT } } } };
          }, { ...settings, technical: true });
        }
      });
    }
  });
  return Object.freeze({ api,
    registerSettings() {
      if (registered) return;
      registered = true;
      game.settings.register(MODULE_ID, "informerIdentity", { scope: "world", config: false, type: Object, default: {} });
    },
    activate: identity.activate,
    dispose: identity.dispose
  });
}

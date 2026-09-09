import * as windows from "./windows.js";
import * as theme from "./theme.js";
import * as utilities from "./utilities.js";
import * as chat from "./chat/index.js";
import * as help from "./help/index.js";
import * as components from "./components.js";
import { createModuleRegistry } from "./registry.js";
import { createPremiumBridge } from "./premium.js";
import { createAppearanceController } from "./appearance.js";
import { createInformerController } from "./chat/informer.js";
import { createWelcomeController } from "./welcome.js";

export const MODULE_ID = "dmicher-generics";
export const API_VERSION = 1;
export const premium = createPremiumBridge();
export const appearance = createAppearanceController({ premium, help });
export const modules = createModuleRegistry({
  onChange: (event, record) => globalThis.Hooks?.callAll?.("dmicherModuleRegistryChanged", event, record)
});
export const informerController = createInformerController();
export const welcomeController = createWelcomeController({ informer: informerController.api, premium, modules, appearance, help });
export const api = Object.freeze({
  apiVersion: API_VERSION,
  windows: Object.freeze({ ...windows }),
  theme: Object.freeze({ ...theme }),
  utilities: Object.freeze({ ...utilities }),
  chat: Object.freeze({ ...chat, informer: informerController.api }),
  help: Object.freeze({ ...help }),
  components: Object.freeze({ ...components }),
  appearance,
  modules,
  premium
});

export function requireApiVersion(version) {
  if (version !== API_VERSION) throw new Error(`dmicher-generics API ${version} required; loaded ${API_VERSION}.`);
  return api;
}

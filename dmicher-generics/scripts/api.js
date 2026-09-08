import * as windows from "./windows.js";
import * as theme from "./theme.js";
import * as utilities from "./utilities.js";
import { createModuleRegistry } from "./registry.js";
import { createPremiumBridge } from "./premium.js";

export const MODULE_ID = "dmicher-generics";
export const API_VERSION = 1;
export const premium = createPremiumBridge();
export const modules = createModuleRegistry({
  onChange: (event, record) => globalThis.Hooks?.callAll?.("dmicherModuleRegistryChanged", event, record)
});
export const api = Object.freeze({
  apiVersion: API_VERSION,
  windows: Object.freeze({ ...windows }),
  theme: Object.freeze({ ...theme }),
  utilities: Object.freeze({ ...utilities }),
  modules,
  premium
});

export function requireApiVersion(version) {
  if (version !== API_VERSION) throw new Error(`dmicher-generics API ${version} required; loaded ${API_VERSION}.`);
  return api;
}

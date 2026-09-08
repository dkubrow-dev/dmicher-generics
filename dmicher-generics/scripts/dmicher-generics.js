import { MODULE_ID, api } from "./api.js";

Hooks.once("init", () => {
  game.modules.get(MODULE_ID).api = api;
  api.appearance.registerSettings();
  api.appearance.install();
  Hooks.callAll("dmicherGenericsReady", api);
});

globalThis.addEventListener?.("pagehide", () => api.appearance.dispose(), { once: true });

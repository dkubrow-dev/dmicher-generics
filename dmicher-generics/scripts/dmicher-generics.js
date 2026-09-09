import { MODULE_ID, api, informerController, welcomeController } from "./api.js";

Hooks.once("init", () => {
  game.modules.get(MODULE_ID).api = api;
  api.appearance.registerSettings();
  api.appearance.install();
  informerController.registerSettings();
  welcomeController.registerSettings();
  Hooks.once("ready", async () => {
    try { await informerController.activate(); await welcomeController.activate(); }
    catch (error) { console.error(`${MODULE_ID} | Informer initialization failed`, error); }
  });
  Hooks.callAll("dmicherGenericsReady", api);
});

globalThis.addEventListener?.("pagehide", () => { api.appearance.dispose(); welcomeController.dispose(); informerController.dispose(); }, { once: true });

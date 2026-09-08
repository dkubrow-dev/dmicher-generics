import { MODULE_ID, api } from "./api.js";

Hooks.once("init", () => {
  game.modules.get(MODULE_ID).api = api;
  Hooks.callAll("dmicherGenericsReady", api);
});

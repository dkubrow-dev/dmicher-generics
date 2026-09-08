import { getRenderedElement } from "./windows.js";

export const WINDOW_CLASS = "dmicher-window";
export const THEMES = Object.freeze({ dark: "dark", light: "light" });
let sharedThemeGetter = null;

/** The appearance owner supplies one theme for all dmicher applications. */
export function setSharedThemeGetter(getter) {
  if (typeof getter !== "function") throw new TypeError("Expected a theme getter.");
  sharedThemeGetter = getter;
  return () => { if (sharedThemeGetter === getter) sharedThemeGetter = null; };
}

export function normalizeTheme(value) {
  return Object.values(THEMES).includes(value) ? value : THEMES.dark;
}

/** Legacy getters remain a fallback until the shared appearance owner starts. */
export function createWindowThemeController({ windowClass, getTheme = () => THEMES.dark }) {
  if (!/^[a-z][a-z0-9-]*$/.test(windowClass) || typeof getTheme !== "function") {
    throw new TypeError("A window class and a synchronous theme getter are required.");
  }
  let hookId = null;
  let hookBus = null;
  const currentTheme = () => sharedThemeGetter ? sharedThemeGetter() : getTheme();
  const applyElement = (element, value = currentTheme()) => {
    if (element?.classList?.contains(windowClass)) {
      element.setAttribute("data-dmicher-theme", normalizeTheme(value));
    }
  };
  return Object.freeze({
    classes: (...classes) => [WINDOW_CLASS, windowClass, ...classes],
    apply(value = currentTheme()) {
      const theme = normalizeTheme(sharedThemeGetter ? sharedThemeGetter() : value);
      const elements = new Set(globalThis.document?.querySelectorAll?.(`.${windowClass}`) ?? []);
      // Foundry 13/14 owns this registry and removes closed ApplicationV2 instances.
      // A native v14 popout keeps its element here while it is outside this document.
      for (const application of globalThis.foundry?.applications?.instances?.values?.() ?? []) {
        if (application?.rendered) elements.add(getRenderedElement(application));
      }
      for (const element of elements) {
        applyElement(element, theme);
      }
      return theme;
    },
    install(hooks = globalThis.Hooks) {
      if (hookBus || !hooks?.on) return;
      hookBus = hooks;
      hookId = hooks.on("renderApplicationV2", (application, html) => {
        const element = getRenderedElement(application) ?? getRenderedElement(html);
        applyElement(element);
      });
    },
    dispose() {
      if (hookBus) hookBus.off?.("renderApplicationV2", hookId);
      hookBus = null;
      hookId = null;
    }
  });
}

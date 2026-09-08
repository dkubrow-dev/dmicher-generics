import { getRenderedElement } from "./windows.js";

export const WINDOW_CLASS = "dmicher-window";
export const THEMES = Object.freeze({ dark: "dark", light: "light" });

export function normalizeTheme(value) {
  return Object.values(THEMES).includes(value) ? value : THEMES.dark;
}

/** Themes belong to the consuming module; this controller creates no settings. */
export function createWindowThemeController({ windowClass, getTheme }) {
  if (!/^[a-z][a-z0-9-]*$/.test(windowClass) || typeof getTheme !== "function") {
    throw new TypeError("A window class and a synchronous theme getter are required.");
  }
  let hookId = null;
  let hookBus = null;
  const applyElement = (element, value = getTheme()) => {
    if (element?.classList?.contains(windowClass)) {
      element.setAttribute("data-dmicher-theme", normalizeTheme(value));
    }
  };
  return Object.freeze({
    classes: (...classes) => [WINDOW_CLASS, windowClass, ...classes],
    apply(value = getTheme()) {
      const theme = normalizeTheme(value);
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

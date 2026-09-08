import { createWindowThemeController, normalizeTheme, setSharedThemeGetter } from "./theme.js";
import { createWindowSnapController } from "./window-snapping.js";
import { openSingletonApplication, getRenderedElement } from "./windows.js";
import { appearanceText, appearanceHelpContent } from "./appearance-content.js";
import { prepareCustomStyles, MAX_CUSTOM_STYLE_BYTES } from "./custom-styles.js";

const MODULE_ID = "dmicher-generics";
const SWITCHES = ["snapScreen", "snapWindows", "snapCorners", "snapCenters", "snapCascadeRightButton"];
const DEFAULTS = { theme: "dark", snapScreen: true, snapWindows: true, snapCorners: true, snapCenters: true, snapCascadeRightButton: true, customStyles: "", appearanceInitialized: false };

export function createAppearanceController({ premium, help }) {
  const extension = premium.forModule(MODULE_ID, { apiVersion: 1, methods: ["resolveCustomStyles"] });
  let settingsWindow, SettingsApplication, helpWindow, HelpApplication, installed = false, registered = false;
  let releaseTheme, releasePremium, legacy = null;
  let compiledInput = null, compiledStyle = "";
  const hookRecords = [], documents = new Set(), observers = new Map();
  const read = (key) => { try { return globalThis.game?.settings?.get(MODULE_ID, key) ?? DEFAULTS[key]; } catch { return DEFAULTS[key]; } };
  const getTheme = () => normalizeTheme(read("theme"));
  const windowTheme = createWindowThemeController({ windowClass: "dmicher-window", getTheme });
  const snap = createWindowSnapController({ getSettings: () => ({ screen: read("snapScreen"), windows: read("snapWindows"), corners: read("snapCorners"), centers: read("snapCenters"), cascadeRightButton: read("snapCascadeRightButton") }) });
  const getCustomStyles = () => extension.invoke("resolveCustomStyles", [read("customStyles")], () => "",
    (value) => typeof value === "string" && new TextEncoder().encode(value).length <= MAX_CUSTOM_STYLE_BYTES);

  function applyDocument(document, css) {
    if (!document?.head) return;
    documents.add(document);
    if (!observers.has(document) && document.body && document.defaultView?.MutationObserver) {
      const observer = new document.defaultView.MutationObserver((mutations) => {
        // A Foundry 14 detach adopts the existing element without a render hook.
        if (mutations.some((mutation) => [...mutation.addedNodes, ...mutation.removedNodes].some((node) =>
          node.nodeType === 1 && (node.classList?.contains("dmicher-window") || node.querySelector?.(".dmicher-window"))))) apply();
      });
      observer.observe(document.body, { childList: true, subtree: true }); observers.set(document, observer);
    }
    let style = document.querySelector("style[data-dmicher-custom-style]");
    if (!css) { style?.remove(); return; }
    if (!style) {
      style = document.createElement("style");
      style.dataset.dmicherCustomStyle = "true";
      document.head.append(style);
    }
    if (style.textContent !== css) style.textContent = css;
  }

  function apply() {
    snap.refresh();
    windowTheme.apply();
    let css = "";
    const raw = getCustomStyles();
    if (raw !== compiledInput) {
      compiledInput = raw; compiledStyle = "";
      try { if (raw) compiledStyle = prepareCustomStyles(raw); }
      catch { console.warn("dmicher-generics | Saved custom style could not be applied."); }
    }
    css = compiledStyle;
    if (globalThis.document) documents.add(globalThis.document);
    for (const application of globalThis.foundry?.applications?.instances?.values?.() ?? []) {
      const element = getRenderedElement(application);
      if (element?.classList?.contains("dmicher-window")) documents.add(element.ownerDocument);
    }
    for (const document of documents) {
      if (document.defaultView?.closed) { documents.delete(document); observers.get(document)?.disconnect(); observers.delete(document); continue; }
      applyDocument(document, css);
    }
    return getTheme();
  }

  function openHelp(pageId = "appearance", anchor) {
    HelpApplication ??= help.createHelpApplication({ id: "dmicher-generics-help", title: () => appearanceText().helpTitle,
      classes: ["dmicher-generics-help"], getContent: appearanceHelpContent, initialPageId: pageId });
    helpWindow = openSingletonApplication(helpWindow, () => new HelpApplication());
    void helpWindow.navigate(pageId, anchor);
    return helpWindow;
  }

  function createSettingsApplication() {
    const { ApplicationV2, HandlebarsApplicationMixin } = globalThis.foundry.applications.api;
    return class AppearanceSettings extends HandlebarsApplicationMixin(ApplicationV2) {
      static DEFAULT_OPTIONS = { id: "dmicher-appearance-settings", classes: ["dmicher-window", "dmicher-appearance-settings"], position: { width: 620, height: "auto" }, window: { title: "dmicher", icon: "fa-solid fa-palette", resizable: true } };
      static PARTS = { main: { template: `modules/${MODULE_ID}/templates/appearance.hbs` } };
      get title() { return appearanceText().title; }
      constructor(...args) { super(...args); this.customDraft = undefined; this.busy = false; this.disposers = []; }
      async _prepareContext(options) {
        const context = await super._prepareContext(options), text = appearanceText(), active = extension.getStatus().active;
        const custom = this.customDraft ?? read("customStyles");
        return { ...context, text, premiumActive: active, hasCustom: Boolean(custom),
          premiumMessage: active ? text.available : text.unavailable, styleState: custom ? text.stored : text.empty,
          themes: ["dark", "light"].map((value) => ({ value, label: text[value], selected: getTheme() === value })),
          switches: SWITCHES.map((key) => ({ key, label: text[key], checked: Boolean(read(key)), disabled: ["snapCorners", "snapCenters"].includes(key) && !read("snapScreen") && !read("snapWindows") })) };
      }
      async _onRender(context, options) {
        await super._onRender(context, options);
        this.disposers.splice(0).forEach((dispose) => dispose());
        const form = this.element.querySelector("form"), text = appearanceText();
        const controller = new (this.element.ownerDocument.defaultView.AbortController)();
        this.disposers.push(() => controller.abort());
        const { signal } = controller;
        const sync = () => {
          const enabled = form.elements.snapScreen.checked || form.elements.snapWindows.checked;
          for (const key of ["snapCorners", "snapCenters"]) {
            form.elements[key].disabled = !enabled;
            form.elements[key].closest(".form-group").classList.toggle("is-disabled", !enabled);
          }
        };
        form.addEventListener("change", sync, { signal }); sync();
        form.elements.customStyles.addEventListener("change", async () => {
          const file = form.elements.customStyles.files?.[0];
          if (!file || !extension.getStatus().active) return;
          try {
            if (file.size > MAX_CUSTOM_STYLE_BYTES) throw Error("size");
            const css = await file.text(); prepareCustomStyles(css, this.element.ownerDocument);
            this.customDraft = css;
            form.querySelector(".dmicher-style-state").textContent = `${text.stored}: ${file.name}`;
            form.querySelector('[data-appearance-action="remove-style"]').disabled = false;
          } catch { globalThis.ui?.notifications?.error(text.invalid); }
        }, { signal });
        form.addEventListener("click", (event) => {
          const action = event.target.closest("[data-appearance-action]")?.dataset.appearanceAction;
          if (action === "help") openHelp();
          if (action === "remove-style") {
            this.customDraft = ""; form.elements.customStyles.value = "";
            form.querySelector(".dmicher-style-state").textContent = text.empty;
            form.querySelector('[data-appearance-action="remove-style"]').disabled = true;
          }
        }, { signal });
        form.addEventListener("submit", async (event) => {
          event.preventDefault(); if (this.busy) return;
          this.busy = true;
          const saveButton = form.querySelector('[type="submit"]'); saveButton.disabled = true;
          try {
            const values = { theme: normalizeTheme(form.elements.theme.value) };
            for (const key of SWITCHES) values[key] = form.elements[key].checked;
            // Revoked access cannot import a new layer, but clearing a saved layer remains available.
            if (this.customDraft !== undefined && (!this.customDraft || extension.getStatus().active)) values.customStyles = this.customDraft;
            for (const [key, value] of Object.entries(values)) await game.settings.set(MODULE_ID, key, value);
            await game.settings.set(MODULE_ID, "appearanceInitialized", true);
            apply(); globalThis.ui?.notifications?.info(text.saved);
            // Keep the form and its in-flight edits intact; a later save must not reuse an old import.
            if (Object.hasOwn(values, "customStyles") && this.customDraft === values.customStyles) this.customDraft = undefined;
          } catch { globalThis.ui?.notifications?.error(text.failed); }
          finally { this.busy = false; saveButton.disabled = false; }
        }, { signal });
        this.disposers.push(help.bindSettingHelp(form, { open: openHelp, entries: ["theme", ...SWITCHES, "customStyles"].map((key) => ({
          selector: `[name="${key}"]`, pageId: "settings", anchor: key, hint: text[key === "customStyles" ? "customHint" : `${key}Hint`]
        })) }));
      }
      async _onClose(options) { this.disposers.splice(0).forEach((dispose) => dispose()); await super._onClose(options); }
    };
  }

  function registerSettings() {
    if (registered) return; registered = true;
    for (const [key, value] of Object.entries(DEFAULTS)) game.settings.register(MODULE_ID, key, {
      scope: "client", config: false, type: typeof value === "boolean" ? Boolean : String, default: value,
      onChange: key === "appearanceInitialized" ? undefined : () => apply()
    });
    SettingsApplication = createSettingsApplication();
    const text = appearanceText();
    game.settings.registerMenu(MODULE_ID, "appearanceSettings", { name: text.menu, label: text.open, hint: text.hint,
      icon: "fa-solid fa-palette", type: SettingsApplication, restricted: false });
  }

  return Object.freeze({
    getTheme, getCustomStyles, openHelp, apply, registerSettings,
    getWindowLayout: () => snap.getLayout(),
    getSettings: () => Object.fromEntries(Object.keys(DEFAULTS).map((key) => [key, read(key)])),
    adoptLegacyTheme(value, priority = 0) {
      if (!["dark", "light"].includes(value) || read("appearanceInitialized")) return false;
      if (!legacy || priority > legacy.priority) legacy = { value, priority };
      return true;
    },
    openSettings() {
      if (!SettingsApplication) registerSettings();
      settingsWindow = openSingletonApplication(settingsWindow, () => new SettingsApplication()); return settingsWindow;
    },
    install(bus = globalThis.Hooks) {
      if (installed) return; installed = true;
      releaseTheme = setSharedThemeGetter(getTheme);
      windowTheme.install(bus); snap.install(bus);
      releasePremium = extension.subscribe(() => {
        apply();
        // Do not rerender a form with unsaved edits when a license refresh arrives.
        const input = settingsWindow?.element?.querySelector('[name="customStyles"]');
        if (input) input.disabled = !extension.getStatus().active;
        const message = settingsWindow?.element?.querySelector(".dmicher-premium-style-message");
        if (message) message.textContent = appearanceText()[extension.getStatus().active ? "available" : "unavailable"];
      });
      for (const name of ["renderApplication", "renderApplicationV2"]) hookRecords.push([bus, name, bus.on(name, apply)]);
      hookRecords.push([bus, "ready", bus.once("ready", async () => {
        if (!read("appearanceInitialized")) {
          if (legacy) await game.settings.set(MODULE_ID, "theme", legacy.value);
          await game.settings.set(MODULE_ID, "appearanceInitialized", true);
        }
        apply();
      })]);
      apply();
    },
    dispose() {
      installed = false; windowTheme.dispose(); snap.dispose(); releaseTheme?.(); releasePremium?.();
      for (const [bus, name, id] of hookRecords.splice(0)) bus.off?.(name, id);
      for (const document of documents) document.querySelector?.("style[data-dmicher-custom-style]")?.remove();
      documents.clear();
      for (const observer of observers.values()) observer.disconnect(); observers.clear();
      void settingsWindow?.close(); void helpWindow?.close();
    }
  });
}

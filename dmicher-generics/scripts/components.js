import { escapeHTML } from "./utilities.js";

export function normalizeHexColor(value) {
  if (typeof value !== "string" || !/^#[0-9a-f]{6}$/i.test(value.trim())) throw new TypeError("Expected #RRGGBB");
  return value.trim().toUpperCase();
}

/** Labels and form ownership belong to the consumer. Only the text field is submitted. */
export function renderColorField({ name, value = "#000000", label = "" }) {
  if (!name) throw new TypeError("Color field requires a name");
  const color = normalizeHexColor(value), title = escapeHTML(label);
  return `<label class="dmicher-color-field"><span>${title}</span><span class="dmicher-color-controls" data-dmicher-color><input type="text" name="${escapeHTML(name)}" value="${color}" pattern="#[0-9a-fA-F]{6}" maxlength="7" required spellcheck="false" autocomplete="off" aria-label="${title}" data-dmicher-color-text><input type="color" value="${color}" aria-label="${title}" data-dmicher-color-picker></span></label>`;
}

export function bindColorFields(root) {
  const view = root.ownerDocument.defaultView, controller = new view.AbortController();
  const listener = (event) => {
    const field = event.target.closest?.("[data-dmicher-color]");
    if (!field || !root.contains(field)) return;
    const text = field.querySelector("[data-dmicher-color-text]"), picker = field.querySelector("[data-dmicher-color-picker]");
    if (event.target === picker) {
      text.value = normalizeHexColor(picker.value); text.setCustomValidity("");
      text.dispatchEvent(new view.Event(event.type, { bubbles: true }));
    } else if (event.target === text) {
      try { picker.value = normalizeHexColor(text.value); text.setCustomValidity(""); if (event.type === "change") text.value = normalizeHexColor(text.value); }
      catch { text.setCustomValidity("#RRGGBB"); }
    }
  };
  for (const type of ["input", "change"]) root.addEventListener(type, listener, { signal: controller.signal });
  return () => controller.abort();
}

export function renderJSONControls({ id, importLabel = "Import JSON", exportLabel = "Export JSON" }) {
  if (!id) throw new TypeError("JSON controls require an id");
  return `<span class="dmicher-json-controls" data-dmicher-json-id="${escapeHTML(id)}"><button type="button" data-dmicher-json="import">${escapeHTML(importLabel)}</button><button type="button" data-dmicher-json="export">${escapeHTML(exportLabel)}</button></span>`;
}

/** The consumer validates its schema and current permissions before committing an import. */
export function createJSONTransfer({ validate, exportValue, importValue, filename = "export.json", maxBytes = 5 * 1024 * 1024, onError } = {}) {
  if (typeof validate !== "function" || typeof exportValue !== "function" || typeof importValue !== "function") throw new TypeError("JSON transfer requires validate, exportValue and importValue");
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) throw new TypeError("Invalid JSON size limit");
  const checked = async (value) => {
    const result = await validate(value);
    if (result === null || typeof result !== "object") throw new TypeError("JSON validator must return the validated object");
    return result;
  };
  const api = {
    async export(document = globalThis.document) {
      const value = await checked(await exportValue());
      const text = JSON.stringify(value, null, 2);
      if (new TextEncoder().encode(text).length > maxBytes) throw new RangeError("JSON exceeds the size limit");
      const view = document.defaultView, url = view.URL.createObjectURL(new view.Blob([text], { type: "application/json" }));
      const link = document.createElement("a"); link.href = url;
      link.download = String(typeof filename === "function" ? filename() : filename).replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_");
      document.body.append(link);
      try { link.click(); } finally { link.remove(); view.setTimeout(() => view.URL.revokeObjectURL(url), 1000); }
      return text;
    },
    async importFile(file) {
      if (!file || typeof file.text !== "function" || file.size > maxBytes) throw new RangeError("JSON exceeds the size limit or no file was selected");
      const text = await file.text();
      if (new TextEncoder().encode(text).length > maxBytes) throw new RangeError("JSON exceeds the size limit");
      const value = await checked(JSON.parse(text));
      await importValue(value); return value;
    },
    bind(root, id) {
      const view = root.ownerDocument.defaultView, controller = new view.AbortController();
      const input = root.ownerDocument.createElement("input"); input.type = "file"; input.accept = ".json,application/json"; input.hidden = true; root.append(input);
      let busy = false;
      const run = async (operation) => {
        if (busy) return; busy = true;
        try { await operation(); } catch (error) { if (onError) onError(error); else globalThis.ui?.notifications?.error(error.message); }
        finally { busy = false; input.value = ""; }
      };
      root.addEventListener("click", (event) => {
        const button = event.target.closest?.("[data-dmicher-json]");
        if (!button || button.closest("[data-dmicher-json-id]")?.dataset.dmicherJsonId !== id) return;
        event.preventDefault(); event.stopPropagation();
        if (busy) return;
        if (button.dataset.dmicherJson === "import") input.click();
        else if (button.dataset.dmicherJson === "export") void run(() => api.export(root.ownerDocument));
      }, { signal: controller.signal });
      input.addEventListener("change", () => { if (input.files?.[0]) void run(() => api.importFile(input.files[0])); }, { signal: controller.signal });
      return () => { controller.abort(); input.remove(); };
    }
  };
  return Object.freeze(api);
}

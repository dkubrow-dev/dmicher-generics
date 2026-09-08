import { getRenderedElement } from "../windows.js";

const DEFAULT_SELECTOR = ".message-sender .avatar img, .message-sender .avatar video";
const VIDEO_SOURCE = /\.(?:m4v|mp4|ogg|ogv|webm)(?:[?#].*)?$/i;
const portraits = new WeakMap();
const noop = () => false;

/**
 * Present a caller-selected portrait with a finite fallback list. Speaker identity, selection priority,
 * permissions and display preferences belong to the caller. Repeated renders preserve the current fallback.
 * Disposing releases only this renderer's error listener; it does not remove the caller's DOM.
 */
export function renderChatPortrait(html, { moduleId, sources, alt = "", selector = DEFAULT_SELECTOR } = {}) {
  if (!/^dmicher-[a-z0-9-]+$/.test(moduleId)) throw new TypeError("Expected a dmicher module ID.");
  if (!Array.isArray(sources)) throw new TypeError("Portrait sources must be an array.");
  const root = getRenderedElement(html);
  if (!root) return noop;
  const portrait = root.querySelector(selector);
  if (!portrait) return noop;
  const candidates = [...new Set(sources.filter((source) => typeof source === "string")
    .map((source) => source.trim()).filter(Boolean))];
  if (!candidates.length) return noop;
  const sourceSignature = JSON.stringify(candidates);
  const label = String(alt);
  let slots = portraits.get(root);
  if (!slots) portraits.set(root, slots = new Map());
  const previous = slots.get(selector);
  if (previous && previous.moduleId !== moduleId) {
    throw new Error(`Chat portrait is already controlled by ${previous.moduleId}.`);
  }
  if (previous?.media === portrait && previous.signature === sourceSignature) {
    previous.alt = label;
    previous.media.alt = label;
    return previous.dispose;
  }
  previous?.dispose();
  portraits.set(root, slots);

  const record = { moduleId, signature: sourceSignature, media: portrait, alt: label, active: true,
    errorHandler: null, dispose: null };
  const clearErrorListener = () => {
    if (record.errorHandler) record.media.removeEventListener?.("error", record.errorHandler);
    record.errorHandler = null;
  };
  record.dispose = () => {
    if (!record.active) return false;
    record.active = false;
    clearErrorListener();
    if (slots.get(selector) === record) slots.delete(selector);
    if (!slots.size && portraits.get(root) === slots) portraits.delete(root);
    return true;
  };
  const apply = (index) => {
    if (!record.active || slots.get(selector) !== record || index >= candidates.length) return;
    clearErrorListener();
    const source = candidates[index];
    const tagName = VIDEO_SOURCE.test(source) ? "video" : "img";
    let media = record.media;
    if (String(media.tagName ?? "").toLowerCase() !== tagName && media.replaceWith) {
      const document = media.ownerDocument ?? root.ownerDocument ?? globalThis.document;
      const replacement = document?.createElement(tagName);
      if (!replacement) { record.dispose(); return; }
      // Keep existing layout classes when switching between image and video.
      if (media.className) replacement.className = media.className;
      media.replaceWith(replacement);
      record.media = media = replacement;
    }
    if (tagName === "video") {
      for (const attribute of ["autoplay", "muted", "disablepictureinpicture", "loop", "playsinline"]) {
        media.toggleAttribute?.(attribute, true);
      }
      media.muted = true;
    }
    media.alt = record.alt;
    if (media.dataset) media.dataset.dmicherChatPortraitSources = sourceSignature;
    if (index + 1 < candidates.length) {
      const errorHandler = () => {
        if (!record.active || record.media !== media || record.errorHandler !== errorHandler) return;
        apply(index + 1);
      };
      record.errorHandler = errorHandler;
      media.addEventListener?.("error", errorHandler, { once: true });
    }
    media.src = source;
  };
  slots.set(selector, record);
  try { apply(0); }
  catch (error) { record.dispose(); throw error; }
  return record.dispose;
}

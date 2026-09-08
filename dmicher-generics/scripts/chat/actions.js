import { escapeHTML } from "../utilities.js";
import { getRenderedElement } from "../windows.js";

const bindings = new WeakMap();

/** Render text-only button markup. Action handlers are registered locally, never read from message flags. */
export function renderActionButton({ id, label, disabled = false } = {}) {
  if (typeof id !== "string" || !id.trim()) throw new TypeError("A nonempty chat action ID is required.");
  return `<button type="button" data-dmicher-chat-action="${escapeHTML(id)}"${disabled ? " disabled" : ""}>${escapeHTML(label ?? "")}</button>`;
}

/**
 * Bind local controls to an existing chat message. This is not socket authorization or an exactly-once command.
 * authorize(context) must explicitly approve the current action. A handler that performs remote effects must
 * validate their authority itself; disposing this binding cannot undo an already started effect.
 *
 * The returned disposer owns only this root/moduleId/key registration. Replacement invalidates pending
 * authorization. The same control cannot start another action while its local handler is pending.
 */
export function bindActions({ moduleId, message, root, key, actions, onError } = {}) {
  if (!/^dmicher-[a-z0-9-]+$/.test(moduleId)) throw new TypeError("Expected a dmicher module ID.");
  if (typeof key !== "string" || !key.trim()) throw new TypeError("A nonempty chat binding key is required.");
  if (typeof message?.id !== "string" || !message.id) throw new TypeError("An existing message ID is required.");
  const renderedRoot = getRenderedElement(root);
  if (!renderedRoot?.addEventListener || !renderedRoot.removeEventListener || !renderedRoot.contains) {
    throw new TypeError("A rendered DOM element is required.");
  }
  if (!Array.isArray(actions) || actions.some((action) => (
    typeof action?.selector !== "string" || !action.selector.trim()
    || typeof action.authorize !== "function" || typeof action.handle !== "function"
    || (action.event !== undefined && (typeof action.event !== "string" || !action.event.trim()))
  ))) throw new TypeError("Every chat action requires a selector, authorize and handle functions.");
  if (onError !== undefined && typeof onError !== "function") throw new TypeError("onError must be a function.");

  // Validate selectors before replacing a working registration.
  const descriptors = actions.map((action) => {
    renderedRoot.querySelector(action.selector);
    return Object.freeze({ ...action, event: action.event ?? "click" });
  });
  let owners = bindings.get(renderedRoot);
  if (!owners) bindings.set(renderedRoot, owners = new Map());
  let keys = owners.get(moduleId);
  if (!keys) owners.set(moduleId, keys = new Map());
  keys.get(key)?.dispose();
  // The last registration's disposer may have removed its empty maps.
  owners.set(moduleId, keys);
  bindings.set(renderedRoot, owners);

  const messageId = message.id;
  const pending = new WeakSet();
  const listeners = new Map();
  let active = true;

  const dispose = () => {
    if (!active) return false;
    active = false;
    for (const [event, listener] of listeners) renderedRoot.removeEventListener(event, listener);
    listeners.clear();
    if (keys.get(key)?.dispose === dispose) keys.delete(key);
    if (!keys.size && owners.get(moduleId) === keys) owners.delete(moduleId);
    if (!owners.size && bindings.get(renderedRoot) === owners) bindings.delete(renderedRoot);
    return true;
  };
  const current = () => {
    if (!active || renderedRoot.isConnected === false) return null;
    const user = globalThis.game?.user;
    const document = globalThis.game?.messages?.get(messageId);
    // visible alone includes concealed roll cards. Content access is required as well.
    if (!user || !document || document.visible !== true || document.isContentVisible !== true) return null;
    return { message: document, user };
  };
  const report = (error, context) => {
    if (!active) return;
    try {
      const result = onError?.(error, context);
      if (!onError) console.error(`${moduleId} | Chat action failed`, error);
      if (result?.then) void Promise.resolve(result).catch((failure) => {
        console.error(`${moduleId} | Chat action error handler failed`, failure);
      });
    } catch (failure) { console.error(`${moduleId} | Chat action error handler failed`, failure); }
  };
  const matchesCurrent = (context, revision, role) => {
    const fresh = current();
    return Boolean(fresh && fresh.message === context.message && fresh.user === context.user
      && fresh.message._stats?.modifiedTime === revision && fresh.user.role === role);
  };
  const execute = (action, event, element) => {
    event.preventDefault();
    if (pending.has(element) || element.disabled || element.getAttribute?.("aria-disabled") === "true") return;
    const fresh = current();
    if (!fresh) return;
    const context = { ...fresh, event, element, control: element, root: renderedRoot };
    const revision = context.message._stats?.modifiedTime;
    const role = context.user.role;
    const complete = () => pending.delete(element);
    const fail = (error) => { complete(); report(error, context); };
    const invoke = (authorized) => {
      if (authorized !== true || !matchesCurrent(context, revision, role) || !renderedRoot.contains(element)
        || element.disabled || element.getAttribute?.("aria-disabled") === "true") return;
      return action.handle(context);
    };
    pending.add(element);
    try {
      const authorization = action.authorize(context);
      if (authorization?.then) {
        void Promise.resolve(authorization).then(invoke).then(complete, fail);
      } else {
        // Local UI actions with synchronous authorization retain synchronous behavior.
        const result = invoke(authorization);
        if (result?.then) void Promise.resolve(result).then(complete, fail);
        else complete();
      }
    } catch (error) { fail(error); }
  };

  for (const eventName of new Set(descriptors.map((action) => action.event))) {
    const listener = (event) => {
      if (!active) return;
      try {
        const target = event.target?.nodeType === 3 ? event.target.parentElement : event.target;
        for (const action of descriptors) {
          if (action.event !== eventName) continue;
          const element = target?.closest?.(action.selector);
          if (!element || !renderedRoot.contains(element)) continue;
          execute(action, event, element);
          break;
        }
      } catch (error) { report(error, { moduleId, key, messageId, event, root: renderedRoot }); }
    };
    listeners.set(eventName, listener);
    renderedRoot.addEventListener(eventName, listener);
  }
  keys.set(key, { dispose });
  return dispose;
}

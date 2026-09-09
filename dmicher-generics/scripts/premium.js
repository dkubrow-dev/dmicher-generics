const PROTOCOL_VERSION = 1;
const validModuleId = (id) => typeof id === "string" && /^dmicher-[a-z0-9-]+$/.test(id);
const validMethod = (name) => typeof name === "string" && /^[a-zA-Z][a-zA-Z0-9_.-]*$/.test(name);
const validVersion = (version) => Number.isSafeInteger(version) && version > 0;

function synchronous(value) {
  if (value && typeof value.then === "function") {
    Promise.resolve(value).catch(() => undefined);
    throw new TypeError("Premium value methods and access checks must be synchronous.");
  }
  return value;
}

/**
 * Optional bridge for pure, synchronous method overrides. No licence policy,
 * target-module imports, domain configuration or arbitrary object patching.
 * Commands with side effects must not use invoke's automatic base fallback.
 */
export function createPremiumBridge({
  setTimer = (callback, delay) => globalThis.setTimeout(callback, delay),
  clearTimer = (timer) => globalThis.clearTimeout(timer)
} = {}) {
  let provider = null;
  const listeners = new Set();

  function fail(record, key) {
    if (provider !== record || record.failed.has(key)) return;
    record.failed.add(key);
    console.warn(`dmicher-generics | Premium extension unavailable for ${key}; using base methods.`);
  }

  function notify() {
    for (const entry of [...listeners]) {
      if (!listeners.has(entry)) continue;
      try { entry.listener(entry.status()); }
      catch { console.warn("dmicher-generics | Premium change listener failed."); }
    }
  }

  function registerProvider(next) {
    if (provider) throw new Error("A Premium provider is already registered.");
    if (next?.apiVersion !== PROTOCOL_VERSION || typeof next.hasAccess !== "function"
      || !Array.isArray(next.extensions)
      || (next.openSettings !== undefined && typeof next.openSettings !== "function")
      || (next.readyPromise !== undefined && typeof next.readyPromise?.then !== "function")) {
      throw new TypeError("Expected Premium bridge API 1, an access check and extension descriptors.");
    }
    const extensions = new Map();
    for (const descriptor of next.extensions) {
      if (!validModuleId(descriptor?.moduleId) || !validVersion(descriptor.apiVersion)
        || !descriptor.methods || typeof descriptor.methods !== "object") {
        throw new TypeError("Expected a versioned dmicher extension descriptor.");
      }
      const methods = Object.entries(descriptor.methods);
      if (!methods.length || methods.some(([name, method]) => !validMethod(name) || typeof method !== "function")) {
        throw new TypeError("Extension methods must be named functions.");
      }
      if (extensions.has(descriptor.moduleId)) throw new Error(`Duplicate Premium target: ${descriptor.moduleId}`);
      extensions.set(descriptor.moduleId, { apiVersion: descriptor.apiVersion, methods: new Map(methods) });
    }
    // Copy the contract so later edits of the caller's descriptor do not replace methods.
    const record = {
      extensions, failed: new Set(), hasAccess: next.hasAccess.bind(next),
      openSettings: next.openSettings?.bind(next), ready: null, waiting: new Map(), detach: null
    };
    if (next.readyPromise) record.ready = Promise.resolve(next.readyPromise).then(() => undefined, () => undefined);
    const detached = new Promise((resolve) => { record.detach = resolve; });
    record.wait = (key, timeoutMs) => {
      if (!record.ready) return Promise.resolve();
      if (!record.waiting.has(key)) {
        let timer;
        const waiting = Promise.race([
          record.ready, detached,
          new Promise((resolve) => { timer = setTimer(resolve, timeoutMs); })
        ]).finally(() => clearTimer(timer));
        record.waiting.set(key, waiting);
      }
      return record.waiting.get(key);
    };
    provider = record;
    notify();
    return Object.freeze({
      notifyChanged() {
        if (provider !== record) return false;
        record.failed.clear();
        notify();
        return true;
      },
      dispose() {
        if (provider !== record) return false;
        provider = null;
        record.detach();
        notify();
        return true;
      }
    });
  }

  function forModule(moduleId, { apiVersion = 1, methods = [] } = {}) {
    if (!validModuleId(moduleId) || !validVersion(apiVersion) || !Array.isArray(methods)
      || !methods.length || methods.some((name) => !validMethod(name))) {
      throw new TypeError("Expected a dmicher target, a contract version and required method names.");
    }
    const required = new Set(methods);
    const key = `${moduleId}@${apiVersion}`;
    function getStatus() {
      const record = provider;
      const extension = record?.extensions.get(moduleId);
      const compatible = Boolean(extension?.apiVersion === apiVersion
        && [...required].every((name) => extension.methods.has(name)));
      let active = false;
      if (compatible && !record.failed.has(key)) {
        try { active = synchronous(record.hasAccess(moduleId)) === true && provider === record; }
        catch { fail(record, key); }
      }
      return {
        apiVersion: PROTOCOL_VERSION, available: Boolean(record), compatible, active,
        settingsAvailable: typeof record?.openSettings === "function"
      };
    }
    return Object.freeze({
      getStatus,
      invoke(method, args, base, validateResult = () => true) {
        if (!required.has(method) || !Array.isArray(args) || typeof base !== "function"
          || typeof validateResult !== "function") {
          throw new TypeError("Expected a declared method, arguments, a base function and a result validator.");
        }
        // The consumer supplies a pure base method producing independent values.
        // Capture its result before the optional implementation can fail.
        const fallback = synchronous(base(...args));
        if (synchronous(validateResult(fallback)) !== true) throw new TypeError("Invalid base method result.");
        const record = provider;
        if (!getStatus().active || provider !== record) return fallback;
        try {
          const result = synchronous(record.extensions.get(moduleId).methods.get(method)(base, ...args));
          if (synchronous(validateResult(result)) !== true) throw new TypeError("Invalid Premium method result.");
          return result;
        } catch {
          fail(record, key);
          notify();
          return fallback;
        }
      },
      subscribe(listener) {
        if (typeof listener !== "function") throw new TypeError("Expected a Premium change listener.");
        const entry = { listener, status: getStatus };
        listeners.add(entry);
        return () => listeners.delete(entry);
      },
      waitUntilReady(timeoutMs = 50_000) {
        if (!Number.isFinite(timeoutMs) || timeoutMs < 0) throw new TypeError("Expected a non-negative ready timeout.");
        return provider?.wait(key, timeoutMs) ?? Promise.resolve();
      },
      openSettings() {
        // This is an explicit command. The provider enforces GM permissions;
        // errors propagate and no alternate command is retried.
        return provider?.openSettings?.() ?? null;
      }
    });
  }

  return Object.freeze({ apiVersion: PROTOCOL_VERSION, registerProvider, forModule,
    // Informational access status only: the optional provider owns every licence decision.
    getAccessStatus(moduleId) {
      if (!validModuleId(moduleId)) throw new TypeError("Expected a dmicher target.");
      const record = provider;
      let active = false;
      try { active = Boolean(record && synchronous(record.hasAccess(moduleId)) === true && record === provider); }
      catch { /* A failed optional status check must not claim paid access. */ }
      return { available: Boolean(record), active };
    },
    waitUntilReady(timeoutMs = 50_000) {
      if (!Number.isFinite(timeoutMs) || timeoutMs < 0) throw new TypeError("Expected a non-negative ready timeout.");
      return provider?.wait("family-status", timeoutMs) ?? Promise.resolve();
    }
  });
}

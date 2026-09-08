/** Local discovery. Every exported action must enforce its own permissions. */
export function createModuleRegistry({ onChange = () => {} } = {}) {
  const records = new Map();
  const notify = (event, record) => {
    try { onChange(event, record); }
    catch (error) { console.warn("dmicher-generics | Module registry listener failed", error); }
  };
  return Object.freeze({
    register(moduleId, { apiVersion, api, capabilities = [] }) {
      if (!/^dmicher-[a-z0-9-]+$/.test(moduleId)) throw new TypeError("Expected a dmicher module ID.");
      if (!Number.isSafeInteger(apiVersion) || apiVersion < 1 || !api || typeof api !== "object") {
        throw new TypeError("A positive API version and an API object are required.");
      }
      if (!Array.isArray(capabilities) || capabilities.some((key) => typeof key !== "string" || typeof api[key] !== "function")) {
        throw new TypeError("Every capability must name an API function.");
      }
      if (records.has(moduleId)) throw new Error(`Module API already registered: ${moduleId}`);
      const record = Object.freeze({ moduleId, apiVersion, api, capabilities: Object.freeze([...new Set(capabilities)]) });
      records.set(moduleId, record);
      notify("registered", record);
      return () => {
        if (records.get(moduleId) !== record) return false;
        records.delete(moduleId);
        notify("unregistered", record);
        return true;
      };
    },
    get(moduleId, { apiVersion = 1 } = {}) {
      const record = records.get(moduleId);
      return record?.apiVersion === apiVersion ? record.api : null;
    },
    list() {
      return Array.from(records.values(), ({ moduleId, apiVersion, capabilities }) => ({
        moduleId, apiVersion, capabilities: [...capabilities]
      }));
    }
  });
}

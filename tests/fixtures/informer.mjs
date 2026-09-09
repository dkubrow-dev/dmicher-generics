export function installInformerWorld() {
  let sequence = 0;
  const settings = new Map(), hooks = new Map(), created = { User: [], Actor: [], Folder: [], ChatMessage: [] };
  const makeDocument = (data, collection) => ({ ...structuredClone(data), id: data._id ?? `doc${++sequence}`,
    getFlag(namespace, key) { return this.flags?.[namespace]?.[key]; },
    async setFlag(namespace, key, value) { return this.update({ [`flags.${namespace}.${key}`]: value }); },
    async update(changes, options = {}) {
      for (const [name, value] of Object.entries(changes)) {
        let target = this; const parts = name.split('.');
        for (const part of parts.slice(0, -1)) target = target[part] ??= {};
        target[parts.at(-1)] = structuredClone(value);
      }
      return this;
    },
    async delete() { collection.delete(this.id); },
    canUserModify() { return Number(game.user?.role) === 4; }, visible: true, isContentVisible: true
  });
  globalThis.game = { users: new Map(), actors: new Map(), folders: new Map(), messages: new Map(),
    modules: new Map([['dmicher-generics', { id: 'dmicher-generics', active: true, title: 'dmicher Generics', version: '1.0.0' }]]),
    i18n: { lang: 'en' }, documentTypes: { Actor: ['npc'] }, socket: { on() {}, off() {}, emit() {} },
    settings: { register(namespace, key, config) { if (!settings.has(`${namespace}.${key}`)) settings.set(`${namespace}.${key}`, config.default); },
      get(namespace, key) { return settings.get(`${namespace}.${key}`); },
      async set(namespace, key, value) { settings.set(`${namespace}.${key}`, structuredClone(value)); } }
  };
  globalThis.CONST = { USER_PERMISSIONS: { ACTOR_CREATE: {}, MESSAGE_WHISPER: {}, FILES_UPLOAD: {} } };
  globalThis.foundry = { utils: { randomID: () => `randomId${++sequence}` } };
  globalThis.CONFIG = {};
  for (const [name, collection] of [['User', game.users], ['Actor', game.actors], ['Folder', game.folders], ['ChatMessage', game.messages]]) {
    CONFIG[name] = { documentClass: { async create(data) {
      const document = makeDocument(data, collection); collection.set(document.id, document); created[name].push(document); return document;
    } } };
  }
  const gm = makeDocument({ _id: 'gm', name: 'GM', active: true, role: 4, isGM: true }, game.users);
  const player = makeDocument({ _id: 'player', name: 'Player', active: true, role: 1, isGM: false }, game.users);
  game.users.set(gm.id, gm); game.users.set(player.id, player); game.user = gm;
  globalThis.Hooks = {
    on(name, handler) { if (!hooks.has(name)) hooks.set(name, new Set()); hooks.get(name).add(handler); return handler; },
    off(name, handler) { hooks.get(name)?.delete(handler); }
  };
  const emit = (name, ...args) => { for (const handler of hooks.get(name) ?? []) handler(...args); };
  return { gm, player, settings, hooks, created, emit, makeDocument };
}

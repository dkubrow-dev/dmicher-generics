import test from 'node:test';
import assert from 'node:assert/strict';
import { createInformerController } from '../dmicher-generics/scripts/chat/informer.js';
import { createWelcomeController } from '../dmicher-generics/scripts/welcome.js';
import { createPremiumBridge } from '../dmicher-generics/scripts/premium.js';
import { createModuleRegistry } from '../dmicher-generics/scripts/registry.js';
import { buildWelcomeContent } from '../dmicher-generics/scripts/welcome-content.js';
import { installInformerWorld } from './fixtures/informer.mjs';

function setup() {
  const f = installInformerWorld(), informer = createInformerController(); informer.registerSettings();
  const premium = createPremiumBridge(), modules = createModuleRegistry();
  const makeWelcome = () => {
    const welcome = createWelcomeController({ informer: informer.api, premium, modules, appearance: { openHelp() {} }, help: { bindSettingHelp() {} } });
    welcome.registerSettings(); return welcome;
  };
  return { ...f, informer, premium, modules, makeWelcome };
}
const drain = async (welcome) => { await Promise.all([...game.users.values()].map(user => welcome.send(user))); await new Promise(resolve => setImmediate(resolve)); };

test('welcome covers late login and reload exactly once per user session, without replay on GM reconnect', async () => {
  const f = setup(), welcome = f.makeWelcome();
  await welcome.activate(); await drain(welcome);
  assert.equal(game.messages.size, 1); assert.equal([...game.messages.values()][0].whisper[0], f.gm.id);
  await f.player.setFlag('dmicher-generics', 'welcomeSession', 'playerSession1');
  const changed = { 'flags.dmicher-generics.welcomeSession': 'playerSession1' };
  f.emit('updateUser', f.player, changed, {}, f.player.id); f.emit('updateUser', f.player, changed, {}, f.player.id);
  await drain(welcome); assert.equal(game.messages.size, 2);
  welcome.dispose(); const reconnected = f.makeWelcome(); await reconnected.activate(); await drain(reconnected);
  assert.equal(game.messages.size, 3, 'Only the reconnecting GM receives a new welcome');
  assert.equal([...game.messages.values()].filter(message => message.whisper.includes(f.player.id)).length, 1);
  await f.player.setFlag('dmicher-generics', 'welcomeSession', 'playerSession2');
  f.emit('updateUser', f.player, { 'flags.dmicher-generics.welcomeSession': 'playerSession2' }, {}, f.player.id);
  await drain(reconnected); assert.equal(game.messages.size, 4);
  reconnected.dispose(); f.informer.dispose();
});

test('welcome uses active modules and registered help, waits for Premium and receives only provider access decisions', async () => {
  const f = setup(), welcome = f.makeWelcome(); let ready;
  game.modules.set('dmicher-alpha', { id: 'dmicher-alpha', active: true, title: '<Unsafe title>', version: '2.3' });
  game.modules.set('dmicher-off', { id: 'dmicher-off', active: false, title: 'Off', version: '1' });
  game.modules.set('dmicherAddon', { id: 'dmicherAddon', active: true, title: 'Unregistered module', version: '8' });
  f.modules.register('dmicher-alpha', { apiVersion: 1, api: { openHelp() {} }, capabilities: ['openHelp'] });
  const provider = f.premium.registerProvider({ apiVersion: 1, readyPromise: new Promise(resolve => ready = resolve), hasAccess: id => id === 'dmicher-alpha', extensions: [] });
  await welcome.activate(); await new Promise(resolve => setImmediate(resolve)); assert.equal(game.messages.size, 0);
  ready(); await drain(welcome);
  const message = [...game.messages.values()][0];
  assert.match(message.content, /help:dmicher-alpha/); assert.match(message.content, /&lt;Unsafe title&gt;/); assert.match(message.content, /version 2.3/);
  assert.doesNotMatch(message.content, /dmicher-off/); assert.equal(message.getFlag('dmicher-generics', 'welcome').premium, true);
  assert.match(message.content, /Unregistered module/); assert.doesNotMatch(message.content, /help:dmicherAddon/);
  assert.equal(message.author, f.informer.api.get().user.id);
  assert.equal(game.users.get(message.author).getFlag('dmicher-generics', 'managedIdentity').ownerId, 'dmicher-generics');
  provider.dispose(); welcome.dispose(); f.informer.dispose();
});

test('the free world welcome setting does not depend on Premium and does not delete or disable the informer', async () => {
  const f = setup(), welcome = f.makeWelcome();
  assert.equal(game.settings.get('dmicher-generics', 'showWelcome'), true);
  await game.settings.set('dmicher-generics', 'showWelcome', false);
  await welcome.activate(); await drain(welcome); assert.equal(game.messages.size, 0);
  await f.informer.activate(); assert.ok(f.informer.api.get().user);
  await game.settings.set('dmicher-generics', 'showWelcome', true); await drain(welcome);
  const data = [...game.messages.values()][0].getFlag('dmicher-generics', 'welcome'); assert.equal(data.premium, false);
  welcome.dispose(); f.informer.dispose();
});

test('welcome does not deliver as a player, to offline users, or twice through a second GM', async () => {
  const f = setup(), welcome = f.makeWelcome();
  await welcome.activate(); await drain(welcome); const count = game.messages.size;
  await f.player.setFlag('dmicher-generics', 'welcomeSession', 'playerSession1'); f.player.active = false;
  await welcome.send(f.player); assert.equal(game.messages.size, count);
  f.player.active = true; game.user = f.player;
  await welcome.send(f.player); assert.equal(game.messages.size, count);
  const other = f.makeDocument({ _id: 'second-gm', role: 4, active: true }, game.users); game.users.set(other.id, other); game.user = other;
  await welcome.send(f.player); assert.equal(game.messages.size, count);
  game.user = f.gm; await welcome.send(f.player); assert.equal(game.messages.size, count + 1);
  welcome.dispose(); f.informer.dispose();
});

test('greeting text is RU/EN, escapes module data and limits the subscription link to free GMs', () => {
  installInformerWorld(); const modules = [{ id: 'dmicher-alpha', title: '<Title>', version: '1', help: true }];
  for (const language of ['en', 'ru']) {
    game.i18n.lang = language;
    const gm = buildWelcomeContent({ modules, gm: true, premium: false }), player = buildWelcomeContent({ modules, gm: false, premium: false });
    assert.match(gm, /https:\/\/boosty.to\/dmicher/); assert.doesNotMatch(player, /boosty/); assert.match(gm, /&lt;Title&gt;/);
    assert.match(gm, /data-dmicher-chat-action="settings"/); assert.match(player, /data-dmicher-chat-action="settings"/);
    assert.doesNotMatch(buildWelcomeContent({ modules, gm: true, premium: true }), /boosty/);
  }
});

test('missing, throwing or asynchronous Premium checks never claim licensed access', () => {
  const bridge = createPremiumBridge(); assert.deepEqual(bridge.getAccessStatus('dmicher-alpha'), { available: false, active: false });
  for (const hasAccess of [() => { throw Error('Unavailable'); }, async () => true, () => 'yes']) {
    const provider = bridge.registerProvider({ apiVersion: 1, hasAccess, extensions: [] });
    assert.equal(bridge.getAccessStatus('dmicher-alpha').active, false); provider.dispose();
  }
});

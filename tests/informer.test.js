import test from 'node:test';
import assert from 'node:assert/strict';
import { createInformerController } from '../dmicher-generics/scripts/chat/informer.js';
import { installInformerWorld } from './fixtures/informer.mjs';

test('one Generics informer serves two consumers with private independent message ownership', async () => {
  const f = installInformerWorld(), controller = createInformerController(); controller.registerSettings();
  const a = controller.api.createMessageService({ ownerId: 'dmicher-alpha', channel: 'events' });
  const b = controller.api.createMessageService({ ownerId: 'dmicher-beta', channel: 'polls' });
  await Promise.all([a.create({ content: 'A' }, { audience: { type: 'users', userIds: [f.player.id] }, key: 'one' }),
    b.create({ content: 'B' }, { audience: { type: 'gms' }, key: 'one' })]);
  assert.deepEqual(Object.fromEntries(Object.entries(f.created).map(([key, value]) => [key, value.length])), { User: 1, Actor: 1, Folder: 2, ChatMessage: 2 });
  const current = controller.api.get();
  assert.equal(current.folder.name, 'generic'); assert.equal(game.folders.get(current.folder.folder).name, 'dmicher modules');
  assert.equal(current.actor.folder, current.folder.id); assert.deepEqual(current.actor.ownership, { default: 0 });
  assert.equal(current.user.role, 1); assert.equal(current.user.character, current.actor.id);
  assert.deepEqual(current.user.permissions, { ACTOR_CREATE: false, MESSAGE_WHISPER: true, FILES_UPLOAD: false });
  assert.notEqual(current.user.password, 'infobot');
  assert.deepEqual(a.find().map(message => message.whisper), [[f.player.id]]);
  assert.deepEqual(b.find().map(message => message.whisper), [[f.gm.id]]);
  assert.equal(a.find()[0].author, b.find()[0].author);
  await a.create({ content: 'A' }, { audience: { type: 'users', userIds: [f.player.id] }, key: 'one' });
  assert.equal(f.created.ChatMessage.length, 2);
  await game.settings.set('dmicher-generics', 'showWelcome', false);
  await b.create({ content: 'Still works' }, { audience: { type: 'gms' } });
  assert.equal(f.created.ChatMessage.length, 3); controller.dispose();
});

test('the shared informer never adopts old Spotlight or same-name human documents', async () => {
  const f = installInformerWorld();
  const old = await CONFIG.User.documentClass.create({ _id: 'old', name: 'Informer', role: 2,
    flags: { 'dmicher-spotlight-tools': { informerIdentity: true } } });
  const snapshot = structuredClone({ name: old.name, role: old.role, flags: old.flags });
  const controller = createInformerController(); controller.registerSettings(); await controller.activate();
  assert.notEqual(controller.api.get().user.id, old.id); assert.equal(controller.api.get().user.name, 'Informer (2)');
  assert.deepEqual({ name: old.name, role: old.role, flags: old.flags }, snapshot); controller.dispose();
});

test('empty private audiences and players never create informer documents or send impersonated messages', async () => {
  const f = installInformerWorld(), controller = createInformerController(); controller.registerSettings();
  const service = controller.api.createMessageService({ ownerId: 'dmicher-alpha', channel: 'events' });
  assert.deepEqual(await service.create({ content: 'Nobody' }, { audience: { type: 'users', userIds: [] } }), []);
  assert.equal(f.created.User.length, 0); game.user = f.player;
  await assert.rejects(service.create({ content: 'Fake' }, { audience: { type: 'gms' } }), /Only a GM/);
  assert.equal(f.created.User.length, 0); controller.dispose();
});

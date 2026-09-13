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

for (const [language, defaultName, customName] of [['ru', 'Информатор', 'Глашатай таверны'], ['en', 'Informer', 'Tavern Herald']]) {
  test(`${language}: actor chat names survive reconnect independently of a suffixed technical login`, async () => {
    const f = installInformerWorld({ language });
    const human = await CONFIG.User.documentClass.create({ _id: 'occupied', name: defaultName, role: 1 });
    const humanActor = await CONFIG.Actor.documentClass.create({ _id: 'human-actor', name: defaultName, ownership: { default: 2 } });
    const snapshots = [human, humanActor].map(document => JSON.stringify(document));
    let controller = createInformerController();
    controller.registerSettings();
    await controller.activate();
    const { actor, user } = controller.api.get();
    assert.notEqual(actor.id, humanActor.id);
    assert.equal(actor.name, defaultName);
    assert.equal(actor.prototypeToken.name, defaultName);
    assert.equal(user.name, `${defaultName} (2)`);

    // Reproduce both correcting the old suffix and choosing a campaign-specific name.
    await actor.update({ name: `${defaultName} (2)` });
    for (const name of [defaultName, customName]) {
      await actor.update({ name });
      controller.dispose();
      controller = createInformerController();
      controller.registerSettings();
      await controller.activate();
      const service = controller.api.createMessageService({ ownerId: 'dmicher-spotlight-tools', channel: 'technical' });
      const [message] = await service.create(({ informer }) => {
        assert.equal(informer.actor.name, name);
        return { content: 'Status update' };
      }, { audience: { type: 'gms' } });
      assert.equal(controller.api.get().actor, actor);
      assert.equal(actor.name, name);
      assert.equal(user.name, `${defaultName} (2)`);
      assert.equal(message.author, user.id);
      assert.equal(message.speaker.actor, actor.id);
      assert.equal(message.speaker.alias, name);
    }
    assert.deepEqual([human, humanActor].map(document => JSON.stringify(document)), snapshots);
    assert.equal(f.created.User.length, 2);
    assert.equal(f.created.Actor.length, 2);
    controller.dispose();
  });

  test(`${language}: replacing a deleted informer actor uses the default without copying the login suffix`, async () => {
    const f = installInformerWorld({ language });
    await CONFIG.User.documentClass.create({ _id: 'occupied', name: defaultName, role: 1 });
    let controller = createInformerController();
    controller.registerSettings();
    await controller.activate();
    const original = controller.api.get();
    await original.actor.update({ name: `${defaultName} (2)` });
    await original.actor.delete();
    controller.dispose();
    controller = createInformerController();
    controller.registerSettings();
    await controller.activate();
    const restored = controller.api.get();
    assert.notEqual(restored.actor, original.actor);
    assert.equal(restored.actor.id, original.actor.id);
    assert.equal(restored.actor.name, defaultName);
    assert.equal(restored.actor.prototypeToken.name, defaultName);
    assert.equal(restored.user, original.user);
    assert.equal(restored.user.name, `${defaultName} (2)`);
    assert.equal(restored.user.character, restored.actor.id);
    assert.deepEqual(restored.actor.ownership, { default: 0 });
    const service = controller.api.createMessageService({ ownerId: 'dmicher-master-screen', channel: 'events' });
    const [message] = await service.create({ content: 'Status update' }, { audience: { type: 'gms' } });
    assert.equal(message.speaker.alias, defaultName);
    assert.equal(f.created.User.length, 2);
    assert.equal(f.created.Actor.length, 2);
    controller.dispose();
  });
}

test('a locale change does not translate the GM actor name; recreation uses the active default language', async () => {
  installInformerWorld();
  const controller = createInformerController();
  controller.registerSettings();
  await controller.activate();
  const original = controller.api.get();
  await original.actor.update({ name: 'Town Herald' });
  game.i18n.lang = 'ru';
  await controller.activate();
  assert.equal(original.actor.name, 'Town Herald');
  await original.actor.delete();
  await controller.activate();
  assert.equal(controller.api.get().actor.name, 'Информатор');
  assert.equal(controller.api.get().user.name, 'Informer');
  controller.dispose();
});

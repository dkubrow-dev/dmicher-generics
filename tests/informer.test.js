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

test('provided NPC attribution keeps the managed informer author and ordinary chat delivery', async () => {
  const f = installInformerWorld(), controller = createInformerController(); controller.registerSettings();
  const npc = await CONFIG.Actor.documentClass.create({ _id: 'npc', name: 'Innkeeper', ownership: { default: 2 } });
  const snapshot = JSON.stringify(npc);
  const service = controller.api.createMessageService({ ownerId: 'dmicher-master-screen', channel: 'dialogues' });
  const [message] = await service.create(({ informer }) => ({ author: f.player.id, content: '<p>Welcome</p>',
    speaker: { actor: npc, token: 'token-npc', scene: 'scene', alias: npc.name },
    flags: { 'dmicher-master-screen': { dialogue: { sessionId: 'session', sourceUserId: informer.user.id } } }
  }), { speakerMode: 'provided', technical: false, audience: { type: 'users', userIds: [f.gm.id, f.player.id] }, key: 'page-1' });
  assert.equal(message.author, controller.api.get().user.id); assert.notEqual(message.author, f.player.id);
  assert.deepEqual(message.speaker, { actor: npc.id, token: 'token-npc', scene: 'scene', alias: npc.name });
  assert.equal(message.getFlag('dmicher-generics', 'chat').technical, false);
  assert.deepEqual(message.whisper, [f.gm.id, f.player.id]);
  assert.equal(JSON.stringify(npc), snapshot, 'real NPC identity and permissions are never managed');
  assert.equal(service.find({ key: 'page-1' })[0], message);
  await service.update(message.id, { content: '<p>Replied</p>', moduleFlags: { dialogue: { sessionId: 'session', finished: true } } });
  assert.equal(message.content, '<p>Replied</p>'); assert.equal(message.getFlag('dmicher-master-screen', 'dialogue').finished, true);
  assert.equal(message.author, controller.api.get().user.id); assert.equal(message.speaker.actor, npc.id);
  controller.dispose();
});

test('default informer attribution stays technical and cannot be replaced through message data', async () => {
  const f = installInformerWorld(), controller = createInformerController(); controller.registerSettings();
  const service = controller.api.createMessageService({ ownerId: 'dmicher-alpha', channel: 'events' });
  const [message] = await service.create({ author: f.player.id, speaker: { actor: 'other', alias: 'Other' }, content: 'Notice' }, { audience: { type: 'gms' } });
  const informer = controller.api.get();
  assert.equal(message.author, informer.user.id); assert.equal(message.speaker.actor, informer.actor.id);
  assert.equal(message.speaker.alias, informer.actor.name); assert.equal(message.getFlag('dmicher-generics', 'chat').technical, true);
  controller.dispose();
});

test('provided attribution rejects missing speakers and unsupported modes instead of substituting the informer', async () => {
  const f = installInformerWorld(), controller = createInformerController(); controller.registerSettings();
  const service = controller.api.createMessageService({ ownerId: 'dmicher-alpha', channel: 'events' });
  for (const speaker of [undefined, null, 'actor-id', []]) {
    await assert.rejects(service.create({ speaker, content: 'Invalid' }, { speakerMode: 'provided', audience: { type: 'gms' } }), /explicit speaker object/);
  }
  await assert.rejects(service.create({ content: 'Invalid' }, { speakerMode: 'automatic', audience: { type: 'gms' } }), /speaker mode/);
  assert.equal(f.created.ChatMessage.length, 0);
  game.user = f.player;
  await assert.rejects(service.create({ speaker: { alias: 'NPC' }, content: 'Invalid' }, { speakerMode: 'provided', technical: false, audience: { type: 'gms' } }), /Only a GM/);
  controller.dispose();
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

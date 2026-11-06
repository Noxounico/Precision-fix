import test from 'node:test';
import assert from 'node:assert/strict';
import { Collection, PermissionsBitField, PermissionFlagsBits as P } from 'discord.js';
import { handleNotifications, notificationRole } from '../src/notifications.js';
const guildId = '1560784472083800298', roleId = '1568356000000000001';
function setup() {
  const state = { version: 1, accounts: {} }, config = { guild: guildId, role: null };
  const added = [], removed = [], logs = [], replies = [], created = [];
  const role = { id: roleId, managed: false, editable: true, mentionable: true, permissions: new PermissionsBitField() };
  const cache = new Collection();
  const guild = { id: guildId, roles: { fetch: async () => role, create: async data => { created.push(data); return role; } },
    members: { me: { permissions: new PermissionsBitField(P.ManageRoles) }, fetch: async () => ({ roles: { cache,
      add: async id => { added.push(id); cache.set(id, role); }, remove: async id => { removed.push(id); cache.delete(id); } } }) } };
  const interaction = { guildId, guild, isChatInputCommand: () => true, commandName: 'notifyon', user: { id: 'user' },
    deferReply: async () => {}, editReply: async text => replies.push(text), reply: async text => replies.push(text) };
  const audit = { notifyOn: async (...args) => logs.push(args) };
  return { state, config, interaction, role, added, removed, logs, replies, created, audit };
}
test('notifyon cria cargo sem privilégios, adere uma vez e notifyoff cancela; todos geram log', async () => {
  const f = setup();
  const persist = async () => {};
  await handleNotifications(f.interaction, f.config, f.state, persist, f.audit);
  await handleNotifications(f.interaction, f.config, f.state, persist, f.audit);
  assert.deepEqual(f.created[0].permissions, []); assert.equal(f.created[0].mentionable, true);
  assert.equal(f.created.length, 1); assert.deepEqual(f.added, [roleId]);
  assert.equal(f.state.notificationRoles[guildId], roleId);
  f.interaction.commandName = 'notifyoff';
  await handleNotifications(f.interaction, f.config, f.state, persist, f.audit);
  assert.deepEqual(f.removed, [roleId]); assert.equal(f.logs.length, 3);
});
test('cargo com privilégios, gerido ou acima do bot nunca é atribuído', async () => {
  for (const patch of [{ permissions: new PermissionsBitField(P.Administrator) }, { managed: true }, { editable: false }, { mentionable: false }]) {
    const f = setup(); Object.assign(f.role, patch); f.config.role = roleId;
    await handleNotifications(f.interaction, f.config, f.state, async () => {}, f.audit);
    assert.equal(f.added.length, 0); assert.match(f.replies[0], /Não consegui/);
  }
});
test('notifyoff sem adesões não cria cargo; persistência e concorrência não duplicam cargos', async () => {
  const f = setup();
  assert.equal(await notificationRole(f.interaction.guild, f.config, f.state, async () => {}, false), null);
  await Promise.all([notificationRole(f.interaction.guild, f.config, f.state, async () => {}, true), notificationRole(f.interaction.guild, f.config, f.state, async () => {}, true)]);
  assert.equal(f.created.length, 1);
  const g = setup();
  await assert.rejects(notificationRole(g.interaction.guild, g.config, g.state, async () => { throw Error('disk'); }, true));
  await notificationRole(g.interaction.guild, g.config, g.state, async () => {}, true);
  assert.equal(g.created.length, 1);
});
test('sem Gerir cargos não atribui; falha do log não desfaz uma adesão válida', async t => {
  const f = setup(); f.interaction.guild.members.me.permissions = new PermissionsBitField();
  await handleNotifications(f.interaction, f.config, f.state, async () => {}, f.audit);
  assert.equal(f.created.length, 0); assert.equal(f.added.length, 0);
  const g = setup();
  const logger = t.mock.method(console, 'error', () => {});
  g.audit.notifyOn = async () => { throw Error('log unavailable'); };
  await handleNotifications(g.interaction, g.config, g.state, async () => {}, g.audit);
  assert.deepEqual(g.added, [roleId]);
  assert.match(g.replies[0], /Ativou/);
  assert.equal(logger.mock.callCount(), 1);
});

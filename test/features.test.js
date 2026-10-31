import test from 'node:test';
import assert from 'node:assert/strict';
import { Collection, PermissionFlagsBits as P, PermissionsBitField } from 'discord.js';
import { awardXp, handleXp, leaderboard, levelInfo } from '../src/xp.js';
import { handleTickets } from '../src/tickets.js';
import { registerCommands } from '../src/commands.js';
import { loadState, saveState } from '../src/state.js';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const config = { guild: '123', ticketSupportRoles: [] };
const perms = (...bits) => new PermissionsBitField(bits);
test('XP: cooldown por membro, bots/webhooks/outro servidor ignorados e persistência', async () => {
  const file = join(await mkdtemp(join(tmpdir(), 'xp-')), 'state.json');
  const state = await loadState(file);
  const msg = { guildId: '123', author: { id: 'user', bot: false }, createdTimestamp: 100000 };
  const award = m => awardXp(m, config, state, s => saveState(file, s));
  assert.equal(await award(msg), true);
  assert.equal(await award({ ...msg, createdTimestamp: 100001 }), false);
  assert.equal(await award({ ...msg, createdTimestamp: 160000 }), true);
  for (const patch of [{ guildId: 'other' }, { author: { id: 'bot', bot: true } }, { webhookId: 'hook' }]) {
    assert.equal(await award({ ...msg, ...patch }), false);
  }
  const restored = await loadState(file);
  assert.deepEqual(restored.xp['123'].user, { xp: 30, lastAwardAt: 160000 });
  assert.equal(await awardXp({ ...msg, createdTimestamp: 160001 }, config, restored, async () => assert.fail()), false);
  assert.deepEqual(levelInfo(100), { level: 1, next: 400 });
});
test('/rank e /top leem o XP real, ordenam e não enviam pings', async () => {
  const state = { xp: { '123': { a: { xp: 300 }, b: { xp: 1200 } } } };
  assert.deepEqual(leaderboard(state, '123').map(([id]) => id), ['b', 'a']);
  const replies = [];
  const interaction = { isChatInputCommand: () => true, commandName: 'rank', guildId: '123', user: { id: 'a' }, options: { getUser: () => null }, reply: async data => replies.push(data) };
  await handleXp(interaction, config, state);
  const rank = replies[0].embeds[0].toJSON();
  assert.equal(rank.fields[0].value, '1');
  assert.equal(rank.fields[2].value, '#2');
  interaction.commandName = 'top';
  await handleXp(interaction, config, state);
  assert.match(replies[1].embeds[0].toJSON().description, /^\*\*1\.\*\* <@b>/);
  assert.deepEqual(replies[1].allowedMentions.parse, []);
});
function ticketInteraction(overrides = {}) {
  const calls = { replies: [], edits: [], creates: [], sends: [], overwrites: [], channelEdits: [] };
  const channel = { id: 'ticket', topic: 'precision-ticket:456',
    send: async data => calls.sends.push(data),
    permissionOverwrites: { edit: async (...args) => calls.overwrites.push(args) },
    edit: async data => calls.channelEdits.push(data),
  };
  const me = { id: 'bot', permissions: perms(P.ManageChannels, P.ManageRoles) };
  const guild = { id: '123', members: { fetchMe: async () => me, fetch: async () => ({ roles: { cache: new Collection() } }) },
    channels: { fetch: async () => new Collection(), create: async data => { calls.creates.push(data); return channel; } },
  };
  return { calls, guild, channel, guildId: '123', channelId: 'ticket', user: { id: '456' },
    isChatInputCommand: () => false, isButton: () => true, customId: 'tickets:open',
    memberPermissions: perms(), appPermissions: perms(P.SendMessages, P.EmbedLinks),
    reply: async data => calls.replies.push(data), deferReply: async () => {}, editReply: async data => calls.edits.push(data),
    message: { edit: async () => {} }, ...overrides };
}
test('ticket criado é privado para everyone, com acesso do autor e do bot', async () => {
  const request = ticketInteraction();
  await handleTickets(request, config);
  const created = request.calls.creates[0];
  assert.equal(created.topic, 'precision-ticket:456');
  assert.deepEqual(created.permissionOverwrites.find(x => x.id === '123').deny, [P.ViewChannel]);
  assert(created.permissionOverwrites.find(x => x.id === '456').allow.includes(P.SendMessages));
  assert(created.permissionOverwrites.find(x => x.id === 'bot').allow.includes(P.ManageChannels));
  assert.equal(request.calls.sends[0].components[0].toJSON().components[0].custom_id, 'tickets:close');
});
test('ticket existente impede duplicação; criação concorrente só cria um canal', async () => {
  const existing = ticketInteraction();
  existing.guild.channels.fetch = async () => new Collection([['ticket', existing.channel]]);
  await handleTickets(existing, config);
  assert.equal(existing.calls.creates.length, 0);
  assert.match(existing.calls.edits[0].content, /Já tens/);
  const first = ticketInteraction();
  let release;
  first.guild.channels.fetch = () => new Promise(resolve => { release = () => resolve(new Collection()); });
  const promise = handleTickets(first, config);
  await new Promise(resolve => setImmediate(resolve));
  const second = ticketInteraction();
  await handleTickets(second, config);
  assert.match(second.calls.replies[0].content, /já está a ser aberto/);
  release(); await promise;
  assert.equal(first.calls.creates.length, 1); assert.equal(second.calls.creates.length, 0);
});
test('ticket: autor e administrador sem cargo de suporte não podem fechar', async () => {
  for (const memberPermissions of [perms(), perms(P.ManageGuild, P.Administrator)]) {
    const denied = ticketInteraction({ customId: 'tickets:close', memberPermissions });
    await handleTickets(denied, { ...config, ticketSupportRoles: ['staff'] });
    assert.match(denied.calls.replies[0].content, /Só os dois cargos/);
    assert.equal(denied.calls.overwrites.length, 0);
  }
});
test('/painel requer Gerir servidor; membro comum não publica painel', async () => {
  const denied = ticketInteraction({ isChatInputCommand: () => true, commandName: 'painel' });
  await handleTickets(denied, config);
  assert.match(denied.calls.replies[0].content, /Gerir servidor/);
  const admin = ticketInteraction({ isChatInputCommand: () => true, commandName: 'painel', memberPermissions: perms(P.ManageGuild) });
  await handleTickets(admin, config);
  assert.equal(admin.calls.replies[0].components[0].toJSON().components[0].custom_id, 'tickets:open');
});
test('regista todos os comandos e apaga registos antigos e duplicados globais deste bot', async () => {
  const edits = [], creates = [], deletes = [], globalDeletes = [];
  const guild = { commands: { fetch: async () => new Collection([['1', { id: '1', name: 'painel', type: 1 }], ['2', { id: '2', name: 'outro', type: 1 }]]),
    edit: async (id, data) => edits.push([id, data.name]), create: async data => creates.push(data.name), delete: async id => deletes.push(id) } };
  const globals = { fetch: async () => new Collection([['global', { id: 'global', name: 'painel' }]]), delete: async id => globalDeletes.push(id) };
  await registerCommands(guild, globals);
  assert.deepEqual(deletes, ['2']);
  assert.deepEqual(globalDeletes, ['global']);
  assert.deepEqual(edits, [['1', 'painel']]);
  assert.deepEqual(creates, ['divulgar', 'regras', 'rank', 'top', 'clear', 'backup', 'bckup']);
});

test('se o registo dos comandos atuais falhar, não remove os comandos antigos', async () => {
  const guild = { commands: {
    fetch: async () => new Collection([['old', { id: 'old', name: 'antigo', type: 1 }]]),
    create: async () => { throw Error('Discord unavailable'); },
    delete: async () => assert.fail('must not delete before replacements exist'),
  } };
  await assert.rejects(registerCommands(guild));
});

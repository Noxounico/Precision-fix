import test from 'node:test';
import assert from 'node:assert/strict';
import { Collection, PermissionsBitField, PermissionFlagsBits as P } from 'discord.js';
import { handleClear } from '../src/moderation.js';
import { handleBackup, sendBackupFile } from '../src/backup.js';
import { exportBackup } from '../src/backup-export.js';
import { announcement } from '../src/social-cards.js';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
const permissions = (...bits) => new PermissionsBitField(bits);

test('/clear exige permissões e remove só mensagens recentes não fixadas', async () => {
  const deleted = [], replies = [];
  const interaction = { isChatInputCommand: () => true, commandName: 'clear', guildId: 'guild',
    memberPermissions: permissions(P.ManageMessages), appPermissions: permissions(P.ManageMessages, P.ReadMessageHistory),
    options: { getInteger: () => 3 }, reply: async data => replies.push(data), deferReply: async () => {}, editReply: async data => replies.push(data),
    channel: { messages: { fetch: async () => new Collection([
      ['recent', { createdTimestamp: Date.now() - 1000, pinned: false }],
      ['pinned', { createdTimestamp: Date.now() - 1000, pinned: true }],
      ['old', { createdTimestamp: Date.now() - 15 * 86400000, pinned: false }],
    ]) }, bulkDelete: async values => { deleted.push(...values.keys()); return values; } },
  };
  await handleClear(interaction, { guild: 'guild' });
  assert.deepEqual(deleted, ['recent']); assert.match(replies[0], /1 mensagem/);
  interaction.memberPermissions = permissions();
  await handleClear(interaction, { guild: 'guild' });
  assert.equal(deleted.length, 1); assert.equal(replies[1].flags, 64);
});
test('backup recusa membro sem administrador e DMs bloqueadas antes de exportar', async () => {
  const replies = [];
  const interaction = { isChatInputCommand: () => true, commandName: 'bckup', guildId: 'guild',
    memberPermissions: permissions(), reply: async data => replies.push(data), deferReply: async () => {}, editReply: async data => replies.push(data),
    user: { createDM: async () => { throw Error('DM closed'); } },
  };
  await handleBackup(interaction, { guild: 'guild' });
  assert.match(replies[0].content, /Só administradores/);
  interaction.memberPermissions = permissions(P.Administrator);
  await handleBackup(interaction, { guild: 'guild' });
  assert.match(replies[1], /mensagens privadas/);
});
function backupGuild() {
  const guild = { id: 'guild', name: 'Servidor', members: { me: { id: 'bot' }, fetch: async () => new Collection() } };
  const message = id => ({ id, author: { id: 'user', username: 'Nome' }, content: `Texto ${id}`, createdTimestamp: 1000,
    attachments: new Collection(), embeds: [], components: [], reactions: { cache: new Collection() } });
  const channel = { id: 'chat', toJSON: () => ({ id: 'chat', type: 0, name: 'chat', permissionOverwrites: [{ id: 'everyone', deny: '1024' }] }),
    permissionsFor: () => permissions(P.ViewChannel, P.ReadMessageHistory),
    messages: { fetch: async ({ before }) => !before ? new Collection([['3', message('3')], ['2', message('2')]]) : before === '2' ? new Collection([['1', message('1')]]) : new Collection() } };
  const denied = { id: 'denied', toJSON: () => ({ id: 'denied' }), permissionsFor: () => permissions(), messages: { fetch: async () => assert.fail() } };
  guild.channels = { fetch: async () => new Collection([['chat', channel], ['denied', denied]]), fetchActiveThreads: async () => ({ threads: new Collection() }) };
  guild.roles = { fetch: async () => new Collection([['role', { toJSON: () => ({ id: 'role', permissions: 8n }) }]]) };
  for (const name of ['emojis', 'stickers', 'scheduledEvents', 'autoModerationRules', 'bans']) guild[name] = { fetch: async () => new Collection() };
  guild.fetchWebhooks = async () => new Collection([['hook', { id: 'hook', name: 'Test', channelId: 'chat', token: 'MUST_NOT_EXPORT', url: 'https://secret.invalid' }]]);
  return guild;
}
test('backup exporta estrutura e histórico paginado, regista falhas e exclui segredos de webhook', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'backup-test-'));
  try {
    const file = join(dir, 'export.gz');
    const manifest = await exportBackup(backupGuild(), file);
    const text = gunzipSync(await readFile(file)).toString();
    const records = text.trim().split('\n').map(line => JSON.parse(line));
    assert.equal(records.filter(record => record.type === 'message').length, 3);
    assert.equal(records.find(record => record.type === 'role').data.permissions, '8');
    assert.equal(records.at(-1).type, 'manifest');
    assert.deepEqual(manifest.errors, [{ section: 'messages:denied', code: 'MISSING_HISTORY_ACCESS' }]);
    assert(!text.includes('MUST_NOT_EXPORT')); assert(!text.includes('secret.invalid'));
  } finally { await rm(dir, { recursive: true, force: true }); }
});
test('backup com histórico desativado não consulta mensagens; ficheiros divididos recompõem o original', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'backup-split-'));
  try {
    const guild = backupGuild();
    const file = join(dir, 'export.gz');
    const manifest = await exportBackup(guild, file, { messages: false });
    assert.equal(manifest.counts.message, undefined);
    const original = Buffer.from('conteúdo de teste com acentos e mais dados');
    await writeFile(file, original);
    const pieces = [];
    await sendBackupFile({ send: async data => pieces.push(data.files[0].attachment) }, file, 'backup.gz', 10);
    assert.deepEqual(Buffer.concat(pieces), original);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
test('cartões de vídeo e live têm imagem, botões e a mensagem pedida, sem pings gerais', () => {
  for (const kind of ['video', 'live']) {
    const payload = announcement(kind, 'https://www.tiktok.com/@noxdu7', { username: 'noxdu7', divulgarImage: 'https://example.com/photo.jpg', banner: 'https://example.com/banner.gif' });
    const embed = payload.embeds[0].toJSON();
    assert.equal(embed.color, 0xffffff); assert(embed.thumbnail && embed.image);
    assert.equal(payload.components[0].toJSON().components[0].style, 5);
    assert.deepEqual(payload.allowedMentions.parse, []);
    if (kind === 'video') assert.match(embed.description, /Quem puder ir dar uma força/);
  }
});

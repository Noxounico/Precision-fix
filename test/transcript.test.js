import test from 'node:test';
import assert from 'node:assert/strict';
import { Collection, PermissionFlagsBits as P, PermissionsBitField } from 'discord.js';
import { supportOverwrites, transcriptParts, deliverTranscript, syncTicketAccess } from '../src/transcript.js';
import { handleTickets } from '../src/tickets.js';
const config = { guild: '123', ticketSupportRoles: ['staffA', 'staffB'], ticketTranscriptChannel: 'archive', messageContent: true };
const msg = (id, content) => ({ id, content, createdTimestamp: 100000, author: { id: '456', tag: 'Autor' }, attachments: new Collection(), embeds: [] });
function fixture({ dmFails = false, archiveFails = false } = {}) {
  const calls = { archive: [], dm: [], permissions: [], closes: [] };
  const bot = { id: 'bot', permissions: new PermissionsBitField([P.ManageChannels, P.ManageRoles]) };
  const channel = { id: 'ticket', name: 'ticket-456', topic: 'precision-ticket:456',
    permissionsFor: () => new PermissionsBitField([P.ViewChannel, P.ReadMessageHistory]),
    messages: { fetch: async ({ before }) => before ? new Collection() : new Collection([['2', msg('2', 'Resposta')], ['1', msg('1', 'Pedido de ajuda')]]) },
    permissionOverwrites: { edit: async (...args) => calls.permissions.push(args) }, edit: async data => calls.closes.push(data),
  };
  const archive = { id: 'archive', isTextBased: () => true, isThread: () => false,
    permissionOverwrites: { set: async data => { calls.archiveAccess = data; } },
    send: async data => { if (archiveFails) throw Error('archive unavailable'); calls.archive.push(data); },
  };
  const guild = { id: '123', members: { me: bot, fetch: async () => ({ roles: { cache: new Collection([['staffB', {}]]) } }) }, channels: { fetch: async () => archive } };
  channel.guild = guild;
  const interaction = { guildId: '123', guild, channel, channelId: 'ticket', user: { id: 'staff-user' },
    isButton: () => true, isChatInputCommand: () => false, customId: 'tickets:close',
    client: { users: { fetch: async id => { assert.equal(id, '456'); return { send: async data => { if (dmFails) throw Error('DM closed'); calls.dm.push(data); } }; } } },
    reply: async () => assert.fail('unexpected immediate reply'), deferReply: async () => {},
    editReply: async content => { calls.result = content; }, message: { edit: async () => {} },
  };
  return { calls, interaction };
}
test('paginação exporta todas as mensagens em ordem cronológica, com anexos', async () => {
  const channel = fixture().interaction.channel;
  let page = 0;
  const first = msg('3', 'Mensagem final'); first.attachments.set('a', { url: 'https://example.com/foto.png' });
  channel.messages.fetch = async args => {
    page++;
    if (!args.before) return new Collection([['3', first], ['2', msg('2', 'Segunda')]]);
    if (args.before === '2') return new Collection([['1', msg('1', 'Primeira')]]);
    return new Collection();
  };
  const text = (await transcriptParts(channel, '456', 'staff'))[0].toString();
  assert.equal(page, 3);
  assert(text.indexOf('Primeira') < text.indexOf('Segunda'));
  assert(text.indexOf('Segunda') < text.indexOf('Mensagem final'));
  assert.match(text, /https:\/\/example.com\/foto.png/);
});
test('os dois cargos têm acesso; nenhum outro cargo é acrescentado', () => {
  const rules = supportOverwrites({ id: '123' }, 'bot', config.ticketSupportRoles, '456');
  assert.deepEqual(rules.map(r => r.id), ['123', 'bot', 'staffA', 'staffB', '456']);
  assert.deepEqual(rules[0].deny, [P.ViewChannel]);
});
test('fecho autorizado arquiva e envia cópia ao autor, mantendo histórico do canal', async () => {
  const { calls, interaction } = fixture();
  await handleTickets(interaction, config);
  assert.equal(calls.archive.length, 1); assert.equal(calls.dm.length, 1);
  const archived = calls.archive[0].files[0].attachment;
  assert.match(archived.toString(), /Pedido de ajuda/);
  assert.deepEqual(calls.dm[0].files[0].attachment, archived);
  assert.deepEqual(calls.permissions, [['456', { SendMessages: false }]]);
  assert.equal(calls.closes[0].topic, 'precision-ticket-closed:456');
  assert.deepEqual(calls.archiveAccess.map(r => r.id), ['123', 'bot', 'staffA', 'staffB']);
});
test('DM fechada não perde arquivo e informa a equipa', async () => {
  const { calls, interaction } = fixture({ dmFails: true });
  await handleTickets(interaction, config);
  assert.equal(calls.archive.length, 1);
  assert.equal(calls.closes.length, 1);
  assert.match(calls.result, /não foi possível/);
});
test('falha de arquivo ou intent desativado impede o fecho e não envia DM', async () => {
  const { calls, interaction } = fixture({ archiveFails: true });
  await assert.rejects(handleTickets(interaction, config));
  assert.equal(calls.closes.length, 0); assert.equal(calls.dm.length, 0);
  await assert.rejects(deliverTranscript(interaction, { ...config, messageContent: false }, '456'), /Message Content Intent/);
});
test('tickets existentes recebem os mesmos dois cargos, preservando estado fechado', async () => {
  const writes = [];
  const guild = { id: '123', members: { me: { id: 'bot' } }, roles: { fetch: async id => ({ id }) },
    channels: { fetch: async () => new Collection([
      ['1', { topic: 'precision-ticket:456', permissionOverwrites: { set: async rules => writes.push(rules) } }],
      ['2', { topic: 'precision-ticket-closed:789', permissionOverwrites: { set: async rules => writes.push(rules) } }],
      ['3', { topic: 'canal normal', permissionOverwrites: { set: async () => assert.fail() } }],
    ]) },
  };
  await syncTicketAccess(guild, config);
  assert.equal(writes.length, 2);
  assert.deepEqual(writes[1].find(rule => rule.id === '789').deny, [P.SendMessages]);
});

test('sem Ler histórico não produz uma transcrição vazia nem fecha o ticket', async () => {
  const { calls, interaction } = fixture();
  interaction.channel.permissionsFor = () => new PermissionsBitField(P.ViewChannel);
  await assert.rejects(handleTickets(interaction, config), /Ler histórico/);
  assert.equal(calls.archive.length, 0); assert.equal(calls.closes.length, 0);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { PermissionsBitField, PermissionFlagsBits as P } from 'discord.js';
import { createAuditLogger } from '../src/audit.js';
const config = { guild: 'guild', logChannels: { join: 'join', leave: 'leave', messages: 'messages', notify: 'notify' } };
function setup() {
  const sent = [];
  const client = { channels: { fetch: async id => ({ id, guildId: 'guild', isTextBased: () => true, isThread: () => false,
    guild: { members: { me: {} } }, permissionsFor: () => new PermissionsBitField([P.ViewChannel, P.SendMessages, P.EmbedLinks]),
    send: async payload => sent.push({ id, payload }),
  }) } };
  return { client, sent, audit: createAuditLogger(client, config) };
}
test('entrada/saída seguem para canais separados sem ping', async () => {
  const { audit, sent } = setup();
  const member = { id: 'user', guild: { id: 'guild' }, user: { username: 'teste', displayAvatarURL: () => 'https://example.com/avatar.png' } };
  await audit.member(member, true); await audit.member(member, false);
  assert.deepEqual(sent.map(item => item.id), ['join', 'leave']);
  assert.deepEqual(sent[0].payload.allowedMentions.parse, []);
});
test('logs guardam conteúdo, antes/depois, anexos e cache de eliminações', async () => {
  const { audit, sent } = setup();
  const message = { guildId: 'guild', channelId: 'chat', id: 'id', author: { id: 'user', bot: false }, content: 'original', attachments: new Map(), editedTimestamp: 1 };
  await audit.message(message, 'create');
  await audit.message({ ...message, content: 'editado', editedTimestamp: 2 }, 'edit', message);
  await audit.message({ guildId: 'guild', channelId: 'chat', id: 'id', partial: true }, 'delete');
  assert.equal(sent.length, 3);
  const edited = sent[1].payload.embeds[0].toJSON();
  assert.equal(edited.fields.find(f=>f.name==='Antes').value,'original');
  assert.equal(edited.fields.find(f=>f.name==='Depois').value,'editado');
  assert.equal(sent[2].payload.embeds[0].toJSON().fields.find(f=>f.name==='Conteúdo').value,'editado');
  for (const patch of [{ guildId: null }, { author: { bot: true } }, { channelId: 'messages' }, { webhookId: 'hook' }]) await audit.message({ ...message, ...patch }, 'create');
  await audit.message(message,'edit',{...message,partial:false});
  assert.equal(sent.length,3);
  await audit.message({...message,id:'long',content:'X'.repeat(4000)},'create');
  assert.equal(sent[3].payload.files.length,1);
  await audit.message({guildId:'guild',channelId:'chat',id:'unknown',partial:true},'delete');
  assert.match(sent[4].payload.embeds[0].toJSON().fields.find(f=>f.name==='Conteúdo').value,/Indisponível/);
});
test('limpeza em massa e notifyon têm registos próprios; falha de acesso é detetada', async () => {
  const { audit, sent, client } = setup();
  await audit.bulkDelete(new Map([['1', {}], ['2', {}]]), { guildId: 'guild', id: 'chat' });
  assert.equal(sent[0].payload.embeds[0].toJSON().fields[1].value, '2');
  await audit.notifyOn({ id: 'user' }, 'Ativou notificações.');
  assert.equal(sent[1].id, 'notify');
  client.channels.fetch = async () => ({ guildId: 'other' });
  await assert.rejects(audit.notifyOn({ id: 'user' }, 'test'), /inválido/);
});

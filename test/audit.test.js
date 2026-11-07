import test from 'node:test';
import assert from 'node:assert/strict';
import { PermissionsBitField, PermissionFlagsBits as P } from 'discord.js';
import { createAuditLogger } from '../src/audit.js';
const config = { guild: 'guild', logChannels: { join: 'join', leave: 'leave' } };
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

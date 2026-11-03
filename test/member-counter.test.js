import test from 'node:test';
import assert from 'node:assert/strict';
import { Collection, ChannelType, PermissionFlagsBits as P } from 'discord.js';
import { syncMemberCounter } from '../src/member-counter.js';

test('cria contador visível e bloqueado; reutiliza após reinício e atualiza entradas/saídas', async () => {
  const cache = new Collection();
  const created = [], renames = [];
  const guild = { id: 'guild', memberCount: 42, channels: {
    fetch: async () => cache,
    create: async data => {
      created.push(data);
      const channel = { ...data, id: 'counter', setName: async name => { renames.push(name); channel.name = name; } };
      cache.set(channel.id, channel);
      return channel;
    },
  } };
  await syncMemberCounter(guild);
  assert.equal(created[0].name, '🟢 Membros: 42');
  assert.equal(created[0].type, ChannelType.GuildVoice);
  assert.deepEqual(created[0].permissionOverwrites, [{ id: 'guild', allow: [P.ViewChannel], deny: [P.Connect] }]);
  await syncMemberCounter(guild);
  assert.equal(created.length, 1);
  assert.deepEqual(renames, []);
  guild.memberCount = 43;
  await syncMemberCounter(guild);
  guild.memberCount = 41;
  await syncMemberCounter(guild);
  assert.deepEqual(renames, ['🟢 Membros: 43', '🟢 Membros: 41']);
  cache.clear();
  await syncMemberCounter(guild);
  assert.equal(created.length, 2);
});

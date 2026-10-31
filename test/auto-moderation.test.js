import test from 'node:test';
import assert from 'node:assert/strict';
import { ChannelType, PermissionsBitField, PermissionFlagsBits as P } from 'discord.js';
import { assignJoinRole, handleBan, enforceBanChannel, banWarning } from '../src/auto-moderation.js';
import { loadState, saveState } from '../src/state.js';
import { mkdtemp, readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const config = { guild: '123', joinRole: '1560785907509108787' };
const channelId = '1560785968024522984';
test('evento real de novas mensagens executa banimento antes do XP e reporta falhas', async () => {
 const source = await readFile(new URL('../src/index.js', import.meta.url), 'utf8');
 const start = source.indexOf('client.on(Events.MessageCreate,');
 const end = source.indexOf('client.on(Events.Error,', start);
 const calls = []; let listener;
 runInNewContext(source.slice(start, end), {
   client: { on: (_, callback) => { listener = callback; } }, Events: { MessageCreate: 'messageCreate' },
   config, state: { banChannels: [channelId] }, enforceBanChannel,
   awardXp: async () => { calls.push('xp'); }, saveState: async () => {}, report: () => calls.push('error'),
 });
 const message = { guildId: '123', channelId, author: { id: 'user', bot: false },
   guild: { members: { ban: async () => calls.push('ban') } }, delete: async () => calls.push('delete') };
 await listener(message);
 assert.deepEqual(calls, ['ban', 'delete']);
 await listener({ ...message, channelId: 'normal' });
 assert.deepEqual(calls, ['ban', 'delete', 'xp']);
 message.guild.members.ban = async () => { throw Error('Missing Permissions'); };
 await listener(message);
 assert.deepEqual(calls, ['ban', 'delete', 'xp', 'error']);
});
test('cargo atribuído apenas no servidor configurado', async () => {
 const calls = []; const member = { guild: { id: 'other' }, roles: { add: async id => calls.push(id) } };
 assert.equal(await assignJoinRole(member, config), false);
 member.guild.id = config.guild; await assignJoinRole(member, config);
 assert.deepEqual(calls, [config.joinRole]);
});
test('/ban exige administrador, publica aviso e persiste após reinício', async () => {
 const file = join(await mkdtemp(join(tmpdir(), 'ban-')), 'state.json');
 const state = await loadState(file); const sent = [];
 const i = { isChatInputCommand: () => true, commandName: 'ban', guildId: '123', channelId,
 memberPermissions: new PermissionsBitField(), appPermissions: new PermissionsBitField([P.ViewChannel,P.SendMessages,P.BanMembers]),
 channel: { type: ChannelType.GuildText, send: async data => sent.push(data) }, reply: async () => {}, deferReply: async () => {}, editReply: async () => {} };
 await handleBan(i, config, state, s => saveState(file,s)); assert.equal(sent.length,0);
 i.memberPermissions = new PermissionsBitField(P.Administrator);
 i.appPermissions = new PermissionsBitField();
 await handleBan(i, config, state, s => saveState(file,s)); assert.equal(sent.length,0);
 i.appPermissions = new PermissionsBitField([P.ViewChannel,P.SendMessages,P.BanMembers]);
 await handleBan(i, config, state, s => saveState(file,s));
 assert.equal(sent[0].content,banWarning); assert.deepEqual((await loadState(file)).banChannels,[channelId]);
 await assert.rejects(handleBan({...i,channelId:'1560785974173237369'},config,state,async()=>{throw Error('disk');}));
 assert.deepEqual(state.banChannels,[channelId]);
});
test('banimento aplica-se a mensagens e threads; ignora bots, webhooks e outros canais/servidores', async () => {
 const bans=[]; const state={banChannels:[channelId]};
 const msg={guildId:'123',channelId,author:{id:'user',bot:false},guild:{members:{ban:async id=>bans.push(id)}},delete:async()=>bans.push('delete')};
 for(const patch of [{guildId:'other'},{channelId:'other'},{author:{bot:true}},{webhookId:'hook'}]) assert.equal(await enforceBanChannel({...msg,...patch},config,state),false);
 assert.equal(await enforceBanChannel(msg,config,state),true);
 assert.equal(await enforceBanChannel({...msg,channelId:'thread',channel:{parentId:channelId}},config,state),true);
 assert.deepEqual(bans,['user','delete','user','delete']);
});

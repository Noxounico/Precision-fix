import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PermissionsBitField, PermissionFlagsBits as P } from 'discord.js';
import { Giveaways, giveawayDuration, drawWinners } from '../src/giveaways.js';
import { loadState, saveState } from '../src/state.js';

const guildId='1560784472083800298',channelId='1560784472083800299',messageId='1560784472083800300';
const userA='1560784472083800301',userB='1560784472083800302',userC='1560784472083800303';
async function fixture() {
 const file=join(await mkdtemp(join(tmpdir(),'giveaway-')),'state.json');
 const state=await loadState(file);let now=1_800_000_000_000;
 const sent=[],edits=[],replies=[],timers=[];
 const message={id:messageId,edit:async p=>edits.push(p),delete:async()=>{}};
 const guild={id:guildId,iconURL:()=>null};
 const channel={id:channelId,guildId,guild,isTextBased:()=>true,messages:{fetch:async id=>{assert.equal(id,messageId);return message;}},send:async p=>{sent.push(p);return message;}};
 const persist=s=>saveState(file,s);
 const options={client:{channels:{fetch:async id=>{assert.equal(id,channelId);return channel;}}},config:{guild:guildId},state,persist,now:()=>now,choose:()=>0,
  setTimer:(fn,delay)=>{const timer={fn,delay};timers.push(timer);return timer;},clearTimer:()=>{},report:()=>{}};
 const service=new Giveaways(options);
 const command={isChatInputCommand:()=>true,isButton:()=>false,commandName:'sorteio',guildId,guild,channelId,channel,user:{id:userA,bot:false},
  memberPermissions:new PermissionsBitField(P.ManageGuild),appPermissions:new PermissionsBitField([P.ViewChannel,P.SendMessages,P.EmbedLinks,P.ReadMessageHistory]),
  reply:async p=>replies.push(p),deferReply:async()=>{},editReply:async p=>replies.push(p)};
 const click=(id=userA,time=now)=>({...command,isChatInputCommand:()=>false,isButton:()=>true,customId:'giveaway:join',message,user:{id,bot:false},createdTimestamp:time});
 return {file,state,service,options,sent,edits,replies,timers,command,click,persist,setNow:n=>now=n,now:()=>now};
}
test('/sorteio publica prémio fixo com botão, dois vencedores e prazo persistido de 24h',async()=>{
 const f=await fixture();await f.service.handle(f.command);
 const stored=await loadState(f.file);assert.equal(stored.giveaways[messageId].endsAt,f.now()+giveawayDuration);
 const embed=f.sent[0].embeds[0].toJSON();assert.match(embed.description,/2 keys/);assert.match(embed.description,/2 pessoas diferentes/);
 assert.equal(f.sent[0].components[0].toJSON().components[0].custom_id,'giveaway:join');
 assert.equal(f.timers[0].delay,giveawayDuration);assert.deepEqual(f.sent[0].allowedMentions.parse,[]);
});
test('só Gerir servidor pode criar; membros, bots e servidor alheio são validados',async()=>{
 const f=await fixture();f.command.memberPermissions=new PermissionsBitField();await f.service.handle(f.command);assert.equal(f.sent.length,0);
 assert.match(f.replies.at(-1).content,/Gerir servidor/);
 await f.service.handle({...f.command,guildId:'other'});assert.match(f.replies.at(-1).content,/servidor configurado/);
 f.command.memberPermissions=new PermissionsBitField(P.ManageGuild);await f.service.handle(f.command);
 await f.service.handle({...f.click(),user:{id:userA,bot:true}});assert.equal(f.state.giveaways[messageId].participants.length,0);
});
test('cliques simultâneos de vários membros são guardados; repetição não duplica entradas',async()=>{
 const f=await fixture();await f.service.handle(f.command);
 await Promise.all([f.click(userA),f.click(userB),f.click(userA),f.click(userC)].map(i=>f.service.handle(i)));
 assert.deepEqual((await loadState(f.file)).giveaways[messageId].participants,[userA,userB,userC]);
 f.setNow(f.state.giveaways[messageId].endsAt);await f.service.handle(f.click('1560784472083800304'));
 assert.equal(f.state.giveaways[messageId].participants.length,3);assert.match(f.replies.at(-1).content,/terminou/);
});
test('retoma do disco após reinício, sorteia dois distintos e desativa o botão sem repetir',async()=>{
 const f=await fixture();await f.service.handle(f.command);
 for(const user of [userA,userB,userC])await f.service.handle(f.click(user));
 f.setNow(f.state.giveaways[messageId].endsAt+1);
 const state=await loadState(f.file);const restarted=new Giveaways({...f.options,state});restarted.start();
 assert.equal(f.timers.at(-1).delay,0);f.timers.at(-1).fn();await restarted.queues.get(messageId);
 assert.deepEqual(state.giveaways[messageId].winners,[userA,userB]);assert.equal(state.giveaways[messageId].completed,true);
 assert.equal(f.edits[0].components[0].toJSON().components[0].disabled,true);
 assert.deepEqual(f.edits[0].allowedMentions.users,[userA,userB]);
 await restarted.finish(messageId);assert.equal(f.edits.length,1);
 assert.equal((await loadState(f.file)).giveaways[messageId].completed,true);
});
test('falha de envio conserva os vencedores no disco e um novo processo não volta a sortear',async()=>{
 const f=await fixture();await f.service.handle(f.command);for(const user of [userA,userB,userC])await f.service.handle(f.click(user));
 f.setNow(f.state.giveaways[messageId].endsAt);
 const original=f.options.client.channels.fetch;f.options.client.channels.fetch=async()=>{throw Error('offline');};
 await assert.rejects(f.service.finish(messageId));
 const state=await loadState(f.file);assert.deepEqual(state.giveaways[messageId].winners,[userA,userB]);assert.equal(state.giveaways[messageId].completed,false);
 f.options.client.channels.fetch=original;
 const restarted=new Giveaways({...f.options,state,choose:()=>assert.fail('Não repetir sorteio')});
 await restarted.finish(messageId);assert.equal(f.edits.length,1);
});
test('falha a guardar resultado não o publica e a recuperação tenta o mesmo resultado',async()=>{
 const f=await fixture();await f.service.handle(f.command);await f.service.handle(f.click(userA));await f.service.handle(f.click(userB));
 f.setNow(f.state.giveaways[messageId].endsAt);f.service.persist=async()=>{throw Error('disk');};
 await assert.rejects(f.service.finish(messageId));assert.equal(f.edits.length,0);
 f.service.persist=f.persist;f.service.choose=()=>assert.fail('Não sortear novamente');await f.service.finish(messageId);
 assert.deepEqual(f.state.giveaways[messageId].winners,[userA,userB]);
});
test('sem inscritos encerra sem vencedor; com um inscrito atribui apenas uma key',async()=>{
 assert.deepEqual(drawWinners([],()=>0),[]);assert.deepEqual(drawWinners([userA,userA],()=>0),[userA]);
 for(const users of [[],[userA]]){
  const f=await fixture();await f.service.handle(f.command);for(const user of users)await f.service.handle(f.click(user));
  f.setNow(f.state.giveaways[messageId].endsAt);await f.service.finish(messageId);
  assert.deepEqual(f.state.giveaways[messageId].winners,users);assert.equal(f.state.giveaways[messageId].completed,true);
 }
});
test('mensagem apagada não provoca tentativas infinitas nem outro sorteio',async()=>{
 const f=await fixture();await f.service.handle(f.command);await f.service.handle(f.click(userA));f.setNow(f.state.giveaways[messageId].endsAt);
 f.options.client.channels.fetch=async()=>{throw Object.assign(new Error(),{code:10003});};
 await f.service.finish(messageId);assert.equal(f.state.giveaways[messageId].completed,true);
});
test('estado rejeita vencedores que não participaram e entradas duplicadas',async()=>{
 const f=await fixture();await f.service.handle(f.command);const record=f.state.giveaways[messageId];record.winners=[userA];
 await writeFile(f.file,JSON.stringify(f.state));await assert.rejects(loadState(f.file));
 record.winners=null;record.participants=[userA,userA];await writeFile(f.file,JSON.stringify(f.state));await assert.rejects(loadState(f.file));
});

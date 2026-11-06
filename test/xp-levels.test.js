import test from 'node:test';
import assert from 'node:assert/strict';
import { tiers, multiplier, syncXpRoles, levelsEmbed, publishLevels } from '../src/xp-levels.js';
import { awardXp, handleXp } from '../src/xp.js';
import { VoiceXp } from '../src/voice-xp.js';
const config={guild:'guild'};
const member=(id)=>({id,user:{bot:false},roles:{cache:new Map(),add:async()=>{}}});
test('nove níveis corretos, multiplicadores e cargos acumulados',async()=>{
 assert.deepEqual(tiers.map(t=>t[0]),[500,2500,5500,10000,20000,40000,60000,85000,125000]);
 assert.equal(tiers[8][1],'1561471233688735824');
 assert.deepEqual([499,2500,19999,20000].map(multiplier),[1,2,2,3]);
 const m=member('a');let added; m.roles.cache.set(tiers[0][1],true);m.roles.add=async ids=>added=ids;
 await syncXpRoles(m,5500);assert.deepEqual(added,[tiers[1][1],tiers[2][1]]);
 assert.match(levelsEmbed().toJSON().description,/125/);
});
test('mensagem atravessa limite, atribui cargo e respeita cooldown',async()=>{
 let added;const m=member('a');m.roles.add=async ids=>added=ids;
 const state={xp:{guild:{a:{xp:490,lastAwardAt:0}}}};
 const msg={guildId:'guild',author:{id:'a',bot:false},member:m,createdTimestamp:60000};
 await awardXp(msg,config,state,async()=>{});assert.equal(state.xp.guild.a.xp,505);assert.deepEqual(added,[tiers[0][1]]);
 assert.equal(await awardXp(msg,config,state,async()=>{}),false);
 state.xp.guild.a.xp=2500;msg.createdTimestamp=120000;
 await awardXp(msg,config,state,async()=>{});assert.equal(state.xp.guild.a.xp,2530);
});
test('call conta tempo real, exclui solo/AFK/ensurdecidos e preserva cooldown de mensagens',async()=>{
 let now=0;const state={};const tracker=new VoiceXp(config,state,async()=>{},()=>now);
 const a={id:'a',channelId:'room',member:member('a')};const b={id:'b',channelId:'room',member:member('b')};
 const guild={id:'guild',afkChannelId:'afk',voiceStates:{cache:new Map([['a',a]])}};
 tracker.refresh(guild);now=60000;await tracker.tick(guild);assert.equal(state.xp,undefined);
 guild.voiceStates.cache.set('b',b);tracker.refresh(guild);
 now=90000;await tracker.tick(guild);assert.equal(state.xp,undefined);
 now=120000;await tracker.tick(guild);assert.equal(state.xp.guild.a.xp,10);assert.equal(state.xp.guild.a.lastAwardAt,0);
 a.selfDeaf=true;tracker.refresh(guild);now=180000;await tracker.tick(guild);assert.equal(state.xp.guild.a.xp,10);assert.equal(state.xp.guild.b.xp,20);
 b.channelId='afk';tracker.refresh(guild);now=240000;await tracker.tick(guild);assert.equal(state.xp.guild.b.xp,20);
});
test('/xp mensagem exige Gerir servidor; /xp ver consulta XP',async()=>{
 const replies=[];const i={memberPermissions:{has:()=>false},reply:async d=>replies.push(d)};
 await publishLevels(i);assert.equal(replies[0].flags,64);
 i.memberPermissions.has=()=>true;await publishLevels(i);assert.deepEqual(replies[1].allowedMentions.parse,[]);
 await handleXp({isChatInputCommand:()=>true,commandName:'xp',guildId:'guild',user:{id:'a'},options:{getSubcommand:()=> 'ver'},reply:i.reply},config,{xp:{guild:{a:{xp:100,lastAwardAt:0}}}});
 assert.match(replies[2].embeds[0].toJSON().fields[1].value,/100/);
});

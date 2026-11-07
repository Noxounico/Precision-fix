import test from 'node:test';
import assert from 'node:assert/strict';
import { createXpCheckpoint, mergeXpCheckpoint } from '../src/xp-checkpoint.js';
import { levelsEmbed, tiers, orderXpRoles } from '../src/xp-levels.js';
const guildId='1560784472083800298',userId='1560784472083800299';
test('XP remoto recupera pontos exatos sem baixar progresso local e rejeita dados inválidos',()=>{
 const state={xp:{[guildId]:{[userId]:{xp:1700,lastAwardAt:10}}}};
 const remote={version:1,guild:guildId,xp:{[userId]:{xp:1873,lastAwardAt:20}}};
 assert.equal(mergeXpCheckpoint(state,remote,guildId),1);assert.equal(state.xp[guildId][userId].xp,1873);
 assert.equal(mergeXpCheckpoint(state,{...remote,xp:{[userId]:{xp:500,lastAwardAt:0}}},guildId),0);
 assert.throws(()=>mergeXpCheckpoint(state,{...remote,guild:'other'},guildId));
 assert.throws(()=>mergeXpCheckpoint(state,{...remote,xp:{[userId]:{xp:-1,lastAwardAt:0}}},guildId));
});
test('cópia privada sobrevive a arranque sem ficheiro local, evita duplicação e repete após falha',async()=>{
 let payload,saves=0,edits=0,fail=false;
 const state={xp:{[guildId]:{[userId]:{xp:1873,lastAwardAt:20}}}};
 const message={id:'10',author:{id:'bot'},content:'precision-xp-checkpoint-v1',attachments:new Map(),edit:async p=>{if(fail)throw Error('offline');edits++;payload=p;return message;}};
 const channel={id:'backup',type:0,topic:'precision-xp-checkpoint-v1',permissionOverwrites:{set:async rules=>assert.deepEqual(rules.map(r=>r.id),[guildId,'bot'])},messages:{fetch:async()=>new Map()},send:async p=>{payload=p;return message;}};
 const guild={id:guildId,members:{me:{id:'bot'}},channels:{fetch:async()=>new Map(),create:async p=>{assert.equal(p.permissionOverwrites.length,2);return channel;}}};
 const checkpoint=await createXpCheckpoint(guild,state,async()=>saves++);
 await Promise.all([checkpoint.flush(),checkpoint.flush()]);assert.equal(edits,0);
 const stored=payload.files[0].attachment.toString();
 message.attachments.set('file',{name:'xp-state.json',url:'https://cdn.discordapp.com/x',size:stored.length});
 channel.messages.fetch=async()=>new Map([['10',message]]);guild.channels.fetch=async()=>new Map([['backup',channel]]);
 const restored={};const restarted=await createXpCheckpoint(guild,restored,async()=>saves++,async()=>({ok:true,text:async()=>stored}));
 assert.equal(restored.xp[guildId][userId].xp,1873);assert.equal(saves,1);
 fail=true;await assert.rejects(restarted.flush());fail=false;await restarted.flush();assert.equal(edits,1);
});
test('quadro desce de Veterano III a Aprendiz I e cargos usam posições existentes',async()=>{
 const desc=levelsEmbed().toJSON().description;
 assert(desc.indexOf(tiers[8][1])<desc.indexOf(tiers[7][1]));assert(desc.indexOf(tiers[7][1])<desc.indexOf(tiers[0][1]));
 const roles=new Map(tiers.map(([,id],i)=>[id,{id,editable:true,position:9-i}]));let changes;
 await orderXpRoles({roles:{fetch:async()=>roles,setPositions:async positions=>changes=positions}});
 assert.equal(changes[0].position,1);assert.equal(changes[8].position,9);
});

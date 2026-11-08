import test from 'node:test';
import assert from 'node:assert/strict';
import { removeLegacyChannels, mergeXpCheckpoint } from '../src/xp-checkpoint.js';
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
function migrationFixture() {
 const deleted=[];
 const attachment={name:'xp-state.json',url:'https://cdn.discordapp.com/x',size:100};
 const message={id:'10',author:{id:'bot'},content:'precision-xp-checkpoint-v1',attachments:new Map([['file',attachment]])};
 const backup={type:0,topic:'precision-xp-checkpoint-v1',messages:{fetch:async()=>new Map([['10',message]])},delete:async()=>deleted.push('xp')};
 const archive={type:0,topic:'precision-shop-archive',delete:async()=>deleted.push('shop')};
 const other={type:0,topic:'outro',delete:async()=>assert.fail('Canal alheio')};
 const guild={id:guildId,members:{me:{id:'bot'}},channels:{fetch:async()=>new Map([['b',backup],['a',archive],['o',other]]),create:async()=>assert.fail('Não criar canais')}};
 return {guild,deleted,download:async()=>({ok:true,text:async()=>JSON.stringify({version:1,guild:guildId,xp:{[userId]:{xp:1873,lastAwardAt:20}}})})};
}
test('migra XP antigo antes de remover apenas os dois canais marcados',async()=>{
 const f=migrationFixture();const state={};
 await removeLegacyChannels(f.guild,state,async()=>{assert.equal(state.xp[guildId][userId].xp,1873);assert.equal(f.deleted.length,0);},f.download);
 assert.deepEqual(f.deleted,['xp','shop']);
});
test('falha de leitura ou gravação preserva o backup de XP',async()=>{
 const f=migrationFixture();
 await assert.rejects(removeLegacyChannels(f.guild,{},async()=>{},async()=>({ok:false})));
 assert.deepEqual(f.deleted,[]);
 await assert.rejects(removeLegacyChannels(f.guild,{},async()=>{throw Error('disk full');},f.download));
 assert.deepEqual(f.deleted,[]);
});
test('quadro desce de Veterano III a Aprendiz I e cargos usam posições existentes',async()=>{
 const desc=levelsEmbed().toJSON().description;
 assert(desc.indexOf(tiers[8][1])<desc.indexOf(tiers[7][1]));assert(desc.indexOf(tiers[7][1])<desc.indexOf(tiers[0][1]));
 const roles=new Map(tiers.map(([,id],i)=>[id,{id,editable:true,position:9-i}]));let changes;
 await orderXpRoles({roles:{fetch:async()=>roles,setPositions:async positions=>changes=positions}});
 assert.equal(changes[0].position,1);assert.equal(changes[8].position,9);
});

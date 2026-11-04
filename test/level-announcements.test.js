import test from 'node:test';
import assert from 'node:assert/strict';
import { announceLevel, levelChannel, handleSetup } from '../src/level-announcements.js';
test('avisa só ao subir de nível, no canal correto', async () => {
 const sent=[]; const guild={channels:{fetch:async id=>{assert.equal(id,levelChannel);return {send:async data=>sent.push(data)};}}};
 await announceLevel(guild,'user',90,99);assert.equal(sent.length,0);
 await announceLevel(guild,'user',99,114);assert.match(sent[0].content,/nível \*\*1\*\*/);
 assert.deepEqual(sent[0].allowedMentions.users,['user']);
});
test('setup mostra hardware sem preços e funciona para membros comuns',async()=>{
 const replies=[];
 const msg={guildId:'g',author:{bot:false},content:'!setup',reply:async s=>replies.push(s)};
 assert.equal(await handleSetup(msg,{guild:'g'},()=>0),true);
 const embed=replies[0].embeds[0].toJSON();
 assert.equal(embed.fields[0].value,'AMD Ryzen 5 5600');
 assert.doesNotMatch(JSON.stringify(embed),/€|preço|EUR/i);
 assert.equal(await handleSetup({...msg,guildId:'other'},{guild:'g'}),false);
 assert.equal(await handleSetup({...msg,author:{bot:true}},{guild:'g'}),false);
});

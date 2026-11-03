import test from 'node:test';
import assert from 'node:assert/strict';
import { announceLevel, levelChannel, handleSetup } from '../src/level-announcements.js';
test('avisa só ao subir de nível, no canal correto', async () => {
 const sent=[]; const guild={channels:{fetch:async id=>{assert.equal(id,levelChannel);return {send:async data=>sent.push(data)};}}};
 await announceLevel(guild,'user',90,99);assert.equal(sent.length,0);
 await announceLevel(guild,'user',99,114);assert.match(sent[0].content,/nível \*\*1\*\*/);
 assert.deepEqual(sent[0].allowedMentions.users,['user']);
});
test('setup recusa utilizadores sem Gerir servidor',async()=>{
 const replies=[];
 assert.equal(await handleSetup({guildId:'g',author:{bot:false},content:'!setup',member:{permissions:{has:()=>false}},reply:async s=>replies.push(s)},{guild:'g'}),true);
 assert.match(replies[0],/Gerir servidor/);
});

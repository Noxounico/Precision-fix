import test from 'node:test';
import assert from 'node:assert/strict';
import { Collection } from 'discord.js';
import { commandChannels, restrictMessage } from '../src/command-access.js';
test('só dono altera a permissão de aplicativo; comandos de texto continuam livres', async () => {
 const changes=[],replies=[];
 const channels=new Collection([...commandChannels,'outside'].map(id=>[id,{id,permissionOverwrites:{edit:async(target,patch)=>changes.push({id,target,patch})}}]));
 const msg={guildId:'g',guild:{id:'g',ownerId:'owner',channels:{fetch:async()=>channels}},author:{id:'other'},content:'!comandos',reply:async d=>replies.push(d)};
 await restrictMessage(msg,{guild:'g'});assert.equal(changes.length,0);
 msg.author.id='owner';await restrictMessage(msg,{guild:'g'});
 assert.deepEqual(changes.map(c=>c.patch),[{UseApplicationCommands:true},{UseApplicationCommands:true},{UseApplicationCommands:false}]);
 assert(changes.every(c=>c.target==='g'));
 assert.equal(await restrictMessage({...msg,content:'!setup'},{guild:'g'}),false);
});

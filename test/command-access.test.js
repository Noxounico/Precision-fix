import test from 'node:test';
import assert from 'node:assert/strict';
import { commandBlocked, commandChannels, restrictMessage, restrictInteraction } from '../src/command-access.js';
test('só dono alterna restrição, persiste e pode desligar fora dos canais', async () => {
 const state={}, saved=[], replies=[]; const config={guild:'g'};
 const msg={guildId:'g',guild:{ownerId:'owner'},channelId:'outside',author:{id:'other'},content:'!comandos',reply:async d=>replies.push(d)};
 const run=m=>restrictMessage(m,config,state,async s=>saved.push(structuredClone(s)));
 await run(msg);assert.equal(saved.length,0);
 msg.author.id='owner';await run(msg);assert.equal(saved[0].commandsRestricted,true);
 assert.equal(commandBlocked('outside',state),true);
 for(const id of commandChannels) assert.equal(commandBlocked(id,state),false);
 assert.equal(await run({...msg,content:'!setup'}),true);
 assert.equal(await run({...msg,content:'normal'}),false);
 const interaction={guildId:'g',channelId:'outside',isChatInputCommand:()=>true,reply:msg.reply};
 assert.equal(await restrictInteraction(interaction,config,state),true);
 assert.equal(await restrictInteraction({...interaction,isChatInputCommand:()=>false},config,state),false);
 await run(msg);assert.equal(state.commandsRestricted,false);
 assert.equal(await restrictInteraction(interaction,config,state),false);
});

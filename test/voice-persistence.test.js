import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadState, saveState } from '../src/state.js';
import { stateFilePath } from '../src/config.js';
import { VoiceXp } from '../src/voice-xp.js';

test('volume Railway é usado e configuração sem persistência é recusada',()=>{
 assert.equal(stateFilePath({RAILWAY_VOLUME_MOUNT_PATH:'/persistent'}),'/persistent/state.json');
 assert.equal(stateFilePath({RAILWAY_VOLUME_MOUNT_PATH:'/persistent',STATE_FILE:'/app/data/state.json'}),'/persistent/state.json');
 assert.equal(stateFilePath({RAILWAY_VOLUME_MOUNT_PATH:'/persistent',STATE_FILE:'/persistent/bot.json'}),'/persistent/bot.json');
 assert.throws(()=>stateFilePath({RAILWAY_SERVICE_ID:'service'}),/volume persistente/);
 assert.throws(()=>stateFilePath({RAILWAY_VOLUME_MOUNT_PATH:'/persistent',STATE_FILE:'/temporary/state.json'}),/dentro do volume/);
});
test('call retoma pontos e frações após reinício sem dar XP offline nem resetar ao sair',async()=>{
 const file=join(await mkdtemp(join(tmpdir(),'voice-persist-')),'state.json');
 let now=0;
 const member={id:'member',user:{bot:false},roles:{cache:new Map(),add:async ids=>ids.forEach(id=>member.roles.cache.set(id,true))}};
 const voice={id:'member',channelId:'call',member};
 const guild={id:'guild',voiceStates:{cache:new Map([['member',voice]])},channels:{fetch:async()=>({send:async()=>{}})}};
 let state=await loadState(file);state.xp={guild:{member:{xp:490,lastAwardAt:0}}};
 let tracker=new VoiceXp({guild:'guild'},state,s=>saveState(file,s),()=>now);
 tracker.refresh(guild);now=30000;await tracker.tick(guild);
 state=await loadState(file);assert.equal(state.xp.guild.member.xp,490);assert.equal(state.voiceCredits.guild.member,30000);
 now=1_000_000;tracker=new VoiceXp({guild:'guild'},state,s=>saveState(file,s),()=>now);
 tracker.refresh(guild);await tracker.tick(guild);assert.equal(state.xp.guild.member.xp,490);
 now+=30000;await tracker.tick(guild);assert.equal(state.xp.guild.member.xp,500);
 guild.voiceStates.cache.clear();tracker.refresh(guild);now+=60000;await tracker.tick(guild);
 assert.equal((await loadState(file)).xp.guild.member.xp,500);
 guild.voiceStates.cache.set('member',voice);tracker.refresh(guild);now+=60000;await tracker.tick(guild);
 assert.equal((await loadState(file)).xp.guild.member.xp,510);
});

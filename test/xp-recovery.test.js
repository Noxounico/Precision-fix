import test from 'node:test';
import assert from 'node:assert/strict';
import { recoverXpFromRoles } from '../src/xp-recovery.js';
import { tiers } from '../src/xp-levels.js';
test('recupera mínimo do maior cargo, preserva XP superior e não anuncia níveis antigos', async () => {
 const member=(id,ids)=>({id,user:{bot:false},roles:{cache:new Map(ids.map(id=>[id,true]))}});
 const guild={id:'g',members:{fetch:async()=>new Map([
  ['a',member('a',[tiers[0][1],tiers[8][1]])],['b',member('b',[tiers[0][1]])],
 ])}};
 const state={xp:{g:{b:{xp:999,lastAwardAt:123}}}};let saves=0;
 assert.equal(await recoverXpFromRoles(guild,state,async()=>saves++),1);
 assert.equal(state.xp.g.a.xp,125000);assert.equal(state.xp.g.b.xp,999);
 assert.equal(await recoverXpFromRoles(guild,state,async()=>saves++),0);
 assert.equal(saves,1);
});

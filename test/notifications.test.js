import test from 'node:test';
import assert from 'node:assert/strict';
import { PermissionsBitField, PermissionFlagsBits as P } from 'discord.js';
import { handleNotifications, notificationPicker, offerJoinNotifications, defaultNotificationRoles } from '../src/notifications.js';
const guildId = '1560784472083800298', userId = '1560784472083800299';
function setup() {
 const added=[],removed=[],replies=[],logs=[];
 const cache=new Map();
 const role={id:defaultNotificationRoles.live,editable:true,mentionable:true,permissions:new PermissionsBitField()};
 const member={roles:{cache,add:async id=>{added.push(id);cache.set(id,true);},remove:async ids=>{removed.push(ids);for(const id of Array.isArray(ids)?ids:[ids])cache.delete(id);}}};
 const guild={id:guildId,roles:{fetch:async id=>({...role,id})},members:{me:{permissions:new PermissionsBitField(P.ManageRoles)},fetch:async()=>member}};
 const interaction={guildId,guild,user:{id:userId},isChatInputCommand:()=>true,isButton:()=>false,commandName:'notifyon',reply:async d=>replies.push(d),deferReply:async()=>{},editReply:async d=>replies.push(d)};
 return {added,removed,replies,logs,cache,role,guild,interaction,config:{guild:guildId},state:{},audit:{notifyOn:async(...args)=>logs.push(args)}};
}
const run=f=>handleNotifications(f.interaction,f.config,f.state,async()=>{},f.audit);
const button=(f,kind)=>{f.interaction.isChatInputCommand=()=>false;f.interaction.isButton=()=>true;f.interaction.customId=`notify:${guildId}:${userId}:${kind}`;};
test('/notifyon apresenta escolhas sem atribuir cargos; lives/vídeos independentes e toggle',async()=>{
 const f=setup();await run(f);assert.equal(f.added.length,0);assert.equal(f.replies[0].components[0].toJSON().components.length,3);
 button(f,'live');await run(f);button(f,'video');await run(f);
 assert.deepEqual(f.added,[defaultNotificationRoles.live,defaultNotificationRoles.video]);
 button(f,'live');await run(f);assert.equal(f.cache.has(defaultNotificationRoles.video),true);assert.deepEqual(f.removed,[defaultNotificationRoles.live]);
 f.interaction.isChatInputCommand=()=>true;f.interaction.isButton=()=>false;f.interaction.commandName='notifyoff';await run(f);
 assert.equal(f.cache.size,0);assert.equal(f.logs.length,4);
});
test('DM de entrada funciona e bot/outro membro não ganha cargos',async()=>{
 const f=setup();let sent;
 await offerJoinNotifications({id:userId,guild:f.guild,user:{bot:false},send:async p=>sent=p},f.config);
 assert.equal(sent.components[0].toJSON().components[0].custom_id,notificationPicker(guildId,userId).components[0].toJSON().components[0].custom_id);
 button(f,'live');f.interaction.guildId=null;f.interaction.guild=null;f.interaction.client={guilds:{fetch:async()=>f.guild}};await run(f);assert.equal(f.added.length,1);
 f.interaction.user.id='other';await run(f);assert.equal(f.added.length,1);assert.match(f.replies.at(-1).content,/pertence/);
});
test('recusa cargos privilegiados, não mencionáveis, geridos ou acima do bot',async()=>{
 for(const patch of [{permissions:new PermissionsBitField(P.Administrator)},{mentionable:false},{managed:true},{editable:false}]) {
  const f=setup();Object.assign(f.role,patch);button(f,'live');await run(f);assert.equal(f.added.length,0);assert.match(f.replies[0].content,/Não consegui/);
 }
});
test('cliques concorrentes não alternam a mesma preferência duas vezes',async()=>{
 const f=setup();button(f,'live');let release;f.interaction.guild.members.fetch=()=>new Promise(r=>release=r);
 const first=run(f);await new Promise(r=>setImmediate(r));await run(f);
 release({roles:{cache:f.cache,add:async id=>f.added.push(id)}});await first;assert.equal(f.added.length,1);
});

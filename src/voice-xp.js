import { multiplier, syncXpRoles } from './xp-levels.js';
import { announceLevel } from './level-announcements.js';
export class VoiceXp {
 constructor(config,state,persist,now=()=>Date.now()) {
  Object.assign(this,{config,state,persist,now}); this.active=new Map(); this.last=now();
  this.credit=new Map(Object.entries(state.voiceCredits?.[config.guild] || {}).map(([id,ms])=>[id,{ms,member:null}]));
 }
 refresh(guild) {
  if(guild.id!==this.config.guild) return;
  const now=this.now();
  for(const [id,member] of this.active) {
   const record=this.credit.get(id)||{ms:0,member};
   record.ms+=Math.max(0,now-this.last); record.member=member; this.credit.set(id,record);
  }
  this.last=now; this.active.clear();
  for(const voice of guild.voiceStates.cache.values()) {
   if(!voice.channelId || voice.channelId===guild.afkChannelId || !voice.member || voice.member.user.bot || voice.selfDeaf || voice.serverDeaf) continue;
   this.active.set(voice.id,voice.member);
  }
 }
 async tick(guild) {
  if(guild.id!==this.config.guild) return;
  this.refresh(guild);
  const members=[];
  for(const [id,credit] of this.credit) {
   const minutes=Math.floor(credit.ms/60000);
   if(!minutes) continue;
   credit.ms-=minutes*60000;
   const records=(this.state.xp||={})[this.config.guild]||= {};
   const record=records[id]||={xp:0,lastAwardAt:0};
   const before=record.xp;
   for(let i=0;i<minutes;i++) record.xp+=10*multiplier(record.xp);
   members.push([credit.member,record.xp,before]);
  }
  // Save incomplete minutes too. A restart resumes them without crediting downtime.
  (this.state.voiceCredits ||= {})[this.config.guild]=Object.fromEntries([...this.credit].filter(([,c])=>c.ms>0).map(([id,c])=>[id,c.ms]));
  await this.persist(this.state);
  for(const [member,xp,before] of members) {
   if(!member) continue;
   try {
    await syncXpRoles(member,xp);
    await announceLevel(guild,member.id,before,xp);
   } catch(error) { console.error(`Cargos/aviso de XP para ${member.id}: ${error.code || error.name}. XP guardado.`); }
  }
 }
}

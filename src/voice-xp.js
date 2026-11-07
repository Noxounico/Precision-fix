import { multiplier, syncXpRoles } from './xp-levels.js';
import { announceLevel } from './level-announcements.js';
export class VoiceXp {
 constructor(config,state,persist,now=()=>Date.now()) {
  Object.assign(this,{config,state,persist,now}); this.active=new Map(); this.credit=new Map(); this.last=now();
 }
 refresh(guild) {
  if(guild.id!==this.config.guild) return;
  const now=this.now();
  for(const [id,member] of this.active) {
   const record=this.credit.get(id)||{ms:0,member}; record.ms+=Math.max(0,now-this.last); this.credit.set(id,record);
  }
  this.last=now; this.active.clear();
  const rooms=new Map();
  for(const voice of guild.voiceStates.cache.values()) {
   if(!voice.channelId || voice.channelId===guild.afkChannelId || !voice.member || voice.member.user.bot) continue;
   const room=rooms.get(voice.channelId)||[]; room.push(voice); rooms.set(voice.channelId,room);
  }
  for(const room of rooms.values()) if(room.length>=2) for(const voice of room) {
   if(!voice.selfDeaf && !voice.serverDeaf) this.active.set(voice.id,voice.member);
  }
 }
 async tick(guild) {
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
  if(!members.length) return;
  await this.persist(this.state);
  for(const [member,xp,before] of members) {
   await syncXpRoles(member,xp);
   await announceLevel(guild,member.id,before,xp);
  }
 }
}

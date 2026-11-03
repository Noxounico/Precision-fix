import { ChannelType, PermissionFlagsBits as P } from 'discord.js';

export async function syncMemberCounter(guild) {
  const channels = await guild.channels.fetch();
  const name = `🟢 Membros: ${guild.memberCount}`;
  const existing = channels.find(channel => channel?.type === ChannelType.GuildVoice && /^🟢\s*Membros:\s*\d+$/.test(channel.name));
  if (existing) {
    if (existing.name !== name) await existing.setName(name, 'Atualizar total de membros');
    return existing;
  }
  return guild.channels.create({
    name,
    type: ChannelType.GuildVoice,
    position: 0,
    permissionOverwrites: [{ id: guild.id, allow: [P.ViewChannel], deny: [P.Connect] }],
    reason: 'Contador automático de membros do servidor',
  });
}

export function startMemberCounter(guild, report) {
  let busy = false;
  const update = async () => {
    if (busy) return;
    busy = true;
    try { await syncMemberCounter(guild); }
    catch (error) { report('Contador de membros (verifique Gerir canais)', error); }
    finally { busy = false; }
  };
  void update();
  // Batch joins/leaves to avoid repeatedly renaming a channel during busy periods.
  const timer = setInterval(() => { void update(); }, 5 * 60 * 1000);
  return () => clearInterval(timer);
}

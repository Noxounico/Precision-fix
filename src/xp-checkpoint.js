import { ChannelType } from 'discord.js';
const marker = 'precision-xp-checkpoint-v1';
const filename = 'xp-state.json';
export function mergeXpCheckpoint(state, checkpoint, guildId) {
  if (checkpoint.version !== 1 || checkpoint.guild !== guildId || !checkpoint.xp || typeof checkpoint.xp !== 'object' || Array.isArray(checkpoint.xp)) throw Error('Cópia de XP inválida');
  for (const [id, record] of Object.entries(checkpoint.xp)) {
    if (!/^\d{17,20}$/.test(id) || !Number.isSafeInteger(record?.xp) || record.xp < 0 || !Number.isFinite(record.lastAwardAt)) throw Error('Registo de XP inválido');
  }
  const records = (state.xp ||= {})[guildId] ||= {};
  let restored = 0;
  for (const [id, record] of Object.entries(checkpoint.xp)) {
    const local = records[id];
    if (!local || local.xp < record.xp) {
      records[id] = { xp: record.xp, lastAwardAt: Math.max(local?.lastAwardAt || 0, record.lastAwardAt) };
      restored++;
    }
  }
  return restored;
}
// One-time migration only: never create or update backup channels again.
export async function removeLegacyChannels(guild, state, persist, download = fetch) {
  const me = guild.members.me || await guild.members.fetchMe();
  const channels = await guild.channels.fetch();
  for (const channel of channels.values()) {
    if (channel?.type !== ChannelType.GuildText) continue;
    if (channel.topic === marker) {
      const messages = await channel.messages.fetch({ limit: 100 });
      const backups = [...messages.values()].filter(m => m.author.id === me.id && m.content === marker && [...m.attachments.values()].some(a => a.name === filename)).sort((a,b) => BigInt(a.id) > BigInt(b.id) ? -1 : 1);
      if (!backups.length && messages.size) throw Error('Não encontrei uma cópia válida no antigo canal de XP; não foi apagado.');
      if (backups.length) {
        const attachment = [...backups[0].attachments.values()].find(a => a.name === filename);
        if (attachment.size > 7_500_000) throw Error('Cópia de XP demasiado grande');
        const response = await download(attachment.url, { signal: AbortSignal.timeout(15000) });
        if (!response.ok) throw Error('Não consegui ler a cópia antiga de XP; o canal não foi apagado.');
        const body = await response.text();
        if (Buffer.byteLength(body) > 7_500_000) throw Error('Cópia de XP demasiado grande');
        mergeXpCheckpoint(state, JSON.parse(body), guild.id);
      }
      // Only remove the source after successfully writing its XP to storage.
      await persist(state);
      await channel.delete('XP migrado para armazenamento persistente; canal removido pelo proprietário');
    } else if (channel.topic === 'precision-shop-archive') {
      await channel.delete('Arquivo de compras removido pelo proprietário');
    }
  }
}

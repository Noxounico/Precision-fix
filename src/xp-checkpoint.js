import { AttachmentBuilder, ChannelType, PermissionFlagsBits as P } from 'discord.js';
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
export async function createXpCheckpoint(guild, state, persist, download = fetch) {
  const me = guild.members.me || await guild.members.fetchMe();
  const channels = await guild.channels.fetch();
  let channel = [...channels.values()].find(c => c?.type === ChannelType.GuildText && c.topic === marker);
  const rules = [{ id: guild.id, deny: [P.ViewChannel] }, { id: me.id, allow: [P.ViewChannel, P.SendMessages, P.ReadMessageHistory, P.AttachFiles] }];
  if (!channel) channel = await guild.channels.create({ name: 'xp-backup', type: ChannelType.GuildText, topic: marker, permissionOverwrites: rules, reason: 'Guardar XP entre reinícios e atualizações' });
  else await channel.permissionOverwrites.set(rules);
  const messages = await channel.messages.fetch({ limit: 100 });
  const backups = [...messages.values()].filter(m => m.author.id === me.id && m.content === marker && [...m.attachments.values()].some(a => a.name === filename)).sort((a,b) => BigInt(a.id) > BigInt(b.id) ? -1 : 1);
  let message = backups[0];
  if (message) {
    const attachment = [...message.attachments.values()].find(a => a.name === filename);
    if (attachment.size > 7_500_000) throw Error('Cópia de XP demasiado grande');
    const response = await download(attachment.url, { signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw Error('Não consegui ler a cópia de XP');
    const body = await response.text();
    if (Buffer.byteLength(body) > 7_500_000) throw Error('Cópia de XP demasiado grande');
    mergeXpCheckpoint(state, JSON.parse(body), guild.id);
    await persist(state);
  }
  let previous;
  let pending = Promise.resolve();
  return {
    flush() {
      const next = pending.then(async () => {
        const xp = JSON.stringify(state.xp?.[guild.id] || {});
        if (xp === previous) return;
        const content = JSON.stringify({ version: 1, guild: guild.id, xp: JSON.parse(xp) });
        if (Buffer.byteLength(content) > 7_500_000) throw Error('Cópia de XP demasiado grande');
        const payload = { content: marker, files: [new AttachmentBuilder(Buffer.from(content), { name: filename })], allowedMentions: { parse: [] } };
        if (message) message = await message.edit({ ...payload, attachments: [] });
        else message = await channel.send(payload);
        previous = xp;
      });
      pending = next.catch(() => {});
      return next;
    },
  };
}

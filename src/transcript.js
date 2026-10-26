import { AttachmentBuilder, PermissionFlagsBits as P } from 'discord.js';

export function supportOverwrites(guild, botId, roleIds, owner, closed = false) {
  const list = [
    { id: guild.id, deny: [P.ViewChannel] },
    { id: botId, allow: [P.ViewChannel, P.SendMessages, P.ReadMessageHistory, P.AttachFiles, P.ManageChannels] },
    ...roleIds.map(id => ({ id, allow: [P.ViewChannel, P.SendMessages, P.ReadMessageHistory, P.AttachFiles] })),
  ];
  if (owner) list.push({ id: owner, allow: [P.ViewChannel, P.ReadMessageHistory, P.AttachFiles, ...(closed ? [] : [P.SendMessages])], deny: closed ? [P.SendMessages] : [] });
  return list;
}
export async function syncTicketAccess(guild, config) {
  const me = guild.members.me || await guild.members.fetchMe();
  for (const id of config.ticketSupportRoles) {
    const role = await guild.roles.fetch(id);
    if (!role || role.id === guild.id || role.managed) throw Error('Cargo de suporte inválido');
  }
  const channels = await guild.channels.fetch();
  for (const channel of channels.values()) {
    const match = channel?.topic?.match(/^precision-ticket(-closed)?:(\d+)$/);
    if (!match) continue;
    await channel.permissionOverwrites.set(supportOverwrites(guild, me.id, config.ticketSupportRoles, match[2], !!match[1]));
  }
}
export async function transcriptParts(channel, ownerId, closedBy) {
  const messages = [];
  let before;
  while (true) {
    const page = await channel.messages.fetch({ limit: 100, ...(before ? { before } : {}) });
    if (!page.size) break;
    const batch = [...page.values()];
    messages.push(...batch);
    const oldest = batch.reduce((a, b) => BigInt(a.id) < BigInt(b.id) ? a : b).id;
    if (oldest === before) throw Error('Paginação da transcrição não avançou');
    before = oldest;
  }
  messages.sort((a, b) => BigInt(a.id) < BigInt(b.id) ? -1 : BigInt(a.id) > BigInt(b.id) ? 1 : 0);
  const header = `TRANSCRIÇÃO DO TICKET\nServidor: ${channel.guild.id}\nCanal: ${channel.name} (${channel.id})\nAutor: ${ownerId}\nFechado por: ${closedBy}\nExportado em: ${new Date().toISOString()}\n\n`;
  const parts = [];
  let text = header;
  for (const message of messages) {
    const attachments = [...(message.attachments?.values() || [])].map(file => `Anexo: ${file.url}`).join('\n');
    const embeds = (message.embeds || []).map(embed => [embed.title, embed.description, ...(embed.fields || []).map(f => `${f.name}: ${f.value}`), embed.url, embed.image?.url].filter(Boolean).join('\n')).join('\n');
    const entry = `[${new Date(message.createdTimestamp).toISOString()}] ${message.author?.tag || message.author?.username || 'Utilizador'} (${message.author?.id || '?'}) [${message.id}]\n${message.content || ''}\n${attachments}\n${embeds}\n\n`;
    if (Buffer.byteLength(text) + Buffer.byteLength(entry) > 7_500_000) { parts.push(Buffer.from(text)); text = header; }
    text += entry;
  }
  parts.push(Buffer.from(text));
  return parts;
}
export async function deliverTranscript(interaction, config, ownerId) {
  if (!config.messageContent) throw Error('Ative Message Content Intent para gerar transcrições completas');
  const archive = await interaction.guild.channels.fetch(config.ticketTranscriptChannel);
  if (!archive?.isTextBased() || archive.isThread() || archive.id === interaction.channel.id) throw Error('Canal de transcrições inválido');
  const me = interaction.guild.members.me || await interaction.guild.members.fetchMe();
  if (!interaction.channel.permissionsFor(me)?.has([P.ViewChannel, P.ReadMessageHistory])) throw Error('Falta Ver canal ou Ler histórico no ticket');
  // Transcripts are visible only to support roles, bot and Discord administrators.
  await archive.permissionOverwrites.set(supportOverwrites(interaction.guild, me.id, config.ticketSupportRoles));
  const parts = await transcriptParts(interaction.channel, ownerId, interaction.user.id);
  const files = () => parts.map((buffer, index) => new AttachmentBuilder(buffer, { name: `ticket-${interaction.channel.id}-${index + 1}.txt` }));
  const content = `Transcrição do ticket ${interaction.channel.id} · autor <@${ownerId}> · fechado por <@${interaction.user.id}>.`;
  const archiveFiles = files();
  for (let i = 0; i < archiveFiles.length; i += 10) await archive.send({ content, files: archiveFiles.slice(i, i + 10), allowedMentions: { parse: [] } });
  try {
    const owner = await interaction.client.users.fetch(ownerId);
    const dmFiles = files();
    for (let i = 0; i < dmFiles.length; i += 10) await owner.send({ content: `Aqui está a transcrição do teu ticket ${interaction.channel.id}.`, files: dmFiles.slice(i, i + 10), allowedMentions: { parse: [] } });
    return { dmSent: true };
  } catch { return { dmSent: false }; }
}

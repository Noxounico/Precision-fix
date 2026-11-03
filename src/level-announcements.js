import { PermissionFlagsBits as P } from 'discord.js';
export const levelChannel = '1567318868353884161';
export async function announceLevel(guild, id, before, after) {
  const oldLevel = Math.floor(Math.sqrt(before / 100));
  const level = Math.floor(Math.sqrt(after / 100));
  if (level <= oldLevel) return;
  const channel = await guild.channels.fetch(levelChannel);
  await channel.send({ content: `Parabéns <@${id}>, você passou para o nível **${level}**`, allowedMentions: { users: [id], parse: [] } });
}
export async function handleSetup(message, config) {
  if (message.guildId !== config.guild || message.author.bot || message.webhookId || message.content?.trim() !== '!setup') return false;
  if (!message.member?.permissions.has(P.ManageGuild)) {
    await message.reply('Precisas de Gerir servidor para usar !setup.'); return true;
  }
  const channel = await message.guild.channels.fetch(levelChannel);
  if (!channel?.isTextBased() || !channel.permissionsFor(message.guild.members.me)?.has([P.ViewChannel, P.SendMessages])) {
    await message.reply('Não consigo enviar os avisos: verifica as permissões no canal de níveis.'); return true;
  }
  await message.reply({ content: `✅ Sistema de níveis configurado! As subidas de nível serão anunciadas em <#${levelChannel}>.`, allowedMentions: { parse: [] } });
  return true;
}

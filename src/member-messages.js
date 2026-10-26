import { EmbedBuilder, escapeMarkdown } from 'discord.js';

export function memberMessage(member, welcome) {
  const avatar = member.displayAvatarURL?.({ size: 256 }) || member.user.displayAvatarURL({ size: 256 });
  const embed = new EmbedBuilder().setColor(0xffffff)
    .setAuthor({ name: `@${member.user.username}`, iconURL: avatar })
    .setThumbnail(avatar)
    .setTitle(welcome ? '👋 Bem-vindo/a!' : '👋 Até à próxima!')
    .setDescription(welcome
      ? `Bem-vindo/a, <@${member.id}>! Boa estadia no servidor **${escapeMarkdown(member.guild.name)}**!`
      : `<@${member.id}> saiu do servidor. Até à próxima!`)
    .setFooter({ text: `ID do utilizador: ${member.id}` });
  return {
    ...(welcome ? { content: `<@${member.id}>` } : {}),
    embeds: [embed],
    allowedMentions: { parse: [], users: welcome ? [member.id] : [] },
  };
}

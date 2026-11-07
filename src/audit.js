import { EmbedBuilder, PermissionFlagsBits as P } from 'discord.js';

export function createAuditLogger(client, config) {
  const send = async (kind, embed) => {
    const id = config.logChannels[kind];
    if (!id) return false;
    const channel = await client.channels.fetch(id);
    if (!channel || channel.guildId !== config.guild || !channel.isTextBased() || channel.isThread()) throw Error(`Canal de logs ${kind} inválido`);
    const me = channel.guild.members.me || await channel.guild.members.fetchMe();
    if (!channel.permissionsFor(me)?.has([P.ViewChannel, P.SendMessages, P.EmbedLinks])) throw Error(`Sem permissões no canal de logs ${kind}`);
    await channel.send({ embeds: [embed], allowedMentions: { parse: [] } });
    return true;
  };
  const base = title => new EmbedBuilder().setColor(0xffffff).setTitle(title).setTimestamp().setFooter({ text: 'Nox · Registo de atividade' });
  return {
    async member(member, joined) {
      if (member.guild.id !== config.guild) return false;
      const avatar = member.user.displayAvatarURL({ size: 128 });
      return send(joined ? 'join' : 'leave', base(joined ? '📥 Entrada no servidor' : '📤 Saída do servidor')
        .setAuthor({ name: `@${member.user.username}`, iconURL: avatar }).setThumbnail(avatar)
        .setDescription(`<@${member.id}> ${joined ? 'entrou no' : 'saiu do'} servidor.`)
        .addFields({ name: 'ID do membro', value: member.id }));
    },
  };
}

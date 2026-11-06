import { EmbedBuilder, PermissionFlagsBits as P } from 'discord.js';

export function createAuditLogger(client, config) {
  const destinations = new Set(Object.values(config.logChannels));
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
  const skipMessage = message => message.guildId !== config.guild || destinations.has(message.channelId) || message.author?.bot || message.webhookId;
  return {
    async member(member, joined) {
      if (member.guild.id !== config.guild) return false;
      const avatar = member.user.displayAvatarURL({ size: 128 });
      return send(joined ? 'join' : 'leave', base(joined ? '📥 Entrada no servidor' : '📤 Saída do servidor')
        .setAuthor({ name: `@${member.user.username}`, iconURL: avatar }).setThumbnail(avatar)
        .setDescription(`<@${member.id}> ${joined ? 'entrou no' : 'saiu do'} servidor.`)
        .addFields({ name: 'ID do membro', value: member.id }));
    },
    async message(message, action, previous) {
      if (skipMessage(message)) return false;
      // Embed/link previews also trigger updates. Do not log them as user edits.
      if (action === 'edit' && previous && !previous.partial && previous.content === message.content && previous.editedTimestamp === message.editedTimestamp) return false;
      const label = { create: '✉️ Mensagem enviada', edit: '✏️ Mensagem editada', delete: '🗑️ Mensagem apagada' }[action];
      const embed = base(label).addFields(
        { name: 'Canal', value: `<#${message.channelId}>`, inline: true },
        { name: 'Autor', value: message.author?.id ? `<@${message.author.id}>` : 'Indisponível (mensagem fora de cache)', inline: true },
        { name: 'ID da mensagem', value: message.id },
      );
      if (action !== 'delete') embed.setDescription(`[Abrir mensagem](https://discord.com/channels/${config.guild}/${message.channelId}/${message.id})`);
      // Do not copy private ticket content into the general message log.
      return send('messages', embed);
    },
    async bulkDelete(messages, channel) {
      if (!channel || channel.guildId !== config.guild || destinations.has(channel.id)) return false;
      return send('messages', base('🧹 Mensagens apagadas em conjunto').addFields(
        { name: 'Canal', value: `<#${channel.id}>`, inline: true },
        { name: 'Quantidade', value: String(messages.size), inline: true },
      ));
    },
    async notifyOn(user, description, command = 'notifyon') {
      return send('notify', base(`🔔 /${command}`).setDescription(description)
        .addFields({ name: 'Membro', value: `<@${user.id}>`, inline: true }, { name: 'ID', value: user.id, inline: true }));
    },
  };
}

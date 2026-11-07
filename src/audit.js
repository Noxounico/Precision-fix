import { AttachmentBuilder, EmbedBuilder, PermissionFlagsBits as P } from 'discord.js';

export function createAuditLogger(client, config) {
  const destinations = new Set(Object.values(config.logChannels));
  const snapshots = new Map();
  const send = async (kind, embed, files = []) => {
    const id = config.logChannels[kind];
    if (!id) return false;
    const channel = await client.channels.fetch(id);
    if (!channel || channel.guildId !== config.guild || !channel.isTextBased() || channel.isThread()) throw Error(`Canal de logs ${kind} inválido`);
    const me = channel.guild.members.me || await channel.guild.members.fetchMe();
    if (!channel.permissionsFor(me)?.has([P.ViewChannel, P.SendMessages, P.EmbedLinks])) throw Error(`Sem permissões no canal de logs ${kind}`);
    await channel.send({ embeds: [embed], files, allowedMentions: { parse: [] } });
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
      const cached = snapshots.get(message.id);
      const current = message.partial && cached ? { ...cached, ...message, author: message.author || cached.author, content: message.content ?? cached.content, attachments: message.attachments?.size ? message.attachments : cached.attachments } : message;
      if (skipMessage(current)) return false;
      const before = previous && !previous.partial ? previous : cached;
      const snapshot = m => ({ guildId: m.guildId, channelId: m.channelId, id: m.id, author: m.author, content: m.content, partial: m.partial, editedTimestamp: m.editedTimestamp, attachments: new Map(m.attachments || []) });
      if (action === 'delete') snapshots.delete(message.id);
      else {
        snapshots.set(message.id, snapshot(current));
        if (snapshots.size > 2000) snapshots.delete(snapshots.keys().next().value);
      }
      const text = m => !m || (m.partial && m.content == null) ? 'Indisponível (mensagem fora de cache ou conteúdo não recebido).' : m.content || '(Sem texto)';
      const links = m => [...(m?.attachments?.values() || [])].map(file => `${file.name || 'Anexo'}: ${file.url}`).join('\n');
      if (action === 'edit' && before && before.content === current.content && links(before) === links(current)) return false;
      const label = { create: '✉️ Mensagem enviada', edit: '✏️ Mensagem editada', delete: '🗑️ Mensagem apagada' }[action];
      const embed = base(label).addFields(
        { name: 'Canal', value: `<#${current.channelId}>`, inline: true },
        { name: 'Autor', value: current.author?.id ? `<@${current.author.id}>` : 'Indisponível (mensagem fora de cache)', inline: true },
        { name: 'ID da mensagem', value: current.id },
      );
      if (action !== 'delete') embed.setDescription(`[Abrir mensagem](https://discord.com/channels/${config.guild}/${current.channelId}/${current.id})`);
      const sections = action === 'edit' ? [['Antes', text(before)], ['Depois', text(current)]] : [['Conteúdo', text(current)]];
      const oldLinks = action === 'edit' ? links(before) : '';
      if (oldLinks) sections.push(['Anexos anteriores', oldLinks]);
      if (links(current)) sections.push(['Anexos', links(current)]);
      for (const [name, value] of sections) embed.addFields({ name, value: value.length > 1024 ? value.slice(0, 990) + '\n[… conteúdo completo no ficheiro]' : value });
      const files = sections.some(([, text]) => text.length > 1024) ? [new AttachmentBuilder(Buffer.from(sections.map(([name, value]) => `${name}:\n${value}`).join('\n\n')), { name: `mensagem-${current.id}.txt` })] : [];
      return send('messages', embed, files);
    },
    async bulkDelete(messages, channel) {
      if (!channel || channel.guildId !== config.guild || destinations.has(channel.id)) return false;
      await send('messages', base('🧹 Mensagens apagadas em conjunto').addFields(
        { name: 'Canal', value: `<#${channel.id}>`, inline: true },
        { name: 'Quantidade', value: String(messages.size), inline: true },
      ));
      for (const message of messages.values()) await this.message(message, 'delete');
      return true;
    },
    async notifyOn(user, description, command = 'notifyon') {
      return send('notify', base(`🔔 /${command}`).setDescription(description)
        .addFields({ name: 'Membro', value: `<@${user.id}>`, inline: true }, { name: 'ID', value: user.id, inline: true }));
    },
  };
}

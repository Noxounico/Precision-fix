import { scheduleTicketDeletion } from './ticket-cleanup.js';
import { ticketPanel, ticketWelcome } from './ticket-ui.js';
import { supportOverwrites, deliverTranscript } from './transcript.js';
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, PermissionFlagsBits as P, SlashCommandBuilder } from 'discord.js';

export const painelCommand = new SlashCommandBuilder().setName('painel')
  .setDescription('Envia o painel de tickets para este canal.')
  .setDefaultMemberPermissions(P.ManageGuild);
const buttons = (id, label, style) => [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(id).setLabel(label).setEmoji(id === 'tickets:open' ? '🎫' : '🔒').setStyle(style))];
const opening = new Set();
const closing = new Set();
const ticketOwner = channel => channel?.topic?.match(/^precision-ticket:(\d+)$/)?.[1];
const has = (permissions, ...flags) => !!permissions?.has(flags);

export async function handleTickets(interaction, config) {
  const panel = interaction.isChatInputCommand() && interaction.commandName === 'painel';
  const button = interaction.isButton() && ['tickets:open', 'tickets:close'].includes(interaction.customId);
  if (!panel && !button) return false;
  const reply = content => interaction.reply({ content, flags: 64, allowedMentions: { parse: [] } });
  if (interaction.guildId !== config.guild) {
    await reply('Este comando só funciona no servidor configurado.'); return true;
  }
  if (panel) {
    if (!has(interaction.memberPermissions, P.ManageGuild)) {
      await reply('Precisas da permissão Gerir servidor para publicar o painel.'); return true;
    }
    if (!has(interaction.appPermissions, P.SendMessages, P.EmbedLinks)) {
      await reply('Preciso de Enviar mensagens e Inserir links neste canal.'); return true;
    }
    await interaction.reply({ embeds: [ticketPanel(interaction.guild, config.banner)],
      components: buttons('tickets:open', 'Abrir ticket', ButtonStyle.Secondary), allowedMentions: { parse: [] } });
    return true;
  }
  const me = interaction.guild.members.me || await interaction.guild.members.fetchMe();
  if (!has(me.permissions, P.ManageChannels, P.ManageRoles)) {
    await reply('Preciso das permissões Gerir canais e Gerir cargos para criar tickets e configurar o acesso privado.'); return true;
  }
  if (interaction.customId === 'tickets:open') {
    const key = `${config.guild}:${interaction.user.id}`;
    if (opening.has(key)) { await reply('O teu ticket já está a ser aberto.'); return true; }
    opening.add(key);
    try {
      await interaction.deferReply({ flags: 64 });
      const channels = await interaction.guild.channels.fetch();
      const existing = channels.find(channel => ticketOwner(channel) === interaction.user.id);
      if (existing) { await interaction.editReply({ content: `Já tens um ticket aberto: <#${existing.id}>.`, allowedMentions: { parse: [] } }); return true; }
      for (const id of config.ticketSupportRoles) {
        const role = await interaction.guild.roles.fetch(id);
        if (!role || role.id === interaction.guild.id || role.managed) throw Error('Cargo de suporte inválido');
      }
      const overwrites = supportOverwrites(interaction.guild, me.id, config.ticketSupportRoles, interaction.user.id);
      // No inherited category permissions: every ticket starts private.
      const channel = await interaction.guild.channels.create({
        name: `ticket-${interaction.user.id}`, type: ChannelType.GuildText,
        topic: `precision-ticket:${interaction.user.id}`, permissionOverwrites: overwrites,
        reason: `Ticket solicitado pelo membro ${interaction.user.id}`,
      });
      await interaction.editReply({ content: `Ticket aberto: <#${channel.id}>.`, allowedMentions: { parse: [] } });
      await channel.send({ embeds: [ticketWelcome(interaction.guild, interaction.user.id, config.ticketSupportRoles)],
        components: buttons('tickets:close', 'Fechar ticket', ButtonStyle.Secondary), allowedMentions: { parse: [] } });
    } finally { opening.delete(key); }
    return true;
  }
  const owner = ticketOwner(interaction.channel);
  if (!owner) { await reply('Este canal não é um ticket aberto deste bot.'); return true; }
  const member = await interaction.guild.members.fetch(interaction.user.id);
  const staff = config.ticketSupportRoles.some(id => member.roles.cache.has(id));
  if (!staff) { await reply('Só os dois cargos de suporte configurados podem fechar este ticket.'); return true; }
  if (closing.has(interaction.channelId)) { await reply('Este ticket já está a ser fechado.'); return true; }
  closing.add(interaction.channelId);
  try {
    await interaction.deferReply({ flags: 64 });
    const delivery = await deliverTranscript(interaction, config, owner);
    // The archive succeeded. Only now mark this channel for deletion.
    await interaction.channel.permissionOverwrites.edit(owner, { SendMessages: false });
    const deleteAt = Date.now() + 5000;
    await interaction.channel.edit({ name: `fechado-${owner}`, topic: `precision-ticket-closed:${owner}:${deleteAt}` });
    scheduleTicketDeletion(interaction.channel, deleteAt);
    await interaction.editReply(delivery.dmSent
      ? 'Ticket fechado. Este canal será apagado em 5 segundos. Transcrição enviada para o arquivo e para o privado do autor.'
      : 'Ticket fechado. Este canal será apagado em 5 segundos. Transcrição guardada no arquivo, mas não foi possível enviá-la ao privado do autor (DMs fechadas ou envio recusado).');
    await interaction.message.edit({ components: [] });
    await interaction.channel.send({ content: '🔒 **Ticket encerrado**\nEste canal será apagado em **5 segundos**. A transcrição foi guardada no arquivo.', allowedMentions: { parse: [] } });
  } finally { closing.delete(interaction.channelId); }
  return true;
}

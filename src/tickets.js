import { scheduleTicketDeletion } from './ticket-cleanup.js';
import { shopRoles, isShopTicket } from './shop-access.js';
import { ticketPanel, ticketWelcome } from './ticket-ui.js';
import { supportOverwrites, deliverTranscript } from './transcript.js';
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, PermissionFlagsBits as P, SlashCommandBuilder } from 'discord.js';

export const painelCommand = new SlashCommandBuilder().setName('painel')
  .setDescription('Envia o painel de tickets para este canal.')
  .setDefaultMemberPermissions(P.ManageGuild);
const opening = new Set();
const closing = new Set();
const claiming = new Set();
const ticketOwner = channel => channel?.topic?.match(/^precision-(?:ticket|shop):(\d+)(?::claim:\d+)?$/)?.[1];
const has = (permissions, ...flags) => !!permissions?.has(flags);

export function ticketName(user, kind = 'normal') {
  const name = (user.username || user.id).normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 75) || user.id;
  return `ticket-${name}${kind === 'shop' ? '-compra' : kind === 'partnership' ? '-parceria' : ''}`;
}
export function ticketControls(shop, claimed = false) {
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('tickets:close').setLabel('Fechar ticket').setEmoji('🔒').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('tickets:claim').setLabel(claimed ? 'Ticket assumido' : 'Assumir ticket').setDisabled(claimed).setStyle(ButtonStyle.Primary),
  );
  if (shop) row.addComponents(new ButtonBuilder().setCustomId('tickets:cancel').setLabel('Cancelar compra').setStyle(ButtonStyle.Secondary));
  return [row];
}
export async function handleTickets(interaction, config) {
  const panel = interaction.isChatInputCommand() && interaction.commandName === 'painel';
  const button = interaction.isButton() && ['tickets:open', 'tickets:partnership', 'shop:open', 'tickets:close', 'tickets:claim', 'tickets:cancel'].includes(interaction.customId);
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
      components: [new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('tickets:open').setLabel('Abrir ticket').setEmoji('🎫').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('tickets:partnership').setLabel('Parceria').setEmoji('🤝').setStyle(ButtonStyle.Secondary))], allowedMentions: { parse: [] } });
    return true;
  }
  const me = interaction.guild.members.me || await interaction.guild.members.fetchMe();
  if (!has(me.permissions, P.ManageChannels, P.ManageRoles)) {
    await reply('Preciso das permissões Gerir canais e Gerir cargos para criar tickets e configurar o acesso privado.'); return true;
  }
  const shop = interaction.customId === 'shop:open' || isShopTicket(interaction.channel);
  const roles = shop ? shopRoles : config.ticketSupportRoles;
  if (['tickets:open', 'tickets:partnership', 'shop:open'].includes(interaction.customId)) {
    const key = `${config.guild}:${interaction.user.id}:${shop}`;
    if (opening.has(key)) { await reply('O teu ticket já está a ser aberto.'); return true; }
    opening.add(key);
    try {
      await interaction.deferReply({ flags: 64 });
      const channels = await interaction.guild.channels.fetch();
      const existing = channels.find(channel => ticketOwner(channel) === interaction.user.id && isShopTicket(channel) === shop);
      if (existing) { await interaction.editReply({ content: `Já tens um ticket aberto: <#${existing.id}>.`, allowedMentions: { parse: [] } }); return true; }
      for (const id of roles) {
        const role = await interaction.guild.roles.fetch(id);
        if (!role || role.id === interaction.guild.id || role.managed) throw Error('Cargo de suporte inválido');
      }
      const overwrites = supportOverwrites(interaction.guild, me.id, roles, interaction.user.id);
      // No inherited category permissions: every ticket starts private.
      const channel = await interaction.guild.channels.create({
        name: ticketName(interaction.user, shop ? 'shop' : interaction.customId === 'tickets:partnership' ? 'partnership' : 'normal'), type: ChannelType.GuildText,
        topic: `precision-${shop ? 'shop' : 'ticket'}:${interaction.user.id}`, permissionOverwrites: overwrites,
        reason: `Ticket solicitado pelo membro ${interaction.user.id}`,
      });
      await interaction.editReply({ content: `Ticket aberto: <#${channel.id}>.`, allowedMentions: { parse: [] } });
      const welcome = ticketWelcome(interaction.guild, interaction.user.id, roles, shop);
      if (shop) welcome.addFields({ name: '🛒 Loja Nox', value: 'Consulta os produtos e faz a tua compra na nossa loja:\n[**Abrir loja Nox**](https://nox-loja-production.up.railway.app/)' });
      await channel.send({ embeds: [welcome],
        components: ticketControls(shop), allowedMentions: { parse: [] } });
    } finally { opening.delete(key); }
    return true;
  }
  const owner = ticketOwner(interaction.channel);
  if (!owner) { await reply('Este canal não é um ticket aberto deste bot.'); return true; }
  const member = await interaction.guild.members.fetch(interaction.user.id);
  const staff = roles.some(id => member.roles.cache.has(id));
  if (interaction.customId === 'tickets:claim') {
    if (!staff) { await reply('Só a equipa autorizada pode assumir tickets.'); return true; }
    if (claiming.has(interaction.channelId) || closing.has(interaction.channelId)) { await reply('Este ticket já está a ser atualizado.'); return true; }
    claiming.add(interaction.channelId);
    try {
      await interaction.deferReply({ flags: 64 });
      const channel = await interaction.guild.channels.fetch(interaction.channelId);
      if (!ticketOwner(channel)) { await interaction.editReply('Este ticket já foi fechado.'); return true; }
      const claimant = channel.topic.match(/:claim:(\d+)$/)?.[1];
      if (claimant) { await interaction.editReply({ content: `Ticket já assumido por <@${claimant}>.`, allowedMentions: { parse: [] } }); return true; }
      await channel.edit({ topic: `${channel.topic}:claim:${interaction.user.id}` });
      await interaction.message.edit({ components: ticketControls(shop, true) });
      await channel.send({ content: `🙋 Ticket assumido por <@${interaction.user.id}>.`, allowedMentions: { parse: [] } });
      await interaction.editReply('Assumiste este ticket.');
    } finally { claiming.delete(interaction.channelId); }
    return true;
  }
  const cancel = interaction.customId === 'tickets:cancel';
  if (cancel && !shop) { await reply('Este ticket não é uma compra.'); return true; }
  if (!staff && !(cancel && interaction.user.id === owner)) { await reply('Só a equipa autorizada deste ticket pode fechá-lo.'); return true; }
  if (claiming.has(interaction.channelId)) { await reply('Este ticket está a ser assumido. Tenta novamente.'); return true; }
  if (closing.has(interaction.channelId)) { await reply('Este ticket já está a ser fechado.'); return true; }
  closing.add(interaction.channelId);
  try {
    await interaction.deferReply({ flags: 64 });
    if (cancel) await interaction.channel.send({ content: `❌ Compra cancelada por <@${interaction.user.id}>.`, allowedMentions: { parse: [] } });
    const delivery = await deliverTranscript(interaction, config, owner);
    // The archive succeeded. Only now mark this channel for deletion.
    await interaction.channel.permissionOverwrites.edit(owner, { SendMessages: false });
    const deleteAt = Date.now() + 5000;
    await interaction.channel.edit({ name: `fechado-${owner}`, topic: `precision-${shop ? 'shop' : 'ticket'}-closed:${owner}:${deleteAt}` });
    scheduleTicketDeletion(interaction.channel, deleteAt);
    await interaction.editReply(delivery.dmSent
      ? 'Ticket fechado. Este canal será apagado em 5 segundos. Transcrição guardada e enviada para o privado do autor.'
      : 'Ticket fechado. Este canal será apagado em 5 segundos. Transcrição guardada, mas não foi possível enviá-la ao privado do autor (DMs fechadas ou envio recusado).');
    await interaction.message.edit({ components: [] });
    await interaction.channel.send({ content: '🔒 **Ticket encerrado**\nEste canal será apagado em **5 segundos**. A transcrição foi guardada.', allowedMentions: { parse: [] } });
  } finally { closing.delete(interaction.channelId); }
  return true;
}

import { fileURLToPath } from 'node:url';
import { AttachmentBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits as P, SlashCommandBuilder } from 'discord.js';
export const lojaCommand = new SlashCommandBuilder().setName('loja').setDescription('Publicar a loja Nox Crosshair neste canal.').setDefaultMemberPermissions(P.ManageGuild);
export function shopPayload() {
  return {
    files: [new AttachmentBuilder(fileURLToPath(new URL('./assets/nox-crosshair.png', import.meta.url)), { name: 'nox-crosshair.png' })],
    embeds: [new EmbedBuilder().setColor(0x5865f2).setImage('attachment://nox-crosshair.png'),
      new EmbedBuilder().setColor(0x5865f2).setDescription('Adquira seu aim abaixo ⬇️')],
    components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('tickets:open').setLabel('Comprar').setEmoji('🛒').setStyle(ButtonStyle.Secondary))],
    allowedMentions: { parse: [] },
  };
}
export async function handleLoja(interaction, config) {
  if (!interaction.isChatInputCommand() || interaction.commandName !== 'loja') return false;
  if (interaction.guildId !== config.guild || !interaction.memberPermissions?.has(P.ManageGuild)) {
    await interaction.reply({ content: 'Precisas de Gerir servidor para publicar a loja neste servidor.', flags: 64 }); return true;
  }
  if (!interaction.appPermissions?.has([P.SendMessages, P.EmbedLinks, P.AttachFiles])) {
    await interaction.reply({ content: 'Preciso de Enviar mensagens, Inserir links e Anexar ficheiros neste canal.', flags: 64 }); return true;
  }
  await interaction.deferReply();
  await interaction.editReply(shopPayload());
  return true;
}

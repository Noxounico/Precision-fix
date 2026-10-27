import { PermissionFlagsBits as P, SlashCommandBuilder } from 'discord.js';
export const clearCommand = new SlashCommandBuilder().setName('clear')
  .setDescription('Apagar até 100 mensagens recentes deste canal.')
  .setDefaultMemberPermissions(P.ManageMessages)
  .addIntegerOption(option => option.setName('quantidade').setDescription('Quantidade de mensagens (1 a 100).').setRequired(true).setMinValue(1).setMaxValue(100));
export async function handleClear(interaction, config) {
  if (!interaction.isChatInputCommand() || interaction.commandName !== 'clear') return false;
  const reply = content => interaction.reply({ content, flags: 64 });
  if (interaction.guildId !== config.guild || !interaction.memberPermissions?.has(P.ManageMessages)) {
    await reply('Precisas de Gerir mensagens no servidor configurado para usar este comando.'); return true;
  }
  if (!interaction.appPermissions?.has([P.ManageMessages, P.ReadMessageHistory]) || !interaction.channel?.bulkDelete) {
    await reply('Preciso de Gerir mensagens e Ler histórico num canal que permita limpeza.'); return true;
  }
  const amount = interaction.options.getInteger('quantidade');
  if (!Number.isInteger(amount) || amount < 1 || amount > 100) { await reply('Escolhe uma quantidade entre 1 e 100.'); return true; }
  await interaction.deferReply({ flags: 64 });
  const messages = await interaction.channel.messages.fetch({ limit: amount });
  const cutoff = Date.now() - 14 * 86400000;
  const eligible = messages.filter(message => !message.pinned && message.createdTimestamp > cutoff + 10000);
  const removed = eligible.size ? await interaction.channel.bulkDelete(eligible, true) : { size: 0 };
  await interaction.editReply(`🧹 ${removed.size} mensagem(ns) apagada(s). Mensagens fixadas ou com 14 dias ou mais são preservadas.`);
  return true;
}

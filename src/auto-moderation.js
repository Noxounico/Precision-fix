import { ChannelType, PermissionFlagsBits as P, SlashCommandBuilder } from 'discord.js';

export const banCommand = new SlashCommandBuilder().setName('ban')
  .setDescription('Ativar neste canal o aviso e banimento automático de quem escrever.')
  .setDefaultMemberPermissions(P.Administrator);

export const banWarning = '**NÃO MANDE MENSAGEM AQUI**\nCanal criado para banir contas com grab. **NÃO MANDE MENSAGEM AQUI** Caso mande, tomara punições indesejadas.';

export async function assignJoinRole(member, config) {
  if (member.guild.id !== config.guild) return false;
  await member.roles.add(config.joinRole, 'Cargo automático de entrada');
  return true;
}

export async function handleBan(interaction, config, state, persist) {
  if (!interaction.isChatInputCommand() || interaction.commandName !== 'ban') return false;
  const reply = content => interaction.reply({ content, flags: 64 });
  if (interaction.guildId !== config.guild || !interaction.memberPermissions?.has(P.Administrator)) {
    await reply('Só administradores do servidor configurado podem ativar este canal.');
    return true;
  }
  if (interaction.channel?.type !== ChannelType.GuildText ||
      !interaction.appPermissions?.has([P.ViewChannel, P.SendMessages, P.BanMembers])) {
    await reply('Usa um canal de texto onde eu possa Ver canal, Enviar mensagens e Banir membros.');
    return true;
  }
  await interaction.deferReply({ flags: 64 });
  await interaction.channel.send({ content: banWarning, allowedMentions: { parse: [] } });
  const previous = state.banChannels;
  state.banChannels = [...new Set([...(previous || []), interaction.channelId])];
  try { await persist(state); }
  catch (error) { state.banChannels = previous; throw error; }
  await interaction.editReply('Canal ativado: quem escrever aqui será banido do servidor. Bots são ignorados; a hierarquia do Discord continua a aplicar-se.');
  return true;
}

export async function enforceBanChannel(message, config, state) {
  if (message.guildId !== config.guild || message.author?.bot || message.webhookId) return false;
  // Include threads below an activated channel, so they cannot bypass the rule.
  if (!state.banChannels?.includes(message.channelId) && !state.banChannels?.includes(message.channel?.parentId)) return false;
  await message.guild.members.ban(message.author.id, { reason: 'Enviou mensagem no canal com aviso NÃO MANDE MENSAGEM AQUI' });
  await message.delete();
  return true;
}

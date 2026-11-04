export const commandChannels = ['1560785990354862121', '1567318811399684119'];
const notice = `Usa os comandos em ${commandChannels.map(id => `<#${id}>`).join(' ou ')}.`;
export function commandBlocked(channelId, state) {
  return state.commandsRestricted === true && !commandChannels.includes(channelId);
}
export async function restrictInteraction(interaction, config, state) {
  if (interaction.guildId !== config.guild || !interaction.isChatInputCommand() || !commandBlocked(interaction.channelId, state)) return false;
  await interaction.reply({ content: notice, flags: 64, allowedMentions: { parse: [] } });
  return true;
}
export async function restrictMessage(message, config, state, persist) {
  if (message.guildId !== config.guild || message.author.bot || message.webhookId) return false;
  if (message.content?.trim() === '!comandos') {
    if (message.author.id !== message.guild.ownerId) {
      await message.reply({ content: 'Só o dono do servidor pode usar !comandos.', allowedMentions: { parse: [], repliedUser: false } });
      return true;
    }
    const previous = state.commandsRestricted;
    state.commandsRestricted = previous !== true;
    try { await persist(state); }
    catch (error) { state.commandsRestricted = previous; throw error; }
    await message.reply({ content: state.commandsRestricted ? `🔒 Comandos limitados. ${notice}` : '🔓 Comandos permitidos em todos os canais.', allowedMentions: { parse: [], repliedUser: false } });
    return true;
  }
  if (message.content?.trimStart().startsWith('!') && commandBlocked(message.channelId, state)) {
    await message.reply({ content: notice, allowedMentions: { parse: [], repliedUser: false } });
    return true;
  }
  return false;
}

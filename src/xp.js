import { xpCommand, publishLevels } from './xp-levels.js';
import { EmbedBuilder } from 'discord.js';

export const xpCommands = [xpCommand];
export function levelInfo(xp) {
  const level = Math.floor(Math.sqrt(xp / 100));
  return { level, next: 100 * (level + 1) ** 2 };
}
export function leaderboard(state, guildId) {
  return Object.entries(state.xp?.[guildId] || {})
    .sort(([idA, a], [idB, b]) => b.xp - a.xp || idA.localeCompare(idB));
}
export async function handleXp(interaction, config, state) {
  if (!interaction.isChatInputCommand() || interaction.commandName !== 'xp') return false;
  if (interaction.guildId !== config.guild) {
    await interaction.reply({ content: 'Este comando só funciona no servidor configurado.', flags: 64 });
    return true;
  }
  if (interaction.options.getSubcommand() === 'mensagem') {
    await publishLevels(interaction); return true;
  }
  const entries = leaderboard(state, config.guild);
  const embed = new EmbedBuilder().setColor(0xffffff);
  {
    const user = interaction.user;
    const xp = state.xp?.[config.guild]?.[user.id]?.xp || 0;
    const { level, next } = levelInfo(xp);
    const position = entries.findIndex(([id]) => id === user.id);
    embed.setTitle('🏅 Nível e XP').setDescription(`<@${user.id}>`)
      .addFields({ name: 'Nível', value: String(level), inline: true },
        { name: 'XP', value: `${xp} / ${next}`, inline: true },
        { name: 'Posição', value: position < 0 ? 'Sem posição' : `#${position + 1}`, inline: true });
  }
  await interaction.reply({ embeds: [embed], allowedMentions: { parse: [] } });
  return true;
}

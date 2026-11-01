import { multiplier, xpCommand, publishLevels, syncXpRoles } from './xp-levels.js';
import { EmbedBuilder, SlashCommandBuilder } from 'discord.js';

export const xpCommands = [xpCommand,
  new SlashCommandBuilder().setName('rank').setDescription('Mostra o teu nível e XP.')
    .addUserOption(option => option.setName('usuario').setDescription('Consultar outro membro (opcional).')),
  new SlashCommandBuilder().setName('top').setDescription('Top 10 de XP do servidor.'),
];
export function levelInfo(xp) {
  const level = Math.floor(Math.sqrt(xp / 100));
  return { level, next: 100 * (level + 1) ** 2 };
}
export function leaderboard(state, guildId) {
  return Object.entries(state.xp?.[guildId] || {})
    .sort(([idA, a], [idB, b]) => b.xp - a.xp || idA.localeCompare(idB));
}
export async function awardXp(message, config, state, persist) {
  if (message.guildId !== config.guild || message.author.bot || message.webhookId) return false;
  const guild = (state.xp ||= {})[config.guild] ||= {};
  const previous = guild[message.author.id];
  const now = message.createdTimestamp;
  if (!Number.isFinite(now) || (previous && now - previous.lastAwardAt < 60000)) return false;
  guild[message.author.id] = { xp: (previous?.xp || 0) + 15 * multiplier(previous?.xp || 0), lastAwardAt: now };
  await persist(state);
  await syncXpRoles(message.member, guild[message.author.id].xp);
  return true;
}
export async function handleXp(interaction, config, state) {
  if (!interaction.isChatInputCommand() || !['rank', 'top', 'xp'].includes(interaction.commandName)) return false;
  if (interaction.guildId !== config.guild) {
    await interaction.reply({ content: 'Este comando só funciona no servidor configurado.', flags: 64 });
    return true;
  }
  if (interaction.commandName === 'xp' && interaction.options.getSubcommand() === 'mensagem') {
    await publishLevels(interaction); return true;
  }
  const entries = leaderboard(state, config.guild);
  const embed = new EmbedBuilder().setColor(0xffffff);
  if (interaction.commandName === 'rank' || interaction.commandName === 'xp') {
    const user = (interaction.commandName === 'rank' ? interaction.options.getUser('usuario') : null) || interaction.user;
    const xp = state.xp?.[config.guild]?.[user.id]?.xp || 0;
    const { level, next } = levelInfo(xp);
    const position = entries.findIndex(([id]) => id === user.id);
    embed.setTitle('🏅 Nível e XP').setDescription(`<@${user.id}>`)
      .addFields({ name: 'Nível', value: String(level), inline: true },
        { name: 'XP', value: `${xp} / ${next}`, inline: true },
        { name: 'Posição', value: position < 0 ? 'Sem posição' : `#${position + 1}`, inline: true });
  } else {
    embed.setTitle('🏆 Top 10 de XP').setDescription(entries.slice(0, 10)
      .map(([id, record], index) => `**${index + 1}.** <@${id}> — nível ${levelInfo(record.xp).level} · ${record.xp} XP`)
      .join('\n') || 'Ainda não há XP. Participa na conversa para começar!');
  }
  await interaction.reply({ embeds: [embed], allowedMentions: { parse: [] } });
  return true;
}

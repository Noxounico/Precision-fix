import { PermissionFlagsBits as P, SlashCommandBuilder } from 'discord.js';
const jobs = new Map();
export const notificationCommands = [
  new SlashCommandBuilder().setName('notifyon').setDescription('Receber avisos de lives e vídeos através do cargo de notificações.'),
  new SlashCommandBuilder().setName('notifyoff').setDescription('Deixar de receber os avisos do cargo de notificações.'),
];
export async function notificationRole(guild, config, state, persist, create) {
  const key = guild.id;
  if (jobs.has(key)) return jobs.get(key);
  const job = (async () => {
    const id = config.role || state.notificationRoles?.[key];
    let role = id ? await guild.roles.fetch(id) : null;
    if (config.role && !role) throw Error('O NOTIFICATION_ROLE_ID configurado não existe neste servidor.');
    if (!role && create) {
      role = await guild.roles.create({ name: 'Notificações', permissions: [], mentionable: true, reason: 'Cargo de adesão aos avisos de lives e vídeos (/notifyon)' });
    }
    if (!role) return null;
    if (role.id === guild.id || role.managed || !role.editable || role.permissions.bitfield !== 0n) {
      throw Error('Usa um cargo de notificações sem permissões próprias, não gerido e abaixo do cargo do bot.');
    }
    if (!role.mentionable) throw Error('O cargo de notificações deve estar configurado como mencionável para receber os avisos.');
    if (!config.role) {
      (state.notificationRoles ||= {})[key] = role.id;
      await persist(state);
    }
    return role;
  })();
  jobs.set(key, job);
  try { return await job; } finally { if (jobs.get(key) === job) jobs.delete(key); }
}
export async function handleNotifications(interaction, config, state, persist, audit) {
  if (!interaction.isChatInputCommand() || !['notifyon', 'notifyoff'].includes(interaction.commandName)) return false;
  if (interaction.guildId !== config.guild) {
    await interaction.reply({ content: 'Este comando só funciona no servidor configurado.', flags: 64 }); return true;
  }
  await interaction.deferReply({ flags: 64 });
  const subscribe = interaction.commandName === 'notifyon';
  try {
    const me = interaction.guild.members.me || await interaction.guild.members.fetchMe();
    if (!me.permissions.has(P.ManageRoles)) throw Error('O bot precisa de Gerir cargos para ativar as notificações.');
    const role = await notificationRole(interaction.guild, config, state, persist, subscribe);
    const member = await interaction.guild.members.fetch(interaction.user.id);
    const already = role && member.roles.cache.has(role.id);
    if (subscribe && !already) await member.roles.add(role.id, 'Adesão voluntária via /notifyon');
    if (!subscribe && already) await member.roles.remove(role.id, 'Cancelamento voluntário via /notifyoff');
    const description = subscribe ? (already ? 'Já tinha as notificações ativadas.' : 'Ativou as notificações de lives e vídeos.')
      : (already ? 'Desativou as notificações de lives e vídeos.' : 'Já tinha as notificações desativadas.');
    await interaction.editReply(`${subscribe ? '🔔' : '🔕'} ${description}${subscribe ? ' Usa /notifyoff para deixar de receber avisos.' : ''}`);
    await audit.notifyOn(interaction.user, `${description}${role ? ` Cargo: <@&${role.id}>.` : ''}`, interaction.commandName)
      .catch(error => console.error(`Log de notificações falhou (código: ${error.code || error.name}).`));
  } catch (error) {
    await interaction.editReply(`Não consegui alterar as notificações. ${error.code ? `Discord: código ${error.code}. Verifica Gerir cargos e a posição do cargo do bot.` : error.message}`);
    await audit.notifyOn(interaction.user, `Falha em /${interaction.commandName} (código: ${error.code || error.name}).`, interaction.commandName)
      .catch(() => {});
  }
  return true;
}

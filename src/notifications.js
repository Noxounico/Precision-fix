import { ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits as P, SlashCommandBuilder } from 'discord.js';

export const notificationCommands = [
  new SlashCommandBuilder().setName('notifyon').setDescription('Escolher notificações de vídeos, lives ou ambas.'),
  new SlashCommandBuilder().setName('notifyoff').setDescription('Desativar as notificações de vídeos e lives.'),
];
export const defaultNotificationRoles = Object.freeze({ live: '1568356044131012699', video: '1567842947238465608' });
export const notificationRoleId = (config, kind) => config.notificationRoles?.[kind] || defaultNotificationRoles[kind];
export function notificationPicker(guildId, userId) {
  return {
    content: '🔔 **Que notificações queres receber?**\nCarrega em **Lives** ou **Vídeos** para ativar/desativar cada opção. Podes escolher ambas ou nenhuma.',
    components: [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`notify:${guildId}:${userId}:live`).setLabel('Lives').setEmoji('🔴').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`notify:${guildId}:${userId}:video`).setLabel('Vídeos').setEmoji('🎬').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`notify:${guildId}:${userId}:off`).setLabel('Desativar todas').setStyle(ButtonStyle.Danger),
    )], allowedMentions: { parse: [] },
  };
}
export async function offerJoinNotifications(member, config) {
  if (member.guild.id !== config.guild || member.user.bot) return false;
  await member.send(notificationPicker(config.guild, member.id));
  return true;
}
const busy = new Set();
export async function handleNotifications(interaction, config, state, persist, audit) {
  const command = interaction.isChatInputCommand() && ['notifyon', 'notifyoff'].includes(interaction.commandName);
  const match = interaction.isButton?.() && interaction.customId.match(/^notify:(\d+):(\d+):(live|video|off)$/);
  if (!command && !match) return false;
  const reply = content => interaction.reply({ content, flags: 64, allowedMentions: { parse: [] } });
  if ((command && interaction.guildId !== config.guild) || (match && (match[1] !== config.guild || match[2] !== interaction.user.id || (interaction.guildId && interaction.guildId !== config.guild)))) {
    await reply('Esta escolha pertence ao membro e servidor indicados.'); return true;
  }
  if (command && interaction.commandName === 'notifyon') {
    await interaction.reply({ ...notificationPicker(config.guild, interaction.user.id), flags: 64 }); return true;
  }
  const key = `${config.guild}:${interaction.user.id}`;
  if (busy.has(key)) { await reply('A tua escolha está a ser guardada. Tenta novamente.'); return true; }
  busy.add(key);
  try {
    await interaction.deferReply({ flags: 64 });
    const guild = interaction.guild || await interaction.client.guilds.fetch(config.guild);
    const me = guild.members.me || await guild.members.fetchMe();
    if (!me.permissions.has(P.ManageRoles)) throw Error('O bot precisa de Gerir cargos para alterar as notificações.');
    const member = await guild.members.fetch(interaction.user.id);
    const kind = match ? match[3] : 'off';
    const kinds = kind === 'off' ? ['live', 'video'] : [kind];
    // Validate every role before making changes; never grant privileged roles.
    for (const type of kinds) {
      const role = await guild.roles.fetch(notificationRoleId(config, type));
      if (!role || role.id === guild.id || role.managed || !role.editable || role.permissions.bitfield !== 0n || !role.mentionable) {
        throw Error('Os cargos de notificações devem existir, ser mencionáveis, sem permissões e estar abaixo do bot.');
      }
    }
    let description;
    if (kind === 'off') {
      const ids = kinds.map(type => notificationRoleId(config, type));
      // Also remove the previous combined subscription when migrating old members.
      for (const id of [config.role, state.notificationRoles?.[config.guild]]) if (id && member.roles.cache.has(id)) ids.push(id);
      await member.roles.remove([...new Set(ids)], 'Cancelamento voluntário das notificações');
      description = 'Desativaste as notificações de lives e vídeos.';
    } else {
      const id = notificationRoleId(config, kind);
      const enabled = !member.roles.cache.has(id);
      if (enabled) await member.roles.add(id, 'Adesão voluntária às notificações');
      else await member.roles.remove(id, 'Cancelamento voluntário das notificações');
      description = `${enabled ? 'Ativaste' : 'Desativaste'} as notificações de ${kind === 'live' ? 'lives' : 'vídeos'}.`;
    }
    await interaction.editReply({ content: `🔔 ${description}`, allowedMentions: { parse: [] } });
    await audit.notifyOn(interaction.user, description, kind === 'off' ? 'notifyoff' : 'notifyon').catch(error => console.error(`Log de notificações falhou (código: ${error.code || error.name}).`));
  } catch (error) {
    await interaction.editReply({ content: `Não consegui alterar as notificações. ${error.code ? `Discord: código ${error.code}. Verifica Gerir cargos e a posição do cargo do bot.` : error.message}`, allowedMentions: { parse: [] } });
    await audit.notifyOn(interaction.user, `Falha ao alterar notificações (código: ${error.code || error.name}).`, 'notifyon').catch(() => {});
  } finally { busy.delete(key); }
  return true;
}

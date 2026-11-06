export const commandChannels = ['1560785990354862121', '1567318811399684119'];
export const restrictedRole = '1567524636843974668';
export async function restrictMessage(message, config) {
  if (message.guildId !== config.guild || message.author.bot || message.webhookId || message.content?.trim() !== '!comandos') return false;
  const reply = content => message.reply({ content, allowedMentions: { parse: [], repliedUser: false } });
  if (message.author.id !== message.guild.ownerId) {
    await reply('Só o dono do servidor pode usar !comandos.'); return true;
  }
  const channels = await message.guild.channels.fetch();
  if (commandChannels.some(id => !channels.get(id)?.permissionOverwrites)) {
    await reply('Não encontrei os dois canais autorizados. Nenhuma permissão foi alterada.'); return true;
  }
  let changed = 0; const failed = [];
  for (const channel of channels.values()) {
    if (!channel?.permissionOverwrites) continue;
    try {
      for (const roleId of [message.guild.id, restrictedRole]) {
        await channel.permissionOverwrites.edit(roleId, {
          UseApplicationCommands: commandChannels.includes(channel.id),
        }, { reason: 'Restringir comandos de aplicativo aos dois canais autorizados' });
      }
      changed++;
    } catch { failed.push(channel.id); }
  }
  await reply('✅ Permissão “Usar comandos de aplicativo” atualizada em '+changed+' canais para @everyone e <@&'+restrictedRole+'>. Permitida apenas em '+commandChannels.map(id=>'<#'+id+'>').join(' e ')+'.'+(failed.length ? '\nFalhou em: '+failed.map(id=>'<#'+id+'>').join(', ')+'. Verifica as permissões do bot.' : '')+'\nAdministradores e permissões explícitas de outros cargos/membros podem sobrepor-se a esta regra.');
  return true;
}

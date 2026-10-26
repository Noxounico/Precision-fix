import { divulgarCommand } from './divulgar.js';
import { xpCommands } from './xp.js';
import { painelCommand } from './tickets.js';

export async function registerCommands(guild) {
  const commands = await guild.commands.fetch();
  for (const definition of [divulgarCommand, painelCommand, ...xpCommands]) {
    const data = definition.toJSON();
    const existing = commands.find(command => command.name === data.name && command.type === 1);
    if (existing) await guild.commands.edit(existing.id, data);
    else await guild.commands.create(data);
  }
}

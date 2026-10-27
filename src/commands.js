import { clearCommand } from './moderation.js';
import { backupCommands } from './backup.js';
import { divulgarCommand } from './divulgar.js';
import { xpCommands } from './xp.js';
import { painelCommand } from './tickets.js';

export async function registerCommands(guild, globalManager = guild.client?.application?.commands) {
  const definitions = [divulgarCommand, painelCommand, ...xpCommands, clearCommand, ...backupCommands];
  const active = new Set(definitions.map(command => command.name));
  const commands = await guild.commands.fetch();
  for (const definition of definitions) {
    const data = definition.toJSON();
    const existing = commands.find(command => command.name === data.name && command.type === 1);
    if (existing) await guild.commands.edit(existing.id, data);
    else await guild.commands.create(data);
  }
  // These managers only address this application's commands, never other bots.
  // Register replacements first; if that fails, leave old commands intact.
  for (const command of commands.values()) {
    if (command.type !== 1 || !active.has(command.name)) await guild.commands.delete(command.id);
  }
  if (globalManager) {
    const globals = await globalManager.fetch();
    // This bot now uses guild commands only; remove stale global duplicates too.
    for (const command of globals.values()) await globalManager.delete(command.id);
  }
}

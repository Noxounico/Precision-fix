import { tiers } from './xp-levels.js';
export async function recoverXpFromRoles(guild, state, persist) {
  const members = await guild.members.fetch();
  let restored = 0;
  for (const member of members.values()) {
    if (member.user.bot) continue;
    const floor = Math.max(0, ...tiers.filter(([, id]) => member.roles.cache.has(id)).map(([xp]) => xp));
    if (!floor) continue;
    const records = (state.xp ||= {})[guild.id] ||= {};
    const previous = records[member.id];
    if ((previous?.xp || 0) >= floor) continue;
    records[member.id] = { ...previous, xp: floor, lastAwardAt: previous?.lastAwardAt || 0 };
    restored++;
  }
  if (restored) await persist(state);
  return restored;
}

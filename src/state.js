import { readFile, mkdir, writeFile, rename } from 'node:fs/promises';
import { dirname } from 'node:path';
export async function loadState(file) {
  try {
    const state = JSON.parse(await readFile(file, 'utf8'));
    if (state.version !== 1 || typeof state.accounts !== 'object' || !state.accounts || Array.isArray(state.accounts)) throw Error('invalid');
    for (const account of Object.values(state.accounts)) {
      if (!account || typeof account.live !== 'boolean' || !Array.isArray(account.videos) || !account.videos.every(id => typeof id === 'string')) throw Error('invalid');
    }
    if (state.notificationRoles !== undefined && (!state.notificationRoles || typeof state.notificationRoles !== 'object' || Array.isArray(state.notificationRoles) || Object.values(state.notificationRoles).some(id => typeof id !== 'string' || !/^\d{17,20}$/.test(id)))) throw Error('invalid');
    if (state.banChannels !== undefined && (!Array.isArray(state.banChannels) || !state.banChannels.every(id => typeof id === 'string' && /^\d{17,20}$/.test(id)))) throw Error('invalid');
    if (state.voiceCredits !== undefined) {
      if (!state.voiceCredits || typeof state.voiceCredits !== 'object' || Array.isArray(state.voiceCredits)) throw Error('invalid');
      for (const members of Object.values(state.voiceCredits)) {
        if (!members || typeof members !== 'object' || Array.isArray(members) || Object.values(members).some(ms => !Number.isFinite(ms) || ms < 0 || ms >= 60000)) throw Error('invalid');
      }
    }
    if (state.giveaways !== undefined) {
      if (!state.giveaways || typeof state.giveaways !== 'object' || Array.isArray(state.giveaways)) throw Error('invalid');
      const snowflake = id => typeof id === 'string' && /^\d{17,20}$/.test(id);
      for (const [id, record] of Object.entries(state.giveaways)) {
        if (!record || !snowflake(id) || record.messageId !== id || !snowflake(record.guildId) || !snowflake(record.channelId) || !Number.isSafeInteger(record.endsAt) || record.endsAt <= 0 || typeof record.completed !== 'boolean') throw Error('invalid');
        if (!Array.isArray(record.participants) || !record.participants.every(snowflake) || new Set(record.participants).size !== record.participants.length) throw Error('invalid');
        if (record.winners !== null && (!Array.isArray(record.winners) || record.winners.length > 2 || new Set(record.winners).size !== record.winners.length || !record.winners.every(winner => record.participants.includes(winner)))) throw Error('invalid');
        if (record.completed && record.winners === null) throw Error('invalid');
      }
    }
    if (state.xp !== undefined) {
      if (!state.xp || typeof state.xp !== 'object' || Array.isArray(state.xp)) throw Error('invalid');
      for (const members of Object.values(state.xp)) {
        if (!members || typeof members !== 'object' || Array.isArray(members)) throw Error('invalid');
        for (const record of Object.values(members)) {
          if (!Number.isSafeInteger(record.xp) || record.xp < 0 || !Number.isFinite(record.lastAwardAt)) throw Error('invalid');
        }
      }
    }
    return state;
  } catch (error) {
    if (error.code === 'ENOENT') return { version: 1, accounts: {} };
    throw new Error('Estado inválido ou ilegível; recuperar o ficheiro antes de arrancar para evitar avisos duplicados.');
  }
}
async function writeState(file, state) {
  await mkdir(dirname(file), { recursive: true });
  await writeFile(`${file}.tmp`, JSON.stringify(state, null, 2), { mode: 0o600 });
  await rename(`${file}.tmp`, file);
}

let pending = Promise.resolve();
export function saveState(file, state) {
  const snapshot = structuredClone(state);
  const next = pending.then(() => writeState(file, snapshot));
  pending = next.catch(() => {});
  return next;
}

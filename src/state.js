import { readFile, mkdir, writeFile, rename } from 'node:fs/promises';
import { dirname } from 'node:path';
export async function loadState(file) {
  try {
    const state = JSON.parse(await readFile(file, 'utf8'));
    if (state.version !== 1 || typeof state.accounts !== 'object' || !state.accounts || Array.isArray(state.accounts)) throw Error('invalid');
    for (const account of Object.values(state.accounts)) {
      if (!account || typeof account.live !== 'boolean' || !Array.isArray(account.videos) || !account.videos.every(id => typeof id === 'string')) throw Error('invalid');
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

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Monitor } from '../src/monitor.js';
import { loadState, saveState } from '../src/state.js';
import { readConfig } from '../src/config.js';
function fixture(notify) {
  const sent = [];
  const state = { version: 1, accounts: {} };
  const opts = { state, username: 'noxdu7', persist: async () => {}, notify: notify || (async (...args) => sent.push(args)) };
  return { sent, state, opts, m: new Monitor(opts) };
}
test('uma mensagem por live, inclusive após reinício; rearma após duas consultas offline', async () => {
  const { m, sent, opts } = fixture();
  await m.live(true); await m.live(true);
  const restarted = new Monitor(opts);
  await restarted.live(true);
  assert.equal(sent.length, 1);
  await restarted.live(false); await restarted.live(true);
  assert.equal(sent.length, 1);
  await restarted.live(false); await restarted.live(false); await restarted.live(true);
  assert.equal(sent.length, 2);
  assert.equal(sent[0][1].url, 'https://www.tiktok.com/@noxdu7/live');
});
test('vídeo inicial vira referência; vídeo novo avisa uma vez, inclusive após reinício', async () => {
  const { m, sent, opts } = fixture();
  await m.video({ id: '100' }); assert.equal(sent.length, 0);
  await m.video({ id: '101' }); await m.video({ id: '101' });
  await new Monitor(opts).video({ id: '101' });
  await m.video({ id: '100' });
  assert.equal(sent.length, 1);
  assert.equal(sent[0][1].url, 'https://www.tiktok.com/@noxdu7/video/101');
});
test('envio falhado não marca live nem vídeo como entregues', async () => {
  const { m } = fixture(async () => { throw Error('Discord indisponível'); });
  await assert.rejects(m.live(true)); assert.equal(m.account.live, false);
  await m.video({ id: '100' });
  await assert.rejects(m.video({ id: '101' }));
  assert.deepEqual(m.account.videos, ['100']);
});
test('estado persistido sobrevive ao reinício; gravações concorrentes são serializadas', async () => {
  const file = join(await mkdtemp(join(tmpdir(), 'bot-test-')), 'state.json');
  const state = await loadState(file);
  const { m } = fixture(); state.accounts.noxdu7 = m.account;
  await Promise.all([saveState(file, state), saveState(file, state)]);
  assert.deepEqual(await loadState(file), state);
  await writeFile(file, 'invalid'); await assert.rejects(loadState(file));
  assert.equal(await readFile(file, 'utf8'), 'invalid');
});
test('validação rejeita configuração ausente, IDs inválidos e polling excessivo', () => {
  assert.throws(() => readConfig({}), /Falta configurar/);
  const env = { DISCORD_TOKEN: 'test', GUILD_ID: '123456789012345678', WELCOME_CHANNEL_ID: '123456789012345678', LEAVE_CHANNEL_ID: '123456789012345678', LIVE_CHANNEL_ID: '123456789012345678', VIDEO_CHANNEL_ID: '123456789012345678', TIKTOK_USERNAME: 'noxdu7' };
  assert.equal(readConfig(env).username, 'noxdu7');
  assert.throws(() => readConfig({ ...env, GUILD_ID: 'invalid' }), /ID Discord/);
  assert.throws(() => readConfig({ ...env, LIVE_POLL_SECONDS: '1' }), /mínimo/);
});

test('deploy com apenas o token usa os canais e perfil do proprietário', () => {
  const config = readConfig({ DISCORD_TOKEN: 'test', GUILD_ID: '', TIKTOK_USERNAME: ' ' });
  assert.equal(config.guild, '1562226507571789966');
  assert.deepEqual(config.channels, {
    welcome: '1560785968024522984', leave: '1560785974173237369',
    live: '1560785984482836621', video: '1564086426969182329',
  });
  assert.equal(config.username, 'noxdu7');
  assert.equal(readConfig({ DISCORD_TOKEN: 'test', GUILD_ID: '123456789012345678', TIKTOK_USERNAME: 'outroperfil' }).guild, '123456789012345678');
  assert.equal(readConfig({ DISCORD_TOKEN: 'test', TIKTOK_USERNAME: 'outroperfil' }).username, 'outroperfil');
  assert.throws(() => readConfig({}), /Falta configurar: DISCORD_TOKEN$/);
});

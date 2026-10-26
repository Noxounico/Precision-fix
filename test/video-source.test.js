import test from 'node:test';
import assert from 'node:assert/strict';
import { profileVideos, sourceError } from '../src/video-source.js';
import { Monitor } from '../src/monitor.js';
const idAt = milliseconds => String(BigInt(Math.floor(milliseconds / 1000)) << 32n);
function setup() {
  const state = { version: 1, accounts: {} }, sent = [];
  const options = { state, username: 'noxdu7', persist: async () => {}, notify: async (kind, value) => sent.push(value.url) };
  return { state, sent, options, monitor: new Monitor(options) };
}
test('perfil com vídeo fixado antigo escolhe o vídeo mais recente e elimina duplicados', () => {
  const result = profileVideos({ entries: [{ id: '100' }, { id: '300' }, { id: '200' }, { id: '300' }, null] });
  assert.deepEqual(result.videos.map(v => v.id), ['300', '200', '100']);
  assert.throws(() => profileVideos({ entries: [] }));
});
test('primeiro arranque anuncia vídeo recém-publicado uma vez, mas não vídeos antigos', async () => {
  const { monitor, sent, options } = setup();
  const recent = idAt(Date.now() - 10000), old = idAt(Date.now() - 86400000);
  await monitor.video({ videos: [{ id: old }, { id: recent }] });
  assert.equal(sent.length, 1); assert(sent[0].endsWith(recent));
  await new Monitor(options).video({ videos: [{ id: recent }, { id: old }] });
  assert.equal(sent.length, 1);
  const baseline = setup();
  await baseline.monitor.video({ videos: [{ id: old }] });
  assert.equal(baseline.sent.length, 0);
});
test('vários vídeos novos são enviados por ordem; erro de envio deixa os restantes para nova tentativa', async () => {
  const { monitor, sent, options } = setup();
  await monitor.video({ id: '100' });
  const notify = options.notify;
  monitor.notify = async (kind, value) => {
    if (value.url.endsWith('300')) throw Error('Discord indisponível');
    await notify(kind, value);
  };
  await assert.rejects(monitor.video({ videos: [{ id: '300' }, { id: '200' }, { id: '100' }] }));
  assert.deepEqual(monitor.account.videos, ['200', '100']);
  monitor.notify = notify;
  await monitor.video({ videos: [{ id: '300' }, { id: '200' }, { id: '50' }] });
  assert.deepEqual(sent.map(url => url.split('/').at(-1)), ['200', '300']);
});
test('recupera aviso suprimido pela referência antiga, sem repetir após reinício', async () => {
  const { monitor, sent, options } = setup();
  await monitor.video({ id: '7700986106065489185' });
  const before = sent.length;
  await monitor.replayVideo('7700986106065489185');
  await new Monitor(options).replayVideo('7700986106065489185');
  assert.equal(sent.length, before + 1);
  const failed = setup();
  failed.monitor.notify = async () => { throw Error('Send failed'); };
  await assert.rejects(failed.monitor.replayVideo('123'));
  assert.equal(failed.monitor.account.replayedVideos, undefined);
});
test('diagnóstico separa executável ausente de falha do TikTok sem expor URL de pedido', () => {
  assert.match(sourceError({ code: 'ENOENT' }).message, /yt-dlp não está instalado/);
  const message = sourceError({ stderr: 'WARNING: test\nERROR: blocked https://example.com/?secret=abc' }).message;
  assert.match(message, /blocked/); assert(!message.includes('secret=abc'));
});

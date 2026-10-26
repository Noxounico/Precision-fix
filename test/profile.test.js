import test from 'node:test';
import assert from 'node:assert/strict';
import { applyBanner } from '../src/profile.js';

test('aplica banner e persiste sucesso; reinício não volta a editar o mesmo perfil', async () => {
  const state = { version: 1, accounts: {} };
  let edits = 0, saves = 0;
  const user = { id: 'bot', banner: null, setBanner: async url => {
    assert.equal(url, 'https://example.com/banner.webp');
    edits++; user.banner = 'hash'; return user;
  } };
  const persist = async () => saves++;
  assert.equal(await applyBanner(user, 'https://example.com/banner.webp', state, persist), true);
  assert.equal(await applyBanner(user, 'https://example.com/banner.webp', structuredClone(state), persist), false);
  assert.equal(edits, 1); assert.equal(saves, 1);
  user.banner = 'changed-externally';
  assert.equal(await applyBanner(user, 'https://example.com/banner.webp', state, persist), true);
  assert.equal(edits, 2);
});
test('falha da API não marca banner aplicado; pode tentar de novo', async () => {
  const state = { version: 1, accounts: {} };
  const user = { id: 'bot', setBanner: async () => { throw Error('download failed'); } };
  await assert.rejects(applyBanner(user, 'https://example.com/banner.webp', state, async () => assert.fail()));
  assert.equal(state.botProfile, undefined);
  assert.equal(await applyBanner(user, null, state, async () => assert.fail()), false);
});

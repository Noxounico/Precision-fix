import test from 'node:test';
import assert from 'node:assert/strict';
import { deletionDeadline, scheduleTicketDeletion } from '../src/ticket-cleanup.js';

test('apaga apenas aos 5 segundos e não duplica o agendamento', async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 100000 });
  let deleted = 0;
  const channel = { id: 'one', topic: 'precision-ticket-closed:456:105000', delete: async () => deleted++ };
  channel.guild = { id: 'guild', channels: { fetch: async () => channel } };
  scheduleTicketDeletion(channel, 105000);
  scheduleTicketDeletion(channel, 105000);
  t.mock.timers.tick(4999);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(deleted, 0);
  t.mock.timers.tick(1);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(deleted, 1);
});
test('retoma prazo vencido ao reiniciar, mas preserva canais com marcador alterado', async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 200000 });
  const deleted = [];
  for (const [id, topic] of [['expired', 'precision-ticket-closed:456:105000'], ['changed', 'canal normal']]) {
    const channel = { id, topic, delete: async () => deleted.push(id) };
    channel.guild = { id: 'guild', channels: { fetch: async () => channel } };
    scheduleTicketDeletion(channel, 105000);
  }
  t.mock.timers.tick(1);
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(deleted, ['expired']);
  assert.equal(deletionDeadline('precision-ticket:456'), null);
  assert.equal(deletionDeadline('precision-ticket-closed:456'), null);
});

const pending = new Map();
export function deletionDeadline(topic) {
  const match = topic?.match(/^precision-ticket-closed:\d+:(\d+)$/);
  const deadline = match && Number(match[1]);
  return Number.isSafeInteger(deadline) && deadline > 0 ? deadline : null;
}
export function scheduleTicketDeletion(channel, deadline) {
  const key = `${channel.guild.id}:${channel.id}`;
  if (pending.has(key)) return;
  const timer = setTimeout(async () => {
    try {
      // Re-fetch before deleting; do not delete a channel whose marker changed.
      const fresh = await channel.guild.channels.fetch(channel.id);
      if (fresh && deletionDeadline(fresh.topic) === deadline) {
        await fresh.delete('Ticket fechado; transcrição arquivada; prazo de 5 segundos terminado.');
      }
    } catch (error) {
      if (Number(error.code) !== 10003) console.error(`Apagar ticket ${channel.id} falhou (código: ${error.code || error.name}). Verifique Gerir canais. A transcrição permanece no arquivo.`);
    } finally { pending.delete(key); }
  }, Math.max(0, deadline - Date.now()));
  pending.set(key, timer);
  timer.unref?.();
}

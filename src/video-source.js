export function profileVideos(result) {
  const entries = result.entries;
  if (!Array.isArray(entries)) throw Error('O TikTok não devolveu a lista de vídeos do perfil.');
  const ids = [...new Set(entries.filter(Boolean).map(entry => String(entry.id)).filter(id => /^\d+$/.test(id)))];
  if (!ids.length) throw Error('O TikTok não devolveu vídeos públicos.');
  // Pinned posts may come first. TikTok IDs encode creation time in their high bits.
  return { videos: ids.sort((a, b) => BigInt(a) > BigInt(b) ? -1 : BigInt(a) < BigInt(b) ? 1 : 0).map(id => ({ id })) };
}
export function sourceError(error) {
  if (error.code === 'ENOENT') return new Error('yt-dlp não está instalado ou YTDLP_BIN aponta para um caminho inexistente.');
  if (error.killed || error.code === 'ETIMEDOUT') return new Error('A consulta do perfil TikTok excedeu o tempo limite.');
  const line = String(error.stderr || '').split('\n').find(line => line.startsWith('ERROR:'));
  const detail = (line || 'Falha ao consultar o perfil. Verifique o acesso ao TikTok e a versão de yt-dlp.')
    .replace(/https?:\/\/\S+/g, '[URL]').slice(0, 500);
  return new Error(detail);
}

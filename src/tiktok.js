import { TikTokLiveConnection, IsLiveRouteConfig } from 'tiktok-live-connector';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const run = promisify(execFile);
export function tiktok(config) {
  // No paid signing service or fallback credentials are needed for polling.
  IsLiveRouteConfig.skipFetchRoomIdFromEulerRoute = true;
  const connection = new TikTokLiveConnection(config.username, {
    webClientOptions: { timeout: { request: 15000 }, retry: { limit: 1 } },
  });
  return {
    live: () => connection.fetchIsLive(),
    async video() {
      const { stdout } = await run(config.ytdlp, [
        '--ignore-config', '--skip-download', '--flat-playlist', '--playlist-end', '1',
        '--dump-single-json', '--socket-timeout', '20', '--retries', '1',
        `https://www.tiktok.com/@${config.username}`,
      ], { timeout: 60000, maxBuffer: 4 * 1024 * 1024 });
      const result = JSON.parse(stdout);
      const entry = result.entries?.[0];
      if (!entry) throw Error('Sem vídeo disponível');
      return { id: String(entry.id) };
    },
  };
}

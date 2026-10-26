import { TikTokLiveConnection, IsLiveRouteConfig } from 'tiktok-live-connector';
import { profileVideos, sourceError } from './video-source.js';
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
      let stdout;
      try {
        ({ stdout } = await run(config.ytdlp, [
          '--ignore-config', '--skip-download', '--flat-playlist', '--playlist-end', '10',
          '--dump-single-json', '--socket-timeout', '20', '--retries', '1',
          `https://www.tiktok.com/@${config.username}`,
        ], { timeout: 60000, maxBuffer: 4 * 1024 * 1024 }));
      } catch (error) { throw sourceError(error); }
      return profileVideos(JSON.parse(stdout));
    },
  };
}

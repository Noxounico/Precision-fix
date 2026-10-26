import 'dotenv/config';
export function readConfig(env = process.env, { requireToken = true } = {}) {
  const required = ['GUILD_ID', 'WELCOME_CHANNEL_ID', 'LEAVE_CHANNEL_ID', 'LIVE_CHANNEL_ID', 'VIDEO_CHANNEL_ID', 'TIKTOK_USERNAME'];
  if (requireToken) required.push('DISCORD_TOKEN');
  const missing = required.filter(key => !env[key]?.trim());
  if (missing.length) throw new Error(`Falta configurar: ${missing.join(', ')}`);
  for (const key of [...required.filter(k => k.endsWith('_ID')), 'NOTIFICATION_ROLE_ID']) {
    if (env[key] && !/^\d{17,20}$/.test(env[key])) throw new Error(`${key}: ID Discord inválido`);
  }
  const username = env.TIKTOK_USERNAME.replace(/^@/, '');
  if (!/^[a-zA-Z0-9_.]{2,24}$/.test(username)) throw new Error('TIKTOK_USERNAME inválido');
  const seconds = (key, fallback, min) => {
    const n = Number(env[key] || fallback);
    if (!Number.isInteger(n) || n < min) throw new Error(`${key}: mínimo ${min} segundos`);
    return n * 1000;
  };
  return {
    token: env.DISCORD_TOKEN, guild: env.GUILD_ID, username,
    channels: { welcome: env.WELCOME_CHANNEL_ID, leave: env.LEAVE_CHANNEL_ID, live: env.LIVE_CHANNEL_ID, video: env.VIDEO_CHANNEL_ID },
    role: env.NOTIFICATION_ROLE_ID || null,
    liveInterval: seconds('LIVE_POLL_SECONDS', 60, 30),
    videoInterval: seconds('VIDEO_POLL_SECONDS', 300, 120),
    ytdlp: env.YTDLP_BIN || 'yt-dlp', stateFile: env.STATE_FILE || './data/state.json',
  };
}

import 'dotenv/config';
// Public server/profile settings supplied by the owner. Never store tokens here.
const defaults = Object.freeze({
  GUILD_ID: '1560784472083800298',
  WELCOME_CHANNEL_ID: '1560785968024522984',
  LEAVE_CHANNEL_ID: '1560785974173237369',
  LIVE_CHANNEL_ID: '1560785984482836621',
  VIDEO_CHANNEL_ID: '1564086426969182329',
  TIKTOK_USERNAME: 'noxdu7',
  INSTAGRAM_USERNAME: '_.rafaeldu7',
  BOT_BANNER_URL: 'https://media.discordapp.net/attachments/1560786047456120832/1562020832543248465/814fb6b110e20c2d902c71f6dda0caf3.gif?ex=6adfb903&is=6ade6783&hm=97bb6f06f2388c1ebbba6f1100fd4ab7d39b80444e5c1e5dd215338916bdc697&=&width=501&height=218',
  DIVULGAR_IMAGE_URL: 'https://media.discordapp.net/attachments/1564100986870435943/1564101030474420355/c93d7fa7-b022-4220-89d9-610137db1463.png?ex=6ae00a19&is=6adeb899&hm=1b4375f593f62a92e0cee66ca293d0f5ce09012cdf6e4864513071de9621cc43&=&format=webp&quality=lossless&width=583&height=583',
});
export function readConfig(env = process.env, { requireToken = true } = {}) {
  env = { ...defaults, ...Object.fromEntries(Object.entries(env).filter(([, value]) => typeof value === 'string' && value.trim() !== '')) };
  const required = ['GUILD_ID', 'WELCOME_CHANNEL_ID', 'LEAVE_CHANNEL_ID', 'LIVE_CHANNEL_ID', 'VIDEO_CHANNEL_ID', 'TIKTOK_USERNAME'];
  if (requireToken) required.push('DISCORD_TOKEN');
  const missing = required.filter(key => !env[key]?.trim());
  if (missing.length) throw new Error(`Falta configurar: ${missing.join(', ')}`);
  for (const key of [...required.filter(k => k.endsWith('_ID')), 'NOTIFICATION_ROLE_ID']) {
    if (env[key] && !/^\d{17,20}$/.test(env[key])) throw new Error(`${key}: ID Discord inválido`);
  }
  if (env.DIVULGAR_IMAGE_URL) {
    let image;
    try { image = new URL(env.DIVULGAR_IMAGE_URL); } catch { throw new Error('DIVULGAR_IMAGE_URL inválido'); }
    if (image.protocol !== 'https:') throw new Error('DIVULGAR_IMAGE_URL deve usar HTTPS');
  }
  if (env.BOT_BANNER_URL) {
    let banner;
    try { banner = new URL(env.BOT_BANNER_URL); } catch { throw new Error('BOT_BANNER_URL inválido'); }
    if (banner.protocol !== 'https:') throw new Error('BOT_BANNER_URL deve usar HTTPS');
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
    instagram: env.INSTAGRAM_USERNAME || null,
    divulgarImage: env.DIVULGAR_IMAGE_URL || null,
    banner: env.BOT_BANNER_URL || null,
    liveInterval: seconds('LIVE_POLL_SECONDS', 60, 30),
    videoInterval: seconds('VIDEO_POLL_SECONDS', 300, 120),
    ytdlp: env.YTDLP_BIN || 'yt-dlp', stateFile: env.STATE_FILE || './data/state.json',
  };
}

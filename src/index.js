import { Client, GatewayIntentBits, Events, PermissionFlagsBits } from 'discord.js';
import { readConfig } from './config.js';
import { loadState, saveState } from './state.js';
import { Monitor } from './monitor.js';
import { tiktok } from './tiktok.js';
import { registerDivulgar, handleDivulgar } from './divulgar.js';

const config = readConfig();
const state = await loadState(config.stateFile);
const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers] });
const channels = {};
const report = (label, error) => console.error(`${label} falhou (código: ${error.code || error.name || 'desconhecido'}). Verifique permissões, configuração e acesso à plataforma.`);
async function notify(kind, { url }) {
  const ping = config.role ? `<@&${config.role}> ` : '';
  await channels[kind].send({
    content: `${ping}${kind === 'live' ? '🔴 Live online!' : '🎬 Vídeo novo!'}\n${url}`,
    allowedMentions: { parse: [], roles: config.role ? [config.role] : [] },
  });
}
const monitor = new Monitor({ state, username: config.username, persist: s => saveState(config.stateFile, s), notify });
const source = tiktok(config);
let stopping = false;
const timers = new Set();
async function poll(kind, interval) {
  try { await monitor[kind](await source[kind]()); }
  catch (error) { report(`Consulta ${kind}`, error); }
  if (!stopping) {
    const timer = setTimeout(() => { timers.delete(timer); void poll(kind, interval); }, interval);
    timers.add(timer);
  }
}
client.once(Events.ClientReady, async () => {
  try {
    const guild = await client.guilds.fetch(config.guild);
    try {
      await registerDivulgar(guild);
      console.log('Comando /divulgar registado neste servidor.');
    } catch (error) { report('Registo de /divulgar (verifique autorização applications.commands)', error); }
    const me = await guild.members.fetchMe();
    for (const [kind, id] of Object.entries(config.channels)) {
      const channel = await guild.channels.fetch(id);
      const needed = [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages];
      if (!channel?.isTextBased() || channel.isThread() || !channel.permissionsFor(me)?.has(needed)) throw Error(`Canal ${kind} sem permissões`);
      channels[kind] = channel;
    }
    console.log('Bot ligado. Canais validados; a iniciar monitorização TikTok.');
    void poll('live', config.liveInterval);
    void poll('video', config.videoInterval);
  } catch (error) {
    report('Validação dos canais', error);
    if (Number(error.code) === 10004) {
      console.error(`O bot não encontra o servidor GUILD_ID=${config.guild}. Confirme o ID do servidor e se este bot foi convidado.`);
      const guildIds = [...client.guilds.cache.keys()];
      console.error(`Servidores deste bot: ${guildIds.length ? guildIds.join(', ') : 'nenhum'}.`);
      const invite = new URL('https://discord.com/oauth2/authorize');
      invite.search = new URLSearchParams({ client_id: client.user.id, scope: 'bot', permissions: '3072', guild_id: config.guild });
      console.error(`Convite para este bot (abrir com uma conta que possa gerir o servidor): ${invite}`);
    }
    client.destroy();
    process.exitCode = 1;
  }
});
client.on(Events.GuildMemberAdd, async member => {
  if (member.guild.id !== config.guild || !channels.welcome) return;
  try {
    await channels.welcome.send({ content: `👋 Bem-vindo/a, <@${member.id}>! Boa estadia no servidor **${member.guild.name}**!`, allowedMentions: { parse: [], users: [member.id] } });
  } catch (error) { report('Boas-vindas', error); }
});
client.on(Events.GuildMemberRemove, async member => {
  if (member.guild.id !== config.guild || !channels.leave) return;
  try {
    await channels.leave.send({ content: `👋 <@${member.id}> saiu do servidor. Até à próxima!`, allowedMentions: { parse: [] } });
  } catch (error) { report('Mensagem de saída', error); }
});
client.on(Events.InteractionCreate, async interaction => {
  try { await handleDivulgar(interaction, config); }
  catch (error) {
    report('Comando /divulgar', error);
    if (interaction.isChatInputCommand() && !interaction.replied && !interaction.deferred) {
      await interaction.reply({ content: 'Não consegui publicar a divulgação. Verifica as permissões do bot neste canal.', flags: 64 }).catch(() => {});
    }
  }
});
client.on(Events.Error, error => report('Discord', error));
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => {
  stopping = true;
  for (const timer of timers) clearTimeout(timer);
  client.destroy();
});
try { await client.login(config.token); }
catch (error) { report('Ligação ao Discord', error); client.destroy(); process.exitCode = 1; }

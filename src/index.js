import { Client, GatewayIntentBits, Events, PermissionFlagsBits } from 'discord.js';
import { applyBanner } from './profile.js';
import { readConfig } from './config.js';
import { loadState, saveState } from './state.js';
import { Monitor } from './monitor.js';
import { tiktok } from './tiktok.js';
import { handleDivulgar } from './divulgar.js';
import { registerCommands } from './commands.js';
import { handleTickets } from './tickets.js';
import { awardXp, handleXp } from './xp.js';

const config = readConfig();
const state = await loadState(config.stateFile);
const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildMessages] });
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
  // Profile updates must not prevent server features from starting.
  void applyBanner(client.user, config.banner, state, s => saveState(config.stateFile, s))
    .then(changed => { if (changed) console.log('Banner do perfil do bot atualizado.'); })
    .catch(error => report('Atualização do banner (verifique se BOT_BANNER_URL ainda é acessível)', error));
  try {
    const guild = await client.guilds.fetch(config.guild);
    try {
      await registerCommands(guild);
      console.log('Comandos /divulgar, /painel, /rank e /top registados neste servidor.');
    } catch (error) { report('Registo dos comandos (verifique autorização applications.commands)', error); }
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
  try {
    if (await handleDivulgar(interaction, config)) return;
    if (await handleXp(interaction, config, state)) return;
    await handleTickets(interaction, config);
  }
  catch (error) {
    report('Comando ou botão', error);
    const content = 'Não consegui concluir esta ação. Verifica as permissões do bot e a configuração.';
    if (interaction.deferred && !interaction.replied) await interaction.editReply({ content }).catch(() => {});
    else if (!interaction.replied) await interaction.reply({ content, flags: 64 }).catch(() => {});
  }
});
client.on(Events.MessageCreate, message => {
  void awardXp(message, config, state, s => saveState(config.stateFile, s))
    .catch(error => report('Guardar XP', error));
});
client.on(Events.Error, error => report('Discord', error));
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => {
  stopping = true;
  for (const timer of timers) clearTimeout(timer);
  client.destroy();
});
try { await client.login(config.token); }
catch (error) { report('Ligação ao Discord', error); client.destroy(); process.exitCode = 1; }

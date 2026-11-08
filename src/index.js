import { orderXpRoles, levelsEmbed } from './xp-levels.js';
import { levelChannel } from './level-announcements.js';
import { removeLegacyChannels } from './xp-checkpoint.js';
import { notificationRoleId } from './notifications.js';
import { createAuditLogger } from './audit.js';
import { VoiceXp } from './voice-xp.js';
import { handleLoja } from './loja.js';
import { recoverXpFromRoles } from './xp-recovery.js';
import { restrictMessage } from './command-access.js';
import { handleSetup } from './level-announcements.js';
import { startMemberCounter } from './member-counter.js';
import { assignJoinRole, handleBan, enforceBanChannel } from './auto-moderation.js';
import { handleRegras } from './regras.js';
import { Client, GatewayIntentBits, Events, Partials, PermissionFlagsBits } from 'discord.js';
import { announcement } from './social-cards.js';
import { handleClear } from './moderation.js';
import { handleBackup } from './backup.js';
import { syncTicketAccess } from './transcript.js';
import { applyBanner } from './profile.js';
import { readConfig } from './config.js';
import { loadState, saveState } from './state.js';
import { Monitor } from './monitor.js';
import { tiktok } from './tiktok.js';
import { handleDivulgar } from './divulgar.js';
import { registerCommands } from './commands.js';
import { handleTickets } from './tickets.js';
import { handleXp } from './xp.js';

const config = readConfig();
const state = await loadState(config.stateFile);
// Verify storage is writable before connecting or removing legacy channels.
await saveState(config.stateFile, state);
const client = new Client({ partials: [Partials.Message, Partials.Channel], intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildMessages, GatewayIntentBits.GuildVoiceStates, ...(config.messageContent ? [GatewayIntentBits.MessageContent] : [])] });
const channels = {};
const audit = createAuditLogger(client, config);
const voiceXp = new VoiceXp(config, state, s => saveState(config.stateFile, s));
let voiceTimer;
let stopMemberCounter;
let voiceBusy = false;
client.on(Events.VoiceStateUpdate, (oldVoice, newVoice) => {
  voiceXp.refresh(newVoice.guild);
});
const report = (label, error) => console.error(`${label} falhou (código: ${error.code || error.name || 'desconhecido'}). Verifique permissões, configuração e acesso à plataforma.`);
async function notify(kind, { url }) {
  await channels[kind].send(announcement(kind, url, { ...config, role: notificationRoleId(config, kind) }));
  console.log(`Aviso ${kind} enviado para o canal ${config.channels[kind]}.`);
}
const monitor = new Monitor({ state, username: config.username, persist: s => saveState(config.stateFile, s), notify });
const source = tiktok(config);
let stopping = false;
const timers = new Set();
async function poll(kind, interval) {
  let stage = 'obter dados do TikTok';
  try {
    if (kind === 'video' && config.videoRecovery) {
      stage = 'recuperar aviso do vídeo no Discord';
      await monitor.replayVideo(config.videoRecovery);
    }
    stage = 'obter dados do TikTok';
    const result = await source[kind]();
    stage = 'enviar aviso ao Discord ou guardar estado';
    await monitor[kind](result);
    if (kind === 'video') console.log(`Consulta video OK: @${config.username}, último vídeo ${result.videos[0].id}, canal ${config.channels.video}.`);
  } catch (error) {
    console.error(`Consulta ${kind} falhou ao ${stage} (código: ${error.code || error.name || 'desconhecido'}).`);
    if (stage === 'obter dados do TikTok' && kind === 'video') console.error(`TikTok: ${error.message}`);
  }
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
      console.log('Comandos /divulgar, /painel, /regras, /xp, /clear, /ban, /backup, /bckup registados. Comandos antigos e duplicados globais deste bot removidos.');
    } catch (error) { report('Registo dos comandos (verifique autorização applications.commands)', error); }
    await guild.members.fetchMe();
    try {
      await removeLegacyChannels(guild, state, s => saveState(config.stateFile, s));
    } catch (error) { console.error(`Migração dos canais antigos: ${error.message}`); }
    try {
      const restored = await recoverXpFromRoles(guild, state, s => saveState(config.stateFile, s));
      console.log(`Proteção de XP: ${restored} membros recuperados pelo cargo. Estado: ${config.stateFile}. Preserve este ficheiro num volume persistente.`);
    } catch (error) { report('Recuperação de XP pelos cargos', error); }
    try {
      await orderXpRoles(guild);
      const channel = await guild.channels.fetch(levelChannel);
      const messages = await channel.messages.fetch({ limit: 100 });
      for (const message of messages.values()) if (message.author.id === client.user.id && message.embeds.some(embed => embed.title === '✨ Níveis')) {
        await message.edit({ embeds: [levelsEmbed()], allowedMentions: { parse: [] } });
      }
    } catch (error) { report('Ordem dos cargos e quadro de XP', error); }
    stopMemberCounter = startMemberCounter(guild, report);
    voiceXp.refresh(guild);
    voiceTimer = setInterval(async () => {
      if (voiceBusy) return;
      voiceBusy = true;
      try { await voiceXp.tick(guild); } catch (error) { report('XP de call e cargos', error); }
      finally { voiceBusy = false; }
    }, 60000);
    void syncTicketAccess(guild, config).then(() => console.log('Permissões dos tickets atualizadas para os cargos de suporte configurados.'))
      .catch(error => report('Atualizar permissões dos tickets', error));
    const me = guild.members.me;
    for (const [kind, id] of Object.entries(config.channels)) {
      if (kind === 'welcome' || kind === 'leave') continue;
      const channel = await guild.channels.fetch(id);
      const needed = [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages];
      needed.push(PermissionFlagsBits.EmbedLinks);
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
  if (member.guild.id !== config.guild) return;
  void audit.member(member, true).catch(error => report('Log de entrada', error));
  try { await assignJoinRole(member, config); }
  catch (error) { report('Atribuir cargo de entrada (verifique Gerir cargos e a hierarquia)', error); }
});
client.on(Events.GuildMemberRemove, member => {
  if (member.guild.id !== config.guild) return;
  void audit.member(member, false).catch(error => report('Log de saída', error));
});
client.on(Events.InteractionCreate, async interaction => {
  try {
    if (await handleLoja(interaction, config)) return;
    if (await handleBan(interaction, config, state, s => saveState(config.stateFile, s))) return;
    if (await handleRegras(interaction, config)) return;
    if (await handleClear(interaction, config)) return;
    if (await handleBackup(interaction, config)) return;
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
client.on(Events.MessageCreate, async message => {
  try {
    if (await enforceBanChannel(message, config, state)) return;
    if (await restrictMessage(message, config, state, s => saveState(config.stateFile, s))) return;
    if (await handleSetup(message, config)) return;
  } catch (error) {
    report('Banimento automático ou eliminação da mensagem (verifique Banir membros, Gerir mensagens e a hierarquia de cargos)', error);
    return;
  }
});
client.on(Events.Error, error => report('Discord', error));
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, async () => {
  stopping = true;
  clearInterval(voiceTimer);
  stopMemberCounter?.();
  for (const timer of timers) clearTimeout(timer);
  try {
    while (voiceBusy) await new Promise(resolve => setTimeout(resolve, 10));
    const guild = client.guilds.cache.get(config.guild);
    if (guild) await voiceXp.tick(guild);
    await saveState(config.stateFile, state);
  } catch (error) { report('Guardar XP ao desligar', error); }
  client.destroy();
});
try { await client.login(config.token); }
catch (error) { report('Ligação ao Discord (ative Server Members Intent e Message Content Intent no Developer Portal)', error); client.destroy(); process.exitCode = 1; }

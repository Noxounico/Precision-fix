import { randomInt } from 'node:crypto';
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, PermissionFlagsBits as P, SlashCommandBuilder } from 'discord.js';

export const giveawayCommand = new SlashCommandBuilder().setName('sorteio')
  .setDescription('Sortear 2 keys do painel de mira fixa entre os participantes, após 24 horas.')
  .setDefaultMemberPermissions(P.ManageGuild);
export const giveawayDuration = 24 * 60 * 60 * 1000;

export function drawWinners(participants, choose = randomInt) {
  const pool = [...new Set(participants)];
  const winners = [];
  while (winners.length < 2 && pool.length) winners.push(pool.splice(choose(pool.length), 1)[0]);
  return winners;
}
export function giveawayMessage(record, guild) {
  const finished = record.winners !== null;
  const embed = new EmbedBuilder().setColor(finished ? 0x57f287 : 0xffffff)
    .setTitle(finished ? '🎉 SORTEIO ENCERRADO' : '🎯 SORTEIO · PAINEL DE MIRA FIXA')
    .setDescription(finished
      ? record.winners.length ? `Parabéns aos vencedores!\n${record.winners.map(id => `🏆 <@${id}> — **1 key do painel de mira fixa**`).join('\n')}${record.winners.length < 2 ? '\n\nHouve apenas uma pessoa inscrita; só foi possível escolher um vencedor.' : ''}` : 'O sorteio terminou sem participantes. Não foram atribuídas keys.'
      : 'Rapaziada, vamos sortear **2 keys do painel de mira fixa**! 🎁\n\nCarrega em **Participar** para entrares no sorteio.\nSerão escolhidas **2 pessoas diferentes**, com **1 key para cada uma**. Boa sorte! 🍀')
    .addFields(
      { name: '🎁 Prémio', value: '2 keys · Painel de mira fixa', inline: true },
      { name: '🏆 Vencedores', value: finished ? String(record.winners.length) : '2 · 1 key por pessoa', inline: true },
      { name: finished ? '⏰ Prazo encerrado' : '⏳ Termina', value: `<t:${Math.floor(record.endsAt / 1000)}:F>\n<t:${Math.floor(record.endsAt / 1000)}:R>` },
    ).setFooter({ text: finished ? `${record.participants.length} participante(s) · Obrigado por participarem!` : 'Duração: 24 horas · Uma participação por pessoa' });
  const icon = guild?.iconURL?.({ size: 128 });
  if (icon) embed.setThumbnail(icon);
  return {
    content: finished && record.winners.length ? `🎉 Vencedores: ${record.winners.map(id => `<@${id}>`).join(' e ')}!` : '',
    embeds: [embed],
    components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('giveaway:join')
      .setLabel(finished ? 'Sorteio encerrado' : 'Participar').setEmoji('🎉')
      .setStyle(finished ? ButtonStyle.Secondary : ButtonStyle.Success).setDisabled(finished))],
    allowedMentions: { parse: [], users: finished ? record.winners : [] },
  };
}

export class Giveaways {
  constructor({ client, config, state, persist, now = Date.now, choose = randomInt, setTimer = setTimeout, clearTimer = clearTimeout, report = console.error }) {
    Object.assign(this, { client, config, state, persist, now, choose, setTimer, clearTimer, report });
    this.timers = new Map(); this.queues = new Map(); this.stopped = false;
  }
  start() {
    for (const [id, record] of Object.entries(this.state.giveaways || {})) {
      if (record.guildId === this.config.guild && !record.completed) this.schedule(id);
    }
  }
  stop() {
    this.stopped = true;
    for (const timer of this.timers.values()) this.clearTimer(timer);
    this.timers.clear();
  }
  schedule(id, retryDelay) {
    if (this.stopped) return;
    const record = this.state.giveaways?.[id];
    if (!record || record.completed) return;
    if (this.timers.has(id)) this.clearTimer(this.timers.get(id));
    const delay = retryDelay ?? Math.max(0, record.endsAt - this.now());
    const timer = this.setTimer(() => {
      this.timers.delete(id);
      void this.finish(id).catch(error => {
        this.report(`Encerrar sorteio ${id}: ${error.code || error.name}. O resultado guardado será reutilizado.`);
        this.schedule(id, 30000);
      });
    }, Math.min(delay, 2_147_483_647));
    timer?.unref?.();
    this.timers.set(id, timer);
  }
  async serial(id, operation) {
    const next = (this.queues.get(id) || Promise.resolve()).catch(() => {}).then(operation);
    this.queues.set(id, next);
    try { return await next; }
    finally { if (this.queues.get(id) === next) this.queues.delete(id); }
  }
  async finish(id) {
    return this.serial(id, async () => {
      const record = this.state.giveaways?.[id];
      if (!record || record.completed || record.guildId !== this.config.guild || this.stopped) return;
      if (this.now() < record.endsAt) { this.schedule(id); return; }
      try {
        // Commit the draw before contacting Discord. Retries never draw new winners.
        if (record.winners === null) record.winners = drawWinners(record.participants, this.choose);
        await this.persist(this.state);
        const channel = await this.client.channels.fetch(record.channelId);
        if (!channel?.isTextBased() || channel.guildId !== record.guildId) throw Error('Canal de sorteio inválido');
        const message = await channel.messages.fetch(record.messageId);
        await message.edit(giveawayMessage(record, channel.guild));
        record.completed = true;
        try { await this.persist(this.state); } catch (error) { record.completed = false; throw error; }
      } catch (error) {
        if ([10003, 10008].includes(Number(error.code))) {
          record.completed = true;
          try { await this.persist(this.state); } catch (saveError) { record.completed = false; throw saveError; }
          this.report(`Sorteio ${id}: canal ou mensagem apagados; resultado conservado no estado.`);
        } else throw error;
      }
    });
  }
  async handle(interaction) {
    const command = interaction.isChatInputCommand() && interaction.commandName === 'sorteio';
    const join = interaction.isButton?.() && interaction.customId === 'giveaway:join';
    if (!command && !join) return false;
    const reply = content => interaction.reply({ content, flags: 64, allowedMentions: { parse: [] } });
    if (interaction.guildId !== this.config.guild || interaction.user.bot) {
      await reply('Este sorteio só funciona para membros do servidor configurado.'); return true;
    }
    if (command) {
      if (!interaction.memberPermissions?.has(P.ManageGuild)) {
        await reply('Precisas da permissão Gerir servidor para publicar um sorteio.'); return true;
      }
      if (!interaction.appPermissions?.has([P.ViewChannel, P.SendMessages, P.EmbedLinks, P.ReadMessageHistory])) {
        await reply('Preciso de Ver canal, Enviar mensagens, Inserir links e Ler histórico neste canal.'); return true;
      }
      await interaction.deferReply({ flags: 64 });
      const record = { guildId: this.config.guild, channelId: interaction.channelId, messageId: null,
        endsAt: this.now() + giveawayDuration, participants: [], winners: null, completed: false };
      const message = await interaction.channel.send(giveawayMessage(record, interaction.guild));
      record.messageId = message.id;
      (this.state.giveaways ||= {})[message.id] = record;
      try {
        await this.serial(message.id, () => this.persist(this.state));
      } catch (error) {
        delete this.state.giveaways[message.id];
        await message.delete().catch(() => {});
        throw error;
      }
      this.schedule(message.id);
      await interaction.editReply({ content: `🎉 Sorteio publicado: <#${interaction.channelId}>. Termina em 24 horas, com 2 vencedores e 1 key do painel de mira fixa para cada um.`, allowedMentions: { parse: [] } });
      return true;
    }
    const id = interaction.message.id;
    const record = this.state.giveaways?.[id];
    if (!record || record.guildId !== interaction.guildId || record.channelId !== interaction.channelId) {
      await reply('Não encontrei este sorteio.'); return true;
    }
    const clickedAt = interaction.createdTimestamp ?? this.now();
    if (clickedAt >= record.endsAt || record.winners !== null || record.completed) {
      await reply('Este sorteio já terminou.'); this.schedule(id); return true;
    }
    // Queue immediately, while acknowledging the interaction, so simultaneous clicks
    // all join in order and the deadline task waits for accepted participation writes.
    const acknowledged = interaction.deferReply({ flags: 64 });
    // Attach a rejection handler immediately, even while another job owns the queue.
    void acknowledged.catch(() => {});
    await this.serial(id, async () => {
      await acknowledged;
      if (this.state.giveaways?.[id] !== record) { await interaction.editReply('Não encontrei este sorteio.'); return; }
      if (record.winners !== null || record.completed) { await interaction.editReply('Este sorteio já terminou.'); return; }
      const already = record.participants.includes(interaction.user.id);
      if (!already) record.participants.push(interaction.user.id);
      // Duplicate clicks also retry a previous failed storage write before confirming.
      await this.persist(this.state);
      await interaction.editReply(already ? '🍀 Já estás a participar! Cada pessoa tem uma única participação.' : '🎉 Participação confirmada! Boa sorte no sorteio das keys do painel de mira fixa! 🍀');
    });
    return true;
  }
}

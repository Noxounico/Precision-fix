import { createWriteStream } from 'node:fs';
import { createGzip } from 'node:zlib';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { PermissionFlagsBits as P } from 'discord.js';

const safeError = error => ({ code: String(error.code || error.name || 'unknown') });
const jsonLine = value => JSON.stringify(value, (_, item) => typeof item === 'bigint' ? item.toString() : item) + '\n';
export async function exportBackup(guild, destination, { messages = true, messageContent = true } = {}) {
  const manifest = { format: 'nox-discord-backup', version: 1, guildId: guild.id, startedAt: new Date().toISOString(), counts: {}, errors: [],
    limitations: ['Exportação de dados; sem restauro automático. IDs e propriedade originais não podem ser recriados.',
      'Só dados acessíveis ao bot. Sem DMs, tokens, segredos de webhooks, códigos de convite, áudio/voz, auditoria nem mensagens apagadas.',
      'Imagens, emojis, banners e anexos são guardados como URLs; ficheiros binários não são descarregados e os links podem expirar.',
      'Não é um snapshot atómico; o servidor pode mudar durante a exportação. Membros não são transferíveis para outro servidor.'] };
  const channels = new Map();
  async function* records() {
    function record(type, data) { manifest.counts[type] = (manifest.counts[type] || 0) + 1; return jsonLine({ type, data }); }
    function failure(section, error) { manifest.errors.push({ section, ...safeError(error) }); }
    yield record('header', { ...manifest });
    yield record('guild', { id: guild.id, name: guild.name, ownerId: guild.ownerId, description: guild.description,
      preferredLocale: guild.preferredLocale, verificationLevel: guild.verificationLevel, explicitContentFilter: guild.explicitContentFilter,
      defaultMessageNotifications: guild.defaultMessageNotifications, systemChannelId: guild.systemChannelId, systemChannelFlags: guild.systemChannelFlags?.bitfield,
      rulesChannelId: guild.rulesChannelId, publicUpdatesChannelId: guild.publicUpdatesChannelId,
      afkChannelId: guild.afkChannelId, afkTimeout: guild.afkTimeout, features: guild.features,
      icon: guild.iconURL?.({ size: 4096 }), banner: guild.bannerURL?.({ size: 4096 }), splash: guild.splashURL?.({ size: 4096 }) });
    try { for (const role of (await guild.roles.fetch()).values()) yield record('role', role.toJSON()); } catch (error) { failure('roles', error); }
    try { for (const channel of (await guild.channels.fetch()).values()) if (channel) channels.set(channel.id, channel); } catch (error) { failure('channels', error); }
    try { for (const thread of (await guild.channels.fetchActiveThreads()).threads.values()) channels.set(thread.id, thread); } catch (error) { failure('activeThreads', error); }
    // Archived public and accessible private threads need their own paginated routes.
    for (const parent of [...channels.values()]) {
      if (!parent.threads?.fetchArchived) continue;
      for (const type of ['public', 'private']) {
        if (type === 'private' && !parent.permissionsFor(guild.members.me)?.has(P.ManageThreads)) {
          failure(`privateThreads:${parent.id}`, { code: 'MISSING_MANAGE_THREADS' }); continue;
        }
        let before;
        try {
          while (true) {
            const page = await parent.threads.fetchArchived({ type, fetchAll: true, limit: 100, ...(before ? { before } : {}) }, false);
            for (const thread of page.threads.values()) channels.set(thread.id, thread);
            if (!page.hasMore) break;
            const dates = [...page.threads.values()].map(thread => thread.archiveTimestamp).filter(Number.isFinite);
            const next = Math.min(...dates);
            if (!dates.length || next === before) throw Error('Invalid thread pagination');
            before = next;
          }
        } catch (error) { failure(`${type}Threads:${parent.id}`, error); }
      }
    }
    for (const channel of channels.values()) yield record('channel', channel.toJSON());
    try {
      for (const member of (await guild.members.fetch()).values()) yield record('member', { id: member.id, username: member.user.username,
        nickname: member.nickname, roles: [...member.roles.cache.keys()], joinedTimestamp: member.joinedTimestamp, premiumSinceTimestamp: member.premiumSinceTimestamp,
        pending: member.pending, communicationDisabledUntilTimestamp: member.communicationDisabledUntilTimestamp });
    } catch (error) { failure('members', error); }
    for (const [section, manager] of [['emoji', guild.emojis], ['sticker', guild.stickers], ['event', guild.scheduledEvents], ['automod', guild.autoModerationRules]]) {
      try { for (const item of (await manager.fetch()).values()) yield record(section, { ...item.toJSON(), assetURL: item.url || item.imageURL?.() }); } catch (error) { failure(section, error); }
    }
    try {
      let after;
      while (true) {
        const page = await guild.bans.fetch({ limit: 1000, cache: false, ...(after ? { after } : {}) });
        for (const ban of page.values()) yield record('ban', { userId: ban.user.id, username: ban.user.username, reason: ban.reason });
        if (page.size < 1000) break;
        const next = [...page.keys()].reduce((a, b) => BigInt(a) > BigInt(b) ? a : b);
        if (next === after) throw Error('Invalid ban pagination');
        after = next;
      }
    } catch (error) { failure('bans', error); }
    try {
      for (const hook of (await guild.fetchWebhooks()).values()) yield record('webhook', { id: hook.id, name: hook.name, channelId: hook.channelId, type: hook.type });
    } catch (error) { failure('webhookMetadata', error); }
    if (messages && !messageContent) failure('messages', { code: 'MESSAGE_CONTENT_INTENT_DISABLED' });
    if (messages && messageContent) for (const channel of channels.values()) {
      if (!channel.messages?.fetch) continue;
      if (!channel.permissionsFor(guild.members.me)?.has([P.ViewChannel, P.ReadMessageHistory])) { failure(`messages:${channel.id}`, { code: 'MISSING_HISTORY_ACCESS' }); continue; }
      let before;
      try {
        while (true) {
          const page = await channel.messages.fetch({ limit: 100, cache: false, ...(before ? { before } : {}) });
          if (!page.size) break;
          for (const message of page.values()) yield record('message', { id: message.id, channelId: channel.id, authorId: message.author?.id,
            authorName: message.author?.username, content: message.content, createdTimestamp: message.createdTimestamp,
            editedTimestamp: message.editedTimestamp, type: message.type, pinned: message.pinned, reference: message.reference,
            attachments: [...message.attachments.values()].map(file => ({ id: file.id, name: file.name, url: file.url, size: file.size, contentType: file.contentType })),
            embeds: message.embeds.map(embed => embed.toJSON()), components: message.components.map(component => component.toJSON()),
            reactions: [...message.reactions.cache.values()].map(reaction => ({ emoji: reaction.emoji.toJSON(), count: reaction.count })) });
          const next = [...page.keys()].reduce((a, b) => BigInt(a) < BigInt(b) ? a : b);
          if (next === before) throw Error('Invalid message pagination');
          before = next;
        }
      } catch (error) { failure(`messages:${channel.id}`, error); }
    }
    manifest.completedAt = new Date().toISOString();
    yield jsonLine({ type: 'manifest', data: manifest });
  }
  await pipeline(Readable.from(records()), createGzip(), createWriteStream(destination, { mode: 0o600 }));
  return manifest;
}

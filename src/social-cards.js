import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';

export function socialButtons(links) {
  return [new ActionRowBuilder().addComponents(links.map(([label, url]) =>
    new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel(label).setURL(url)))];
}
export function announcement(kind, url, config) {
  const video = kind === 'video';
  const embed = new EmbedBuilder().setColor(0xffffff)
    .setAuthor({ name: `@${config.username} · TikTok` })
    .setTitle(video ? 'Vídeo novo acabou de sair 🎬' : 'Estamos em direto 🔴')
    .setDescription(video
      ? 'Quem puder ir dar uma força 🙌\nPassa por lá, deixa o teu gosto e diz o que achaste!'
      : 'A live já começou! Vem conversar e acompanhar o direto.\nA tua presença faz a diferença 🤍')
    .setURL(url)
    .addFields({ name: video ? '✦ Novo conteúdo' : '◉ Live online', value: `[${video ? 'Ver vídeo no TikTok' : 'Entrar na live'}](${url})` })
    .setFooter({ text: 'Nox · Obrigado pelo teu apoio' }).setTimestamp();
  if (config.divulgarImage) embed.setThumbnail(config.divulgarImage);
  if (config.banner) embed.setImage(config.banner);
  return {
    ...(config.role ? { content: `<@&${config.role}>` } : {}),
    embeds: [embed],
    components: socialButtons([[video ? '▶ Ver vídeo' : '◉ Entrar na live', url]]),
    allowedMentions: { parse: [], roles: config.role ? [config.role] : [] },
  };
}

import { socialButtons } from './social-cards.js';
import { EmbedBuilder, MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';

export const divulgarCommand = new SlashCommandBuilder()
  .setName('divulgar')
  .setDescription('Publicar as redes sociais com um cartão de divulgação.')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addStringOption(option => option.setName('instagram').setDescription('O teu @ ou link do Instagram (opcional).').setMaxLength(200))
  .addAttachmentOption(option => option.setName('imagem').setDescription('Fotografia ou banner para o cartão (opcional).'));

function instagramProfile(value) {
  if (!value) return null;
  let username = value.trim().replace(/^@/, '');
  if (/^https?:\/\//i.test(username)) {
    let url;
    try { url = new URL(username); } catch { throw Error('Instagram inválido. Usa o teu @ ou o link do perfil.'); }
    if (!['instagram.com', 'www.instagram.com'].includes(url.hostname)) throw Error('O link tem de ser do Instagram.');
    const match = url.pathname.match(/^\/([a-zA-Z0-9_.]{1,30})\/?$/);
    if (!match) throw Error('Usa um link de perfil do Instagram, não de uma publicação.');
    username = match[1];
  }
  if (!/^[a-zA-Z0-9_.]{1,30}$/.test(username)) throw Error('Instagram inválido. Usa o teu @ ou o link do perfil.');
  return `https://www.instagram.com/${username}/`;
}

export function buildDivulgacao({ username, instagram, image }) {
  const fields = [{ name: 'TikTok', value: `➡️ https://www.tiktok.com/@${username}` }];
  const profile = instagramProfile(instagram);
  if (profile) fields.push({ name: 'Instagram', value: `➡️ ${profile}` });
  const embed = new EmbedBuilder().setColor(0xffffff)
    .setAuthor({ name: `@${username} · As minhas redes` })
    .setTitle('Fica por perto 🤍')
    .setDescription('Vídeos, lives e um pouco do meu dia a dia.\nSegue as minhas redes e vem fazer parte da comunidade.')
    .addFields(fields.map(field => ({ ...field, inline: true })))
    .setFooter({ text: 'Nox · Obrigado por estares desse lado' });
  if (image) {
    if (!/^image\/(png|jpeg|webp|gif)$/.test(image.contentType || '')) throw Error('Escolhe uma imagem PNG, JPG, WEBP ou GIF.');
    embed.setImage(image.url);
  }
  return embed;
}

export async function registerDivulgar(guild) {
  // Update only our own command; preserve other commands in this server.
  const commands = await guild.commands.fetch();
  const existing = commands.find(command => command.name === 'divulgar' && command.type === 1);
  if (existing) await guild.commands.edit(existing.id, divulgarCommand.toJSON());
  else await guild.commands.create(divulgarCommand.toJSON());
}

export async function handleDivulgar(interaction, config) {
  if (!interaction.isChatInputCommand() || interaction.commandName !== 'divulgar') return false;
  const privateReply = content => interaction.reply({ content, flags: MessageFlags.Ephemeral });
  if (interaction.guildId !== config.guild) {
    await privateReply('Este comando só está disponível no servidor configurado.');
    return true;
  }
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
    await privateReply('Precisas da permissão Gerir servidor para divulgar.');
    return true;
  }
  const permissions = interaction.appPermissions;
  if (!permissions?.has([PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks])) {
    await privateReply('Preciso das permissões Enviar mensagens e Inserir links neste canal.');
    return true;
  }
  let embed;
  try {
    embed = buildDivulgacao({
      username: config.username,
      instagram: interaction.options.getString('instagram') || config.instagram,
      image: interaction.options.getAttachment('imagem') || (config.divulgarImage ? { url: config.divulgarImage, contentType: 'image/webp' } : null),
    });
  } catch (error) {
    await privateReply(error.message);
    return true;
  }
  const links = embed.toJSON().fields.map(field => [field.name, field.value.replace('➡️ ', '')]);
  await interaction.reply({ embeds: [embed], components: socialButtons(links), allowedMentions: { parse: [] } });
  return true;
}

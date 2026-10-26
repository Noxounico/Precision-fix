import { EmbedBuilder } from 'discord.js';

function card(guild) {
  const embed = new EmbedBuilder().setColor(0xffffff)
    .setAuthor({ name: `${guild?.name || 'Servidor'} · Suporte` });
  const icon = guild?.iconURL?.({ size: 128 });
  if (icon) embed.setThumbnail(icon);
  return embed;
}
export function ticketPanel(guild, banner) {
  const embed = card(guild).setTitle('Como podemos ajudar?')
    .setDescription('Fala com a nossa equipa num espaço reservado.\nCarrega em **Abrir ticket** para iniciar o teu atendimento.')
    .addFields(
      { name: '✦ Antes de abrir', value: 'Prepara uma descrição do problema e, se possível, imagens que ajudem a explicar.' },
      { name: '◈ Atendimento privado', value: 'A equipa de suporte acompanha o teu pedido dentro do ticket.' },
    ).setFooter({ text: 'Um ticket por pessoa · Obrigado pela paciência' });
  if (banner) embed.setImage(banner);
  return embed;
}
export function ticketWelcome(guild, owner, roles) {
  return card(guild).setTitle('O teu atendimento começa aqui')
    .setDescription(`<@${owner}>, bem-vindo/a ao teu ticket.\nConta-nos o que precisas e partilha os detalhes numa só mensagem.`)
    .addFields(
      { name: '◷ Estado', value: 'A aguardar a equipa', inline: true },
      { name: '♧ Equipa responsável', value: roles.map(id => `<@&${id}>`).join('\n') || 'Suporte', inline: true },
      { name: '✦ O que enviar', value: 'O motivo do pedido, o que já tentaste e capturas de ecrã relevantes.' },
    ).setFooter({ text: 'Só a equipa pode fechar · A transcrição será enviada para o teu privado' });
}
export function transcriptCard(guild, channelId, owner, closedBy, privateCopy = false) {
  return card(guild).setTitle(privateCopy ? 'O teu atendimento ficou registado' : 'Atendimento arquivado')
    .setDescription(privateCopy
      ? 'Consulta o ficheiro em anexo para rever a conversa com a equipa. Obrigado por entrares em contacto.'
      : 'A conversa foi exportada. O histórico completo segue nos ficheiros em anexo.')
    .addFields(
      { name: 'Ticket', value: `\`${channelId}\``, inline: true },
      { name: 'Autor', value: `<@${owner}>`, inline: true },
      { name: 'Encerrado por', value: `<@${closedBy}>`, inline: true },
    ).setFooter({ text: 'Registo de atendimento · Guarda esta cópia para referência' }).setTimestamp();
}

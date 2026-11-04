import { EmbedBuilder } from 'discord.js';
import { randomInt } from 'node:crypto';
export const setups = [
  { cpu: 'AMD Ryzen 5 5600', board: 'B550 AM4 com BIOS compatível com Ryzen 5000', gpu: 'Radeon RX 6600 8 GB' },
  { cpu: 'Intel Core i3-12100F', board: 'B660 DDR4 LGA1700', gpu: 'Radeon RX 6600 8 GB' },
  { cpu: 'Intel Core i5-12400F', board: 'B660 DDR4 LGA1700', gpu: 'GeForce RTX 3060 12 GB' },
];
export const levelChannel = '1567318868353884161';
export async function announceLevel(guild, id, before, after) {
  const oldLevel = Math.floor(Math.sqrt(before / 100));
  const level = Math.floor(Math.sqrt(after / 100));
  if (level <= oldLevel) return;
  const channel = await guild.channels.fetch(levelChannel);
  await channel.send({ content: `Parabéns <@${id}>, você passou para o nível **${level}**`, allowedMentions: { users: [id], parse: [] } });
}
export async function handleSetup(message, config, choose = randomInt) {
  if (message.guildId !== config.guild || message.author.bot || message.webhookId || message.content?.trim() !== '!setup') return false;
  const setup = setups[choose(setups.length)];
  const embed = new EmbedBuilder().setColor(0x5865f2).setTitle('🖥️ Setup para FiveM')
    .setDescription('Uma sugestão de PC para jogar FiveM (GTA V Legacy).')
    .addFields(
      { name: 'Processador', value: setup.cpu },
      { name: 'Placa-mãe', value: setup.board },
      { name: 'Placa gráfica', value: setup.gpu },
      { name: 'Memória RAM', value: '16 GB (2 × 8 GB) DDR4-3200 em dual channel' },
      { name: 'Armazenamento', value: 'SSD NVMe de 1 TB' },
      { name: 'Fonte', value: '550 W de boa qualidade, com as ligações exigidas pela gráfica' },
      { name: 'Caixa e refrigeração', value: 'Caixa com boa ventilação, compatível com a placa-mãe e gráfica; cooler compatível com o socket' })
    .setFooter({ text: 'O desempenho varia conforme o servidor e as definições. Usa !setup para outra sugestão.' });
  await message.reply({ embeds: [embed], allowedMentions: { parse: [], repliedUser: false } });
  return true;
}

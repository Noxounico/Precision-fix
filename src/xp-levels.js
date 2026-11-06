import { EmbedBuilder, PermissionFlagsBits as P, SlashCommandBuilder } from 'discord.js';
export const tiers = [
 [500,'1561471681904508999','Aprendiz I','Cor diferente no nome.'],
 [2500,'1561471651303002122','Aprendiz II','Mais 1.0x no multiplicador.'],
 [5500,'1561471612111560714','Aprendiz III','Acesso aos efeitos sonoros do Discord.'],
 [10000,'1561471574257701035','Mestre I','Usar efeitos sonoros externos.'],
 [20000,'1561471537591091250','Mestre II','Mais 1.0x no multiplicador.'],
 [40000,'1561471421257879572','Mestre III','Acesso aos emojis externos.'],
 [60000,'1561471416996462834','Veterano I','Usar figurinhas externas e criar expressões.'],
 [85000,'1561471352995848305','Veterano II','Poder mover outros membros de call.'],
 [125000,'1561471233688735824','Veterano III','Silenciar e ensurdecer outros membros.'],
];
export const multiplier = xp => 1 + Number(xp >= 2500) + Number(xp >= 20000);
export const xpCommand = new SlashCommandBuilder().setName('xp').setDescription('XP e níveis do servidor.')
 .addSubcommand(s=>s.setName('mensagem').setDescription('Publicar o quadro de níveis neste canal (Gerir servidor).'))
 .addSubcommand(s=>s.setName('ver').setDescription('Consultar o teu XP.'));
export function levelsEmbed() {
 const lines = tiers.map(([xp, id, , benefit], index) => {
  const value = String(xp).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return (index > 0 && index % 3 === 0 ? '\n' : '') + '<@&' + id + '> `'+ value + ' XP` - ' + benefit;
 });
 return new EmbedBuilder().setColor(0x5865f2).setTitle('✨ Níveis').setDescription(
  lines.join('\n') + '\n\nGanhe mais **XP** interagindo no servidor\nPara ver o seu XP digite `/xp ver` no canal #cmds\nTodas as permissões concedidas em níveis menores se mantêm.');
}
export async function publishLevels(interaction) {
 if (!interaction.memberPermissions?.has(P.ManageGuild)) {
  await interaction.reply({content:'Precisas de Gerir servidor para publicar o quadro.',flags:64}); return;
 }
 await interaction.reply({embeds:[levelsEmbed()],allowedMentions:{parse:[]}});
}
export async function syncXpRoles(member, xp) {
 if (!member || member.user?.bot) return;
 const missing=tiers.filter(([threshold,id])=>xp>=threshold && !member.roles.cache.has(id)).map(([,id])=>id);
 if(missing.length) await member.roles.add(missing,'Níveis de XP conquistados');
}

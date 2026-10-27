import { AttachmentBuilder, PermissionFlagsBits as P, SlashCommandBuilder } from 'discord.js';
import { mkdtemp, rm, stat, open } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { exportBackup } from './backup-export.js';
const running = new Set();
const definition = name => new SlashCommandBuilder().setName(name)
  .setDescription('Exportar os dados acessíveis do servidor para o teu privado.')
  .setDefaultMemberPermissions(P.Administrator)
  .addBooleanOption(option => option.setName('mensagens').setDescription('Incluir histórico acessível (por defeito, sim). Pode demorar.'));
export const backupCommands = [definition('backup'), definition('bckup')];
const instructions = `BACKUP DISCORD — NOX\n\nFormato: NDJSON comprimido com gzip. Descomprime com 7-Zip/gzip; cada linha contém um registo JSON.\nO último registo (manifest) lista contagens, erros de acesso e limitações.\nSe existirem ficheiros .part001, .part002, etc., junta-os por ordem antes de descomprimir:\nWindows (cmd): copy /b nome.ndjson.gz.part* nome.ndjson.gz\nLinux/macOS: cat nome.ndjson.gz.part* > nome.ndjson.gz\n\nNão existe restauro automático. Mensagens/anexos apagados e DMs não podem ser recuperados.\nAnexos, ícones e imagens são links, não cópias binárias, e podem expirar. Tokens, segredos de webhooks e códigos de convite não são exportados.\nA exportação não congela o servidor e só inclui dados acessíveis ao bot. Guarda os ficheiros num local privado.\n`;
export async function sendBackupFile(dm, file, name, partSize = 7_500_000) {
  const size = (await stat(file)).size;
  if (size <= partSize) {
    await dm.send({ content: 'Exportação comprimida do servidor:', files: [new AttachmentBuilder(file, { name })] }); return;
  }
  const source = await open(file, 'r');
  try {
    let offset = 0, index = 1;
    while (offset < size) {
      const buffer = Buffer.alloc(Math.min(partSize, size - offset));
      let filled = 0;
      while (filled < buffer.length) {
        const { bytesRead } = await source.read(buffer, filled, buffer.length - filled, offset + filled);
        if (!bytesRead) throw Error('Backup file ended unexpectedly');
        filled += bytesRead;
      }
      await dm.send({ content: `Backup · parte ${index}/${Math.ceil(size / partSize)}. Junta todas as partes antes de descomprimir.`,
        files: [new AttachmentBuilder(buffer, { name: `${name}.part${String(index).padStart(3, '0')}` })] });
      offset += filled; index++;
    }
  } finally { await source.close(); }
}
export async function handleBackup(interaction, config) {
  if (!interaction.isChatInputCommand() || !['backup', 'bckup'].includes(interaction.commandName)) return false;
  const reply = content => interaction.reply({ content, flags: 64 });
  if (interaction.guildId !== config.guild || !interaction.memberPermissions?.has(P.Administrator)) {
    await reply('Só administradores do servidor configurado podem criar backups.'); return true;
  }
  if (running.has(config.guild)) { await reply('Já existe um backup deste servidor em curso.'); return true; }
  running.add(config.guild);
  let directory;
  try {
    await interaction.deferReply({ flags: 64 });
    let dm;
    try {
      dm = await interaction.user.createDM();
      await dm.send('📦 A exportação do servidor foi iniciada. Os ficheiros e o relatório serão enviados aqui. Servidores grandes podem demorar bastante.');
    } catch {
      await interaction.editReply('Não consigo enviar-te mensagens privadas. Ativa as DMs para este servidor e tenta novamente.'); return true;
    }
    await interaction.editReply('📦 Backup iniciado. A exportação e as instruções serão enviadas ao teu privado.');
    directory = await mkdtemp(join(tmpdir(), 'nox-discord-backup-'));
    const file = join(directory, 'backup.ndjson.gz');
    const manifest = await exportBackup(interaction.guild, file, {
      messages: interaction.options.getBoolean('mensagens') !== false, messageContent: config.messageContent,
    });
    await dm.send({ content: `📦 **Dados recolhidos — a enviar os ficheiros**\nCanais/tópicos: ${manifest.counts.channel || 0} · Cargos: ${manifest.counts.role || 0} · Membros: ${manifest.counts.member || 0} · Mensagens: ${manifest.counts.message || 0}\nSecções com falhas/limitações: **${manifest.errors.length}**. Consulta o relatório.`,
      files: [new AttachmentBuilder(Buffer.from(instructions), { name: 'LEIA-ME.txt' }), new AttachmentBuilder(Buffer.from(JSON.stringify(manifest, null, 2)), { name: 'relatorio.json' })] });
    await sendBackupFile(dm, file, `discord-${config.guild}-${Date.now()}.ndjson.gz`);
    await dm.send('✅ Envio do backup concluído. Guarda todas as partes, o relatório e as instruções. Confirma no relatório quais as secções que ficaram de fora.');
  } catch (error) {
    console.error(`Backup falhou (código: ${error.code || error.name || 'unknown'}).`);
    await interaction.followUp({ content: 'A exportação ou o envio do backup falhou. Verifica os logs, as permissões e as tuas DMs. Não assumas que recebeste uma cópia completa.', flags: 64 }).catch(() => {});
  } finally {
    running.delete(config.guild);
    if (directory) await rm(directory, { recursive: true, force: true });
  }
  return true;
}

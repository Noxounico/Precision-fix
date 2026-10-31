import { EmbedBuilder, MessageFlags, SlashCommandBuilder } from 'discord.js';

export const regrasCommand = new SlashCommandBuilder()
  .setName('regras')
  .setDescription('Mostrar as regras do servidor.');

export function buildRegras() {
  return new EmbedBuilder().setColor(0xffffff).setTitle('👑 REGRAS')
    .setDescription('Estas são as regras do servidor: ao entrar no mesmo e participar da comunidade, **você concorda com todas.**')
    .addFields(
      { name: '1. Arquivos', value: 'Não nos responsabilizamos por arquivos de terceiros.' },
      { name: '2. Comportamento', value: 'É do dever de todos manter o respeito com qualquer membro desta comunidade. Sendo proibido qualquer tipo de crime como: racismo, gordofobia, pedofilia e etc.' },
      { name: '3. Arquivos maliciosos', value: 'É proibido qualquer tipo de arquivo contendo: pedofilia, gore, fotos ou dados de terceiros e etc.' },
      { name: '4. Divulgação de serviços', value: 'É proibida a divulgação de qualquer serviço no servidor, sem o consentimento da staff' },
      { name: '5. Uso dos canais', value: 'É o dever de todos o uso correto de todos os canais, sem bagunçar ou algo do gênero.' },
      { name: '6. Hack ou apologia', value: 'É estritamente proibido o uso ou apologia a hack, cheat e etc, dentro deste servidor.' },
      { name: '7. Regra do bom senso', value: 'Exigimos total respeito a todos os membros e regras (mesmo que não estejam aqui citadas, regras para uma boa convivência enquadram-se nas regras de bom senso) todas cabíveis a punição, ou até ao banimento sem volta ao servidor.' },
    );
}

export async function handleRegras(interaction, config) {
  if (!interaction.isChatInputCommand() || interaction.commandName !== 'regras') return false;
  if (interaction.guildId !== config.guild) {
    await interaction.reply({ content: 'Este comando só está disponível no servidor configurado.', flags: MessageFlags.Ephemeral });
    return true;
  }
  await interaction.reply({ embeds: [buildRegras()], allowedMentions: { parse: [] } });
  return true;
}

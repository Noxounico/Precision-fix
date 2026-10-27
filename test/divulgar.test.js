import test from 'node:test';
import assert from 'node:assert/strict';
import { PermissionsBitField, PermissionFlagsBits } from 'discord.js';
import { readConfig } from '../src/config.js';
import { buildDivulgacao, handleDivulgar, registerDivulgar } from '../src/divulgar.js';

test('cartão só tem TikTok e Instagram, com barra branca e imagem', () => {
  const result = buildDivulgacao({ username: 'noxdu7', instagram: '@exemplo', image: { contentType: 'image/png', url: 'https://cdn.discordapp.com/test.png' } }).toJSON();
  assert.equal(result.title, 'Fica por perto 🤍');
  assert.equal(result.color, 0xffffff);
  assert.deepEqual(result.fields.map(field => field.name), ['TikTok', 'Instagram']);
  assert.equal(result.fields[0].value, '➡️ https://www.tiktok.com/@noxdu7');
  assert.equal(result.fields[1].value, '➡️ https://www.instagram.com/exemplo/');
  assert.equal(result.image.url, 'https://cdn.discordapp.com/test.png');
});
test('opções omitidas, normalização de perfil e rejeição de links e anexos inválidos', () => {
  assert.equal(buildDivulgacao({ username: 'noxdu7' }).toJSON().fields.length, 1);
  assert.equal(buildDivulgacao({ username: 'noxdu7', instagram: 'https://instagram.com/exemplo/?igsh=123' }).toJSON().fields[1].value, '➡️ https://www.instagram.com/exemplo/');
  assert.throws(() => buildDivulgacao({ username: 'noxdu7', instagram: 'https://instagram.com.evil.test/name' }));
  assert.throws(() => buildDivulgacao({ username: 'noxdu7', image: { contentType: 'application/pdf', url: 'https://example.com/file.pdf' } }));
});
function interaction() {
  const replies = [];
  return {
    replies, isChatInputCommand: () => true, commandName: 'divulgar', guildId: 'server',
    memberPermissions: new PermissionsBitField(PermissionFlagsBits.ManageGuild),
    appPermissions: new PermissionsBitField([PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks]),
    options: { getString: () => '@exemplo', getAttachment: () => null },
    reply: async reply => replies.push(reply),
  };
}
test('comando publica cartão público sem pings; recusa outro servidor e membros sem permissão', async () => {
  const config = { guild: 'server', username: 'noxdu7' };
  const good = interaction(); await handleDivulgar(good, config);
  assert.equal(good.replies[0].embeds.length, 1);
  assert.deepEqual(good.replies[0].allowedMentions.parse, []);
  for (const patch of [{ guildId: 'other' }, { memberPermissions: new PermissionsBitField() }, { appPermissions: new PermissionsBitField() }]) {
    const denied = Object.assign(interaction(), patch);
    await handleDivulgar(denied, config);
    assert.equal(denied.replies[0].flags, 64);
    assert.equal(denied.replies[0].embeds, undefined);
  }
});
test('registo preserva outros comandos e atualiza apenas divulgar', async () => {
  const edits = [];
  const guild = { commands: {
    fetch: async () => new Map(),
    create: async command => edits.push(['create', command.name]),
    edit: async id => edits.push(['edit', id]),
  } };
  // Discord returns a Collection with find().
  guild.commands.fetch = async () => ({ find: predicate => [{ id: 'other', name: 'outro', type: 1 }, { id: 'own', name: 'divulgar', type: 1 }].find(predicate) });
  await registerDivulgar(guild);
  assert.deepEqual(edits, [['edit', 'own']]);
  guild.commands.fetch = async () => ({ find: () => undefined });
  await registerDivulgar(guild);
  assert.deepEqual(edits[1], ['create', 'divulgar']);
});

test('divulgar sem opções usa o Instagram do proprietário', async () => {
  const config = readConfig({ DISCORD_TOKEN: 'test' });
  assert.equal(config.instagram, '_.rafaeldu7');
  const request = interaction();
  request.guildId = config.guild;
  request.options.getString = () => null;
  await handleDivulgar(request, config);
  const fields = request.replies[0].embeds[0].toJSON().fields;
  assert.equal(fields[1].value, '➡️ https://www.instagram.com/_.rafaeldu7/');
});

test('divulgar sem opções mostra a foto predefinida; anexo explícito tem prioridade', async () => {
  const config = readConfig({ DISCORD_TOKEN: 'test' });
  const request = interaction();
  request.guildId = config.guild;
  request.options.getString = () => null;
  await handleDivulgar(request, config);
  assert.equal(request.replies[0].embeds[0].toJSON().image.url, config.divulgarImage);
  assert.match(config.divulgarImage, /1564101030474420355/);
  const custom = interaction();
  custom.guildId = config.guild;
  custom.options.getAttachment = () => ({ url: 'https://cdn.discordapp.com/custom.png', contentType: 'image/png' });
  await handleDivulgar(custom, config);
  assert.equal(custom.replies[0].embeds[0].toJSON().image.url, 'https://cdn.discordapp.com/custom.png');
  assert.throws(() => readConfig({ DISCORD_TOKEN: 'test', DIVULGAR_IMAGE_URL: 'blob:https://web.whatsapp.com/photo' }), /HTTPS/);
});

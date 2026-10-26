# Bot Discord — noxdu7

Bot em Node.js com mensagens de boas-vindas e de saída, avisos de lives e vídeos novos do TikTok **@noxdu7**. Substitui a antiga aplicação Electron PrecisionFix.

## Instalação

Requer Node.js 22+ e Python 3.10+ para o yt-dlp.

```sh
npm ci
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
cp .env.example .env
```

No Windows, o executável fica em `.venv\Scripts\yt-dlp.exe`; no Linux local, `.venv/bin/yt-dlp`. Coloque esse caminho em `YTDLP_BIN`. A configuração de exemplo usa o ambiente virtual já instalado nesta máquina cloud.

## Configurar o Discord

O servidor, os quatro canais e o perfil @noxdu7 já têm valores predefinidos em `src/config.js`. No alojamento deste bot basta fornecer `DISCORD_TOKEN`; variáveis de ambiente não vazias podem substituir os valores públicos. O token nunca tem valor predefinido.

1. No Discord Developer Portal, crie uma aplicação e um bot. Ative **Server Members Intent** na página Bot. Não precisa de Message Content Intent.
2. Convide o bot pelo OAuth2 URL Generator, scope `bot`, com **View Channels** e **Send Messages**. Dê acesso aos quatro canais. Não precisa de administrador.
3. Ative o modo de programador no Discord e copie o ID do servidor e dos canais para `.env`: `GUILD_ID`, `WELCOME_CHANNEL_ID`, `LEAVE_CHANNEL_ID`, `LIVE_CHANNEL_ID`, `VIDEO_CHANNEL_ID`.
4. Coloque o token em `DISCORD_TOKEN` apenas no ficheiro privado `.env` ou nas variáveis seguras do alojamento. Nunca envie o token por chat ou Git. Se for exposto, faça Reset Token no portal.
5. Opcionalmente configure `NOTIFICATION_ROLE_ID`: o cargo precisa de ser mencionável pelo bot. Por defeito não há ping, nem `@everyone`.

```sh
npm run check
npm test
npm start
```

`check` valida configuração local sem ligar ao Discord. No arranque, o bot valida o acesso aos canais. Mantenha **uma única instância** em execução por ficheiro de estado; para funcionar permanentemente, o alojamento precisa de manter o processo ligado. Fechar esta tarefa cloud não garante alojamento permanente.

## Comportamento

- Entrada: `👋 Bem-vindo/a, @membro! Boa estadia no servidor ...!`
- Saída: `👋 @membro saiu do servidor. Até à próxima!` (sem notificar quem saiu).
- Live: `🔴 Live online!` e link do TikTok. Verificação a cada 60 segundos.
- Vídeo: `🎬 Vídeo novo!` e link do vídeo. Verificação a cada 5 minutos.

O primeiro vídeo encontrado é guardado como referência e não gera divulgação de conteúdo antigo. Se a primeira consulta encontrar uma live já online, avisa uma vez. O estado em `data/state.json` evita repetir avisos após reiniciar e só rearma a live após duas consultas offline. Preserve esse ficheiro. Podem existir duplicados se o processo falhar entre o envio ao Discord e a gravação do estado. Entre consultas, várias publicações ou uma live muito curta podem não ser detetadas; o monitor divulga o vídeo mais recente que o TikTok devolver.

A deteção usa interfaces públicas não oficiais (`tiktok-live-connector` e `yt-dlp`). O TikTok pode bloquear pedidos de servidores cloud, impor desafios ou mudar as interfaces. Erros de consulta são registados e tentados novamente sem marcar conteúdo como anunciado; não são tratados como uma live terminada. Não há garantia de deteção até validar no alojamento com o perfil real. Não há descarregamento dos vídeos nem envio de mensagens no TikTok.

## Validação

`npm test` verifica transições de live, prevenção de repetição após reinício, referência inicial de vídeos, recuperação de falhas de envio, persistência concorrente e configuração inválida. Usa destinos simulados e não envia mensagens reais.

Para validar a integração completa, configure o bot, execute `npm start`, entre/saia com uma conta de teste e faça uma live/publicação de teste em @noxdu7. Confirme as mensagens nos canais e reinicie para verificar que não se repetem. Essa validação exige token e acesso ao servidor.

O projeto antigo foi preservado nesta máquina em `/workspace/backups/precisionfix-before-discord.tar.gz`; também continua disponível no histórico Git. Não é usado pelo bot.

## Deploy em contentor

Se os logs mostram `precisionfix@1.0.0` e `electron .`, o alojamento está a executar o código antigo. Esta versão deve mostrar `precision-discord-bot@1.0.0` e `node src/index.js`. Publique os ficheiros novos (incluindo `src/`, `package.json`, `package-lock.json`, `requirements.txt` e `Dockerfile`) no repositório/branch que o alojamento usa e faça um novo deploy. Alterações apenas nesta máquina cloud não atualizam o seu alojamento.

Use o Dockerfile incluído para instalar Node.js, Python e yt-dlp. Remova qualquer comando de arranque antigo que force `electron .`. O arranque é `npm start`; o bot é um worker, sem porta HTTP nem health check HTTP. Configure no alojamento todas as variáveis de `.env.example`, com o token apenas nas variáveis privadas. O Dockerfile não copia `.env`. O contentor define `YTDLP_BIN=/opt/yt-dlp/bin/yt-dlp`: não substitua esse caminho pelo caminho `/workspace/...` do exemplo.

```sh
docker build -t precision-discord-bot .
docker run --rm --env-file .env -e YTDLP_BIN=/opt/yt-dlp/bin/yt-dlp precision-discord-bot
```

Para persistência entre deploys, monte um volume em `/app/data` com permissões de escrita para o utilizador `node` (UID 1000). Sem volume, o estado pode ser perdido ao recriar o contentor. O bot precisa de acesso HTTPS ao Discord e TikTok, e WebSocket ao Gateway do Discord. Os testes locais não substituem validar estas ligações no alojamento.

## Comando /divulgar

Depois do deploy, o bot regista `/divulgar` no servidor configurado. Quem tiver **Gerir servidor** pode executá-lo no canal onde quer publicar o cartão. O cartão tem uma barra azul, título “Como me achar? ⬇️”, o TikTok @noxdu7 e, quando indicado, o Instagram. Não inclui X nem YouTube e não menciona everyone.

Exemplo: `/divulgar instagram:@teuperfil imagem:<anexo>`.

As duas opções são facultativas. `INSTAGRAM_USERNAME` pode guardar o Instagram habitual nas variáveis do alojamento; a opção do comando tem prioridade. O perfil predefinido é `@_.rafaeldu7`, fornecido pelo proprietário. A opção `imagem` aceita PNG, JPG, WEBP e GIF e aparece por baixo dos links, como no exemplo. Sem anexo, usa a foto predefinida enviada pelo proprietário. A opção `imagem` tem prioridade sobre essa foto.

O bot precisa de **Enviar mensagens** e **Inserir links (Embed Links)** no canal. Se o comando não aparecer, autorize a aplicação com os scopes `bot` e `applications.commands` no OAuth2 do Discord e confirme que o novo deploy arrancou. O registo atualiza apenas `/divulgar`, preservando outros comandos existentes.

Endereços `blob:` do WhatsApp são locais à sessão do navegador e não servem como URL de imagem no Discord. Para usar uma foto, selecione o ficheiro na opção `imagem` do comando `/divulgar` diretamente no Discord.

A foto predefinida de `/divulgar` usa o link Discord fornecido pelo proprietário. O download foi bloqueado pelo proxy desta máquina; a imagem não está incluída como ficheiro no repositório. Links assinados de anexos podem expirar: nesse caso, atualize `DIVULGAR_IMAGE_URL` com uma URL HTTPS acessível ou forneça um anexo na opção `imagem`.

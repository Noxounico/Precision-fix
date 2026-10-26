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

1. No Discord Developer Portal, crie uma aplicação e um bot. Ative **Server Members Intent** na página Bot. Ative também **Message Content Intent** para as transcrições dos tickets.
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
- Vídeo: `🎬 Vídeo novo!` e link do vídeo. Verificação a cada 60 segundos, por defeito. Se já existir `VIDEO_POLL_SECONDS` no alojamento, essa variável tem prioridade.

Na primeira consulta, o bot guarda os vídeos como referência e só divulga o mais recente se tiver sido publicado na última hora. Conteúdo mais antigo não gera aviso inicial. Se a primeira consulta encontrar uma live já online, avisa uma vez. O estado em `data/state.json` evita repetir avisos após reiniciar e só rearma a live após duas consultas offline. Preserve esse ficheiro. Podem existir duplicados se o processo falhar entre o envio ao Discord e a gravação do estado. O bot consulta até dez entradas do perfil, ordena os IDs por data para não confundir vídeos fixados com o mais recente e anuncia os novos vídeos detetados em ordem cronológica. Mais de dez publicações entre consultas, vídeos não devolvidos pelo TikTok ou uma live muito curta podem não ser detetados.

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

Depois do deploy, o bot regista `/divulgar` no servidor configurado. Quem tiver **Gerir servidor** pode executá-lo no canal onde quer publicar o cartão. O cartão tem uma barra branca, título “Como me achar? ⬇️”, o TikTok @noxdu7 e, quando indicado, o Instagram. Não inclui X nem YouTube e não menciona everyone.

Exemplo: `/divulgar instagram:@teuperfil imagem:<anexo>`.

As duas opções são facultativas. `INSTAGRAM_USERNAME` pode guardar o Instagram habitual nas variáveis do alojamento; a opção do comando tem prioridade. O perfil predefinido é `@_.rafaeldu7`, fornecido pelo proprietário. A opção `imagem` aceita PNG, JPG, WEBP e GIF e aparece por baixo dos links, como no exemplo. Sem anexo, usa a foto predefinida enviada pelo proprietário. A opção `imagem` tem prioridade sobre essa foto.

O bot precisa de **Enviar mensagens** e **Inserir links (Embed Links)** no canal. Se o comando não aparecer, autorize a aplicação com os scopes `bot` e `applications.commands` no OAuth2 do Discord e confirme que o novo deploy arrancou. O arranque regista os quatro comandos atuais e remove registos antigos deste bot.

Endereços `blob:` do WhatsApp são locais à sessão do navegador e não servem como URL de imagem no Discord. Para usar uma foto, selecione o ficheiro na opção `imagem` do comando `/divulgar` diretamente no Discord.

A foto predefinida de `/divulgar` usa o link Discord fornecido pelo proprietário. O download foi bloqueado pelo proxy desta máquina; a imagem não está incluída como ficheiro no repositório. Links assinados de anexos podem expirar: nesse caso, atualize `DIVULGAR_IMAGE_URL` com uma URL HTTPS acessível ou forneça um anexo na opção `imagem`.

## Banner do perfil do bot

No arranque, o bot aplica o banner fornecido pelo proprietário ao seu perfil global do Discord. `BOT_BANNER_URL` pode substituir o link predefinido. O token continua apenas no alojamento. A mensagem “Banner do perfil do bot atualizado.” confirma que a API aceitou a alteração; sem essa mensagem não se deve assumir que o banner mudou.

O estado guarda a URL e o hash do banner aplicado para evitar alterações repetidas após reiniciar. A falha de download ou da API é registada e não impede o resto do bot de arrancar. O link de anexo do Discord pode expirar: se isso ocorrer antes da aplicação, forneça um novo link em `BOT_BANNER_URL` e reinicie. Depois de aplicado com sucesso, o banner é guardado pelo Discord no perfil.

## Todos os comandos

- `/divulgar`: publica TikTok, Instagram e foto. Requer **Gerir servidor**.
- `/painel`: publica um painel com **Abrir ticket** no canal atual. Requer **Gerir servidor**. Qualquer membro com acesso ao painel pode clicar para abrir o seu ticket privado.
- `/rank [usuario]`: mostra nível, XP e posição. Disponível aos membros.
- `/top`: mostra os dez membros com mais XP. Disponível aos membros.

Os quatro comandos são registados/atualizados no servidor no arranque. Depois de registar os atuais com sucesso, o bot remove os seus comandos antigos e todos os seus registos globais para evitar duplicados. Comandos de outras aplicações não são alterados. Autorize `applications.commands` se o Discord não os mostrar. O XP usa apenas eventos de mensagens. As transcrições dos tickets precisam de **Message Content Intent** ativado no Developer Portal; o bot solicita esse intent no arranque.

### XP

Cada membro ganha 15 XP por mensagem elegível, no máximo uma vez por minuto, independentemente do canal. Bots, webhooks e outros servidores não contam. O nível é `floor(sqrt(XP / 100))`. A contagem começa quando esta versão entra em execução; mensagens antigas não são contadas. `data/state.json` guarda os pontos e o intervalo entre ganhos. Preserve o volume `/app/data` entre deploys para não perder o ranking.

### Tickets

O bot precisa de **Gerir canais**, **Gerir cargos** (para editar as permissões privadas dos canais), **Ver canais**, **Enviar mensagens**, **Ler histórico de mensagens** e **Anexar ficheiros**. Não precisa de administrador. O canal criado é privado para o autor, bot e os cargos `1562143820605300801` e `1562143823193309202`. Administradores do Discord mantêm acesso pela própria plataforma. `TICKET_SUPPORT_ROLE_IDS` permite substituir a lista, separando IDs por vírgula. No arranque, o bot atualiza também as permissões dos tickets existentes com o seu marcador no tópico. O cargo não pode ser `@everyone` nem um cargo gerido por uma integração.

Só pode haver um ticket aberto por membro; os canais com o marcador no tópico são reconhecidos mesmo após reiniciar. Apenas membros de um dos dois cargos configurados podem usar **Fechar ticket**. O autor e administradores sem esses cargos não conseguem fechar pelo botão. Após guardar a transcrição, o bot fecha o ticket, avisa no canal e apaga-o 5 segundos depois. O prazo fica no tópico para retomar a eliminação se o processo reiniciar entretanto. Canais antigos fechados sem esse marcador de eliminação não são apagados automaticamente, pois podem não ter transcrição arquivada. Antes de fechar, o bot exporta o histórico paginado em ficheiros TXT, envia para o canal privado `1562143825298980895` e tenta enviar uma cópia por DM ao autor. O canal de arquivo recebe as mesmas permissões privadas da equipa. Se o arquivo falhar, o ticket permanece aberto; se apenas a DM falhar, fecha com aviso à equipa. Anexos aparecem como links e podem expirar; o bot não copia os ficheiros anexados. Mensagens apagadas antes da exportação não podem ser recuperadas.

Valide o painel, a privacidade com uma conta normal e o XP no alojamento depois do deploy. Os testes simulam a API Discord; não verificam as permissões reais do servidor.

**Antes deste deploy:** ative **Message Content Intent** em Discord Developer Portal → aplicação → Bot. Sem autorização para esse intent, o Discord pode recusar a ligação. `MESSAGE_CONTENT_INTENT=false` permite arrancar sem o intent, mas bloqueia o fecho com transcrição para não produzir um arquivo incompleto. As permissões de Ler histórico, Enviar mensagens e Anexar ficheiros também são necessárias. Não há envio de transcrições para canais ou pessoas fora dos destinos pedidos.

O painel, a receção no ticket e os recibos das transcrições usam cartões brancos, ícone do servidor quando disponível e botões cinzentos. O painel utiliza o banner do bot; execute `/painel` novamente para publicar o visual novo. Os painéis e mensagens já enviados não são editados automaticamente. O bot também precisa de Inserir links no canal de arquivo para os cartões das transcrições.

### Recuperação do aviso de vídeo reportado

O proprietário reportou que o vídeo `7700986106065489185` de @noxdu7 não foi anunciado. A consulta real de yt-dlp confirmou que esse é o vídeo mais recente do perfil. Esta versão recupera esse aviso uma vez, incluindo se a primeira consulta antiga o tiver marcado apenas como referência. O envio bem-sucedido fica em `replayedVideos` no estado para não repetir nos reinícios; se o envio falhar, tenta na consulta seguinte. Preserve o volume de estado entre deploys. Os logs distinguem obter dados do TikTok, recuperar/enviar o aviso e guardar o estado, mostrando o ID do último vídeo e o canal de destino nas consultas bem-sucedidas.

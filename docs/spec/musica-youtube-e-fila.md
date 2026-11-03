# Música: escolher pelo YouTube e fila

Issue: (abrir) · Roadmap: — · Status: fases 1, 2 e 3 implementadas (escolher pelo YouTube e a fila); falta o deploy da VPS e o teste numa call.

Decisões propostas (confirmar em [Decisões em aberto](#decisões-em-aberto)): o escolhedor é uma `WebContentsView` numa
sessão só dele, sem `preload`, sem login no Google e sem mudar o CSP; o app só lê o endereço para onde a página foi
(`/watch?v=`, `/shorts/`, `/live/`, `youtu.be`). A fila é por canal e fica guardada pelo servidor da sala junto da
música. Quem pode controlar a música mexe na fila (quem está no canal). A fila segue na troca de host.

## Objetivo
Hoje, para pôr uma música, a pessoa sai do app, procura no navegador, copia o link e cola no balão. E cabe uma música
por canal: quando ela acaba, alguém tem que pôr outra. A proposta resolve as duas coisas: (1) procurar e escolher no
próprio YouTube, numa telinha dentro do app, sem copiar e colar; (2) uma fila por canal, que todos veem, para a próxima
música tocar sozinha.

## Escopo
- Entra:
  - o escolhedor do YouTube dentro do app, aberto pelo **Pôr música**, pelo **Trocar** e pelo **+ Procurar no YouTube** da fila.
    Colar o link continua como alternativa;
  - a fila por canal: ver o que vem depois, adicionar, mudar a ordem (arrastar ou subir/descer), tirar, tocar agora e
    pular;
  - a próxima da fila toca sozinha quando a música acaba;
  - as mensagens novas do protocolo da sala, com limites, a fila na troca de host e a compatibilidade com app e servidor
    antigos.
- Fica de fora:
  - login no Google dentro do escolhedor;
  - importar playlist ou mix inteiro (`list=`): entra só o vídeo clicado;
  - embaralhar, repetir, votação para pular, histórico da sala;
  - busca própria do app (resultados desenhados por nós) e a YouTube Data API;
  - comando de voz "põe X na fila" (fase futura; "toca X" continua trocando a música);
  - escolhedor no celular (`mobile/`): lá fica só o colar link.

## Como funciona hoje
O que a proposta muda (detalhes em `renderer/musica.js` e `sala-protocolo.js`):

- **Uma música por canal** (Voz geral ou subsala). O servidor da sala guarda `{ ch, videoId, title, by, playing, pos,
  at, dur }` (`createMusicas`) e manda tudo na mensagem `musicas`. Nenhum áudio passa pela sala: cada PC toca no
  player oficial (`youtube-nocookie.com/embed`, num `<iframe>` com `sandbox`), e a sala só combina o vídeo, tocando ou
  pausada, e o ponto.
- **Mensagens:** `musica-set` (pôr, se o canal está livre), `musica-ouvindo` (abriu ou fechou a tela) e `musica-ctl`
  com `play`, `pause`, `seek`, `trocar`, `stop`, `titulo` e `duracao`. Controla quem está no canal ou quem pôs
  (`canControlMusic` no app; a mesma conta no servidor).
- **Fim:** quem controla e está ouvindo manda `stop` 1,5 s depois do fim (6 s se não foi quem pôs); o palco vazio faz o
  mesmo (`palcoMusicaAcabou`, `membros.js`); e o servidor tira sozinho em `limparMusicas`, a cada 15 s (acabou há 5 s,
  pausada há 4 min ou 1 min sem ninguém).
- **Troca de host:** `becomeHost()` manda `musicSeed()` no `startServer`, e o servidor novo continua do ponto em que
  estava. No modo Internet a sala fica na VPS (`servidor-internet/server.js`), com o mesmo `sala-protocolo.js`. Os dois
  anunciam `musica` em `features`.
- **Onde se põe música:** a pílula **Pôr música** no cabeçalho do canal abre o balão `#musicPop`, para colar o link
  (`parseYouTube`); o chat tem `/musica` e **Tocar na voz** na prévia de links; o comando de voz "toca X" pega o
  primeiro resultado lendo a página de busca (`buscarYoutube`, `main/comando-voz-ia.js`); o mapa tem **Sem música · Pôr
  uma**.
- **Segurança:** o CSP do `index.html` só libera `frame-src https://www.youtube-nocookie.com`; o `main.js` põe o
  `Referer` nos pedidos do embed (sem ele, erro 153); título, canal e capa vêm por `youtubePrevia` (oEmbed, no processo
  principal), e a página não fala com a internet.
- O commit 12d7c53 deixa a barra da chamada numa faixa própria quando a música está no palco (`syncCallbarReserva`),
  para ela não cobrir os controles da música. A fila respeita essa faixa.

## Parte 1: escolher pelo YouTube

### Comportamento esperado
1. **Pôr música** (canal sem música), **Trocar** (na tela da música) ou **+ Procurar no YouTube** (na fila) abrem o
   **escolhedor**: um quadro grande no meio da janela, com o resto escurecido, já no YouTube.
2. O cabeçalho do quadro (desenhado pelo app, uma linha só) tem **Voltar**, a etiqueta do modo (**Tocar**, **Fila** ou
   **Trocar**) com a frase do que vai acontecer ("Clique num vídeo para tocar em Subsala_2", "… para pôr na fila de
   Subsala_2", "… para trocar a música de Subsala_2"), **Colar link** e **Fechar**. Embaixo, a página do YouTube de
   verdade, com a busca dele. O foco já vai para a página.
3. A pessoa procura e clica num vídeo (resultado da busca, Short, vídeo de um canal, item de um mix). O app reconhece o
   vídeo assim que a página começa a ir para ele. A página fica muda o tempo todo. Depois:
   - **pôr** e **trocar**: o quadro fecha e a música começa no canal, como se o link tivesse sido colado (a tela da
     música abre para quem escolheu);
   - **fila**: o quadro continua aberto e volta para a busca. Por 4 s a frase dá lugar a "Na fila: <título> (3ª)", e
     aparece o botão **Pronto · 2** (quantas você pôs) ao lado do **Fechar**.
4. Navegar pelo YouTube (canais, playlists, outra busca) funciona normalmente; só o clique num vídeo escolhe.
5. **Colar link** troca a frase do cabeçalho pelo campo de hoje (o mesmo `parseYouTube`), com **Tocar**, **Pôr na
   fila** ou **Trocar**.
6. **Fechar**, **Esc** (mesmo com o foco na página do YouTube) ou sair da sala fecham sem escolher. O foco volta para o
   botão que abriu. **F6** alterna o foco entre o cabeçalho e a página (como nos navegadores), para quem usa só o
   teclado não ficar preso dentro do YouTube.
7. Os avisos do escolhedor ficam no próprio cabeçalho (`role="status"`), nunca em aviso solto do app: os avisos do app
   ficam embaixo dos diálogos e atrás da página do YouTube.

Erros e casos-limite:
- **Sem internet, ou o YouTube não carregou** em 15 s: o quadro mostra "Não consegui abrir o YouTube." com **Tentar de
  novo** e **Colar link**.
- **Vídeo que não deixa tocar fora do YouTube:** antes de pôr, o processo principal consulta o oEmbed (`checarVideo`). Se o
  YouTube disser que o vídeo é privado, removido ou não deixa incorporar, o quadro não fecha e avisa "Esse vídeo não
  deixa tocar fora do YouTube. Escolha outro." Sem resposta (rede), põe assim mesmo: o player de quem ouve já avisa
  (erro 101, 150 ou 153).
- **"Fazer login" do YouTube**, anúncio que leva para outro site ou qualquer link para fora: não abre. O aviso do
  cabeçalho diz "Links para fora do YouTube não abrem aqui" (no login: "Entrar na conta Google não funciona aqui. A
  busca funciona sem conta.").
- **Janela pequena** (o mínimo do app é 820 × 560): o quadro ocupa quase tudo, com margem de 8 px (16 px a partir de
  900 px de altura), e o YouTube se ajusta. Com o cabeçalho de 44 px, sobram uns 470 px de altura para a página.
- **A página do YouTube travou ou caiu** (`render-process-gone`): o quadro fecha com "O YouTube parou de responder.
  Tente de novo."
- **Você mudou de canal** com o quadro aberto (ou a subsala foi apagada): o quadro continua, a frase passa a dizer o
  canal novo, e o pedido vai para o canal em que você estiver na hora do clique (como o balão faz hoje).
- **Outra pessoa pôs música** no canal enquanto você procurava no modo **pôr**: a etiqueta muda para **Fila** e a
  frase avisa "Ana pôs uma música. O que você escolher vai para a fila." (servidor com fila); sem fila no servidor, a
  frase diz "Ana pôs uma música em Subsala_2", e o clique mostra o erro de hoje, "Já tem uma música…". O modo nunca
  muda sem a frase dizer.
- **Celular** (`mobile/`) e qualquer lugar sem a ponte nova: **Pôr música** abre o balão de colar link, como hoje.

### Qual peça do Electron
| Opção | A favor | Contra |
|---|---|---|
| **`WebContentsView`** (proposta) | Fica dentro da janela principal, num retângulo que a página reserva. Tem `webContents` e sessão próprios, criados e controlados só pelo processo principal: a página do app nunca recebe o conteúdo do YouTube nem escolhe o endereço. É a peça atual do Electron (a `BrowserView` está obsoleta desde o 30; o app usa o 33). Não muda o CSP. | O que a página desenhar por cima do retângulo fica escondido atrás dele. A posição tem de ir ao processo principal (IPC) quando a janela muda de tamanho. |
| `<webview>` | Fica no DOM: sem posição para sincronizar. | Exige `webviewTag: true` na janela principal, o que dá à página do app o poder de criar navegadores; o próprio Electron desaconselha. Afrouxa a janela principal (invariante 4). |
| Janela filha (`BrowserWindow` com `parent`) | A mais simples: sem posição para sincronizar. | Não é "dentro do app": é outra janela, com outra barra de título, que pode ir para trás e não segue o tema. Fica de plano B se a `WebContentsView` der problema no protótipo. |
| `<iframe>` do `www.youtube.com` | — | Não funciona: o YouTube manda `X-Frame-Options: SAMEORIGIN`. E pediria `frame-src https://www.youtube.com` no CSP. |

### Como detectar o clique num vídeo
O YouTube é uma página única: clicar num resultado troca o endereço com `history.pushState`, sem carregar outra página.
Por isso o `will-navigate` sozinho não basta (ele não dispara nessa troca). O processo principal escuta, no
`webContents` do escolhedor:

| Evento | Quando dispara |
|---|---|
| `did-start-navigation` (quadro principal) | No começo de qualquer navegação, inclusive dentro da mesma página. É o mais cedo: o vídeo ainda não começou. |
| `did-navigate-in-page` (quadro principal) | Troca de endereço sem carregar a página (o caso normal do clique no YouTube). |
| `did-navigate` | Navegação completa (endereço aberto direto, recarga). |
| `setWindowOpenHandler` | Link que abriria janela nova (clique do meio, `target=_blank`): se for vídeo, conta como escolha; a janela é sempre negada. |

Os quatro mandam o endereço para a mesma função, `videoDaUrl(url)`. Vale o primeiro que reconhecer um vídeo; o mesmo
vídeo de novo, nos 2 s seguintes, é ignorado. O protótipo (fase 0) confere quais disparam de fato no Electron 33 para
busca → vídeo, Short e item de mix.

Endereços aceitos (só `https:` e host exatamente igual):

| Endereço | Hosts | ID |
|---|---|---|
| `/watch?v=ID` (com ou sem `&list=`, `&t=`, `&pp=`…) | `www.youtube.com`, `youtube.com`, `m.youtube.com` | o parâmetro `v` |
| `/shorts/ID`, `/live/ID` | os mesmos | o pedaço do caminho |
| `/ID` | `youtu.be` | o caminho |

- O `list=` (playlist, mix) é ignorado: entra só o vídeo clicado.
- Shorts: o primeiro `/shorts/ID` conta como o clique. Como o app reconhece na hora (e, no modo fila, volta para a
  busca), rolar o feed de Shorts não enche a fila.
- Qualquer outro caminho (`/results`, `/@canal`, `/playlist`, `/feed/…`) é navegação comum.

### Extrair e validar o ID
Três camadas, cada uma sem confiar na anterior:
1. **Processo principal** (`main/youtube-escolher.js`, função pura `videoDaUrl`): `new URL`, protocolo `https:`, host
   na lista exata (nada de `endsWith`: `youtube.com.golpe.net` e `youtube.com@golpe.net` não passam), caminho num dos
   formatos acima e ID em `/^[\w-]{11}$/`. Para a página vai só o ID, nunca o endereço.
2. **Página** (`renderer/youtube-escolher.js`): confere o ID de novo, com a mesma expressão, antes de usar.
3. **Servidor da sala:** `cleanVideoId` em `musica-set`, `trocar` e nas ações novas da fila, como hoje.

O título vem da prévia (`youtubePrevia`, que o chat já usa) e vai junto da mensagem; o servidor passa por `cleanTitle`
(sem caracteres de controle, até 200).

### Fechar
- Ao reconhecer um vídeo, o processo principal para a página (`webContents.stop()`) e avisa a página do app
  (`{ tipo: 'video', videoId }`). A página decide o resto: fechar (**pôr**, **trocar**) ou voltar para a busca
  (**fila**: `navigationHistory.goBack()`; se não der, carrega de novo o último endereço `/results` visto).
- Fechar é tirar a view da janela (`contentView.removeChildView`) e destruir o `webContents` (`webContents.close()`):
  o processo da página do YouTube (300 a 500 MB) sai da memória. Nada fica aberto escondido.
- Fecha também quando a sala acaba, a janela principal fecha, a página do YouTube cai ou a página do app recarrega.

### Segurança
**Sessão separada.** `session.fromPartition('yt-escolher')`, sem `persist:`: fica só na memória e some ao fechar o app.
Os cookies e a busca do YouTube não se misturam com a sessão do app (`defaultSession`), nem com o `Referer` que o
`main.js` põe no embed, nem com o login Google da conta Razze (`main/google-login.js`, que usa o navegador do sistema).

**`webPreferences` da view:**
```js
{
  partition: 'yt-escolher',
  contextIsolation: true, nodeIntegration: false, sandbox: true, // sem preload: a página do YouTube não tem window.api
  webSecurity: true, allowRunningInsecureContent: false, webviewTag: false,
  navigateOnDragDrop: false, spellcheck: false, devTools: DEVTOOLS,
}
```
E `webContents.setAudioMuted(true)` desde o começo: as prévias ao passar o mouse e o vídeo que chegou a carregar não
fazem som.

**Bloqueios no `webContents` e na sessão:**
- Janelas novas: `setWindowOpenHandler` sempre devolve `deny` (depois de ver se era um vídeo).
- Navegação do quadro principal (`will-navigate`, `will-frame-navigate` do quadro principal, `will-redirect`): só
  `https:` para `www.youtube.com`, `youtube.com`, `m.youtube.com` e `consent.youtube.com` (aviso de cookies na Europa).
  O resto é cancelado, com aviso. Quadros internos (anúncios) carregam, mas não tiram a página do YouTube do lugar.
- Permissões: `setPermissionRequestHandler` e `setPermissionCheckHandler` negam tudo (microfone da busca por voz,
  câmera, notificações, localização, área de transferência).
- Downloads (`will-download`): cancelados. Autenticação HTTP (`login`): negada. Erro de certificado: recusado (o
  padrão).
- Teclado: `before-input-event` pega **Esc** (fecha), **Alt+←** (volta) e **F6** (devolve o foco ao cabeçalho do app,
  pelo evento `{ tipo: 'foco' }`). Ferramentas de desenvolvedor seguem o `DEVTOOLS` de hoje.
- **User-Agent:** o da sessão é o do Chrome sem `Electron/…` nem o nome do app (o `app.userAgentFallback` limpo), para
  o YouTube não mostrar "navegador não suportado".
- Nada de `executeJavaScript`, `insertCSS` ou script na página do YouTube: o app só lê endereços.

**CSP do `index.html`: não muda.** A view é outro `webContents`, fora do CSP da página. Não entra `frame-src
https://www.youtube.com`, nem `connect-src https:`, nem `unsafe-*`. O `frame-src https://www.youtube-nocookie.com`
continua só para o player. Título e capa seguem vindo pelo processo principal (`youtubePrevia`, capa em data URL).

**Login no Google: não.**

| | Com login | Sem login (proposta) |
|---|---|---|
| Funciona? | O Google costuma recusar login em navegador embutido ("Este navegador ou app pode não ser seguro"). | Busca, canais e playlists públicas funcionam. |
| O que ganha | Recomendações e playlists da pessoa no escolhedor. | — |
| O que não ganha | Tirar anúncios (Premium): o player da sala é o `youtube-nocookie`, na sessão do app, sem conta. | — |
| Risco | Os cookies da conta Google ficam guardados pelo app (o processo principal lê tudo da sessão): uma falha ou atualização ruim do app vira acesso à conta Google da pessoa. O histórico da conta passa a ter o que os amigos pediram. Confunde com o login Google da Razze. | O YouTube mostra "Faça login" de vez em quando. |

O "Fazer login" do YouTube leva a `accounts.google.com`, que está fora da lista: não abre, e o cabeçalho avisa.

### IPC novo (precisa de aprovação antes de implementar)
No padrão do `preload.js`: argumentos convertidos e limitados, e nenhum endereço vindo da página (o escolhedor sempre
abre em `https://www.youtube.com/?hl=pt-BR&gl=BR`).

| `window.api` | IPC | O que faz |
|---|---|---|
| `ytEscolherAbrir(rect)` | `yt-escolher-abrir` | Cria a view no retângulo `{ x, y, w, h }` (px do CSS). Já aberta: só move. Responde `{ ok }`. |
| `ytEscolherPosicao(rect \| null)` | `yt-escolher-posicao` | Move a view (a janela mudou de tamanho). `null` esconde, para um diálogo do app aparecer por cima. |
| `ytEscolherAcao(acao)` | `yt-escolher-acao` | Só `'voltar'`, `'recarregar'` e `'busca'` (volta à última busca). Outra coisa é ignorada. |
| `ytEscolherFocar()` | `yt-escolher-focar` | Põe o foco do teclado na página do YouTube (abrir, **F6** no cabeçalho). |
| `ytEscolherFechar()` | `yt-escolher-fechar` | Fecha e destrói. |
| `onYtEscolher(cb)` | evento `yt-escolher` | Do processo principal para a página: `{ tipo: 'video', videoId }`, `{ tipo: 'estado', carregando, podeVoltar }`, `{ tipo: 'aviso', motivo: 'fora' \| 'login' \| 'download' }`, `{ tipo: 'foco' }` (F6 na página), `{ tipo: 'fechou', motivo: 'esc' \| 'caiu' }`. |

O retângulo vem em px do CSS: o processo principal multiplica pelo zoom da página e limita ao tamanho da janela, como o
`captureRegion` já faz (mínimo 320 × 240). A página manda a posição por um `ResizeObserver` na área reservada
(`#ytEscolherArea`), no máximo uma vez por quadro.

## Parte 2: fila de músicas

### Comportamento esperado
- **Onde aparece:**
  - na tela da música (palco), nos controles de baixo, dois ícones (não texto: os botões de texto somem em tela
    estreita, `@container (max-width: 420px)`): **Próxima** (⏭) colado ao tocar/pausar, com a dica "Próxima: <título>
    (para todos)", e **Fila** (≡) com o número num selo. **Fila** abre o painel, preso ao botão, para cima (a faixa da
    barra da chamada fica embaixo);
  - no menu da pílula do canal (de quem está ouvindo): a linha "A seguir: <título>" e o item **Fila (3)**, que abre o
    mesmo painel. É o caminho quando a tela da música está pequena (`.tile.small` esconde os controles);
  - na dica da pílula do canal: "A seguir: <título> (+2)".
- **Painel da fila:** o título "Fila de Subsala_2"; "Tocando: <título> · posta por Ana", com as barrinhas paradas da
  pílula; a lista **A seguir**, numerada, cada item com a capa pequena (com a prévia de links ligada em Privacidade), o
  título e "posta por Bia" ("posta por você" na cor de destaque). Parado, o título usa a linha toda; com o mouse em cima
  ou o foco no item, aparecem **Tocar agora**, **Subir**, **Descer** e **Tirar** (ícones de 28 × 28; o **Tirar** fica
  neutro e só ganha o laranja com o mouse em cima). **Subir** fica desligado no primeiro e **Descer** no último. O
  puxador à esquerda arrasta. Embaixo: **+ Procurar no YouTube** e **Colar link**; o "27 de 30" só aparece perto do
  limite (a partir de 20).
- **Adicionar:** **+ Procurar no YouTube** abre o escolhedor no modo fila; **Colar link** abre o balão de hoje no modo
  fila. Com música tocando, o **Pôr uma** do mapa e o **Tocar na voz** do chat também põem na fila (veja as decisões em
  aberto).
- **Mudar a ordem:** arrastar pelo puxador, **Subir**/**Descer**, ou pelo teclado (foco no item, **Alt+↑**/**Alt+↓**).
  Enquanto você arrasta, o painel não redesenha com o que chega da sala; ao soltar, vale a ordem que a sala mandar.
- **Tirar:** sai na hora, e a linha dela vira "Tirou <título> · Desfazer" no próprio painel, por 5 s; **Desfazer**
  devolve ao mesmo lugar. (Fechar o painel confirma.)
- **Leitor de tela:** a lista é `role="list"`; cada item diz "1 de 3: Pais e Filhos, posta por Bia"; mover anuncia
  "Pais e Filhos agora é a 1ª" (`role="status"`).
- **Tocar agora:** a música sai da fila e toca no lugar da atual (a atual não volta para a fila).
- **Próxima:** toca a primeira da fila. Com a fila vazia, o botão fica desligado ("A fila está vazia").
- **Quem não pode mexer** vê a fila sem os botões, com "Só quem está em Subsala_2 mexe na fila". Quem pôs uma música na
  fila pode tirá-la mesmo fora do canal: nos itens dela aparece só o **Tirar**.
- **Quando uma música acaba:** a primeira da fila começa para todos que estão ouvindo, do começo, e sai da fila. Quem
  pôs a música nova vira o "posta por". A tela da música troca de vídeo sem fechar, e ninguém recebe aviso (a troca que
  vem da fila não é "Ana trocou uma música"). Com a fila vazia, a música sai da sala, como hoje, e o canal fica livre.
- **Música repetida:** pode. Ao pôr uma que já está na fila ou tocando, o aviso diz "Na fila: <título> (ela já era a
  2ª)". Cada item tem número próprio: tirar ou mover uma cópia não mexe na outra.
- **Fila vazia:** o painel diz "Nada na fila. Quando esta música acabar, o canal fica livre." e mostra **+ Procurar no
  YouTube**.
- **Fila cheia** (30 no canal, 10 suas no canal, ou 100 somando a sala): **+ Procurar** e **Colar link** ficam
  desligados, e o motivo aparece escrito no rodapé ("Fila cheia (30 de 30)" / "Você já pôs 10 nesta fila"), não só na
  dica (dica de botão desligado não aparece). O servidor recusa com `musica-erro`.
- **Vídeo da fila que não toca** (erro 101, 150 ou 153 no player): quem controla e está ouvindo pula sozinho depois de
  3 s, com o aviso "<título> não pode tocar fora do YouTube. Fui para a próxima."
- **Parar a música:** para a atual e limpa a fila. A confirmação diz "Parar a música de Subsala_2 e limpar a fila (3)
  para todo mundo?".
- **Trocar:** troca só a atual; a fila continua.

### Quem pode mexer
| Opção | A favor | Contra |
|---|---|---|
| Só o host | Um dono claro. | No modo Internet não há host com pessoa (a sala está na VPS). O host é quem criou a sala, não quem está no canal da música, e muda sozinho na troca de host. |
| Todos da sala | Simples. | Quem está noutra subsala mexeria na música de um canal em que não está. Foge da regra de hoje. |
| **Quem pode controlar a música** (proposta) | É a regra de hoje para tocar, pausar, trocar e parar (`canControlMusic`): quem está no canal, ou quem pôs a música atual. Todos já entendem. | Uma pessoa pode bagunçar a fila. Resolve com limite por pessoa e, no futuro, um "modo DJ". |

E mais uma: quem pôs um item pode tirá-lo, mesmo fora do canal.

### Protocolo (`sala-protocolo.js`)
**Estado.** A fila fica dentro da música do canal: `{ ch, videoId, title, by, playing, pos, at, dur, fila: [{ id,
videoId, title, by }] }`. Sem música no canal não há fila (pôr no canal livre continua sendo `musica-set`). A fila vai
na mensagem `musicas` de sempre, no `welcome` e no `seed`. Os apps antigos guardam o campo e não usam (`setMusicas` copia
a entrada inteira).

`id` é um número dado pelo servidor (`/^\d{1,9}$/`), crescente na sala: com ele, duas cópias da mesma música não se
confundem.

**Ações novas**, todas no `musica-ctl` (o servidor antigo cai no `else return` e ignora, e a conferência de quem
controla é a mesma de hoje):

| Ação | Campos | Quem pode | O que faz |
|---|---|---|---|
| `fila-por` | `videoId`, `title`, `pos` (opcional) | quem controla | Põe no fim (ou em `pos`, para o **Desfazer**). |
| `fila-mover` | `item`, `para` | quem controla | Leva o item para a posição `para`. |
| `fila-tirar` | `item` | quem controla ou quem pôs o item | Tira o item. |
| `pular` | `videoId`, `item` (opcional) | quem controla | Só vale se `videoId` é a música do canal agora: dois cliques ao mesmo tempo, ou o fim visto por dois PCs, avançam uma vez só. Sem `item`, toca a primeira da fila; com `item`, toca esse (**Tocar agora**). Fila vazia: tira a música. |
| `stop` | `tudo: true` | quem controla | Para e limpa a fila. O app novo sempre manda `tudo`. |

**Validação e limites** (no padrão de hoje):

| Campo | Regra |
|---|---|
| `ch` | `cleanChannel`, e o canal precisa ter música |
| `videoId` | `cleanVideoId`: exatamente 11 caracteres de `[A-Za-z0-9_-]` |
| `title` | `cleanTitle`: sem caracteres de controle, aparado, até 200 |
| `item` | `/^\d{1,9}$/` e existir na fila; senão, ignora |
| `pos`, `para` | `Math.floor(Number(x))`, limitado ao tamanho da fila; inválido vai para o fim (`fila-por`) ou é ignorado (`fila-mover`) |
| Tamanho | `FILA_MAX = 30` por canal, `FILA_POR_PESSOA = 10` por pessoa em cada canal, `FILA_SALA_MAX = 100` somando os canais (o `welcome` fica abaixo de uns 30 KB) |

A recusa por limite vai só para quem pediu, em `musica-erro` ("A fila de Subsala_2 está cheia (30)." / "Você já pôs 10
músicas na fila."). Mensagem inválida é ignorada sem resposta, como hoje.

**Fim e avanço.**
- O app novo, quando a música acaba no player (ou o palco vazio vê que acabou), manda `pular` com o `videoId` que
  acabou, nos tempos de hoje (1,5 s para quem pôs, 6 s para os outros que controlam). Com servidor sem fila, manda
  `stop`, como hoje.
- O servidor, em `limparMusicas`, passa a que acabou (`acabou`) para a próxima da fila em vez de tirar. Para não esperar
  até 20 s quando ninguém que controla está ouvindo, o intervalo cai de 15 s para 5 s (é só percorrer os canais).
- **App antigo na sala:** ele manda `stop` (sem `tudo`) quando a música acaba. O servidor novo trata `stop` sem `tudo`
  assim: duração conhecida, menos de 3 s para o fim e fila com música é fim (passa para a próxima); senão, para e
  limpa a fila (é o **Parar a música** de quem tem o app antigo).
- Pausada por 4 min, ou 1 min sem ninguém: saem a música e a fila, como hoje.
- Subsala apagada: saem a música e a fila (já é assim).
- Quem pôs itens e saiu da sala: os itens ficam ("posta por Ana", sem ela na sala).

**Troca de host.** `musicSeed()` passa a levar a `fila` de cada canal; `createMusicas(seed)` limpa cada item com as
mesmas regras, corta nos limites e renumera os `id` (o servidor novo começa a contar de novo). Um pedido em trânsito na
hora da queda se perde. Se o novo host está numa versão antiga, o `musicSeed()` dele não leva a fila e o `welcome` vem
sem `fila`: o app novo esconde a fila e avisa uma vez "A fila de músicas se perdeu: quem virou host está numa versão
antiga do Nebula."

**Compatibilidade.** Os dois servidores passam a anunciar `fila` em `features` (`signaling.js` e
`servidor-internet/server.js`); o app guarda em `state.filaOn` no `welcome` e no `rejoin`.

| Servidor da sala | App | O que acontece |
|---|---|---|
| Novo (`fila`) | Novo | Tudo. |
| Novo | Antigo | Vê e controla só a música atual. Quando ela acaba, a fila anda (pelo `stop` perto do fim). O **Parar** dele limpa a fila. Não vê nem põe na fila. |
| Antigo (host numa versão antiga) | Novo | Sem fila: os botões dela não aparecem. O escolhedor funciona (põe e troca). |
| VPS sem deploy (modo Internet) | Novo | Igual ao servidor antigo, até o deploy. |

O escolhedor (parte 1) não depende do servidor: chega a todos com a atualização assinada, sem `.exe` novo (o Electron
continua o 33, e o `boot.js` não muda).

## Interface

### Escolhedor
Um `.modal.global` com um `.dialog` sem padding; o cabeçalho é DOM do app (tokens do tema, segue os modos de vidro) e
o resto é a área reservada para a view.
```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ ←  [FILA] Clique num vídeo para pôr na fila de Subsala_2   Colar link   Pronto · 2   ✕ │  44 px, do app
├────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                        │
│                       página do YouTube (WebContentsView, muda)                        │
│                                                                                        │
└────────────────────────────────────────────────────────────────────────────────────────┘
  depois de uma escolha, por 4 s: ←  [FILA] ✓ Na fila: Evidências (3ª)   Colar link   Pronto · 3   ✕
```

### Controles da tela da música
```
 ▶ ⏭   1:23 / 4:10  ━━━━━━━●━━━━━━━━━━━━━━   ≡³   Trocar   Parar a música
                                             (em tela estreita: ▶ ⏭ ━━━●━━ ≡³)
```

### Painel da fila
```
┌ Fila de Subsala_2 ───────────────────────────────── ✕ ┐
│ ▁▃▂ Tocando: Evidências · posta por Ana               │
│ A SEGUIR                                              │
│ ⠿ 1 [capa] Pais e Filhos                ▶  ↑  ↓  ✕    │  ← mouse em cima ou foco
│            posta por Bia                              │
│ ⠿ 2 [capa] Tempo Perdido                              │
│            posta por você                             │
│   Tirou Índios · Desfazer                             │  ← 5 s, no lugar do item
├───────────────────────────────────────────────────────┤
│ + Procurar no YouTube    Colar link                   │
└───────────────────────────────────────────────────────┘
  quem não pode mexer: sem ⠿ e sem botões; rodapé "Só quem está em Subsala_2 mexe na fila."
  fila vazia: "Nada na fila. Quando esta música acabar, o canal fica livre."  + Procurar no YouTube
```

### Revisão de UI (skill `revisar-ui`)
Feita sobre a proposta, com o código atual da música (`renderer/musica.js`, `.music-controls`, `.music-pop`,
`.toasts`, `.modal`/`.dialog` em `styles.css`). O que já entrou nas seções acima:

| Problema | Mudança | Princípio |
|---|---|---|
| Um botão de texto "Fila 3" some com os outros de texto quando a tela da música fica estreita (`@container (max-width: 420px)` esconde `.btn.small`), e a tela pequena (`.tile.small`) esconde todos os controles. | **Próxima** e **Fila** como ícones de 30 × 30 (Fila com selo do número), colados ao tocar/pausar; na tela pequena, o caminho é o menu da pílula. | Lei de Fitts (alvo fixo perto do play); WCAG 2.5.8 (alvo de 24 × 24 ou mais). |
| Três modos (tocar, fila, trocar) no mesmo quadro, e o modo pode mudar sozinho (alguém pôs música no meio da busca). | Etiqueta do modo no cabeçalho; mudança de modo sempre com frase ("Ana pôs uma música. O que você escolher vai para a fila."). | Visibilidade do estado do sistema; sem surpresa. |
| Os avisos do app (`.toasts`, embaixo à esquerda, z-index 10) ficam atrás dos diálogos (z-index 20) e da página do YouTube; o "Desfazer" num aviso solto fica longe do item. | Avisos do escolhedor no cabeçalho dele (`role="status"`); o **Tirar** vira uma linha "Tirou… · Desfazer" no lugar do item. | Gestalt (proximidade); WCAG 4.1.3 (mensagens de status). |
| Quatro ícones por item num painel de ~380 px comem o título, e um ✕ laranja em cada linha vira ruído. | Ações só com o mouse em cima ou foco no item; ✕ neutro, laranja só no hover; **Subir**/**Descer** desligados nas pontas; **Alt+↑**/**Alt+↓** no teclado. | Lei de Hick; WCAG 2.5.7 (alternativa ao arrastar). |
| Com o foco dentro da página do YouTube, Tab não volta para o cabeçalho; em 820 × 560, um cabeçalho de duas linhas deixa pouca altura para a página. | **Esc** fecha e **F6** alterna cabeçalho e página; cabeçalho de uma linha (44 px), o aviso no lugar da frase por 4 s; margem de 8 px em janela baixa. | WCAG 2.1.2 (sem armadilha de teclado); densidade. |

Pequenas (menos de 10 linhas cada): o motivo de botão desligado escrito no rodapé, não só na dica; "posta por você"
em `--accent` (você); a linha "Tocando" com as barrinhas paradas da pílula (`song-eq`, sem animação); "27 de 30" só a
partir de 20; dica do ⏭ com o título da próxima.

A conferir no protótipo: a página do YouTube segue o claro/escuro do Windows (o app não mexe no `nativeTheme`), então
num tema escuro do app ela pode abrir clara. Dá para forçar o escuro só nela (`Emulation.setEmulatedMedia` pelo
`webContents.debugger`), mas é mais uma peça; a proposta é aceitar o do Windows.

Como testar a interface: só com o teclado (abrir pelo **Pôr música**, F6, Esc, Alt+↑/↓ na fila); a janela em 820 × 560
e maximizada; os três modos de vidro (Opaco, Transparente e Líquido) e os temas Padrão, Arasaka, E.V.A, Du'Sol, Di'Luna,
Renascença, Top Gun e Cloud; "reduzir movimento" do Windows; modo gamer; uma pessoa fora do canal (fila só de leitura);
fila vazia, cheia e com um vídeo que não toca.

## Riscos
- **Termos do YouTube.**
  - Os Termos de Serviço proíbem acessar o YouTube por meios automáticos (robôs, raspagem). O escolhedor é um navegador
    comum, usado pela pessoa; o app só lê o endereço para onde a página foi. Não lê o conteúdo da página, não injeta
    script e não bloqueia anúncios.
  - As [Políticas para desenvolvedores](https://developers.google.com/youtube/terms/developer-policies) da API valem
    para o player embutido que o app já usa. Não bloquear nem mexer nos anúncios (III.I.5) e no player (III.I.6): nada
    muda. Não tocar em segundo plano (III.I.9) nem separar o áudio do vídeo (III.I.7): a fila toca a próxima no mesmo
    player à vista (o pequeno, quando minimizado), como hoje. Não disparar visualizações sem consentimento (III.I.2): a
    próxima só toca para quem abriu **Ouvir**, e cada item foi escolhido por alguém da sala. Não raspar páginas
    (III.E.6): o escolhedor não raspa.
  - Atenção: o comando de voz "toca X" já lê a página de resultados (`buscarYoutube`), o que esbarra no III.E.6. Mudar
    isso fica fora desta spec.
  - Revisar os termos antes de lançar. Se o YouTube reclamar, desligar o escolhedor deixa o colar link funcionando.
- **Mudanças no site do YouTube.** A detecção depende só do formato dos endereços (`/watch?v=`, `/shorts/`,
  `youtu.be`), o mesmo dos links de compartilhar; não depende de HTML, CSS ou classes da página. O que pode quebrar:
  - o YouTube passar a recusar navegador embutido ou pedir login ("confirme que não é um robô"): o quadro mostra a
    página dele, e sempre há **Colar link**;
  - o endereço passar a mudar só depois de o vídeo carregar: continua funcionando, um pouco mais tarde (a página está
    muda);
  - formato novo de endereço de vídeo: uma linha em `videoDaUrl` e um teste;
  - mudança nos eventos de navegação numa versão nova do Electron: o e2e com a página falsa local pega.
- **Vídeo que não pode ser embutido.** Muitos clipes de gravadora não deixam tocar fora do YouTube (erro 101 ou 150) ou
  pedem idade. A prévia (oEmbed) na hora da escolha pega a maioria, o aviso do player pega o resto, e na fila o app pula
  sozinho. Não há jeito de tocar esses vídeos sem quebrar as regras, e o app não tenta.
- **Peso.** A página do YouTube custa de 300 a 500 MB e um pouco de CPU nas prévias. Só existe com o quadro aberto e é
  destruída ao fechar.
- **Privacidade.** A busca vai para o YouTube como em qualquer navegador, sem conta. Quem assiste à sua transmissão de
  tela inteira vê o que você procura (como veria no navegador). Capa e título da fila vêm pela prévia de links, que
  respeita **Configurações › Privacidade**.
- **Fila bagunçada por alguém.** Limite por pessoa; "modo DJ" fica nas decisões em aberto.

## Restrições
- Sem servidor novo: a fila mora no servidor da sala que já existe (PC do host ou VPS).
- CSP sem mudança. Janela principal com `contextIsolation` e `nodeIntegration` como estão, sem `webviewTag`.
- Sem animação contínua: o arrastar só tem transição curta ao soltar. O escolhedor só existe enquanto aberto.
- Modo gamer: tudo funciona.
- Windows e Linux (X11, AppImage): a `WebContentsView` funciona nos dois; conferir no AppImage.
- Textos em pt-BR, no tom do app. Cores só por `var(--…)`, sem vermelho (o **Tirar** usa o laranja de cuidado).

## Dependências
- `main/youtube-escolher.js` (novo, em `PACK_FILES`): `videoDaUrl`, `hostPermitido`, a sessão, criar, posicionar e
  fechar a view. `main.js`: os handlers `yt-escolher-*`; fechar junto com a janela. `preload.js`: as seis funções.
- `renderer/youtube-escolher.js` (novo, `<script>` depois de `renderer/musica.js` e antes de `renderer/inicio.js`, em
  `PACK_FILES`): o quadro, o cabeçalho, a área reservada e os modos.
- `renderer/musica.js`: Próxima, Fila, painel da fila, avanço sem aviso, `musicSeed` com fila, fim com `pular`, `stop`
  com `tudo`, pulo de vídeo que não toca. Se passar muito do tamanho, a fila vai para `renderer/musica-fila.js` (novo,
  mesmas regras de arquivo novo).
- `renderer/membros.js` (palco vazio): `pular` no fim. `renderer/chat.js`: **Tocar na voz** e `/musica` com fila.
  `renderer/subsalas.js` e `renderer/ceu-voz.js`: a dica da pílula e o **Pôr uma** do mapa.
- `renderer/sala.js`: `state.filaOn` no `welcome` e no `rejoin`, aviso de fila perdida. `renderer/estado.js`: `filaOn`.
- `index.html`: o quadro `#ytEscolher` com `#ytEscolherArea`, o painel `#musicFila`, os scripts novos. `styles.css` e
  os temas.
- `sala-protocolo.js`: a fila em `createMusicas`, as ações novas, `limparMusicas`, os limites. `signaling.js`: `fila`
  em `features` e intervalo de 5 s. `servidor-internet/server.js`: o mesmo, e **deploy na VPS**.
- Docs: `docs/guia.md` (Música junto), `docs/desenvolvimento.md` (arquivo novo e a view), `docs/roteiro-de-teste.md`.

## Fases
0. **Protótipo (1 ou 2 dias, fora do app):** um `main` mínimo no Electron 33 com a `WebContentsView` e as regras de
   segurança. Confere quais eventos disparam no clique (busca → vídeo, Short, item de mix, vídeo de canal), se o
   `goBack()` volta para a busca, se o YouTube aceita o User-Agent, o que acontece no "Fazer login" e quanta memória a
   página usa. Daqui sai a escolha final entre `WebContentsView` e janela filha.
1. **Escolher pelo YouTube:** o quadro, a segurança, o IPC, pôr e trocar. Sem mudar o protocolo; chega com a
   atualização assinada.
2. **Fila no servidor:** `sala-protocolo.js`, os dois servidores, seed, compatibilidade e testes. Deploy na VPS.
3. **Fila na interface:** Próxima, painel, arrastar, escolhedor no modo fila, chat, temas, guia e roteiro de teste.

### Como ficou a fase 1
- A fase 0 virou um teste com o YouTube de verdade, no próprio app: o clique num resultado chega como navegação dentro
  da página (`pushState`) e é pego; o Short também; o item de mix entra só como o vídeo (o `list=` fica de fora); o
  **Fazer login** é barrado com o aviso; a página não tem `window.api` nem `Electron` no User-Agent.
- Quem confere se o vídeo deixa incorporar é o processo principal (`checarVideo`, oEmbed: 401, 403 e 404 não entram),
  antes de mandar o id, e o título vem junto. O `main/youtube-previa.js` não mudou.
- O YouTube registra um service worker na sessão do escolhedor, que continuaria rodando depois de fechar: fechar limpa
  os service workers e o cache (`clearStorageData`). Os cookies ficam até fechar o app.
- Sem a ponte nova (celular), `escolherMusica` cai sozinha no balão de colar o link: o `mobile/ponte/stubs.js` não
  precisou mudar.
- **Pôr música** (pílula do canal e mapa) e **Trocar** abrem o escolhedor. O `/musica` e o **Tocar na voz** do chat e o
  comando de voz continuam como estavam.
- IPC: `ytEscolherAbrir`, `ytEscolherPosicao`, `ytEscolherAcao`, `ytEscolherFocar`, `ytEscolherFechar` e
  `onYtEscolher`, como na tabela.

### Como ficou a fila (fases 2 e 3)
- Protocolo como na tabela: `fila-por`, `fila-mover`, `fila-tirar`, `pular` e `stop` com `tudo`, no `musica-ctl`; os
  limites (`FILA_MAX`, `FILA_POR_PESSOA`, `FILA_SALA_MAX`) estão em `sala-protocolo.js`. O `id` do item é um número
  crescente da sala (`musicas.seq()`), renumerado no seed. O intervalo de `limparMusicas` caiu para 5 s nos dois servidores.
- Interface em `renderer/musica-fila.js` (o painel `#filaPop` e `porNaFila`). **Próxima** e **Fila** (com o número) entram
  nos controles da tela da música; o menu da pílula ganhou "A seguir" e **Fila**.
- As decisões em aberto ficaram com as propostas: 1, 2 (repetida pode), 4 (parar limpa a fila), 5 (chat põe na fila; o
  comando de voz continua trocando), 6, 9 e 10.
- Diferenças da proposta: o escolhedor no modo fila fica aberto e confirma a cada escolha, mas sem o botão **Pronto · N**
  (fecha com o X ou Esc); os itens não têm a capa pequena; link colado sem título pede o título à prévia
  (`youtubePrevia`, com a prévia de links ligada em Privacidade).
- Testes: `tests/musica.test.js` (fila, limites, pular, stop antigo e novo, seed, `features`) e `tests/sala-fuzz.test.js`
  (as ações novas com lixo). O e2e `tests/e2e/musica.js` (Windows) não ganhou a fila.

## Decisões em aberto
1. **Quem mexe na fila.** Proposta: quem pode controlar a música (no canal, ou quem pôs a atual), e quem pôs um item
   tira o seu. Alternativas: "modo DJ" (uma pessoa trava a fila), todos da sala.
2. **Música repetida.** Proposta: pode, com aviso. Alternativa: o servidor recusa `videoId` que já está na fila.
3. **Escolhedor no modo fila.** Proposta: fica aberto depois de cada escolha, com **Pronto**. Alternativa: fecha a
   cada escolha.
4. **Parar a música.** Proposta: para e limpa a fila, com o número na confirmação. Alternativa: deixar a fila esperando
   sem música tocando (precisa de "fila sem música" no protocolo).
5. **Chat com música tocando** (`/musica`, **Tocar na voz**). Proposta: põe na fila (hoje troca), e a prévia diz "Vai
   para a fila (3ª)". Trocar fica no **Trocar** da tela. O comando de voz "toca X" continua trocando.
6. **Pausada por 4 min apaga a fila.** Proposta: sim, como hoje. Alternativa: tempo maior quando há fila.
7. **Sessão do escolhedor.** Proposta: só na memória. Alternativa: `persist:yt-escolher` (lembra a busca entre aberturas
   do app, deixa mais rastro no PC).
8. **Prévia (oEmbed) antes de pôr.** Proposta: sim. Custa uma ida ao YouTube por escolha.
9. **Limites.** Proposta: 30 por canal, 10 por pessoa no canal, 100 na sala.
10. **Itens de quem saiu da sala.** Proposta: ficam.

## Critérios de aceitação
Escolhedor:
- [ ] **Pôr música** abre o YouTube dentro do app; procurar e clicar num vídeo põe a música no canal sem copiar e colar,
      e o quadro fecha.
- [ ] Funciona com resultado de busca, Short, vídeo de canal e item de mix (entra só o vídeo).
- [ ] Navegar pelo YouTube não escolhe nada. Links para fora, "Fazer login", janelas novas, downloads e permissões não
      abrem.
- [ ] A página do escolhedor não faz som.
- [ ] A página do YouTube não tem `window.api`, usa sessão separada, e o CSP do `index.html` não mudou.
- [ ] Esc, **Fechar** e sair da sala fecham, e o processo da página some.
- [ ] Vídeo que não deixa incorporar é avisado antes de pôr; sem rede para a prévia, põe e o player avisa.
- [ ] **Colar link** funciona no quadro e onde não há escolhedor (celular).
- [ ] No tamanho mínimo da janela, e redimensionando, o quadro acompanha.

Fila:
- [ ] Quem está no canal põe, move (arrastar, **Subir**/**Descer**, **Alt+↑**/**Alt+↓**), tira e toca agora; todos
      da sala veem a mesma fila.
- [ ] Quem está fora do canal vê sem os botões; quem pôs um item tira o seu.
- [ ] A música acaba e a próxima começa para todos que ouvem, sem aviso; fila vazia libera o canal.
- [ ] Dois pulos ao mesmo tempo (ou dois PCs vendo o fim) avançam uma vez só.
- [ ] O servidor recusa o que passa dos limites, com aviso, e ignora mensagem inválida.
- [ ] Na troca de host a fila continua, na mesma ordem. Novo host numa versão antiga: a fila some com aviso, sem erro.
- [ ] App antigo na sala: quando a música acaba, a fila anda; o **Parar** dele limpa a fila; nada quebra.
- [ ] Servidor antigo ou VPS sem deploy: sem botões de fila, e o escolhedor funciona.
- [ ] Vídeo da fila que não toca é pulado sozinho.
- [ ] Temas conferidos, sem animação contínua, modo gamer sem mudança.

## Testes
- Automáticos:
  - novo `tests/youtube-escolher.test.js`: `videoDaUrl` aceita `watch` (com `list` e `t`), `shorts`, `live`, `youtu.be`
    e `m.`; recusa `http:`, host parecido (`youtube.com.golpe.net`, `youtube.com@golpe.net`,
    `golpe.net/?u=youtube.com/watch?v=…`), ID com 10 ou 12 caracteres ou com símbolo, `/playlist`, `/@canal` e
    `/results`; `hostPermitido` só com a lista;
  - `tests/musica.test.js`: `fila-por` com os três limites; `fila-mover` e `fila-tirar` com permissão (quem pôs tira de
    fora do canal); `pular` com `videoId` velho ignorado; fim avança; fila vazia tira a música; `stop` com `tudo` limpa;
    `stop` antigo perto do fim avança e longe dele limpa; `limparMusicas` avança a que acabou; subsala apagada; seed com
    fila (limpa, corta, renumera);
  - `tests/sala-fuzz.test.js`: as ações novas com lixo; `tests/troca-de-host.test.js`: a fila no seed;
    `tests/signaling.test.js` e `tests/servidor-internet.test.js`: `fila` em `features`;
  - `tests/e2e/musica.js`: Ana põe uma música e mais duas na fila, Bia muda a ordem e tira uma, a música chega ao fim
    (`seek` perto do fim) e a próxima começa nas duas; Bia sai do canal e não mexe mais;
  - e2e novo `tests/e2e/youtube-escolher.cjs`: uma página falsa local que imita o YouTube (troca o endereço com
    `pushState` para `/watch?v=…` e `/shorts/…`, tem link para fora e `window.open`), com a base trocável só no modo de
    teste (como a `youtube-previa` aceita `{ youtube }`). Confere que escolhe, bloqueia, não tem `window.api` e fecha;
  - `npx electron tests/e2e/carga.cjs` (scripts novos no `index.html`).
- Manuais (Windows; e o AppImage no Linux): o YouTube de verdade (busca, Short, mix, "Fazer login", anúncio); uma
  chamada com 3 PCs e fila, o host saindo no meio da fila, e um PC numa versão antiga. Item novo no roteiro de teste.

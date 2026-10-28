# Sala pela internet sem o servidor da equipe (Nostr + TURN grátis)

Issue: — · Roadmap: P1 (entrar pela internet sem VPN), sucessor do protótipo Hyperswarm

Status: Proposta (28/10/2026; revisada: só serviços grátis e tela só por conexão direta). Mexe em `signaling.js` e no
IPC (`main.js`, `preload.js`): precisa de plano aprovado (`AGENTS.md`). Protocolo da sala (`sala-protocolo.js`) sem
mudança de mensagem.

## Objetivo
Hoje o modo Internet depende da VPS paga da equipe para achar a sala e trocar os "bilhetes" (`servidor-internet`, porta
8765) e para a ponte de mídia (coturn). Com esta mudança:
- a sala é achada por **relays Nostr públicos** e roda no PC do host, como na Radmin, sem abrir porta em PC nenhum;
- a ponte (TURN) fica numa **VPS grátis**, com uma trava que deixa passar voz mas não vídeo;
- **a tela só vai por conexão direta.**

Tudo isso usando só serviços grátis, e com um teto que impede qualquer cobrança, até em caso de abuso.

## O que fica de graça
| Peça | Com o quê | Limite e risco |
|---|---|---|
| Achar a sala | Relays Nostr públicos (sem conta) | Podem limitar ou cair: a sala usa 4 ou 5 ao mesmo tempo |
| STUN (cada PC descobre o próprio endereço) | `stun.l.google.com:19302` e `stun.cloudflare.com` | Grátis e sem limite |
| TURN (a ponte) | coturn na **Oracle Cloud Always Free** (VM ARM, 10 TB de saída por mês) | Teto do próprio coturn abaixo dos 10 TB (veja "TURN") |
| Emissor de acesso ao TURN | Node mínimo na mesma VM | Sem estado e sem dados pessoais |
| Endereço com https para o emissor | Subdomínio grátis (DuckDNS) + Let's Encrypt pelo Caddy | Renova sozinho |
| Atualização do app | Pela sala, como hoje | Sem custo |

Fica de fora: Cloudflare TURN. O plano grátis dá 1.000 GB por mês, mas o serviço não tem trava por sessão: um abuso
passaria da cota e viraria cobrança (US$ 0,05 por GB).

## Escopo
- Entra:
  - Modo "Internet sem servidor" (experimental) ao lado do modo Internet pela VPS.
  - Código de sala de 16 caracteres + senha, endereço da sala derivado dos dois.
  - Pedido de entrada e resposta por eventos Nostr efêmeros e cifrados.
  - Sala por um `RTCDataChannel` entre cada convidado e o host, com o `signaling.js` de sempre no PC do host.
  - **Tela só por conexão direta**, com aviso para quem não consegue assistir.
  - Teste de rede no cartão "Seu sinal".
  - Limite de arquivo do chat para quem está na ponte.
  - coturn na VPS grátis com travas, e o emissor de acesso (`servidor-turn/`).
  - Volta depois de queda, troca de host e troca de senha.
  - Lista de relays e endereço do emissor em Configurações › Rede.
- Fica de fora (outras specs):
  - Salas dos amigos e "entrar pelos amigos" sem a RazzeAPI (o passe de convite).
  - Login com Nostr na conta Razze.
  - App de Android.
  - Desligar a VPS paga (decidir depois da fase 3).
  - Link `telap2p://sala/…`.
  - Mudar o modo Internet pela VPS: lá a tela continua podendo usar o TURN, como hoje.

## Comportamento esperado
1. **Escolher o modo.** Configurações › Rede › Internet: "Como achar a sala": **Servidor da equipe** (padrão, como hoje)
   ou **Sem servidor (relays Nostr)**, com a marca "experimental".
2. **Criar a sala.** A pessoa escolhe a senha (mínimo 4 caracteres, como hoje). O app:
   - gera o código `XXXX-XXXX-XXXX-XXXX` (16 caracteres, 80 bits, sem letras que se confundem ditando);
   - abre o servidor da sala **só para o próprio PC**;
   - pede o acesso ao TURN e passa a escutar o endereço da sala nos relays;
   - mostra o código com **Copiar**. Quem entra precisa do código **e** da senha.
3. **Entrar.** Campo de código aceita os 6 caracteres (VPS, como hoje) ou os 16 (sem servidor). Com os 16: "Procurando a
   sala…", depois "Conectando ao host…", e a sala abre como sempre.
4. **Erros ao entrar:**
   - Código ou senha errados, ou o host já saiu: em até ~10 s, "Não achei a sala. Confira o código e a senha e se o host
     ainda está nela." (não há "Senha incorreta" separado: veja "Decisões").
   - Nenhum relay responde: "Não consegui falar com os relays. Confira a sua internet ou a lista em Configurações › Rede."
   - O host respondeu, mas a conexão não abriu (nem pelo TURN): "Achei a sala, mas não consegui conectar ao host."
   - Sala cheia: a mensagem de hoje ("A sala está cheia."), vinda do `signaling.js`.
   - Sem o emissor de TURN: entra só com STUN; o Mapa de conexões avisa que a ponte está desligada.
5. **Transmitir e assistir: a tela só vai direto.**
   - Quem transmite manda a tela normalmente para todo mundo que alcança direto.
   - **Quem não alcança direto** vê no palco: "A tela de Fulano não chega até você: a conexão direta entre vocês não
     fechou, e a tela não passa pela ponte. Voz e chat continuam." Tem o botão **Tentar de novo**, e o app para de tentar
     sozinho depois de 2 tentativas.
   - Quem transmite vê "não consegue assistir" ao lado dessa pessoa na lista.
   - A voz, o chat e o resto da sala continuam usando a ponte quando precisam.
6. **"Seu sinal" (teste de rede).** Ao entrar na sala, o cartão mostra uma de duas coisas:
   - "Conexão direta: deve funcionar com todos";
   - "Sua rede pode não deixar conexão direta com alguns amigos: eles podem não ver a sua tela".

   Ao clicar em **Transmitir** com a rede difícil, esse aviso aparece uma vez. Ele **não bloqueia** (veja "Decisões").
7. **Arquivos do chat:** quem está na ponte (a ligação com o host passa pelo TURN) não manda nem baixa arquivo acima de
   8 MB. O aviso diz: "Arquivo grande não passa pela ponte. Mande quando a conexão estiver direta." Imagens pequenas passam.
8. **Na sala:** todo o resto fica igual (voz, subsalas, música, Modo Líder, atualização pela sala). O Mapa de conexões já
   mostra "pelo servidor TURN" quando uma conexão de voz passa pela ponte (`renderer/mapa-conexoes.js`).
9. **Minha conexão caiu:** o app volta ao mesmo host pelos relays com o mesmo número, por até 30 s (`SALA_VOLTA_MS`).
10. **O host saiu ou caiu:** troca de host como na Radmin. O próximo da fila abre o servidor no PC dele e passa a escutar o
    mesmo endereço; os outros voltam pelos relays com o mesmo número. Quem assistia continua assistindo.
11. **O host trocou a senha:** quem está na sala continua. O endereço da sala muda junto: entrar com a senha antiga cai no
    "Não achei a sala".
12. **Versão antiga na sala:** um app antigo não entende o código de 16 caracteres (pede "o código de 6 letras"). O guia
    diz para atualizar. Não existe sala misturando a VPS e os relays.

## Como funciona

### Endereço da sala
- `semente = PBKDF2-SHA256(senha, sal = "nebula-sala-v1:" + código normalizado, 210.000 iterações)` pelo WebCrypto, que
  vira uma chave secp256k1 (com contador, se cair fora da curva). A chave pública `P` é o endereço da sala nos relays.
- Todo mundo que tem código + senha calcula a mesma chave. É ela que permite a troca de host: o sucessor escuta o mesmo `P`.
- Trocar a senha muda `P`. O host passa a escutar o novo e para de atender o antigo.

### Eventos nos relays (NIP-01)
- Kind **efêmero** próprio (faixa 20000–29999, que os relays repassam e não guardam), a escolher sem colidir com as NIPs.
  Tag `["expiration", agora + 60]` (NIP-40). Conteúdo cifrado com NIP-44 v2.
- **`entrar`** (convidado → `P`): assinado por uma chave descartável `Q`, nova a cada tentativa, com tag `["p", P]`.
  Conteúdo: `{ t: "entrar", v: 1, n: <nonce de 16 bytes>, sdp: <oferta completa> }`.
- **`resposta`** (host → `Q`): assinada por `P`, com tag `["p", Q]`. Conteúdo: `{ t: "resposta", v: 1, n, sdp }`, ou
  `{ t: "recusa", v: 1, n, motivo }`.
- **Dois eventos por entrada, sem trickle ICE:** cada lado espera reunir os candidatos (até 3 s) e manda o SDP completo.
  Menos eventos é menos chance de bater no limite dos relays.
- O convidado só aceita resposta assinada por `P` com o mesmo `n`.
- O host descarta:
  - evento com mais de 60 s ou `n` repetido (guarda os dos últimos 10 min);
  - conteúdo acima de 16 KB, kind ou tag errados;
  - o que passar de 10 pedidos por minuto (o resto fica na fila ou cai).

### Conexão com o host
- `RTCPeerConnection` com o STUN público + o TURN, e um `RTCDataChannel` "sala", ordenado e confiável.
- O host só manda a resposta (que tem os endereços dele) depois de abrir o pedido. Ou seja, **o IP do host só vai para
  quem tem código + senha**. A impressão digital DTLS vai dentro do SDP cifrado: os relays não conseguem se pôr no meio.
- Pelo canal passa exatamente o JSON que hoje passa pelo WebSocket (`hello`, `welcome`, `ping`, `signal`…).
  - Limite de 256 KB por mensagem, igual ao `maxPayload` do `signaling.js`.
  - Conferir que os pedaços de `update`, `file` e `foto` cabem no limite do `RTCDataChannel` do Chromium.
- No modo sem servidor, o `hello` vai com `addrs` vazio: os IPs da casa só servem para a troca de host da Radmin.

### Convidado
- `CanalSala` (`renderer/sala-nostr.js`): um objeto com a mesma cara do WebSocket que `connectRoom` usa (`send`,
  `close(código)`, `readyState`, `onopen`, `onmessage`, `onclose`), por cima do `RTCDataChannel`.
- `connectRoom` passa a receber o canal pronto em vez de abrir `new WebSocket(url)`. O resto de `renderer/sala.js` não
  muda (o ping de 5 s e o `SALA_CAIU` continuam valendo).
- O `RTCDataChannel` não tem motivo de fechamento. Por isso o `room-closed` e o `host-left`, que o `signaling.js` manda
  ao fechar, vão num último quadro de controle da ponte (`{ type: "_fechar", code, reason }`), e o `CanalSala` repassa
  esse quadro para o `onclose`. É coisa do transporte, fora do `sala-protocolo.js`.
- O `CanalSala` diz se a própria ligação com o host está passando pelo TURN (`getStats`, par com candidato `relay`).
  É isso que o limite de arquivo do chat usa.

### Host
- O servidor da sala é o `signaling.js` de sempre, aberto **só em `127.0.0.1`**: ninguém de fora, nem da Radmin nem da rede
  de casa, chega nele.
- A **ponte** (`renderer/sala-nostr.js`) liga cada canal que chega a uma conexão local nova com
  `ws://127.0.0.1:<porta>/ponte/<token>`. O `signaling.js` trata conexão em `/ponte/` como de fora:
  - confere o token, gerado a cada `startServer` e devolvido só ao renderer do host;
  - **não** dá a dispensa de senha que dá ao próprio PC (`isLocal`);
  - aceita até 5 senhas erradas por minuto e depois espera 30 s.
- O `start-server` ganha `provider: "nostr"`. Ele abre só em `127.0.0.1`, liga o caminho `/ponte/`, devolve `{ ok, ponte: token }`
  e não anuncia a sala na rede local.

### Troca de host
- `migrateRoom` no modo sem servidor: em vez de tentar os `addrs`, cada um manda `entrar` para `P` de novo (com `resume` e
  `client` no `hello`), por até ~15 s por sucessor da fila.
- `becomeHost()` abre o `signaling.js` em `127.0.0.1` com o mesmo seed de hoje (chat, subsalas, `nextId`, músicas, Modo
  Líder) e liga a ponte em `P`.
- Se o host antigo ainda responder por um instante, a conexão com ele cai e a pessoa tenta de novo (a lógica de
  `welcome.id !== myId` já cobre a mistura).

### Tela só por conexão direta
- **A necessidade de TURN é de cada par, não de cada pessoa.** Uma pessoa pode alcançar uns amigos direto e outros não.
  A tela já usa uma conexão por par, de quem transmite para quem assiste, então a trava é por par.
- **No app:** `iceSemPonte()` devolve o `RTC_CONFIG.iceServers` sem as URLs `turn:` e `turns:` (fica só o STUN).
  - No modo sem servidor, as conexões da tela usam essa lista: `renderer/transmitir.js:521` e `renderer/assistir.js:215`.
  - A voz (`voice.js`) e o canal da sala continuam com o TURN.
  - A conexão direta das mensagens privadas (`diretoIce`, `renderer/mensagens-direto.js`) também fica sem TURN. Os
    arquivos já só vão por ela, e o texto tem a RazzeAPI de reserva.
- **Falha:** sem candidato que funcione, a conexão da tela não fecha. Depois de 12 s sem conectar, ou com o
  `iceConnectionState` em `failed`, o app tenta mais uma vez (reinício de ICE, que já existe) e então mostra o aviso do
  item 5. Assim não fica tentando para sempre.
- **No servidor:** o `max-bps` do coturn (abaixo) não deixa vídeo passar nem de um app modificado.
  A trava do app é a experiência; a do coturn é a garantia.

### Teste de rede ("Seu sinal")
- Uma `RTCPeerConnection` só para o teste reúne candidatos com os dois STUN públicos. Se o mesmo candidato local aparece
  com **portas públicas diferentes** em cada STUN, o mapeamento depende do destino (NAT simétrico): a rede é "difícil".
- É só uma previsão, porque a outra ponta também conta. A regra de verdade é a do par, na hora de conectar.
- Função pura que classifica a lista de candidatos (testável sem rede), com a lista coletada pelo renderer.

### TURN (coturn na Oracle grátis)
- A `servidor-internet/vps/turnserver.conf` de hoje já tem a lista de endereços proibidos (`denied-peer-ip`: nada de rede
  interna) e os limites `user-quota=40` e `total-quota=400`. Muda o seguinte:
  - **`max-bps=40000`** (bytes por segundo por sessão, ~320 kbps em cada sentido; hoje é `6000000`). A voz cabe: Opus
    estéreo de até 192 kbps (`renderer/rtc.js`). Vídeo não.
  - **`bps-capacity=3000000`** (bytes por segundo somando todas as sessões, ~24 Mbps em cada sentido). No pior caso, dá
    ~7,8 TB de saída por mês, abaixo dos 10 TB grátis, **mesmo com abuso**.
- **Emissor** (`servidor-turn/`, Node mínimo na mesma VM): `GET /v1/turn` responde `{ iceServers, ttl }`.
  - Usa o usuário temporário que já existe (`turnCredentials` com `TURN_SECRET`, como em `servidor-internet/server.js`),
    com validade de 4 h.
  - Limite de 20 pedidos por hora por IP.
  - https pelo Caddy, com subdomínio DuckDNS e certificado do Let's Encrypt.
- **No app:** IPC novo `turn-acesso`, no processo principal, que chama o emissor:
  - endereço fixo no código (com `TELA_TURN_EMISSOR` para testes) ou o das Configurações;
  - só https, resposta até 8 KB;
  - `urls` só `stun:`, `turn:` ou `turns:`; `username` e `credential` são texto de até 512 caracteres.
  - Cada app pede o próprio acesso ao criar ou entrar na sala e renova antes de vencer, como o `welcome.iceServers` de hoje.
- **Conta da Oracle:** a conta grátis pode ter a VM parada se ela passar 7 dias "ociosa" (CPU, rede e memória abaixo de
  20%). Com a trava, o TURN fica quase sempre ocioso. Há duas saídas (veja "Decisões"):
  - **converter para Pay As You Go:** a regra de ociosidade não vale e, dentro do Always Free, não há cobrança. Pede
    cartão; o `bps-capacity` garante que a saída nunca passa dos 10 TB, e o orçamento fica com alerta em R$ 1;
  - **manter grátis** e aceitar que a VM pode parar: o app segue só com STUN e avisa no Mapa de conexões.

### A cota grátis basta
- **O uso normal fica muito abaixo.** Sem vídeo, o TURN só leva voz e o canal da sala. No pior caso, um par de voz pela
  ponte gasta 2 × 192 kbps ≈ 170 MB por hora. Os 10 TB dão ~57 mil horas de par por mês.
- **Abuso:** alguém pode pegar acessos no emissor e usar a ponte para outra coisa. A trava do app não impede isso, mas o
  `max-bps` e o `bps-capacity` do coturn impedem de passar da cota. Com banda cheia, a conta dá ~75 sessões ao mesmo
  tempo (3.000.000 ÷ 40.000). O pior que acontece é a ponte ficar lenta ou sem vaga para os amigos, nunca cobrança. O
  limite por IP do emissor dificulta ocupar as vagas.
- **O que ainda passa pela ponte:**
  - arquivos do chat até 8 MB;
  - a atualização do app pela sala, para quem está na ponte. Medido no protótipo: o pacote tem ~27 MB em base64, o que
    dá **~12 minutos** a 40 KB/s, ocupando o canal da sala dessa pessoa (o ping de 15 s pode estourar). Recomendação: quem
    está na ponte não baixa a atualização pela sala.

### Relays e biblioteca
- **Relays:** lista padrão escolhida no protótipo: `nos.lol`, `relay.primal.net`, `relay.snort.social`, `nostr.mom` e
  `offchain.pub` (`nostr.oxtr.dev` de reserva), editável em Configurações › Rede.
  - Ficam fora: `relay.damus.io`, que bane quem manda 10 eventos de uma vez (uma troca de host com a sala cheia faz
    isso), e `relay.nostr.net`, que perde eventos.
  - O app publica em todos e escuta em todos; vale a primeira resposta (sem repetir pelo `id` do evento).
  - Conectar nos relays leva de 0,6 a 1,8 s: o app conecta ao abrir a tela de entrar, não no clique.
  - Um relay próprio (strfry ou khatru na mesma VM grátis) pode entrar como reserva.
  - A CSP já permite (`connect-src ws: wss:`).
- **Biblioteca:** `nostr-tools` (MIT) em `vendor/nostr-tools/` como script clássico (`window.NostrTools`), com versão fixa.
  - O `lib/nostr.bundle.js` da versão 2.25.2 já traz `finalizeEvent`, `verifyEvent` e `nip44` (conferido no protótipo):
    não precisa de esbuild.
  - As chaves são só da sala e descartáveis, e ficam no renderer, como a senha da sala já fica.

## Segurança
- **Nenhuma porta aberta** em PC de ninguém: só conexões de saída para os relays e o TURN.
- **O que os relays veem:**
  - veem as chaves descartáveis, o endereço `P` (que não leva a ninguém), os horários e o IP de quem se conecta a eles
    (como a VPS vê hoje);
  - não veem senha, SDP, os IPs de dentro do SDP nem o chat.
- **Quem tem código + senha pode se passar pelo host.** Hoje, na Radmin, qualquer membro também pode virar host: é o mesmo
  nível de confiança. Para cortar alguém, troca-se a senha.
- **Chute de senha:** sem o código (80 bits), nem dá para começar. Com o código, cada palpite vira um pedido nos relays,
  esperando uma resposta que não vem. É online e lento.
- **Flood no endereço:** `P` aparece nas tags, então quem observa um relay pode encher a sala de pedidos. O host corta em
  10 por minuto, e abrir um pedido é barato (assinatura + NIP-44). Prova de trabalho (NIP-13) fica em "Decisões".
- **Relay malicioso:** pode atrasar ou descartar eventos, mas não consegue ler nem forjar. Por isso a sala usa vários relays.
- **TURN:** o `TURN_SECRET` nunca vai no app (só o endereço do emissor); os acessos são curtos. Sem rede interna
  (`denied-peer-ip`), e com a banda travada por sessão e no total.

## Restrições
- **Custo zero:** só serviços grátis, e nenhum limite pode virar cobrança. O teto do coturn fica abaixo da cota grátis.
- Sem porta aberta, e sem servidor da equipe com regra de negócio: o emissor é sem estado e sem dados pessoais.
- CSP sem mudança. Sem `unsafe-*`, sem CDN: a biblioteca vai embutida em `vendor/`.
- `sala-protocolo.js` e `servidor-internet/` sem mudança. O modo Internet pela VPS continua igual e é o padrão.
- `boot.js` e versão do Electron não mudam: tudo chega pela atualização assinada.
- Heartbeat da RazzeAPI: `salaAtual.modo` vai como `internet`. O servidor recusa modo desconhecido com 400
  (`razze-api/control.js`), e isso derrubaria a presença inteira.
- Windows e Linux. Sem animação nova.

## Dependências
- **Novos:**
  - `vendor/nostr-tools/` (bundle e LICENSE) e `renderer/sala-nostr.js`: entram no `index.html` (o bundle antes de
    `sala-nostr.js`, e os dois antes de `sala.js`) e em `PACK_FILES` (`build.files` já tem `vendor/**`).
  - `servidor-turn/` (fora do pacote): emissor, `turnserver.conf` com as travas, `Caddyfile` e README de instalação na
    Oracle.
  - Testes: `tests/sala-nostr.test.js`, `tests/helpers/relay-falso.js` e `tests/e2e/sala-nostr.js`.
- **Mudam:**
  - `renderer/sala.js`: `connectRoom` com canal; criar, entrar, `rejoin`, `migrateRoom` e `becomeHost` no modo sem
    servidor; `RTC_CONFIG` vindo do TURN.
  - `renderer/transmitir.js` e `renderer/assistir.js`: tela sem TURN, aviso, e parar de tentar depois de 2 vezes.
  - `renderer/mensagens-direto.js`: sem TURN no modo sem servidor.
  - `renderer/chat.js`: limite de 8 MB na ponte.
  - O cartão "Seu sinal": o teste de rede.
  - `renderer/conectividade.js`: escolha do modo, relays, emissor.
  - `renderer/chamada.js`: senha trocada recalcula `P`.
  - `signaling.js`: modo só local, `/ponte/<token>`, limite de senha na ponte.
  - `main.js` e `preload.js`: `start-server` com `provider: "nostr"` e o token; `turn-acesso`.
  - `index.html`.
- **Docs:** `docs/guia.md`, `docs/desenvolvimento.md` e `docs/roadmap.md`.
- **Serviços (todos grátis):** relays Nostr públicos, STUN público, VPS Oracle Always Free e DuckDNS.

## Fases
0. **Protótipo, para decidir se vai ou não vai** (fora do pacote, em `prototipos/`, como o do Hyperswarm), com relays de
   verdade e o coturn na Oracle com as travas. Medir:
   - quais relays aceitam o kind efêmero e o tamanho do SDP;
   - o tempo até entrar (meta: mediana abaixo de 3 s);
   - os limites de taxa;
   - voz pela ponte dentro do `max-bps`, sem perda audível;
   - vídeo forçado pela ponte que não passa;
   - 4G ↔ 4G;
   - o tamanho da atualização pela sala.

   **Em andamento** ([`prototipos/sala-nostr/`](../../prototipos/sala-nostr/README.md)).
   - **Medido em 28/10/2026, num PC:**
     - 6 de 9 relays servem;
     - entrada pelos relays com mediana de 680 ms, mais 0,6 a 1,8 s para conectar nos relays;
     - a biblioteca serve como script clássico;
     - o teste de mídia confere em conexão direta;
     - o tamanho da atualização.
   - **Falta (humano):** o coturn na Oracle, duas casas, 4G ↔ 4G e mídia só pela ponte.
1. **Sala sem servidor:** criar, entrar, sair, chat, voz, tela só direta com o aviso, TURN, "Seu sinal" e a opção
   experimental nas Configurações.
2. **Queda e troca:** volta depois de queda, troca de host, troca de senha.
3. **Fechamento:** guia, roteiro de teste, decidir se vira o padrão e o destino da VPS paga (`servidor-internet` + coturn).

## Decisões em aberto (para a equipe)
1. **Trava por par** (recomendado: a pessoa transmite para quem alcança direto, e só quem não alcança fica sem ver)
   **ou por pessoa** (Transmitir desligado para quem tem rede "difícil" no teste)? A trava por pessoa bloqueia gente que
   conseguiria transmitir para a maioria, e não garante nada a mais: a do par já impede vídeo na ponte.
2. **Conta da Oracle:** grátis (a VM pode ser parada por ociosidade) ou Pay As You Go com cartão e alerta de orçamento?
3. **Ponte e arquivos:** o limite de arquivo do chat (sugestão: 8 MB) e o que fazer com a atualização pela sala para
   quem está na ponte.
4. **Relays:** quais ficam na lista padrão, e se vale ter um relay próprio na mesma VM.
5. **Senha no endereço** (recomendado: quem tem só o código não acha a sala nem se passa pelo host, mas não há "Senha
   incorreta") **ou senha conferida só pelo host** (dá a mensagem, mas quem tem só o código consegue atender os pedidos)?
6. **Prova de trabalho (NIP-13)** nos pedidos de entrada: ligar já ou só se aparecer flood?
7. **Nome na interface:** "Sem servidor", "Pelos relays" ou outro.

## Critérios de aceitação
- [ ] Dois PCs em redes diferentes criam e entram numa sala sem a VPS paga, só com serviços grátis.
- [ ] No modo sem servidor, o `signaling.js` escuta só em `127.0.0.1` (conferido com `netstat`).
- [ ] Conexão em `/ponte/` sem o token certo é recusada; com o token, senha errada é recusada (sem a dispensa do PC local).
- [ ] Nenhum evento nos relays tem senha, SDP ou IP legível.
- [ ] Código ou senha errados: "Não achei a sala…" em até ~10 s. Nenhum relay respondendo: a mensagem própria.
- [ ] **Nenhuma conexão de tela usa TURN no modo sem servidor** (`getStats`: nenhum par `relay` em transmitir/assistir).
- [ ] **Com a ponte forçada** (`iceTransportPolicy: 'relay'`), a tela não conecta e mostra o aviso; a voz conecta.
- [ ] Quem transmite vê "não consegue assistir" ao lado de quem ficou sem a tela.
- [ ] No coturn, uma sessão não passa do `max-bps` e o total não passa do `bps-capacity` (conferido no log).
- [ ] Arquivo do chat acima de 8 MB não sai nem chega por uma ligação na ponte, e o aviso aparece.
- [ ] 4G ↔ 4G: a voz conecta pela ponte, e o Mapa de conexões mostra "pelo servidor TURN".
- [ ] O host sai: o próximo assume e quem assistia continua assistindo, como na Radmin.
- [ ] O host troca a senha: quem está fica, e a senha antiga não acha mais a sala.
- [ ] Um relay fora do ar não impede ninguém de entrar.
- [ ] Sem resposta do emissor de TURN: entra só com STUN e avisa.
- [ ] Tempo até entrar: mediana abaixo de 3 s nos relays públicos (protótipo e e2e).
- [ ] O modo Internet pela VPS continua igual (inclusive a tela pelo TURN), e a presença na RazzeAPI não quebra.

## Testes
- **Automáticos (`npm test`, sem internet):**
  - `tests/sala-nostr.test.js`:
    - derivação do endereço com vetor fixo (mesmo código + senha dá o mesmo `P`; senha diferente, outro `P`);
    - montagem e validação dos eventos: assinatura, kind, tag, expiração, `n` repetido, tamanho;
    - limite de pedidos por minuto;
    - o `CanalSala` com a mesma interface do WebSocket;
    - `iceSemPonte()` tira `turn:` e `turns:` e mantém o STUN;
    - o classificador do teste de rede (portas iguais = fácil; portas diferentes = difícil; sem candidato = sem resultado).
  - Relay falso local (`tests/helpers/relay-falso.js`, só REQ/EVENT/CLOSE do NIP-01), para os testes não dependerem da
    internet.
  - `tests/signaling.test.js`: modo só local, `/ponte/` com e sem token, senha errada pela ponte e o limite.
  - Teste do `turn-acesso`: só https, tamanho e formato da resposta.
  - Teste do emissor (`servidor-turn/`): credencial válida para o `TURN_SECRET` e limite por IP.
- **Carga:** `npx electron tests/e2e/carga.cjs` (os scripts novos carregam sem erro).
- **e2e no Windows (humano):** `tests/e2e/sala-nostr.js`, com dois apps e o relay falso: criar, entrar, chat, voz, tela,
  troca de host, senha trocada. Uma variante com coturn local e `iceTransportPolicy: 'relay'`, como em
  `tests/e2e/internet.js`: a voz conecta pela ponte e a tela não conecta e mostra o aviso.
- **Manuais:**
  - dois PCs em casas diferentes, e 4G ↔ 4G (a voz pela ponte, a tela com o aviso);
  - o log do coturn com as travas;
  - derrubar um relay;
  - o host fechar o app no meio de uma transmissão;
  - itens de sala e voz do `docs/roteiro-de-teste.md`.

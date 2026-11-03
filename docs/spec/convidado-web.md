# Convidado pelo navegador (falar e assistir, sem instalar)

Issue: #63 · Roadmap: D2 (item 6), v2 · Sucede [assistir-no-navegador.md](assistir-no-navegador.md) (v1, só assistir).
**No ar para teste (01/11/2026; atualizado em 03/11/2026)** em `https://2-25-253-140.sslip.io/ver` (HTTPS pelo Caddy da RazzeAPI). O microfone e a voz funcionam no iPhone; as várias telas estão no ar; a saída de som (alto-falante/auricular) e o som da tela foram refeitos em 03/11/2026 depois do teste no iPhone, e faltam testar de novo (abaixo).

## Objetivo
Um amigo sem o Nebula entra numa sala pelo celular (inclusive iPhone), **fala e ouve** os outros e vê a tela de quem transmite.
Entra como **convidado**: sem conta, só com código e senha da sala.

## Como funciona
1. Em `https://<servidor>/ver`, a pessoa digita código e senha, liga **Entrar na conversa (usa o microfone)**, escreve um nome
   e toca em **Entrar**. O toque libera o microfone (o iPhone só libera assim).
2. Ela aparece para todos como **"Nome (convidado)"**, na Voz geral. O rótulo é posto pelo servidor, não dá para tirá-lo.
3. A voz usa o mesmo protocolo do app (`side: 'voice'`, malha WebRTC): `voice-state`, sessão, `call`; quem tem o menor id oferece.
   Os apps atuais tratam o convidado como uma pessoa comum. **O app e o `sala-protocolo.js` não mudam.**
4. Se alguém transmite, a tela aparece (como na v1). Botão **Silenciar microfone** e **Sair** (fechar a aba também sai).
5. Com o interruptor desligado, a página continua o espectador mudo e invisível da v1.

## Regras no servidor (`servidor-internet/server.js`)
- `hello { role: 'convidado', room, password, name, client }`. Nunca cria sala, sem passe, sem `resume`. Só `name` e `client` valem
  (nada de `version`, `lider`, foto ou conta Razze). Nome: até 20 caracteres + ` (convidado)` (sem nome: `Visitante (convidado)`).
- Visível para todos (`member-joined` normal). **Recebe o mínimo:** `welcome` enxuto (id, sala, `iceServers` e, de cada pessoa, só nome, transmissão e voz: sem chat, subsalas, música, passe nem perfis) e, do que a sala espalha, só `member-joined` (enxuto), `member-left`, `voice-state` e `share-state`.
- Só manda `voice-state`, `leave` e `signal` com `side` `voice` ou `viewer` (`once` sempre `false`). Todo o resto é ignorado
  sem resposta: `share`, `chat`, `subsala-*`, `lider-*`, `musica-*`, `avatar`, `razze`, `name-font`, `passe`, `senha`, `amigos-membros`.
- Nunca vira host; não conta nas 50 pessoas; limite `MAX_CONVIDADOS` (5) por sala; a sala fecha se só sobrarem convidados e espectadores.
- Se cai sem avisar, sai na hora e quem transmite recebe o `unsubscribe` (sem link fantasma).

## Pendências do teste no iPhone (01/11/2026)
1. **Várias telas — feito (01/11/2026), só `ver.js`/`ver.html`/`ver.css`.** `S.vistas` guarda uma vista por transmissor (um `RTCPeerConnection`, um `<video>` e uma legenda com nome, estado e **Tela cheia**). A lista mostra **Assistir/Parar** para cada transmissão aberta; tocar numa tela pequena a põe em destaque (a mais nova pedida já nasce em destaque; se a destacada sai, a primeira que sobra assume). Uma única transmissão aberta entra sozinha, mas, se a pessoa parar à mão (ou a conexão falhar de vez), ela não volta sozinha. Verificado no Chrome com dois transmissores falsos (lista, duas telas tocando, troca de destaque, parar só uma e receber o `unsubscribe` certo, sair). O protocolo e o app não mudaram.
2. **Som no iPhone — refeito em 03/11/2026 depois do teste, falta validar de novo.** (a) **Saída:** no teste, a técnica `navigator.audioSession.type = 'play-and-record'` ("chamada") levou a voz para o alto-falante; as outras (vídeo escondido, AudioContext, `playback`) saíram do código. O botão agora é uma escolha de duas opções, **Trocar para o auricular / Trocar para o alto-falante**, só onde `navigator.audioSession` existe (Safari 16.4+); a entrada começa no alto-falante. (b) **Som da tela:** o app já manda a faixa de áudio da transmissão (`addWatcher` em `renderer/transmitir.js`), mas a v1 deixava o vídeo sempre mudo. Agora a página tenta tocar com som; se o iPhone recusar (só libera num toque), toca muda e mostra **Ligar o som da tela** (e **Desligar** depois). Quem silencia à mão não volta a ter som numa reconexão. (c) **Voz some ao abrir a tela:** no teste, quem estava na conversa não ouvia mais ninguém ao abrir a transmissão. Causa NÃO confirmada (sem iPhone aqui; hipótese: o iOS pausa o `<audio>` da voz quando outra mídia começa). Mitigação: a voz se retoma sozinha ao ser pausada e é reaplicada quando a tela começa a tocar; `.../ver#debug` mostra o estado real (sessão de áudio, cada voz pausada ou não, cada tela muda ou não) para achar a causa se voltar. Código: `voz.js` (`trocarSaida`, `tocar`, `diagnostico`) e `ver.js` (`iniciar`, `rotuloSom`, `debug`). Risco conhecido: com o alto-falante e o som da tela ligados, o som pode voltar pelo microfone para os outros. O `setSinkId` não serve: não existe no iOS antigo e, no 26.x, ignorava a troca para voz remota de uma trilha só.
3. Tela cheia no iPhone (v1): ao sair do player nativo o iOS pode pausar o vídeo e a página parecer travada. Feito sem poder reproduzir (01/11/2026): `ver.js` ouve `webkitendfullscreen` e retoma o `play()` (ou mostra "Toque para assistir"); falta confirmar no iPhone. A caixinha de diagnóstico `.../ver#debug` está feita (03/11/2026), já que não há Mac para depurar o Safari. O código da sala na URL (`.../ver#ABC234`) está feito (01/11/2026): preenche o código e foca a senha; a senha não vai no link.

## Limitações conhecidas
- O app ainda mostra "N não ouvem (app antigo)" na subsala Líder por causa do convidado: ele não ouve a Líder de fora dela.
- Se a conexão cai, o convidado entra de novo (sem `resume`); se o iPhone encerra o microfone (ligação, bloqueio de tela), a página sai e avisa.
- Defeito já existente, fora desta feature: a mesma `client` que volta sem `resume` sendo a última pessoa fecha a sala e a recria com o `hostId` antigo (a pessoa nova fica sem host).

## Fora desta versão
Chat de texto, transmitir a tela, entrar em subsalas, mensagens diretas, conta, link com passe. O convidado **não deve ser movido
para a subsala Líder** por outro membro: a página só adota o canal e os apps ficariam refazendo ofertas (limitação conhecida).

## Requisitos
- **HTTPS** (`wss://`): o navegador só libera o microfone em página segura. Sem ele, a página mostra o aviso e deixa só assistir.
  Na VPS atual, o Caddy do Docker da RazzeAPI recebe um bloco para `2-25-253-140.sslip.io` (ver `servidor-internet/README.md`).
- `TRUST_PROXY=1` no servidor, para o limite de tentativas por IP ver o IP real de cada pessoa atrás do Caddy. Só vale para conexões de rede privada (o Caddy); de fora, o X-Forwarded-For é ignorado, e a porta 8765 pode continuar aberta para os apps.
- TURN ligado (já está) para quem está em 4G ou atrás de NAT rígido.

## Critérios de aceitação
- [x] O convidado ouve e fala com o app (`voice.js` real) e entre convidados, nos dois sentidos de oferta (Chrome com microfone falso).
- [x] O app vê "Nome (convidado)" e o mudo; quando o convidado sai, some da lista de todos.
- [x] Passe da sala, senha e ações de sala não chegam nem valem para o convidado (testes do servidor).
- [x] No iPhone, em HTTPS, o microfone abre, a voz vai e volta e a tela aparece (teste do Andrick, 01/11/2026).
- [ ] Ver e trocar de tela: parar só uma, ver várias ao mesmo tempo e trocar para a de outra pessoa. **Pendente (ver abaixo).**
- [x] No iPhone, o som da voz sai pelo alto-falante com `play-and-record` (validado em 03/11/2026).
- [ ] No iPhone, ouvir a voz da conversa e o som da tela ao mesmo tempo. **Pendente (item 2 abaixo).**

## Testes
- Automáticos: `tests/servidor-internet.test.js` ("convidado" e "/ver").
- Verificação local (fora do repo, Chrome headless com microfone falso): 4 pessoas na voz, 2 apps reais (`voice.js` do repositório) e
  2 páginas convidadas; malha completa, mudo, saída, sem violação de CSP.

# Assistir pelo navegador (celular, só assistir)

Issue: #63 · Roadmap: D2 (item 6) · **v1 no código (31/10/2026)**, sem publicar. As decisões da v1 estão em "Decisões"; falta o HTTPS (item 4), o deploy na VPS e o teste no iPhone.

## Objetivo
Convidar alguém para ver uma transmissão sem pedir que instale o Nebula. A pessoa abre um endereço no celular, entra com o código e a senha da sala (ou por um link com passe) e assiste. Também é a porta de entrada do B0 (briefing para 50+ pessoas).

## Escopo
- Entra: página estática servida pela VPS (por HTTPS assim que o item 4 existir); entrada por código e senha; uma transmissão em WebRTC comum (H.264).
- Fica de fora (primeira versão): voz, chat, login e conta, transmitir pelo navegador, várias telas ao mesmo tempo,
  áudio da transmissão e o link com passe (o app precisaria de um botão "copiar link": exige `.exe` novo; fica para a v2).

## Comportamento esperado
1. Quem transmite passa ao amigo o endereço da página (`/ver` do servidor do modo Internet), o código e a senha da sala;
   ele abre a página no navegador do celular.
2. A página pede código e senha.
3. Entrando, aparece a transmissão em tela cheia, com um botão para sair. Sem transmissão, "Ninguém está transmitindo agora".
4. Senha errada, sala fechada e sem rede mostram mensagem clara em português e deixam tentar de novo.

## Restrições
- O HTTPS (item 4 do roadmap) protege a senha e é o que permite `wss://`; a v1 também abre por `http://` para teste, porque só receber vídeo (`RTCPeerConnection`) não exige contexto seguro (só câmera e microfone exigem). No iPhone isso ainda precisa ser conferido.
- A sinalização é a mesma do modo Internet (`servidor-internet/`, `sala-protocolo.js`): quem assiste entra como membro somente-leitura e não aparece como pessoa na voz.
- CSP sem CDN. Sem coleta de dados.
- O vídeo sai do PC de quem transmite (ou do TURN). Cada espectador no navegador conta como mais um no upload (veja `docs/desempenho.md`); com muitos, depende do P3 (espectadores repassando).

## Dependências
- Item 4 (HTTPS/Caddy na VPS) para o uso de verdade; `servidor-internet/server.js` (o papel "espectador" vive só nele; `sala-protocolo.js` não muda); `renderer/rtc.js` (H.264 primeiro) e `renderer/transmitir.js` (`addWatcher`), que já respondem a quem assiste.

## Decisões (v1)
- Quem assiste é **invisível**: não entra na lista da sala nem vira host. Quem transmite vê "Alguém está assistindo você".
- Limite de **5 espectadores por sala** (`MAX_ESPECTADORES`), separado das 50 pessoas, enquanto não existe o P3.
- Sem link com passe na v1. Quando vier, ele vale enquanto a sala existir e fechar a sala revoga (segue o passe de `docs/spec/salas-dos-amigos.md`).
- **Sem áudio** na primeira versão: o vídeo fica mudo na página.
- Só vê a transmissão aberta a toda a sala (`shareInfo.open !== false`); o servidor barra o pedido nas fechadas ao canal.
- Quem entra pelo navegador não volta com `resume`: se a conexão cair, entra de novo.
- O servidor muda só em `servidor-internet/server.js` (como o passe); `sala-protocolo.js`, `signaling.js` e o app não mudam.

## Critérios de aceitação
- [ ] Do celular, sem instalar nada, com código e senha, vejo a transmissão em até 10 s.
- [x] Senha errada e sala inexistente dão a **mesma** mensagem clara (de propósito: ninguém descobre códigos de sala).
- [x] Sair da página não derruba a transmissão nem aparece como erro para quem transmite (conferido no Chrome: o host recebe `unsubscribe`; se a aba fecha ou a rede cai sem avisar, o servidor manda o `unsubscribe` por ele, coberto em teste).

## Testes
- Automáticos (`tests/servidor-internet.test.js`, "espectador" e "/ver"): welcome enxuto, invisível, sem chat/voz, `signal` só `viewer` para quem transmite aberto (`once` forçado a `false`), limite de 5, não cria sala, sala fecha só com espectadores, página servida com CSP e só a lista fixa de arquivos.
- Verificação local: Chrome headless (CDP) com um host falso transmitindo um canvas: a página entra, o vídeo chega (320x180), sem violação de CSP e o host recebe `unsubscribe` ao sair.
- Manuais: celular Android e iPhone na rede de dados, com e sem TURN.

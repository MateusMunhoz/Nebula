# Convidado pelo navegador (falar e assistir, sem instalar)

Issue: #63 · Roadmap: D2 (item 6), v2 · Sucede [assistir-no-navegador.md](assistir-no-navegador.md) (v1, só assistir).
**No código (01/11/2026), sem publicar.** Falta o HTTPS na VPS (a voz exige) e o teste no iPhone.

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
- [ ] No iPhone, em HTTPS, o microfone abre, a voz vai e volta e a tela aparece. **Teste manual pendente.**

## Testes
- Automáticos: `tests/servidor-internet.test.js` ("convidado" e "/ver").
- Verificação local (fora do repo, Chrome headless com microfone falso): 4 pessoas na voz, 2 apps reais (`voice.js` do repositório) e
  2 páginas convidadas; malha completa, mudo, saída, sem violação de CSP.

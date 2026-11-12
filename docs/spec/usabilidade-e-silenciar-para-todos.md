# Usabilidade, barras e silenciar para a sala

Issue: <abrir> · Roadmap: usabilidade para quem chega · Base: `docs/auditoria-fluxo.md` (05/10/2026)

## Objetivo
Quem é novo acha o app confuso: adicionar amigo, entrar na sala de alguém (copiar e colar código e senha em vez de um
clique), muitos botões espalhados em barras diferentes, e no macOS a barra de título quebrada. Esta tarefa reorganiza
os fluxos e as barras para que o caminho comum (abrir → achar amigo → entrar na sala → voz → tela) seja óbvio e curto,
e acrescenta o **Silenciar para a sala** (como o "silenciar no servidor" do Discord, mas sem cargos).

## Como rodar esta tarefa
- Máquina: Windows, com as skills de design (`revisar-ui`, `frontend-design`) e o modelo de motion pelo OpenRouter.
- Ordem: Fase 0 → 1 → 2 → 3 → 4. Cada fase é **um PR** (branch por fase), com `npm test` e
  `npx electron tests/e2e/carga.cjs` passando. Fase com protocolo da sala (Fase 1): plano aprovado antes de codar.
- Antes de começar: ler `AGENTS.md`, `.claude/rules/renderer.md`, `.claude/rules/electron-main.md`, `docs/guia.md`
  (Sala, Voz, Amigos, Mensagens diretas) e `docs/auditoria-fluxo.md`.
- Para cada tela mexida: captura antes/depois (Windows 1200x780 e 820x560 mínimo; tema Padrão + 1 tema com moldura) no PR.

---

## Fase 0 — Barra de título no macOS (feito no Mac, falta PR)
Já corrigido localmente no Mac e testado à mão; precisa entrar no repositório.
- `main.js`: `trafficLightPosition: { x: 12, y: (TITLEBAR_HEIGHT - 14) / 2 }` (os três botões no meio da barra de 32 px).
- `renderer/util.js`: `document.documentElement.dataset.platform = window.api.platform`.
- `styles.css`: `html[data-platform=darwin] .titlebar { padding-left: 78px; }`.
- Conferir nos temas com moldura (Arasaka, E.V.A, Top Gun, Renascença…) se algum `.titlebar`/`.brand-mark` reposiciona
  a logo e volta a ficar embaixo dos botões. Nenhum tema pode usar `left: 0` absoluto na logo sem considerar `data-platform`.
- Aviso no PR: `main.js` vai na atualização, mas o Mac não tem build publicado (ver Fase 4).

Aceite: no macOS os botões fechar/minimizar/maximizar não cobrem a logo nem o nome em nenhum tema; Windows e Linux iguais a antes.

---

## Fase 1 — Silenciar para a sala (sem hierarquia)

### Comportamento
- No perfil de quem está na voz (cartão de volume, coluna do perfil, menu da pessoa na lista da voz e no mapa), nova ação
  **Silenciar para a sala** (ícone de microfone com cadeado/contorno; laranja = cuidado, nunca vermelho).
- Qualquer pessoa da sala pode usar, sem ser host. Efeito: o microfone de quem foi silenciado é desligado para todo
  mundo. A pessoa vê no Seu sinal e na barra da chamada **Silenciado por Fulano**, e o botão de microfone fica travado
  (com dica explicando). O fone dela continua normal.
- Desfazer: **qualquer outra pessoa** da sala (não a própria silenciada) pode clicar **Liberar microfone** no mesmo lugar.
  Quem silenciou também. Ninguém precisa ser host.
- No chat da sala entra uma linha de sistema: "Fulano silenciou Ciclano para a sala" / "Beltrano liberou o microfone de
  Ciclano". Transparência substitui a hierarquia.
- Proteções contra abuso:
  - limite por pessoa: no máximo 3 silenciamentos por minuto; depois disso o botão some por 60 s com dica;
  - quem está silenciado não silencia outros;
  - o host pode desligar o recurso no menu da sala (**Todos podem silenciar para a sala**, ligado por padrão); desligado,
    só o host silencia;
  - sair e voltar na sala **não** limpa o silêncio enquanto a sala existir (guardar por id de conta, ou nome na sala sem conta);
  - na troca de host o estado continua (vai junto com o estado da sala).
- Ícone na lista da voz, na grade do palco e nas janelas flutuantes: o mesmo microfone riscado de hoje, com um selinho de
  cadeado para diferenciar "se mutou" de "foi silenciado".
- Silenciar só para mim (o que já existe, `Silenciar para mim`) continua igual e separado; os dois botões lado a lado
  com textos claros.

### Técnica
- Mensagem nova no protocolo da sala (`sala-protocolo.js`): `{ type: 'mute-room', target, on }`. Validar e limitar como
  o resto (id existente na sala, booleano, limite de frequência no relay). O estado oficial mora no host
  (`signaling.js`) e no servidor da sala Internet (`servidor-internet/`, que usa o mesmo `sala-protocolo.js`): eles
  aplicam a regra, ignoram pedido inválido e mandam o estado para todos (incluindo quem entra depois, no `welcome`).
- O silenciado tem o microfone desligado localmente (track `enabled = false`) **e** os outros ignoram o áudio dele
  enquanto o estado disser silenciado (defesa contra cliente modificado: cada receptor zera o volume dessa pessoa).
- Versão antiga na sala: quem não entende a mensagem continua ouvindo a pessoa. Mostrar no menu da sala "X pessoas
  numa versão que não respeita o silenciar para a sala". Não quebrar a sala.
- Preferência do host (`Todos podem silenciar`) no estado da sala, não em `appPreferences`.
- Skill `sala-webrtc` antes de codar. Plano aprovado (é protocolo da sala).

### Aceite
- [ ] Qualquer pessoa silencia e libera outra; o silenciado não consegue se desmutar.
- [ ] Quem entra depois já vê o estado certo; troca de host mantém.
- [ ] Limite de frequência funciona no relay, não só na interface.
- [ ] Linha no chat para cada ação.
- [ ] Host desliga o recurso e só ele silencia.
- [ ] Testes: `tests/sala-protocolo*.test.js` (mensagem válida/ inválida/ limite), teste do estado no `signaling`, e
      `npm run test:rtc` com 3 pessoas.

---

## Fase 2 — Fluxos que afastam quem chega

Problemas relatados por gente nova (prioridade de cima para baixo):

### 2.1 Entrar na sala de alguém = um clique
Hoje: o host copia código + senha, manda por fora, o outro cola nos dois campos. Meta: ninguém digita senha no caminho comum.
- **Convite com o passe dentro:** o **Convidar** (barrinha, palco vazio, menu da sala) copia um link
  `telap2p://sala?d=…` + `https://…` com o passe de convite de uso limitado (ex.: 24 h, até 10 entradas), não a senha.
  Quem cola o link no **Entrar** (ou clica nele) entra direto. Senha só aparece para quem entra pelo código manual.
- **Entrar numa sala** aceita colar qualquer coisa: link, código, código+senha numa linha só (`ABCD-1234 senha`),
  endereço. O app descobre o que é e preenche sozinho.
- **Pedir para entrar:** sala com senha e sem passe → botão **Pedir para entrar**; quem está na sala vê um toast
  "Fulano quer entrar" com **Deixar entrar** (qualquer pessoa da sala, sem hierarquia, mesma lógica da Fase 1).
- **Amigo numa sala:** o **Entrar** já existe na lista de amigos no modo Internet; levar o mesmo botão para todos os
  lugares onde o amigo aparece (envelope Online, perfil, cartão de hover) e, quando não der para entrar, dizer o porquê
  em uma linha e oferecer **Pedir para entrar**.
- **Convite recebido:** além do cartão nas mensagens, toast com **Entrar** quando chega convite com o app aberto, e
  notificação do sistema com o app minimizado.

### 2.2 Adicionar amigo sem saber o `nome#1234`
Hoje: precisa do identificador completo, o botão fica escondido no envelope, conta Razze fica no fim do Perfil.
- Ponto único e visível: **Adicionar amigo** no Início (destaque quando a lista de amigos está vazia) e no envelope.
- Aceitar o nome só (sem `#`): mostrar até 5 resultados com foto e tag para escolher (com limite no servidor, sem
  listagem aberta: só nome exato, sem `#`). Verificar na RazzeAPI se dá sem expor a base; se não der, explicar na tela
  o formato com exemplo do próprio identificador.
- **Adicionar quem está na sala:** na sala, no perfil de qualquer pessoa com conta, **Adicionar amigo** em destaque
  (já existe, revisar visibilidade).
- Link de amigo e QR como opção principal, não secundária: "Mande este link" com botão grande de copiar.
- Pedido recebido: toast com **Aceitar** direto, sem abrir painel.

### 2.3 Conta e primeira entrada
- Sem conta, o app não diz por que criar. Primeira entrada: uma tela de 2 passos (nome + foto → "Entrar com Google /
  criar conta" com a frase do que a conta libera: amigos, entrar com um clique, mensagens). **Pular** sempre visível.
- Conta Razze sair do fim do Perfil para um lugar óbvio (cabeçalho do perfil / Início quando deslogado).

### 2.4 Vocabulário
- Termos técnicos fora da frente: "Radmin", "Razze", "porta", "servidor", "TURN", "passe". Na interface, falar
  **Pela internet** (padrão) e **Rede local / Radmin** (avançado, em Configurações). Revisar todos os textos com isso.
- Pílula **Rede Internet · servidor da equipe** no topo do Início: some para quem está no padrão; só aparece se a
  pessoa mudou algo ou se a conexão está com problema.
- Botões com verbo claro: "Criar sala", "Entrar", "Convidar amigos", "Transmitir minha tela", "Assistir".

### 2.5 Estados vazios e erros
- Cada lista vazia (amigos, salas dos amigos, conversas, palco) com uma ação: "Nenhum amigo ainda → Adicionar amigo".
- Erros de entrada na sala em uma linha com o que fazer: senha errada, sala cheia (12), sala fechou, versão antiga,
  sem internet / WARP ou VPN bloqueando UDP (detectar falha de ICE e sugerir desligar VPN — caso real no Mac com WARP).
- Queda da transmissão: hoje cai sem explicar; mostrar "Conexão com Fulano caiu, reconectando…" e tentar de novo.

---

## Fase 3 — Barras, botões e responsividade

### Inventário atual (conferir no código antes de mudar)
- Barra de título (logo + nome do tema; botões do sistema à direita no Windows, à esquerda no Mac).
- Barrinha da direita `#workspaceNav` (`--rail-w`): perfil · Pessoas · Chat · Voz · Transmissão · Início/Voltar ·
  Convidar · Chat por cima do jogo · Modo gamer · Apoiar · Feedback · engrenagem · Sair.
- Painel da sala com abas Voz/Chat/Pessoas + Lista/Mapa/Recolher.
- Cartão **Seu sinal** (voz, mic, fone, ajustes, transmitir, quem pode assistir, trocar, parar).
- Barra da chamada no pé das telas (mic, fone, transmitir, trocar, quem assiste, sair da voz), que esconde botões do Seu sinal.
- Barra de baixo (`.dock`, envelope/mensagens) e `DOCK_OVERFLOW`.
- Coluna do perfil (`#perfilFixo`, só ≥ 1160 px).
- No Início: pílulas **Apoiar** e **Rede** no topo direito.

### Problemas
- Mesma ação em 2–3 lugares (mic/fone/sair/transmitir no Seu sinal + barra da chamada; Convidar na barrinha + palco + menu).
- Barrinha da direita com 12+ ícones sem rótulo, misturando navegação (Chat, Voz), ação de sala (Convidar, Sair) e
  app (Apoiar, Feedback, gamer, engrenagem).
- Botões que somem e aparecem conforme o mouse (barra da chamada some em 2,5 s e mexe no Seu sinal) — a pessoa não acha.
- Em 820–1160 px o perfil vira sobreposição e o palco aperta; em 820 px a barrinha + painel deixam pouco palco.

### Proposta (validar com captura antes de codar)
- **Uma barra de controle da chamada fixa** no pé do palco (estilo Discord/Meet), sempre visível na voz: mic · fone ·
  transmitir (com trocar/quem assiste num menu) · sair. O Seu sinal vira só status (foto, canal, qualidade) +
  **Entrar na voz** quando fora. Fim da duplicação e do "some com o mouse" (manter só opção de ocultar no modo tela cheia).
- **Barrinha da direita só navegação**: perfil · Início · Pessoas · Chat · Voz · (linha) · engrenagem. Rótulo em dica
  e, com espaço, rótulo curto embaixo do ícone. Apoiar, Feedback, Modo gamer, Chat por cima do jogo → menu da
  engrenagem/perfil. Convidar → botão com texto no cabeçalho da sala. Sair → cabeçalho da sala (e na barra da chamada).
- **Cabeçalho da sala**: nome · pessoas (rostos) · **Convidar** (primário) · menu ⋯ (conexão, senha, desempenho,
  silenciar para a sala ligado/desligado, sair/encerrar).
- **Breakpoints** com regras claras (testar em 820, 1024, 1160, 1440, 1920):
  - < 1024: painel da sala vira gaveta sobre o palco; barrinha só ícones; barra da chamada compacta.
  - 1024–1160: painel fixo, perfil em sobreposição.
  - ≥ 1160: painel + coluna do perfil.
  - Alvos de clique ≥ 32 px; nada de texto cortado (ellipsis com dica); escalonar com zoom 125%/150% do Windows.
- **Teclado**: atalhos visíveis nas dicas (mic, fone, transmitir, sair); foco visível em tudo.

### Motion (com o modelo de motion)
- Regra do projeto vale: **sem animação contínua** (o app roda junto com jogo); só transições curtas (≤ 200 ms,
  `transform`/`opacity`) em resposta a ação. Desligar tudo com `gamerOn()` e `prefers-reduced-motion`.
- Onde caprichar: abrir/fechar gaveta e painéis, entrar na voz (foto entra no palco), começar transmissão (selo Ao vivo),
  toast de convite/pedido, troca de abas. Exceção nova de animação contínua exige pedir antes (ver `renderer.md`).
- Cores só por `var(--…)`; semântica: amarelo = você/ao vivo, verde = falando, laranja = cuidado, **sem vermelho**
  (o Sair hoje está vermelho na barrinha: alinhar com a regra ou registrar exceção).

---

## Fase 4 — macOS de primeira
- `publicar.js` não gera nada para Mac e a release só tem `.exe`/AppImage: decidir publicar `Tela-P2P-mac-arm64.dmg`
  (e x64) na release.
- Assinatura: hoje é ad-hoc → a permissão de Gravação de Tela se perde a cada build novo (`tccutil reset ScreenCapture
  com.telap2p.app` resolve, mas é ruim para o usuário). Solução: Apple Developer ID + notarização no electron-builder
  (`mac.identity`, `notarize`, entitlements de câmera/microfone/tela). Depende de conta Apple (decisão do dono).
- Textos que dizem "Windows" ou ".exe" (ex.: `renderer/atualizacao.js:252`, microfone negado) passarem a considerar `darwin`.
- Recursos só Windows (áudio por app, `videocap`, Radmin) escondidos no Mac com explicação, como já é no Linux.
- Atualização: o pacote assinado exige o mesmo Electron do app; o Mac precisa de `.dmg` novo quando o Electron mudar.

---

## Restrições (todas as fases)
- `AGENTS.md`: arquivo novo em `PACK_FILES` + `build.files`; ordem dos `<script>`; só `inicio.js` roda na carga;
  CSP sem `unsafe-*` novo nem `style=""`; segurança do Electron intacta.
- Compatível com quem está em versão antiga na mesma sala.
- Windows, Linux e macOS. Textos em pt-BR, curtos.
- Nada de `npm run publicar`, `git push`, tag ou release por agente.
- Atualizar `docs/guia.md` a cada comportamento visível mudado.

## Critérios de aceitação gerais
- [ ] Pessoa nova, com conta, entra na sala de um amigo em ≤ 2 cliques a partir do Início, sem digitar nada.
- [ ] Convidar alguém sem conta: 1 clique para copiar o link; quem recebe entra sem digitar senha.
- [ ] Adicionar amigo achável em ≤ 1 clique do Início, com explicação do formato.
- [ ] Nenhuma ação de chamada repetida em dois lugares visíveis ao mesmo tempo.
- [ ] Sem sobreposição ou texto cortado em 820x560, 1200x780 e 1920x1080, Windows 100/125/150% e macOS.
- [ ] Silenciar para a sala funcionando com as proteções da Fase 1.
- [ ] `npm test`, `carga.cjs`, `test:settings`, `test:rtc` passando; `test:e2e` rodado por humano no Windows.

## Testes manuais (roteiro)
1. Instalar limpo, criar conta, adicionar um amigo pelo link, entrar na sala dele pelo **Entrar**.
2. Sem conta: receber link de sala e entrar.
3. Sala com 3 pessoas: silenciar, tentar desmutar, liberar por terceiro, limite de frequência, host desliga o recurso, troca de host.
4. Redimensionar a janela de 820 a 1920 em cada tela (Início, sala com tela, sala só voz, configurações).
5. macOS: barra de título em todos os temas, gravação de tela, voz.
6. Com VPN/WARP ligada: mensagem de erro de conexão útil.

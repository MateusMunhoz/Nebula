'use strict';
// Gerado pelo publicar.js a cada versão: as mensagens dos commits (sem merge e sem CI), mais nova em cima.
// Não edite à mão; para mudar o texto, mude a mensagem do commit. Mostrado por renderNews (renderer/atualizacao.js).
const NOVIDADES = [
  {
    "version": "1.20.16",
    "date": "2026-11-10",
    "items": [
      "feat(chamada): qualquer pessoa da ligação convida, e ela continua oculta",
      "fix(conta): sessão só cai quando o servidor recusa; pedidos de amizade na hora",
      "fix(razze-api): até 5 sessões por conta e renovação com o uso"
    ]
  },
  {
    "version": "1.20.15",
    "date": "2026-11-08",
    "items": [
      "Música na janela flutuante: player novo ao ir e voltar (não fica preto)",
      "Música do YouTube na janela flutuante e foto de perfil em GIF"
    ]
  },
  {
    "version": "1.20.14",
    "date": "2026-11-07",
    "items": [
      "test(mobile): ponte do iPhone com o escolhedor do YouTube e versão 1.20.12",
      "fix(abertura): deixar o fundo inert com o card de atualização à vista"
    ]
  },
  {
    "version": "1.20.13",
    "date": "2026-11-07",
    "items": [
      "build(nativos): versionar bin/foco.exe",
      "build(nativos): foco.exe em C# compilado pelo csc do Windows",
      "feat(atividade): generalizar Codando para o que estou fazendo no PC",
      "feat(atividade): mostrar \"Codando no <editor>\" no perfil",
      "feat(atualizacao): card da abertura com etapa e barra de progresso"
    ]
  },
  {
    "version": "1.20.12",
    "date": "2026-11-07",
    "items": [
      "feat(abertura): logo animada enquanto o app carrega",
      "feat(ver): lista de saída de som, botão de mudo e entrada mais fácil",
      "fix(ver): som da tela, escolha alto-falante/auricular e voz que retoma"
    ]
  },
  {
    "version": "1.20.11",
    "date": "2026-11-03",
    "items": [
      "Música: fila por canal; Próxima, painel da fila, pôr na fila pelo YouTube, chat e colar link"
    ]
  },
  {
    "version": "1.20.10",
    "date": "2026-11-02",
    "items": [
      "commit",
      "Teste de configurações: servidor sem configuração aparece em cinza no mapa",
      "feat(ver): botão de saída de som e retomada da tela cheia no iPhone",
      "feat(ver): link de convite com o código da sala (/ver#ABC234)",
      "feat(ver): várias telas ao mesmo tempo na página do navegador",
      "docs: resultado do teste no iPhone e pendências do convidado web",
      "docs: convidado pelo navegador (spec, README do servidor, guia, roadmap)",
      "feat(servidor): convidado pelo navegador com voz (role 'convidado' e voz.js)",
      "docs: assistir pelo navegador (spec v1, README do servidor, roadmap)",
      "feat(servidor): assistir pelo navegador do celular (espectador e página /ver)",
      "Sala pelo Nostr: spec e protótipo da fase 0"
    ]
  },
  {
    "version": "1.20.9",
    "date": "2026-10-27",
    "items": [
      "Barra da chamada: faixa embaixo das telas só com a música da sala no palco"
    ]
  },
  {
    "version": "1.20.8",
    "date": "2026-10-27",
    "items": [
      "Palco e voz: cartões só de quem faz algo, em seções por atividade; prévia de quem transmite na voz; arrastar entre canais compacto e com rolagem",
      "Atualização obrigatória: no máximo uma versão atrás; abaixo disso, tela no Início sem Depois",
      "Atualização: instala sozinho ao abrir e com o app parado; nunca na sala, transmitindo ou jogando",
      "Atividade: vídeo no Media Player não aparece mais no perfil",
      "iOS: versão 1.20.7, a mesma do desktop",
      "iOS: barra de título abaixo do relógio e guia para compilar no Mac",
      "Desktop: palco com música e cartões, convite com QR, minimizar, duração da música",
      "iOS: app Nebula para iPhone via sideload (Capacitor), ponte window.api, CSS do iPhone e CI do .ipa"
    ]
  },
  {
    "version": "1.20.7",
    "date": "2026-10-20",
    "items": [
      "fix(janela): ícone do tema volta a aparecer na barra de tarefas",
      "feat(tema): Renascença sem moldura, com folhas douradas e a obra assinada",
      "README: apresentação do app com imagens das telas"
    ]
  }
];

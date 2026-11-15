'use strict';
// Gerado pelo publicar.js a cada versão: as mensagens dos commits (sem merge e sem CI), mais nova em cima.
// Não edite à mão; para mudar o texto, mude a mensagem do commit. Mostrado por renderNews (renderer/atualizacao.js).
const NOVIDADES = [
  {
    "version": "1.20.20",
    "date": "2026-11-14",
    "items": [
      "feat(transmitir): webcam como fonte e câmera no canto da tela",
      "fix(voz): liberar microfone ou áudio por outra pessoa volta a ligar",
      "test(ios): teste do WebKit espera as 162 chaves da ponte (ytEscolher*)",
      "chore(ios): MARKETING_VERSION na versão do desktop (1.20.19)",
      "ci(linux): AppImage gerado no GitHub Actions a cada Release"
    ]
  },
  {
    "version": "1.20.19",
    "date": "2026-11-14",
    "items": [
      "fix(ui): miniatura nas linhas da voz, foco da lista e tela de mensagens fecha ao entrar na sala",
      "chore(dev): npm run demo, sala e amigos falsos para testar a interface sozinho",
      "feat(ui): miniatura do perfil, mensagens em tela inteira e ícones do silenciar"
    ]
  },
  {
    "version": "1.20.18",
    "date": "2026-11-13",
    "items": [
      "feat(sala): silenciar e ensurdecer para a sala",
      "chore(ios): MARKETING_VERSION na versão do desktop (1.20.17)",
      "test(carga): coluna do perfil cabe na tela de 1024 do runner Windows",
      "ci(mac): trocar runner macos-14 aposentado por macos-15",
      "fix(mac): botões da janela não cobrem a logo; spec de usabilidade e silenciar para a sala"
    ]
  },
  {
    "version": "1.20.17",
    "date": "2026-11-10",
    "items": [
      "Atalho de mutar aceita uma tecla sozinha",
      "Música: reenvio do \"ouvindo\" de todos os canais e subsala recriada sem herdar o \"sozinha desde\"",
      "Coluna do perfil fixa e modo dev sem loop de atualização"
    ]
  },
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
  }
];

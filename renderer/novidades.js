'use strict';
// Gerado pelo publicar.js a cada versão: as mensagens dos commits (sem merge e sem CI), mais nova em cima.
// Não edite à mão; para mudar o texto, mude a mensagem do commit. Mostrado por renderNews (renderer/atualizacao.js).
const NOVIDADES = [
  {
    "version": "1.20.24",
    "date": "2026-11-21",
    "items": [
      "Teste da migração do endereço: WireGuard falso, como os outros testes do serviço"
    ]
  },
  {
    "version": "1.20.23",
    "date": "2026-11-21",
    "items": [
      "Janela flutuante: barra só embaixo e sem sair da tela",
      "feat(sala): senha opcional também no modo Internet",
      "fix(voz): microfone desconectado não tira mais da chamada",
      "Docs: servidores no Google Cloud e checklist de saída da Hostinger",
      "Servidor das salas: TURN da Cloudflare, com o coturn de reserva",
      "Migra os servidores padrão da Hostinger para a VM do Google"
    ]
  },
  {
    "version": "1.20.22",
    "date": "2026-11-15",
    "items": [
      "feat(camera): miniatura Você, escolha da câmera e tela junto da câmera",
      "feat(camera): prévia na aba Câmera, botão na barra da chamada e quem transmite já se vê",
      "fix(voz): sair durante a abertura do microfone fecha o microfone de verdade",
      "fix(ui): volume da transmissão não some ao sair 1 px do quadro"
    ]
  },
  {
    "version": "1.20.21",
    "date": "2026-11-14",
    "items": [
      "fix(ui): volume da transmissão sempre à vista e fonte mínima de 12 px",
      "feat(config): Configurações em sete grupos"
    ]
  },
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
  }
];

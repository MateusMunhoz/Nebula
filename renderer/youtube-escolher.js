'use strict';
// Escolher a música no próprio YouTube, sem copiar e colar (spec: docs/spec/musica-youtube-e-fila.md). Pôr música e
// Trocar abrem um quadro grande: o cabeçalho é daqui; embaixo, a página do YouTube de verdade, numa view do processo
// principal (main/youtube-escolher.js) posta em cima da área #ytEscolherArea. Clicou num vídeo, de lá vem só o id, e a
// música entra como se o link tivesse sido colado. Sem a ponte (celular), fica o balão de colar o link (musica.js).
// O que a página desenhar por cima da área fica atrás do YouTube: os avisos do quadro vão na frase do cabeçalho.
// Script clássico: divide o escopo global com os outros (ordem no index.html). Usa de: util, estado, subsalas, musica.

let ytEsc = null; // { ch, modo: 'por' | 'trocar', anchor }: o quadro aberto
let ytEscAviso = null;  // timer que devolve a frase depois de um aviso
let ytEscQuadro = 0;    // requestAnimationFrame da posição
const ytEscObserver = typeof ResizeObserver === 'function' ? new ResizeObserver(() => ytEscPosicionar()) : null;

const ytEscRect = () => { const r = $('ytEscolherArea').getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; };
function ytEscPosicionar() {
  if (!ytEsc || ytEscQuadro) return;
  ytEscQuadro = requestAnimationFrame(() => {
    ytEscQuadro = 0;
    if (ytEsc && !ytEsc.erro) window.api.ytEscolherPosicao(ytEscRect());
  });
}
function ytEscFrase() {
  if (!ytEsc) return '';
  if (ytEsc.modo === 'trocar') return `Clique num vídeo para trocar a música de ${channelName(ytEsc.ch)}`;
  // Alguém pôs música no seu canal enquanto você procurava: a frase diz antes do clique
  const ch = myVoiceChannel(), e = state.musicas.get(ch);
  if (e && e.by !== state.myId) return `${nameOf(e.by)} pôs uma música em ${channelName(ch)}. Para mudar, use Trocar na tela da música.`;
  return `Clique num vídeo para tocar em ${channelName(ch)}`;
}
function ytEscRender() {
  if (!ytEsc) return;
  $('ytEscolherModo').textContent = ytEsc.modo === 'trocar' ? 'Trocar' : 'Tocar';
  $('ytEscolherIr').textContent = ytEsc.modo === 'trocar' ? 'Trocar' : 'Tocar';
  if (!ytEscAviso) $('ytEscolherFrase').textContent = ytEscFrase();
}
// Um aviso no lugar da frase, por alguns segundos
function ytEscAvisar(texto, ms = 4000) {
  clearTimeout(ytEscAviso);
  $('ytEscolherFrase').textContent = $('ytEscolherFrase').title = texto; // a dica tem o texto inteiro (janela estreita corta)
  $('ytEscolherFrase').classList.add('aviso');
  ytEscAviso = setTimeout(() => { ytEscAviso = null; $('ytEscolherFrase').classList.remove('aviso'); $('ytEscolherFrase').title = ''; ytEscRender(); }, ms);
}

// Pôr música (mode 'por') e Trocar (mode 'trocar'): o escolhedor; sem ele, o balão de colar o link
async function escolherMusica(ch, anchor, mode) {
  if (!window.api?.ytEscolherAbrir) return openMusicPop(ch, anchor, mode);
  if (ytEsc) return;
  closeMusicPop();
  ytEsc = { ch, modo: mode === 'trocar' ? 'trocar' : 'por', anchor, erro: false };
  $('ytEscolherLink').hidden = true;
  $('ytEscolherColar').hidden = false;
  $('ytEscolherErro').hidden = true;
  $('ytEscolherCarregando').hidden = false;
  $('ytEscolher').hidden = false;
  ytEscRender();
  const r = await window.api.ytEscolherAbrir(ytEscRect()).catch(() => null);
  if (!ytEsc) return window.api.ytEscolherFechar();
  if (!r?.ok) { fecharEscolhedor(false); return openMusicPop(ch, anchor, mode); }
  ytEscObserver?.observe($('ytEscolherArea'));
  window.api.ytEscolherFocar();
}
function fecharEscolhedor(focar = true) {
  if (!ytEsc) return;
  const anchor = ytEsc.anchor;
  ytEsc = null;
  clearTimeout(ytEscAviso);
  ytEscAviso = null;
  $('ytEscolherFrase').classList.remove('aviso');
  ytEscObserver?.disconnect();
  window.api?.ytEscolherFechar?.();
  $('ytEscolher').hidden = true;
  if (focar && anchor?.isConnected) anchor.focus();
}

// Escolheu (clique no YouTube ou link colado): entra como o balão faria. O canal é o da hora do clique
function ytEscEscolheu(videoId, title = '') {
  if (!ytEsc || !/^[\w-]{11}$/.test(String(videoId))) return;
  if (ytEsc.modo === 'trocar') {
    const e = state.musicas.get(ytEsc.ch);
    if (!e) return ytEscAvisar(`A música de ${channelName(ytEsc.ch)} acabou. Feche e use Pôr música.`, 6000);
    if (!canControlMusic(e)) return ytEscAvisar(`Só quem está em ${channelName(ytEsc.ch)} troca a música de lá.`, 6000);
    musicCtl(e, 'trocar', { videoId, title });
  } else {
    if (!state.musicaOn) return ytEscAvisar('O servidor da sala não guarda música.', 6000);
    const ch = myVoiceChannel(), e = state.musicas.get(ch);
    if (e) return ytEscAvisar(`${e.by === state.myId ? 'Você já pôs' : `${nameOf(e.by)} pôs`} uma música em ${channelName(ch)}. Para mudar, use Trocar na tela da música.`, 6000);
    musica.wantOpen = ch;
    send({ type: 'musica-set', videoId, title });
  }
  fecharEscolhedor();
}

// O que vem do processo principal (main/youtube-escolher.js)
const YT_ESC_AVISOS = {
  fora: 'Links para fora do YouTube não abrem aqui.',
  login: 'Entrar na conta Google não funciona aqui. A busca funciona sem conta.',
  incorporar: 'Esse vídeo não deixa tocar fora do YouTube. Escolha outro.',
};
function ytEscMensagem(m) {
  if (!ytEsc || !m || typeof m !== 'object') return;
  if (m.tipo === 'video') ytEscEscolheu(String(m.videoId || ''), typeof m.titulo === 'string' ? m.titulo.slice(0, 200) : '');
  else if (m.tipo === 'estado') {
    $('ytEscolherVoltar').disabled = !m.podeVoltar;
    if (!m.carregando) $('ytEscolherCarregando').hidden = true;
  } else if (m.tipo === 'aviso' && m.motivo === 'rede') {
    // Sem internet ou o YouTube não abriu: a view sai da frente e fica o erro, com Tentar de novo e Colar link
    ytEsc.erro = true;
    window.api.ytEscolherPosicao(null);
    $('ytEscolherCarregando').hidden = true;
    $('ytEscolherErro').hidden = false;
  } else if (m.tipo === 'aviso' && YT_ESC_AVISOS[m.motivo]) ytEscAvisar(YT_ESC_AVISOS[m.motivo]);
  else if (m.tipo === 'foco') $('ytEscolherFechar').focus();
  else if (m.tipo === 'fechou') {
    const caiu = m.motivo === 'caiu';
    fecharEscolhedor();
    if (caiu) toast('O YouTube parou de responder. Tente de novo.', 'error');
  }
}

function ytEscColar() {
  $('ytEscolherColar').hidden = true;
  $('ytEscolherLink').hidden = false;
  $('ytEscolherUrl').value = '';
  $('ytEscolherUrl').focus();
}

function setupYtEscolher() {
  if (!window.api?.onYtEscolher) return;
  window.api.onYtEscolher(ytEscMensagem);
  setIcon($('ytEscolherVoltar'), 'prev', 'Voltar (Alt+←)');
  setIcon($('ytEscolherFechar'), 'close', 'Fechar (Esc)');
  $('ytEscolherVoltar').onclick = () => window.api.ytEscolherAcao('voltar');
  $('ytEscolherFechar').onclick = () => fecharEscolhedor();
  $('ytEscolherColar').onclick = ytEscColar;
  $('ytEscolherLink').onsubmit = (e) => {
    e.preventDefault();
    const videoId = parseYouTube($('ytEscolherUrl').value);
    if (!videoId) return ytEscAvisar('Não reconheci esse link. Cole o endereço de um vídeo do YouTube.');
    ytEscEscolheu(videoId);
  };
  $('ytEscolherTentar').onclick = () => {
    if (!ytEsc) return;
    ytEsc.erro = false;
    $('ytEscolherErro').hidden = true;
    $('ytEscolherCarregando').hidden = false;
    window.api.ytEscolherPosicao(ytEscRect());
    window.api.ytEscolherAcao('recarregar');
  };
  $('ytEscolherErroColar').onclick = ytEscColar;
  // Com o foco no cabeçalho: Esc fecha, F6 vai para a página do YouTube (de lá, F6 volta)
  $('ytEscolher').addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); fecharEscolhedor(); }
    else if (e.key === 'F6' && !ytEsc?.erro) { e.preventDefault(); window.api.ytEscolherFocar(); }
  });
}

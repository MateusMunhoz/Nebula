'use strict';
// A fila de músicas de cada canal (spec: docs/spec/musica-youtube-e-fila.md, parte 2). A sala guarda a fila junto com a
// música do canal (sala-protocolo.js: fila-por, fila-mover, fila-tirar, pular); aqui ficam o painel (#filaPop), preso
// ao botão Fila da tela da música ou à pílula do canal, e o "pôr na fila" usado pelo escolhedor, pelo balão e pelo chat.
// Mexe quem pode controlar a música (canControlMusic); quem pôs um item tira o seu. Só com servidor que anuncia "fila".
// Script clássico: divide o escopo global com os outros (ordem no index.html). Usa de: util, estado, musica.

const FILA_MAX = 30, FILA_POR_PESSOA = 10, FILA_PERTO = 20; // os limites do servidor (sala-protocolo.js)
let filaPop = null;       // { ch, anchor }: o painel aberto
let filaArrastando = 0;   // id do item sendo arrastado: o painel não redesenha no meio
let filaDesfazer = null;  // { ch, videoId, title, pos, pode, timer }: "Tirou… · Desfazer", por 5 s
let filaFoco = 0;         // item que estava com o foco antes de redesenhar

const filaAberta = (ch) => !!filaPop && filaPop.ch === ch;
const ordinal = (n) => `${n}ª`;
const quemPos = (by) => (by === state.myId ? 'você' : nameOf(by));

// O que impede pôr mais (o servidor confere de novo, com o total da sala), ou ''
function limiteFila(e) {
  if (e.fila.length >= FILA_MAX) return `Fila cheia (${FILA_MAX} de ${FILA_MAX})`;
  if (e.fila.filter((f) => f.by === state.myId).length >= FILA_POR_PESSOA) return `Você já pôs ${FILA_POR_PESSOA} nesta fila`;
  return '';
}
// Põe na fila do canal: { texto } para o aviso de quem pôs, ou { erro }. Sem título (link colado), pede a prévia antes
// (main/youtube-previa.js), se ela estiver ligada em Privacidade
async function porNaFila(ch, videoId, title = '') {
  const e = state.musicas.get(ch);
  if (!state.filaOn) return { erro: 'O servidor da sala não tem fila: quem criou precisa atualizar o app.' };
  if (!e) return { erro: `A música de ${channelName(ch)} acabou. Use Pôr música.` };
  if (!canControlMusic(e)) return { erro: `Só quem está em ${channelName(ch)} mexe na fila.` };
  const cheia = limiteFila(e);
  if (cheia) return { erro: `${cheia}.` };
  if (!title && appPreferences.chat.previaYoutube && window.api?.youtubePrevia) {
    const p = await Promise.race([window.api.youtubePrevia(videoId).catch(() => null), new Promise((r) => setTimeout(r, 3000))]);
    if (p?.id === videoId && typeof p.titulo === 'string') title = p.titulo.slice(0, 200);
  }
  const agora = state.musicas.get(ch) || e;
  const ja = agora.fila.findIndex((f) => f.videoId === videoId);
  musicCtl(agora, 'fila-por', { videoId, title });
  const nome = title || 'Música do YouTube';
  const repetida = agora.videoId === videoId ? ' (ela está tocando agora)' : ja >= 0 ? ` (ela já era a ${ordinal(ja + 1)})` : '';
  return { texto: `Na fila: ${nome} (${ordinal(agora.fila.length + 1)})${repetida}` };
}

// ---------- O painel ----------
function toggleFila(ch, anchor) { filaAberta(ch) ? fecharFila(true) : abrirFila(ch, anchor); }
function abrirFila(ch, anchor) {
  if (!state.musicas.has(ch)) return;
  closeMusicPop();
  filaPop = { ch, anchor };
  $('filaPop').hidden = false;
  renderFila();
  posicionarFila();
  ($('filaPopLista').querySelector('[tabindex="0"]') || $('filaPopFechar')).focus();
  renderMusicTiles(); // o botão Fila fica "aberto" (aria-expanded)
}
function fecharFila(focar = true) {
  if (!filaPop) return;
  const anchor = filaPop.anchor;
  filaPop = null;
  filaArrastando = 0;
  if (filaDesfazer) { clearTimeout(filaDesfazer.timer); filaDesfazer = null; }
  $('filaPop').hidden = true;
  renderMusicTiles();
  if (focar && anchor?.isConnected) anchor.focus();
}
// Preso ao botão: em cima dele (embaixo fica a faixa da barra da chamada), ou embaixo sem espaço; sem botão, no meio
function posicionarFila() {
  const pop = $('filaPop'), a = filaPop?.anchor;
  const w = pop.offsetWidth, h = pop.offsetHeight;
  let left = (innerWidth - w) / 2, top = (innerHeight - h) / 2;
  if (a?.isConnected) {
    const r = a.getBoundingClientRect();
    left = Math.min(Math.max(8, r.right - w), innerWidth - w - 8);
    top = r.top - 8 - h >= 8 ? r.top - 8 - h : Math.min(r.bottom + 8, innerHeight - h - 8);
  }
  // "fixed" conta a partir do body (que desce pela barra de título): mede o 0 de verdade e desconta, como o musicPop
  pop.style.left = '0px'; pop.style.top = '0px';
  const o = pop.getBoundingClientRect();
  pop.style.left = `${Math.max(8, left) - o.left}px`;
  pop.style.top = `${Math.max(8, top) - o.top}px`;
}

function filaBotao(icon, label, onclick, disabled = false, cls = '') {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = `btn icon ${cls}`.trim();
  setIcon(b, icon, label);
  b.disabled = disabled;
  b.onclick = (ev) => { ev.stopPropagation(); onclick(); };
  return b;
}
function filaMover(e, f, para) {
  if (para < 0 || para >= e.fila.length) return;
  filaFoco = f.id;
  musicCtl(e, 'fila-mover', { item: f.id, para });
  $('filaPopStatus').textContent = `${musicTitle(f)} agora é a ${ordinal(para + 1)}`;
}
function filaTirar(e, f, i) {
  if (filaDesfazer) clearTimeout(filaDesfazer.timer);
  filaDesfazer = { ch: e.ch, videoId: f.videoId, title: f.title, pos: i, pode: canControlMusic(e), timer: setTimeout(() => { filaDesfazer = null; renderFila(); }, 5000) };
  musicCtl(e, 'fila-tirar', { item: f.id });
  $('filaPopStatus').textContent = `Tirou ${musicTitle(f)} da fila`;
}

function renderFila() {
  if (!filaPop) return;
  const ch = filaPop.ch, e = state.musicas.get(ch);
  if (!e || !state.filaOn) return fecharFila(false);
  if (filaArrastando) return; // ao soltar, vale a ordem que a sala mandar
  const lista = $('filaPopLista');
  if (lista.contains(document.activeElement)) filaFoco = Number(document.activeElement.closest('.fila-item')?.dataset.item) || filaFoco;
  else filaFoco = 0;
  const can = canControlMusic(e), n = e.fila.length;
  $('filaPopTitulo').textContent = `Fila de ${channelName(ch)}`;
  // Tocando agora, com as barrinhas paradas da pílula
  const tocando = $('filaPopTocando');
  tocando.classList.toggle('paused', !e.playing);
  tocando.lastElementChild.textContent = `${e.playing ? 'Tocando' : 'Pausada'}: ${state.in.get(musicKey(ch))?.tile.name || musicTitle(e)} · posta por ${quemPos(e.by)}`;
  const itens = e.fila.map((f, i) => {
    const li = document.createElement('li');
    li.className = 'fila-item';
    li.dataset.item = String(f.id);
    const meu = f.by === state.myId;
    li.tabIndex = can || meu ? 0 : -1;
    li.setAttribute('aria-label', `${i + 1} de ${n}: ${musicTitle(f)}, posta por ${quemPos(f.by)}`);
    const puxador = document.createElement('span');
    puxador.className = 'fila-puxador';
    puxador.setAttribute('aria-hidden', 'true');
    puxador.textContent = '⠿';
    puxador.hidden = !can;
    const num = document.createElement('span');
    num.className = 'fila-num';
    num.textContent = String(i + 1);
    const info = document.createElement('div');
    info.className = 'fila-info';
    const titulo = document.createElement('strong');
    titulo.textContent = musicTitle(f);
    titulo.title = musicTitle(f);
    const por = document.createElement('span');
    por.className = meu ? 'fila-voce' : '';
    por.textContent = `posta por ${quemPos(f.by)}`;
    info.append(titulo, por);
    const acoes = document.createElement('div');
    acoes.className = 'fila-acoes';
    if (can) {
      acoes.append(
        filaBotao('play', 'Tocar agora (para todos)', () => musicCtl(e, 'pular', { videoId: e.videoId, item: f.id })),
        filaBotao('chevronUp', 'Subir (Alt+↑)', () => filaMover(e, f, i - 1), i === 0),
        filaBotao('chevronDown', 'Descer (Alt+↓)', () => filaMover(e, f, i + 1), i === n - 1));
    }
    if (can || meu) acoes.append(filaBotao('close', 'Tirar da fila', () => filaTirar(e, f, i), false, 'fila-tirar'));
    li.append(puxador, num, info, acoes);
    if (can) {
      li.onkeydown = (ev) => {
        if (!ev.altKey || (ev.key !== 'ArrowUp' && ev.key !== 'ArrowDown')) return;
        ev.preventDefault();
        filaMover(e, f, i + (ev.key === 'ArrowUp' ? -1 : 1));
      };
      // Arrastar só pelo puxador (o resto do item tem botões e texto)
      li.onpointerdown = (ev) => { li.draggable = !!ev.target.closest('.fila-puxador'); };
      li.ondragstart = (ev) => { filaArrastando = f.id; li.classList.add('arrastando'); ev.dataTransfer.effectAllowed = 'move'; ev.dataTransfer.setData('text/plain', ''); };
      li.ondragend = () => { filaArrastando = 0; li.draggable = false; renderFila(); };
    }
    li.ondragover = (ev) => {
      if (!filaArrastando) return;
      ev.preventDefault();
      const r = li.getBoundingClientRect(), baixo = ev.clientY > r.top + r.height / 2;
      for (const x of lista.children) x.classList.remove('soltar-cima', 'soltar-baixo');
      li.classList.add(baixo ? 'soltar-baixo' : 'soltar-cima');
    };
    li.ondrop = (ev) => {
      ev.preventDefault();
      const de = e.fila.findIndex((x) => x.id === filaArrastando);
      if (de < 0) return;
      const baixo = li.classList.contains('soltar-baixo');
      let para = i + (baixo ? 1 : 0);
      if (de < para) para--;
      if (para !== de) filaMover(e, e.fila[de], para);
    };
    return li;
  });
  // A linha do que você tirou, no lugar dele, com Desfazer (quem pode pôr na fila)
  if (filaDesfazer?.ch === ch) {
    const li = document.createElement('li');
    li.className = 'fila-tirou';
    li.append(`Tirou ${filaDesfazer.title || 'Música do YouTube'}`);
    if (filaDesfazer.pode && can) {
      const desfazer = document.createElement('button');
      desfazer.type = 'button';
      desfazer.className = 'link-btn';
      desfazer.textContent = 'Desfazer';
      desfazer.onclick = () => {
        const d = filaDesfazer;
        clearTimeout(d.timer);
        filaDesfazer = null;
        musicCtl(e, 'fila-por', { videoId: d.videoId, title: d.title, pos: d.pos });
        $('filaPopStatus').textContent = `${d.title || 'A música'} voltou para a fila`;
      };
      li.append(' · ', desfazer);
    }
    itens.splice(Math.min(filaDesfazer.pos, itens.length), 0, li);
  }
  lista.replaceChildren(...itens);
  $('filaPopSeguir').hidden = !n;
  $('filaPopVazio').hidden = n > 0;
  // Rodapé: adicionar, ou o motivo de não poder (escrito, não só na dica de botão desligado)
  const cheia = can ? limiteFila(e) : '';
  $('filaPopProcurar').hidden = $('filaPopColar').hidden = !can;
  $('filaPopProcurar').disabled = $('filaPopColar').disabled = !!cheia;
  $('filaPopAviso').textContent = !can ? `Só quem está em ${channelName(ch)} mexe na fila.` : cheia || (n >= FILA_PERTO ? `${n} de ${FILA_MAX}` : '');
  if (filaFoco) lista.querySelector(`.fila-item[data-item="${filaFoco}"]`)?.focus();
  posicionarFila();
}

function setupFila() {
  setIcon($('filaPopFechar'), 'close', 'Fechar a fila (Esc)');
  $('filaPopProcurar').insertAdjacentHTML('afterbegin', ICON.plus);
  $('filaPopFechar').onclick = () => fecharFila(true);
  $('filaPopProcurar').onclick = () => { if (filaPop) escolherMusica(filaPop.ch, $('filaPopProcurar'), 'fila'); };
  $('filaPopColar').onclick = () => { if (filaPop) openMusicPop(filaPop.ch, $('filaPopColar'), 'fila'); };
  $('filaPopLista').ondragleave = (ev) => { if (!$('filaPopLista').contains(ev.relatedTarget)) for (const x of $('filaPopLista').children) x.classList.remove('soltar-cima', 'soltar-baixo'); };
  $('filaPop').addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); fecharFila(true); } });
  document.addEventListener('pointerdown', (e) => {
    if (filaPop && !e.target.closest?.('#filaPop, .music-fila-btn, #navMusicMenu, #musicPop, #ytEscolher, .modal')) fecharFila(false);
  });
  addEventListener('resize', () => { if (filaPop) posicionarFila(); });
}

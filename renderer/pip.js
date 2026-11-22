'use strict';
// Janelas flutuantes (picture in picture).
// Script clássico: divide o escopo global com os outros (ordem no index.html). Usa de: util, estado, tema, voz, membros, assistir.

// ---------- Janela flutuante ----------
// A página abre a janela (about:blank, mesmo processo) e monta nela um <video> com o mesmo MediaStream do
// tile: nada é decodificado de novo. O processo principal cuida de deixar a janela por cima, sem foco e,
// travada, com o clique atravessando.
// Cada transmissão pode ter a sua janela; o nome da janela leva o id para o processo principal saber de quem é
function togglePip(id) {
  if (state.pips.has(id)) return closePip(id);
  const win = window.open('', `tela-pip-${pipWinId(id)}`);
  if (!win) return toast('Não foi possível abrir a janela flutuante.', 'error');
  const p = buildPip(win, id);
  state.pips.set(id, p);
  const music = state.in.get(id)?.music;
  if (music) setPipMusic(p, music);
  else setPipStream(id);
}

// O nome da janela só aceita letras, números, _ e - (main.js); a música é "musica:<canal>"
function pipWinId(id) {
  return /^[\w-]{1,40}$/.test(id) ? id : String(id).replace(/[^\w-]/g, '-').slice(0, 40);
}

// Música do YouTube: o player muda para a janela flutuante e volta ao fechar (um player novo de cada vez,
// musica.js › moverPlayer), carregando no ponto da sala (1 a 2 s)
function setPipMusic(p, music) {
  const link = state.in.get(p.id);
  p.video.style.display = 'none';
  // As mensagens do player vão para a janela onde ele está
  p.win.addEventListener('message', onYoutubeMessage);
  music.moverPlayer(p.win.document.body);
  p.name.textContent = p.lockTag.textContent = link.tile.name;
  p.win.document.title = `${link.tile.name} · Nebula`;
  renderPipButtons();
}

function pipMusicBack(p) {
  const link = p && state.in.get(p.id);
  if (link?.music) link.music.moverPlayer(null);
}

// Tamanhos rápidos da lista: letra (a largura de cada uma fica em main/janela-flutuante.js › PIP_SIZES), nome e largura
const PIP_TAMANHOS = [['P', 'Pequena', 320], ['M', 'Média', 480], ['G', 'Grande', 640]];

function pipButton(d, text, onClick, primary) {
  const b = d.createElement('button');
  b.type = 'button';
  b.textContent = text;
  Object.assign(b.style, {
    font: 'inherit', fontSize: '12px', fontWeight: '600', height: '28px', padding: '0 10px', borderRadius: '6px', cursor: 'pointer',
    border: '1px solid ' + (primary ? THEME.primary : THEME.line), background: primary ? THEME.primary : THEME.card, color: primary ? THEME.onPrimary : THEME.text,
  });
  b.style.setProperty('-webkit-app-region', 'no-drag');
  b.onclick = onClick;
  return b;
}

// Botão só com ícone para as janelas montadas por código, no mesmo tamanho dos outros botões delas
function pipIconButton(d, icon, label, onClick, primary) {
  const b = pipButton(d, '', onClick, primary);
  b.innerHTML = icon;
  b.title = label;
  b.setAttribute('aria-label', label);
  Object.assign(b.style, { width: '28px', padding: '0', display: 'inline-grid', placeItems: 'center' });
  Object.assign(b.firstElementChild.style, { width: '16px', height: '16px', fill: 'none', stroke: 'currentColor', strokeWidth: '2', strokeLinecap: 'round' });
  return b;
}

// Botão de fechar (um X)
function pipCloseButton(d, label, onClick) {
  return pipIconButton(d, ICON.close, label, onClick, false);
}

// Tudo por CSSOM: a página herda a regra de segurança do app, que não deixa estilo escrito em HTML
function buildPip(win, id) {
  const d = win.document;
  applyAppTheme(d);
  d.documentElement.style.height = '100%';
  Object.assign(d.body.style, {
    margin: '0', height: '100%', overflow: 'hidden', background: '#000000', color: THEME.text, userSelect: 'none',
    fontFamily: THEME.font,
  });
  const video = d.createElement('video');
  video.autoplay = true;
  video.muted = true; // o som continua saindo pelo app, com o volume de cada tela
  video.playsInline = true;
  Object.assign(video.style, { position: 'fixed', inset: '0', width: '100%', height: '100%', objectFit: 'contain' });

  // Modo de ajuste: borda, o nome num canto e uma barra só embaixo (tamanho, transparência, travar, fechar).
  // A janela inteira arrasta, menos os controles
  const edit = d.createElement('div');
  Object.assign(edit.style, {
    position: 'fixed', inset: '0', boxSizing: 'border-box', border: `2px solid ${THEME.accent}`,
    display: 'flex', flexDirection: 'column', justifyContent: 'space-between', fontSize: '12px', cursor: 'move',
  });
  edit.style.setProperty('-webkit-app-region', 'drag');
  const noDrag = (el) => { el.style.setProperty('-webkit-app-region', 'no-drag'); return el; };
  const name = d.createElement('span');
  Object.assign(name.style, {
    alignSelf: 'flex-start', margin: '8px', padding: '3px 8px', borderRadius: '5px', background: THEME.glass, boxSizing: 'border-box',
    maxWidth: 'calc(100% - 16px)', fontSize: '12px', fontWeight: '600', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
  });
  const winId = pipWinId(id);
  // Caixinha de opções lado a lado (tamanhos; com 2 ou mais janelas, fila e canto)
  const seg = (items, onPick) => {
    const box = noDrag(d.createElement('div'));
    Object.assign(box.style, { display: 'flex', gap: '2px', padding: '2px', background: THEME.sunken, borderRadius: '6px', cursor: 'default' });
    const btns = {};
    for (const [key, text, title] of items) {
      const b = pipButton(d, text, () => onPick(key), false);
      Object.assign(b.style, { minWidth: '26px', height: '24px', padding: '0 7px', border: '0', borderRadius: '4px' });
      b.title = title;
      b.setAttribute('aria-label', title);
      btns[key] = b;
      box.append(b);
    }
    return { box, btns };
  };
  const segOn = (b, on) => {
    b.style.background = on ? THEME.accentSoft : 'transparent';
    b.style.color = on ? THEME.accent : THEME.muted;
    b.setAttribute('aria-pressed', String(on));
  };

  // Tamanhos rápidos: três retângulos, do menor para o maior; aceso, o tamanho em que a janela está
  const sizeSeg = seg(PIP_TAMANHOS.map(([key, text]) => [key, '', text]), (key) => window.api.pipSize(winId, key));
  PIP_TAMANHOS.forEach(([key], i) => {
    const b = sizeSeg.btns[key];
    Object.assign(b.style, { width: '28px', minWidth: '0', padding: '0', display: 'inline-grid', placeItems: 'center' });
    const box = d.createElement('span');
    Object.assign(box.style, { width: `${8 + i * 4.5}px`, height: `${5 + i * 3}px`, border: '1.5px solid currentColor', borderRadius: '2px', boxSizing: 'border-box' });
    b.append(box);
  });
  const showSize = () => {
    for (const [key, , width] of PIP_TAMANHOS) segOn(sizeSeg.btns[key], Math.abs(win.innerWidth - width) <= 1);
  };

  // Transparência: a gota e o controle ocupam o meio da barra
  const drop = d.createElement('span');
  drop.innerHTML = svg('M12 3c4 5 6 8 6 11a6 6 0 0 1-12 0c0-3 2-6 6-11z');
  drop.title = 'Transparência';
  Object.assign(drop.style, { display: 'inline-grid', color: THEME.muted });
  Object.assign(drop.firstElementChild.style, { width: '16px', height: '16px', fill: 'none', stroke: 'currentColor', strokeWidth: '2', strokeLinejoin: 'round' });
  const opacity = noDrag(d.createElement('input'));
  opacity.type = 'range';
  opacity.min = '40';
  opacity.max = '100';
  opacity.value = '100';
  opacity.title = 'Transparência';
  opacity.setAttribute('aria-label', 'Transparência');
  Object.assign(opacity.style, { flex: '1', minWidth: '0', margin: '0', accentColor: THEME.accent, cursor: 'pointer' });
  opacity.oninput = () => window.api.pipOpacity(winId, Number(opacity.value) / 100);
  const lock = pipIconButton(d, ICON.lock, 'Travar todas (Ctrl+Shift+E)', () => window.api.pipSetEdit(false), true);
  lock.style.marginLeft = 'auto';
  const bar = d.createElement('div');
  Object.assign(bar.style, { display: 'flex', alignItems: 'center', gap: '10px', padding: '8px' });
  bar.append(sizeSeg.box, drop, opacity, lock, pipCloseButton(d, 'Fechar a janela flutuante', () => closePip(id)));
  // Janela estreita: a transparência sai para caber o resto
  const fitBar = () => {
    showSize();
    drop.style.display = opacity.style.display = win.innerWidth < 260 ? 'none' : '';
  };
  win.addEventListener('resize', fitBar);
  fitBar();

  // Com 2 ou mais janelas, uma linha acima da barra: mesmo tamanho para todas e como enfileirar (coluna ou
  // linha, a partir de qual canto)
  const groupRow = d.createElement('div');
  Object.assign(groupRow.style, { display: 'none', flexWrap: 'wrap', alignItems: 'center', gap: '6px 10px', padding: '8px 8px 0', color: THEME.muted });
  const linkedLabel = noDrag(d.createElement('label'));
  Object.assign(linkedLabel.style, { display: 'inline-flex', alignItems: 'center', gap: '6px', cursor: 'pointer' });
  const linked = d.createElement('input');
  linked.type = 'checkbox';
  linked.style.accentColor = THEME.accent;
  linked.onchange = () => window.api.pipGroup(winId, { linked: linked.checked });
  linkedLabel.append(linked, 'Todas do mesmo tamanho');
  const layoutSeg = seg([['coluna', 'Coluna', 'Enfileirar em coluna'], ['linha', 'Linha', 'Enfileirar em linha']],
    (layout) => window.api.pipGroup(winId, { layout }));
  const cornerSeg = seg([['tl', '↖', 'Começar no canto de cima à esquerda'], ['tr', '↗', 'Começar no canto de cima à direita'],
    ['bl', '↙', 'Começar no canto de baixo à esquerda'], ['br', '↘', 'Começar no canto de baixo à direita']],
    (corner) => window.api.pipGroup(winId, { corner }));
  groupRow.append(linkedLabel, layoutSeg.box, cornerSeg.box);

  const bottom = d.createElement('div');
  Object.assign(bottom.style, { display: 'flex', flexDirection: 'column', background: THEME.glass });
  bottom.append(groupRow, bar);
  edit.append(name, bottom);

  // Travada: só uma etiqueta pequena com o nome; ao travar, um aviso rápido
  const lockTag = d.createElement('span');
  Object.assign(lockTag.style, {
    position: 'fixed', top: '8px', left: '8px', display: 'none', alignItems: 'center', gap: '5px', fontSize: '11px', fontWeight: '600',
    padding: '3px 7px', borderRadius: '5px', background: 'rgba(0, 0, 0, .55)', color: 'rgba(237, 237, 237, .85)',
  });
  const notice = d.createElement('span');
  notice.textContent = 'Janela travada: o clique vai para o jogo · Ctrl+Shift+E para ajustar';
  Object.assign(notice.style, {
    position: 'fixed', left: '50%', bottom: '10px', transform: 'translateX(-50%)', display: 'none', whiteSpace: 'nowrap',
    fontSize: '12px', padding: '6px 10px', borderRadius: '8px', background: THEME.glass, border: `1px solid ${THEME.line}`,
  });
  // Borda verde quando a pessoa desta janela fala; embaixo, quem mais está falando na voz
  const speakRing = d.createElement('div');
  Object.assign(speakRing.style, { position: 'fixed', inset: '0', border: `2px solid ${THEME.ok}`, display: 'none', pointerEvents: 'none' });
  if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
    speakRing.animate([{ opacity: 1 }, { opacity: 0.3 }, { opacity: 1 }], { duration: 1100, iterations: Infinity, easing: 'ease-in-out' });
  }
  const talkers = d.createElement('div');
  Object.assign(talkers.style, { position: 'fixed', left: '8px', bottom: '8px', display: 'flex', flexWrap: 'wrap', gap: '6px', pointerEvents: 'none' });
  d.body.append(video, speakRing, talkers, edit, lockTag, notice);
  // Roda do mouse (no modo de ajuste; travada, o mouse passa direto para o jogo): som dessa transmissão
  if (!state.in.get(id)?.self && !state.in.get(id)?.music) onWheelVolume(d, id, 'screen', d);
  const p = { win, id, winId, video, edit, name, opacity, lockTag, notice, noticeTimer: null, groupRow, linked, layoutSeg, cornerSeg, speakRing, talkers };
  requestAnimationFrame(() => renderPipSpeaking());
  return p;
}

function renderPipSpeaking() {
  for (const p of state.pips.values()) {
    if (p.win.closed) continue;
    const d = p.win.document;
    p.speakRing.style.display = speaking.has(p.id) ? 'block' : 'none';
    const others = [...speaking].filter((id) => id !== p.id && id !== state.myId && state.members.has(id));
    p.talkers.replaceChildren(...others.map((id) => talkerChip(d, id)));
  }
}

// Os controles de grupo aparecem só com 2 ou mais janelas, e mostram a escolha atual em todas
let pipGroupState = { linked: false, layout: 'coluna', corner: 'br' };
function renderPipGroup() {
  const many = state.pips.size > 1;
  const g = pipGroupState;
  for (const p of state.pips.values()) {
    if (p.win.closed) continue;
    p.groupRow.style.display = many ? 'flex' : 'none';
    p.linked.checked = g.linked;
    for (const [segKey, seg] of [['layout', p.layoutSeg], ['corner', p.cornerSeg]]) {
      for (const [key, b] of Object.entries(seg.btns)) {
        const on = g[segKey] === key;
        b.style.background = on ? THEME.accentSoft : 'transparent';
        b.style.color = on ? THEME.accent : THEME.muted;
        b.setAttribute('aria-pressed', String(on));
      }
    }
  }
}

function setPipStream(id) {
  const link = state.in.get(id);
  const p = state.pips.get(id);
  if (!link || !p || p.win.closed) return;
  refreshTileStream(link);
  p.name.textContent = link.tile.name;
  p.lockTag.textContent = link.tile.name;
  p.win.document.title = `${link.tile.name} · Nebula`;
  syncIncomingVideo();
  renderPipButtons();
}

function closePip(id) {
  const p = state.pips.get(id);
  state.pips.delete(id);
  releasePipVideo(p);
  if (p && !p.win.closed) p.win.close();
  pipClosed(p);
}

// A janela flutuante solta a transmissão antes de fechar: enquanto o vídeo dela segura a faixa de áudio, o
// quadro do app não volta a tocar o som (que é a mesma faixa)
function releasePipVideo(p) {
  try { if (p?.video) { p.video.pause(); p.video.srcObject = null; } } catch {}
}

// O vídeo volta para o quadro no app
function pipClosed(p) {
  releasePipVideo(p);
  const link = p && state.in.get(p.id);
  if (link?.music) pipMusicBack(p);
  else if (link) refreshTileStream(link);
  syncIncomingVideo();
  renderPipButtons();
}

function renderPipButtons() {
  for (const [id, link] of state.in) {
    const on = state.pips.has(id);
    setIcon(link.tile.pipBtn, 'pip', on ? 'Fechar a janela flutuante' : 'Abrir em janela flutuante (fica por cima do jogo)');
    link.tile.pipBtn.classList.toggle('on', on);
    link.tile.pipNote.hidden = !on;
  }
  // Barra: quais transmissões estão em janela flutuante, com o atalho e o X (fecha todas)
  renderPipGroup();
  const names = [...state.pips.keys()].filter((id) => state.in.has(id)).map((id) => state.in.get(id).tile.name);
  $('pipChip').hidden = !names.length;
  $('pipChipText').textContent = names.length === 1 ? `Janela flutuante: ${names[0]}` : `Janelas flutuantes: ${names.join(', ')}`;
  setIcon($('pipChipClose'), 'close', names.length > 1 ? 'Fechar as janelas flutuantes' : 'Fechar a janela flutuante');
  if (state.myId) renderMembers();
}

function setPipLocked(p, locked) {
  p.edit.style.display = locked ? 'none' : 'flex';
  p.lockTag.style.display = locked ? 'inline-flex' : 'none';
  clearTimeout(p.noticeTimer);
  p.notice.style.display = locked ? 'block' : 'none';
  if (locked) p.noticeTimer = setTimeout(() => { p.notice.style.display = 'none'; }, 3000);
}

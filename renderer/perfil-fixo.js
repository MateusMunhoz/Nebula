'use strict';
// ---------- Coluna do perfil ----------
// Na sala, entre as telas e o painel, o perfil inteiro de uma pessoa fica sempre à vista (como no Discord). O desenho
// é o do perfil da voz (renderSkyPage em ceu-voz.js, no modo fixo); no pé, a lista "Na voz" com quem está na sala
// troca de pessoa. Clicar em alguém em qualquer lugar também troca (openSkyProfile e o clique nas fotos e nomes, voz.js).
// A setinha recolhe; clicar em alguém abre de novo. Com a janela estreita não há coluna: volta o perfil por cima do painel.
// px de janela: abaixo disso, a coluna tiraria espaço demais das telas. A janela começa com 1200 (main.js) e o Windows
// come uns pixels da borda: 1160 deixa a coluna no tamanho de abertura, com ~430 px de telas
const PERFIL_FIXO_MIN = 1160;
const perfilFixo = (() => {
  let s; try { s = JSON.parse(load('perfilFixo.v1', '{}')); } catch {}
  return { aberto: s?.aberto !== false, escolhido: null }; // escolhido: quem você clicou (vale enquanto a pessoa está na sala)
})();
let perfilFixoKey = '', perfilFixoListaKey = '', perfilFixoHistVisto = '';

// A coluna cabe aqui (na sala à vista, com a janela larga); NaTela: cabe e está aberta
function perfilFixoCabe() {
  return !!state.myId && !$('room').hidden && innerWidth >= PERFIL_FIXO_MIN && !document.body.classList.contains('workspace-wide');
}
const perfilFixoNaTela = () => perfilFixo.aberto && perfilFixoCabe();

function setPerfilFixoAberto(aberto) {
  perfilFixo.aberto = aberto;
  save('perfilFixo.v1', JSON.stringify({ aberto }));
  syncPerfilFixo();
}
// Clicou em alguém: mostra na coluna (abrindo, se estava recolhida). false: a coluna não cabe, quem chamou segue como antes
function mostrarNoPerfilFixo(id) {
  if (!perfilFixoCabe() || !id || (id !== state.myId && !state.members.has(id))) return false;
  perfilFixo.escolhido = id;
  if (!perfilFixo.aberto) setPerfilFixoAberto(true);
  else renderPerfilFixo();
  return true;
}

// Quem a coluna mostra: quem você escolheu; sem escolha, quem transmite, depois quem está na voz, depois qualquer um
// da sala e, sozinho, você
function quemNoPerfilFixo() {
  const esta = (id) => id && (id === state.myId || state.members.has(id));
  if (esta(perfilFixo.escolhido)) return perfilFixo.escolhido;
  perfilFixo.escolhido = null;
  const outros = [...state.members.keys()];
  return outros.find((id) => state.members.get(id)?.sharing) || outros.find(inVoice) || outros[0] || state.myId;
}

// Mostra ou esconde a coluna (a sala, a janela ou a escolha mudou); chamada por syncWorkspace e ao mudar o tamanho
function syncPerfilFixo() {
  const on = perfilFixoNaTela(), col = $('perfilFixo');
  document.body.classList.toggle('com-perfil-fixo', on);
  if (col.hidden !== on) return on && renderPerfilFixo();
  col.hidden = !on;
  perfilFixoKey = perfilFixoListaKey = '';
  if (on) return renderPerfilFixo();
  const corpo = $('perfilFixoCorpo');
  corpo.replaceChildren();
  corpo.style.removeProperty('--fundo'); // o GIF do fundo para de vez com a coluna fechada
  delete corpo.dataset.for;
}

// Redesenha só quando algo mostrado mudou (a mesma chave do perfil da voz); forcar: a frase, o fundo ou a atividade chegou
function renderPerfilFixo(forcar = false) {
  const col = $('perfilFixo');
  if (!col || col.hidden) return;
  const id = quemNoPerfilFixo(), corpo = $('perfilFixoCorpo');
  const nova = corpo.dataset.for !== id;
  if (nova) { pedirBio(id); pedirAtvh(id); requestProfileBg(id); } // como ao abrir o perfil da voz: pode ter mudado
  const { key, bg, dados } = dadosDoPerfil(id, 'fixo');
  if (forcar || nova || key !== perfilFixoKey) {
    perfilFixoKey = key;
    // Redesenhar não pode tirar o foco do teclado (o volume pelas setas) nem pular a rolagem de quem está lendo
    const foco = corpo.contains(document.activeElement) ? document.activeElement.getAttribute('aria-label') : null;
    const rolagem = nova ? 0 : corpo.scrollTop;
    corpo.replaceChildren();
    corpo.dataset.for = id;
    pintarCaixaDoPerfil(corpo, dados.pid, bg);
    renderSkyPage(corpo, { ...dados, fixo: true });
    corpo.scrollTop = rolagem;
    if (foco) [...corpo.querySelectorAll('[aria-label]')].find((e) => e.getAttribute('aria-label') === foco)?.focus();
  }
  renderPerfilFixoLista(id);
}
// A frase, o fundo, os recentes ou o modo gamer mudaram: redesenha se é de quem a coluna mostra (sem id: de todos)
function perfilFixoMudou(id) {
  const corpo = $('perfilFixoCorpo');
  if (!corpo?.dataset.for) return;
  if (!id || id === 'me' ? true : corpo.dataset.for === id) renderPerfilFixo(true);
}

// A lista do pé, como a da voz: quem está na voz, depois quem só está na sala (você por último). A escolhida fica marcada;
// quem fala acende em verde e ganha as barrinhas (renderSpeaking, pelo data-person); quem transmite, o anel "ao vivo"
function renderPerfilFixoLista(atual) {
  const pessoa = (id) => {
    const me = id === state.myId, atv = atvDe(me ? null : id);
    const live = me ? !!state.sharing : !!state.members.get(id)?.sharing, voz = inVoice(id);
    return { id, me, voz, live, nome: me ? getName() : nameOf(id), foto: photoHashOf(me ? null : id),
      micOff: voz && (me ? voice.muted : !!voice.members.get(id)?.muted),
      sub: live ? 'Transmitindo' : atv?.jogo || atv?.faixa || atv?.artista || '' };
  };
  const gente = [...state.members.keys(), state.myId].map(pessoa);
  const grupos = [['Na voz', gente.filter((p) => p.voz)]].filter(([, g]) => g.length); // quem só está na sala fica de fora
  const key = JSON.stringify([atual, grupos]);
  if (key === perfilFixoListaKey) return;
  perfilFixoListaKey = key;
  const lista = $('perfilFixoLista');
  lista.replaceChildren();
  for (const [titulo, g] of grupos) {
    const t = document.createElement('p');
    t.className = 'pf-lista-t';
    t.textContent = `${titulo} · ${g.length}`;
    lista.append(t);
    for (const p of g) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'pf-linha' + (p.live ? ' live' : '');
      b.dataset.person = p.id;
      b.classList.toggle('speaking', speaking.has(p.id));
      b.setAttribute('aria-current', String(p.id === atual));
      b.setAttribute('aria-label', `Ver o perfil de ${p.nome}${p.me ? ' (você)' : ''}${p.micOff ? ', microfone desligado' : ''}`);
      // Só a foto: o nome e o que faz ficam na dica do mouse (e no perfil, em cima)
      b.title = [p.me ? `${p.nome} (você)` : p.nome, p.sub].filter(Boolean).join(' · ');
      b.append(avatar(p.nome, p.me ? null : p.id));
      if (p.micOff) { const m = document.createElement('span'); m.className = 'pf-mudo'; m.setAttribute('aria-hidden', 'true'); m.innerHTML = ICON.micOff; b.append(m); }
      b.onclick = () => { perfilFixo.escolhido = p.id; renderPerfilFixo(); };
      lista.append(b);
    }
  }
  lista.querySelector('[aria-current="true"]')?.scrollIntoView({ block: 'nearest' });
}

function setupPerfilFixo() {
  let fila = false;
  addEventListener('resize', () => {
    if (fila) return;
    fila = true;
    requestAnimationFrame(() => { fila = false; syncPerfilFixo(); });
  });
}

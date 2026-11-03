'use strict';
// Assistir pelo navegador (docs/spec/assistir-no-navegador.md): entra na sala como espectador (só assiste, sem
// voz nem chat) e recebe a tela por WebRTC comum. O servidor é o mesmo do modo Internet (servidor-internet/server.js);
// quem transmite é o app, que já responde a { side: 'viewer', subscribe: true } com a oferta (renderer/transmitir.js).
const $ = (id) => document.getElementById(id);
const CLIENT = Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join('');

// ws: sala atual; ice: servidores do welcome; membros: id -> { name, sharing, shareInfo }
// vistas: id de quem transmite -> { pc, cadeia, timer, fig, video, status, tocar, cheia } (uma conexão por transmissão)
// destaque: id da tela grande; manual: quem parei à mão (não volta sozinho); nota: por que parei de assistir
const S = { ws: null, ice: [], membros: new Map(), vistas: new Map(), destaque: null, manual: new Set(), nota: '', conversar: false };
const nomeDe = (id) => S.membros.get(id)?.name || 'Alguém';

function mostrar(tela) { $('entrar').hidden = tela !== 'entrar'; $('sala').hidden = tela !== 'sala'; }
function aviso(texto, erro = false) { $('aviso').textContent = texto; $('aviso').classList.toggle('erro', erro); }
function estado(texto) { $('estado').textContent = texto; }
function enviar(msg) { if (S.ws?.readyState === WebSocket.OPEN) S.ws.send(JSON.stringify(msg)); }
function sinalizar(to, data) { enviar({ type: 'signal', to, data }); }

// conversar: entra como convidado (visível, com microfone); senão, como espectador (só assiste, invisível)
function conectar(codigo, senha, conversar = false, nome = '') {
  sair(false);
  S.conversar = conversar;
  $('entrarBtn').disabled = true;
  aviso('Entrando…');
  const ws = new WebSocket(`${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}`);
  S.ws = ws;
  let entrou = false;
  const hello = { type: 'hello', role: conversar ? 'convidado' : 'espectador', room: codigo, password: senha, name: conversar ? nome : 'Espectador', client: CLIENT };
  ws.onopen = () => ws.send(JSON.stringify(hello));
  ws.onmessage = (e) => {
    let m;
    try { m = JSON.parse(e.data); } catch { return; }
    if (S.ws !== ws || !m || typeof m !== 'object') return;
    if (m.type === 'welcome') entrou = true;
    receber(m);
  };
  ws.onerror = () => { if (S.ws === ws && !entrou) aviso('Não consegui falar com o servidor. Confira a internet e tente de novo.', true); };
  ws.onclose = () => {
    if (S.ws !== ws) return;
    const motivo = $('aviso').classList.contains('erro') ? $('aviso').textContent : '';
    sair(false);
    aviso(motivo || (entrou ? 'A conexão com a sala caiu. Toque em Entrar para voltar.' : 'Não consegui entrar. Tente de novo.'), true);
  };
}

function receber(m) {
  if (S.conversar && m.type !== 'welcome') Voz.receber(m); // voz.js cuida de voice-state, quem entra e sai e os sinais de voz
  if (m.type === 'welcome') {
    S.ice = Array.isArray(m.iceServers) ? m.iceServers : [];
    S.membros = new Map((Array.isArray(m.members) ? m.members : []).map((x) => [x.id, x]));
    mostrar('sala');
    if (S.conversar) {
      Voz.entrar({
        enviar, meuId: m.id, membros: m.members, ice: S.ice, aoMudar: desenharVoz,
        aoPerderMic: () => { sair(false); aviso('O microfone foi desligado (ligação, bloqueio de tela ou outro aplicativo). Toque em Entrar para voltar.', true); },
      });
      $('voz').hidden = false;
      $('mudo').hidden = false;
      $('saida').hidden = !Voz.temSaida(); // só o Safari do iPhone tem como escolher a saída
      desenharVoz();
    }
    atualizar();
  } else if (m.type === 'error') {
    aviso(String(m.message || 'Não consegui entrar.'), true);
  } else if (m.type === 'member-joined') {
    S.membros.set(m.id, { id: m.id, name: m.name, sharing: !!m.sharing, shareInfo: m.shareInfo || null });
    atualizar();
  } else if (m.type === 'member-left') {
    parar(m.id, `A transmissão de ${nomeDe(m.id)} terminou.`);
    S.membros.delete(m.id);
    S.manual.delete(m.id);
    atualizar();
  } else if (m.type === 'share-state') {
    const x = S.membros.get(m.id) || { id: m.id, name: 'Alguém' };
    S.membros.set(m.id, { ...x, sharing: !!m.sharing, shareInfo: m.sharing ? m.info || null : null });
    if (!m.sharing) S.manual.delete(m.id);
    if (!m.sharing || m.info?.open === false) parar(m.id, m.sharing ? `A transmissão de ${nomeDe(m.id)} foi fechada para quem não está na sala.` : `A transmissão de ${nomeDe(m.id)} terminou.`);
    atualizar();
  } else if (m.type === 'signal') {
    sinal(m.from, m.data);
  }
}

// Lista de quem está na conversa (nomes só como texto)
function desenharVoz(info) {
  if (!S.conversar) return;
  const ul = $('vozLista');
  ul.replaceChildren();
  const gente = Voz.lista();
  for (const p of gente) {
    const li = document.createElement('li');
    li.textContent = `${p.name}${p.mudo ? ' (mudo)' : ''}${p.conectado ? '' : ' …'}`;
    if (p.mudo) li.className = 'mudo';
    ul.append(li);
  }
  if (!gente.length) { const li = document.createElement('li'); li.textContent = 'Ninguém mais na conversa ainda.'; li.className = 'mudo'; ul.append(li); }
  if (info?.precisaToque) $('ouvir').hidden = false;
}

// Lista quem está transmitindo, cada um com Assistir/Parar. Uma única transmissão aberta entra sozinha (até eu parar)
function atualizar() {
  const lista = $('lista');
  lista.replaceChildren();
  const todos = [...S.membros.values()].filter((x) => x.sharing);
  const abertas = todos.filter((x) => x.shareInfo?.open !== false);
  if (abertas.length === 1 && !S.vistas.size && !S.manual.has(abertas[0].id)) return assistir(abertas[0].id);
  for (const x of abertas) {
    const vendo = S.vistas.has(x.id);
    const b = botao(`${vendo ? 'Parar' : 'Assistir'} ${x.name || 'Alguém'}`);
    if (vendo) b.className = 'secundario';
    b.onclick = () => { if (vendo) parar(x.id, '', true); else assistir(x.id); atualizar(); };
    lista.append(b);
  }
  if (S.vistas.size || (abertas.length === 1)) estado(S.nota);
  else if (abertas.length) estado('Mais de uma pessoa está transmitindo. Escolha quem assistir.');
  else if (todos.length) estado('A transmissão está fechada para quem não está na sala.');
  else estado(S.nota || 'Ninguém está transmitindo agora. Quando alguém começar, aparece aqui.');
}

function botao(texto) {
  const b = document.createElement('button');
  b.type = 'button';
  b.textContent = texto;
  return b;
}

// Monta a tela de uma transmissão: vídeo + legenda (nome, estado, botões). Nomes entram só como texto
function criarTela(id) {
  const fig = document.createElement('figure');
  fig.className = 'tela';
  const video = document.createElement('video');
  for (const a of ['playsinline', 'autoplay']) video.setAttribute(a, '');
  const legenda = document.createElement('figcaption');
  const nome = document.createElement('strong');
  nome.textContent = nomeDe(id);
  const status = document.createElement('span');
  const tocar = botao('Toque para assistir');
  const cheia = botao('Tela cheia');
  const som = botao('Ligar o som da tela');
  tocar.hidden = cheia.hidden = som.hidden = true;
  const t = { fig, video, status, tocar, cheia, som };
  tocar.onclick = () => iniciar(t); // o toque libera o som que o iPhone recusou sozinho
  som.onclick = () => {
    video.muted = !video.muted;
    video.dataset.silenciada = video.muted ? '1' : ''; // se eu silenciei, uma reconexão não liga o som sozinha
    video.play().then(() => { tocar.hidden = true; }).catch(() => {});
    rotuloSom(t);
    Voz.tocar();
  };
  video.addEventListener('volumechange', () => rotuloSom(t)); // o player nativo do iPhone (tela cheia) também liga e desliga o som
  cheia.onclick = () => {
    const abrir = video.requestFullscreen || video.webkitRequestFullscreen || video.webkitEnterFullscreen; // no iPhone só o último existe
    try { Promise.resolve(abrir?.call(video)).catch(() => {}); } catch { /* o iPhone recusa antes de o vídeo ter começado */ }
  };
  video.addEventListener('webkitendfullscreen', () => { video.play().catch(() => { tocar.hidden = false; }); }); // iPhone: ao sair do player nativo o vídeo pode ficar pausado
  legenda.append(nome, status, tocar, som, cheia);
  fig.append(video, legenda);
  fig.onclick = () => { S.destaque = id; destacar(); }; // tocar numa tela pequena a põe em destaque
  $('telas').append(fig);
  return t;
}

// Toca a tela com o som da transmissão, se ela tem áudio. O iPhone só libera o som depois de um toque: se recusar,
// toca muda e o botão "Ligar o som da tela" faz o resto
function iniciar(t) {
  const { video } = t;
  const fluxo = video.srcObject;
  const atual = () => video.srcObject === fluxo; // outra transmissão pode ter entrado na mesma tela enquanto o play() esperava
  video.muted = !temAudio(video) || video.dataset.silenciada === '1';
  video.play().catch(() => { if (!atual()) return; video.muted = true; return video.play(); })
    .then(() => { if (atual()) t.tocar.hidden = true; }, () => { if (atual()) t.tocar.hidden = false; })
    .finally(() => { if (!atual()) return; rotuloSom(t); Voz.tocar(); }); // a voz da conversa pode ter sido pausada pelo iPhone
}
function temAudio(video) { return !!video.srcObject?.getAudioTracks().length; }
function rotuloSom(t) {
  t.som.hidden = !temAudio(t.video);
  t.som.textContent = t.video.muted ? 'Ligar o som da tela' : 'Desligar o som da tela';
}

// Só uma tela fica grande; se a destacada saiu, a primeira que sobrou assume
function destacar() {
  if (!S.vistas.has(S.destaque)) S.destaque = S.vistas.keys().next().value ?? null;
  for (const [id, v] of S.vistas) v.fig.classList.toggle('destaque', id === S.destaque);
}

function assistir(id) {
  if (S.vistas.has(id)) return;
  S.nota = '';
  S.manual.delete(id);
  const pc = new RTCPeerConnection({ iceServers: S.ice });
  const v = { pc, cadeia: Promise.resolve(), timer: 0, ...criarTela(id) };
  S.vistas.set(id, v);
  S.destaque = id; // a que acabei de pedir fica grande
  destacar();
  v.status.textContent = 'Conectando…';
  pc.ontrack = (e) => {
    const fluxo = e.streams[0] || new MediaStream([e.track]);
    v.video.classList.add('ligado');
    v.cheia.hidden = false;
    if (v.video.srcObject !== fluxo) { v.video.srcObject = fluxo; iniciar(v); } // a faixa de áudio chega em outro evento da mesma tela
    else rotuloSom(v);
  };
  pc.onicecandidate = (e) => { if (e.candidate) sinalizar(id, { side: 'viewer', candidate: e.candidate }); };
  pc.onconnectionstatechange = () => {
    if (S.vistas.get(id) !== v) return;
    if (pc.connectionState === 'connected') { clearTimeout(v.timer); v.status.textContent = ''; }
    else if (pc.connectionState === 'failed') {
      v.status.textContent = 'A conexão falhou. Tentando de novo…';
      sinalizar(id, { side: 'viewer', restart: true });
      clearTimeout(v.timer); // o app desiste de reiniciar o ICE em 3 min: não fico esperando para sempre
      v.timer = setTimeout(() => {
        if (S.vistas.get(id) !== v || pc.connectionState === 'connected') return;
        parar(id, `Não consegui conectar com ${nomeDe(id)}. Toque em Assistir para tentar de novo.`, true);
        atualizar();
      }, 210000);
    }
    else if (pc.connectionState === 'disconnected') v.status.textContent = 'Conexão instável…';
  };
  v.timer = setTimeout(() => { if (S.vistas.get(id) === v && pc.connectionState !== 'connected') v.status.textContent = 'Ainda conectando… quem transmite pode estar sem conexão direta com você.'; }, 12000);
  sinalizar(id, { side: 'viewer', subscribe: true, once: false }); // once:false = vídeo comum, que o navegador entende
  atualizar();
}

// Mensagens de quem transmite: a oferta (também as novas, quando ele reinicia a conexão) e os candidatos
function sinal(from, d) {
  const v = S.vistas.get(from);
  if (!v || !d || typeof d !== 'object' || d.side !== 'sharer') return;
  if (d.unavailable) {
    const x = S.membros.get(from);
    if (x) x.sharing = false;
    parar(from, d.closed ? `A transmissão de ${nomeDe(from)} está fechada para quem não está na sala.` : `${nomeDe(from)} não está transmitindo agora.`);
    return atualizar();
  }
  v.cadeia = v.cadeia.then(async () => {
    if (S.vistas.get(from) !== v) return;
    if (typeof d.sdp?.sdp === 'string' && typeof d.sdp.type === 'string') {
      await v.pc.setRemoteDescription(d.sdp);
      await v.pc.setLocalDescription(await v.pc.createAnswer());
      sinalizar(from, { side: 'viewer', sdp: v.pc.localDescription });
    } else if (d.candidate && typeof d.candidate === 'object') {
      await v.pc.addIceCandidate(d.candidate);
    }
  }).catch((err) => console.error(err));
}

// Para de assistir uma transmissão (a sala continua): avisa quem transmite, fecha a conexão e tira a tela.
// lembrar: foi escolha minha (ou falha); sozinha ela não volta. Quem chama refaz a lista com atualizar()
function parar(id, texto = '', lembrar = false) {
  const v = S.vistas.get(id);
  if (!v) return;
  clearTimeout(v.timer);
  sinalizar(id, { side: 'viewer', unsubscribe: true });
  v.pc.close();
  v.video.srcObject = null;
  v.fig.remove();
  S.vistas.delete(id);
  if (lembrar) S.manual.add(id);
  S.nota = texto;
  destacar();
}

// Sai da sala. voltar: mostra a tela de entrada de novo
function sair(voltar = true) {
  const ws = S.ws;
  for (const id of [...S.vistas.keys()]) parar(id); // antes de zerar a lista: cada transmissor recebe o unsubscribe
  S.manual.clear();
  S.destaque = null;
  S.nota = '';
  estado('');
  if (S.conversar) { Voz.sair(); S.conversar = false; } // antes de fechar a conexão: avisa a sala que saí da voz
  for (const id of ['voz', 'mudo', 'ouvir', 'saida']) $(id).hidden = true;
  $('mudo').textContent = 'Silenciar microfone';
  $('saida').textContent = 'Trocar para o auricular';
  S.ws = null;
  S.membros = new Map();
  if (ws) { try { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'leave' })); ws.close(); } catch {} }
  $('entrarBtn').disabled = false;
  mostrar('entrar');
  if (voltar) aviso('');
}

$('form').onsubmit = (e) => {
  e.preventDefault();
  if ($('entrarBtn').disabled) return; // já está entrando (toque duplo ou Enter repetido)
  const codigo = $('codigo').value.trim().toUpperCase();
  const senha = $('senha').value;
  if (!$('conversar').checked) return conectar(codigo, senha);
  // O microfone se pede direto no toque (o iPhone só libera assim); só então entra na sala
  $('entrarBtn').disabled = true; // antes de pedir: dois toques não abrem dois microfones
  const mic = Voz.pedirMic();
  aviso('Pedindo o microfone…');
  mic.then(() => conectar(codigo, senha, true, $('nome').value.trim()), () => {
    $('entrarBtn').disabled = false;
    aviso('Não consegui usar o microfone. Libere nas permissões do navegador ou entre só para assistir.', true);
  });
};
$('conversar').onchange = () => { $('nomeLabel').hidden = !$('conversar').checked; };
if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) { // microfone só em página segura (HTTPS)
  $('conversar').disabled = true;
  $('avisoHttps').hidden = false;
  if (window.isSecureContext) $('avisoHttps').textContent = 'Este navegador não libera o microfone. Abra o endereço no Safari ou no Chrome, e não dentro de outro aplicativo.';
}
$('mudo').onclick = () => {
  const mudo = $('mudo').textContent === 'Silenciar microfone';
  Voz.mudo(mudo);
  $('mudo').textContent = mudo ? 'Ativar microfone' : 'Silenciar microfone';
};
$('ouvir').onclick = () => { Voz.tocar(); $('ouvir').hidden = true; };
$('saida').onclick = () => { $('saida').textContent = Voz.trocarSaida() ? 'Trocar para o auricular' : 'Trocar para o alto-falante'; };
// /ver#debug: mostra o estado real do áudio e da tela (o iPhone não deixa ver o console)
let timerDebug = 0;
function debug() {
  const ligado = location.hash === '#debug';
  $('debug').hidden = !ligado;
  clearInterval(timerDebug);
  if (!ligado) return;
  const desenhar = () => {
    const telas = [...S.vistas].map(([id, v]) => ({ id, conexao: v.pc.connectionState, pausada: v.video.paused, muda: v.video.muted, comAudio: temAudio(v.video) }));
    $('debug').textContent = JSON.stringify({ voz: Voz.diagnostico(), telas }, null, 1);
  };
  desenhar();
  timerDebug = setInterval(desenhar, 1000);
}
debug();
addEventListener('hashchange', debug);
$('sair').onclick = () => sair();
// Link de convite: .../ver#ABC234 já traz o código (o # nunca sai do aparelho, não vai para o servidor); falta só a senha
function codigoDoLink() {
  const m = !S.ws && /^#([A-HJ-NP-Z2-9]{6})$/i.exec(location.hash); // mesmas letras e números dos códigos do servidor
  if (!m) return;
  const dica = $('dicaEntrada');
  dica.dataset.base ??= dica.textContent;
  $('codigo').value = m[1].toUpperCase();
  dica.textContent = `Convite para a sala ${m[1].toUpperCase()}: falta só a senha. ${dica.dataset.base}`;
  $('senha').focus();
}
codigoDoLink();
addEventListener('hashchange', codigoDoLink);
// Fechou a aba ou saiu da página: avisa a sala na hora (senão quem transmite só percebe quando a conexão cai)
addEventListener('pagehide', () => sair(false));

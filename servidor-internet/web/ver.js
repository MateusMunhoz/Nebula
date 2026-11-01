'use strict';
// Assistir pelo navegador (docs/spec/assistir-no-navegador.md): entra na sala como espectador (só assiste, sem
// voz nem chat) e recebe a tela por WebRTC comum. O servidor é o mesmo do modo Internet (servidor-internet/server.js);
// quem transmite é o app, que já responde a { side: 'viewer', subscribe: true } com a oferta (renderer/transmitir.js).
const $ = (id) => document.getElementById(id);
const CLIENT = Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join('');

// ws: sala atual; ice: servidores do welcome; membros: id -> { name, sharing, shareInfo }; alvo: id de quem estou assistindo
// nota: por que parei de assistir (aparece enquanto ninguém mais transmite)
const S = { ws: null, ice: [], membros: new Map(), alvo: null, pc: null, cadeia: Promise.resolve(), timer: 0, nota: '', conversar: false };

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
      desenharVoz();
    }
    atualizar();
  } else if (m.type === 'error') {
    aviso(String(m.message || 'Não consegui entrar.'), true);
  } else if (m.type === 'member-joined') {
    S.membros.set(m.id, { id: m.id, name: m.name, sharing: !!m.sharing, shareInfo: m.shareInfo || null });
    atualizar();
  } else if (m.type === 'member-left') {
    S.membros.delete(m.id);
    if (m.id === S.alvo) parar('A transmissão terminou.');
    atualizar();
  } else if (m.type === 'share-state') {
    const x = S.membros.get(m.id) || { id: m.id, name: 'Alguém' };
    S.membros.set(m.id, { ...x, sharing: !!m.sharing, shareInfo: m.sharing ? m.info || null : null });
    if (m.id === S.alvo && (!m.sharing || m.info?.open === false)) parar(m.sharing ? 'A transmissão foi fechada para quem não está na sala.' : 'A transmissão terminou.');
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

// Mostra quem está transmitindo: um só entra direto; vários viram botões
function atualizar() {
  if (S.alvo) return;
  const lista = $('lista');
  lista.replaceChildren();
  const todos = [...S.membros.values()].filter((x) => x.sharing);
  const abertas = todos.filter((x) => x.shareInfo?.open !== false);
  if (abertas.length === 1) return assistir(abertas[0].id);
  for (const x of abertas) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = `Assistir ${x.name || 'Alguém'}`;
    b.onclick = () => assistir(x.id);
    lista.append(b);
  }
  if (abertas.length) estado('Mais de uma pessoa está transmitindo. Escolha quem assistir.');
  else if (todos.length) estado('A transmissão está fechada para quem não está na sala.');
  else estado(S.nota || 'Ninguém está transmitindo agora. Quando alguém começar, aparece aqui.');
}

function assistir(id) {
  parar('');
  S.nota = '';
  S.alvo = id;
  $('lista').replaceChildren();
  estado('Conectando…');
  const pc = new RTCPeerConnection({ iceServers: S.ice });
  S.pc = pc;
  S.cadeia = Promise.resolve();
  pc.ontrack = (e) => {
    const video = $('video');
    const fluxo = e.streams[0] || new MediaStream([e.track]);
    if (video.srcObject !== fluxo) video.srcObject = fluxo;
    video.classList.add('ligado');
    $('telaCheia').hidden = false;
    video.play().then(() => { $('tocar').hidden = true; }).catch(() => { $('tocar').hidden = false; }); // o iPhone pode exigir um toque
  };
  pc.onicecandidate = (e) => { if (e.candidate) sinalizar(id, { side: 'viewer', candidate: e.candidate }); };
  pc.onconnectionstatechange = () => {
    if (S.pc !== pc) return;
    if (pc.connectionState === 'connected') { clearTimeout(S.timer); estado(''); }
    else if (pc.connectionState === 'failed') {
      estado('A conexão falhou. Tentando de novo…');
      sinalizar(id, { side: 'viewer', restart: true });
      clearTimeout(S.timer); // o app desiste de reiniciar o ICE em 3 min: não fico esperando para sempre
      S.timer = setTimeout(() => { if (S.pc === pc && pc.connectionState !== 'connected') parar('Não consegui conectar. Toque em Sair e entre de novo.'); }, 210000);
    }
    else if (pc.connectionState === 'disconnected') estado('Conexão instável…');
  };
  S.timer = setTimeout(() => { if (S.pc === pc && pc.connectionState !== 'connected') estado('Ainda conectando… quem transmite pode estar sem conexão direta com você.'); }, 12000);
  sinalizar(id, { side: 'viewer', subscribe: true, once: false }); // once:false = vídeo comum, que o navegador entende
}

// Mensagens de quem transmite: a oferta (também as novas, quando ele reinicia a conexão) e os candidatos
function sinal(from, d) {
  const pc = S.pc;
  if (!pc || from !== S.alvo || !d || typeof d !== 'object' || d.side !== 'sharer') return;
  if (d.unavailable) {
    const x = S.membros.get(from);
    if (x) x.sharing = false;
    parar(d.closed ? 'A transmissão está fechada para quem não está na sala.' : 'Essa pessoa não está transmitindo agora.');
    return atualizar();
  }
  S.cadeia = S.cadeia.then(async () => {
    if (S.pc !== pc) return;
    if (typeof d.sdp?.sdp === 'string' && typeof d.sdp.type === 'string') {
      await pc.setRemoteDescription(d.sdp);
      await pc.setLocalDescription(await pc.createAnswer());
      sinalizar(from, { side: 'viewer', sdp: pc.localDescription });
    } else if (d.candidate && typeof d.candidate === 'object') {
      await pc.addIceCandidate(d.candidate);
    }
  }).catch((err) => console.error(err));
}

// Para de assistir (a sala continua): avisa quem transmite, fecha a conexão e limpa o vídeo
function parar(texto) {
  clearTimeout(S.timer);
  if (S.alvo) sinalizar(S.alvo, { side: 'viewer', unsubscribe: true });
  S.pc?.close();
  S.pc = null;
  S.alvo = null;
  S.nota = texto;
  const video = $('video');
  video.srcObject = null;
  video.classList.remove('ligado');
  $('tocar').hidden = true;
  $('telaCheia').hidden = true;
  estado(texto);
}

// Sai da sala. voltar: mostra a tela de entrada de novo
function sair(voltar = true) {
  const ws = S.ws;
  parar('');
  if (S.conversar) { Voz.sair(); S.conversar = false; } // antes de fechar a conexão: avisa a sala que saí da voz
  for (const id of ['voz', 'mudo', 'ouvir']) $(id).hidden = true;
  $('mudo').textContent = 'Silenciar microfone';
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
$('sair').onclick = () => sair();
$('tocar').onclick = () => { $('video').play().then(() => { $('tocar').hidden = true; }).catch(() => {}); };
$('telaCheia').onclick = () => {
  const v = $('video');
  const abrir = v.requestFullscreen || v.webkitRequestFullscreen || v.webkitEnterFullscreen; // no iPhone só o último existe
  try { Promise.resolve(abrir?.call(v)).catch(() => {}); } catch { /* o iPhone recusa antes de o vídeo ter começado */ }
};
// Fechou a aba ou saiu da página: avisa a sala na hora (senão quem transmite só percebe quando a conexão cai)
addEventListener('pagehide', () => sair(false));

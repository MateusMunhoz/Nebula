'use strict';
// Voz do convidado pelo navegador (docs/spec/convidado-web.md): o mesmo protocolo de voice.js do app (side:'voice'),
// numa versão mínima. Malha WebRTC com cada pessoa da voz geral; quem tem o MENOR id numérico oferece.
// Mensagem de entrada: voice-state { session, channel, muted, deafened }; sinais: signal { side:'voice', session,
// targetSession, call, sdp | candidate }. Só entra em página segura (HTTPS), onde o navegador libera o microfone.
const Voz = (() => {
  const uuid = () => crypto.randomUUID?.() || Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0'))
    .join('').replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, '$1-$2-$3-$4-$5'); // iOS antigo não tem randomUUID
  const S = {
    enviar: null, aoMudar: () => {}, perdeuMic: () => {}, ice: [], meuId: '', sessao: '', canal: '', mudo: false, eco: false,
    stream: null, membros: new Map(), pares: new Map(), saida: 0, ctx: null,
  };

  // Por onde a voz dos outros sai. No iPhone, com o microfone aberto, o som pode ir para o auricular e não para o
  // alto-falante; sem como saber qual técnica resolve em cada iOS, o botão da página alterna entre elas (spec: som pelo auricular).
  // sessao: valor de navigator.audioSession.type (Safari 16.4+); como: onde tocar ('video' ou 'webaudio'; sem isso, <audio>)
  const MODOS = [
    { nome: 'padrão' },
    { nome: 'chamada', sessao: 'play-and-record' },
    { nome: 'vídeo', como: 'video' },
    { nome: 'AudioContext', como: 'webaudio' },
    { nome: 'reprodução (pode calar o microfone)', sessao: 'playback' },
  ];
  const modoOk = (m) => !m.sessao || !!navigator.audioSession;

  function desligarSaida(par) {
    par.audio?.remove();
    par.audio = null;
    try { par.fonte?.disconnect(); } catch { /* já solta */ }
    par.fonte = null;
  }

  function ligarSaida(par) {
    desligarSaida(par);
    if (!par.fluxo) return;
    if (MODOS[S.saida].como === 'webaudio' && S.ctx) {
      par.fonte = S.ctx.createMediaStreamSource(par.fluxo);
      par.fonte.connect(S.ctx.destination);
      return;
    }
    const el = document.createElement(MODOS[S.saida].como === 'video' ? 'video' : 'audio');
    el.autoplay = true;
    el.playsInline = true;
    el.className = 'saida-voz';
    el.srcObject = par.fluxo;
    document.body.append(el);
    par.audio = el;
    el.play().catch(() => S.aoMudar({ precisaToque: true })); // o iPhone pode exigir um toque
  }

  // Passa para a próxima técnica (chamado direto no toque: o AudioContext e o iPhone só liberam assim). Devolve o nome
  function proximaSaida() {
    do { S.saida = (S.saida + 1) % MODOS.length; } while (!modoOk(MODOS[S.saida]));
    aplicarSaida();
    return MODOS[S.saida].nome;
  }

  function aplicarSaida() {
    const m = MODOS[S.saida];
    try { if (navigator.audioSession) navigator.audioSession.type = m.sessao || 'auto'; } catch { /* sem suporte */ }
    if (m.como === 'webaudio' && !S.ctx) { const C = window.AudioContext || window.webkitAudioContext; if (C) S.ctx = new C(); }
    S.ctx?.resume?.().catch(() => {});
    for (const par of S.pares.values()) ligarSaida(par);
  }

  // Pede o microfone. Tem que ser chamado direto no toque do usuário (o iPhone só libera assim)
  function pedirMic() {
    return navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } })
      .then((stream) => {
        S.stream?.getTracks().forEach((t) => t.stop()); // pedido antigo que sobrou: o indicador do microfone não fica ligado à toa
        S.stream = stream;
        // Ligação, bloqueio de tela ou outro app no iPhone encerram o microfone: a página avisa e sai
        stream.getAudioTracks().forEach((t) => { t.onended = () => { if (S.stream === stream) S.perdeuMic(); }; });
      });
  }

  function entrar({ enviar, meuId, membros, ice, aoMudar, aoPerderMic }) {
    S.enviar = enviar; S.meuId = String(meuId); S.ice = Array.isArray(ice) ? ice : []; S.aoMudar = aoMudar || (() => {});
    S.perdeuMic = aoPerderMic || (() => {});
    S.sessao = uuid(); S.canal = ''; S.eco = false; S.mudo = false;
    S.membros = new Map();
    for (const x of Array.isArray(membros) ? membros : []) guardar(x.id, x.name, x.voiceSession, x.voiceChannel, x.muted);
    anunciar();
  }

  function guardar(id, name, session, channel, muted) {
    S.membros.set(String(id), { name: String(name || 'Alguém'), session: typeof session === 'string' ? session : '', channel: String(channel || ''), muted: muted === true });
  }
  function anunciar() { S.enviar({ type: 'voice-state', session: S.sessao, channel: S.canal, muted: S.mudo, deafened: false }); }

  // Quem eu devo ter conectado agora: tem sessão e está no meu canal. Se meu id é menor, eu ofereço; senão espero a oferta
  function sincronizar() {
    if (!S.eco) return;
    for (const [id, m] of S.membros) {
      if (id === S.meuId || !m.session || m.channel !== S.canal) continue;
      const par = S.pares.get(id);
      if (par && par.alvo === m.session) continue;
      if (par) fechar(id);
      if (Number(S.meuId) < Number(id)) criar(id, m.session, true);
    }
    S.aoMudar();
  }

  function sinalizar(id, par, extra) {
    S.enviar({ type: 'signal', to: id, data: { side: 'voice', session: S.sessao, targetSession: par.alvo, call: par.call, ...extra } });
  }

  function criar(id, alvo, oferecer, call) {
    const pc = new RTCPeerConnection({ iceServers: S.ice });
    const par = { id, pc, alvo, call: call || uuid(), fila: [], cadeia: Promise.resolve(), timer: 0, timerDesc: 0, audio: null, fonte: null, fluxo: null };
    S.pares.set(id, par);
    for (const t of S.stream.getTracks()) pc.addTrack(t, S.stream);
    pc.ontrack = (e) => {
      if (par.fluxo) return;
      par.fluxo = e.streams[0] || new MediaStream([e.track]);
      ligarSaida(par);
    };
    pc.onicecandidate = (e) => { if (e.candidate) sinalizar(id, par, { candidate: e.candidate }); };
    pc.onconnectionstatechange = () => {
      if (S.pares.get(id) !== par) return;
      if (pc.connectionState === 'connected') { clearTimeout(par.timer); clearTimeout(par.timerDesc); return S.aoMudar(); }
      if (pc.connectionState === 'failed') refazer(id, par);
      else if (pc.connectionState === 'disconnected') { clearTimeout(par.timerDesc); par.timerDesc = setTimeout(() => refazer(id, par), 5000); }
    };
    par.timer = setTimeout(() => { if (pc.connectionState !== 'connected') refazer(id, par); }, 20000); // não conectou em 20 s
    if (oferecer) {
      par.cadeia = par.cadeia.then(async () => {
        await pc.setLocalDescription(await pc.createOffer());
        sinalizar(id, par, { sdp: pc.localDescription });
      }).catch(console.error);
    }
    return par;
  }

  // Só o menor id refaz (como no app); o outro lado espera a oferta nova, com a conexão atual de pé até ela chegar.
  // forcar: o app pediu (atraso alto), mesmo com a conexão de pé
  function refazer(id, par, forcar = false) {
    if (S.pares.get(id) !== par || Number(S.meuId) > Number(id)) return;
    if (!forcar && par.pc.connectionState === 'connected') return;
    fechar(id);
    if (S.membros.has(id)) sincronizar();
  }

  function fechar(id) {
    const par = S.pares.get(id);
    if (!par) return;
    S.pares.delete(id);
    clearTimeout(par.timer);
    clearTimeout(par.timerDesc);
    try { par.pc.close(); } catch { /* já fechada */ }
    desligarSaida(par);
  }
  function fecharTodos() { for (const id of [...S.pares.keys()]) fechar(id); }

  // Sinal de voz de outra pessoa: valida como o app (sessões, canal, quem oferece) antes de usar
  function sinal(from, d) {
    if (!d || d.side !== 'voice' || !S.sessao || typeof d.call !== 'string' || !d.call) return;
    const m = S.membros.get(from);
    if (!m || !m.session || d.targetSession !== S.sessao || d.session !== m.session || m.channel !== S.canal) return;
    const dele = Number(from) < Number(S.meuId); // ele é o menor id: só ele oferece
    if (d.refazer === true && !d.sdp && !d.candidate) { // o app pediu para refazer (atraso da voz alto): quem refaz é o menor id
      const par = S.pares.get(from);
      if (par && par.call === d.call) refazer(from, par, true);
      return;
    }
    if (d.sdp?.type === 'offer') {
      if (!dele || typeof d.sdp.sdp !== 'string') return;
      let par = S.pares.get(from);
      if (!par || par.call !== d.call) { fechar(from); par = criar(from, m.session, false, d.call); }
      par.cadeia = par.cadeia.then(async () => {
        await par.pc.setRemoteDescription(d.sdp);
        for (const c of par.fila.splice(0)) await par.pc.addIceCandidate(c).catch(() => {});
        await par.pc.setLocalDescription(await par.pc.createAnswer());
        sinalizar(from, par, { sdp: par.pc.localDescription });
      }).catch(console.error);
    } else if (d.sdp?.type === 'answer') {
      const par = S.pares.get(from);
      if (dele || !par || par.call !== d.call || typeof d.sdp.sdp !== 'string') return;
      par.cadeia = par.cadeia.then(async () => {
        await par.pc.setRemoteDescription(d.sdp);
        for (const c of par.fila.splice(0)) await par.pc.addIceCandidate(c).catch(() => {});
      }).catch(console.error);
    } else if (d.candidate && typeof d.candidate === 'object') {
      const par = S.pares.get(from);
      if (!par || par.call !== d.call) return;
      par.cadeia = par.cadeia.then(async () => {
        if (par.pc.remoteDescription) await par.pc.addIceCandidate(d.candidate);
        else if (par.fila.length < 128) par.fila.push(d.candidate);
      }).catch(() => {});
    }
  }

  // Mensagens da sala que interessam à voz (as outras o ver.js trata)
  function receber(m) {
    if (!S.sessao) return;
    if (m.type === 'member-joined') { guardar(m.id, m.name, m.voiceSession, m.voiceChannel, m.muted); sincronizar(); }
    else if (m.type === 'member-left') { fechar(String(m.id)); S.membros.delete(String(m.id)); S.aoMudar(); }
    else if (m.type === 'signal') sinal(String(m.from), m.data);
    else if (m.type === 'voice-state') {
      const id = String(m.id);
      if (id === S.meuId) { // o eco do meu (ou o servidor me mudou de canal)
        if (m.session !== S.sessao) return;
        S.eco = true;
        const canal = String(m.channel || '');
        if (canal !== S.canal) { S.canal = canal; fecharTodos(); }
        return sincronizar();
      }
      const antes = S.membros.get(id);
      guardar(id, antes?.name, m.session, m.channel, m.muted);
      if (antes && (antes.session !== (m.session || '') || antes.channel !== String(m.channel || ''))) fechar(id);
      sincronizar();
    }
  }

  function mudo(sim) {
    S.mudo = !!sim;
    S.stream?.getAudioTracks().forEach((t) => { t.enabled = !S.mudo; });
    if (S.sessao) anunciar();
  }

  // Quem está na conversa (para a lista da página)
  function lista() {
    return [...S.membros]
      .filter(([id, m]) => id !== S.meuId && m.session && m.channel === S.canal)
      .map(([id, m]) => ({ id, name: m.name, mudo: m.muted, conectado: S.pares.get(id)?.pc.connectionState === 'connected' }));
  }

  function tocar() {
    S.ctx?.resume?.().catch(() => {});
    for (const p of S.pares.values()) p.audio?.play().catch(() => {});
  }

  function sair() {
    if (S.sessao && S.enviar) { try { S.enviar({ type: 'voice-state', session: '', channel: '', muted: false, deafened: false }); } catch { /* sem conexão */ } }
    fecharTodos();
    S.stream?.getTracks().forEach((t) => t.stop());
    S.stream = null;
    S.sessao = '';
    S.eco = false;
    S.membros = new Map();
    S.saida = 0; // a próxima entrada volta ao padrão
    try { if (navigator.audioSession) navigator.audioSession.type = 'auto'; } catch { /* sem suporte */ }
    S.ctx?.close?.().catch(() => {});
    S.ctx = null;
  }

  return { pedirMic, entrar, receber, mudo, lista, tocar, proximaSaida, sair, ativo: () => !!S.sessao };
})();

'use strict';
// Duas conexões, cada uma com um par de pontas na mesma página: uma leva áudio (ruído estéreo, que obriga o Opus a usar
// os 192 kbps, como a voz do app) e a outra vídeo (ruído em 1280x720 a 30 qps, pedindo até 6 Mbps, como a tela).
// Com soPonte, as duas só podem usar o TURN (iceTransportPolicy 'relay').
const cfg = JSON.parse(decodeURIComponent(location.hash.slice(1)) || '{}');
const conf = { iceServers: cfg.iceServers || [], iceTransportPolicy: cfg.soPonte ? 'relay' : 'all' };
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

// O mesmo ajuste do renderer/rtc.js (enhanceOpus)
function enhanceOpus(sdp) {
  const m = sdp.match(/a=rtpmap:(\d+) opus\/48000\/2/i);
  if (!m) return sdp;
  return sdp.replace(new RegExp(`a=fmtp:${m[1]} ([^\\r\\n]*)`), (line, params) =>
    params.includes('stereo=1') ? line : `a=fmtp:${m[1]} ${params};stereo=1;sprop-stereo=1;maxaveragebitrate=192000`);
}

function trilhaAudio() {
  const ctx = new AudioContext({ sampleRate: 48000 });
  const buf = ctx.createBuffer(2, 48000 * 2, 48000);
  for (let c = 0; c < 2; c++) { const d = buf.getChannelData(c); for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * 0.5; }
  const fonte = ctx.createBufferSource();
  fonte.buffer = buf;
  fonte.loop = true;
  const destino = ctx.createMediaStreamDestination();
  destino.channelCount = 2;
  fonte.connect(destino);
  fonte.start();
  return destino.stream.getAudioTracks()[0];
}

function trilhaVideo() {
  const canvas = document.getElementById('tela');
  const g = canvas.getContext('2d');
  const img = g.createImageData(canvas.width, canvas.height);
  const px = new Uint32Array(img.data.buffer);
  setInterval(() => {
    for (let i = 0; i < px.length; i++) px[i] = (Math.random() * 0xffffff) | 0xff000000;
    g.putImageData(img, 0, 0);
  }, 33);
  return canvas.captureStream(30).getVideoTracks()[0];
}

async function medirPar(trilha) {
  const a = new RTCPeerConnection(conf), b = new RTCPeerConnection(conf);
  a.onicecandidate = (e) => e.candidate && b.addIceCandidate(e.candidate).catch(() => {});
  b.onicecandidate = (e) => e.candidate && a.addIceCandidate(e.candidate).catch(() => {});
  const sender = a.addTrack(trilha, new MediaStream([trilha]));
  const oferta = await a.createOffer();
  oferta.sdp = enhanceOpus(oferta.sdp);
  await a.setLocalDescription(oferta);
  await b.setRemoteDescription(oferta);
  const resposta = await b.createAnswer();
  resposta.sdp = enhanceOpus(resposta.sdp);
  await b.setLocalDescription(resposta);
  await a.setRemoteDescription(resposta);
  if (trilha.kind === 'video') {
    const p = sender.getParameters();
    p.encodings = p.encodings?.length ? p.encodings : [{}];
    p.encodings[0].maxBitrate = 6000000;
    await sender.setParameters(p).catch(() => {});
  }
  const r = { tipo: trilha.kind, conectou: false, kbps: 0, par: '', estado: '' };
  for (let i = 0; i < 100 && !['connected', 'completed'].includes(b.iceConnectionState); i++) {
    if (b.iceConnectionState === 'failed') break;
    await espera(100);
  }
  r.estado = b.iceConnectionState;
  r.conectou = ['connected', 'completed'].includes(b.iceConnectionState);
  if (!r.conectou) { a.close(); b.close(); return r; }

  // Bytes recebidos a cada segundo; a média descarta os 4 primeiros (o controle de banda ainda está subindo)
  const amostras = [];
  let antes = null;
  for (let s = 0; s < cfg.segundos; s++) {
    await espera(1000);
    const stats = await b.getStats();
    let bytes = 0;
    stats.forEach((x) => {
      if (x.type === 'inbound-rtp' && x.kind === trilha.kind) { bytes = x.bytesReceived; if (x.kind === 'video') { r.qps = x.framesPerSecond || 0; r.largura = x.frameWidth || 0; } }
      if (x.type === 'candidate-pair' && x.nominated && x.state === 'succeeded') {
        const l = stats.get(x.localCandidateId), rm = stats.get(x.remoteCandidateId);
        r.par = `${l?.candidateType}/${rm?.candidateType}`;
      }
    });
    if (antes !== null) amostras.push(((bytes - antes) * 8) / 1000);
    antes = bytes;
  }
  const uteis = amostras.slice(4);
  r.kbps = Math.round(uteis.reduce((s, x) => s + x, 0) / Math.max(1, uteis.length));
  r.kbpsMax = Math.round(Math.max(0, ...uteis));
  a.close();
  b.close();
  return r;
}

(async () => {
  try {
    const [audio, video] = await Promise.all([medirPar(trilhaAudio()), medirPar(trilhaVideo())]);
    console.log('RESULTADO ' + JSON.stringify({ modo: cfg.soPonte ? 'só pelo TURN' : 'direto', segundos: cfg.segundos, audio, video }));
  } catch (e) {
    console.log('RESULTADO ' + JSON.stringify({ erro: String(e?.message || e) }));
  }
})();

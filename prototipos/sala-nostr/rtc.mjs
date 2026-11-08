// WebRTC no Node para o protótipo (node-datachannel). No app isto é o RTCPeerConnection do renderer: aqui só serve para
// medir a entrada na sala (o canal "sala") entre dois PCs sem precisar do Electron.
import ndc from 'node-datachannel';

ndc.initLogger('Error', (_nivel, msg) => console.error('[rtc]', msg));

export const STUN_PADRAO = ['stun:stun.l.google.com:19302', 'stun:stun.cloudflare.com:3478'];

// Lista no formato do navegador ({ urls, username, credential }) para o do node-datachannel. O usuário do TURN
// temporário tem ':' ("validade:nome"), então vai no objeto, não na URL
export function paraNodeDataChannel(iceServers = []) {
  const out = [];
  for (const s of iceServers) {
    for (const url of [].concat(s?.urls || [])) {
      const m = /^(stun|turns?):([^:?]+)(?::(\d+))?(?:\?transport=(udp|tcp))?$/.exec(String(url));
      if (!m) continue;
      if (m[1] === 'stun') { out.push(`stun:${m[2]}:${m[3] || 3478}`); continue; }
      out.push({
        hostname: m[2], port: Number(m[3] || (m[1] === 'turns' ? 5349 : 3478)), username: String(s.username || ''), password: String(s.credential || ''),
        relayType: m[1] === 'turns' ? 'TurnTls' : m[4] === 'tcp' ? 'TurnTcp' : 'TurnUdp',
      });
    }
  }
  return out;
}

export function novaConexao(nome, { iceServers = STUN_PADRAO, soPonte = false } = {}) {
  return new ndc.PeerConnection(nome, { iceServers, iceTransportPolicy: soPonte ? 'relay' : 'all' });
}

// Espera reunir os candidatos (até limiteMs) e devolve o SDP completo, já com eles (sem trickle ICE).
// Chame antes de createDataChannel/setRemoteDescription, que é quando a negociação começa
export function sdpCompleto(pc, limiteMs = 3000) {
  return new Promise((resolve) => {
    let feito = false;
    const fim = () => {
      if (feito) return;
      feito = true;
      clearTimeout(timer);
      resolve(pc.localDescription()?.sdp || '');
    };
    const timer = setTimeout(fim, limiteMs);
    pc.onGatheringStateChange((s) => { if (s === 'complete') fim(); });
  });
}

// "2 host, 1 srflx": quantos candidatos de cada tipo o SDP leva (srflx = endereço de fora pelo STUN; relay = TURN)
export function contarCandidatos(sdp) {
  const tipos = {};
  for (const m of String(sdp).matchAll(/^a=candidate:.* typ (\w+)/gm)) tipos[m[1]] = (tipos[m[1]] || 0) + 1;
  return Object.entries(tipos).map(([t, n]) => `${n} ${t}`).join(', ') || 'nenhum';
}

export function parEscolhido(pc) {
  try {
    const p = pc.getSelectedCandidatePair();
    return p ? `${p.local.type}/${p.remote.type}` : '';
  } catch { return ''; }
}

export const encerrar = () => ndc.cleanup();

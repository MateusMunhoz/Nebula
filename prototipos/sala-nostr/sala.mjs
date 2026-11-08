// Fase 0 de docs/spec/sala-pelo-nostr.md: o código e o endereço da sala, os eventos cifrados e a conexão com os relays.
// Fora do pacote do app. Usa só o que o renderer do Electron também tem (WebCrypto, WebSocket), para virar código do
// app sem reescrever.
import { finalizeEvent, verifyEvent, getPublicKey } from 'nostr-tools/pure';
import * as nip44 from 'nostr-tools/nip44';

export const KIND = 25871; // provisório: faixa efêmera (20000–29999); conferir que nenhuma NIP usa antes de fixar
// Os que passaram em relays.mjs (28/10/2026). Fora: relay.damus.io (bane numa rajada de 10), relay.nostr.net (perde
// eventos na rajada), relay.nostr.band (não conectou)
export const RELAYS_PADRAO = ['wss://nos.lol', 'wss://relay.primal.net', 'wss://relay.snort.social', 'wss://nostr.mom', 'wss://offchain.pub'];
export const MAX_CONTEUDO = 16 * 1024; // conteúdo cifrado de um evento
export const MAX_IDADE_S = 60;         // evento mais velho que isso é descartado (e é o prazo da tag expiration)
export const ITERACOES = 210000;       // PBKDF2 do endereço da sala

const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'; // sem I, L, O, U: não se confundem ditando
export const agora = () => Math.floor(Date.now() / 1000);
export const hex = (bytes) => Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');

// 16 caracteres (80 bits) em grupos de 4: XXXX-XXXX-XXXX-XXXX
export function gerarCodigo() {
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  let valor = 0, bits = 0, s = '';
  for (const b of bytes) {
    valor = ((valor << 8) | b) & 0xfff;
    bits += 8;
    while (bits >= 5) { bits -= 5; s += CROCKFORD[(valor >> bits) & 31]; }
  }
  return s.match(/.{4}/g).join('-');
}

// Aceita minúsculas, espaços e traços; O vira 0, I e L viram 1 (quem dita confunde). Devolve os 16 caracteres ou ''
export function normalizarCodigo(codigo) {
  const s = String(codigo || '').toUpperCase().replace(/[\s-]/g, '').replace(/O/g, '0').replace(/[IL]/g, '1');
  return /^[0-9A-HJKMNP-TV-Z]{16}$/.test(s) ? s : '';
}

// O endereço da sala: quem tem o código e a senha chega à mesma chave secp256k1; a pública (pk) é o endereço nos relays
export async function derivarSala(codigo, senha, iteracoes = ITERACOES) {
  const norm = normalizarCodigo(codigo);
  if (!norm) throw new Error('Código inválido.');
  const enc = new TextEncoder();
  const base = await crypto.subtle.importKey('raw', enc.encode(String(senha)), 'PBKDF2', false, ['deriveBits']);
  let sk = new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode('nebula-sala-v1:' + norm), iterations: iteracoes }, base, 256));
  for (let i = 0; i < 8; i++) {
    try { return { sk, pk: getPublicKey(sk) }; } // fora da curva (chance desprezível): deriva de novo com contador
    catch { sk = new Uint8Array(await crypto.subtle.digest('SHA-256', new Uint8Array([...sk, i]))); }
  }
  throw new Error('Não deu para derivar a chave da sala.');
}

// Evento efêmero cifrado (NIP-44) de skRemetente para pkDestino, que expira em MAX_IDADE_S
export function montarEvento(conteudo, skRemetente, pkDestino) {
  const t = agora();
  const content = nip44.encrypt(JSON.stringify(conteudo), nip44.getConversationKey(skRemetente, pkDestino));
  return finalizeEvent({ kind: KIND, created_at: t, tags: [['p', pkDestino], ['expiration', String(t + MAX_IDADE_S)]], content }, skRemetente);
}

// Abre um evento que chegou para pkDestino. Devolve { de, conteudo } ou null: o que não confere é descartado calado
export function abrirEvento(ev, skDestino, pkDestino, agoraS = agora()) {
  if (!ev || typeof ev !== 'object' || ev.kind !== KIND) return null;
  if (typeof ev.content !== 'string' || ev.content.length > MAX_CONTEUDO) return null;
  if (!Number.isInteger(ev.created_at) || Math.abs(agoraS - ev.created_at) > MAX_IDADE_S) return null;
  if (!Array.isArray(ev.tags) || !ev.tags.some((t) => Array.isArray(t) && t[0] === 'p' && t[1] === pkDestino)) return null;
  if (!verifyEvent(ev)) return null;
  try {
    const conteudo = JSON.parse(nip44.decrypt(ev.content, nip44.getConversationKey(skDestino, ev.pubkey)));
    return conteudo && typeof conteudo === 'object' && !Array.isArray(conteudo) ? { de: ev.pubkey, conteudo } : null;
  } catch { return null; }
}

const sdpValido = (sdp) => typeof sdp === 'string' && sdp.length <= 12000 && sdp.startsWith('v=0');
export const validarEntrar = (c) => c?.t === 'entrar' && c.v === 1 && /^[0-9a-f]{32}$/.test(String(c.n)) && sdpValido(c.sdp);
export const validarResposta = (c, n) => c?.n === n && c.v === 1
  && ((c.t === 'resposta' && sdpValido(c.sdp)) || (c.t === 'recusa' && typeof c.motivo === 'string' && c.motivo.length <= 40));

// Um relay (NIP-01): publicar com a confirmação OK, assinar e cancelar
export class Relay {
  constructor(url) { this.url = url; this.ws = null; this.pendentes = new Map(); this.subs = new Map(); this.avisos = []; }

  conectar(timeoutMs = 5000) {
    const t0 = performance.now();
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(this.url);
      const timer = setTimeout(() => { try { ws.close(); } catch {} reject(new Error('tempo esgotado')); }, timeoutMs);
      ws.onopen = () => { clearTimeout(timer); this.ws = ws; resolve(Math.round(performance.now() - t0)); };
      ws.onerror = () => { clearTimeout(timer); reject(new Error('falha ao conectar')); };
      ws.onclose = () => {
        clearTimeout(timer);
        if (this.ws === ws) this.ws = null;
        for (const p of this.pendentes.values()) p({ ok: false, msg: 'conexão fechou' });
        this.pendentes.clear();
      };
      ws.onmessage = (e) => this.#mensagem(e.data);
    });
  }

  #mensagem(raw) {
    let m;
    try { m = JSON.parse(raw); } catch { return; }
    if (!Array.isArray(m)) return;
    const s = this.subs.get(m[1]);
    if (m[0] === 'OK') {
      const p = this.pendentes.get(m[1]);
      if (p) { this.pendentes.delete(m[1]); p({ ok: m[2] === true, msg: String(m[3] || '') }); }
    } else if (m[0] === 'EVENT') s?.onEvento(m[2], this.url);
    else if (m[0] === 'EOSE') s?.onEose?.();
    else if (m[0] === 'CLOSED') { if (s) { this.subs.delete(m[1]); s.onFechada?.(String(m[2] || '')); } }
    else if (m[0] === 'NOTICE') this.avisos.push(String(m[1] || '').slice(0, 200));
  }

  publicar(ev, timeoutMs = 5000) {
    const t0 = performance.now();
    return new Promise((resolve) => {
      if (!this.ws || this.ws.readyState !== 1) return resolve({ ok: false, msg: 'sem conexão', ms: 0 });
      const timer = setTimeout(() => { this.pendentes.delete(ev.id); resolve({ ok: false, msg: 'sem confirmação (OK)', ms: timeoutMs }); }, timeoutMs);
      this.pendentes.set(ev.id, (r) => { clearTimeout(timer); resolve({ ...r, ms: Math.round(performance.now() - t0) }); });
      this.ws.send(JSON.stringify(['EVENT', ev]));
    });
  }

  assinar(filtro, onEvento, { onEose, onFechada } = {}) {
    const id = Math.random().toString(36).slice(2, 10);
    this.subs.set(id, { onEvento, onEose, onFechada });
    try { this.ws?.send(JSON.stringify(['REQ', id, filtro])); } catch {}
    return id;
  }

  cancelar(id) { if (this.subs.delete(id)) { try { this.ws?.send(JSON.stringify(['CLOSE', id])); } catch {} } }
  fechar() { try { this.ws?.close(); } catch {} this.ws = null; }
}

// Vários relays ao mesmo tempo: publica em todos, escuta em todos e entrega cada evento uma vez só (pelo id)
export class Pool {
  constructor(urls) { this.relays = urls.map((u) => new Relay(u)); this.ativos = []; this.vistos = new Set(); }

  async conectar(timeoutMs = 5000) {
    const r = await Promise.allSettled(this.relays.map((x) => x.conectar(timeoutMs)));
    this.ativos = this.relays.filter((_, i) => r[i].status === 'fulfilled');
    return this.relays.map((x, i) => ({ url: x.url, ok: r[i].status === 'fulfilled', ms: r[i].value, erro: r[i].reason?.message }));
  }

  publicar(ev) { return Promise.all(this.ativos.map((r) => r.publicar(ev).then((res) => ({ url: r.url, ...res })))); }

  // Devolve { parar, pronto }: pronto resolve no primeiro EOSE (a assinatura já vale) ou em 1,5 s
  assinar(filtro, onEvento) {
    let avisar;
    const pronto = new Promise((r) => { avisar = r; setTimeout(r, 1500); });
    const ids = this.ativos.map((r) => [r, r.assinar(filtro, (ev, url) => {
      if (!ev || typeof ev.id !== 'string' || this.vistos.has(ev.id)) return;
      if (this.vistos.size > 5000) this.vistos.clear();
      this.vistos.add(ev.id);
      onEvento(ev, url);
    }, { onEose: () => avisar() })]);
    return { parar: () => ids.forEach(([r, id]) => r.cancelar(id)), pronto };
  }

  fechar() { this.relays.forEach((r) => r.fechar()); }
}

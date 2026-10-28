// Emissor de acesso ao TURN: GET /v1/turn → { iceServers, ttl }. Sem estado e sem dados pessoais: só um usuário
// temporário (o mesmo esquema do servidor-internet: "validade:nome" + HMAC-SHA1 com o static-auth-secret do coturn).
// Na VPS: TURN_SECRET=… TURN_HOST=turn.exemplo.duckdns.org node emissor.mjs (atrás do Caddy, com TRUST_PROXY=1)
import http from 'node:http';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

export function credencial(segredo, nome, ttlS, agoraMs = Date.now()) {
  const username = `${Math.floor(agoraMs / 1000) + ttlS}:${nome}`;
  return { username, credential: crypto.createHmac('sha1', segredo).update(username).digest('base64') };
}

export function criarEmissor({ segredo, host, porta = 3479, ttlS = 4 * 3600, limitePorHora = 20, confiarProxy = false, agora = Date.now } = {}) {
  if (!segredo || String(segredo).length < 16) throw new Error('TURN_SECRET precisa ter pelo menos 16 caracteres.');
  if (!/^[a-z0-9.-]{1,253}$/i.test(String(host || ''))) throw new Error('TURN_HOST inválido.');
  const pedidos = new Map(); // ip → horários dos pedidos na última hora
  const limpeza = setInterval(() => {
    const t = agora();
    for (const [ip, xs] of pedidos) { const v = xs.filter((x) => t - x < 3600000); v.length ? pedidos.set(ip, v) : pedidos.delete(ip); }
  }, 600000);
  limpeza.unref();
  const servidor = http.createServer((req, res) => {
    const cab = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };
    let caminho = '';
    try { caminho = new URL(req.url, 'http://x').pathname; } catch {}
    if (req.method !== 'GET' || caminho !== '/v1/turn') return res.writeHead(404, cab).end('{"error":"not_found"}');
    // Atrás do Caddy: ele troca o X-Forwarded-For pelo IP de quem chamou (não confia no que o cliente manda)
    const ip = (confiarProxy && String(req.headers['x-forwarded-for'] || '').split(',')[0].trim()) || req.socket.remoteAddress || '';
    const t = agora();
    const xs = (pedidos.get(ip) || []).filter((x) => t - x < 3600000);
    if (xs.length >= limitePorHora) return res.writeHead(429, cab).end('{"error":"too_many"}');
    xs.push(t);
    pedidos.set(ip, xs);
    const { username, credential } = credencial(segredo, crypto.randomBytes(6).toString('hex'), ttlS, t);
    const urls = [`stun:${host}:${porta}`, `turn:${host}:${porta}?transport=udp`, `turn:${host}:${porta}?transport=tcp`];
    res.writeHead(200, cab).end(JSON.stringify({ iceServers: [{ urls, username, credential }], ttl: ttlS }));
  });
  servidor.on('close', () => clearInterval(limpeza));
  return servidor;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const servidor = criarEmissor({
    segredo: process.env.TURN_SECRET, host: process.env.TURN_HOST, porta: Number(process.env.TURN_PORT) || 3479,
    confiarProxy: process.env.TRUST_PROXY === '1',
  });
  const porta = Number(process.env.EMISSOR_PORTA) || 8790;
  servidor.listen(porta, '127.0.0.1', () => console.log(`Emissor de TURN em 127.0.0.1:${porta} (TURN ${process.env.TURN_HOST})`));
}

// Pesquisa de relays públicos: aceitam o kind efêmero com um conteúdo do tamanho de um SDP? Em quanto tempo o evento
// chega a outra conexão? O que acontece numa rajada? Rode com: node relays.mjs [wss://a,wss://b]
// Manda ~14 eventos efêmeros por relay, cifrados para uma chave descartável (nada fica guardado no relay).
import { writeFileSync } from 'node:fs';
import { generateSecretKey, getPublicKey } from 'nostr-tools/pure';
import { Relay, montarEvento, KIND, agora } from './sala.mjs';

const CANDIDATOS = [
  'wss://relay.damus.io', 'wss://nos.lol', 'wss://relay.primal.net', 'wss://relay.snort.social', 'wss://nostr.mom',
  'wss://relay.nostr.net', 'wss://offchain.pub', 'wss://nostr.oxtr.dev', 'wss://relay.nostr.band',
];
const urls = process.argv[2] ? process.argv[2].split(',') : CANDIDATOS;
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
const mediana = (xs) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : null; };
const enchimento = (n) => 'x'.repeat(n); // o SDP real com candidatos tem 2–4 KB

async function medir(url) {
  const r = { url, conecta: null, aceita: false, motivo: '', idaVolta: null, grande: '', rajada: '', avisos: [] };
  const a = new Relay(url), b = new Relay(url);
  try {
    r.conecta = await a.conectar(6000);
    await b.conectar(6000);
  } catch (e) { r.motivo = 'não conectou: ' + e.message; return r; }
  const kb = generateSecretKey(), KB = getPublicKey(kb), ka = generateSecretKey();
  const chegou = new Map(); // id → hora em que chegou na outra conexão
  let eose;
  const pronto = new Promise((res) => { eose = res; setTimeout(res, 2500); });
  b.assinar({ kinds: [KIND], '#p': [KB], since: agora() - 5 }, (ev) => chegou.set(ev.id, performance.now()), { onEose: () => eose(), onFechada: (m) => { r.motivo ||= 'assinatura fechada: ' + m; } });
  await pronto;

  const tempos = [];
  for (let i = 0; i < 3; i++) {
    const ev = montarEvento({ t: 'teste', i, pad: enchimento(3500) }, ka, KB);
    const t0 = performance.now();
    const pub = await a.publicar(ev);
    if (!pub.ok) { r.motivo ||= pub.msg; continue; }
    r.aceita = true;
    for (let k = 0; k < 30 && !chegou.has(ev.id); k++) await espera(100);
    if (chegou.has(ev.id)) tempos.push(Math.round(chegou.get(ev.id) - t0));
    await espera(300);
  }
  r.idaVolta = mediana(tempos);
  if (r.aceita && !tempos.length) r.motivo ||= 'aceitou, mas não entregou à outra conexão';

  // O maior pedido que o app manda: conteúdo perto do limite de 16 KB
  const grande = montarEvento({ t: 'teste', pad: enchimento(10500) }, ka, KB);
  const pg = await a.publicar(grande);
  for (let k = 0; k < 30 && pg.ok && !chegou.has(grande.id); k++) await espera(100);
  r.grande = pg.ok ? (chegou.has(grande.id) ? `ok (${grande.content.length} B)` : 'aceitou, não entregou') : 'recusou: ' + pg.msg;

  // Rajada: 10 pedidos de uma vez (uma troca de host com várias pessoas voltando)
  const evs = Array.from({ length: 10 }, (_, i) => montarEvento({ t: 'teste', i, pad: enchimento(3500) }, ka, KB));
  const res = await Promise.all(evs.map((ev) => a.publicar(ev)));
  await espera(2500);
  const entregues = evs.filter((ev) => chegou.has(ev.id)).length;
  const recusas = [...new Set(res.filter((x) => !x.ok).map((x) => x.msg))];
  r.rajada = `${res.filter((x) => x.ok).length}/10 aceitos, ${entregues}/10 entregues${recusas.length ? ' — ' + recusas.join('; ').slice(0, 120) : ''}`;
  r.avisos = [...a.avisos, ...b.avisos].slice(0, 3);
  a.fechar(); b.fechar();
  return r;
}

const resultados = await Promise.all(urls.map((u) => medir(u).catch((e) => ({ url: u, motivo: 'erro: ' + e.message }))));
console.log('\n| Relay | Conecta | Aceita o kind | Ida e volta (mediana) | ~14 KB | Rajada de 10 | Observação |');
console.log('|---|---|---|---|---|---|---|');
for (const r of resultados) {
  console.log(`| ${r.url} | ${r.conecta ?? '—'} ms | ${r.aceita ? 'sim' : 'não'} | ${r.idaVolta ?? '—'} ms | ${r.grande || '—'} | ${r.rajada || '—'} | ${[r.motivo, ...(r.avisos || [])].filter(Boolean).join(' / ').slice(0, 160)} |`);
}
writeFileSync(new URL('./resultados-relays.json', import.meta.url), JSON.stringify({ quando: new Date().toISOString(), kind: KIND, resultados }, null, 2));
process.exit(0);

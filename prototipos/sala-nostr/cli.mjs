// Entrar numa sala pelos relays, de ponta a ponta: pedido cifrado → resposta → canal "sala" aberto → ping/pong.
//   node cli.mjs host [--senha X]                     PC 1: cria a sala e mostra o código
//   node cli.mjs entrar XXXX-XXXX-XXXX-XXXX [--senha X] PC 2: entra e mede cada etapa
//   node cli.mjs local [--vezes 5]                    os dois neste PC (relays de verdade, conexão local)
// Opções: --relays wss://a,wss://b · --emissor https://… (acesso ao TURN) · --so-ponte (só pelo TURN, como o teste da tela)
import { generateSecretKey, getPublicKey } from 'nostr-tools/pure';
import { Pool, RELAYS_PADRAO, KIND, agora, hex, gerarCodigo, derivarSala, montarEvento, abrirEvento, validarEntrar, validarResposta } from './sala.mjs';
import { novaConexao, sdpCompleto, contarCandidatos, parEscolhido, paraNodeDataChannel, STUN_PADRAO, encerrar } from './rtc.mjs';

const args = process.argv.slice(2);
const opcao = (nome, padrao) => { const i = args.indexOf('--' + nome); return i >= 0 ? args[i + 1] : padrao; };
const tem = (nome) => args.includes('--' + nome);
const relays = opcao('relays', '') ? opcao('relays').split(',') : RELAYS_PADRAO;
const senha = opcao('senha', 'senha-do-teste');
const soPonte = tem('so-ponte');
const mediana = (xs) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : null; };
const ms = (t0) => Math.round(performance.now() - t0);

// STUN público + o TURN do emissor (GET /v1/turn → { iceServers }), se houver
async function listaIce() {
  const emissor = opcao('emissor', '');
  if (!emissor) return STUN_PADRAO;
  const r = await fetch(new URL('/v1/turn', emissor), { signal: AbortSignal.timeout(5000) });
  if (!r.ok) throw new Error('Emissor de TURN respondeu ' + r.status);
  const { iceServers } = await r.json();
  return [...STUN_PADRAO, ...paraNodeDataChannel(iceServers)];
}

// O host: escuta o endereço da sala e responde a cada pedido válido (até 10 por minuto, nonce não repete)
async function abrirHost({ codigo, pool, iceServers, log = console.log }) {
  const { sk, pk } = await derivarSala(codigo, senha);
  const vistos = new Set();
  let janela = [];
  const conexoes = new Set();
  const sub = pool.assinar({ kinds: [KIND], '#p': [pk], since: agora() - 5 }, async (ev) => {
    const aberto = abrirEvento(ev, sk, pk);
    if (!aberto || !validarEntrar(aberto.conteudo) || vistos.has(aberto.conteudo.n)) return;
    vistos.add(aberto.conteudo.n);
    const t = Date.now();
    janela = janela.filter((x) => t - x < 60000);
    if (janela.length >= 10) return log('pedido descartado: mais de 10 no último minuto');
    janela.push(t);
    const pc = novaConexao('host', { iceServers, soPonte });
    conexoes.add(pc);
    const pronto = sdpCompleto(pc);
    pc.onDataChannel((dc) => {
      dc.onMessage((m) => { if (m === 'ping') dc.sendMessage('pong'); });
      dc.onOpen(() => log(`convidado conectado (${parEscolhido(pc)})`));
      dc.onClosed(() => { pc.close(); conexoes.delete(pc); });
    });
    pc.setRemoteDescription(aberto.conteudo.sdp, 'offer');
    const sdp = await pronto;
    await pool.publicar(montarEvento({ t: 'resposta', v: 1, n: aberto.conteudo.n, sdp }, sk, aberto.de));
  });
  await sub.pronto;
  return { pk, fechar: () => { sub.parar(); for (const pc of conexoes) pc.close(); } };
}

// O convidado: mede derivar, reunir candidatos, pedido → resposta, resposta → canal aberto e o ping pelo canal
async function entrar({ codigo, pool, iceServers }) {
  const t0 = performance.now();
  const marcas = {};
  let t = performance.now();
  const { pk: P } = await derivarSala(codigo, senha);
  marcas.derivar = ms(t);
  const q = generateSecretKey(), Q = getPublicKey(q);
  const n = hex(crypto.getRandomValues(new Uint8Array(16)));

  const pc = novaConexao('convidado', { iceServers, soPonte });
  t = performance.now();
  const pronto = sdpCompleto(pc);
  const dc = pc.createDataChannel('sala', { ordered: true });
  let timerCanal;
  const aberto = new Promise((res, rej) => { dc.onOpen(res); timerCanal = setTimeout(() => rej(new Error('Achei a sala, mas o canal com o host não abriu.')), 10000); });
  aberto.catch(() => {}); // quem espera é o await lá embaixo; sem isso, uma falha antes dele derruba o processo
  try {
    const oferta = await pronto;
    marcas.reunir = ms(t);

    let deQualRelay = '', responder, desistir;
    const resposta = new Promise((res, rej) => { responder = res; desistir = rej; });
    const timer = setTimeout(() => { sub.parar(); desistir(new Error('Não achei a sala.')); }, 10000);
    const sub = pool.assinar({ kinds: [KIND], '#p': [Q], since: agora() - 5 }, (ev, url) => {
      if (ev.pubkey !== P) return;
      const a = abrirEvento(ev, q, Q);
      if (!a || !validarResposta(a.conteudo, n)) return;
      clearTimeout(timer);
      sub.parar();
      deQualRelay = url;
      responder(a.conteudo);
    });
    await sub.pronto;
    t = performance.now();
    void pool.publicar(montarEvento({ t: 'entrar', v: 1, n, sdp: oferta }, q, P));
    const r = await resposta;
    marcas.pedidoResposta = ms(t);
    if (r.t === 'recusa') throw new Error('O host recusou: ' + r.motivo);
    t = performance.now();
    pc.setRemoteDescription(r.sdp, 'answer');
    await aberto;
    marcas.canal = ms(t);
    marcas.total = ms(t0);

    const rtts = [];
    for (let i = 0; i < 5; i++) {
      const p0 = performance.now();
      await new Promise((res) => { dc.onMessage(() => res()); dc.sendMessage('ping'); });
      rtts.push(ms(p0));
    }
    return { marcas, par: parEscolhido(pc), rttCanal: mediana(rtts), deQualRelay, oferta: oferta.length, candidatosOferta: contarCandidatos(oferta), candidatosResposta: contarCandidatos(r.sdp) };
  } finally {
    clearTimeout(timerCanal);
    pc.close();
  }
}

async function conectarPool(nome) {
  const pool = new Pool(relays);
  const t0 = performance.now();
  const r = await pool.conectar(6000);
  console.log(`${nome}: ${pool.ativos.length}/${relays.length} relays em ${ms(t0)} ms${r.some((x) => !x.ok) ? ' (fora: ' + r.filter((x) => !x.ok).map((x) => x.url).join(', ') + ')' : ''}`);
  if (!pool.ativos.length) throw new Error('Não consegui falar com os relays.');
  return pool;
}

const imprimir = (r) => console.log(`entrou em ${r.marcas.total} ms — derivar ${r.marcas.derivar}, reunir ${r.marcas.reunir}, pedido→resposta ${r.marcas.pedidoResposta} (${r.deQualRelay}), canal ${r.marcas.canal} · par ${r.par} · ping pelo canal ${r.rttCanal} ms · oferta ${r.oferta} B · candidatos: oferta ${r.candidatosOferta}; resposta ${r.candidatosResposta}`);

const modo = args[0];
try {
  const iceServers = await listaIce();
  if (modo === 'host') {
    const codigo = opcao('codigo', '') || gerarCodigo();
    const pool = await conectarPool('host');
    await abrirHost({ codigo, pool, iceServers });
    console.log(`\nSala aberta. No outro PC:\n  node cli.mjs entrar ${codigo} --senha ${senha}${soPonte ? ' --so-ponte' : ''}\n(Ctrl+C fecha)`);
  } else if (modo === 'entrar') {
    const pool = await conectarPool('convidado');
    imprimir(await entrar({ codigo: args[1], pool, iceServers }));
    pool.fechar();
    encerrar();
    process.exit(0);
  } else if (modo === 'local') {
    const vezes = Number(opcao('vezes', 5)) || 5;
    const codigo = gerarCodigo();
    const poolHost = await conectarPool('host');
    const host = await abrirHost({ codigo, pool: poolHost, iceServers, log: () => {} });
    const totais = [], relaysMs = [];
    for (let i = 0; i < vezes; i++) {
      const pool = await conectarPool('convidado'); // conexão nova a cada vez, como outro PC
      try { const r = await entrar({ codigo, pool, iceServers }); imprimir(r); totais.push(r.marcas.total); relaysMs.push(r.marcas.pedidoResposta); }
      catch (e) { console.log('falhou:', e.message); }
      pool.fechar();
      await new Promise((r) => setTimeout(r, 1500));
    }
    console.log(`\n${totais.length}/${vezes} entradas · mediana total ${mediana(totais)} ms · mediana pedido→resposta ${mediana(relaysMs)} ms`);
    host.fechar();
    poolHost.fechar();
    encerrar();
    process.exit(0);
  } else {
    console.log('Use: node cli.mjs host | entrar <código> | local [--vezes N]');
    process.exit(1);
  }
} catch (e) {
  console.error('Erro:', e.message);
  encerrar();
  process.exit(1);
}

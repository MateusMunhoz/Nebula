// Escolher a música no YouTube dentro do app (main/youtube-escolher.js): só o id de um vídeo do YouTube sai do
// escolhedor; a página não sai do YouTube; vídeo que não deixa incorporar não entra.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { videoDaUrl, hostPermitido, uaLimpo, checarVideo, criarEscolhedor } = require('../main/youtube-escolher');

const ID = 'dQw4w9WgXcQ';

test('vídeo: watch, shorts, live, youtu.be e m.; o list e o tempo não atrapalham', () => {
  for (const url of [
    `https://www.youtube.com/watch?v=${ID}`,
    `https://www.youtube.com/watch?v=${ID}&list=RD${ID}&start_radio=1&pp=abc`,
    `https://youtube.com/watch?t=42&v=${ID}`,
    `https://m.youtube.com/watch?v=${ID}`,
    `https://www.youtube.com/shorts/${ID}`,
    `https://www.youtube.com/live/${ID}?si=x`,
    `https://youtu.be/${ID}?t=3`,
  ]) assert.equal(videoDaUrl(url), ID, url);
});

test('não é vídeo: outro site, host parecido, http, id errado, busca, canal, playlist', () => {
  for (const url of [
    `http://www.youtube.com/watch?v=${ID}`,
    `https://www.youtube.com.golpe.net/watch?v=${ID}`,
    `https://youtube.com@golpe.net/watch?v=${ID}`,
    `https://usuario@www.youtube.com/watch?v=${ID}`,
    `https://www.youtube.com:8443/watch?v=${ID}`,
    `https://golpe.net/?u=https://www.youtube.com/watch?v=${ID}`,
    `https://golpe.net/watch?v=${ID}`,
    'https://www.youtube.com/watch?v=dQw4w9WgXc',
    'https://www.youtube.com/watch?v=dQw4w9WgXcQQ',
    'https://www.youtube.com/watch?v=dQw4w9WgX<Q',
    `https://www.youtube.com/shorts/${ID}/extra`,
    'https://www.youtube.com/results?search_query=evidencias',
    'https://www.youtube.com/@canal',
    `https://www.youtube.com/playlist?list=PL${ID}`,
    `https://music.youtube.com/watch?v=${ID}`,
    `javascript:alert(1)//https://www.youtube.com/watch?v=${ID}`,
    '', null, 42,
  ]) assert.equal(videoDaUrl(url), '', String(url));
});

test('a página só navega pelo YouTube (e o aviso de cookies)', () => {
  assert.equal(hostPermitido('https://www.youtube.com/results?search_query=x'), true);
  assert.equal(hostPermitido('https://consent.youtube.com/m?continue=x'), true);
  assert.equal(hostPermitido('https://accounts.google.com/ServiceLogin'), false);
  assert.equal(hostPermitido('https://www.googleadservices.com/pagead/aclk'), false);
  assert.equal(hostPermitido('http://www.youtube.com/'), false);
  assert.equal(hostPermitido('https://www.youtube.com.golpe.net/'), false);
});

test('User-Agent sem Electron nem o nome do app', () => {
  const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) tela-p2p/1.20.9 Chrome/130.0.6723.191 Electron/33.4.11 Safari/537.36';
  assert.equal(uaLimpo(ua), 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.6723.191 Safari/537.36');
});

test('checar: 401/403/404 não entra; 200 traz o título limpo; sem resposta, deixa o player decidir', async () => {
  const resp = (status, corpo = '') => async () => new Response(corpo, { status });
  assert.deepEqual(await checarVideo(ID, { fetch: resp(401) }), { ok: false });
  assert.deepEqual(await checarVideo(ID, { fetch: resp(404) }), { ok: false });
  assert.deepEqual(await checarVideo(ID, { fetch: resp(200, JSON.stringify({ title: ' Evidências\n(Ao Vivo) ' })) }), { ok: true, titulo: 'Evidências (Ao Vivo)' });
  assert.equal(await checarVideo(ID, { fetch: resp(500) }), null);
  assert.equal(await checarVideo(ID, { fetch: async () => { throw new Error('sem rede'); } }), null);
  assert.equal(await checarVideo(ID, { fetch: resp(200, 'x'.repeat(70 * 1024)) }), null);
  let pediu = false;
  assert.deepEqual(await checarVideo('não é id', { fetch: async () => { pediu = true; } }), { ok: false });
  assert.equal(pediu, false);
});

// Um Electron de mentira: o bastante para seguir os eventos do webContents
function falso({ checar = async () => ({ ok: true, titulo: 'Música' }) } = {}) {
  const enviados = [];
  let wc = null, filhos = [];
  const historico = [];
  class WebContentsView {
    constructor(opts) {
      this.opts = opts;
      wc = Object.assign(new EventEmitter(), {
        destruido: false, mudo: false, parou: 0, carregou: [],
        isDestroyed() { return this.destruido; }, close() { this.destruido = true; },
        setAudioMuted(v) { this.mudo = v; }, setWindowOpenHandler(f) { this.abrir = f; },
        loadURL(u) { this.carregou.push(u); }, stop() { this.parou++; }, isLoading: () => false, focus() {}, reload() {},
        navigationHistory: { canGoBack: () => historico.length > 0, goBack: () => historico.push('voltou') },
      });
      this.webContents = wc;
    }
    setBounds(b) { this.bounds = b; }
    setVisible(v) { this.visivel = v; }
  }
  const ses = { limpou: [], clearStorageData(o) { this.limpou.push(o); return Promise.resolve(); }, setUserAgent() {}, setPermissionRequestHandler(f) { this.pedir = f; }, setPermissionCheckHandler(f) { this.checar = f; }, on(n, f) { this.download = f; } };
  const janela = {
    isDestroyed: () => false, getContentSize: () => [1200, 780], webContents: { getZoomFactor: () => 1.25, focus() {} },
    contentView: { addChildView: (v) => filhos.push(v), removeChildView: (v) => { filhos = filhos.filter((x) => x !== v); } },
  };
  const esc = criarEscolhedor({ WebContentsView, session: { fromPartition: (p) => { ses.particao = p; return ses; } }, app: { userAgentFallback: 'Mozilla/5.0 Electron/33' }, janela: () => janela, enviar: (m) => enviados.push(m), checar });
  return { esc, enviados, ses, wc: () => wc, filhos: () => filhos, historico };
}
const evento = () => ({ prevented: false, preventDefault() { this.prevented = true; } });
const espera = () => new Promise((r) => setImmediate(r));

test('abrir: sessão separada, sem preload, mudo, no lugar certo (com o zoom), e fechar destrói', () => {
  const f = falso();
  assert.deepEqual(f.esc.abrir({ x: 100, y: 80, w: 800, h: 500 }), { ok: true });
  const view = f.filhos()[0];
  assert.equal(f.ses.particao, 'yt-escolher');
  const wp = view.opts.webPreferences;
  assert.equal(wp.preload, undefined);
  assert.equal(wp.contextIsolation, true);
  assert.equal(wp.nodeIntegration, false);
  assert.equal(wp.sandbox, true);
  assert.equal(f.wc().mudo, true);
  assert.deepEqual(view.bounds, { x: 125, y: 100, width: 1000, height: 625 });
  let negou; f.ses.pedir(null, 'media', (v) => { negou = v; });
  assert.equal(negou, false);
  assert.equal(f.ses.checar(), false);
  const d = evento(); f.ses.download(d); assert.equal(d.prevented, true);
  f.esc.fechar();
  assert.equal(f.wc().isDestroyed(), true);
  assert.equal(f.filhos().length, 0);
  assert.deepEqual(f.ses.limpou, [{ storages: ['serviceworkers', 'cachestorage'] }]);
});

test('clique num vídeo (pushState): para a página e manda só o id, uma vez', async () => {
  const f = falso();
  f.esc.abrir({ x: 0, y: 0, w: 800, h: 500 });
  const wc = f.wc();
  wc.emit('did-navigate-in-page', evento(), 'https://www.youtube.com/results?search_query=x', true);
  wc.emit('did-start-navigation', evento(), `https://www.youtube.com/watch?v=${ID}`, true, true);
  wc.emit('did-navigate-in-page', evento(), `https://www.youtube.com/watch?v=${ID}`, true);
  await espera();
  assert.deepEqual(f.enviados.filter((m) => m.tipo === 'video'), [{ tipo: 'video', videoId: ID, titulo: 'Música' }]);
  assert.ok(wc.parou >= 1);
  // Quadro interno (anúncio) não escolhe
  wc.emit('did-start-navigation', evento(), 'https://www.youtube.com/watch?v=aaaaaaaaaaa', true, false);
  await espera();
  assert.equal(f.enviados.filter((m) => m.tipo === 'video').length, 1);
});

test('janela nova é sempre negada (mas se for vídeo, conta como escolha)', async () => {
  const f = falso();
  f.esc.abrir({ x: 0, y: 0, w: 800, h: 500 });
  assert.deepEqual(f.wc().abrir({ url: 'https://golpe.net/' }), { action: 'deny' });
  assert.deepEqual(f.wc().abrir({ url: `https://www.youtube.com/watch?v=${ID}` }), { action: 'deny' });
  await espera();
  assert.equal(f.enviados.find((m) => m.tipo === 'video')?.videoId, ID);
});

test('fora do YouTube não abre; o login do Google ganha aviso próprio', () => {
  const f = falso();
  f.esc.abrir({ x: 0, y: 0, w: 800, h: 500 });
  const fora = evento(); f.wc().emit('will-navigate', fora, 'https://golpe.net/');
  const login = evento(); f.wc().emit('will-navigate', login, 'https://accounts.google.com/ServiceLogin');
  const dentro = evento(); f.wc().emit('will-navigate', dentro, 'https://www.youtube.com/@canal');
  assert.equal(fora.prevented, true);
  assert.equal(login.prevented, true);
  assert.equal(dentro.prevented, false);
  assert.deepEqual(f.enviados.filter((m) => m.tipo === 'aviso').map((m) => m.motivo), ['fora', 'login']);
});

test('vídeo que não deixa incorporar: avisa e volta para a busca, sem mandar o id', async () => {
  const f = falso({ checar: async () => ({ ok: false }) });
  f.esc.abrir({ x: 0, y: 0, w: 800, h: 500 });
  f.historico.push('busca');
  f.wc().emit('did-navigate-in-page', evento(), `https://www.youtube.com/watch?v=${ID}`, true);
  await espera();
  assert.equal(f.enviados.some((m) => m.tipo === 'video'), false);
  assert.ok(f.enviados.some((m) => m.tipo === 'aviso' && m.motivo === 'incorporar'));
  assert.equal(f.historico.at(-1), 'voltou');
});

test('Esc na página do YouTube fecha', () => {
  const f = falso();
  f.esc.abrir({ x: 0, y: 0, w: 800, h: 500 });
  const e = evento();
  f.wc().emit('before-input-event', e, { type: 'keyDown', key: 'Escape' });
  assert.equal(e.prevented, true);
  assert.equal(f.wc().isDestroyed(), true);
  assert.deepEqual(f.enviados.at(-1), { tipo: 'fechou', motivo: 'esc' });
});

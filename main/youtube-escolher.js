'use strict';
// Escolher a música no próprio YouTube, dentro do app (renderer/youtube-escolher.js; spec: docs/spec/musica-youtube-e-fila.md).
// A página do YouTube roda numa WebContentsView, com sessão só dela (na memória), sem preload (não tem window.api), muda,
// sem janelas novas, downloads nem permissões, e sem sair do YouTube. O app não lê nem mexe na página: só olha o endereço
// para onde ela vai. Clicou num vídeo (/watch?v=, /shorts/, /live/, youtu.be), só o id de 11 caracteres vai para a página
// do app. O CSP do index.html não muda: a view é outro webContents.

const INICIO = 'https://www.youtube.com/?hl=pt-BR&gl=BR';
const OEMBED = 'https://www.youtube.com/oembed';
const PARTICAO = 'yt-escolher'; // sem "persist:": some ao fechar o app
const HOSTS_VIDEO = new Set(['www.youtube.com', 'youtube.com', 'm.youtube.com']);
const HOSTS_NAVEGAR = new Set([...HOSTS_VIDEO, 'consent.youtube.com']); // o aviso de cookies (Europa)
const ID = /^[\w-]{11}$/;
const LIMITE_JSON = 64 * 1024;
const MIN_W = 320, MIN_H = 240;

function urlSegura(url) {
  let u;
  try { u = new URL(String(url || '')); } catch { return null; }
  return u.protocol === 'https:' && !u.username && !u.password && !u.port ? u : null;
}
// O id do vídeo para onde a página foi, ou '' (busca, canal, playlist, outro site)
function videoDaUrl(url) {
  const u = urlSegura(url);
  if (!u) return '';
  let id = '';
  if (u.hostname === 'youtu.be') id = (u.pathname.match(/^\/([^/]+)\/?$/) || [])[1] || '';
  else if (HOSTS_VIDEO.has(u.hostname)) {
    if (u.pathname === '/watch' || u.pathname === '/watch/') id = u.searchParams.get('v') || '';
    else id = (u.pathname.match(/^\/(?:shorts|live)\/([^/]+)\/?$/) || [])[1] || '';
  }
  return ID.test(id) ? id : '';
}
// A página (quadro principal) pode ir para lá?
function hostPermitido(url) { const u = urlSegura(url); return !!u && HOSTS_NAVEGAR.has(u.hostname); }
// Sem "Electron/…" nem o nome do app: com eles o YouTube pode mostrar "navegador não suportado"
function uaLimpo(ua) {
  return String(ua || '').replace(/ ([A-Za-z][\w.-]*)\/\S+/g, (m, nome) => (['AppleWebKit', 'Chrome', 'Safari', 'Mobile', 'Version'].includes(nome) ? m : ''));
}
const limpar = (s, max) => (typeof s === 'string' ? s.replace(/[\x00-\x1f\x7f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max) : '');

// Antes de pôr: o oEmbed diz se o vídeo existe e deixa tocar fora do YouTube (401/403: não deixa; 404: privado ou
// removido). { ok: true, titulo } | { ok: false } | null (sem resposta: põe assim mesmo, o player de quem ouve avisa)
async function checarVideo(id, { oembed = OEMBED, fetch = globalThis.fetch } = {}) {
  if (!ID.test(String(id))) return { ok: false };
  try {
    const r = await fetch(`${oembed}?format=json&url=${encodeURIComponent(`https://www.youtube.com/watch?v=${id}`)}`,
      { redirect: 'error', signal: AbortSignal.timeout(6000) });
    if ([401, 403, 404].includes(r.status)) return { ok: false };
    if (!r.ok || Number(r.headers.get('content-length')) > LIMITE_JSON) return null;
    const texto = await r.text();
    if (texto.length > LIMITE_JSON) return null;
    return { ok: true, titulo: limpar(JSON.parse(texto)?.title, 200) };
  } catch {
    return null;
  }
}

// janela(): a janela principal; enviar(msg): para a página do app (evento "yt-escolher")
function criarEscolhedor({ WebContentsView, session, app, janela, enviar, devTools = false, inicio = INICIO, checar = checarVideo }) {
  let view = null;
  let ses = null;
  let ultimaBusca = '';  // o último /results visto: para voltar quando o histórico não der
  let visto = { id: '', t: 0 }; // o mesmo vídeo chega por mais de um evento: vale o primeiro
  let checando = false;

  function prepararSessao() {
    if (ses) return;
    ses = session.fromPartition(PARTICAO);
    ses.setUserAgent(uaLimpo(app.userAgentFallback));
    ses.setPermissionRequestHandler((_wc, _perm, cb) => cb(false));
    ses.setPermissionCheckHandler(() => false);
    ses.on('will-download', (e) => e.preventDefault());
  }
  const vivo = () => !!view && !view.webContents.isDestroyed();
  const estado = () => { if (vivo()) enviar({ tipo: 'estado', carregando: view.webContents.isLoading(), podeVoltar: podeVoltar() }); };
  function podeVoltar() {
    const wc = view.webContents;
    return wc.navigationHistory ? wc.navigationHistory.canGoBack() : wc.canGoBack();
  }
  function voltar() {
    if (!vivo()) return;
    const wc = view.webContents;
    if (podeVoltar()) (wc.navigationHistory || wc).goBack();
    else wc.loadURL(ultimaBusca || inicio);
  }
  // O quadro principal só fica no YouTube; o login do Google ganha um aviso próprio
  function barrar(e, url) {
    if (hostPermitido(url)) return;
    e.preventDefault();
    const u = urlSegura(url);
    enviar({ tipo: 'aviso', motivo: u && u.hostname === 'accounts.google.com' ? 'login' : 'fora' });
  }
  async function ver(url) {
    const u = urlSegura(url);
    if (u && HOSTS_VIDEO.has(u.hostname) && u.pathname === '/results') ultimaBusca = u.href;
    const id = videoDaUrl(url);
    if (!id || !vivo() || checando || (id === visto.id && Date.now() - visto.t < 2000)) return;
    visto = { id, t: Date.now() };
    const wc = view.webContents;
    wc.stop();
    checando = true;
    try {
      const r = await checar(id);
      if (!vivo()) return;
      if (r && !r.ok) { enviar({ tipo: 'aviso', motivo: 'incorporar' }); voltar(); return; }
      enviar({ tipo: 'video', videoId: id, titulo: r?.titulo || '' });
    } finally { checando = false; }
  }

  function criar() {
    prepararSessao();
    view = new WebContentsView({
      webPreferences: {
        partition: PARTICAO, contextIsolation: true, nodeIntegration: false, sandbox: true, // sem preload
        webSecurity: true, allowRunningInsecureContent: false, webviewTag: false, navigateOnDragDrop: false,
        spellcheck: false, devTools,
      },
    });
    const wc = view.webContents;
    wc.setAudioMuted(true); // as prévias e o vídeo que chegou a carregar não fazem som
    wc.setWindowOpenHandler(({ url }) => { ver(url); return { action: 'deny' }; });
    wc.on('will-navigate', (e, url) => barrar(e, url ?? e.url));
    wc.on('will-redirect', (e, url, _inPlace, principal) => { if (principal ?? e.isMainFrame) barrar(e, url ?? e.url); });
    // O YouTube troca o endereço sem carregar outra página (pushState): o clique chega por estes
    wc.on('did-start-navigation', (e, url, _inPlace, principal) => { if (principal ?? e.isMainFrame) ver(url ?? e.url); });
    wc.on('did-navigate-in-page', (_e, url, principal) => { if (principal) ver(url); estado(); });
    wc.on('did-navigate', (_e, url) => { ver(url); estado(); });
    wc.on('did-start-loading', estado);
    wc.on('did-stop-loading', estado);
    wc.on('did-fail-load', (_e, codigo, _desc, _url, principal) => { if (principal && codigo !== -3) enviar({ tipo: 'aviso', motivo: 'rede' }); });
    wc.on('login', (e, _detalhes, _auth, cb) => { e.preventDefault(); cb(); });
    wc.on('render-process-gone', () => { fechar(); enviar({ tipo: 'fechou', motivo: 'caiu' }); });
    wc.on('before-input-event', (e, input) => {
      if (input.type !== 'keyDown') return;
      if (input.key === 'Escape') { e.preventDefault(); fechar(); enviar({ tipo: 'fechou', motivo: 'esc' }); }
      else if (input.key === 'F6') { e.preventDefault(); janela()?.webContents.focus(); enviar({ tipo: 'foco' }); }
      else if (input.alt && input.key === 'ArrowLeft') { e.preventDefault(); voltar(); }
    });
    janela().contentView.addChildView(view);
    wc.loadURL(inicio);
  }

  // O retângulo vem em px do CSS da página do app: vira px da janela (zoom) e fica dentro dela
  function bounds(rect) {
    const win = janela();
    const zoom = win.webContents.getZoomFactor() || 1;
    const [cw, ch] = win.getContentSize();
    const [x, y, w, h] = ['x', 'y', 'w', 'h'].map((k) => Math.round((Number(rect?.[k]) || 0) * zoom));
    const left = Math.max(0, Math.min(x, cw - MIN_W)), top = Math.max(0, Math.min(y, ch - MIN_H));
    return { x: left, y: top, width: Math.max(MIN_W, Math.min(w, cw - left)), height: Math.max(MIN_H, Math.min(h, ch - top)) };
  }
  function abrir(rect) {
    const win = janela();
    if (!win || win.isDestroyed()) return { ok: false };
    try {
      if (!vivo()) criar();
      view.setBounds(bounds(rect));
      view.setVisible(true);
      return { ok: true };
    } catch {
      fechar();
      return { ok: false };
    }
  }
  // null: esconde (a página do app mostra um erro no lugar)
  function posicao(rect) {
    if (!vivo()) return;
    if (rect == null) return view.setVisible(false);
    view.setBounds(bounds(rect));
    view.setVisible(true);
  }
  function acao(qual) {
    if (!vivo()) return;
    if (qual === 'voltar') voltar();
    else if (qual === 'recarregar') view.webContents.reload();
    else if (qual === 'busca') view.webContents.loadURL(ultimaBusca || inicio);
  }
  function focar() { if (vivo()) view.webContents.focus(); }
  // Tira da janela e destrói: o processo da página do YouTube sai da memória
  function fechar() {
    if (!view) return;
    const v = view;
    view = null;
    checando = false;
    try { const win = janela(); if (win && !win.isDestroyed()) win.contentView.removeChildView(v); } catch {}
    try { if (!v.webContents.isDestroyed()) v.webContents.close(); } catch {}
    // O service worker que o YouTube registra continuaria rodando: sai junto (os cookies ficam até fechar o app)
    ses?.clearStorageData({ storages: ['serviceworkers', 'cachestorage'] }).catch(() => {});
  }
  return { abrir, posicao, acao, focar, fechar };
}

module.exports = { videoDaUrl, hostPermitido, uaLimpo, checarVideo, criarEscolhedor, INICIO };

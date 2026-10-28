// Voz e vídeo pela ponte: duas conexões numa janela invisível (uma de áudio, uma de vídeo, como a voz e a tela do app),
// mede quantos kbps chegam. Na raiz do repositório:
//   npx electron prototipos/sala-nostr/ponte-midia/main.cjs                       direto (confere o teste)
//   npx electron prototipos/sala-nostr/ponte-midia/main.cjs --emissor https://…   só pelo TURN do emissor
// Com as travas do coturn: a voz chega perto de 192 kbps; o vídeo fica abaixo de ~320 kbps ou nem conecta.
const path = require('node:path');
const { app, BrowserWindow } = require('electron');

const args = process.argv.slice(2);
const opcao = (nome, padrao) => { const i = args.indexOf('--' + nome); return i >= 0 ? args[i + 1] : padrao; };
const segundos = Number(opcao('segundos', 20)) || 20;

app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

async function listaIce() {
  const emissor = opcao('emissor', '');
  if (!emissor) return { iceServers: [], soPonte: false };
  const r = await fetch(new URL('/v1/turn', emissor), { signal: AbortSignal.timeout(5000) });
  if (!r.ok) throw new Error('Emissor de TURN respondeu ' + r.status);
  const { iceServers } = await r.json();
  return { iceServers, soPonte: true };
}

app.whenReady().then(async () => {
  let cfg;
  try { cfg = await listaIce(); } catch (e) { console.error('Erro:', e.message); return app.exit(1); }
  const win = new BrowserWindow({ show: args.includes('--mostrar'), width: 640, height: 400, webPreferences: { backgroundThrottling: false } });
  win.webContents.on('console-message', (_e, _nivel, msg) => {
    if (!msg.startsWith('RESULTADO ')) return console.log('[página]', msg);
    console.log(JSON.stringify(JSON.parse(msg.slice(10)), null, 2));
    app.exit(0);
  });
  win.loadFile(path.join(__dirname, 'pagina.html'), { hash: encodeURIComponent(JSON.stringify({ ...cfg, segundos })) });
  setTimeout(() => { console.error('Tempo esgotado.'); app.exit(1); }, (segundos + 40) * 1000);
});

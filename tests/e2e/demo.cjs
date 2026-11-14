// Demo para testar a interface sozinho: abre o app (janela visível) numa sala com gente falsa na voz e amigos com
// conversas. Nada sai do PC: o processo principal não roda (os pedidos ao main são respostas fixas daqui).
// Limite: mandar mensagem, ligar e silenciar não chegam a ninguém; serve para ver e clicar nos botões.
// Roda com: npm run demo
const { app, BrowserWindow, ipcMain } = require('electron');
const os = require('node:os');
const path = require('node:path');
const APP = path.resolve(__dirname, '..', '..');
app.setPath('userData', path.join(os.tmpdir(), 'tela-p2p-e2e', 'perfil-demo'));
app.commandLine.appendSwitch('use-fake-device-for-media-stream');
app.commandLine.appendSwitch('use-fake-ui-for-media-stream');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
app.whenReady().then(async () => {
  for (const [c, v] of Object.entries({ 'get-ips': [], 'razze-pending-invite': '', 'get-version': 'demo', 'github-check': { ok: false }, 'set-priority': true,
    'stats-start': true, 'stats-stop': true, 'stop-app-audio': true, 'stop-server': true, 'room-keys': true, 'sessoes-observar': true, 'capture-exclude': true, 'get-shortcuts': {} })) ipcMain.handle(c, () => v);
  const win = new BrowserWindow({ width: 1280, height: 800, webPreferences: { preload: path.join(APP, 'preload.js') } });
  const run = (c) => win.webContents.executeJavaScript(c);
  await win.loadFile(path.join(APP, 'index.html'));
  await run(`save('primeiraEntrada', '1'); if (!load('name')) save('name', 'Eu'); 1`);
  await win.loadFile(path.join(APP, 'index.html'));
  await sleep(2500);
  await run(`enterRoom({ id: '1', features: ['chat', 'voice'], members: [{ id: '2', name: 'Ana', version: 'demo' }, { id: '3', name: 'Beto', version: 'demo' }], chat: [] }, false, '127.0.0.1', 8765); voice.join(); 1`);
  await sleep(1200);
  // Ana e Beto "na voz" (a voz real some com eles, então a resposta é forçada) e o Silenciar para a sala ligado
  await run(`(() => {
    const g = voice.members.get.bind(voice.members);
    voice.members.get = (k) => (k === '2' || k === '3') ? { ...(g(k) || {}), session: 'demo' } : g(k);
    state.muteRoomOn = true; for (const m of state.members.values()) m.muteRoom = true;
    renderVoice();
    // Amigos e conversas falsos (mensagens.js)
    dm.account = 'eu';
    friendsData.friends = [{ id: 'a1', displayName: 'Ana', online: true }, { id: 'b2', displayName: 'Beto', online: false }, { id: 'c3', displayName: 'Carla', online: true }];
    const t = Date.now();
    const a = dmConv('a1'); a.loaded = true; dmAdd(a, { id: 'm1', from: 'a1', text: 'bora jogar hoje?', createdAt: t - 600000 }); dmAdd(a, { id: 'm2', from: 'eu', text: 'bora, 21h', createdAt: t - 300000 });
    const b = dmConv('b2'); b.loaded = true; dmAdd(b, { id: 'm3', from: 'b2', text: 'valeu pela call', createdAt: t - 86400000 });
    dmConv('c3').loaded = true;
    dmPutInBar('a1', false); dmPutInBar('b2', false);
    renderDm();
    toast('Demo: Ana e Beto estão na voz e são seus amigos. Nada sai do PC.');
  })(); 1`);
});
app.on('window-all-closed', () => app.quit());

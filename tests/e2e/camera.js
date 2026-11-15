// Câmera: no canto, junto com a tela (ligar e desligar no meio, nos dois modos de codificação, sem reconectar), e
// sozinha, como fonte. A "tela" da Ana é um quadro vermelho e a "câmera" é um quadro azul; a Bia confere as cores.
const { openApp, createRoom, joinRoom, frames, check, sleep, run } = require('./ajuda');

const PORT = 18831;
const link = '[...state.in.values()][0]';
const video = `${link}.tile.video`;
const camVideo = `${link}.tile.cam`;

const FAKE = `(() => {
  const quadro = (cor) => {
    const c = document.createElement('canvas'); c.width = 640; c.height = 360;
    const g = c.getContext('2d');
    setInterval(() => { g.fillStyle = cor; g.fillRect(0, 0, 640, 360); g.fillStyle = '#fff'; g.fillRect(Math.random() * 600, 10, 20, 20); }, 33);
    return c.captureStream(30);
  };
  navigator.mediaDevices.getDisplayMedia = async () => quadro('red');
  const real = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
  navigator.mediaDevices.getUserMedia = async (c) => (c && c.video ? quadro('blue') : real(c));
})()`;

const colorOf = (B, expr) => B.eval(`(() => {
  const v = ${expr}; const c = document.createElement('canvas'); c.width = 64; c.height = 36;
  c.getContext('2d').drawImage(v, 0, 0, 64, 36);
  const [r, g, b] = c.getContext('2d').getImageData(32, 30, 1, 1).data;
  return r > 150 && b < 100 ? 'vermelho' : b > 150 && r < 100 ? 'azul' : \`outra (\${r},\${g},\${b})\`;
})()`);

async function startShare(A, mode, source = 'fonte-1') {
  await A.eval(`(() => { $('soundOn').checked = false; setRadio('encodeMode', '${mode}'); state.selectedSource = '${source}'; return startSharing(); })()`);
  await A.waitFor(`state.sharing`, 20000);
}
async function watchAna(B) {
  await B.waitFor(`[...state.members.values()].some((m) => m.sharing)`);
  await B.eval(`watch([...state.members].find(([, m]) => m.sharing)[0])`);
  await B.waitFor(`${video}.videoWidth > 0`, 20000);
}

run('Câmera', 200000, async () => {
  const A = await openApp('camA', 9531);
  await A.eval(FAKE);
  await createRoom(A, { name: 'Ana', port: PORT });
  const B = await openApp('camB', 9532);
  await joinRoom(B, { name: 'Bia', addr: `127.0.0.1:${PORT}` });

  for (const mode of ['per', 'once']) {
    const nome = mode === 'per' ? 'Modo normal' : 'Uma vez só';
    if (mode === 'once') await A.eval(`onceSupportCache = Promise.resolve({ engine: 'webcodecs', hardware: true })`);
    await startShare(A, mode);
    check(`${nome}: o botão da câmera aparece ao transmitir, desligado`, await A.eval(`!$('camBtn').hidden && $('camBtn').getAttribute('aria-pressed') === 'false' && !cam.track`));
    await watchAna(B);
    await sleep(800);
    check(`${nome}: sem câmera, o quadrinho fica escondido`, await B.eval(`${camVideo}.hidden`));
    await B.eval(`window.pcAntes = ${link}.pc`);

    await A.eval(`$('camBtn').click()`);
    await A.waitFor(`!!cam.track`, 8000);
    await B.waitFor(`!${camVideo}.hidden && ${camVideo}.videoWidth > 0`, 15000);
    await sleep(1200);
    check(`${nome}: a Bia vê a câmera (azul) no canto`, (await colorOf(B, camVideo)) === 'azul', await colorOf(B, camVideo));
    check(`${nome}: a tela continua sendo a tela (vermelho)`, (await colorOf(B, video)) === 'vermelho', await colorOf(B, video));
    const fc = await frames(B, camVideo);
    check(`${nome}: a câmera anda`, fc > 0, `${fc} quadros; oculta: ${await B.eval('document.hidden')}`);
    check(`${nome}: a mesma conexão, sem reconectar`, await B.eval(`${link}.pc === window.pcAntes && window.pcAntes.connectionState === 'connected'`));
    // Em tela pequena (1024), a coluna do perfil e o painel não deixam largura para as telas: sem eles, para medir
    await B.eval(`document.body.classList.remove('com-perfil-fixo', 'has-workspace-pane')`);
    await sleep(300);
    const pos = await B.eval(`(() => { const c = ${camVideo}.getBoundingClientRect(), b = ${camVideo}.parentElement.getBoundingClientRect(); const t = ${link}.tile.el, r = t.getBoundingClientRect(); return { w: Math.round(c.width), h: Math.round(c.height), bw: Math.round(b.width), dir: Math.round(b.right - c.right), baixo: Math.round(b.bottom - c.bottom), tw: Math.round(r.width) }; })()`);
    // Com a janela da Bia oculta (atrás de outra), o palco não dá largura ao quadro (bw 0): aí confere só o canto
    check(`${nome}: o quadrinho fica no canto de baixo, à direita, pequeno`, pos.w > 60 && (!pos.bw || pos.w < pos.bw * 0.35) && pos.dir < 30 && pos.baixo < 30, JSON.stringify(pos));
    // Clicar no quadrinho troca: a câmera fica grande e a tela vai para o canto; outro clique desfaz
    const larg = () => B.eval(`[${camVideo}, ${video}].map((v) => getComputedStyle(v).objectFit)`); // contain = grande, cover = no canto
    await B.eval(`${link}.tile.el.querySelector('.tile-cam-troca').click()`);
    const trocado = await larg();
    await B.eval(`${link}.tile.el.querySelector('.tile-cam-troca').click()`);
    const destrocado = await larg();
    check(`${nome}: clicar no quadrinho troca a câmera e a tela de lugar, e destroca`, trocado.join() === 'contain,cover' && destrocado.join() === 'cover,contain', JSON.stringify([trocado, destrocado]));
    check(`${nome}: o botão acende`, await A.eval(`$('camBtn').getAttribute('aria-pressed') === 'true'`));

    await A.eval(`$('camBtn').click()`);
    await B.waitFor(`${camVideo}.hidden`, 8000);
    check(`${nome}: desligar esconde o quadrinho e solta a câmera`, await A.eval(`!cam.track && cam.stream.getTracks().length === 0`));
    const ft = await frames(B, video);
    check(`${nome}: a tela continua chegando`, ft > 0, `${ft} quadros; oculta: ${await B.eval('document.hidden')}; ${await B.eval(`JSON.stringify({ paused: ${video}.paused, videoOn: ${link}.videoOn, estado: ${link}.pc.connectionState })`)}`);

    // Ligada antes de a Bia assistir: já chega ligada
    await B.eval(`stopWatching([...state.in.keys()][0])`);
    await A.eval(`setCam(true)`);
    await A.waitFor(`!!cam.track`, 8000);
    await watchAna(B);
    await B.waitFor(`!${camVideo}.hidden && ${camVideo}.videoWidth > 0`, 15000);
    check(`${nome}: quem chega depois já vê a câmera`, (await colorOf(B, camVideo)) === 'azul', await colorOf(B, camVideo));

    await A.eval(`stopSharing()`);
    await B.waitFor(`state.in.size === 0`, 8000);
    check(`${nome}: parar de transmitir desliga a câmera`, await A.eval(`!cam.track && $('camBtn').hidden`));
  }

  // App antigo (não pede a câmera): a conexão não ganha a segunda faixa
  await startShare(A, 'per');
  await A.eval(`setCam(true)`);
  await A.waitFor(`!!cam.track`, 8000);
  await B.waitFor(`[...state.members.values()].some((m) => m.sharing)`);
  await B.eval(`(() => { const s = sendSignal; sendSignal = (to, d) => s(to, d && d.subscribe ? { ...d, cam: undefined } : d); watch([...state.members].find(([, m]) => m.sharing)[0]); sendSignal = s; })()`);
  await B.waitFor(`${video}.videoWidth > 0`, 20000);
  await sleep(800);
  check('App antigo: vê só a tela, sem a faixa da câmera', (await colorOf(B, video)) === 'vermelho' && await B.eval(`${camVideo}.hidden && ${link}.pc.getTransceivers().filter((t) => t.receiver.track.kind === 'video').length === 1`), await colorOf(B, video));
  await A.eval(`stopSharing()`);
  await B.waitFor(`state.in.size === 0`, 8000);

  // A câmera sozinha, como fonte
  await startShare(A, 'per', 'camera:');
  check('Câmera como fonte: transmitindo, sem o botão do canto', await A.eval(`state.sharing && isCamera(state.sharingSource) && $('camBtn').hidden`));
  await watchAna(B);
  await sleep(800);
  check('Câmera como fonte: a Bia vê a câmera (azul) no lugar da tela', (await colorOf(B, video)) === 'azul', await colorOf(B, video));
  check('Câmera como fonte: sem quadrinho no canto', await B.eval(`${camVideo}.hidden`));
  await A.eval(`stopSharing()`);
});

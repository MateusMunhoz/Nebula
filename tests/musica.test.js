const { test } = require('node:test');
const assert = require('node:assert/strict');
const net = require('node:net');
const { WebSocket } = require('ws');
const { startServer, stopServer } = require('../signaling');
const { createMusicas, cleanVideoId, limparMusicas, handleMemberMessage, FILA_MAX, FILA_POR_PESSOA, FILA_SALA_MAX } = require('../sala-protocolo');

async function freePort() {
  const probe = net.createServer();
  await new Promise(r => probe.listen(0, '127.0.0.1', r));
  const port = probe.address().port;
  await new Promise(r => probe.close(r));
  return port;
}
async function client(port, hello = {}) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}`);
  const messages = [];
  ws.on('message', raw => messages.push(JSON.parse(raw)));
  await new Promise((resolve, reject) => { ws.once('open', resolve); ws.once('error', reject); });
  const send = msg => ws.send(JSON.stringify(msg));
  const wait = async predicate => {
    const deadline = Date.now() + 3000;
    while (Date.now() < deadline) {
      const i = messages.findIndex(predicate);
      if (i !== -1) return messages.splice(i, 1)[0];
      await new Promise(r => setTimeout(r, 10));
    }
    throw new Error('Mensagem não recebida');
  };
  send({ type: 'hello', name: 'Teste', ...hello });
  const welcome = await wait(m => m.type === 'welcome');
  return { ws, send, wait, messages, welcome };
}
const VID = 'dQw4w9WgXcQ', VID2 = 'M7lc1UVf-VE';

test('vídeo do YouTube: só ids de 11 caracteres; a semente (troca de host) limpa e uma por canal', () => {
  assert.equal(cleanVideoId(VID), VID);
  assert.equal(cleanVideoId('curto'), '');
  assert.equal(cleanVideoId('<script>abc'), '');
  let t = 1000;
  const m = createMusicas([{ ch: '', videoId: VID, pos: 42, playing: false, by: '3', title: 'x\u0001y', dur: 212.34 }, { ch: '', videoId: VID2 }, { ch: '2', videoId: 'ruim' }], () => t);
  assert.deepEqual([...m.map.values()], [{ ch: '', videoId: VID, title: 'x y', by: '3', playing: false, pos: 42, at: 1000, dur: 212.3, fila: [] }]);
  t = 2000;
  assert.deepEqual(m.msg(), { type: 'musicas', list: [...m.map.values()], now: 2000 });
});

test('uma música por canal: vai para o canal de quem pôs; quem é de fora não controla; apagar a subsala para', async t => {
  const port = await freePort();
  assert.equal((await startServer(port)).ok, true);
  t.after(stopServer);
  const a = await client(port); t.after(() => a.ws.terminate());
  const b = await client(port); t.after(() => b.ws.terminate());
  assert.ok(a.welcome.features.includes('musica'));
  assert.deepEqual(a.welcome.musicas, []);
  assert.equal(typeof a.welcome.now, 'number');
  a.send({ type: 'subsala-create' });
  await b.wait(m => m.type === 'subsalas');
  a.send({ type: 'voice-state', session: 'sa', channel: '1' });
  await b.wait(m => m.type === 'voice-state' && m.id === a.welcome.id);

  // Ana (na Subsala_1) põe uma música: ela vai para a Subsala_1, tocando do começo
  a.send({ type: 'musica-set', videoId: VID });
  const set = await b.wait(m => m.type === 'musicas');
  assert.equal(set.list.length, 1);
  assert.deepEqual({ ...set.list[0], at: 0 }, { ch: '1', videoId: VID, title: '', by: a.welcome.id, playing: true, pos: 0, at: 0, dur: 0, fila: [] });
  // Outra música no mesmo canal: recusada, com o motivo
  a.send({ type: 'musica-set', videoId: VID2 });
  assert.match((await a.wait(m => m.type === 'musica-erro')).text, /Já tem uma música em Subsala_1/);
  // Bia (fora da voz) põe na Voz geral: são duas músicas, uma em cada canal
  b.send({ type: 'musica-set', videoId: VID2 });
  assert.deepEqual((await a.wait(m => m.type === 'musicas' && m.list.length === 2)).list.map(m => m.ch).sort(), ['', '1']);
  // Bia não está na Subsala_1 nem pôs a música de lá: não controla
  b.send({ type: 'musica-ctl', ch: '1', action: 'pause', pos: 10 });
  assert.match((await b.wait(m => m.type === 'musica-erro')).text, /Só quem está em Subsala_1/);
  // Ana pausa em 12 s, pula para 30 s (continua pausada) e toca de novo
  a.messages.length = 0;
  a.send({ type: 'musica-ctl', ch: '1', action: 'pause', pos: 12 });
  let one = (await a.wait(m => m.type === 'musicas')).list.find(m => m.ch === '1');
  assert.deepEqual([one.playing, one.pos], [false, 12]);
  a.send({ type: 'musica-ctl', ch: '1', action: 'seek', pos: 30 });
  one = (await a.wait(m => m.type === 'musicas')).list.find(m => m.ch === '1');
  assert.deepEqual([one.playing, one.pos], [false, 30]);
  a.send({ type: 'musica-ctl', ch: '1', action: 'play', pos: 30 });
  one = (await a.wait(m => m.type === 'musicas')).list.find(m => m.ch === '1');
  assert.deepEqual([one.playing, one.pos], [true, 30]);
  // O título: vale o primeiro, de qualquer um que esteja ouvindo
  b.send({ type: 'musica-ctl', ch: '1', action: 'titulo', title: 'Never Gonna Give You Up' });
  assert.equal((await a.wait(m => m.type === 'musicas')).list.find(m => m.ch === '1').title, 'Never Gonna Give You Up');
  b.send({ type: 'musica-ctl', ch: '1', action: 'titulo', title: 'Outro' });
  // Trocar a música: outro vídeo, do começo, título novo
  a.send({ type: 'musica-ctl', ch: '1', action: 'trocar', videoId: VID2 });
  one = (await a.wait(m => m.type === 'musicas')).list.find(m => m.ch === '1');
  assert.deepEqual([one.videoId, one.pos, one.playing, one.title], [VID2, 0, true, '']);
  // Apagar a Subsala_1 para a música de lá; a da Voz geral continua
  a.send({ type: 'subsala-delete', id: '1' });
  assert.deepEqual((await b.wait(m => m.type === 'musicas' && m.list.length === 1)).list.map(m => m.ch), ['']);
  // Parar a da Voz geral (Bia pôs)
  b.send({ type: 'musica-ctl', ch: '', action: 'stop' });
  assert.deepEqual((await a.wait(m => m.type === 'musicas' && m.list.length === 0)).list, []);
});

test('troca de host: o servidor novo continua com a música, do ponto em que estava', async t => {
  const port = await freePort();
  assert.equal((await startServer(port, '', { subsalas: [{ id: '2' }], musicas: [{ ch: '2', videoId: VID, pos: 95.5, playing: true, by: '5', dur: 213 }], hostId: '5', nextId: 6 })).ok, true);
  t.after(stopServer);
  const a = await client(port, { resume: '5' }); t.after(() => a.ws.terminate());
  const m = a.welcome.musicas[0];
  assert.deepEqual([m.ch, m.videoId, m.pos, m.playing, m.by, m.dur], ['2', VID, 95.5, true, '5', 213]);
  assert.ok(Math.abs(m.at - a.welcome.now) < 1000);
});

test('músicas esquecidas: pausada 4 min sai; sem ninguém no canal nem ouvindo, 1 min (tocando ou não)', () => {
  let t = 0;
  const musicas = createMusicas([{ ch: '', videoId: 'dQw4w9WgXcQ', by: '1' }, { ch: '2', videoId: 'dQw4w9WgXcQ', by: '1' }], () => t);
  const members = new Map([['1', { ws: null, voiceSession: 's', voiceChannel: '' }], ['3', { ws: null, voiceSession: '' }]]);
  const msg = (id, m) => handleMemberMessage({ members, broadcast() {}, chat: null, subsalas: null, musicas }, id, members.get(id), m);
  // A Voz geral tem gente; a subsala 2 ninguém, mas o 3 ouve de fora
  msg('3', { type: 'musica-ouvindo', ch: '2', on: true });
  t = 120000;
  assert.equal(limparMusicas(musicas, members), false);
  // Parou de ouvir: a subsala fica sozinha e sai depois de 1 min
  msg('3', { type: 'musica-ouvindo', ch: '2', on: false });
  assert.equal(limparMusicas(musicas, members), false);
  t += 59000;
  assert.equal(limparMusicas(musicas, members), false);
  t += 1000;
  assert.equal(limparMusicas(musicas, members), true);
  assert.deepEqual([...musicas.map.keys()], ['']);
  // Pausada com gente: sai só depois de 4 min da pausa
  Object.assign(musicas.map.get(''), { playing: false, at: t });
  t += 4 * 60000 - 1;
  assert.equal(limparMusicas(musicas, members), false);
  t += 1;
  assert.equal(limparMusicas(musicas, members), true);
  assert.equal(musicas.map.size, 0);
  // Ouvindo só vale para música que existe
  msg('3', { type: 'musica-ouvindo', ch: '2', on: true });
  assert.equal(members.get('3').ouvindo.size, 0);
});

test('duração: vale a primeira que o player contar, só do vídeo do canal; inválida não entra; trocar zera', () => {
  let t = 0;
  const musicas = createMusicas([{ ch: '', videoId: VID, by: '1' }], () => t);
  const members = new Map([['1', { ws: null, voiceSession: 's', voiceChannel: '' }], ['3', { ws: null, voiceSession: '' }]]);
  let avisos = 0;
  const msg = (id, m) => handleMemberMessage({ members, broadcast() { avisos++; }, chat: null, subsalas: null, musicas }, id, members.get(id), m);
  const m = () => musicas.map.get('');
  for (const dur of [0, -5, 0.5, 'abc', 24 * 3600 + 1, NaN, Infinity]) msg('3', { type: 'musica-ctl', ch: '', action: 'duracao', dur, videoId: VID });
  assert.equal(m().dur, 0);
  msg('3', { type: 'musica-ctl', ch: '', action: 'duracao', dur: 213, videoId: VID2 }); // de outro vídeo (atrasada, depois de trocar)
  assert.equal(m().dur, 0);
  assert.equal(avisos, 0);
  msg('3', { type: 'musica-ctl', ch: '', action: 'duracao', dur: 212.987, videoId: VID }); // qualquer um que ouça conta, como o título
  assert.equal(m().dur, 213);
  assert.equal(avisos, 1);
  msg('1', { type: 'musica-ctl', ch: '', action: 'duracao', dur: 99, videoId: VID });
  assert.equal(m().dur, 213, 'vale a primeira');
  assert.deepEqual(musicas.msg().list[0].dur, 213);
  msg('1', { type: 'musica-ctl', ch: '', action: 'trocar', videoId: VID2 });
  assert.equal(m().dur, 0);
});

test('música que acabou sai sozinha (com gente no canal e ninguém ouvindo); sem duração, não', () => {
  let t = 0;
  const musicas = createMusicas([{ ch: '', videoId: VID, by: '9', dur: 200 }, { ch: '2', videoId: VID2, by: '9' }], () => t);
  const members = new Map([['1', { ws: null, voiceSession: 's', voiceChannel: '' }], ['2', { ws: null, voiceSession: 's', voiceChannel: '2' }]]);
  // Tocando do começo: aos 204 s ainda fica (folga de 5 s para o player de quem ouve terminar), aos 205 s sai
  t = 204000;
  assert.equal(limparMusicas(musicas, members), false);
  t = 205000;
  assert.equal(limparMusicas(musicas, members), true);
  assert.deepEqual([...musicas.map.keys()], ['2'], 'a sem duração continua (ninguém contou quanto dura)');
  // Pausada depois do fim não sai pelo fim (só pela regra da pausa)
  const p = createMusicas([{ ch: '', videoId: VID, by: '9', dur: 10, playing: false, pos: 10 }], () => t);
  assert.equal(limparMusicas(p, members), false);
  // Pulou para perto do fim: conta a partir do ponto novo
  const s = createMusicas([{ ch: '', videoId: VID, by: '9', dur: 100, pos: 90 }], () => t);
  t += 14000;
  assert.equal(limparMusicas(s, members), false);
  t += 1000;
  assert.equal(limparMusicas(s, members), true);
});

// Fila: '1' está no canal da música (Voz geral), '2' está na Subsala 2 (de fora), '3' também está na Voz geral
function salaComFila(seed = [{ ch: '', videoId: VID, by: '1', dur: 200 }]) {
  const sala = { t: 0, erros: [], avisos: 0 };
  sala.musicas = createMusicas(seed, () => sala.t);
  sala.members = new Map([
    ['1', { ws: { id: '1', readyState: 1 }, voiceSession: 's', voiceChannel: '' }],
    ['2', { ws: { id: '2', readyState: 1 }, voiceSession: 's', voiceChannel: '2' }],
    ['3', { ws: { id: '3', readyState: 1 }, voiceSession: 's', voiceChannel: '' }],
  ]);
  for (const x of sala.members.values()) x.ws.send = (raw) => sala.erros.push([x.ws.id, JSON.parse(raw).text]);
  sala.msg = (id, m) => handleMemberMessage({ members: sala.members, broadcast() { sala.avisos++; }, chat: null, subsalas: null, musicas: sala.musicas }, id, sala.members.get(id), { type: 'musica-ctl', ch: '', ...m });
  sala.m = () => sala.musicas.map.get('');
  sala.fila = () => sala.m()?.fila.map((f) => f.videoId) ?? null;
  return sala;
}
const VIDS = Array.from({ length: 40 }, (_, i) => `video${String(i).padStart(6, '0')}`);

test('fila: pôr no fim ou numa posição, mover, tirar; quem é de fora só vê e tira o que pôs', () => {
  const s = salaComFila();
  s.msg('1', { action: 'fila-por', videoId: VIDS[0], title: ' Pais\u0007e Filhos ' });
  s.msg('3', { action: 'fila-por', videoId: VIDS[1] });
  s.msg('1', { action: 'fila-por', videoId: VIDS[2], pos: 0 });
  s.msg('1', { action: 'fila-por', videoId: VIDS[3], pos: 99 });
  assert.deepEqual(s.fila(), [VIDS[2], VIDS[0], VIDS[1], VIDS[3]]);
  assert.equal(s.m().fila[1].title, 'Pais e Filhos');
  assert.equal(s.m().fila[1].by, '1');
  assert.equal(new Set(s.m().fila.map((f) => f.id)).size, 4, 'cada item tem número próprio');
  // Repetida pode (cada cópia é um item)
  s.msg('1', { action: 'fila-por', videoId: VIDS[0] });
  assert.equal(s.fila().filter((v) => v === VIDS[0]).length, 2);
  const id = (v) => s.m().fila.find((f) => f.videoId === v).id;
  s.msg('3', { action: 'fila-mover', item: id(VIDS[3]), para: 0 });
  assert.deepEqual(s.fila().slice(0, 2), [VIDS[3], VIDS[2]]);
  s.msg('3', { action: 'fila-mover', item: id(VIDS[3]), para: 99 });
  assert.equal(s.fila().at(-1), VIDS[3]);
  s.msg('1', { action: 'fila-tirar', item: s.m().fila.at(-2).id });
  assert.deepEqual(s.fila(), [VIDS[2], VIDS[0], VIDS[1], VIDS[3]]);
  // De fora: não põe, não move, não tira o dos outros (com o motivo)
  const antes = JSON.stringify(s.fila());
  s.msg('2', { action: 'fila-por', videoId: VIDS[9] });
  s.msg('2', { action: 'fila-mover', item: id(VIDS[3]), para: 0 });
  s.msg('2', { action: 'fila-tirar', item: id(VIDS[3]) });
  assert.equal(JSON.stringify(s.fila()), antes);
  assert.equal(s.erros.filter(([q]) => q === '2').length, 3);
  // Quem pôs um item tira o seu mesmo de fora do canal
  s.members.get('3').voiceChannel = '2';
  s.msg('3', { action: 'fila-tirar', item: id(VIDS[1]) });
  assert.deepEqual(s.fila(), [VIDS[2], VIDS[0], VIDS[3]]);
  // Lixo: ignorado sem resposta
  const erros = s.erros.length, avisos = s.avisos;
  for (const m of [{ action: 'fila-por', videoId: 'ruim' }, { action: 'fila-mover', item: 'x', para: 0 }, { action: 'fila-mover', item: id(VIDS[3]), para: 'abc' },
    { action: 'fila-tirar', item: 999 }, { action: 'fila-tirar', item: -1 }, { action: 'fila-tirar', item: '1e3' }, { action: 'fila-por', videoId: VIDS[5], ch: '9' }]) s.msg('1', m);
  assert.equal(s.avisos, avisos);
  assert.equal(s.erros.length, erros);
});

test('fila: limites por canal, por pessoa e da sala, com aviso só para quem pediu', () => {
  const s = salaComFila([{ ch: '', videoId: VID, by: '1' }, { ch: '2', videoId: VID2, by: '2' }]);
  for (let i = 0; i < FILA_POR_PESSOA + 1; i++) s.msg('1', { action: 'fila-por', videoId: VIDS[i] });
  assert.equal(s.fila().length, FILA_POR_PESSOA);
  assert.match(s.erros.at(-1)[1], /Você já pôs 10/);
  assert.equal(s.erros.at(-1)[0], '1');
  // Outras pessoas enchem o canal até o limite
  for (const id of ['4', '5']) s.members.set(id, { ws: { id, readyState: 1, send: (raw) => s.erros.push([id, JSON.parse(raw).text]) }, voiceSession: 's', voiceChannel: '' });
  for (const id of ['3', '4', '5']) for (let i = 0; i < FILA_POR_PESSOA; i++) s.msg(id, { action: 'fila-por', videoId: VIDS[i] });
  assert.equal(s.fila().length, FILA_MAX);
  assert.match(s.erros.at(-1)[1], /cheia \(30\)/);
  // A sala soma os canais
  const sala = createMusicas([{ ch: '4', videoId: VID, fila: Array.from({ length: 30 }, (_, i) => ({ videoId: VIDS[i], by: String(i % 3 + 10) })) },
    { ch: '1', videoId: VID, fila: Array.from({ length: 30 }, (_, i) => ({ videoId: VIDS[i], by: String(i % 3 + 10) })) },
    { ch: '2', videoId: VID, fila: Array.from({ length: 30 }, (_, i) => ({ videoId: VIDS[i], by: String(i % 3 + 10) })) },
    { ch: '', videoId: VID, fila: Array.from({ length: 30 }, (_, i) => ({ videoId: VIDS[i], by: String(i % 3 + 10) })) }]); // a Voz geral, por último, fica com 10
  assert.equal([...sala.map.values()].reduce((n, m) => n + m.fila.length, 0), FILA_SALA_MAX);
  const s2 = salaComFila();
  s2.musicas = sala;
  s2.msg('1', { action: 'fila-por', videoId: VIDS[0] });
  assert.match(s2.erros.at(-1)[1], /filas da sala estão cheias/);
});

test('fila: pular só a música de agora (uma vez), tocar agora, fim avança, fila vazia libera o canal', () => {
  const s = salaComFila();
  for (const v of VIDS.slice(0, 3)) s.msg('3', { action: 'fila-por', videoId: v, title: v });
  s.t = 50000;
  // Dois PCs pedem para pular a mesma música: anda uma vez só
  s.msg('1', { action: 'pular', videoId: VID });
  s.msg('3', { action: 'pular', videoId: VID });
  assert.equal(s.m().videoId, VIDS[0]);
  assert.deepEqual({ by: s.m().by, title: s.m().title, pos: s.m().pos, at: s.m().at, playing: s.m().playing, dur: s.m().dur }, { by: '3', title: VIDS[0], pos: 0, at: 50000, playing: true, dur: 0 });
  assert.deepEqual(s.fila(), [VIDS[1], VIDS[2]]);
  // Tocar agora: o item sai da fila e toca no lugar
  s.msg('1', { action: 'pular', videoId: VIDS[0], item: s.m().fila[1].id });
  assert.equal(s.m().videoId, VIDS[2]);
  assert.deepEqual(s.fila(), [VIDS[1]]);
  s.msg('1', { action: 'pular', videoId: VIDS[2], item: 999 });
  assert.equal(s.m().videoId, VIDS[2], 'item que não existe: nada');
  // De fora não pula
  s.msg('2', { action: 'pular', videoId: VIDS[2] });
  assert.equal(s.m().videoId, VIDS[2]);
  // Acabou (duração conhecida): limparMusicas passa para a próxima
  s.msg('1', { action: 'duracao', dur: 100, videoId: VIDS[2] });
  s.t += 105000;
  assert.equal(limparMusicas(s.musicas, s.members), true);
  assert.equal(s.m().videoId, VIDS[1]);
  assert.deepEqual(s.fila(), []);
  // Fila vazia: o fim tira a música
  s.msg('1', { action: 'pular', videoId: VIDS[1] });
  assert.equal(s.m(), undefined);
});

test('fila: stop com tudo limpa; stop de app antigo perto do fim avança, longe para; trocar mantém a fila', () => {
  const s = salaComFila();
  for (const v of VIDS.slice(0, 2)) s.msg('1', { action: 'fila-por', videoId: v });
  s.msg('1', { action: 'trocar', videoId: VID2 });
  assert.equal(s.m().videoId, VID2);
  assert.equal(s.fila().length, 2);
  // App antigo: stop longe do fim (sem duração) é parar tudo
  const longe = salaComFila();
  longe.msg('1', { action: 'fila-por', videoId: VIDS[0] });
  longe.t = 10000;
  longe.msg('1', { action: 'stop' });
  assert.equal(longe.m(), undefined);
  // App antigo: stop a 2 s do fim, com fila, é o fim
  const perto = salaComFila();
  perto.msg('1', { action: 'fila-por', videoId: VIDS[0] });
  perto.t = 198000;
  perto.msg('3', { action: 'stop' });
  assert.equal(perto.m().videoId, VIDS[0]);
  // App novo: tudo para e limpa, mesmo perto do fim
  perto.msg('1', { action: 'fila-por', videoId: VIDS[1] });
  perto.msg('1', { action: 'duracao', dur: 10, videoId: VIDS[0] });
  perto.t += 9000;
  perto.msg('1', { action: 'stop', tudo: true });
  assert.equal(perto.m(), undefined);
});

test('fila na troca de host: limpa, corta nos limites, renumera; pausada esquecida leva a fila junto', () => {
  const fila = [{ videoId: VIDS[0], title: 'a\u0000b', by: '4', id: 77 }, { videoId: 'ruim', by: '4' }, { videoId: VIDS[1], by: 'x' },
    ...Array.from({ length: 12 }, (_, i) => ({ videoId: VIDS[i + 2], by: '5' })), ...Array.from({ length: 40 }, (_, i) => ({ videoId: VIDS[i % 40], by: String(20 + i) }))];
  const m = createMusicas([{ ch: '', videoId: VID, by: '1', fila }, { ch: '', videoId: VID2, fila }, { ch: '2', videoId: VID2, fila: 'lixo' }]);
  const f = m.map.get('').fila;
  assert.equal(f.length, FILA_MAX);
  assert.deepEqual(f[0], { id: 1, videoId: VIDS[0], title: 'a b', by: '4' });
  assert.equal(f[1].by, '');
  assert.equal(f.filter((x) => x.by === '5').length, FILA_POR_PESSOA);
  assert.deepEqual(f.map((x) => x.id), Array.from({ length: FILA_MAX }, (_, i) => i + 1));
  assert.deepEqual(m.map.get('2').fila, []);
  // O próximo item continua a contagem
  const s = salaComFila([{ ch: '', videoId: VID, by: '1', fila: [{ videoId: VIDS[0], by: '1' }] }]);
  s.msg('1', { action: 'fila-por', videoId: VIDS[1] });
  assert.deepEqual(s.m().fila.map((x) => x.id), [1, 2]);
  // Pausada há 4 min: sai com a fila
  s.msg('1', { action: 'pause', pos: 3 });
  s.t += 4 * 60000;
  assert.equal(limparMusicas(s.musicas, s.members), true);
  assert.equal(s.m(), undefined);
});

test('fila: os dois servidores anunciam', async t => {
  const port = await freePort();
  assert.equal((await startServer(port)).ok, true);
  t.after(stopServer);
  const a = await client(port); t.after(() => a.ws.terminate());
  assert.ok(a.welcome.features.includes('fila'));
  a.send({ type: 'musica-set', videoId: VID });
  await a.wait(m => m.type === 'musicas' && m.list.length === 1);
  a.send({ type: 'musica-ctl', ch: '', action: 'fila-por', videoId: VID2, title: 'Depois' });
  const r = await a.wait(m => m.type === 'musicas' && m.list[0]?.fila.length === 1);
  assert.deepEqual(r.list[0].fila, [{ id: 1, videoId: VID2, title: 'Depois', by: a.welcome.id }]);
});

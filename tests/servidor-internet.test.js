const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { WebSocket } = require('ws');
const { createInternetServer, turnCredentials, cleanCode, ipReal } = require('../servidor-internet/server');

const SECRET = 'segredo-de-teste-bem-comprido';

async function start(t, opts = {}) {
  const server = createInternetServer({
    host: '127.0.0.1', port: 0, denyDelayMs: 5, graceMs: 300, turnHost: 'turn.exemplo.com', turnPort: 3479,
    turnSecret: SECRET, log: () => {}, ...opts,
  });
  const addr = await server.listen();
  t.after(() => server.close());
  return { server, url: `ws://127.0.0.1:${addr.port}` };
}

async function connect(url, hello) {
  const ws = new WebSocket(url);
  const messages = [];
  let closed = false;
  ws.on('message', (raw) => messages.push(JSON.parse(raw)));
  ws.on('close', () => { closed = true; });
  await new Promise((resolve, reject) => { ws.once('open', resolve); ws.once('error', reject); });
  const send = (msg) => ws.send(JSON.stringify(msg));
  const wait = async (predicate, ms = 3000) => {
    const deadline = Date.now() + ms;
    while (Date.now() < deadline) {
      const i = messages.findIndex(predicate);
      if (i !== -1) return messages.splice(i, 1)[0];
      await new Promise((r) => setTimeout(r, 10));
    }
    throw new Error('Mensagem não recebida');
  };
  if (hello) send({ type: 'hello', ...hello });
  const first = hello ? await wait((m) => m.type === 'welcome' || m.type === 'error') : null;
  return { ws, send, wait, messages, first, isClosed: () => closed };
}

const client = () => crypto.randomBytes(16).toString('hex');

test('cria a sala com código e entrega STUN + TURN com acesso temporário', async (t) => {
  const { url } = await start(t);
  const a = await connect(url, { create: true, name: 'Ana', password: 'pizza-azul', client: client() });
  t.after(() => a.ws.terminate());
  assert.equal(a.first.type, 'welcome');
  assert.equal(cleanCode(a.first.sala), a.first.sala);
  assert.equal(a.first.hostId, a.first.id);
  assert.ok(a.first.features.includes('internet'));
  assert.ok(!a.first.features.includes('handoff'));
  const [stun, turn] = a.first.iceServers;
  assert.ok(stun.urls.includes('stun:turn.exemplo.com:3479'));
  assert.deepEqual(turn.urls, ['turn:turn.exemplo.com:3479?transport=udp', 'turn:turn.exemplo.com:3479?transport=tcp']);
  // A senha do TURN é o HMAC-SHA1 do usuário com o segredo (o que o coturn confere com use-auth-secret)
  assert.equal(turn.credential, crypto.createHmac('sha1', SECRET).update(turn.username).digest('base64'));
  const expira = Number(turn.username.split(':')[0]);
  assert.ok(expira > Date.now() / 1000 + 3600);
});

test('entra com código + senha, repassa sinais e não espalha IPs', async (t) => {
  const { url } = await start(t);
  const a = await connect(url, { create: true, name: 'Ana', password: 'pizza-azul', client: client(), addrs: ['192.168.0.10'] });
  t.after(() => a.ws.terminate());
  const b = await connect(url, { room: a.first.sala.toLowerCase(), name: 'Beto', password: 'pizza-azul', client: client() });
  t.after(() => b.ws.terminate());
  assert.equal(b.first.type, 'welcome');
  assert.equal(b.first.members.length, 1);
  assert.deepEqual(b.first.members[0].addrs, []);
  await a.wait((m) => m.type === 'member-joined' && m.id === b.first.id);
  b.send({ type: 'signal', to: a.first.id, data: { side: 'viewer', subscribe: true } });
  const sig = await a.wait((m) => m.type === 'signal');
  assert.equal(sig.from, b.first.id);
  a.send({ type: 'chat', text: 'oi' });
  assert.equal((await b.wait((m) => m.type === 'chat')).text, 'oi');
});

test('senha errada e sala inexistente dão a mesma resposta, e o IP é bloqueado depois de várias', async (t) => {
  const { url } = await start(t, { failPerIp: 3 });
  const a = await connect(url, { create: true, name: 'Ana', password: 'pizza-azul', client: client() });
  t.after(() => a.ws.terminate());
  const wrong = await connect(url, { room: a.first.sala, name: 'X', password: 'errada' });
  const missing = await connect(url, { room: 'ZZZZZZ', name: 'X', password: 'pizza-azul' });
  assert.equal(wrong.first.type, 'error');
  assert.equal(wrong.first.message, missing.first.message);
  await connect(url, { room: 'ZZZZZZ', name: 'X', password: 'x' });
  const blocked = await connect(url, { room: a.first.sala, name: 'X', password: 'pizza-azul' });
  assert.equal(blocked.first.type, 'error');
  assert.match(blocked.first.message, /Muitas tentativas/);
});

test('criar sala sem senha é recusado', async (t) => {
  const { url } = await start(t);
  const a = await connect(url, { create: true, name: 'Ana', password: '' });
  assert.equal(a.first.type, 'error');
});

test('conexão que cai volta com o mesmo número; quem sai pelo botão sai na hora', async (t) => {
  const { url } = await start(t);
  const ca = client();
  const a = await connect(url, { create: true, name: 'Ana', password: 'pizza-azul', client: ca });
  const b = await connect(url, { room: a.first.sala, name: 'Beto', password: 'pizza-azul', client: client() });
  t.after(() => b.ws.terminate());
  a.ws.terminate(); // a internet da Ana piscou
  await new Promise((r) => setTimeout(r, 100));
  assert.equal(b.messages.some((m) => m.type === 'member-left'), false);
  const a2 = await connect(url, { room: a.first.sala, name: 'Ana', password: 'pizza-azul', client: ca, resume: a.first.id });
  t.after(() => a2.ws.terminate());
  assert.equal(a2.first.id, a.first.id);
  assert.equal(a2.first.members.length, 1);
  const back = await b.wait((m) => m.type === 'member-joined');
  assert.equal(back.resumed, true);

  // Outro PC não pode "assumir" o número da Ana
  const fake = await connect(url, { room: a.first.sala, name: 'Falsa', password: 'pizza-azul', client: client(), resume: a.first.id });
  t.after(() => fake.ws.terminate());
  assert.notEqual(fake.first.id, a.first.id);

  a2.send({ type: 'leave' });
  const left = await b.wait((m) => m.type === 'member-left' && m.id === a.first.id, 200);
  assert.equal(left.id, a.first.id);
});

test('quem não volta a tempo sai da sala, e a sala vazia fecha', async (t) => {
  const { url, server } = await start(t);
  const a = await connect(url, { create: true, name: 'Ana', password: 'pizza-azul', client: client() });
  const b = await connect(url, { room: a.first.sala, name: 'Beto', password: 'pizza-azul', client: client() });
  a.ws.terminate();
  await b.wait((m) => m.type === 'member-left' && m.id === a.first.id, 2000);
  b.ws.terminate();
  await new Promise((r) => setTimeout(r, 500));
  assert.equal(server.rooms.size, 0);
});

test('credenciais do TURN no formato do coturn', () => {
  const { username, credential } = turnCredentials('abc', 'SALA-1', 60, 1_000_000);
  assert.equal(username, '1060:SALA-1');
  assert.equal(credential, crypto.createHmac('sha1', 'abc').update('1060:SALA-1').digest('base64'));
});

test('passe de convite: entra sem a senha, só quem entrou com a senha cria passe, e o passe sai junto com quem convidou', async (t) => {
  const { url } = await start(t);
  const passe = crypto.randomBytes(32).toString('base64url');
  const a = await connect(url, { create: true, name: 'Ana', password: 'pizza-azul', client: client() });
  assert.ok(a.first.features.includes('passe'));
  a.send({ type: 'passe', passe });
  await new Promise((r) => setTimeout(r, 50));

  const cb = client();
  const b = await connect(url, { room: a.first.sala, name: 'Beto', passe, client: cb });
  t.after(() => b.ws.terminate());
  assert.equal(b.first.type, 'welcome');

  // Quem entrou pelo passe não consegue criar outro passe
  const outro = crypto.randomBytes(32).toString('base64url');
  b.send({ type: 'passe', passe: outro });
  await new Promise((r) => setTimeout(r, 50));
  const c = await connect(url, { room: a.first.sala, name: 'Caio', passe: outro, client: client() });
  assert.equal(c.first.type, 'error');
  assert.match(c.first.message, /convite não vale/);

  // Passe errado não entra, e um passe com senha errada também não
  const d = await connect(url, { room: a.first.sala, name: 'Duda', password: 'errada', client: client() });
  assert.equal(d.first.type, 'error');

  // A Ana sai: o passe dela deixa de valer para quem chega...
  a.send({ type: 'leave' });
  await b.wait((m) => m.type === 'member-left');
  const e = await connect(url, { room: a.first.sala, name: 'Eva', passe, client: client() });
  assert.equal(e.first.type, 'error');

  // ...mas o Beto, que entrou com ele, ainda volta se a conexão cair
  b.ws.terminate();
  await new Promise((r) => setTimeout(r, 50));
  const b2 = await connect(url, { room: a.first.sala, name: 'Beto', passe, client: cb, resume: b.first.id });
  t.after(() => b2.ws.terminate());
  assert.equal(b2.first.type, 'welcome');
  assert.equal(b2.first.id, b.first.id);
});

test('passe tirado (null) para de valer', async (t) => {
  const { url } = await start(t);
  const passe = crypto.randomBytes(32).toString('base64url');
  const a = await connect(url, { create: true, name: 'Ana', password: 'pizza-azul', client: client() });
  t.after(() => a.ws.terminate());
  a.send({ type: 'passe', passe });
  a.send({ type: 'passe', passe: null });
  await new Promise((r) => setTimeout(r, 50));
  const b = await connect(url, { room: a.first.sala, name: 'Beto', passe, client: client() });
  assert.equal(b.first.type, 'error');
});

test('mudar a senha: só o host; a antiga e os passes param de valer; quem entrou por passe não recebe a nova', async (t) => {
  const { url } = await start(t);
  const passe = crypto.randomBytes(32).toString('base64url');
  const a = await connect(url, { create: true, name: 'Ana', password: 'pizza-azul', client: client() });
  t.after(() => a.ws.terminate());
  assert.ok(a.first.features.includes('senha'));
  a.send({ type: 'passe', passe });
  await new Promise((r) => setTimeout(r, 50));
  const b = await connect(url, { room: a.first.sala, name: 'Beto', password: 'pizza-azul', client: client() });
  t.after(() => b.ws.terminate());
  const cc = client();
  const c = await connect(url, { room: a.first.sala, name: 'Caio', passe, client: cc });
  t.after(() => c.ws.terminate());
  assert.equal(c.first.type, 'welcome');

  // Só o host muda, e no modo Internet a senha precisa do mínimo
  b.send({ type: 'senha', password: 'tentei-mudar' });
  assert.match((await b.wait((m) => m.type === 'senha-erro')).message, /host/);
  a.send({ type: 'senha', password: 'abc' });
  await a.wait((m) => m.type === 'senha-erro');

  a.send({ type: 'senha', password: 'K7P-4MX-Q2R' });
  assert.equal((await b.wait((m) => m.type === 'senha')).password, 'K7P-4MX-Q2R');
  assert.equal((await a.wait((m) => m.type === 'senha')).password, 'K7P-4MX-Q2R');
  const avisoC = await c.wait((m) => m.type === 'senha');
  assert.equal(avisoC.password, undefined, 'quem entrou pelo passe não recebe a senha');
  assert.equal(avisoC.by, a.first.id);

  // A antiga e o passe não entram mais; a nova entra
  assert.equal((await connect(url, { room: a.first.sala, name: 'Duda', password: 'pizza-azul', client: client() })).first.type, 'error');
  assert.equal((await connect(url, { room: a.first.sala, name: 'Eva', passe, client: client() })).first.type, 'error');
  const f = await connect(url, { room: a.first.sala, name: 'Fábio', password: 'K7P-4MX-Q2R', client: client() });
  t.after(() => f.ws.terminate());
  assert.equal(f.first.type, 'welcome');

  // Quem entrou pelo passe ainda volta se a conexão cair
  c.ws.terminate();
  await new Promise((r) => setTimeout(r, 50));
  const c2 = await connect(url, { room: a.first.sala, name: 'Caio', passe, client: cc, resume: c.first.id });
  t.after(() => c2.ws.terminate());
  assert.equal(c2.first.type, 'welcome');
});

test('o host sai: quem está há mais tempo e entrou com a senha assume (e pode mudar a senha)', async (t) => {
  const { url } = await start(t);
  const passe = crypto.randomBytes(32).toString('base64url');
  const a = await connect(url, { create: true, name: 'Ana', password: 'pizza-azul', client: client() });
  a.send({ type: 'passe', passe });
  await new Promise((r) => setTimeout(r, 50));
  const c = await connect(url, { room: a.first.sala, name: 'Caio', passe, client: client() });
  t.after(() => c.ws.terminate());
  const b = await connect(url, { room: a.first.sala, name: 'Beto', password: 'pizza-azul', client: client() });
  t.after(() => b.ws.terminate());
  a.send({ type: 'leave' });
  assert.equal((await b.wait((m) => m.type === 'host')).id, b.first.id, 'o Caio chegou antes, mas entrou pelo passe');
  b.send({ type: 'senha', password: 'nova-senha' });
  assert.equal((await b.wait((m) => m.type === 'senha')).password, 'nova-senha');
});

// Passe da sala (docs/spec/entrar-pelos-amigos.md)
test('passe da sala: vem para todos, inclusive quem entrou por passe, e continua valendo quando quem criou sai', async (t) => {
  const { url } = await start(t);
  const a = await connect(url, { create: true, name: 'Ana', password: 'pizza-azul', client: client() });
  assert.ok(a.first.features.includes('passe-sala'));
  assert.equal(a.first.amigosMembros, true, 'ligado por padrão (app antigo não manda o campo)');
  const passeSala = a.first.passeSala;
  assert.match(passeSala, /^[A-Za-z0-9_-]{43}$/);

  const cb = client();
  const b = await connect(url, { room: a.first.sala, name: 'Beto', passe: passeSala, client: cb });
  t.after(() => b.ws.terminate());
  assert.equal(b.first.type, 'welcome');
  assert.equal(b.first.passeSala, passeSala, 'quem entrou pelo passe também recebe');

  // A Ana (que criou) sai: o passe da sala continua
  a.send({ type: 'leave' });
  await b.wait((m) => m.type === 'member-left');
  const c = await connect(url, { room: a.first.sala, name: 'Caio', passe: passeSala, client: client() });
  t.after(() => c.ws.terminate());
  assert.equal(c.first.type, 'welcome');

  // Quem entrou pelo passe da sala volta com ele se a conexão cair
  b.ws.terminate();
  await new Promise((r) => setTimeout(r, 50));
  const b2 = await connect(url, { room: a.first.sala, name: 'Beto', passe: passeSala, client: cb, resume: b.first.id });
  t.after(() => b2.ws.terminate());
  assert.equal(b2.first.id, b.first.id);
});

test('passe da sala: a chamada cria sem ele, e passe errado conta no limite por IP com a mesma mensagem', async (t) => {
  const { url } = await start(t, { failPerIp: 3 });
  const a = await connect(url, { create: true, name: 'Ana', password: 'pizza-azul', client: client(), amigosMembros: false });
  t.after(() => a.ws.terminate());
  assert.equal(a.first.passeSala, null);
  assert.equal(a.first.amigosMembros, false);
  const errado = crypto.randomBytes(32).toString('base64url');
  for (let i = 0; i < 3; i++) {
    const x = await connect(url, { room: a.first.sala, name: 'Xis', passe: errado, client: client() });
    assert.match(x.first.message, /convite não vale/);
  }
  const y = await connect(url, { room: a.first.sala, name: 'Ypsilon', password: 'pizza-azul', client: client() });
  assert.match(y.first.message, /Muitas tentativas/);
});

test('passe da sala: só o host liga e desliga; desligar tira na hora, ligar cria outro, mudar a senha troca', async (t) => {
  const { url } = await start(t);
  const a = await connect(url, { create: true, name: 'Ana', password: 'pizza-azul', client: client() });
  t.after(() => a.ws.terminate());
  const primeiro = a.first.passeSala;
  const b = await connect(url, { room: a.first.sala, name: 'Beto', passe: primeiro, client: client() });
  t.after(() => b.ws.terminate());

  // Quem não é host não muda; valor que não é booleano é ignorado
  b.send({ type: 'amigos-membros', on: false });
  assert.match((await b.wait((m) => m.type === 'senha-erro')).message, /host/);
  a.send({ type: 'amigos-membros', on: 'nao' });

  // Desligar: todos ficam sabendo, o passe para de valer e quem já entrou fica
  a.send({ type: 'amigos-membros', on: false });
  const desligou = await b.wait((m) => m.type === 'passe-sala');
  assert.deepEqual(desligou, { type: 'passe-sala', passe: null, amigosMembros: false });
  assert.equal((await connect(url, { room: a.first.sala, name: 'Caio', passe: primeiro, client: client() })).first.type, 'error');
  assert.ok(!b.isClosed());

  // Ligar de novo: um passe novo; o antigo continua sem valer
  a.send({ type: 'amigos-membros', on: true });
  const ligou = await b.wait((m) => m.type === 'passe-sala');
  assert.equal(ligou.amigosMembros, true);
  assert.notEqual(ligou.passe, primeiro);
  const d = await connect(url, { room: a.first.sala, name: 'Duda', passe: ligou.passe, client: client() });
  t.after(() => d.ws.terminate());
  assert.equal(d.first.type, 'welcome');

  // Mudar a senha troca o passe da sala
  a.send({ type: 'senha', password: 'K7P-4MX-Q2R' });
  const trocou = await b.wait((m) => m.type === 'passe-sala');
  assert.match(trocou.passe, /^[A-Za-z0-9_-]{43}$/);
  assert.notEqual(trocou.passe, ligou.passe);
  assert.equal((await connect(url, { room: a.first.sala, name: 'Eva', passe: ligou.passe, client: client() })).first.type, 'error');
  const f = await connect(url, { room: a.first.sala, name: 'Fábio', passe: trocou.passe, client: client() });
  t.after(() => f.ws.terminate());
  assert.equal(f.first.type, 'welcome');
});

// ---- Espectador (assistir pelo navegador): docs/spec/assistir-no-navegador.md ----

const pausa = (ms = 150) => new Promise((r) => setTimeout(r, ms));
const ABERTA = { quality: '1080p60', open: true };

async function sala(t, opts) {
  const { url } = await start(t, opts);
  const a = await connect(url, { create: true, name: 'Ana', password: 'pizza-azul', client: client() });
  t.after(() => a.ws.terminate());
  return { url, a };
}
async function entrar(t, url, a, extra = {}) {
  const x = await connect(url, { room: a.first.sala, password: 'pizza-azul', name: 'Beto', client: client(), ...extra });
  t.after(() => x.ws.terminate());
  return x;
}
const espectador = (t, url, a, extra = {}) => entrar(t, url, a, { role: 'espectador', name: 'Zé', ...extra });

test('espectador entra com a senha, recebe um welcome enxuto e fica invisível para a sala', async (t) => {
  const { url, a } = await sala(t);
  const b = await entrar(t, url, a);
  b.send({ type: 'share', sharing: true, info: ABERTA });
  await a.wait((m) => m.type === 'share-state' && m.sharing);
  a.send({ type: 'chat', text: 'conversa da sala' });
  await b.wait((m) => m.type === 'chat');

  const v = await espectador(t, url, a);
  assert.equal(v.first.type, 'welcome');
  assert.equal(v.first.sala, a.first.sala);
  for (const campo of ['chat', 'subsalas', 'musicas', 'passeSala', 'sessao', 'lider', 'amigosMembros']) assert.equal(v.first[campo], undefined, campo);
  assert.ok(v.first.iceServers.length > 0);
  assert.deepEqual(v.first.members, [
    { id: a.first.id, name: 'Ana', sharing: false, shareInfo: null },
    { id: b.first.id, name: 'Beto', sharing: true, shareInfo: ABERTA },
  ]);

  await pausa();
  for (const x of [a, b]) assert.equal(x.messages.findIndex((m) => m.type === 'member-joined' && m.id === v.first.id), -1);
  v.send({ type: 'leave' });
  await pausa();
  for (const x of [a, b]) assert.equal(x.messages.findIndex((m) => m.type === 'member-left'), -1);
});

test('espectador só recebe o estado das transmissões: sem chat, e o que ele escreve não vale', async (t) => {
  const { url, a } = await sala(t);
  const v = await espectador(t, url, a);
  a.send({ type: 'chat', text: 'segredo da sala' });
  await a.wait((m) => m.type === 'chat');
  a.send({ type: 'share', sharing: true, info: ABERTA });
  const estado = await v.wait((m) => m.type === 'share-state');
  assert.equal(estado.id, a.first.id);
  assert.equal(estado.sharing, true);
  assert.equal(v.messages.findIndex((m) => m.type === 'chat'), -1);

  v.send({ type: 'chat', text: 'spam do espectador' });
  v.send({ type: 'share', sharing: true, info: ABERTA });
  v.send({ type: 'voice-state', session: 'abc', channel: '' });
  await pausa();
  a.send({ type: 'chat', text: 'fim' });
  await a.wait((m) => m.type === 'chat' && m.text === 'fim');
  assert.equal(a.messages.findIndex((m) => (m.type === 'chat' && m.text !== 'fim') || m.type === 'share-state' || m.type === 'voice-state'), -1);
});

test('espectador pede para assistir (once vira false) e recebe a oferta de quem transmite', async (t) => {
  const { url, a } = await sala(t);
  a.send({ type: 'share', sharing: true, info: ABERTA });
  await pausa();
  const v = await espectador(t, url, a);
  assert.equal(v.first.members.find((m) => m.id === a.first.id).sharing, true);

  v.send({ type: 'signal', to: a.first.id, data: { side: 'viewer', subscribe: true, once: true } });
  const pedido = await a.wait((m) => m.type === 'signal');
  assert.equal(pedido.from, v.first.id);
  assert.deepEqual(pedido.data, { side: 'viewer', subscribe: true, once: false });

  a.send({ type: 'signal', to: v.first.id, data: { side: 'sharer', sdp: { type: 'offer', sdp: 'v=0' } } });
  const oferta = await v.wait((m) => m.type === 'signal');
  assert.equal(oferta.from, a.first.id);
  assert.equal(oferta.data.side, 'sharer');
});

test('espectador não fala em voz nem pede a quem não transmite ou fechou a transmissão', async (t) => {
  const { url, a } = await sala(t);
  const b = await entrar(t, url, a);
  const v = await espectador(t, url, a);
  b.send({ type: 'share', sharing: true, info: { quality: '720p30', open: false } });
  await v.wait((m) => m.type === 'share-state');

  v.send({ type: 'signal', to: a.first.id, data: { side: 'viewer', subscribe: true } }); // Ana não transmite
  v.send({ type: 'signal', to: b.first.id, data: { side: 'viewer', subscribe: true } }); // transmissão fechada ao canal
  v.send({ type: 'signal', to: v.first.id, data: { side: 'viewer', subscribe: true } }); // ele mesmo
  a.send({ type: 'share', sharing: true, info: ABERTA });
  await v.wait((m) => m.type === 'share-state' && m.id === a.first.id);
  v.send({ type: 'signal', to: a.first.id, data: { side: 'voice', session: 'x', targetSession: 'y' } });
  v.send({ type: 'signal', to: a.first.id, data: { side: 'lider', role: 'falar' } });
  v.send({ type: 'signal', to: a.first.id, data: { side: 'sharer', sdp: { type: 'offer', sdp: 'v=0' } } });
  v.send({ type: 'signal', to: a.first.id, data: { side: 'viewer', subscribe: true } }); // esta passa
  const unico = await a.wait((m) => m.type === 'signal');
  assert.equal(unico.data.side, 'viewer');
  await pausa();
  assert.equal(a.messages.findIndex((m) => m.type === 'signal'), -1);
  assert.equal(b.messages.findIndex((m) => m.type === 'signal'), -1);
});

test('limite de espectadores por sala: o sexto recebe erro e sair libera a vaga', async (t) => {
  const { url, a } = await sala(t);
  const cinco = [];
  for (let i = 0; i < 5; i++) cinco.push(await espectador(t, url, a));
  assert.ok(cinco.every((x) => x.first.type === 'welcome'));
  const sexto = await espectador(t, url, a);
  assert.equal(sexto.first.type, 'error');
  cinco[0].send({ type: 'leave' });
  await pausa();
  assert.equal((await espectador(t, url, a)).first.type, 'welcome');
  // espectador não conta na vaga das pessoas
  assert.equal((await entrar(t, url, a)).first.type, 'welcome');
});

test('espectador nunca cria sala; sala inexistente, senha errada e criar respondem igual', async (t) => {
  const { url, a } = await sala(t);
  const erradas = [
    await espectador(t, url, a, { password: 'senha-errada' }),
    await connect(url, { room: 'ZZZZZZ', password: 'pizza-azul', role: 'espectador', client: client() }),
    await connect(url, { create: true, password: 'pizza-azul', role: 'espectador', client: client() }),
  ];
  for (const x of erradas) assert.equal(x.first.type, 'error');
  assert.equal(new Set(erradas.map((x) => x.first.message)).size, 1);
  const saude = await (await fetch(url.replace('ws:', 'http:') + '/health')).json();
  assert.equal(saude.salas, 1);
});

test('host sai: o próximo host nunca é espectador, e a sala fecha quando só sobram espectadores', async (t) => {
  const { url, a } = await sala(t);
  const b = await entrar(t, url, a);
  const v = await espectador(t, url, a);
  a.send({ type: 'leave' });
  const novo = await b.wait((m) => m.type === 'host');
  assert.equal(novo.id, b.first.id);
  await v.wait((m) => m.type === 'member-left' && m.id === a.first.id);
  assert.equal(v.messages.findIndex((m) => m.type === 'host'), -1);

  b.send({ type: 'leave' });
  const deadline = Date.now() + 3000;
  while (!v.isClosed() && Date.now() < deadline) await pausa(10);
  assert.ok(v.isClosed());
  const c = await connect(url, { room: a.first.sala, password: 'pizza-azul', client: client() });
  t.after(() => c.ws.terminate());
  assert.equal(c.first.type, 'error');
});

test('espectador que cai sem sair: quem transmite recebe o unsubscribe (uma vez só)', async (t) => {
  const { url, a } = await sala(t);
  a.send({ type: 'share', sharing: true, info: ABERTA });
  await pausa();
  const v = await espectador(t, url, a);
  v.send({ type: 'signal', to: a.first.id, data: { side: 'viewer', subscribe: true } });
  await a.wait((m) => m.type === 'signal' && m.data.subscribe);
  v.ws.terminate(); // fechou a aba, o iPhone suspendeu o Safari, a rede caiu
  const fim = await a.wait((m) => m.type === 'signal' && m.data.unsubscribe);
  assert.equal(fim.from, v.first.id);
  assert.equal(fim.data.side, 'viewer');

  // Quem já avisou que parou de assistir não gera um segundo aviso ao sair
  const w = await espectador(t, url, a);
  w.send({ type: 'signal', to: a.first.id, data: { side: 'viewer', subscribe: true } });
  w.send({ type: 'signal', to: a.first.id, data: { side: 'viewer', unsubscribe: true } });
  await a.wait((m) => m.type === 'signal' && m.from === w.first.id && m.data.unsubscribe);
  w.send({ type: 'leave' });
  await pausa();
  assert.equal(a.messages.findIndex((m) => m.type === 'signal' && m.from === w.first.id && m.data.unsubscribe), -1);
});

test('espectador consegue parar de assistir mesmo se a transmissão foi fechada ou parou; pedir de novo continua barrado', async (t) => {
  const { url, a } = await sala(t);
  a.send({ type: 'share', sharing: true, info: ABERTA });
  await pausa();
  const v = await espectador(t, url, a);
  v.send({ type: 'signal', to: a.first.id, data: { side: 'viewer', subscribe: true } });
  await a.wait((m) => m.type === 'signal' && m.data.subscribe);

  a.send({ type: 'share', sharing: true, info: { quality: '1080p60', open: false } }); // fechou ao canal
  await v.wait((m) => m.type === 'share-state' && m.info?.open === false);
  v.send({ type: 'signal', to: a.first.id, data: { side: 'viewer', unsubscribe: true } });
  assert.equal((await a.wait((m) => m.type === 'signal')).data.unsubscribe, true);
  v.send({ type: 'signal', to: a.first.id, data: { side: 'viewer', subscribe: true } });

  a.send({ type: 'share', sharing: false }); // parou
  await v.wait((m) => m.type === 'share-state' && m.sharing === false);
  v.send({ type: 'signal', to: a.first.id, data: { side: 'viewer', unsubscribe: true } });
  assert.equal((await a.wait((m) => m.type === 'signal')).data.unsubscribe, true);
  await pausa();
  assert.equal(a.messages.findIndex((m) => m.type === 'signal'), -1); // o subscribe barrado não chegou
});

test('espectador não entra com passe de convite (na v1 só com a senha)', async (t) => {
  const { url, a } = await sala(t);
  assert.match(a.first.passeSala, /^[A-Za-z0-9_-]{43}$/);
  const v = await connect(url, { room: a.first.sala, passe: a.first.passeSala, role: 'espectador', name: 'Zé', client: client() });
  t.after(() => v.ws.terminate());
  assert.equal(v.first.type, 'error');
  const b = await connect(url, { room: a.first.sala, passe: a.first.passeSala, name: 'Beto', client: client() }); // quem não é espectador entra
  t.after(() => b.ws.terminate());
  assert.equal(b.first.type, 'welcome');
});

// ---- Convidado (entrar na conversa pelo navegador): docs/spec/convidado-web.md ----

const convidado = (t, url, a, extra = {}) => entrar(t, url, a, { role: 'convidado', name: 'Maria', ...extra });
const VOZ = { channel: '', muted: false, deafened: false };

test('convidado entra visível, com o rótulo imposto pelo servidor e sem se passar por app (versão, líder, foto)', async (t) => {
  const { url, a } = await sala(t);
  const c = await convidado(t, url, a, { name: 'X'.repeat(50), version: '99.0.0', lider: true, avatar: 'a'.repeat(64) });
  assert.equal(c.first.type, 'welcome');
  const entrou = await a.wait((m) => m.type === 'member-joined' && m.id === c.first.id);
  assert.equal(entrou.name, `${'X'.repeat(20)} (convidado)`);
  assert.equal(entrou.name.length, 32);
  assert.equal(entrou.version, '');
  assert.equal(entrou.lider, false);
  assert.equal(entrou.avatar, '');
  assert.equal(c.first.members.find((m) => m.id === a.first.id).name, 'Ana'); // ele enxerga a sala inteira
  assert.equal(c.first.passeSala, undefined); // não recebe o passe da sala
  assert.equal(c.first.amigosMembros, undefined);
  const sem = await convidado(t, url, a, { name: '   ' });
  assert.equal(sem.first.type, 'welcome');
  assert.equal((await a.wait((m) => m.type === 'member-joined' && m.id === sem.first.id)).name, 'Visitante (convidado)');
  // Controle e caracteres que invertem o texto ou somem não entram no nome
  const sujo = await convidado(t, url, a, { name: '‮Ana\u0000​⁦' });
  assert.equal((await a.wait((m) => m.type === 'member-joined' && m.id === sujo.first.id)).name, 'Ana (convidado)');
});

test('convidado recebe sala e welcome enxutos (sem chat nem dados de perfil) e só pede para assistir a pessoas', async (t) => {
  const { url, a } = await sala(t);
  a.send({ type: 'chat', text: 'conversa antiga da sala' });
  await a.wait((m) => m.type === 'chat');
  a.send({ type: 'share', sharing: true, info: ABERTA });
  const b = await entrar(t, url, a, { avatar: 'c'.repeat(64) });
  const c = await convidado(t, url, a);
  for (const campo of ['chat', 'subsalas', 'musicas', 'lider', 'sessao', 'passeSala', 'amigosMembros']) assert.equal(c.first[campo], undefined, campo);
  const noWelcome = c.first.members.find((m) => m.id === b.first.id);
  assert.deepEqual(Object.keys(noWelcome).sort(), ['deafened', 'id', 'muted', 'name', 'shareInfo', 'sharing', 'voiceChannel', 'voiceIdade', 'voiceSession']);

  a.send({ type: 'chat', text: 'conversa ao vivo' });
  await b.wait((m) => m.type === 'chat' && m.text === 'conversa ao vivo');
  const d = await entrar(t, url, a, { name: 'Duda', avatar: 'e'.repeat(64), version: '1.20.7' });
  const chegou = await c.wait((m) => m.type === 'member-joined' && m.id === d.first.id);
  assert.equal(chegou.name, 'Duda');
  for (const campo of ['avatar', 'avatarFull', 'razze', 'version', 'addrs', 'nameFont']) assert.equal(chegou[campo], undefined, campo);
  assert.equal(c.messages.findIndex((m) => m.type === 'chat'), -1);

  // Assistir só vale para pessoa de verdade: nada para espectador, outro convidado, ele mesmo ou id que não existe
  const v = await espectador(t, url, a);
  const c2 = await convidado(t, url, a, { name: 'Outro' });
  for (const to of [v.first.id, c2.first.id, c.first.id, 'x'.repeat(1000)]) c.send({ type: 'signal', to, data: { side: 'viewer', subscribe: true } });
  c.send({ type: 'signal', to: a.first.id, data: { side: 'viewer', subscribe: true } }); // esta passa
  await a.wait((m) => m.type === 'signal' && m.data.subscribe);
  c.ws.terminate();
  await a.wait((m) => m.type === 'signal' && m.data.unsubscribe);
  await pausa();
  assert.equal(a.messages.findIndex((m) => m.type === 'signal'), -1); // um unsubscribe só
  for (const x of [v, c2]) assert.equal(x.messages.findIndex((m) => m.type === 'signal'), -1);
});

test('IP de quem conectou: o X-Forwarded-For só vale vindo de rede privada (o Caddy), nunca de fora', () => {
  assert.equal(ipReal('203.0.113.9', '1.2.3.4', true), '203.0.113.9'); // de fora com cabeçalho forjado
  assert.equal(ipReal('172.18.0.2', '198.51.100.7', true), '198.51.100.7'); // o Caddy no Docker
  assert.equal(ipReal('::ffff:172.18.0.1', '8.8.8.8, 198.51.100.7', true), '198.51.100.7'); // vale o último
  assert.equal(ipReal('127.0.0.1', '5.5.5.5', true), '5.5.5.5');
  assert.equal(ipReal('::1', '6.6.6.6', true), '6.6.6.6');
  assert.equal(ipReal('10.0.0.5', '', true), '10.0.0.5'); // sem cabeçalho
  assert.equal(ipReal('172.32.0.1', '1.1.1.1', true), '172.32.0.1'); // fora de 172.16/12
  assert.equal(ipReal('127.0.0.1', '5.5.5.5', false), '127.0.0.1'); // TRUST_PROXY desligado
  assert.equal(ipReal(undefined, '5.5.5.5', true), '?');
});

test('convidado não recebe o passe da sala nem a senha nova, e só a lista branca do que manda vale', async (t) => {
  const { url, a } = await sala(t);
  const b = await entrar(t, url, a);
  const c = await convidado(t, url, a);
  await a.wait((m) => m.type === 'member-joined' && m.id === c.first.id);

  a.send({ type: 'amigos-membros', on: false });
  await b.wait((m) => m.type === 'passe-sala');
  a.send({ type: 'senha', password: 'outra-senha-forte' });
  await b.wait((m) => m.type === 'senha');
  await pausa();
  assert.equal(c.messages.findIndex((m) => m.type === 'passe-sala' || m.type === 'senha'), -1);

  // Fora da lista branca: ignorado, sem resposta de erro
  c.send({ type: 'share', sharing: true, info: ABERTA });
  c.send({ type: 'chat', text: 'oi do convidado' });
  c.send({ type: 'avatar', hash: 'b'.repeat(64) });
  c.send({ type: 'name-font', font: 'cinzel' });
  c.send({ type: 'passe', passe: 'p'.repeat(43) });
  c.send({ type: 'senha', password: 'tomei-a-sala' });
  c.send({ type: 'amigos-membros', on: true });
  c.send({ type: 'signal', to: a.first.id, data: { side: 'lider', role: 'ouvir' } });
  c.send({ type: 'signal', to: a.first.id, data: { side: 'foto', pedir: true } });
  c.send({ type: 'voice-state', session: 'sc-1', ...VOZ }); // esta passa
  await a.wait((m) => m.type === 'voice-state' && m.id === c.first.id && m.session === 'sc-1');
  await pausa();
  for (const x of [a, b]) assert.equal(x.messages.findIndex((m) => ['share-state', 'chat', 'avatar-state', 'name-font-state', 'signal'].includes(m.type)), -1);
  assert.equal(c.messages.findIndex((m) => m.type === 'senha-erro' || m.type === 'error'), -1);
});

test('voz entre convidado e membro: o servidor repassa só com sessão e canal certos', async (t) => {
  const { url, a } = await sala(t);
  a.send({ type: 'voice-state', session: 'sa', ...VOZ });
  await a.wait((m) => m.type === 'voice-state' && m.id === a.first.id);
  const c = await convidado(t, url, a);
  const estado = c.first.members.find((m) => m.id === a.first.id);
  assert.equal(estado.voiceSession, 'sa');
  c.send({ type: 'voice-state', session: 'sc', ...VOZ });
  assert.equal((await a.wait((m) => m.type === 'voice-state' && m.id === c.first.id)).session, 'sc');

  const oferta = { type: 'offer', sdp: 'v=0' };
  c.send({ type: 'signal', to: a.first.id, data: { side: 'voice', session: 'sc', targetSession: 'errada', call: 'k0', sdp: oferta } }); // descartada
  c.send({ type: 'signal', to: a.first.id, data: { side: 'voice', session: 'sc', targetSession: 'sa', call: 'k1', sdp: oferta } });
  const chegou = await a.wait((m) => m.type === 'signal');
  assert.equal(chegou.from, c.first.id);
  assert.equal(chegou.data.call, 'k1');
  a.send({ type: 'signal', to: c.first.id, data: { side: 'voice', session: 'sa', targetSession: 'sc', call: 'k1', sdp: { type: 'answer', sdp: 'v=0' } } });
  assert.equal((await c.wait((m) => m.type === 'signal')).data.sdp.type, 'answer');
  await pausa();
  assert.equal(a.messages.findIndex((m) => m.type === 'signal'), -1); // a da sessão errada não chegou
});

test('convidado assiste a tela (once vira false) e, se cair sem avisar, quem transmite larga o link e a sala vê que ele saiu', async (t) => {
  const { url, a } = await sala(t);
  a.send({ type: 'share', sharing: true, info: ABERTA });
  await pausa();
  const c = await convidado(t, url, a);
  assert.equal(c.first.members.find((m) => m.id === a.first.id).sharing, true);
  c.send({ type: 'signal', to: a.first.id, data: { side: 'viewer', subscribe: true, once: true } });
  const pedido = await a.wait((m) => m.type === 'signal' && m.data.subscribe);
  assert.deepEqual(pedido.data, { side: 'viewer', subscribe: true, once: false });
  c.ws.terminate();
  assert.equal((await a.wait((m) => m.type === 'signal' && m.data.unsubscribe)).from, c.first.id);
  await a.wait((m) => m.type === 'member-left' && m.id === c.first.id);
});

test('convidado nunca vira host e a sala fecha quando só sobram convidados', async (t) => {
  const { url, a } = await sala(t);
  const c = await convidado(t, url, a); // entra antes do b: é mais antigo
  const b = await entrar(t, url, a);
  a.send({ type: 'leave' });
  assert.equal((await b.wait((m) => m.type === 'host')).id, b.first.id);
  b.send({ type: 'leave' });
  const deadline = Date.now() + 3000;
  while (!c.isClosed() && Date.now() < deadline) await pausa(10);
  assert.ok(c.isClosed());
  const volta = await connect(url, { room: a.first.sala, password: 'pizza-azul', client: client() });
  t.after(() => volta.ws.terminate());
  assert.equal(volta.first.type, 'error');
});

test('limite de convidados é à parte das pessoas; convidado não cria sala nem entra por passe', async (t) => {
  const { url, a } = await sala(t, { maxConvidados: 2 });
  const c1 = await convidado(t, url, a);
  await convidado(t, url, a);
  const terceiro = await convidado(t, url, a);
  assert.equal(terceiro.first.type, 'error');
  c1.send({ type: 'leave' });
  await pausa();
  assert.equal((await convidado(t, url, a)).first.type, 'welcome');
  assert.equal((await entrar(t, url, a)).first.type, 'welcome'); // pessoa normal não perde vaga

  const sem = [
    await connect(url, { create: true, password: 'pizza-azul', role: 'convidado', client: client() }),
    await connect(url, { room: a.first.sala, passe: a.first.passeSala, role: 'convidado', client: client() }),
    await convidado(t, url, a, { password: 'errada' }),
  ];
  for (const x of sem) { t.after(() => x.ws.terminate()); assert.equal(x.first.type, 'error'); }
});

test('serve a página /ver com CSP e só os arquivos da lista', async (t) => {
  const { url } = await start(t);
  const base = url.replace('ws:', 'http:');
  const pagina = await fetch(`${base}/ver`);
  assert.equal(pagina.status, 200);
  assert.match(pagina.headers.get('content-type'), /^text\/html/);
  const csp = pagina.headers.get('content-security-policy');
  assert.match(csp, /default-src 'none'/);
  assert.match(csp, /script-src 'self'(;|$)/);
  assert.doesNotMatch(csp, /unsafe-/);
  assert.equal(pagina.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(pagina.headers.get('referrer-policy'), 'no-referrer');
  assert.match(await pagina.text(), /<script src="\/ver\.js"/);

  assert.equal((await fetch(`${base}/ver?sala=ABC234`)).status, 200);
  const js = await fetch(`${base}/ver.js`);
  assert.equal(js.status, 200);
  assert.match(js.headers.get('content-type'), /javascript/);
  const voz = await fetch(`${base}/voz.js`);
  assert.equal(voz.status, 200);
  assert.match(voz.headers.get('content-type'), /javascript/);
  assert.match(voz.headers.get('content-security-policy'), /default-src 'none'/);
  const css = await fetch(`${base}/ver.css`);
  assert.equal(css.status, 200);
  assert.match(css.headers.get('content-type'), /^text\/css/);

  for (const caminho of ['/server.js', '/ver/', '/ver.html', '/package.json', '/vps/instalar.sh']) assert.equal((await fetch(base + caminho)).status, 404, caminho);
  assert.equal((await fetch(`${base}/health`)).status, 200);
});

// Ligação (chamada.js): todo mundo que entra fica sabendo que é ligação, até quem entra pelo passe da sala ou digitando
// a senha, e por isso não anuncia a sala aos amigos (docs/spec/entrar-pelos-amigos.md)
test('ligação: a marca chamada vem no welcome de todos; sala comum não tem', async (t) => {
  const { url } = await start(t);
  const a = await connect(url, { create: true, name: 'Ana', password: 'pizza-azul', client: client(), chamada: true, entendeChamada: true });
  t.after(() => a.ws.terminate());
  assert.equal(a.first.chamada, true);
  const b = await connect(url, { room: a.first.sala, name: 'Beto', passe: a.first.passeSala, client: client() });
  t.after(() => b.ws.terminate());
  assert.equal(b.first.chamada, true, 'quem entrou pelo passe da sala');
  const c = await connect(url, { room: a.first.sala, name: 'Cris', password: 'pizza-azul', client: client() });
  t.after(() => c.ws.terminate());
  assert.equal(c.first.chamada, true, 'quem digitou a senha');
  const comum = await connect(url, { create: true, name: 'Duda', password: 'pizza-azul', client: client(), chamada: 'sim' });
  t.after(() => comum.ws.terminate());
  assert.equal(comum.first.chamada, undefined, 'só true liga');
});

test('ligação: app antigo (sem entendeChamada) não recebe o passe da sala, para não anunciar a ligação', async (t) => {
  const { url } = await start(t);
  const a = await connect(url, { create: true, name: 'Ana', password: 'pizza-azul', client: client(), chamada: true, entendeChamada: true });
  t.after(() => a.ws.terminate());
  assert.ok(a.first.features.includes('chamada'));
  assert.match(a.first.passeSala, /^[A-Za-z0-9_-]{43}$/);
  const velho = await connect(url, { room: a.first.sala, name: 'Velho', password: 'pizza-azul', client: client() });
  t.after(() => velho.ws.terminate());
  assert.equal(velho.first.passeSala, null, 'app antigo fica sem o passe da ligação');
  const novo = await connect(url, { room: a.first.sala, name: 'Novo', password: 'pizza-azul', client: client(), entendeChamada: true });
  t.after(() => novo.ws.terminate());
  assert.equal(novo.first.passeSala, a.first.passeSala);
});

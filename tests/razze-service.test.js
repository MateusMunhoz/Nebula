'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createApiServer } = require('../razze-api/server');
const { createRazzeService } = require('../main/razze-service');

test('Electron service configura a API, persiste token protegido e expõe redes', async () => {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'razze-service-'));
  const server = createApiServer({ dbPath: ':memory:', requireApproval: false, stun: false });
  const address = await server.listen(0, '127.0.0.1');
  const app = { getPath: () => profile };
  const safeStorage = {
    isEncryptionAvailable: () => true,
    encryptString: (value) => Buffer.from('sealed:' + value),
    decryptString: (value) => value.toString().slice('sealed:'.length),
  };
  const wireguard = {};
  try {
    const first = createRazzeService({ app, safeStorage, wireguard });
    first.configure('http://127.0.0.1:' + address.port);
    const created = await first.register('gui@example.com', 'senha-1234', 'GUI Teste');
    assert.equal(created.status, 'active');
    const login = await first.login('gui@example.com', 'senha-1234');
    assert.equal(login.user.displayName, 'GUI Teste');
    assert.equal(first.state().authenticated, true);

    const second = createRazzeService({ app, safeStorage, wireguard });
    assert.equal(second.state().authenticated, true);
    assert.equal((await second.me()).user.email, 'gui@example.com');
    const network = await second.createNetwork({ name: 'Rede via Electron', visibility: 'private' });
    assert.equal((await second.listNetworks()).networks[0].id, network.network.id);
    await second.logout();
    assert.equal(second.state().authenticated, false);
  } finally {
    await server.close();
    fs.rmSync(profile, { recursive: true, force: true });
  }
});

test('Perfil novo já vem com a RazzeAPI da equipe; endereço salvo continua valendo', () => {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'razze-service-'));
  const app = { getPath: () => profile };
  const safeStorage = { isEncryptionAvailable: () => false };
  try {
    const novo = createRazzeService({ app, safeStorage, wireguard: {}, baseUrl: 'https://api.exemplo.com' });
    assert.deepEqual(novo.state(), { configured: true, baseUrl: 'https://api.exemplo.com', authenticated: false });
    novo.configure('http://127.0.0.1:9');
    const depois = createRazzeService({ app, safeStorage, wireguard: {}, baseUrl: 'https://api.exemplo.com' });
    assert.equal(depois.state().baseUrl, 'http://127.0.0.1:9');
    const semPadrao = createRazzeService({ app: { getPath: () => path.join(profile, 'outro') }, safeStorage, wireguard: {}, baseUrl: '' });
    assert.equal(semPadrao.state().configured, false);
  } finally {
    fs.rmSync(profile, { recursive: true, force: true });
  }
});

// Sessão que caía sem motivo (docs/razze-api.md, Sessões): falha ao decifrar não apaga o token guardado
test('decifrar falhou (Keychain negou): continua guardado e volta quando o cofre abre', () => {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'razze-service-'));
  const app = { getPath: () => profile };
  const bom = { isEncryptionAvailable: () => true, encryptString: (v) => Buffer.from('sealed:' + v), decryptString: (v) => v.toString().slice(7) };
  const negado = { ...bom, decryptString: () => { throw new Error('Keychain negou'); } };
  const arquivo = path.join(profile, 'razze', 'session.json');
  try {
    fs.mkdirSync(path.dirname(arquivo), { recursive: true });
    fs.writeFileSync(arquivo, JSON.stringify({ baseUrl: 'http://127.0.0.1:9', secret: Buffer.from('sealed:' + 't'.repeat(43)).toString('base64') }));
    const falhou = createRazzeService({ app, safeStorage: negado, wireguard: {} });
    assert.equal(falhou.state().authenticated, false);
    falhou.configure('http://127.0.0.1:9'); // regrava o arquivo (mesmo endereço)
    assert.notEqual(JSON.parse(fs.readFileSync(arquivo, 'utf8')).secret, '', 'não apagou o token guardado');
    const semCofre = createRazzeService({ app, safeStorage: { isEncryptionAvailable: () => false }, wireguard: {} });
    semCofre.configure('http://127.0.0.1:9');
    assert.notEqual(JSON.parse(fs.readFileSync(arquivo, 'utf8')).secret, '', 'cofre indisponível também não apaga');
    assert.equal(createRazzeService({ app, safeStorage: bom, wireguard: {} }).state().authenticated, true);
  } finally {
    fs.rmSync(profile, { recursive: true, force: true });
  }
});

test('só "sessão inválida" do servidor desloga: 403 de proxy ou senha errada numa ação não', async () => {
  const http = require('node:http');
  let resposta = { status: 403, corpo: '<html>Forbidden</html>' };
  const srv = http.createServer((req, res) => { res.writeHead(resposta.status, { 'Content-Type': 'application/json' }); res.end(resposta.corpo); });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'razze-service-'));
  const app = { getPath: () => profile };
  const safeStorage = { isEncryptionAvailable: () => true, encryptString: (v) => Buffer.from('sealed:' + v), decryptString: (v) => v.toString().slice(7) };
  const url = `http://127.0.0.1:${srv.address().port}`;
  try {
    fs.mkdirSync(path.join(profile, 'razze'), { recursive: true });
    fs.writeFileSync(path.join(profile, 'razze', 'session.json'), JSON.stringify({ baseUrl: url, secret: Buffer.from('sealed:' + 't'.repeat(43)).toString('base64') }));
    const s = createRazzeService({ app, safeStorage, wireguard: {} });
    const geracao = s.sessao();
    await assert.rejects(s.me());
    assert.equal(s.state().authenticated, true, '403 sem código (proxy, Wi-Fi) não desloga');
    resposta = { status: 401, corpo: JSON.stringify({ error: { code: 'invalid_credentials', message: 'A senha está incorreta.' } }) };
    await assert.rejects(s.me());
    assert.equal(s.state().authenticated, true, '401 de senha errada não desloga');
    resposta = { status: 401, corpo: JSON.stringify({ error: { code: 'unauthorized', message: 'Sessão inválida ou expirada.' } }) };
    await assert.rejects(s.me());
    assert.equal(s.state().authenticated, false, 'sessão inválida desloga');
    assert.notEqual(s.sessao(), geracao, 'trocar a sessão muda a geração (presença não desloga um login novo)');
  } finally {
    srv.close();
    fs.rmSync(profile, { recursive: true, force: true });
  }
});

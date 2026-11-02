// Conferência do emissor sem rede externa: credencial que o coturn aceita (HMAC do usuário), formato e limite por IP.
// Rode com: node turn/teste-emissor.mjs
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { criarEmissor, credencial } from './emissor.mjs';

const SEGREDO = 'segredo-de-teste-bem-comprido';
const c = credencial(SEGREDO, 'abc', 3600, 1700000000000);
assert.equal(c.username, '1700003600:abc');
assert.equal(c.credential, crypto.createHmac('sha1', SEGREDO).update('1700003600:abc').digest('base64'));
console.log('ok - credencial no formato do use-auth-secret do coturn');

assert.throws(() => criarEmissor({ segredo: 'curto', host: 'turn.exemplo.com' }));
assert.throws(() => criarEmissor({ segredo: SEGREDO, host: 'turn exemplo' }));
console.log('ok - recusa segredo curto e host inválido');

const servidor = criarEmissor({ segredo: SEGREDO, host: 'turn.exemplo.com', limitePorHora: 3 });
await new Promise((r) => servidor.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${servidor.address().port}`;
const r1 = await fetch(base + '/v1/turn');
const corpo = await r1.json();
assert.equal(r1.status, 200);
assert.equal(r1.headers.get('cache-control'), 'no-store');
assert.deepEqual(corpo.iceServers[0].urls, ['stun:turn.exemplo.com:3479', 'turn:turn.exemplo.com:3479?transport=udp', 'turn:turn.exemplo.com:3479?transport=tcp']);
const [validade] = corpo.iceServers[0].username.split(':');
assert.ok(Number(validade) > Date.now() / 1000 + 3 * 3600);
assert.equal(corpo.iceServers[0].credential, crypto.createHmac('sha1', SEGREDO).update(corpo.iceServers[0].username).digest('base64'));
console.log('ok - GET /v1/turn devolve STUN + TURN (UDP e TCP) com acesso de 4 h');

assert.equal((await fetch(base + '/outra')).status, 404);
assert.equal((await fetch(base + '/v1/turn', { method: 'POST' })).status, 404);
await fetch(base + '/v1/turn');
await fetch(base + '/v1/turn');
assert.equal((await fetch(base + '/v1/turn')).status, 429);
console.log('ok - só GET /v1/turn; o quarto pedido do mesmo IP na hora recebe 429');
servidor.close();

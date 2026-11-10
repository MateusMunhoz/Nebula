'use strict';
// Sessões da conta (docs/razze-api.md, Sessões): entrar em outro PC não derruba o primeiro (até 5 por tipo de
// aparelho), reiniciar o servidor não derruba ninguém, e passou do limite cai a usada há mais tempo
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createApiServer } = require('../razze-api/server');

const espera = () => new Promise((r) => setTimeout(r, 5));

async function abrir(dbPath) {
  const server = createApiServer({ dbPath, requireApproval: false, stun: false });
  const { port } = await server.listen(0, '127.0.0.1');
  const req = async (pathname, body, token) => {
    const r = await fetch(`http://127.0.0.1:${port}${pathname}`, {
      method: body ? 'POST' : 'GET',
      headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: 'Bearer ' + token } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: r.status, body: await r.json().catch(() => ({})) };
  };
  const entrar = async (email) => { await espera(); return (await req('/v1/auth/login', { login: email, password: 'senha-1234' })).body.accessToken; };
  return { server, req, entrar };
}

test('entrar em outro PC não derruba o primeiro; passou de 5, cai a mais antiga', async () => {
  const { server, req, entrar } = await abrir(':memory:');
  try {
    assert.equal((await req('/v1/auth/register', { email: 'ana@exemplo.com', password: 'senha-1234', displayName: 'Ana' })).status, 201);
    const tokens = [];
    for (let i = 0; i < 5; i++) tokens.push(await entrar('ana@exemplo.com'));
    for (const t of tokens) { assert.equal((await req('/v1/me', null, t)).status, 200, 'as 5 sessões de PC valem juntas'); await espera(); }
    const sexta = await entrar('ana@exemplo.com');
    assert.equal((await req('/v1/me', null, tokens[0])).status, 401, 'a usada há mais tempo cai');
    for (const t of [...tokens.slice(1), sexta]) assert.equal((await req('/v1/me', null, t)).status, 200);
  } finally { await server.close(); }
});

test('reiniciar o servidor não derruba as sessões; a criada primeiro, mas usada, fica', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'razze-sessoes-'));
  const dbPath = path.join(dir, 'razze.db');
  let atual = null;
  try {
    atual = await abrir(dbPath);
    await atual.req('/v1/auth/register', { email: 'bia@exemplo.com', password: 'senha-1234', displayName: 'Bia' });
    const pcDeTodoDia = await atual.entrar('bia@exemplo.com');
    const esquecido = await atual.entrar('bia@exemplo.com');
    await atual.server.close();
    atual = await abrir(dbPath);
    assert.equal((await atual.req('/v1/me', null, esquecido)).status, 200, 'reiniciar não derruba');
    await espera();
    assert.equal((await atual.req('/v1/me', null, pcDeTodoDia)).status, 200, 'reiniciar não derruba');
    for (let i = 0; i < 4; i++) await atual.entrar('bia@exemplo.com'); // 6 sessões
    assert.equal((await atual.req('/v1/me', null, esquecido)).status, 401, 'cai a usada há mais tempo');
    assert.equal((await atual.req('/v1/me', null, pcDeTodoDia)).status, 200, 'a criada primeiro, mas usada, fica');
    await atual.server.close();
    atual = await abrir(dbPath);
    assert.equal((await atual.req('/v1/me', null, pcDeTodoDia)).status, 200, 'e continua depois de reiniciar');
  } finally {
    await atual?.server.close().catch(() => {});
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('sessão em uso se renova: quem abre o app não cai no fim do prazo', async () => {
  const server = createApiServer({ dbPath: ':memory:', requireApproval: false, stun: false, tokenTtlMs: 400 });
  const { port } = await server.listen(0, '127.0.0.1');
  const req = async (pathname, body, token) => (await fetch(`http://127.0.0.1:${port}${pathname}`, {
    method: body ? 'POST' : 'GET',
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  }));
  const dorme = (ms) => new Promise((r) => setTimeout(r, ms));
  try {
    await req('/v1/auth/register', { email: 'cris@exemplo.com', password: 'senha-1234', displayName: 'Cris' });
    const usado = (await (await req('/v1/auth/login', { login: 'cris@exemplo.com', password: 'senha-1234' })).json()).accessToken;
    const parado = (await (await req('/v1/auth/login', { login: 'cris@exemplo.com', password: 'senha-1234' })).json()).accessToken;
    await dorme(250);
    assert.equal((await req('/v1/me', null, usado)).status, 200); // passou da metade do prazo: renova
    await dorme(250);
    assert.equal((await req('/v1/me', null, usado)).status, 200, 'renovou com o uso');
    assert.equal((await req('/v1/me', null, parado)).status, 401, 'a parada vence no prazo de sempre');
  } finally { await server.close(); }
});

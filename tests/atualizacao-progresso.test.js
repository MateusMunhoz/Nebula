const { test } = require('node:test');
const assert = require('node:assert/strict');
const { progressoAtualizacao } = require('../renderer/abertura');
const { lerComProgresso } = require('../github');

const MB = 1024 * 1024;

test('baixando: etapa 1 de 3, fração e MB', () => {
  const p = progressoAtualizacao({ modo: 'github', feito: 4.2 * MB, total: 9.8 * MB });
  assert.equal(p.etapa, 'Etapa 1 de 3 · Baixando');
  assert.equal(p.detalhe, '4,2 de 9,8 MB');
  assert.ok(Math.abs(p.fracao - 4.2 / 9.8) < 1e-9);
  assert.equal(p.indefinido, false);
});

test('baixando sem tamanho conhecido: barra indefinida e só o que veio', () => {
  const p = progressoAtualizacao({ modo: 'github', feito: 2 * MB, total: 0 });
  assert.equal(p.etapa, 'Etapa 1 de 3 · Baixando');
  assert.equal(p.detalhe, '2,0 MB');
  assert.equal(p.indefinido, true);
});

test('começo do download, antes de chegar o primeiro pedaço', () => {
  const p = progressoAtualizacao({ modo: 'github' });
  assert.equal(p.etapa, 'Etapa 1 de 3 · Baixando');
  assert.equal(p.fracao, 0);
  assert.equal(p.detalhe, '');
});

test('download completo: conferindo (etapa 2)', () => {
  const p = progressoAtualizacao({ modo: 'github', feito: 5 * MB, total: 5 * MB });
  assert.equal(p.etapa, 'Etapa 2 de 3 · Conferindo');
  assert.equal(p.fracao, 1);
});

test('abrindo: etapa 3 no github, sem contagem quando já estava baixada', () => {
  assert.equal(progressoAtualizacao({ modo: 'github', abrindo: true }).etapa, 'Etapa 3 de 3 · Abrindo a versão nova');
  const pronta = progressoAtualizacao({ modo: 'ready', abrindo: true });
  assert.equal(pronta.etapa, 'Abrindo a versão nova');
  assert.equal(pronta.fracao, 1);
});

test('valores estranhos não passam de 100% nem quebram', () => {
  const p = progressoAtualizacao({ modo: 'github', feito: 20 * MB, total: 10 * MB });
  assert.equal(p.fracao, 1);
  const q = progressoAtualizacao({ modo: 'github', feito: -5, total: NaN });
  assert.equal(q.fracao, 0);
  assert.equal(q.indefinido, false); // nada chegou: igual ao começo do download
  assert.equal(q.detalhe, '');
});

function resposta(pedacos, tamanho) {
  const corpo = new ReadableStream({
    start(c) { for (const p of pedacos) c.enqueue(new TextEncoder().encode(p)); c.close(); },
  });
  return new Response(corpo, { headers: tamanho ? { 'content-length': String(tamanho) } : {} });
}

test('lerComProgresso: junta o texto e avisa até o total', async () => {
  const avisos = [];
  const txt = await lerComProgresso(resposta(['{"a":', '"é"', '}'], 10), (feito, total) => avisos.push([feito, total]));
  assert.equal(txt, '{"a":"é"}');
  assert.deepEqual(avisos.at(-1), [10, 10]);
});

test('lerComProgresso: sem content-length avisa total 0 e, no fim, total = feito (vira "Conferindo")', async () => {
  const avisos = [];
  const txt = await lerComProgresso(resposta(['abc', 'def']), (feito, total) => avisos.push([feito, total]));
  assert.equal(txt, 'abcdef');
  assert.equal(avisos[0][1], 0);
  assert.deepEqual(avisos.at(-1), [6, 6]);
  assert.equal(progressoAtualizacao({ modo: 'github', feito: 6, total: 6 }).etapa, 'Etapa 2 de 3 · Conferindo');
});

test('lerComProgresso: caractere de 2 bytes partido entre dois pedaços', async () => {
  const bytes = new TextEncoder().encode('"ação"');
  const corpo = new ReadableStream({ start(c) { c.enqueue(bytes.slice(0, 3)); c.enqueue(bytes.slice(3)); c.close(); } });
  assert.equal(await lerComProgresso(new Response(corpo), () => {}), '"ação"');
});

test('lerComProgresso: rede parada sem fechar desiste em vez de esperar para sempre', async () => {
  const corpo = new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode('a')); } }); // nunca fecha
  await assert.rejects(lerComProgresso(new Response(corpo), () => {}, 50), /o download parou/);
});

test('lerComProgresso: sem quem avisar só lê', async () => {
  assert.equal(await lerComProgresso(resposta(['x'])), 'x');
});

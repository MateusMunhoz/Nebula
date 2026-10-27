const { test } = require('node:test');
const assert = require('node:assert/strict');
const { minimaDasNotas } = require('../github');

test('a versão obrigatória sai da linha "obrigatória:" das notas do release', () => {
  assert.equal(minimaDasNotas('Novidades\n\nobrigatória: 1.20.8'), '1.20.8');
  assert.equal(minimaDasNotas('Obrigatoria: 2.0.0\r\nmais texto'), '2.0.0');
  assert.equal(minimaDasNotas('a versão obrigatória: 1.20.8 saiu'), ''); // só a linha inteira vale
  assert.equal(minimaDasNotas('obrigatória: 1.20'), '');
  assert.equal(minimaDasNotas(null), '');
  assert.equal(minimaDasNotas({ toString: () => 'obrigatória: 9.9.9' }), '9.9.9');
});

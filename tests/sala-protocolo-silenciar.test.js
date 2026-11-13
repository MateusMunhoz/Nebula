// Silenciar para a sala (mensagem "mute-room"): qualquer pessoa silencia ou ensurdece outra, qualquer outra libera,
// a própria pessoa se libera; quem está silenciado não age sobre os outros; no máximo 3 ações por minuto por pessoa;
// o silêncio vale para quem sai e volta (pela conta ou, sem conta, pelo nome) e vai junto na troca de host.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createChat, createSilencio, newMember, memberInfo, handleMemberMessage, SILENCIO_POR_MINUTO, SILENCIO_SALA_POR_MINUTO } = require('../sala-protocolo');

const CONTA = 'a'.repeat(32);

function sala(seed) {
  const enviados = [];
  const mk = (id, extra = {}) => ({ ws: { readyState: 1, send() {}, terminate() {} }, name: `P${id}`, voiceSession: `s${id}`, voiceChannel: '', muted: false, deafened: false, ...extra });
  const members = new Map([['1', mk('1')], ['2', mk('2')], ['3', mk('3', { razze: { id: CONTA, nome: 'Conta' } })]]);
  const chat = createChat();
  const silencio = createSilencio(seed);
  const ctx = { members, broadcast: (m) => enviados.push(m), chat, silencio };
  const manda = (quem, msg) => handleMemberMessage(ctx, quem, members.get(quem), { type: 'mute-room', ...msg });
  const estado = () => enviados.filter((m) => m.type === 'mute-room-state').at(-1);
  const linhas = () => enviados.filter((m) => m.type === 'chat');
  return { ctx, members, enviados, silencio, manda, estado, linhas, mk };
}

test('qualquer pessoa silencia outra: estado para todos e linha no chat com o autor', () => {
  const s = sala();
  s.manda('1', { target: '2', on: true });
  assert.deepEqual(s.estado().lista, [{ chave: 'n:p2', ids: ['2'], por: 'P1', surdo: false }]);
  const [linha] = s.linhas();
  assert.equal(linha.from, '1');
  assert.equal(linha.sistema, true);
  assert.equal(linha.text, 'silenciou P2 para a sala');
  assert.ok(s.silencio.de(s.members.get('2')));
});

test('ensurdecer para a sala marca surdo e tem texto próprio', () => {
  const s = sala();
  s.manda('1', { target: '2', on: true, surdo: true });
  assert.equal(s.estado().lista[0].surdo, true);
  assert.equal(s.linhas()[0].text, 'ensurdeceu P2 para a sala');
});

test('outra pessoa libera; a própria pessoa também se libera', () => {
  const s = sala();
  s.manda('1', { target: '2', on: true });
  s.manda('3', { target: '2', on: false });
  assert.deepEqual(s.estado().lista, []);
  assert.equal(s.linhas().at(-1).text, 'liberou o microfone de P2');

  s.manda('1', { target: '2', on: true, surdo: true });
  s.manda('2', { target: '2', on: false });
  assert.deepEqual(s.estado().lista, []);
  assert.equal(s.linhas().at(-1).text, 'liberou o próprio áudio');
});

test('ninguém se silencia; quem está silenciado só pode se liberar', () => {
  const s = sala();
  s.manda('1', { target: '1', on: true });
  assert.equal(s.estado(), undefined);
  s.manda('1', { target: '2', on: true });
  const antes = s.enviados.length;
  s.manda('2', { target: '3', on: true }); // silenciado não silencia
  s.manda('2', { target: '1', on: false }); // nem libera os outros
  assert.equal(s.enviados.length, antes);
});

test('pedido inválido é ignorado sem mexer no estado', () => {
  const s = sala();
  for (const msg of [{}, { target: '9', on: true }, { target: '2' }, { target: '2', on: 'sim' }, { target: ['2'], on: true },
    { target: { toString: () => '2' }, on: true }, { target: '__proto__', on: true }]) s.manda('1', msg);
  s.manda('1', { target: '2', on: false }); // liberar quem não está silenciado
  assert.equal(s.enviados.length, 0);
});

test('repetir o mesmo silêncio não gera linha nova nem gasta o limite', () => {
  const s = sala();
  s.manda('1', { target: '2', on: true });
  s.manda('1', { target: '2', on: true });
  assert.equal(s.linhas().length, 1);
});

test(`limite: no máximo ${SILENCIO_POR_MINUTO} ações por minuto por pessoa, contado no servidor`, (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: 1_000_000 });
  const s = sala();
  s.members.set('4', s.mk('4'));
  s.manda('1', { target: '2', on: true });
  s.manda('1', { target: '2', on: false });
  s.manda('1', { target: '3', on: true });
  s.manda('1', { target: '4', on: true }); // quarta ação no mesmo minuto
  assert.equal(s.linhas().length, 3);
  assert.equal(s.silencio.de(s.members.get('4')), null);
  t.mock.timers.tick(61_000);
  s.manda('1', { target: '4', on: true });
  assert.ok(s.silencio.de(s.members.get('4')));
});

test('o limite segue a pessoa: sair e voltar com outro número não zera', (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: 1_000_000 });
  const s = sala();
  for (let i = 0; i < SILENCIO_POR_MINUTO; i++) { s.manda('1', { target: '2', on: true }); s.manda('3', { target: '2', on: false }); }
  s.members.delete('1');
  s.members.set('7', s.mk('1'));
  s.manda('7', { target: '2', on: true });
  assert.equal(s.silencio.de(s.members.get('2')), null);
});

test(`teto da sala: no máximo ${SILENCIO_SALA_POR_MINUTO} ações por minuto, mesmo trocando de identidade`, (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: 1_000_000 });
  const s = sala();
  for (let i = 0; i < 20; i++) s.members.set(String(10 + i), s.mk(String(10 + i)));
  for (let i = 0; i < 20; i++) { s.members.set('9', s.mk(`x${i}`)); s.manda('9', { target: String(10 + i), on: true }); } // cada vez um nome novo
  assert.equal(s.linhas().length, SILENCIO_SALA_POR_MINUTO);
});

test('nome com caractere de controle não escapa do silêncio', () => {
  const s = sala();
  s.members.get('2').name = 'P\u00072';
  s.manda('1', { target: '2', on: true });
  const novo = sala(s.estado().lista);
  assert.ok(novo.silencio.de(newMember({}, { name: 'P2' }, false)));
});

test('quem sai e volta continua silenciado: pela conta (mesmo trocando o nome) ou pelo nome sem conta', () => {
  const s = sala();
  s.manda('1', { target: '3', on: true });
  s.manda('1', { target: '2', on: true });
  const volta = newMember({}, { name: 'Outro nome', razze: { id: CONTA, nome: 'Conta' } }, false);
  assert.ok(s.silencio.de(volta));
  assert.ok(s.silencio.de(newMember({}, { name: 'p2' }, false)));
  assert.equal(s.silencio.de(newMember({}, { name: 'P5' }, false)), null);
});

test('silenciado não consegue se desmutar pelo voice-state', () => {
  const s = sala();
  s.manda('1', { target: '2', on: true, surdo: true });
  handleMemberMessage(s.ctx, '2', s.members.get('2'), { type: 'voice-state', session: 's2', muted: false, deafened: false });
  const vs = s.enviados.filter((m) => m.type === 'voice-state').at(-1);
  assert.equal(vs.muted, true);
  assert.equal(vs.deafened, true);
});

test('o estado vai na troca de host (seed) e volta a valer para as mesmas pessoas', () => {
  const s = sala();
  s.manda('1', { target: '2', on: true, surdo: true });
  const novo = sala(s.estado().lista);
  assert.deepEqual(novo.silencio.lista(novo.members), [{ chave: 'n:p2', ids: ['2'], por: 'P1', surdo: true }]);
});

test('duas pessoas com a mesma chave (mesmo nome): a lista leva os dois números, não só o mais antigo', () => {
  const s = sala();
  s.members.set('8', s.mk('2')); // outro "P2", que entrou depois
  s.manda('1', { target: '8', on: true });
  assert.deepEqual(s.estado().lista[0].ids, ['2', '8']);
});

test('entrar na conta no meio da sala leva o silêncio junto para a chave nova, e todos recebem a lista', () => {
  const s = sala();
  s.manda('1', { target: '2', on: true, surdo: true });
  handleMemberMessage(s.ctx, '2', s.members.get('2'), { type: 'razze', conta: { id: 'b'.repeat(32), nome: 'Beto' } });
  const sil = s.silencio.de(s.members.get('2'));
  assert.ok(sil);
  assert.equal(sil.surdo, true);
  assert.equal(sil.por, 'P1');
  assert.deepEqual(s.estado().lista, [{ chave: 'c:' + 'b'.repeat(32), ids: ['2'], por: 'P1', surdo: true }]);
  // e o nome antigo não fica silenciado à toa
  assert.equal(s.silencio.de(newMember({}, { name: 'P2' }, false)), null);
});

test('entrar numa conta que a sala já silenciou também silencia', () => {
  const s = sala();
  s.manda('1', { target: '3', on: true }); // a conta CONTA
  s.enviados.length = 0;
  handleMemberMessage(s.ctx, '2', s.members.get('2'), { type: 'razze', conta: { id: CONTA, nome: 'Conta' } });
  assert.deepEqual(s.estado().lista[0].ids, ['2', '3']);
});

test('seed malformado não quebra nem entra', () => {
  for (const seed of [null, 5, 'x', {}, [null, 1, 'a', {}, { chave: 'x' }, { chave: 'n:' + 'a'.repeat(200), por: 'P' }, { chave: '__proto__' }]]) {
    assert.deepEqual(createSilencio(seed).lista(new Map()), []);
  }
  const s = createSilencio(Array.from({ length: 500 }, (_, i) => ({ chave: `n:p${i}`, por: 'x' })));
  assert.ok(s.lista(new Map()).length <= 100);
});

test('hello diz se o app entende o silenciar para a sala (para contar quem está em versão antiga)', () => {
  assert.equal(memberInfo('1', newMember({}, { name: 'A', muteRoom: true }, false)).muteRoom, true);
  assert.equal(memberInfo('1', newMember({}, { name: 'A' }, false)).muteRoom, false);
});

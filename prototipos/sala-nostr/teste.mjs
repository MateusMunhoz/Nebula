// Conferências sem rede: código, endereço da sala, eventos e conversão do TURN. Rode com: node teste.mjs
import assert from 'node:assert/strict';
import { generateSecretKey, getPublicKey, finalizeEvent } from 'nostr-tools/pure';
import { gerarCodigo, normalizarCodigo, derivarSala, montarEvento, abrirEvento, validarEntrar, validarResposta, KIND, agora } from './sala.mjs';
import { paraNodeDataChannel, encerrar } from './rtc.mjs';

const ok = (nome) => console.log('ok -', nome);

const c = gerarCodigo();
assert.match(c, /^[0-9A-HJKMNP-TV-Z]{4}(-[0-9A-HJKMNP-TV-Z]{4}){3}$/);
assert.notEqual(gerarCodigo(), c);
ok('código de 16 caracteres em grupos de 4');

assert.equal(normalizarCodigo(c.toLowerCase().replace(/-/g, ' ')), c.replace(/-/g, ''));
assert.equal(normalizarCodigo('OOOO-IIII-LLLL-0000'), '0000111111110000');
assert.equal(normalizarCodigo('ABCD-EFGH'), '');
assert.equal(normalizarCodigo('UUUU-UUUU-UUUU-UUUU'), '');
ok('normalização (minúsculas, espaços, O/I/L) e recusa de código curto ou com U');

const t0 = performance.now();
const a = await derivarSala('ABCD-EFGH-JKMN-PQRS', 'senha1');
const ms = Math.round(performance.now() - t0);
const b = await derivarSala('abcd efgh jkmn pqrs', 'senha1');
const outraSenha = await derivarSala('ABCD-EFGH-JKMN-PQRS', 'senha2');
const outroCodigo = await derivarSala('ABCD-EFGH-JKMN-PQRT', 'senha1');
assert.equal(a.pk, b.pk);
assert.notEqual(a.pk, outraSenha.pk);
assert.notEqual(a.pk, outroCodigo.pk);
assert.match(a.pk, /^[0-9a-f]{64}$/);
ok(`endereço da sala: mesmo código + senha = mesmo endereço; senha ou código diferente = outro (${ms} ms no PBKDF2)`);
const vetor = await derivarSala('0000-0000-0000-0000', 'nebula', 1000);
console.log('   vetor (1000 iterações, código 0000…, senha "nebula"):', vetor.pk);

const q = generateSecretKey();
const Q = getPublicKey(q);
const n = 'a'.repeat(32);
const ev = montarEvento({ t: 'entrar', v: 1, n, sdp: 'v=0\r\n' }, q, a.pk);
assert.equal(ev.kind, KIND);
assert.ok(!ev.content.includes('entrar'));
const aberto = abrirEvento(ev, a.sk, a.pk);
assert.equal(aberto.de, Q);
assert.ok(validarEntrar(aberto.conteudo));
ok('pedido de entrada cifrado: o relay não lê, o host abre e sabe de quem veio');

assert.equal(abrirEvento(ev, outraSenha.sk, outraSenha.pk), null);
assert.equal(abrirEvento({ ...ev, content: ev.content.slice(0, -4) + 'AAAA' }, a.sk, a.pk), null);
assert.equal(abrirEvento(ev, a.sk, a.pk, agora() + 120), null);
assert.equal(abrirEvento({ ...ev, kind: 1 }, a.sk, a.pk), null);
const grande = finalizeEvent({ kind: KIND, created_at: agora(), tags: [['p', a.pk]], content: 'x'.repeat(17000) }, q);
assert.equal(abrirEvento(grande, a.sk, a.pk), null);
ok('descarta: outra sala, conteúdo mexido, evento velho, kind errado, conteúdo grande');

const resp = abrirEvento(montarEvento({ t: 'resposta', v: 1, n, sdp: 'v=0\r\n' }, a.sk, Q), q, Q);
assert.equal(resp.de, a.pk);
assert.ok(validarResposta(resp.conteudo, n));
assert.ok(!validarResposta(resp.conteudo, 'b'.repeat(32)));
assert.ok(validarResposta({ t: 'recusa', v: 1, n, motivo: 'cheia' }, n));
ok('resposta assinada pela sala, com o mesmo nonce do pedido');

assert.deepEqual(paraNodeDataChannel([
  { urls: ['stun:turn.exemplo.com:3479', 'turn:turn.exemplo.com:3479?transport=udp', 'turn:turn.exemplo.com:3479?transport=tcp'], username: '1700000000:sala', credential: 'abc=' },
]), [
  'stun:turn.exemplo.com:3479',
  { hostname: 'turn.exemplo.com', port: 3479, username: '1700000000:sala', password: 'abc=', relayType: 'TurnUdp' },
  { hostname: 'turn.exemplo.com', port: 3479, username: '1700000000:sala', password: 'abc=', relayType: 'TurnTcp' },
]);
ok('lista do TURN no formato do node-datachannel (usuário com ":" fora da URL)');
encerrar(); // a biblioteca nativa segura o processo aberto sem isso

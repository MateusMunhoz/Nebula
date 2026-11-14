// Silenciar para a sala: a Ana silencia (e ensurdece) a Bia e depois libera. Liberada por outra pessoa, a Bia volta
// como estava antes do silêncio.
const { openApp, createRoom, joinRoom, check, sleep, run } = require('./ajuda');

run('Silenciar para a sala e liberar', 200000, async () => {
  const A = await openApp('silA', 9541, { fake: true });
  await createRoom(A, { name: 'Ana', port: 18841 });
  const B = await openApp('silB', 9542, { fake: true });
  await joinRoom(B, { name: 'Bia', addr: '127.0.0.1:18841' });
  const biaId = await B.eval('state.myId');
  await A.eval(`$('voiceJoin').click()`);
  await B.eval(`$('voiceJoin').click()`);
  await B.waitFor(`voice.session && !voice.muted`, 20000);
  await A.waitFor(`voice.session && voice.members.get('${biaId}')?.session`, 20000);
  const visto = (muted, deafened) => A.waitFor(`voice.members.get('${biaId}')?.muted === ${muted} && !!voice.members.get('${biaId}')?.deafened === ${deafened}`, 8000).then(() => true, () => false);

  await A.eval(`silenciarParaSala('${biaId}', true)`);
  await B.waitFor(`voice.muted && !!silencioDe(state.myId)`, 8000);
  check('Silenciar: o microfone da Bia desliga', await visto(true, false));
  await A.eval(`silenciarParaSala('${biaId}', false)`);
  await B.waitFor(`!silencioDe(state.myId)`, 8000);
  check('Liberar microfone: o microfone da Bia volta a ligar', await B.eval(`!voice.muted && voice.stream.getAudioTracks().every((t) => t.enabled)`) && await visto(false, false));

  await A.eval(`silenciarParaSala('${biaId}', true, true)`);
  await B.waitFor(`voice.deafened && voice.muted`, 8000);
  check('Ensurdecer: a Bia fica sem ouvir e sem falar', await visto(true, true));
  await sleep(61000); // o servidor aceita 3 ações por minuto por pessoa: a quarta espera
  await A.eval(`silenciarParaSala('${biaId}', false)`);
  await B.waitFor(`!silencioDe(state.myId)`, 8000);
  check('Liberar áudio: a Bia volta a ouvir e a falar', await B.eval(`!voice.deafened && !voice.muted`) && await visto(false, false));

});

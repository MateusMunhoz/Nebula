'use strict';
// Abertura: a logo animada enquanto o app carrega (docs/spec/abertura.md, styles-abertura.css).
// Script clássico: só declara. fecharAbertura() é chamada no fim do inicio.js.

const ABERTURA_MIN_MS = 2000; // tempo mínimo na tela para a animação da logo aparecer inteira (desde o começo da carga)

function fecharAbertura() {
  const el = $('abertura');
  if (!el || el.hidden) return;
  setTimeout(() => {
    el.classList.add('sai');
    let feito = false;
    const fim = () => { if (feito) return; feito = true; el.hidden = true; };
    el.addEventListener('animationend', (e) => { if (e.target === el) fim(); });
    setTimeout(fim, 800); // modo gamer e "reduzir movimento" não animam: não chega animationend
  }, Math.max(0, ABERTURA_MIN_MS - performance.now()));
}

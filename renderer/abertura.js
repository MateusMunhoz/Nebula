'use strict';
// Abertura: a logo animada enquanto o app carrega (docs/spec/abertura.md, styles-abertura.css).
// Script clássico: só declara. fecharAbertura() é chamada no fim do inicio.js.
// O mesmo card volta durante a atualização, com barra e etapa (docs/spec/atualizacao-com-abertura.md).

const ABERTURA_MIN_MS = 2000; // tempo mínimo na tela para a animação da logo aparecer inteira (desde o começo da carga)

function fecharAbertura() {
  const el = $('abertura');
  if (!el || el.hidden) return;
  setTimeout(() => {
    if (atualizando) return; // a atualização automática pegou o card: ele fica até o app reiniciar
    el.classList.add('sai');
    let feito = false;
    const fim = () => { if (feito || atualizando) return; feito = true; el.hidden = true; };
    el.addEventListener('animationend', (e) => { if (e.target === el) fim(); });
    setTimeout(fim, 800); // modo gamer e "reduzir movimento" não animam: não chega animationend
  }, Math.max(0, ABERTURA_MIN_MS - performance.now()));
}

// ---------- Atualizando ----------
// { modo: 'github'|'ready', feito, total (bytes; 0 = desconhecido), abrindo } -> o que o card mostra
function progressoAtualizacao({ modo, feito, total, abrindo } = {}) {
  if (modo !== 'github') return { etapa: 'Abrindo a versão nova', detalhe: '', fracao: 1, indefinido: false };
  if (abrindo) return { etapa: 'Etapa 3 de 3 · Abrindo a versão nova', detalhe: '', fracao: 1, indefinido: false };
  const f = Number.isFinite(feito) && feito > 0 ? feito : 0;
  const t = Number.isFinite(total) && total > 0 ? total : 0;
  const mb = (n) => (n / (1024 * 1024)).toFixed(1).replace('.', ',');
  if (t && f >= t) return { etapa: 'Etapa 2 de 3 · Conferindo', detalhe: `${mb(t)} MB`, fracao: 1, indefinido: false };
  return {
    etapa: 'Etapa 1 de 3 · Baixando',
    detalhe: !f ? '' : t ? `${mb(f)} de ${mb(t)} MB` : `${mb(f)} MB`,
    fracao: t ? f / t : 0,
    indefinido: !t && f > 0,
  };
}

let atualizando = null; // { modo } enquanto o card de atualização está à vista

function desenharAtualizando(p) {
  const el = $('abertura');
  $('aberturaEtapa').textContent = p.etapa;
  $('aberturaDetalhe').textContent = p.detalhe;
  el.classList.toggle('indefinido', p.indefinido);
  el.style.setProperty('--p', String(p.fracao));
}

function mostrarAtualizando(modo) {
  const el = $('abertura');
  if (!el) return;
  atualizando = { modo };
  el.classList.remove('sai');
  el.classList.add('atualizando');
  el.setAttribute('aria-label', 'Atualizando o Nebula');
  desenharAtualizando(progressoAtualizacao({ modo }));
  el.hidden = false;
}

// { feito, total } do download ou { abrindo: true }
function avancarAtualizando(info) {
  if (!atualizando) return;
  desenharAtualizando(progressoAtualizacao({ modo: atualizando.modo, ...info }));
}

function fecharAtualizando() {
  if (!atualizando) return;
  atualizando = null;
  const el = $('abertura');
  el.hidden = true;
  el.classList.remove('atualizando', 'indefinido');
  el.setAttribute('aria-label', 'Abrindo o Nebula');
}

if (typeof module !== 'undefined') module.exports = { progressoAtualizacao };

# Abertura (logo animada)

Status: pronta para teste. Só desktop.

## Por quê
O app abria direto no Início, com a janela piscando na cor de outro tema. O dono quer um carregamento com a
logo animada, como os apps de chamada fazem.

## O que muda
1. **Abertura (`#abertura`)**: card escuro no centro com a logo e um anel girando em volta, nas três cores da
   logo. As três estrelas do N acendem em sequência e um rastro corre pelos pontos (estrela de baixo → topo →
   diagonal → estrela de baixo → cauda). Fica até o `inicio.js` terminar (mínimo 2 s, pedido do dono) e sai com
   zoom + fade. Vale para todos os temas. Estilos em `styles-abertura.css`; `fecharAbertura()` em
   `renderer/abertura.js`.
2. **Janela**: `backgroundColor` do `BrowserWindow` passa a ser o fundo do Padrão (`#0B0D10`), sem piscar.

## Regras
- Animação contínua aprovada pelo dono só enquanto o app abre. Só `transform`/`opacity`; parada com
  "reduzir movimento" (aí a logo aparece inteira, parada).
- Cores por `var()`; nada de `style=""` no HTML (CSP).
- Arquivos novos em `index.html`, `PACK_FILES` e `build.files`.

## Fora do escopo
O fundo animado (nebulosa) foi testado e ficou de fora por decisão do dono (07/11/2026).

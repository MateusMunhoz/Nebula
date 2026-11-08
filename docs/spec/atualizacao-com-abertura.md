# Atualização com a abertura

Status: em teste. Só desktop. Depende de `docs/spec/abertura.md`.

## Objetivo
Quando o app se atualiza, a pessoa não sabe se ele travou. O dono quer o mesmo card da logo animada da abertura,
em cima de tudo, com uma barra de progresso e a etapa ("Etapa 1 de 3"), sem dizer o que mudou nem mostrar terminal.

## Escopo
- Entra: atualizar pelo botão (`runUpdate`) e a automática (`autoAtualizar`), nos modos `github` e `ready`.
- Fica de fora: o download pela sala (continua em segundo plano, sem tirar ninguém da call); versão que precisa de
  `.exe` novo (abre a página, como antes); lista do que mudou; a tela de atualização obrigatória
  (`runObrigatoria`), que já cobre o Início com o próprio aviso.

## Comportamento esperado
1. A atualização começa: o `#abertura` volta (logo em loop, anel girando), com "Atualizando o Nebula" e a barra.
2. Modo `github`, três etapas:
   - **Etapa 1 de 3 · Baixando**: a barra enche pelos bytes do `pack.json`; embaixo, pequeno, "4,2 de 9,8 MB".
     Sem tamanho conhecido (sem `content-length`), a barra fica correndo e o texto mostra só o que já veio
     (modo gamer e "reduzir movimento": barra cheia e esmaecida). 30 s sem chegar nada: desiste e mostra o erro.
   - **Etapa 2 de 3 · Conferindo**: download completo; o `boot.js` confere a assinatura.
   - **Etapa 3 de 3 · Abrindo a versão nova**: barra cheia; o app reinicia e a abertura normal continua.
3. Modo `ready` (já baixada): só "Abrindo a versão nova", sem contagem de etapas.
4. Erro (sem rede, assinatura recusada, precisa de `.exe` novo): o card sai e volta o aviso de sempre.
5. Automática que termina com a pessoa numa sala: o card sai e a versão fica pronta para depois.

## Restrições
- Animação contínua só dentro da exceção já aprovada da abertura; só `transform`/`opacity`.
- "Reduzir movimento": a logo para, a barra continua mostrando o progresso.
- CSP: largura da barra por `style.setProperty('--p', …)`, nada de `style=""` no HTML.
- Progresso no máximo a cada 100 ms (não inunda o IPC).
- Com o card à vista, o resto da página fica `inert` (`travarFundo`): teclado e leitor de tela não alcançam o app por baixo.
  Ao fechar, solta só o que o card travou.

## Dependências
- `github.js`: `lerComProgresso(res, avisar)` lê o corpo aos poucos; `install(updater, avisar)`.
- `main.js` (`github-install`) manda `update-progresso` `{ feito, total }`; `preload.js`: `onUpdateProgresso(cb)`.
- `renderer/abertura.js`: `progressoAtualizacao()` (pura), `mostrarAtualizando()`, `avancarAtualizando()`,
  `fecharAtualizando()`. `renderer/atualizacao.js` chama.
- `index.html` (`#abertura`), `styles-abertura.css`. `boot.js` não muda: chega pela atualização assinada.

## Critérios de aceitação
- [ ] Botão "Atualizar e reiniciar" mostra o card com a barra andando até reiniciar.
- [ ] Ao abrir com versão nova no GitHub, a atualização automática mostra o mesmo card.
- [ ] Erro fecha o card e mostra o aviso.
- [ ] "Reduzir movimento": logo parada, barra funcionando.

## Testes
- Automáticos: `tests/atualizacao-progresso.test.js` (texto/fração das etapas; leitura com progresso e sem tamanho; fundo travado e solto).
- Manuais: atualizar de verdade pelo GitHub no Windows (versão anterior instalada); repetir com "reduzir movimento".

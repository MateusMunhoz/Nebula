# Codando na atividade do perfil

Issue: — · Roadmap: fase 5 de `primeira-entrada-e-perfil.md` (atividade)

## Objetivo
Quem programa com os amigos na call quer mostrar "Codando no VS Code · há 1 h 20 min" no perfil, como já mostra
o jogo e a música. Só o nome do editor aparece. Nada do projeto nem do arquivo.

## Escopo
- Entra: chave "Programa em que estou codando" em Seu perfil › Atividade (desligada por padrão); o ajudante
  `bin/foco.exe` (o .exe em primeiro plano + há quanto tempo o teclado/mouse estão parados); a lista fechada `EDITORES`
  em `main/atividade.js`; a linha no perfil (céu) e na lista de membros da sala.
- Fica de fora: mandar para os amigos da conta pela RazzeAPI (o servidor só conhece jogo e música); Linux; nome do
  projeto, título da janela, linguagem.

## Comportamento esperado
1. Ligou a chave e um editor da lista está em primeiro plano, com uso nos últimos 5 min: aparece
   "Codando no <editor>" e, embaixo, "há X" desde o começo da sessão.
2. Saiu do editor (foi ao navegador ver documentação) ou parou de mexer: continua aparecendo por até 5 min; passou
   disso, some e a próxima vez começa uma sessão nova (o "há" zera).
3. Terminal em primeiro plano (Windows Terminal, cmd, PowerShell) com o `claude.exe` aberto: "Codando com Claude".
   Terminal sem ele não conta. O app do Claude em primeiro plano também é "com Claude". Limitação aceita: o app do
   Claude também se chama `claude.exe`, então com ele aberto qualquer terminal na frente conta; o Claude Code instalado
   pelo npm roda como `node.exe` e não é visto.
4. Jogo aberto tem prioridade: com jogo, o Codando não aparece.
5. Sem o `foco.exe` (ou fora do Windows): nada aparece, sem erro.
6. Quem está em versão antiga na sala só não vê a linha (o campo novo é ignorado).

## Restrições
- Privacidade: o `foco.exe` devolve só o nome do executável e o tempo parado; o nome só sai do PC se estiver em
  `EDITORES`, e sai trocado pelo nome de exibição. Nunca lê título de janela.
- Vem de outro PC: `limparAtividade` limita o texto e confere o `codandoDesde` como confere o `jogoDesde`.
- O `foco.exe` roda uma vez por leitura (a cada 30 s) e fecha; nada fica aberto.
- IPC: só ganha a opção `codando` (booleano) no `atividade-ler`. Nenhum canal novo.

## Dependências
`native/foco.cpp`, `native/build.cmd`, `bin/foco.exe`, `main/atividade.js`, `main.js` e `preload.js`
(`atividade-ler`), `renderer/conta.js`, `renderer/ceu-voz.js`, `renderer/membros.js`, `index.html`,
`publicar.js` (`PACK_FILES`); no `.exe`, a pasta `bin/` já vai inteira (`extraResources` do `package.json`).

## Critérios de aceitação
- [ ] Desligado por padrão; ligado, a prévia mostra "Codando no VS Code".
- [ ] Some 5 min depois do último uso do editor; jogo aberto esconde.
- [ ] Nenhum nome de programa fora da lista sai do PC.
- [ ] `bin/foco.exe` compilado, versionado e no `PACK_FILES` (sem ele, `publicar.js` falha).

## Testes
- Automáticos: `tests/atividade.test.js` (`focoDoAjudante`, `codandoAgora`: janela de 5 min, sessão nova, terminal com
  e sem Claude, editor fora da lista; `limparAtividade` com `codando`).
- Manuais (Windows): compilar `native\build.cmd foco`; abrir o VS Code e conferir o perfil na call; deixar 5 min no
  navegador e ver sumir; abrir um jogo e ver o jogo no lugar.

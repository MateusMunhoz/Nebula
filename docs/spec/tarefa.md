# O que estou fazendo no PC (atividade do perfil)

Issue: — · Roadmap: fase 5 de `primeira-entrada-e-perfil.md` (atividade)

## Objetivo
Mostrar no perfil o que a pessoa está fazendo no PC fora dos jogos: "Codando no VS Code · há 1 h 20 min",
"Desenhando no Figma", "Codando com Claude". Sem extensão em nenhum programa: o Nebula reconhece pelo programa da
frente. Só a categoria e o nome do programa aparecem; nada do arquivo nem do projeto.

## Escopo
- Entra: chave "O que estou fazendo no PC" em Seu perfil › Atividade (desligada por padrão); o ajudante `bin/foco.exe`
  (o .exe em primeiro plano + há quanto tempo o teclado/mouse estão parados); a lista fechada `CATEGORIAS` em
  `main/atividade.js` (Codando, Criando jogo, Desenhando, Editando vídeo, Modelando 3D, Produzindo música, Escrevendo);
  a linha no perfil (céu) e na lista de membros da sala.
- Fica de fora: mandar para os amigos da conta pela RazzeAPI (o servidor só conhece jogo e música); Linux; programa
  fora da lista; título da janela, arquivo, projeto, linguagem.

## Comportamento esperado
1. Ligou a chave e um programa da lista está em primeiro plano, com uso nos últimos 5 min: aparece a frase
   ("Codando no VS Code") e, embaixo, "há X" desde o começo da sessão. Trocar de programa da lista troca a frase e
   mantém a sessão.
2. Saiu do programa (foi ao navegador ver documentação) ou parou de mexer: continua aparecendo por até 5 min; passou
   disso, some e a próxima vez começa uma sessão nova (o "há" zera).
3. Terminal em primeiro plano (Windows Terminal, cmd, PowerShell): "Codando com Claude" se o `claude.exe` está aberto,
   senão "Codando no terminal". O app do Claude em primeiro plano também é "Codando com Claude". Limitação aceita: o
   app do Claude também se chama `claude.exe`, então com ele aberto o terminal vira "com Claude"; o Claude Code
   instalado pelo npm roda como `node.exe` e não é visto.
4. Jogo aberto tem prioridade: com jogo, a tarefa não aparece.
5. Sem o `foco.exe` (ou fora do Windows): nada aparece, sem erro.
6. Quem está em versão antiga na sala só não vê a linha (os campos novos são ignorados).

## Restrições
- Privacidade: o `foco.exe` devolve só o nome do executável e o tempo parado; o nome só sai do PC se estiver em
  `CATEGORIAS`, e sai trocado pela frase. Nunca lê título de janela.
- Vem de outro PC: `limparAtividade` limita o texto (`tarefa`) e confere o `tarefaDesde` como confere o `jogoDesde`.
- O `foco.exe` roda uma vez por leitura (a cada 30 s) e fecha; nada fica aberto.
- IPC: só ganha a opção `tarefa` (booleano) no `atividade-ler`. Nenhum canal novo.

## Dependências
`native/foco.cpp`, `native/build.cmd`, `bin/foco.exe`, `main/atividade.js`, `main.js` e `preload.js`
(`atividade-ler`), `renderer/conta.js`, `renderer/ceu-voz.js`, `renderer/membros.js`, `renderer/util.js` (ícone
`code`), `index.html`, `publicar.js` (`PACK_FILES`); no `.exe`, a pasta `bin/` já vai inteira (`extraResources`).

## Critérios de aceitação
- [ ] Desligada por padrão; ligada, a prévia mostra "Codando no VS Code".
- [ ] Some 5 min depois do último uso; jogo aberto esconde.
- [ ] Nenhum nome de programa fora da lista sai do PC.
- [ ] `bin/foco.exe` compilado, versionado e no `PACK_FILES` (sem ele, `publicar.js` falha).

## Testes
- Automáticos: `tests/atividade.test.js` (`focoDoAjudante`, `tarefaAgora`: janela de 5 min, sessão nova, terminal com
  e sem Claude, programa fora da lista, nomes do Object; `limparAtividade` com `tarefa`; padrão desligado).
- Manuais (Windows): compilar `native\build.cmd foco`; abrir o VS Code e conferir o perfil na call; deixar 5 min no
  navegador e ver sumir; Figma ou Photoshop; terminal clássico (cmd/PowerShell) com e sem Claude; abrir um jogo e ver
  o jogo no lugar.

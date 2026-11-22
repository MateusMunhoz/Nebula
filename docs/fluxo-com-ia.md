# Fluxo da equipe com o Claude Code

Como trabalhamos com o agente, do pedido até a versão nova nos PCs dos amigos.

## Primeira vez

### Quem é quem (e a quem pedir acesso)

| Para | Quem | Como |
|---|---|---|
| Mexer no código | Qualquer pessoa da equipe | Ramo próprio e Pull Request (abaixo). Acesso ao repositório `MateusMunhoz/Nebula`: peça ao **Mateus**, dono do repositório no GitHub |
| Aprovar e juntar um PR (merge) | A equipe, pelo GitHub | Com o CI verde e alguém tendo olhado |
| Publicar uma versão (`npm run publicar`) | **Andrick** e **Mateus**, os únicos com a chave de assinatura | Combinem antes, para não publicar duas versões ao mesmo tempo. A chave nunca é passada para ninguém |
| Servidores (VM do Google Cloud, Cloudflare, DuckDNS) | Só o **Andrick** | Precisa de algo no servidor? Peça a ele, dizendo o que rodar ([servidores em produção](servidores-producao.md)) |

Nenhuma senha, token ou chave fica no Git nem é passada por chat. Os agentes (Claude) são bloqueados de publicar, dar
`push` e ler segredos (`.claude/settings.json`).

### Preparar o PC

```
git clone https://github.com/MateusMunhoz/Nebula
cd Nebula
npm ci
claude
```

Precisa do Node.js 24 ou mais novo e do Git. O Claude já abre sabendo das regras do projeto: não precisa colar prompt
grande. Para abrir o app com o seu código: `npm run dev` (veja [Desenvolvimento](desenvolvimento.md#rodar-pelo-código)).

| Arquivo | Para quê |
|---|---|
| [`AGENTS.md`](../AGENTS.md) | Regras de todos os agentes: mapa, comandos, o que é proibido, invariantes |
| `CLAUDE.md` | Aponta para o `AGENTS.md` e tem o que é só do Claude Code |
| `.claude/rules/` | Regras de cada parte; carregam sozinhas quando o Claude mexe nos arquivos dela |
| `.claude/skills/` | Receitas sob demanda: `testar`, `sala-webrtc`, `revisar-ui` |
| `.claude/settings.json` | Permissões da equipe (bloqueia publicar, push, tag e leitura de segredos) |

**Pessoal, fora do Git:** `.claude/settings.local.json` (suas permissões e plugins) e `CLAUDE.local.md` (suas
preferências). O que estiver neles vale só no seu PC: nada da equipe pode depender deles.

## Do pedido ao PR

Tudo começa numa issue no GitHub, num ramo próprio.

| Tamanho | Caminho |
|---|---|
| Pequeno (bug, ajuste) | issue → Claude analisa → implementa → testes → PR |
| Médio (feature) | issue → [spec](spec/README.md) com critérios de aceitação → Claude → implementa → testes → PR |
| Arquitetural | issue → spec → ADR (se precisar) → plano aprovado → implementa → testes → PR |

Prompts do dia a dia:

- `Implemente a issue #123 seguindo a spec vinculada.`
- `Investigue a issue #145. Não altere código. Ache a causa e proponha um plano.`
- `Revise a UI da tela de Configurações | trocar tema rápido | usuário se perde.`

Antes de abrir o PR: `npm test` passando e, se mexeu em voz, janelas ou atalhos, o
[roteiro de teste](roteiro-de-teste.md) numa call. O modelo do PR pede só o essencial.

## Do PR à versão nova

```
PR aberto
   ↓
CI no GitHub: testes no Linux (~1 min) + Windows smoke (~2 min)
   ├─ falhou → corrige no mesmo ramo
   └─ passou → alguém da equipe dá uma olhada → merge na main
                                                  ↓
                                                  ↓
                quem tem a chave, no próprio PC: git pull → npm test → npm run publicar
                  (sobe a versão, assina, gera o .exe, commit + push na main, tag e Release)
                                                  ↓
                         GitHub Release: Tela P2P.exe, Tela-P2P.AppImage, pack.json, pack.sig
                                                  ↓
                 apps dos amigos se atualizam sozinhos (pelo GitHub e pela sala), conferindo a assinatura
```

- Publicar é sempre de um humano, com a chave no próprio PC (detalhes em
  [Publicar uma versão](desenvolvimento.md#publicar-uma-versão-só-quem-tem-a-chave)). O Claude é bloqueado de rodar.
- Antes de publicar, confira que o CI da `main` está verde (aba Actions).
- **O PR mexeu em `razze-api/`, `servidor-internet/` ou `sala-protocolo.js`?** Então o servidor de produção precisa ser
  atualizado **antes** de publicar, senão quem atualizar o app fala com um servidor velho. Diga no PR o que rodar; o
  Andrick roda na VM ([servidores em produção](servidores-producao.md), "Rotinas") e avisa quando estiver pronto.

## O que o CI faz

- **Testes unitários (automático):** roda em todo PR e em todo push na `main`, num Linux do GitHub. Testa a lógica
  sem abrir janelas, e confere que todo arquivo que o `index.html` carrega está no pacote de atualização e no `.exe`.
- **Windows smoke (automático):** também roda em todo PR e na `main`, num Windows do GitHub. Abre o app de verdade
  com janelas invisíveis: o app abre sem erro, as configurações salvam, e a voz WebRTC funciona entre duas janelas.
  Dá para rodar na hora pelo botão Actions → CI → *Run workflow*. Se ele falhar sem motivo (o código está certo e
  falha de novo ao rodar outra vez sem mudar nada), avise a equipe e anote em [pendências](pendencias-setup.md).
- **Fora do CI:** `npm run test:e2e` (abre janelas, ~10 min), o roteiro numa call real e o `publicar`.

O que ainda falta no setup: [pendências](pendencias-setup.md).

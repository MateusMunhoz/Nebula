# Nebula no iPhone: passo a passo para quem tem um Mac

Objetivo: gerar o app `Nebula` para iPhone (um `.ipa`) a partir deste repositório e instalá-lo num iPhone, sem pagar a conta de desenvolvedor da Apple. O app vale 7 dias e depois precisa ser reinstalado (limite da conta grátis).

Nada disso foi compilado antes: o primeiro build pode dar erro. Se der, copie o log inteiro e mande para quem mantém o projeto.

## O que precisa
- Um Mac com macOS recente, conectado à internet.
- Xcode instalado (App Store, uns 10 GB). Abra uma vez e aceite a licença.
- Node 24 ou mais novo (`node -v`). Instalação: https://nodejs.org
- Git.
- Um iPhone com cabo (iOS 16.4 ou mais novo) e um Apple ID (o grátis serve).
- Acesso ao repositório e ao ramo `ios-fase-0`.

## Parte 1: preparar o projeto (uma vez)

1. Baixe o ramo:
```bash
git clone <endereço do repositório> AmostradinhoScreen
cd AmostradinhoScreen
git checkout ios-fase-0
```
2. Aceite a licença do Xcode e aponte as ferramentas de linha de comando:
```bash
sudo xcodebuild -license accept
sudo xcode-select -s /Applications/Xcode.app/Contents/Developer
```
   No Xcode 26 a plataforma iOS não vem junto. Baixe uma vez (uns 8 GB) antes de compilar:
```bash
xcodebuild -downloadPlatform iOS
```
3. Monte a interface e sincronize o projeto do Xcode:
```bash
cd mobile
npm ci
node scripts/montar-www.mjs
npx cap sync ios
```
Deve terminar com `OK: ... arquivos em www` e `Sync finished`.

## Parte 2: instalar direto pelo Xcode (o caminho mais curto)

Com o iPhone ligado por cabo, você nem precisa gerar o `.ipa`.

1. No iPhone: Ajustes › Privacidade e Segurança › Modo Desenvolvedor › ligar (ele reinicia). Depois confirme "Ativar".
2. No Mac: abra o projeto.
```bash
open ios/App/App.xcodeproj
```
3. No Xcode, clique em `App` (lado esquerdo, o ícone azul) › aba **Signing & Capabilities**:
   - Marque **Automatically manage signing**.
   - Em **Team**, escolha seu Apple ID (se não aparecer: Xcode › Settings › Accounts › `+` › Apple ID).
   - Em **Bundle Identifier**, troque `com.telap2p.nebula` por algo único, por exemplo `com.seunome.nebula`.
4. No topo do Xcode, escolha seu iPhone como destino e clique em ▶ (Run).
5. No iPhone, na primeira vez: Ajustes › Geral › VPN e Gerenciamento › seu Apple ID › **Confiar**. Abra o Nebula.

Se o Xcode reclamar de erro de compilação, anote a mensagem vermelha completa (aba Issues) e mande.

## Parte 3: gerar o `.ipa` para outras pessoas instalarem (opcional)

Útil para mandar o app a amigos, que instalam com Sideloadly (https://sideloadly.io) usando o próprio Apple ID.

```bash
cd mobile/ios/App
xcodebuild archive \
  -project App.xcodeproj -scheme App -configuration Release -sdk iphoneos \
  -archivePath ../../build/Nebula.xcarchive \
  CODE_SIGNING_ALLOWED=NO CODE_SIGNING_REQUIRED=NO CODE_SIGN_IDENTITY=""

mkdir -p ../../build/ipa/Payload
cp -R ../../build/Nebula.xcarchive/Products/Applications/App.app ../../build/ipa/Payload/
cd ../../build/ipa && zip -qry ../Nebula.ipa Payload
```
O arquivo fica em `mobile/build/Nebula.ipa`. O Sideloadly assina com o Apple ID de quem instala.

## O que testar depois de abrir o app
Anote o que funciona e o que não funciona e mande de volta:
1. O app abre e mostra a tela inicial (sem "Criar sala" e sem as opções de rede).
2. Entrar numa sala de um PC pelo código e a senha.
3. Abrir um convite `telap2p://sala?...` (colar no Notas e tocar).
4. Pedir o microfone ("Entrar na voz") e conversar. Alguém no PC confirma se ouve.
5. Ouvir o outro lado, com o som saindo no alto-falante.
6. Assistir à tela que alguém transmite no PC.
7. Mandar mensagem no chat e ver as pessoas da sala.

## Problemas comuns
- **"Untrusted Developer"** ao abrir: faça o passo 5 da Parte 2.
- **Não aparece Modo Desenvolvedor no iPhone:** conecte o cabo ao Mac e abra o Xcode uma vez; a opção aparece.
- **"No profiles for ... were found":** troque o Bundle Identifier (passo 3) por um único.
- **App some depois de 7 dias:** refaça o passo 4 da Parte 2 (conta grátis).
- **`npm ci` falha:** confira `node -v` (precisa ser 24 ou mais novo).

## Regras do projeto
- Não faça `git push`, tag nem publicação sem combinar.
- Mudou algo para fazer funcionar? Faça commit só do que mudou em `mobile/` e avise.

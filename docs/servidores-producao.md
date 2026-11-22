# Servidores em produção

Onde rodam os servidores da equipe, quem tem acesso, como atualizar, quanto custa e o que fazer quando algo quebra.
Escrito para quem chega sem contexto (pessoa ou IA). Atualizado em 21/11/2026, depois da saída da Hostinger.

Nenhum segredo fica neste arquivo. Eles existem só no servidor e no backup do dono (veja "Segredos").

## Resumo em 30 segundos

Tudo roda numa **VM do Google Cloud** na camada gratuita, com o **TURN da Cloudflare** (também grátis) para o vídeo que
não consegue ir direto entre os PCs. O custo esperado é **R$ 0 por mês**; existe um alerta por e-mail a partir de R$ 2,50.
O app (desde a **1.20.24**) já aponta para esse servidor. A VPS antiga da Hostinger só repassa o tráfego dos apps velhos
até **27/11/2026** e depois some sozinha.

| Peça | Onde roda | Endereço que o app usa | Arquivo do app |
|---|---|---|---|
| RazzeAPI: conta, amigos, presença, mensagens, painel admin (+ Caddy com HTTPS) | VM, Docker Compose em `~/nebula/razze-api` | `https://nebula-sys.duckdns.org` | `main/razze-service.js` |
| Servidor das salas do modo Internet | VM, serviço `tela-p2p-internet`, código em `/opt/tela-p2p` | `ws://34.63.86.72:8765` | `renderer/conectividade.js` |
| TURN principal (vídeo que não vai direto) | Cloudflare Realtime TURN | entregue pelo servidor das salas | — |
| TURN de reserva (coturn) | VM, serviço `coturn`, porta 3479 | entregue pelo servidor das salas, só se a Cloudflare falhar | — |
| Atualizações do app | GitHub Releases de `MateusMunhoz/Nebula` | — | `github.js` |

## Quem tem acesso a quê

| Conta | Quem tem hoje | Para que serve | Como dar acesso a outra pessoa |
|---|---|---|---|
| **Google Cloud** (projeto "My First Project", conta de faturamento "My Billing Account") | Andrick (dono e cartão) | A VM, o IP fixo, o firewall, o faturamento | IAM do projeto. Só para entrar na VM: ligar o OS Login e dar `Compute OS Admin Login` + `Compute Viewer`. **Não dar Editor/Proprietário**: com eles dá para criar máquinas que cobram no cartão do dono |
| **Cloudflare** (Realtime TURN) | Andrick | A chave do TURN grátis | Manage Account › Members. Quase nunca é preciso: a chave já está na VM |
| **DuckDNS** (`nebula-sys.duckdns.org`) | Andrick | O nome que aponta para o IP da VM | Não tem como compartilhar (é o login dele). Não precisa: o IP é fixo |
| **Hostinger** (até 27/11/2026) | Andrick | Só o repasse para os apps antigos | Não precisa: some sozinha |
| **GitHub** `MateusMunhoz/Nebula` | Equipe | Código e Releases | Pelo GitHub, como sempre |
| **Chave de assinatura** (`~/.tela-p2p/chave-de-atualizacao.pem`) | Andrick e Mateus | Publicar versões (`npm run publicar`) | Nunca compartilhar; combinar quem publica para as versões não se atropelarem |

Decisão do dono (21/11/2026): **o acesso à VM e à Cloudflare fica só com o Andrick.** Quem precisar mexer no servidor
pede a ele; ele roda os comandos deste documento ou dá um acesso temporário com as permissões mínimas acima.

## Detalhes da máquina

- **VM:** `instance-20261118-043544`, zona `us-central1-c`, tipo `e2-micro` (2 vCPU compartilhadas, 1 GB), Debian 13,
  disco padrão de 30 GB, snapshots diários do disco (agendamento `default-schedule-1`).
- **Memória (importante):** 1 GB é pouco para RazzeAPI + Caddy + servidor das salas + coturn. A VM tem **2 GB de swap**
  (`/swapfile`, no `/etc/fstab`, `vm.swappiness=10`) e **não tem o Ops Agent** do Google (o monitoramento que vem ligado
  na criação gastava memória à toa; foi removido e a etiqueta `goog-ops-agent-policy`, que fazia o Google reinstalá-lo,
  foi tirada da VM). Sem isso a VM trava por falta de memória (aconteceu em 22/11/2026). Confira com `free -m`:
  a linha `Swap` deve ter uns 2047.
- **IP externo fixo:** `34.63.86.72` (endereço estático `nebula-vm-ip`). Ele não muda ao reiniciar a VM.
- **Nome:** `nebula-sys.duckdns.org` aponta para esse IP. Como o IP é fixo, nada precisa atualizar o DuckDNS.
- **Firewall** (Rede VPC › Firewall, regra `nebula-servidor`, entrada de qualquer lugar): TCP 80, 443, 8765, 3479;
  UDP 443, 3478, 3479, 49160-49999. A 80 é obrigatória para o Caddy renovar o certificado HTTPS.
- **Entrar na VM:** console do Google Cloud › Compute Engine › VM instances › botão **SSH** da instância. A janela tem
  uma engrenagem com **Upload file** e **Download file** para trocar arquivos com o seu PC.
- No Debian da VM o comando é `docker-compose` (com hífen), não `docker compose`.

## Segredos (onde ficam, nunca no Git)

| Segredo | Onde fica na VM | Para que serve |
|---|---|---|
| `.env` da RazzeAPI (token de admin, Google OAuth, SMTP, `RAZZE_TOTP_KEY`) | `~/nebula/razze-api/.env` | Login, e-mail e 2FA. **Sem o `RAZZE_TOTP_KEY` certo, quem tem 2FA perde o acesso** |
| Segredo do coturn (`TURN_SECRET`) | `/etc/tela-p2p-internet.env` e `/etc/turnserver.conf` | Senhas temporárias do TURN de reserva |
| Chave da Cloudflare (`CF_TURN_KEY_ID`, `CF_TURN_API_TOKEN`) | `/etc/tela-p2p-internet.env` | Pedir as credenciais do TURN grátis |
| Banco (contas, amigos, mensagens de 30 dias) | volume Docker `razze-api_razze-data` (`razze.sqlite`) | Os dados de todo mundo |

O dono guarda no PC dele uma cópia do `.env` e um backup do banco. Se a VM sumir, é com eles que se recomeça
(seção "Recriar o servidor do zero").

## Custo

- **Medido:** de 1 a 21/11/2026, total **R$ 0,00** (R$ 3,48 de uso, todo coberto pelos descontos da camada gratuita).
- **O que é grátis:** uma `e2-micro` numa região dos EUA (`us-central1` serve), 30 GB de disco padrão e **1 GB por mês de
  tráfego de saída**.
- **O que pode cobrar (centavos a poucos reais):** tráfego de saída acima de 1 GB (por exemplo, se a Cloudflare falhar
  e o vídeo passar pelo coturn da VM), snapshots do disco crescendo, mudança de regra do Google.
- **Proteção:** o orçamento "Alerta Nebula R$5" (Billing › Budgets & caps) manda e-mail em 50%, 90% e 100% de R$ 5/mês.
  Alerta avisa, não bloqueia. Recebeu o e-mail? Billing › Reports, agrupar por SKU, e ver o que subiu.
- **Não mudar sem pensar no custo:** tipo da máquina (só `e2-micro` é grátis), região (só algumas dos EUA), disco
  (padrão, até 30 GB), e não desligar o TURN da Cloudflare.

## Rotinas

### Atualizar a RazzeAPI (depois de um merge na `main` que mexe em `razze-api/`)
Backup primeiro (abaixo), depois, na VM:
```sh
cd ~/nebula && git pull && cd razze-api && docker-compose up -d --build && docker-compose logs --tail=30 razze-api
curl -s https://nebula-sys.duckdns.org/v1/health      # {"ok":true,"service":"razze-api",...}
```
Atualize o servidor **antes** de publicar uma versão do app que dependa dele. Detalhes: `docs/razze-api.md`.

### Atualizar o servidor das salas (depois de um merge que mexe em `servidor-internet/` ou `sala-protocolo.js`)
```sh
sudo IP_PUBLICO=34.63.86.72 bash /opt/tela-p2p/servidor-internet/vps/instalar.sh
curl -s http://127.0.0.1:8765/health                   # "turn":true e "turnCloudflare":true
```
Ele baixa a `main`, mantém o segredo do coturn e as linhas `CF_TURN_*`. Mudança no protocolo da sala precisa do
servidor atualizado antes de publicar o app (exemplo real: a 1.20.23 trouxe sala sem senha, que o servidor antigo recusava).

### Backup do banco (faça antes de qualquer atualização e de vez em quando)
```sh
cd ~/nebula/razze-api && docker-compose stop razze-api
docker run --rm -v razze-api_razze-data:/data -v "$HOME":/backup busybox tar czf /backup/razze-data-$(date +%F).tgz -C /data .
docker-compose start razze-api && ls -lh ~/razze-data-*.tgz
```
Baixe o `.tgz` pela engrenagem da janela SSH (Download file) e guarde fora da VM. O app fica uns segundos sem a conta.

### Restaurar um backup
Envie o `.tgz` pela engrenagem (Upload file) e:
```sh
cd ~/nebula/razze-api && docker-compose stop razze-api
docker run --rm -v razze-api_razze-data:/data -v "$HOME":/backup busybox sh -c "rm -f /data/* && cd /data && tar xzf /backup/ARQUIVO.tgz && ls -la /data"
docker-compose start razze-api
```
O `ls` deve mostrar `razze.sqlite`. Restaurar volta o banco para o momento do backup: o que mudou depois se perde.

### Ligar ou trocar a chave da Cloudflare
1. https://dash.cloudflare.com › Realtime › TURN Server › Create (ou a chave existente). Anote o **Turn Token ID** e o
   **API Token** (o token aparece uma vez só).
2. Na VM, sem deixar o token no histórico:
   ```sh
   read -p "Turn Token ID: " CFID; read -s -p "API Token: " CFTOK; echo
   sudo sed -i '/^CF_TURN_KEY_ID=/d;/^CF_TURN_API_TOKEN=/d' /etc/tela-p2p-internet.env
   printf 'CF_TURN_KEY_ID=%s\nCF_TURN_API_TOKEN=%s\n' "$CFID" "$CFTOK" | sudo tee -a /etc/tela-p2p-internet.env >/dev/null; unset CFID CFTOK
   sudo systemctl restart tela-p2p-internet && sleep 4 && curl -s http://127.0.0.1:8765/health
   ```
3. `"turnCloudflare":true` = ok. Como funciona: `createCloudflareTurn` em `servidor-internet/server.js`.

## Quando algo quebra

| Sintoma | Conferir | Resolver |
|---|---|---|
| Ninguém entra na conta / amigos não aparecem | `curl -s https://nebula-sys.duckdns.org/v1/health` de qualquer PC | Na VM: `cd ~/nebula/razze-api && docker-compose ps` e `docker-compose logs --tail=50 razze-api`; `docker-compose up -d` |
| Erro de certificado HTTPS | `docker-compose logs --tail=50 caddy` | A porta 80 precisa estar aberta no firewall; o nome tem que apontar para `34.63.86.72` |
| Sala pela internet não abre | `curl -s http://34.63.86.72:8765/health` | Na VM: `sudo systemctl status tela-p2p-internet`, `sudo journalctl -u tela-p2p-internet -n 50`, `sudo systemctl restart tela-p2p-internet` |
| Sala abre mas o vídeo não chega para quem está no 4G | `/health` com `"turnCloudflare":false`? | `sudo journalctl -u tela-p2p-internet -n 20` (`HTTP 401` = chave da Cloudflare errada ou apagada: refaça "Ligar ou trocar a chave") |
| Nada responde | Console do Google: a VM está **Running**? | Iniciar a VM (Start). O IP é fixo, nada muda no app |
| Nada responde, mas a VM está **Running** (502 do Caddy, SSH lento ou sem abrir) | VM instances › a VM › Logs › **Serial port 1**: aparece `Under memory pressure` ou `Out of memory`? | Falta de memória: **Reset** da VM (os serviços voltam sozinhos; nada se perde). Depois, pelo SSH: `free -m` (swap ativo?) e `systemctl status google-cloud-ops-agent` (não deve existir). Se faltar, refaça os passos da memória em "Recriar o servidor do zero" |
| O nome não aponta para o IP certo | https://dns.google/resolve?name=nebula-sys.duckdns.org&type=A | Em duckdns.org, pôr `34.63.86.72` no campo do `nebula-sys` e "update ip" |
| E-mail do alerta de orçamento | Billing › Reports, por SKU | Ver se o tráfego subiu (Cloudflare caiu?) ou se surgiu um recurso novo |
| Convidado pelo navegador não consegue falar | O link é `https://`? | Sem HTTPS o celular não libera o microfone; veja a pendência da página `/ver` |

## Trocar de servidor no futuro (o que aprendemos)

1. O app **grava** o endereço do servidor no PC de cada pessoa (sessão da conta e preferência de rede). Trocar só o
   padrão não basta: a versão nova precisa **migrar o endereço antigo gravado** (exemplo em `main/razze-service.js`,
   `load`, e `renderer/conectividade.js`, `networkPreferences`, com o teste em `tests/razze-service.test.js`).
2. Publique essa versão com `--obrigatoria`: quem abrir uma versão velha é obrigado a atualizar (a atualização vem do
   GitHub, não do servidor, então funciona mesmo com o servidor antigo fora do ar).
3. Deixe o servidor antigo **repassando** para o novo até todos atualizarem (Caddy com `reverse_proxy` para o novo e um
   `socat` na porta das salas), para não dividir os amigos entre dois bancos.
4. Para a troca: pare a RazzeAPI antiga, faça o backup final, restaure no novo e só então ligue o repasse.

## Recriar o servidor do zero (se a VM for perdida)

1. Google Cloud: VM `e2-micro`, `us-central1`, Debian, disco padrão de 30 GB; promover o IP externo a estático; regra de
   firewall com as portas de "Detalhes da máquina". Apontar `nebula-sys` no DuckDNS para o IP novo (se mudar o IP,
   mude também `renderer/conectividade.js` e publique, migrando o endereço antigo como acima).
2. Na VM: `sudo apt update && sudo apt install -y docker.io docker-compose git && sudo systemctl enable --now docker`
   e `sudo usermod -aG docker $USER` (feche e abra a janela SSH para valer).
   **Memória, antes de tudo** (na criação, desmarque "Install Ops Agent" em Observability; se veio, remova):
   ```sh
   sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile
   echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
   echo 'vm.swappiness=10' | sudo tee /etc/sysctl.d/99-swap.conf && sudo sysctl -p /etc/sysctl.d/99-swap.conf
   sudo systemctl disable --now google-cloud-ops-agent; sudo apt-get remove -y google-cloud-ops-agent
   ```
   E tire da VM a etiqueta `goog-ops-agent-policy` (VM instances › marcar a VM › Labels), senão o Google reinstala o agente.
3. `git clone https://github.com/MateusMunhoz/Nebula.git ~/nebula`, enviar o `.env` guardado para `~/nebula/razze-api/.env`,
   `cd ~/nebula/razze-api && docker-compose create`, restaurar o backup do banco ("Restaurar um backup") e `docker-compose up -d --build`.
4. Servidor das salas: `git clone -b main https://github.com/MateusMunhoz/Nebula ~/tela && sudo IP_PUBLICO=<IP> bash ~/tela/servidor-internet/vps/instalar.sh`, depois ligar a chave da Cloudflare.

## Histórico da migração Hostinger → Google Cloud (20 e 21/11/2026)

- Motivo: a VPS da Hostinger (KVM 1, `srv2015370.hstgr.cloud`, `2.25.253.140`) custava cerca de R$ 88/mês.
- 20/11: VM criada, IP fixo, firewall, DuckDNS, RazzeAPI com HTTPS e servidor das salas no ar. Dados restaurados do
  backup de 21/11 01:14 UTC. **O que foi feito na Hostinger entre 01:14 e 03:10 UTC de 21/11 não veio** (o backup final
  das 03:10 existe no PC do dono, `razze-data-final.tgz`, mas não foi restaurado).
- 21/11 03:10 UTC: RazzeAPI da Hostinger parada; o Caddy de lá passou a repassar para `https://nebula-sys.duckdns.org`
  (original em `/root/Caddyfile.original`) e o serviço `nebula-repasse-salas` (socat) repassa a TCP 8765 para a VM.
  Pelo repasse, os apps antigos chegam à VM com o IP da Hostinger: os limites por IP (20 salas criadas por hora,
  10 senhas erradas) valem para todos eles juntos até atualizarem.
- 21/11: renovação da Hostinger desligada (fica no ar até 27/11/2026); alerta de orçamento criado; PR #86 (migração dos
  endereços, TURN da Cloudflare, docs) juntado; servidor das salas da VM atualizado para a `main`; Cloudflare ligada;
  **1.20.24 publicada como obrigatória**. Backup final e `.env` da Hostinger baixados para o PC do dono.
- O domínio `rezzenha.tech` (Hostinger) é outra assinatura e não foi mexido.
- 22/11 ~09:57: a VM travou por **falta de memória** (1 GB, sem swap, com o Ops Agent ligado): a RazzeAPI dava 502 e o
  servidor das salas não respondia, com a VM "Running". Reset da VM, 2 GB de swap, Ops Agent removido e a etiqueta
  `goog-ops-agent-policy` tirada. Depois disso: 433 MB livres e o swap sem uso.

## Pendências

- [ ] **Página `/ver` com HTTPS** (convidado que fala pelo navegador do celular). Ela estava em
      `https://2-25-253-140.sslip.io/ver`, um site a mais no Caddy da Hostinger, e **saiu do ar em 21/11** com o repasse.
      Hoje `http://34.63.86.72:8765/ver` só deixa **assistir** (o microfone exige HTTPS). Para voltar: um site
      `34-63-86-72.sslip.io` no Caddy da VM apontando para a porta 8765 e `TRUST_PROXY=1` no `/etc/tela-p2p-internet.env`
      (passo a passo em `servidor-internet/README.md`, "HTTPS quando a VPS já tem o Caddy da RazzeAPI"). O `Caddyfile`
      está no repositório: a mudança entra por PR, não editada só na VM, senão o próximo `git pull` briga com ela.
- [ ] Testar com o app publicado uma sala pela internet com alguém no 4G (o caminho que usa o TURN da Cloudflare).
- [ ] Trocar o token do DuckDNS (duckdns.org › menu da conta), se ainda não foi trocado: o antigo foi exposto durante a
      migração. Nada na VM usa o token; depois, conferir que `nebula-sys` continua em `34.63.86.72`.
- [ ] Depois de 27/11/2026: nada a fazer; a Hostinger sai do ar sozinha. Se aparecer alguém sem conseguir entrar, é um
      app anterior à 1.20.24 que ainda não abriu desde então: ao abrir, ele pede a atualização.

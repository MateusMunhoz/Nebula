# Servidores em produção (onde a equipe roda hoje)

Desde 21/11/2026 os servidores da equipe rodam numa VM do **Google Cloud** (camada gratuita), não mais na VPS da Hostinger.
Este documento diz onde está cada peça, como atualizar, quanto pode custar e o que falta para desligar a Hostinger.
Nenhum segredo fica aqui: `.env`, `TURN_SECRET`, tokens do DuckDNS e da Cloudflare só existem na VM (e no backup do dono).

## O que roda onde

| Peça | Onde | Endereço que o app usa |
|---|---|---|
| RazzeAPI (conta, amigos, presença, mensagens, painel) + Caddy (HTTPS) | VM, Docker Compose em `~/nebula/razze-api` | `https://nebula-sys.duckdns.org` (`main/razze-service.js`) |
| Servidor das salas (`servidor-internet/server.js`) | VM, systemd `tela-p2p-internet`, código em `/opt/tela-p2p` | `ws://34.63.86.72:8765` (`renderer/conectividade.js`) |
| coturn (STUN/TURN) | VM, systemd `coturn`, porta 3479 | entregue pelo servidor das salas (reserva, se a Cloudflare estiver ligada) |
| TURN da Cloudflare (opcional, recomendado) | Cloudflare Realtime TURN | entregue pelo servidor das salas |
| Atualizações do app | GitHub Releases | `github.js` (não depende de servidor nosso) |

**VM:** projeto Google Cloud "My First Project", instância `instance-20261118-043544`, zona `us-central1-c`, `e2-micro`,
Debian 13, disco padrão de 30 GB. IP externo **fixo** `34.63.86.72` (endereço estático `nebula-vm-ip`).
**Nome:** `nebula-sys.duckdns.org` (DuckDNS) aponta para o IP fixo; como o IP não muda, nada precisa atualizar o DuckDNS.
**Firewall** (regra VPC `nebula-servidor`, entrada de qualquer lugar): TCP 80, 443, 8765, 3479; UDP 443, 3478, 3479, 49160-49999.

O app antigo (até 1.20.22) tem gravado o endereço da Hostinger. A versão seguinte troca o padrão e **migra o endereço gravado**:
quem tinha `https://srv2015370.hstgr.cloud` ou `ws://2.25.253.140:8765` passa para os endereços novos; quem configurou
um servidor próprio continua com ele.

## Custo: o que é grátis e o que pode cobrar

A camada gratuita do Google cobre uma `e2-micro` numa região dos EUA, 30 GB de disco padrão e **só 1 GB por mês de tráfego de
saída**. Conta, amigos, presença e o servidor das salas gastam pouco. O que pode passar de 1 GB é o **vídeo relayado pelo TURN**
(quando dois PCs não conseguem conexão direta, a transmissão passa pelo servidor). Por isso:

- **Ligue o TURN da Cloudflare** (1.000 GB/mês grátis). Com ele, o coturn da VM só entra se a Cloudflare falhar.
- Existe um **alerta de orçamento** "Alerta Nebula R$5" na conta de faturamento (e-mail em 50%, 90% e 100% de R$ 5/mês).
  Alerta não bloqueia gasto: olhe o Billing nos primeiros dias.
- Confira no Billing se o IP externo fixo entra na camada gratuita; se cobrar, o valor aparece em Reports.

## Ligar o TURN da Cloudflare

1. Crie a conta em https://dash.cloudflare.com (pede cartão; os primeiros 1.000 GB/mês são grátis).
2. **Realtime › TURN Server › Create** (nome: `nebula`). Anote o **Turn Token ID** e o **API Token** (aparece uma vez só).
3. Na VM: `sudo nano /etc/tela-p2p-internet.env` e acrescente (sem espaços):
   ```
   CF_TURN_KEY_ID=o-token-id
   CF_TURN_API_TOKEN=o-api-token
   ```
4. `sudo systemctl restart tela-p2p-internet && sleep 3 && curl -s http://127.0.0.1:8765/health` deve mostrar
   `"turnCloudflare":true`. Se mostrar `false`: `journalctl -u tela-p2p-internet -n 20` (token errado dá `HTTP 401`).

Rodar o `instalar.sh` de novo mantém essas linhas. Como funciona: `createCloudflareTurn` em `servidor-internet/server.js`.

## Atualizar os servidores (depois de um merge na `main`)

Entrar na VM: console do Google Cloud › Compute Engine › VM instances › **SSH** na linha da instância.

- **RazzeAPI:** `cd ~/nebula && git pull && cd razze-api && docker-compose up -d --build && docker-compose logs --tail=30 razze-api`
  (no Debian da VM o comando é `docker-compose`, com hífen). Backup antes, como em `docs/razze-api.md`.
- **Servidor das salas:** `sudo IP_PUBLICO=34.63.86.72 bash /opt/tela-p2p/servidor-internet/vps/instalar.sh`
  (baixa a `main`; mantém o segredo do TURN e as chaves da Cloudflare).

Backup da RazzeAPI (contas, amigos, mensagens):
```sh
cd ~/nebula/razze-api && docker-compose stop razze-api
docker run --rm -v razze-api_razze-data:/data -v "$HOME":/backup busybox tar czf /backup/razze-data-$(date +%F).tgz -C /data .
docker-compose start razze-api
```
Baixe o `.tgz` para o seu PC (janela SSH › engrenagem › Download file). Guarde junto uma cópia do `.env`: o `RAZZE_TOTP_KEY`
dele é necessário para restaurar o 2FA de quem usa.

## Saída da Hostinger (checklist)

A renovação da VPS (KVM 1, `srv2015370.hstgr.cloud`) foi desligada: ela fica no ar até **27/11/2026** e depois some com os arquivos.
Até lá ela só **repassa** para a VM, para os apps antigos continuarem funcionando:

- Caddy da Hostinger (`/opt/tela-p2p/razze-api/Caddyfile`) faz `reverse_proxy` para `https://nebula-sys.duckdns.org`
  (original guardado em `/root/Caddyfile.original`); o container `razze-api-razze-api-1` de lá está **parado**.
- Serviço `nebula-repasse-salas` (socat) repassa a TCP 8765 para `34.63.86.72:8765`; o `tela-p2p-internet` de lá está desligado.
- Pelo repasse, todo app antigo chega à VM com o IP da Hostinger: os limites por IP (20 salas criadas por hora, 10 senhas
  erradas) valem para todos esses juntos até atualizarem.

Checklist:
- [x] VM criada, IP fixo, firewall, DuckDNS, RazzeAPI e servidor das salas no ar (dados restaurados do backup das 01:14 UTC
      de 21/11; o que foi feito na Hostinger entre 01:14 e 03:10 UTC não veio).
- [x] Hostinger repassando para a VM; renovação desligada; alerta de orçamento criado.
- [ ] TURN da Cloudflare ligado (seção acima) e `"turnCloudflare":true` no `/health`.
- [ ] Servidor das salas da VM atualizado para a `main` (`instalar.sh` acima): a primeira instalação veio do ramo antigo
      `modo-internet`.
- [ ] Publicar a versão nova do app (migração dos endereços) com a linha `obrigatória: <versão>` nas notas da release.
- [ ] Testar com o app publicado: login, amigos online, sala pela internet com alguém de fora (4G).
- [ ] Antes de 27/11: baixar da Hostinger `/root/razze-data-final.tgz` e uma cópia do `.env` do razze-api, como guarda.
- [ ] Trocar o token do DuckDNS (duckdns.org › reset token): o atual foi exposto durante a migração. Nada na VM usa o token.
- [ ] Depois de 27/11: nada a desligar; a Hostinger some sozinha. O domínio `rezzenha.tech` é outra assinatura e não foi mexido.

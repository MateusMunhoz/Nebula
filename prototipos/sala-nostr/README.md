# Protótipo: sala pelos relays Nostr e ponte grátis (fase 0)

Fase 0 de [`docs/spec/sala-pelo-nostr.md`](../../docs/spec/sala-pelo-nostr.md): medir antes de mexer no app se os relays
públicos servem para achar a sala, quanto tempo leva para entrar e se a ponte com travas deixa a voz passar e o vídeo não.
**Fora do pacote**: não está em `PACK_FILES` nem em `build.files`, e tem o próprio `package.json` (Node 24).

## Arquivos
| Arquivo | O quê |
|---|---|
| `sala.mjs` | Código de 16 caracteres, endereço da sala (PBKDF2 → secp256k1), eventos efêmeros cifrados (NIP-44), relays |
| `rtc.mjs` | WebRTC no Node (`node-datachannel`) para o canal "sala"; no app isso é o `RTCPeerConnection` do renderer |
| `teste.mjs` | Conferências sem rede (`node teste.mjs`) |
| `relays.mjs` | Pesquisa de relays públicos: aceitam o kind, ida e volta, evento grande, rajada |
| `cli.mjs` | Entrar de ponta a ponta: `host`, `entrar <código>` e `local` (os dois neste PC) |
| `turn/` | coturn com travas (`turnserver.conf`), emissor de acesso (`emissor.mjs`, `teste-emissor.mjs`), `Caddyfile` e serviço |
| `ponte-midia/` | Electron: voz (Opus estéreo 192 kbps) e vídeo (até 6 Mbps) direto ou só pelo TURN, mede o que chega |

```sh
cd prototipos/sala-nostr && npm ci
node teste.mjs && node turn/teste-emissor.mjs
node relays.mjs
node cli.mjs local --vezes 5
# na raiz do repositório (usa o Electron do app):
npx electron prototipos/sala-nostr/ponte-midia/main.cjs
```

## Resultados (28/10/2026, Windows 11, um PC em casa)

### Relays (`relays.mjs`)
Kind 25871 (provisório), conteúdo cifrado de ~5 KB (um SDP com folga) e de ~16 KB (o limite da spec).

| Relay | Conecta | Aceita | Ida e volta | ~16 KB | Rajada de 10 |
|---|---|---|---|---|---|
| relay.damus.io | 329 ms | sim | 316 ms | ok | **2/10, e baniu**: "too many rate-limit violations" |
| nos.lol | 617 ms | sim | 271 ms | ok | 10/10 |
| relay.primal.net | 1415 ms | sim | 249 ms | ok | 10/10 |
| relay.snort.social | 901 ms | sim | 216 ms | ok | 10/10 |
| nostr.mom | 776 ms | sim | 294 ms | ok | 10/10 |
| relay.nostr.net | 1294 ms | sim | 566 ms | ok | 10 aceitos, **4 entregues** |
| offchain.pub | 1075 ms | sim | 308 ms | ok | 10/10 |
| nostr.oxtr.dev | 1569 ms | sim | 304 ms | ok | 10/10 |
| relay.nostr.band | não conectou | | | | |

**Lista padrão escolhida** (`RELAYS_PADRAO`): nos.lol, relay.primal.net, relay.snort.social, nostr.mom e offchain.pub.
O nostr.oxtr.dev fica de reserva. Ficam fora o damus (bane quem manda 10 de uma vez, e uma troca de host com a sala cheia
faz isso), o relay.nostr.net (perde eventos) e o relay.nostr.band (fora do ar).

### Entrar na sala (`cli.mjs local`, 5 vezes, relays de verdade)
- **5/5 entradas**, com **mediana de 680 ms** do clique até o canal aberto:
  - derivar o endereço: 22 ms (PBKDF2 com 210 mil iterações);
  - reunir os candidatos: ~20 ms (3 host + 1 srflx: o STUN público respondeu);
  - pedido → resposta pelos relays: **~460 ms**;
  - canal: 2 ms.
- Antes disso, conectar nos 5 relays leva **0,6 a 1,8 s**. No app, conectar ao abrir a tela de entrar, não no clique.
- A oferta tem ~760 B: cabe com folga nos 16 KB.
- Nos dois lados no mesmo PC, o par foi `host/host`. Entre casas diferentes e no 4G falta testar (abaixo).

### Biblioteca
O `nostr-tools` 2.25.2 traz `lib/nostr.bundle.js` com `finalizeEvent`, `verifyEvent` e `nip44` em `window.NostrTools`.
Serve como script clássico em `vendor/`, sem esbuild.

### Mídia (`ponte-midia`, Electron 33)
| Modo | Voz | Vídeo |
|---|---|---|
| Direto (confere o teste) | 194 kbps | 6.020 kbps (pico de 6.373) |
| Só pelo TURN com as travas | falta: precisa do coturn na Oracle | falta |

Esperado com as travas (`max-bps=40000`, ~320 kbps por sessão): a voz perto de 194 kbps (com os cabeçalhos dá
~215 kbps, abaixo da trava) e o vídeo abaixo de ~320 kbps ou sem conectar.

### Atualização pela sala
O pacote tem 182 arquivos, 20,3 MB (o maior é o `wireguard.exe`, 8,9 MB), e vai em base64 (~27 MB) em pedaços de 48 KB.
Pela ponte, a 40 KB/s, isso dá **~12 minutos**, ocupando o canal da sala dessa pessoa: o ping da sala (15 s sem
resposta = caiu) pode estourar no meio. **Recomendação para a spec:** quem está na ponte não baixa a atualização pela sala.

## O que falta (precisa de um humano)

### 1. A ponte na Oracle (uma vez)
1. Conta na Oracle Cloud (Always Free), região São Paulo ou Vinhedo. Decidir antes se vira Pay As You Go (spec, decisão 2).
2. Instância Ubuntu 24.04, forma **VM.Standard.A1.Flex** (1 OCPU e 6 GB bastam), com IP público. Anote o IP público e o
   privado (aparece na página da instância).
3. Na **Security List** da rede: entrada TCP 22, 80, 443 e 3479; UDP 3479 e 49160–49999.
4. Na VM, a imagem da Oracle bloqueia tudo menos a porta 22. Ponha as regras **antes** da linha REJECT (confira o número
   com `sudo iptables -L INPUT --line-numbers`; costuma ser a 6):
   ```sh
   sudo iptables -I INPUT 6 -p tcp -m multiport --dports 80,443,3479 -j ACCEPT
   sudo iptables -I INPUT 6 -p udp --dport 3479 -j ACCEPT
   sudo iptables -I INPUT 6 -p udp --dport 49160:49999 -j ACCEPT
   sudo netfilter-persistent save
   ```
5. Em https://www.duckdns.org, crie um subdomínio (ex.: `nebula-turn`) apontando para o IP público.
6. coturn:
   ```sh
   sudo apt update && sudo apt install -y coturn nodejs
   SECRET=$(openssl rand -hex 32)
   sudo cp turnserver.conf /etc/turnserver.conf    # deste diretório turn/
   sudo sed -i "s/IP_PUBLICO/<ip público>/; s/IP_PRIVADO/<ip privado>/; s/SEGREDO_DO_TURN/$SECRET/" /etc/turnserver.conf
   sudo mkdir -p /var/log/turnserver && sudo chown turnserver:turnserver /var/log/turnserver
   echo 'TURNSERVER_ENABLED=1' | sudo tee -a /etc/default/coturn
   sudo systemctl enable coturn && sudo systemctl restart coturn
   ```
7. Emissor:
   ```sh
   sudo mkdir -p /opt/nebula-turn && sudo cp emissor.mjs /opt/nebula-turn/
   echo "TURN_SECRET=$SECRET" | sudo tee /etc/nebula-turn.env && sudo chmod 600 /etc/nebula-turn.env
   sudo cp nebula-turn.service /etc/systemd/system/   # antes, troque SEU_SUBDOMINIO no arquivo
   sudo systemctl daemon-reload && sudo systemctl enable --now nebula-turn
   ```
8. Caddy (https com Let's Encrypt): instale pelo repositório oficial (https://caddyserver.com/docs/install#debian-ubuntu-raspbian),
   copie o `Caddyfile` para `/etc/caddy/Caddyfile` com o domínio no lugar de `{$EMISSOR_DOMINIO}` e rode
   `sudo systemctl reload caddy`.
9. Conferir: `curl https://<subdomínio>.duckdns.org/v1/turn` devolve `iceServers` com `stun:` e `turn:`.

### 2. Os testes que faltam
| Teste | Comando | Esperado |
|---|---|---|
| Mídia só pela ponte | `npx electron prototipos/sala-nostr/ponte-midia/main.cjs --emissor https://<subdomínio>.duckdns.org` | voz ~190 kbps; vídeo < 320 kbps ou não conecta |
| Duas casas | PC 1: `node cli.mjs host --emissor …`; PC 2: `node cli.mjs entrar <código> --emissor …` | entra; par `srflx/srflx` (ou `host` com IPv6) |
| 4G ↔ 4G (celular roteado nos dois PCs) | os mesmos comandos | entra; anote o par (`relay` = precisou da ponte) |
| Canal da sala pela ponte | os mesmos, com `--so-ponte` nos dois | entra com par `relay/…` |
| Travas no log | `sudo tail -f /var/log/turnserver/turnserver.log` durante o teste de mídia | sessões aparecem e o vídeo não passa da trava |

Anote os resultados aqui. **Vai** se: entra em casas diferentes e no 4G, a mediana para entrar fica abaixo de 3 s
(contando os relays) e o vídeo não passa pela ponte com as travas.

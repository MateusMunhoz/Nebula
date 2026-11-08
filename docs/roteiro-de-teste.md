# Roteiro de teste na call (uns 15 minutos)

Para ver com gente e microfone de verdade o que os testes automáticos só simulam. Todo mundo na mesma
versão do app, numa sala com pelo menos 3 pessoas, todas na voz. Anote o número de cada item que falhar,
quem estava fazendo e o que aconteceu.

## Voz

1. **Eco.** Uma pessoa tira o fone e deixa o som sair pela caixa. Os outros falam.
   Deve acontecer: ninguém ouve a própria voz voltando.
2. **Supressão de ruído (IA).** Uma pessoa digita forte no teclado, bate na mesa ou liga um ventilador perto
   do microfone, sem falar.
   Deve acontecer: os outros não ouvem quase nada. Depois, em Voz e atalhos, troque para **Básica** e repita:
   deve passar mais barulho.
3. **Sensibilidade automática.** Fique em silêncio por 10 segundos.
   Deve acontecer: o seu indicador na barra ("Na voz", com as barrinhas) não acende. Fale baixinho: ele acende e
   os outros te ouvem.
4. **Apertar para falar.** Em Voz e atalhos, escolha **Apertar para falar** e uma tecla (ou o Mouse 4). Vá para
   o jogo.
   Deve acontecer: sem apertar, ninguém te ouve; segurando, ouvem. A barra mostra "Segure …" e "Falando".
5. **Quem está falando.** Cada um fala uma frase.
   Deve acontecer: acende o anel verde de quem fala na lista de pessoas e a bolinha verde na aba Pessoas.
6. **Ouvir a própria voz.** De fone, abra Voz e atalhos e clique em **Ouvir minha voz**. Fale, troque a supressão
   de ruído entre **Avançado** e **Desligada** e digite no teclado.
   Deve acontecer: você se ouve na hora, sem atraso que atrapalhe; com a IA, o teclado some. Desligue o microfone
   na barra da voz e fale: você continua se ouvindo, e os outros não. Feche a janela: o som para.

## Volume e atenuação

7. **Volume de uma pessoa.** Abra a lista de pessoas (o botão no topo do chat), clique no volume de alguém e
   coloque 50%. Em outra pessoa, 150%.
   Deve acontecer: uma fica mais baixa e a outra mais alta, só para você.
8. **Atenuação.** Alguém transmite um jogo com som. Em Voz e atalhos, coloque a atenuação em 60%.
   Deve acontecer: enquanto alguém fala na voz, o som da transmissão abaixa; volta sozinho meio segundo depois.

## Chat por cima do jogo e atalhos

9. **Ctrl+Enter no jogo.** Abra o chat por cima do jogo (o botão com a tela e as linhas), trave com
   Ctrl+Shift+E e vá para o jogo (em modo janela sem bordas). Aperte **Ctrl+Enter**, escreva e aperte **Enter**.
   Deve acontecer: a mensagem chega para todos e o teclado volta sozinho para o jogo. Repita apertando **Esc**
   no lugar do Enter: não manda nada e volta para o jogo.
10. **Trocar um atalho.** Em Voz e atalhos, troque o Ctrl+Enter por outro (por exemplo Ctrl+Alt+T) e repita o 9.
   Deve acontecer: o atalho novo funciona e o Ctrl+Enter volta a ser livre.

## Sala

11. **Troca de host de verdade.** Quem criou a sala **fecha o app** no meio da call (sem clicar em Sair).
    Deve acontecer: em uns 5 a 15 segundos, a pessoa que entrou primeiro vira host sozinha. A voz e as
    transmissões continuam, e a aba Pessoas mostra "Host" nela.

12. **Sessões abertas.** Uma pessoa cria uma sala; as outras ficam na tela inicial, sem entrar.
    Deve acontecer: em até 5 segundos, aparece "Sessão de <nome>" na lista de todo mundo, com o número de
    pessoas. Clique em **Entrar** e confira que entra direto. Se não aparecer para alguém, anote quem (é o
    aviso pela Radmin que não passou) e se o Windows pediu permissão do firewall ao abrir o app.
13. **Sessão oculta.** Crie outra sala com **Mostrar esta sessão** desmarcado. Deve acontecer: ela não
    aparece na lista de ninguém, mas dá para entrar pelo endereço.

## Conta, amigos e perfil (dois PCs, servidor atualizado)

Antes: a RazzeAPI da VPS com o código novo (links de amigo, conta, atividade e, se for testar, o Google).

1. **Primeira entrada.** Apague o `localStorage` do app (ou use uma instalação nova) e abra.
   Deve acontecer: 3 telas no máximo (como usar, nome e foto, conta); "Sala rápida" cai direto no Início.
2. **Conta.** No passo 3, crie uma conta e entre (com aprovação ligada, o app avisa e o administrador aprova no painel).
3. **Link de amigo.** No PC A: **Copiar meu link**. Cole no PC B (com o app fechado e depois aberto).
   Deve acontecer: B vê "A quer ser seu amigo. Aceitar?"; aceitando, os dois aparecem na lista um do outro. Usar o mesmo link
   de novo, num terceiro PC, deve recusar. **Revogar** na lista de links cancela o link.
4. **Código curto.** Gere outro link e, no PC B, cole só o código `ABCD-EFGH-JK` em Adicionar amigo.
5. **Ligar e Criar sala.** No Início, **Ligar** para o amigo online: ele recebe o convite e entra na voz. **Criar sala**:
   a sala abre em 1 clique e aparece na lista dos amigos.
6. **Senha.** Troque a senha em Perfil › Conta. Depois: o administrador gera um **Código de senha** no painel e a pessoa usa
   **Esqueci a senha** na tela de entrar (código vale 1 hora e uma vez).
7. **Frase e cartão.** Escreva uma frase no perfil. Deve acontecer: o amigo a vê no Início, e quem está na sala a vê ao abrir o seu
   perfil na voz.
8. **Foto e fundo.** Escolha uma foto e uma imagem de fundo: o editor abre, arraste e dê zoom; **Ajustar** reabre com o enquadramento.
9. **Atividade.** Ligue "jogo" e "música", abra um jogo da lista e toque algo no Spotify. Deve acontecer: o amigo vê "Jogando X" e
   "Ouvindo Y" (clicar mostra a faixa); desligue as caixinhas e some em até 2 minutos.
10. **Google** (se ligado na VPS). **Entrar com Google** abre o navegador e volta logado. Com um e-mail que já tem conta com senha,
    deve avisar para entrar com a senha e usar **Vincular Google**.

## Modo Líder (três PCs)

1. **Criar.** No PC A, na voz, clique em **+ Subsala** e escolha **Líder**.
   Deve acontecer: A entra na subsala nova, com o selo LÍDER. No PC B, o + Subsala mostra o Líder desativado.
2. **Ouvir de outro canal.** B entra na voz pelo **Entrar** (deve cair na Voz geral, não na Líder). A fala.
   Deve acontecer: B ouve A; o Seu sinal de B mostra "Ouvindo a Líder" com o volume. B fala: A **não** ouve B.
   Com o volume da Líder em 0, B deixa de ouvir A.
3. **Ouvir sem microfone.** O PC C fica fora da voz e clica em **Ouvir** no Seu sinal.
   Deve acontecer: C ouve A sem o Windows pedir o microfone. **Parar** corta o som.
4. **Grupo e Líder juntos.** B e C entram numa subsala Padrão e conversam enquanto A fala.
   Deve acontecer: os dois se ouvem e ouvem A ao mesmo tempo, sem eco.
5. **Tela.** A transmite com **Só o meu canal** marcado.
   Deve acontecer: B e C (fora da Líder) conseguem assistir; o selo vira LÍDER · AO VIVO.
6. **Pedir para falar.** A transmite na Líder. B (em outro canal) clica em **Pedir para falar**.
   Deve acontecer: A ouve o som de **Pediram para falar**, vê o aviso e o número na aba Voz. A clica em **Aceitar**: B fala e A e C ouvem B,
   enquanto o grupo de B continua ouvindo B normalmente. B ouve o som de **Você recebeu a palavra**.
7. **Tirar e recusar.** A clica em **Tirar**: ninguém fora do grupo de B ouve mais B, e B é avisado. B pede de novo
   e A clica em **Recusar**: B é avisado.
8. **Pedir fora da voz.** C sai da voz e clica em **Pedir**.
   Deve acontecer: C entra na Voz geral e o pedido chega a A.
9. **Apagar.** Apague a Líder.
   Deve acontecer: ninguém ouve mais A nem quem tinha a palavra de fora, e A volta para a Voz geral.

## Música e fila (dois PCs, os dois na versão nova)

1. **Pôr e enfileirar.** A e B na Voz geral. A clica em **Pôr música**, escolhe um vídeo; depois abre **Fila** na tela da
   música, **Procurar no YouTube**, e escolhe mais dois. Deve acontecer: o quadro do YouTube fica aberto e diz "Na fila: … (1ª)",
   "(2ª)"; B vê a mesma fila, com "posta por A".
2. **Mexer.** B arrasta o segundo para cima, usa **Alt+↓** num item e tira um (**Desfazer** devolve ao lugar). Deve acontecer:
   A vê a mesma ordem na hora.
3. **Fim e Próxima.** Leve a música para perto do fim. Deve acontecer: a primeira da fila começa nos dois, sem aviso de
   "trocou". **Próxima** pula para a seguinte; com a fila vazia, ela fica desligada e o fim libera o canal.
4. **De fora.** B entra numa subsala. Deve acontecer: B vê a fila sem os botões ("Só quem está em Voz geral mexe na fila"),
   mas tira o item que ele mesmo pôs.
5. **Parar.** A clica em **Parar a música**. Deve acontecer: a confirmação diz quantas estão na fila, e música e fila somem.
6. **Troca de host.** Com fila, o host sai da sala. Deve acontecer: a fila continua na mesma ordem. Com um PC numa versão
   antiga virando host, a fila some com o aviso.

## Anotações

| Item | Quem | O que aconteceu |
|------|------|-----------------|
|      |      |                 |

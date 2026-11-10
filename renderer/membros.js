'use strict';
// Painel da sala: endereço, lista de pessoas e o texto da área vazia.
// Script clássico: divide o escopo global com os outros (ordem no index.html). Usa de: util, estado, tema, voz, assistir, chat.

// ---------- Painel da sala ----------
async function renderRoomAddress() {
  const box = $('roomAddress');
  box.innerHTML = '';
  let addrs;
  if (state.cloud) { // modo Internet: quem entra só precisa do código (e da senha)
    $('noRadmin').hidden = true;
    addrs = [state.cloud.code];
  } else if (state.isOwner) {
    const provider = selectedNetworkProvider();
    const ips = await window.api.getIps(provider);
    const preferred = provider === 'razze' ? ips.filter((i) => i.razze) : ips.filter((i) => i.radmin);
    $('noRadmin').hidden = preferred.length > 0;
    $('noRadmin').textContent = provider === 'razze'
      ? 'Nenhum IP da VPN Razze foi encontrado. Conecte uma rede em Configurações › Rede.'
      : 'Nenhum IP da Radmin VPN (26.x.x.x) encontrado. Ligue a Radmin e entre na rede.';
    const usable = provider === 'razze' ? preferred : (preferred.length ? preferred : ips);
    addrs = usable.map((i) => `${i.address}:${state.port}`);
  } else {
    $('noRadmin').hidden = true;
    addrs = [`${state.host}:${state.port}`];
  }
  for (const addr of addrs) {
    const row = document.createElement('div');
    row.className = 'addr';
    const code = document.createElement('code');
    code.textContent = addr;
    const copy = document.createElement('button');
    copy.className = 'btn small';
    copy.textContent = 'Copiar';
    copy.onclick = async () => {
      try {
        await copiar(addr);
        copy.textContent = 'Copiado';
        setTimeout(() => { copy.textContent = 'Copiar'; }, 1500);
      } catch { toast('Não foi possível copiar. Selecione o endereço e use Ctrl+C.', 'error'); }
    };
    row.append(code, copy);
    box.append(row);
  }
  state.roomAddr = addrs[0] || '';
  renderSenhaSala(); // a senha e o Mudar (chamada.js)
  $('dockAddr').hidden = !state.roomAddr;
  $('dockAddr').title = state.cloud
    ? `Copiar o código da sala para convidar alguém: ${state.roomAddr}`
    : `Copiar o endereço da sala para convidar alguém: ${state.roomAddr}`;
  renderPalcoGente(); // o Convidar do palco vazio depende do endereço, que só fica pronto agora
}

function memberRow(id, name, sharing) {
  const who = id || state.myId;
  const li = document.createElement('li');
  li.className = 'member' + (sharing ? ' live' : '');
  li.style.setProperty('--person', personColor(id));
  li.dataset.person = who;
  li.classList.toggle('speaking', speaking.has(who));
  const dot = markProfile(avatar(id ? name : getName(), id), id, name);
  const info = document.createElement('div');
  info.className = 'info';
  const nameEl = document.createElement('span');
  nameEl.className = 'mname';
  nameEl.textContent = name;
  paintName(nameEl, id);
  markProfile(nameEl, id, name);
  nameEl.append(speakBars());
  const status = document.createElement('span');
  status.className = 'mstatus';
  const paused = id && state.focus && state.focus !== id && state.in.has(id);
  const inPip = id && state.pips.has(id);
  const voiceOn = inVoice(who);
  li.classList.toggle('in-voice', voiceOn); // no painel de voz, a linha abre o perfil do mapa (ceu-voz.js)
  const micOff = voiceOn && (id ? !!voice.members.get(id)?.muted : voice.muted);
  // Fone silenciado ("Silenciar vozes"): a pessoa não está ouvindo ninguém
  const deafOn = voiceOn && (id ? !!voice.members.get(id)?.deafened : voice.deafened);
  const parts = [];
  if (sharing) parts.push(inPip ? 'Transmitindo · na janela flutuante' : paused ? 'Transmitindo, em pausa para você' : 'Transmitindo');
  // Na voz não vira texto: os ícones de microfone e fone desligados (logo abaixo) já dizem
  status.textContent = parts.join(' · ') || (voiceOn ? '' : 'Na sala');
  status.hidden = !status.textContent;
  info.append(nameEl, status);
  // O jogo ou a música (conta.js): uma linha só; com os dois, a música, e o jogo vira um controle junto dos ícones de
  // microfone e fone (com o nome no mouse). O jogo aparece sempre como o controle, sem a imagem da Steam
  if (id) pedirAtv(id);
  const atv = atvDe(id);
  if (atv) {
    const linha = document.createElement('span');
    linha.className = 'matv';
    // Música: sempre o símbolo do Spotify (marca "está ouvindo", de qualquer player) e só o artista; a faixa fica na
    // dica e no perfil
    const icone = document.createElement('span');
    icone.className = 'matv-icon' + (atv.artista ? ' spotify' : ' jogo');
    icone.innerHTML = atv.artista ? ICON.spotify : atv.jogo ? ICON.game : /^(Codando|Criando)/.test(atv.tarefa) ? ICON.code : ICON.monitor;
    const texto = document.createElement('span');
    texto.className = 'matv-text';
    texto.textContent = atv.artista || (atv.jogo ? `Jogando ${atv.jogo}` : atv.tarefa);
    if (atv.artista) linha.title = (atv.faixa ? `${atv.faixa} — ${atv.artista}` : atv.artista) + (atv.spotify ? ' · Spotify' : '');
    linha.append(icone, texto);
    info.append(linha);
  }
  // Host: uma coroinha no canto do avatar; com o mouse em cima, aparece "Host" (CSS)
  let face = dot;
  if (who === state.hostId) {
    face = document.createElement('span');
    face.className = 'member-face is-host';
    const crown = document.createElement('span');
    crown.className = 'host-badge';
    crown.setAttribute('role', 'img');
    crown.setAttribute('aria-label', 'Host');
    crown.innerHTML = ICON.crown;
    face.append(dot, crown);
  }
  li.append(face, info);
  if (atv?.artista && atv.jogo) {
    const jogo = document.createElement('span');
    jogo.className = 'mic-off-icon jogo';
    jogo.innerHTML = ICON.game;
    jogo.title = `Jogando ${atv.jogo}`;
    jogo.setAttribute('role', 'img');
    jogo.setAttribute('aria-label', `Jogando ${atv.jogo}`);
    li.append(jogo);
  }
  for (const [on, icon, title] of [[micOff, 'micOff', 'Microfone desligado'], [deafOn, 'headphonesOff', 'Fone silenciado: não está ouvindo a voz']]) {
    if (!on) continue;
    const mo = document.createElement('span');
    mo.className = 'mic-off-icon';
    mo.innerHTML = ICON[icon];
    mo.title = title;
    li.append(mo);
  }

  // Volume dessa pessoa para você (voz e/ou transmissão). O valor nunca aparece na lista, só no cartão: aqui, só se mudou
  if (id && (voiceOn || state.in.has(id))) {
    const v = volOf(id);
    const changed = v.muted || v.voice !== DEFAULT_VOICE || v.screen !== DEFAULT_SCREEN;
    const vb = document.createElement('button');
    vb.type = 'button';
    vb.className = 'btn small vol-btn' + (v.muted ? ' muted' : changed ? ' changed' : '');
    vb.innerHTML = v.muted ? ICON.muted : ICON.volume;
    if (v.muted) vb.append('Mudo');
    const label = `Volume de ${name}${v.muted ? ' (silenciada para você)' : changed ? ' (mudou)' : ''}`;
    vb.title = label;
    vb.setAttribute('aria-label', label);
    vb.setAttribute('aria-expanded', String($('personCard').dataset.for === id && !$('personCard').hidden));
    vb.onclick = (e) => openPersonCard(id, vb, e.detail === 0);
    li.append(vb);
  }

  if (!id && sharing && state.myId) {
    const watching = state.in.has(state.myId);
    const btn = document.createElement('button');
    btn.className = watching ? 'watch-btn on' : 'watch-btn';
    setIcon(btn, watching ? 'monitorStop' : 'monitorPlay', watching ? 'Tirar a sua tela da sala' : 'Ver a sua própria transmissão, como um quadro na sala');
    btn.onclick = toggleSelfView;
    li.append(btn);
  }

  if (id && sharing) {
    const watching = state.in.has(id);
    const btn = document.createElement('button');
    btn.className = watching ? 'watch-btn on' : 'watch-btn';
    setIcon(btn, watching ? 'monitorStop' : 'monitorPlay', watching ? `Parar de assistir ${name}` : `Assistir ${name}`);
    btn.onclick = () => (watching ? stopWatching(id) : watch(id));
    if (!watching && !canWatch(id)) { btn.disabled = true; btn.title = closedShareText(id); btn.setAttribute('aria-label', closedShareText(id)); }
    li.append(btn);
  }
  return li;
}

function renderMembers() {
  if (typeof publicarSalaAtual === 'function') publicarSalaAtual(); // em que sala estou, para os amigos (salas-amigos.js)
  const list = $('members');
  list.innerHTML = '';
  $('memberCount').textContent = $('memberTitleCount').textContent = state.members.size + 1;
  $('peopleBtn').setAttribute('aria-label', `Pessoas na sala (${state.members.size + 1})`);
  $('peopleBtn').title = 'Pessoas na sala';
  const inVoiceCount = [...voice.members.values()].filter((m) => m.session).length + (voice.session ? 1 : 0);
  $('voiceCount').textContent = inVoiceCount ? `${inVoiceCount} na voz` : '';
  list.append(memberRow(null, getName(), state.sharing));
  const others = [...state.members].sort((a, b) => Number(b[1].sharing) - Number(a[1].sharing));
  for (const [id, m] of others) list.append(memberRow(id, m.name, m.sharing));
  renderVoicePane();
  if (typeof renderHomeCall === 'function') renderHomeCall(); // quem está na sala, na faixa do início
  repaintAllAvatars(); // entrou ou saiu alguém: a cor da estrela de quem não tem foto segue a ordem da sala
  renderPalcoGente(); // os cartões do palco vazio: quem está, microfone, fone e o que está fazendo
  renderPerfilFixo(); // a coluna do perfil: quem entrou, saiu, transmite, mudou na voz ou no volume (perfil-fixo.js)
}

// Palco vazio: sozinho e sem música, a decoração do tema e o texto. Senão, em cima a música do seu canal (se tem uma
// tocando e você não está ouvindo) e embaixo a grade com todo mundo da sala; quem transmite aparece com a tela e clicar
// nela assiste (renderPalcoGente)
function updateStage() {
  const telas = state.in.size > 0 && !state.minimizado; // minimizadas: abertas, mas fora da frente (setMinimizado)
  $('emptyStage').hidden = telas;
  // Minimizadas, as telas continuam no palco (o som segue tocando): o CSS esconde as transmissões e deixa a música
  // num player pequeno no canto, porque o YouTube pede o player à vista enquanto toca
  $('tiles').hidden = !state.in.size;
  $('tiles').classList.toggle('minimizado', state.minimizado);
  syncCallbarReserva(); // a faixa da barra da chamada só com a música no palco (navegacao.js)
  $('emptyText').textContent = state.sharing ? 'Você está transmitindo.' : 'Ninguém está transmitindo agora.';
  renderPalcoGente();
  syncCallbarFixa(); // as telas abriram ou fecharam: a grade (e a barra fixa embaixo dela) some ou volta (navegacao.js)
  if (!state.in.size) $('downloadInfo').textContent = '';
}

// Sozinho na sala: o cartão de convite. O QR leva o convite da sala (o mesmo das mensagens, sem o passe: telap2p://sala?d=…,
// que colado no campo Entrar abre a sala); o código ou endereço vai escrito; Convidar copia, como o botão da barrinha
let convitePalcoKey = '';
function renderConvitePalco() {
  const box = $('emptyConvite'), conv = $('emptyConvidar');
  const cv = state.roomAddr && state.members.size === 0 ? conviteDaSala(true) : null;
  box.hidden = !cv;
  $('emptyStage').classList.toggle('com-convite', !!cv);
  if (!conv.dataset.pronto) {
    conv.dataset.pronto = '1';
    conv.innerHTML = ICON.link;
    conv.append('Convidar');
    conv.onclick = () => $('dockAddr').click();
  }
  if (!cv) { convitePalcoKey = ''; return; }
  conv.title = $('dockAddr').title;
  const link = `telap2p://sala?d=${b64url(JSON.stringify(cv))}`;
  if (link === convitePalcoKey) return;
  convitePalcoKey = link;
  const qr = $('emptyConviteQr');
  try { qr.innerHTML = qrSvg(link); qr.hidden = false; } catch { qr.replaceChildren(); qr.hidden = true; } // convite grande demais para o QR: fica só o texto
  $('emptyConviteRotulo').textContent = cv.modo === 'internet' ? 'Código' : 'Endereço';
  const escrito = cv.modo === 'internet' ? cv.codigo : cv.endereco;
  $('emptyConviteCodigo').textContent = escrito;
  $('emptyConviteCodigo').classList.toggle('longo', escrito.length > 10);
}
let palcoGenteKey = '';
let palcoTempoTimer = 0;
const palcoPrevias = new Map(); // videoId -> { canal } (main/youtube-previa.js), ou null enquanto busca
let palcoFimEnviado = ''; // a música que este PC já mandou tirar por ter acabado (uma vez só)
// Quanto a música dura: a que a sala guardou (contada pelo player de quem ouve) ou a que este PC já viu; 0 sem saber
function palcoDuracao(e) { return e.dur || musica.duracoes.get(e.videoId) || 0; }
// A música chegou ao fim (live não tem duração, então não acaba)
function palcoMusicaAcabou(e) {
  const dur = palcoDuracao(e);
  return dur > 0 && musicPos(e) >= dur + 1;
}
function renderPalcoGente() {
  const box = $('emptyGente');
  renderConvitePalco();
  // A música do seu canal (fora da voz, a da Voz geral), só quando você ainda não está ouvindo (ouvindo e minimizada,
  // ela está no player do canto)
  const ch = myVoiceChannel();
  let musica = !state.in.has(musicKey(ch)) ? state.musicas?.get(ch) || null : null;
  // Já acabou: sai do palco. A sala tira sozinha (sala-protocolo.js: limparMusicas); com um servidor antigo, que não
  // guarda a duração, quem controla tira daqui, como o player de quem ouve faz no fim (musica.js)
  if (musica && palcoMusicaAcabou(musica)) {
    if (canControlMusic(musica) && palcoFimEnviado !== `${musica.videoId}:${musica.at}`) {
      palcoFimEnviado = `${musica.videoId}:${musica.at}`;
      musicCtl(musica, ...musicaFim(musica.videoId));
    }
    musica = null;
  }
  // Na grade, quem transmite vem primeiro e você por último (entre quem não transmite)
  const transmite = (id) => (id === state.myId ? !!state.sharing : !!state.members.get(id)?.sharing);
  const ids = state.members.size ? [...state.members.keys(), state.myId].sort((a, b) => Number(transmite(b)) - Number(transmite(a))) : [];
  const pessoa = (id) => {
    const eu = id === state.myId, v = eu ? voice : voice.members.get(id), naVoz = inVoice(id);
    return { id, eu, nome: eu ? getName() : nameOf(id), atv: atvDe(id), sharing: eu ? state.sharing : !!state.members.get(id)?.sharing,
      podeVer: eu || canWatch(id), naVoz, canal: naVoz ? (eu ? ch : channelOfMember(id)) : null,
      mic: naVoz && !!v?.muted, fone: naVoz && !!v?.deafened, assistindo: !eu && state.in.has(id) };
  };
  // Quem está no canal da música conta você mesmo sozinho na sala
  const gente = musica && !ids.length ? [pessoa(state.myId)] : ids.map(pessoa);
  // A grade é a sua chamada: só quem está na voz no seu canal (fora da voz, no da Voz geral, onde você entraria).
  // Quem está em outra subsala ou fora da voz fica na lista do painel. Só você no canal: sem grade
  const chamada = gente.filter((p) => p.naVoz && p.canal === ch);
  const grade = chamada.some((p) => !p.eu);
  // A tela de quem transmite: a mesma miniatura dos cartões do painel da voz, pedida a cada 15 s (assistir.js)
  const aoVivo = grade ? chamada.filter((p) => p.sharing && !p.eu).map((p) => p.id) : [];
  pedirMiniaturas(aoVivo); // sem ninguém ao vivo à vista: para de pedir e solta as imagens
  const previa = musica ? palcoPrevias.get(musica.videoId) : null;
  const key = JSON.stringify([musica && [musica.videoId, musica.title, musica.by, musica.playing, musica.pos, musica.at, musica.dur, ch, previa?.canal], gente]);
  if (key === palcoGenteKey) return;
  palcoGenteKey = key;
  clearInterval(palcoTempoTimer);
  palcoTempoTimer = 0;
  box.replaceChildren();
  // Ninguém na chamada e sem música: a decoração do tema. Senão, a música (se tem) e embaixo a grade da chamada
  const mostra = !!musica || grade;
  $('emptyStage').classList.toggle('com-gente', mostra);
  $('emptyStage').classList.toggle('com-grade', grade);
  box.hidden = !mostra;
  syncCallbarFixa(); // com a grade à vista, a barra da chamada fica fixa embaixo dela (navegacao.js)
  if (!mostra) return;
  if (musica) box.append(palcoMusica(musica, gente.filter((p) => p.canal === ch)));
  if (!grade) return;
  const g = document.createElement('div');
  g.className = 'pg-grade';
  g.append(...chamada.map(palcoCartao));
  box.append(g);
  ajustarPalcoGrade();
}

// A grade: o número de colunas que deixa as telas maiores (em 7:5) no espaço que sobra; refeita quando o palco muda de
// tamanho (janela, painel, coluna do perfil). Com muita gente as telas encolhem: a grade sempre cabe, nunca rola
let palcoGradeObs = null;
function ajustarPalcoGrade() {
  const g = $('emptyGente').querySelector('.pg-grade');
  if (!g) return;
  palcoGradeObs ??= new ResizeObserver(() => ajustarPalcoGrade());
  if (palcoGradeObs.alvo !== g) { palcoGradeObs.disconnect(); palcoGradeObs.observe(g); palcoGradeObs.alvo = g; }
  const n = g.children.length, vao = 8, W = g.clientWidth, H = g.clientHeight;
  if (!W || !H) return;
  let melhor = { w: 0, cols: 1 };
  for (let cols = 1; cols <= n; cols++) {
    const linhas = Math.ceil(n / cols);
    const w = Math.min((W - vao * (cols - 1)) / cols, ((H - vao * (linhas - 1)) / linhas) * 7 / 5);
    if (w > melhor.w) melhor = { w, cols };
  }
  g.style.setProperty('--cols', String(melhor.cols));
  g.style.setProperty('--tela-w', `${Math.floor(melhor.w)}px`);
}

// A música do seu canal, que você ainda não está ouvindo: a capa, o canal e quem pôs, o título, o canal do YouTube,
// as barrinhas, o ponto em que está e quem está no canal. Clicar ouve junto (a tela dela abre no palco, musica.js)
function palcoMusica(e, noCanal) {
  const el = document.createElement('button');
  el.type = 'button';
  el.className = 'pg-musica';
  el.title = 'Ouvir junto';
  el.onclick = () => listenMusic(e.ch);
  const capa = document.createElement('span');
  capa.className = 'pg-capa';
  const info = document.createElement('span');
  info.className = 'pg-musica-info';
  const rot = document.createElement('span');
  rot.className = 'pg-musica-rot';
  rot.innerHTML = ICON.music;
  rot.append(`${channelName(e.ch)} · posta por ${e.by === state.myId ? 'você' : nameOf(e.by)}`);
  const titulo = Object.assign(document.createElement('span'), { className: 'pg-musica-titulo', textContent: musicTitle(e) });
  // O canal do YouTube vem da prévia (a mesma dos links no chat), se ela está ligada em Privacidade
  if (!palcoPrevias.has(e.videoId) && appPreferences.chat.previaYoutube) {
    palcoPrevias.set(e.videoId, null);
    window.api.youtubePrevia(e.videoId).then((p) => { palcoPrevias.set(e.videoId, p || {}); renderPalcoGente(); }).catch(() => {});
  }
  const canal = palcoPrevias.get(e.videoId)?.canal || '';
  const art = Object.assign(document.createElement('span'), { className: 'pg-musica-art', textContent: [canal, e.playing ? '' : 'Pausada'].filter(Boolean).join(' · ') });
  // As barrinhas: só transform, paradas com a música pausada, com o app fora de foco, no modo gamer e com "reduzir movimento"
  const viz = document.createElement('span');
  viz.className = 'pg-viz' + (e.playing ? '' : ' parada');
  for (let i = 0; i < 40; i++) {
    const b = document.createElement('span');
    b.style.animationDelay = `-${(i * 137 % 100) / 100}s`;
    b.style.animationDuration = `${0.5 + (i * 53 % 50) / 100}s`;
    b.style.setProperty('--h', String(0.25 + (i * 71 % 75) / 100));
    viz.append(b);
  }
  const barra = document.createElement('span');
  barra.className = 'pg-barra';
  const feito = document.createElement('span');
  barra.append(feito);
  const tempo = document.createElement('span');
  tempo.className = 'pg-tempo';
  const ja = document.createElement('span'), total = document.createElement('span');
  tempo.append(ja, total);
  // O ponto da música (o da sala, musicPos) e a duração (palcoDuracao)
  const acertar = () => {
    const dur = palcoDuracao(e), pos = musicPos(e);
    ja.textContent = clock(dur ? Math.min(pos, dur) : pos);
    total.textContent = dur ? clock(dur) : '';
    feito.style.width = dur ? `${Math.min(100, (pos / dur) * 100)}%` : '0%';
  };
  acertar();
  // Chegou ao fim com o palco à vista: ele se refaz sem a música (renderPalcoGente tira ela da sala)
  if (e.playing) palcoTempoTimer = setInterval(() => {
    if (!el.isConnected) return;
    if (palcoMusicaAcabou(e)) { palcoGenteKey = ''; renderPalcoGente(); return; }
    if (!document.hidden) acertar();
  }, 1000);
  const quem = document.createElement('span');
  quem.className = 'pg-musica-quem';
  for (const p of noCanal) quem.append(avatar(p.nome, p.eu ? '' : p.id));
  quem.append(Object.assign(document.createElement('span'), { textContent: `${noCanal.length} no canal` }));
  info.append(rot, titulo, art, viz, barra, tempo, quem);
  el.append(capa, info);
  return el;
}

// Uma tela da grade: quem transmite aparece com a tela (Ao vivo; o mouse em cima mostra Assistir), os outros com a foto
// grande no meio. No pé, o nome, as barrinhas de quem fala e o microfone ou o fone desligados; falando, a borda fica
// verde (o .speaking vem do voz.js, pelo data-person). A de quem transmite (e você pode ver) assiste; as outras mostram
// o perfil (na coluna do perfil, ou no cartão da pessoa)
function palcoCartao(p) {
  const { atv } = p, aoVivo = p.sharing && !p.eu;
  const el = document.createElement(aoVivo && p.podeVer ? 'button' : 'div');
  el.className = 'pg-cartao' + (p.sharing ? ' transmitindo' : '') + (aoVivo ? ' ao-vivo' : '') + (p.eu ? ' eu' : '');
  el.dataset.person = p.id; // fica .speaking junto com o resto (voz.js)
  if (el.tagName === 'BUTTON') {
    el.type = 'button';
    el.title = p.assistindo ? `Voltar para a tela de ${p.nome}` : `Assistir a tela de ${p.nome}`;
    el.onclick = () => (p.assistindo ? setMinimizado(false, p.id) : watch(p.id));
  } else if (aoVivo) el.title = closedShareText(p.id);
  else markProfile(el, p.eu ? '' : p.id, p.nome);

  const midia = document.createElement('span');
  midia.className = 'pg-midia';
  if (p.sharing) {
    midia.classList.add('tela');
    const src = (aoVivo && minis.get(p.id)?.url) || atv?.jogoImagem;
    if (src) { const i = document.createElement('img'); i.src = src; i.alt = ''; i.className = 'pg-tela'; midia.append(i); }
    else midia.insertAdjacentHTML('beforeend', ICON.monitor);
    // O selo: Ao vivo; se você já assiste (com as telas minimizadas), Assistindo
    midia.append(Object.assign(document.createElement('span'), p.assistindo ? { className: 'pg-chip', textContent: 'Assistindo' } : { className: 'pg-selo', textContent: 'Ao vivo' }));
    if (el.tagName === 'BUTTON') {
      const assistir = document.createElement('span');
      assistir.className = 'pg-assistir';
      const pilula = document.createElement('span');
      pilula.innerHTML = ICON.monitor;
      pilula.append(p.assistindo ? 'Voltar' : 'Assistir');
      assistir.append(pilula);
      midia.append(assistir);
    }
  } else {
    midia.classList.add('foto');
    midia.append(avatar(p.nome, p.eu ? '' : p.id));
  }

  // O pé: a foto pequena só em quem transmite (a tela cobre a grande), o nome, as barrinhas de quem fala e os ícones
  const info = document.createElement('span');
  info.className = 'pg-info';
  if (p.sharing) info.append(avatar(p.nome, p.eu ? '' : p.id));
  const nome = document.createElement('span');
  nome.className = 'pg-nome';
  nome.textContent = p.nome;
  const eq = document.createElement('span');
  eq.className = 'eq';
  eq.setAttribute('aria-hidden', 'true');
  eq.append(document.createElement('span'), document.createElement('span'), document.createElement('span'));
  info.append(nome, eq);
  if (p.mic) info.insertAdjacentHTML('beforeend', `<span class="pg-ic" role="img" aria-label="Microfone desligado">${ICON.micOff}</span>`);
  if (p.fone) info.insertAdjacentHTML('beforeend', `<span class="pg-ic" role="img" aria-label="Fone desligado">${ICON.headphonesOff}</span>`);
  el.append(midia, info);
  el.classList.toggle('speaking', speaking.has(p.id));
  return el;
}
// Chegou uma miniatura nova (assistir.js: receberMiniatura): troca só a imagem do cartão, sem redesenhar o palco
function palcoMiniatura(id, url) {
  const midia = $('emptyGente').querySelector(`.pg-cartao.ao-vivo[data-person="${CSS.escape(id)}"] .pg-midia`);
  if (!midia) return;
  let img = midia.querySelector('img.pg-tela');
  if (!img) {
    midia.querySelector(':scope > svg')?.remove();
    img = document.createElement('img');
    img.className = 'pg-tela';
    img.alt = '';
    midia.prepend(img);
  }
  img.src = url;
}

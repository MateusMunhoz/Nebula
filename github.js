// Atualizações pelo GitHub: a última versão em Releases traz o mesmo pacote assinado que passa pela
// sala (pack.json + pack.sig). O boot.js confere a assinatura antes de instalar, então nem quem
// tiver acesso à conta do GitHub consegue publicar uma versão falsa sem a chave de quem publica.
const { net, shell } = require('electron');

const REPO = 'MateusMunhoz/AmostradinhoScreenShare';
const LATEST = `https://api.github.com/repos/${REPO}/releases/latest`;
const HEADERS = { 'User-Agent': 'Tela-P2P', Accept: 'application/vnd.github+json' };

async function latestRelease() {
  const res = await net.fetch(LATEST, { headers: HEADERS });
  if (res.status === 404) return null; // nenhuma versão publicada ainda
  if (!res.ok) throw new Error(`o GitHub respondeu ${res.status}`);
  const rel = await res.json();
  const version = String(rel.tag_name || '').replace(/^v/i, '');
  if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error('a última versão no GitHub não tem número');
  const asset = (name) => (rel.assets || []).find((a) => a.name === name)?.browser_download_url;
  return { version, pack: asset('pack.json'), sig: asset('pack.sig'), page: rel.html_url, minima: minimaDasNotas(rel.body) };
}

// "obrigatória: 1.20.8" nas notas (publicar.js --obrigatoria): abaixo disso o app pede para atualizar no Início.
// Só muda quando a pessoa atualiza; o pacote continua precisando da assinatura.
function minimaDasNotas(body) {
  const m = /^obrigat[óo]ria:\s*(\d{1,4}\.\d{1,4}\.\d{1,4})\s*$/im.exec(String(body || '').slice(0, 20000));
  return m ? m[1] : '';
}

async function downloadText(url) {
  if (!/^https:\/\/github\.com\//.test(url || '')) throw new Error('arquivo fora do GitHub');
  const res = await net.fetch(url, { headers: { 'User-Agent': HEADERS['User-Agent'] } });
  if (!res.ok) throw new Error(`o download falhou (${res.status})`);
  return res.text();
}

module.exports = {
  REPO,
  minimaDasNotas,

  async check() {
    try {
      return { ok: true, release: await latestRelease() };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  },

  // Baixa o pacote da última versão e entrega para o boot.js conferir e guardar
  async install(updater) {
    try {
      const rel = await latestRelease();
      if (!rel) return { ok: false, error: 'nenhuma versão publicada no GitHub' };
      if (!rel.pack || !rel.sig) return { ok: false, error: 'essa versão não tem o pacote de atualização', page: rel.page };
      const [pack, sig] = await Promise.all([downloadText(rel.pack), downloadText(rel.sig)]);
      return { ...updater.install(pack, sig), page: rel.page };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  },

  openPage(url) {
    if (/^https:\/\/github\.com\//.test(String(url))) shell.openExternal(url);
  },
};

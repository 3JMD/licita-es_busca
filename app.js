import { SEARCH, PNCP, getJson, normalizaBusca } from './lib/pncp.mjs';
import { $, UFS, td, link, urlSegura, fmtData, fmtValor, baixarCsv } from './dom.js';
import { iniciarPreco, pesquisarPreco } from './preco.js';
import { lerFavoritos, alternarFavorito, atualizarFavorito, STATUS_FAVORITO } from './favoritos.js';

const ufSel = $('uf');
UFS.forEach((u) => { ufSel.add(new Option(u, u)); $('mUf').add(new Option(u, u)); });

const CAMPOS_URL = ['dataInicial', 'dataFinal', 'uf', 'modalidade', 'tamanhoPagina', 'texto', 'q', 'situacao', 'municipio', 'pTermo', 'pUf', 'valorMin', 'valorMax'];
const MAX_MONITORES = 5;
const HORAS_NOVO = 25;
const CHAVE_MON = 'pncp.monitores';
const DIAS_URGENTE = 3;
const PACOTE_SAUDE = ['medicamentos', 'material médico hospitalar', 'OPME', 'oxigênio medicinal', 'nutrição enteral'];
const state = { tipo: 'abertas', pagina: 1, totalPaginas: 0, rows: [], sort: { col: null, dir: 1 } };

// Monitoramentos ficam só no navegador (localStorage); falha de storage não pode quebrar a página.
function carregarMon() {
  try {
    const m = JSON.parse(localStorage.getItem(CHAVE_MON));
    if (Array.isArray(m?.termos)) return { termos: m.termos.slice(0, MAX_MONITORES), visto: m.visto || null };
  } catch { /* storage indisponível ou JSON inválido */ }
  return { termos: [], visto: null };
}
function salvarMon(m) {
  try { localStorage.setItem(CHAVE_MON, JSON.stringify(m)); } catch { $('mHint').textContent = 'Não foi possível salvar neste navegador.'; }
}

function renderMon() {
  const { termos } = carregarMon();
  const ul = $('mLista'); ul.replaceChildren();
  termos.forEach((t, idx) => {
    const li = document.createElement('li');
    li.append(`${t.termo}${t.ufs ? ' (' + t.ufs + ')' : ''}`);
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'btn sec mini'; b.textContent = 'remover';
    b.addEventListener('click', () => {
      const m = carregarMon(); salvarMon({ ...m, termos: m.termos.filter((_, i) => i !== idx) });
      renderMon(); buscar();
    });
    li.append(b); ul.append(li);
  });
  $('mAdd').disabled = termos.length >= MAX_MONITORES;
  $('mHint').textContent = `${termos.length} de ${MAX_MONITORES} monitoramentos. Salvos neste navegador; mostra o que foi publicado desde a sua última visita (marcado "Novo").`;
}

async function verificarMonitores() {
  const m = carregarMon();
  const vistoMs = m.visto ? Date.parse(m.visto) : 0;
  const achados = new Map();
  const avisos = [];
  for (const t of m.termos) {
    const p = new URLSearchParams({ q: t.termo, tipos_documento: 'edital', status: 'recebendo_proposta', ordenacao: '-data', pagina: 1, tam_pagina: 50 });
    if (t.ufs) p.set('ufs', t.ufs);
    try {
      for (const i of (await getJson(SEARCH + '?' + p)).items || []) {
        if (!achados.has(i.numero_controle_pncp)) achados.set(i.numero_controle_pncp, { ...normalizaBusca(i), termo: t.termo, nova: Date.parse(i.data_publicacao_pncp) > vistoMs });
      }
    } catch (e) { avisos.push(`"${t.termo}": ${e.message}`); }
  }
  // Relê o storage: termos adicionados durante a consulta não podem ser sobrescritos.
  if (avisos.length < m.termos.length) salvarMon({ ...carregarMon(), visto: new Date().toISOString() });
  const data = [...achados.values()].sort((a, b) => (b.publicacao || '').localeCompare(a.publicacao || ''));
  return { data, totalRegistros: data.length, totalPaginas: 1, avisos };
}

function salvarUrl() {
  const p = new URLSearchParams({ tipo: state.tipo, pagina: state.pagina });
  CAMPOS_URL.forEach((c) => { if ($(c).value) p.set(c, $(c).value); });
  history.replaceState(null, '', '?' + p);
}

function restaurarUrl() {
  const p = new URLSearchParams(location.search);
  if (!p.has('tipo')) return false;
  state.tipo = ['cache', 'abertas', 'publicadas', 'busca', 'monitor', 'preco', 'favoritos'].includes(p.get('tipo')) ? p.get('tipo') : 'abertas';
  configurarAba();
  CAMPOS_URL.forEach((c) => { if (p.has(c)) $(c).value = p.get(c); });
  state.pagina = Math.max(1, parseInt(p.get('pagina'), 10) || 1);
  return true;
}

const iso = (d) => d.toISOString().slice(0, 10);
const addDias = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d; };
const paraApi = (v) => v.replaceAll('-', '');

function configurarAba() {
  const pub = state.tipo === 'publicadas';
  const busca = state.tipo === 'busca';
  const mon = state.tipo === 'monitor';
  const preco = state.tipo === 'preco';
  $('f').hidden = mon || preco;
  $('mon').hidden = !mon;
  $('pre').hidden = !preco;
  $('barra').hidden = preco;
  $('tabela').hidden = preco;
  if (mon) renderMon();
  $('lIni').hidden = !pub;
  $('lEnc').hidden = !pub;
  const cache = state.tipo === 'cache';
  const favs = state.tipo === 'favoritos';
  const local = cache || favs; // listas locais: filtram no navegador, sem consultar o PNCP
  ['modalidade', 'tamanhoPagina'].forEach((id) => { $(id).parentElement.hidden = local; });
  $('buscar').hidden = local;
  $('lFim').hidden = busca || local;
  $('lFav').hidden = !favs;
  $('lSrp').hidden = !(pub || state.tipo === 'abertas');
  $('chips').hidden = !busca;
  $('lQ').hidden = !busca;
  $('lSt').hidden = !busca;
  $('q').required = busca;
  $('dataFinal').required = !busca && !local;
  $('dataInicial').required = pub;
  $('lFim').firstChild.textContent = pub ? 'Publicadas até ' : 'Encerram até ';
  if (pub) {
    $('dataInicial').value = iso(addDias(-7));
    $('dataFinal').value = iso(new Date());
    $('hint').textContent = 'Lista o que foi publicado no PNCP no período (abertas e encerradas). Sem modalidade, consulta as 13 em paralelo e junta a página N de cada uma; períodos longos ficam lentos.';
  } else if (cache) {
    $('hint').textContent = 'Editais abertos dos termos monitorados pelo site (alerts.json), gravados todo dia pela Action. Abre rápido e funciona mesmo com o PNCP fora do ar; filtros aplicam-se a esta lista.';
  } else if (favs) {
    $('hint').textContent = 'Editais que você marcou com ★ (salvos neste navegador). Defina o status e anote; "descartar" deixa a linha esmaecida.';
  } else if (busca) {
    $('hint').textContent = 'Procura a palavra no texto dos editais de todo o PNCP (busca do próprio portal), mais recentes primeiro. A descrição vem truncada pelo PNCP; use "Detalhes" para ver itens e documentos.';
  } else {
    $('dataFinal').value = iso(addDias(30));
    $('hint').textContent = 'Lista contratações com recebimento de propostas em aberto e encerramento até a data escolhida.';
  }
  document.querySelectorAll('.tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tipo === state.tipo));
}

PACOTE_SAUDE.forEach((t) => {
  const b = document.createElement('button');
  b.type = 'button'; b.className = 'btn sec mini'; b.textContent = t;
  b.addEventListener('click', () => { $('q').value = t; state.pagina = 1; buscar(); });
  $('chips').append(b);
});

$('mSaude').addEventListener('click', () => {
  const m = carregarMon();
  const novos = PACOTE_SAUDE.filter((t) => !m.termos.some((x) => x.termo.toLowerCase() === t.toLowerCase() && !x.ufs))
    .slice(0, MAX_MONITORES - m.termos.length);
  salvarMon({ ...m, termos: [...m.termos, ...novos.map((termo) => ({ termo, ufs: '' }))] });
  renderMon();
  $('mHint').textContent = `${novos.length} termos do pacote Saúde adicionados (limite de ${MAX_MONITORES}). ` + $('mHint').textContent;
  buscar();
});

document.querySelectorAll('th[data-sort]').forEach((th) => th.addEventListener('click', () => {
  const col = th.dataset.sort;
  state.sort = { col, dir: state.sort.col === col ? -state.sort.dir : 1 };
  render();
}));

document.querySelectorAll('.tabs button').forEach((b) => b.addEventListener('click', () => {
  state.tipo = b.dataset.tipo; state.pagina = 1; state.rows = []; state.totalPaginas = 0; state.sort = { col: null, dir: 1 };
  configurarAba(); render(); $('status').textContent = 'Defina os filtros e clique em Buscar.'; $('pgInfo').textContent = '';
  if (['cache', 'favoritos'].includes(state.tipo) || (state.tipo === 'monitor' && carregarMon().termos.length)) buscar();
}));

$('fm').addEventListener('submit', (e) => {
  e.preventDefault();
  const m = carregarMon();
  const termo = $('mTermo').value.trim();
  const ufs = $('mUf').value;
  if (!termo || m.termos.length >= MAX_MONITORES) return;
  if (m.termos.some((t) => t.termo.toLowerCase() === termo.toLowerCase() && t.ufs === ufs)) { $('mHint').textContent = 'Esse monitoramento já existe.'; return; }
  salvarMon({ ...m, termos: [...m.termos, { termo, ufs }] });
  $('mTermo').value = '';
  renderMon(); buscar();
});
$('f').addEventListener('submit', (e) => { e.preventDefault(); state.pagina = 1; buscar(); });
$('ant').addEventListener('click', () => { if (state.pagina > 1) { state.pagina--; buscar(); } });
$('prox').addEventListener('click', () => { if (state.pagina < state.totalPaginas) { state.pagina++; buscar(); } });
['texto', 'municipio', 'valorMin', 'valorMax'].forEach((c) => $(c).addEventListener('input', render));
$('soEncerradas').addEventListener('change', render);
ufSel.addEventListener('change', () => { if (['cache', 'favoritos'].includes(state.tipo)) render(); });
['favStatus', 'soSrp'].forEach((c) => $(c).addEventListener('change', render));
$('csv').addEventListener('click', exportarCsv);

async function buscarTexto() {
  const tam = Number($('tamanhoPagina').value);
  const p = new URLSearchParams({
    q: $('q').value.trim(), tipos_documento: 'edital', status: $('situacao').value,
    ordenacao: '-data', pagina: state.pagina, tam_pagina: tam,
  });
  if (ufSel.value) p.set('ufs', ufSel.value);
  if ($('modalidade').value) p.set('modalidades', $('modalidade').value);
  const j = await getJson(SEARCH + '?' + p);
  return { data: (j.items || []).map(normalizaBusca), totalRegistros: j.total || 0, totalPaginas: Math.ceil((j.total || 0) / tam), avisos: [] };
}

async function carregarCache() {
  const r = await fetch('data/destaques.json', { cache: 'no-cache' });
  if (!r.ok) throw new Error('cache indisponível (HTTP ' + r.status + ')');
  const d = await r.json();
  const corte = Date.parse(d.geradoEm) - HORAS_NOVO * 3600e3;
  const agora = Date.now();
  // Entre uma atualização e outra, esconde o que já encerrou.
  const data = d.rows.filter((x) => !x.encerramento || Date.parse(x.encerramento) > agora)
    .map((x) => ({ ...x, nova: Date.parse(x.publicacao) > corte }));
  return { data, totalRegistros: data.length, totalPaginas: 0, avisos: [], geradoEm: d.geradoEm };
}

const ORDEM_STATUS = Object.fromEntries(STATUS_FAVORITO.map((st, i) => [st, i]));

async function carregarFavoritosAba() {
  const data = Object.values(lerFavoritos()).map((f) => ({ ...f.row, fav: f }))
    .sort((a, b) => ORDEM_STATUS[a.fav.status] - ORDEM_STATUS[b.fav.status] || (a.encerramento || '').localeCompare(b.encerramento || ''));
  return { data, totalRegistros: data.length, totalPaginas: 0, avisos: [] };
}

async function buscarProxy() {
  const p = new URLSearchParams({
    tipo: state.tipo,
    dataFinal: paraApi($('dataFinal').value),
    pagina: state.pagina,
    tamanhoPagina: $('tamanhoPagina').value,
  });
  if (state.tipo === 'publicadas') p.set('dataInicial', paraApi($('dataInicial').value));
  if (ufSel.value) p.set('uf', ufSel.value);
  if ($('modalidade').value) p.set('modalidade', $('modalidade').value);
  const r = await fetch('/api/pncp?' + p);
  const j = await r.json();
  if (!r.ok) throw new Error(j.erro || 'Erro ' + r.status);
  return j;
}

async function buscar() {
  if (state.tipo === 'preco') return pesquisarPreco();
  salvarUrl();
  $('buscar').disabled = true;
  $('status').textContent = 'Consultando o PNCP…';
  $('aviso').style.display = 'none';
  const tipo = state.tipo;
  try {
    const j = await ({ busca: buscarTexto, monitor: verificarMonitores, cache: carregarCache, favoritos: carregarFavoritosAba }[state.tipo] || buscarProxy)();
    if (tipo !== state.tipo) return; // resposta atrasada de outra aba
    state.rows = j.data;
    state.totalPaginas = j.totalPaginas;
    $('status').textContent = state.tipo === 'favoritos'
      ? `${j.totalRegistros} favoritos`
      : state.tipo === 'cache'
      ? `${j.totalRegistros} editais abertos · atualizado em ${fmtData(j.geradoEm)}${Date.now() - Date.parse(j.geradoEm) > 48 * 3600e3 ? ' (desatualizado: confira a Action)' : ''} · ${j.data.filter((r) => r.nova).length} novos`
      : state.tipo === 'monitor'
      ? `${j.totalRegistros} editais abertos, ${j.data.filter((r) => r.nova).length} novos desde a última visita`
      : `${j.totalRegistros.toLocaleString('pt-BR')} registros no PNCP`;
    if (j.avisos && j.avisos.length) {
      $('aviso').textContent = 'Algumas consultas falharam e estão faltando: ' + j.avisos.join(' | ');
      $('aviso').style.display = 'block';
    }
  } catch (err) {
    if (tipo !== state.tipo) return;
    state.rows = []; state.totalPaginas = 0;
    $('status').textContent = '';
    $('aviso').textContent = 'Falha na consulta: ' + err.message;
    $('aviso').style.display = 'block';
  } finally {
    $('buscar').disabled = false;
    render();
  }
}

function statusDe(row) {
  const s = (row.situacao || '').toLowerCase();
  if (s.includes('revogada') || s.includes('anulada') || s.includes('suspensa')) return { t: row.situacao, c: 'no' };
  if (!row.encerramento) return { t: row.situacao || '—', c: 'neu' };
  return new Date(row.encerramento) > new Date() ? { t: 'Aberta', c: 'ok' } : { t: 'Encerrada', c: 'neu' };
}

const vazio = (v) => v == null || v === '';

function ordenar(rows) {
  const { col, dir } = state.sort;
  if (!col) return rows;
  return [...rows].sort((a, b) => {
    if (vazio(a[col]) || vazio(b[col])) return vazio(a[col]) - vazio(b[col]); // vazios sempre no fim
    return (typeof a[col] === 'number' ? a[col] - b[col] : String(a[col]).localeCompare(String(b[col]))) * dir;
  });
}

function filtradas() {
  return ordenar(filtrar());
}

function filtrar() {
  if (state.tipo === 'monitor') return state.rows;
  const q = $('texto').value.trim().toLowerCase();
  const soEnc = state.tipo === 'publicadas' && $('soEncerradas').checked;
  const mun = $('municipio').value.trim().toLowerCase();
  const vMin = $('valorMin').value === '' ? null : Number($('valorMin').value);
  const vMax = $('valorMax').value === '' ? null : Number($('valorMax').value);
  return state.rows.filter((r) => {
    if (soEnc && statusDe(r).t !== 'Encerrada') return false;
    if (['cache', 'favoritos'].includes(state.tipo) && ufSel.value && r.uf !== ufSel.value) return false;
    if (state.tipo === 'favoritos' && $('favStatus').value && r.fav.status !== $('favStatus').value) return false;
    if (!$('lSrp').hidden && $('soSrp').checked && !r.srp) return false;
    if (mun && !(r.municipio || '').toLowerCase().includes(mun)) return false;
    if ((vMin !== null || vMax !== null) && !r.valorEstimado) return false;
    if (vMin !== null && r.valorEstimado < vMin) return false;
    if (vMax !== null && r.valorEstimado > vMax) return false;
    if (!q) return true;
    return [r.orgao, r.objeto, r.municipio, r.unidade, r.modalidade].join(' ').toLowerCase().includes(q);
  });
}

function prazoCell(r) {
  const ms = Date.parse(r.encerramento) - Date.now();
  const urgente = ms > 0 && ms < DIAS_URGENTE * 86400e3;
  const resta = ms >= 86400e3 ? `${Math.floor(ms / 86400e3)} d` : `${Math.max(1, Math.floor(ms / 3600e3))} h`;
  return td(fmtData(r.encerramento) + (urgente ? ` · em ${resta}` : ''), urgente ? 'dt urg' : 'dt');
}

function controlesFavorito(r) {
  const sel = document.createElement('select');
  STATUS_FAVORITO.forEach((st) => sel.add(new Option(st, st)));
  sel.value = r.fav.status;
  sel.addEventListener('change', () => atualizarFavorito(r.id, { status: sel.value }));
  const nota = document.createElement('input');
  nota.type = 'text'; nota.maxLength = 300; nota.placeholder = 'anotação'; nota.value = r.fav.nota || '';
  nota.addEventListener('change', () => atualizarFavorito(r.id, { nota: nota.value }));
  const box = document.createElement('div'); box.className = 'favctl'; box.append(sel, nota);
  return box;
}

function objeto(r) {
  const c = td(r.objeto, 'obj');
  if (state.tipo === 'favoritos' && r.fav) c.append(controlesFavorito(r));
  if (r.termo) { const sm = document.createElement('small'); sm.className = 'mut'; sm.textContent = ' ↳ ' + r.termo; c.append(sm); }
  return c;
}

function render() {
  const tb = $('tb'); tb.replaceChildren();
  const rows = filtradas();
  const favs = lerFavoritos();
  document.querySelectorAll('th[data-sort]').forEach((th) => { th.dataset.dir = state.sort.col === th.dataset.sort ? (state.sort.dir > 0 ? ' ▲' : ' ▼') : ''; });
  if (!rows.length) {
    const tr = document.createElement('tr'); const c = td(state.rows.length ? 'Nenhum resultado com esse filtro nesta página.' : 'Nenhum resultado.', 'vazio'); c.colSpan = 9; tr.append(c); tb.append(tr);
  }
  for (const r of rows) {
    const tr = document.createElement('tr');
    if (favs[r.id]?.status === 'descartar') tr.className = 'dim';
    const org = td(r.orgao, 'org'); const sm = document.createElement('small'); sm.textContent = r.unidade || ''; org.append(sm);
    const st = statusDe(r); const stc = document.createElement('td'); const tag = document.createElement('span'); tag.className = 'tag ' + st.c; tag.textContent = st.t; stc.append(tag);
    if (r.nova) { const n = document.createElement('span'); n.className = 'tag ok'; n.textContent = 'Novo'; stc.append(' ', n); }
    const lk = document.createElement('td');
    if (urlSegura(r.linkPncp)) lk.append(link(r.linkPncp, 'PNCP'));
    if (urlSegura(r.linkOrigem)) { if (lk.childNodes.length) lk.append(' · '); lk.append(link(r.linkOrigem, 'Origem')); }
    if (r.cnpj && r.ano && r.seq) {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'btn sec mini'; b.textContent = 'Detalhes';
      b.addEventListener('click', () => alternarDetalhes(tr, r));
      if (lk.childNodes.length) lk.append(' · ');
      lk.append(b);
    }
    const estrela = document.createElement('button');
    estrela.type = 'button'; estrela.className = 'btn sec mini'; estrela.title = 'Favorito'; estrela.textContent = favs[r.id] ? '★' : '☆';
    estrela.addEventListener('click', () => { alternarFavorito(r); if (state.tipo === 'favoritos') buscar(); else render(); });
    if (lk.childNodes.length) lk.append(' · ');
    lk.append(estrela);
    tr.append(org, td(`${r.uf || ''} / ${r.municipio || ''}`), td((r.modalidade ?? '—') + (r.srp ? ' · SRP' : '')), objeto(r),
      td(fmtValor(r.valorEstimado), 'num'), td(fmtData(r.publicacao), 'dt'), prazoCell(r), stc, lk);
    tb.append(tr);
  }
  $('pgInfo').textContent = state.totalPaginas ? `Página ${state.pagina} de ${state.totalPaginas.toLocaleString('pt-BR')}` : '';
  $('ant').disabled = state.pagina <= 1;
  $('prox').disabled = state.pagina >= state.totalPaginas;
  $('csv').disabled = !rows.length;
}

function montarDetalhes(itens, arquivos) {
  const box = document.createElement('div');
  const h = (t) => { const e = document.createElement('h3'); e.textContent = t; return e; };
  box.append(h('Documentos'));
  const ul = document.createElement('ul');
  arquivos.filter((a) => a.statusAtivo && urlSegura(a.url)).forEach((a) => {
    const li = document.createElement('li');
    li.append(link(a.url, a.titulo || 'arquivo'), ` (${a.tipoDocumentoNome || 'documento'})`);
    ul.append(li);
  });
  box.append(ul.childElementCount ? ul : Object.assign(document.createElement('span'), { textContent: 'Nenhum documento publicado.' }));
  box.append(h(itens.length >= 50 ? 'Itens (primeiros 50)' : `Itens (${itens.length})`));
  const t = document.createElement('table');
  const cab = t.createTHead().insertRow();
  ['Nº', 'Descrição', 'Qtde', 'Un.', 'Valor unit.', 'Total', 'Benefício (ME/EPP)'].forEach((x) => { const th = document.createElement('th'); th.textContent = x; cab.append(th); });
  const tb = t.createTBody();
  itens.forEach((i) => tb.insertRow().append(td(i.numeroItem), td(i.descricao), td(i.quantidade, 'num'), td(i.unidadeMedida),
    td(fmtValor(i.valorUnitarioEstimado), 'num'), td(fmtValor(i.valorTotal), 'num'), td(i.tipoBeneficioNome)));
  box.append(t);
  return box;
}

async function alternarDetalhes(tr, r) {
  const prox = tr.nextElementSibling;
  if (prox?.classList.contains('det')) { prox.remove(); return; }
  const dr = document.createElement('tr'); dr.className = 'det';
  const c = td('Carregando itens e documentos…', 'det-c'); c.colSpan = 9; dr.append(c); tr.after(dr);
  const base = `${PNCP}/orgaos/${r.cnpj}/compras/${r.ano}/${r.seq}`;
  try {
    const [itens, arqs] = await Promise.all([getJson(`${base}/itens?pagina=1&tamanhoPagina=50`), getJson(`${base}/arquivos`)]);
    c.replaceChildren(montarDetalhes(itens || [], arqs || []));
  } catch (e) {
    c.textContent = 'Falha ao carregar detalhes: ' + e.message;
  }
}

function exportarCsv() {
  const cols = ['id','orgao','cnpj','esfera','uf','municipio','unidade','modalidade','objeto','valorEstimado','valorHomologado','situacao','publicacao','abertura','encerramento','linkPncp','linkOrigem'];
  baixarCsv(`pncp_${state.tipo}_p${state.pagina}.csv`, cols, filtradas());
}

await iniciarPreco({ salvarUrl });
if (restaurarUrl()) buscar();
else { state.tipo = 'cache'; configurarAba(); buscar(); }

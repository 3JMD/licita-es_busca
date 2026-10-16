// Aba "Preço de referência": um item (com cache diário opcional) ou uma lista de itens.
import { buscarPrecos, resumoPorUnidade, norm } from './lib/pncp.mjs';
import { $, UFS, td, link, urlSegura, fmtData, fmtUnit, baixarCsv } from './dom.js';

const CACHE_MAX_HORAS = 72;
const MAX_LOTE = 20;
const COLUNAS_LOTE = ['item', 'unidade', 'n', 'min', 'mediana', 'max', 'fornecedor', 'orgao'];

let precos = [];
let lote = [];
let cache = null; // { geradoEm, itens: [{ termo, uf, atas, rows }] } gerado pela Action
let salvarUrl = () => {};

export async function iniciarPreco({ salvarUrl: salvar }) {
  salvarUrl = salvar;
  UFS.forEach((u) => $('pUf').add(new Option(u, u)));
  $('fp').addEventListener('submit', (e) => { e.preventDefault(); pesquisarPreco(); });
  $('pLive').addEventListener('click', () => pesquisarPreco({ aoVivo: true }));
  $('pCsv').addEventListener('click', () => baixarCsv('pncp_precos.csv',
    ['item', 'unidade', 'valorUnitario', 'quantidade', 'fornecedor', 'orgao', 'municipio', 'uf', 'data', 'link'], precos));
  $('fl').addEventListener('submit', (e) => { e.preventDefault(); pesquisarLote(); });
  $('lCsv').addEventListener('click', () => baixarCsv('pncp_precos_lote.csv', COLUNAS_LOTE, lote));
  await carregarCachePrecos();
}

async function carregarCachePrecos() {
  try {
    const r = await fetch('data/precos.json', { cache: 'no-cache' });
    if (!r.ok) return;
    cache = await r.json();
    $('pItens').replaceChildren(...cache.itens.map((i) => new Option(i.termo)));
  } catch { /* sem cache: tudo funciona ao vivo */ }
}

function emCache(termo, uf) {
  if (!cache || Date.now() - Date.parse(cache.geradoEm) > CACHE_MAX_HORAS * 3600e3) return null;
  return cache.itens.find((i) => norm(i.termo) === norm(termo) && (i.uf || '') === uf && i.rows.length) || null;
}

function renderPreco() {
  const tb = $('pTb'); tb.replaceChildren();
  for (const r of precos) {
    const tr = document.createElement('tr');
    const lk = document.createElement('td'); if (urlSegura(r.link)) lk.append(link(r.link, 'PNCP'));
    tr.append(td(r.item, 'obj'), td(r.unidade), td(fmtUnit(r.valorUnitario), 'num'), td(r.quantidade?.toLocaleString('pt-BR'), 'num'),
      td(r.fornecedor), td(`${r.orgao || ''} (${r.municipio || ''}/${r.uf || ''})`), td(fmtData(r.data), 'dt'), lk);
    tb.append(tr);
  }
  $('pCsv').disabled = !precos.length;
  $('pSum').textContent = resumoPorUnidade(precos).map((x) =>
    `${x.unidade}: ${x.n} ${x.n === 1 ? 'preço' : 'preços'} — mín. ${fmtUnit(x.min)} · mediana ${fmtUnit(x.mediana)} · média ${fmtUnit(x.media)} · máx. ${fmtUnit(x.max)}`).join('\n');
}

export async function pesquisarPreco({ aoVivo = false } = {}) {
  const termo = $('pTermo').value.trim();
  if (!termo) return;
  salvarUrl();
  $('aviso').style.display = 'none';
  const uf = $('pUf').value;
  const guardado = !aoVivo && emCache(termo, uf);
  if (guardado) {
    precos = guardado.rows; renderPreco();
    $('pStatus').textContent = `Do cache de ${fmtData(cache.geradoEm)} (${guardado.atas} atas). "Atualizar ao vivo" consulta o PNCP agora.`;
    return;
  }
  precos = []; renderPreco();
  $('pBtn').disabled = true; $('pLive').disabled = true;
  $('pStatus').textContent = 'Buscando atas…';
  try {
    const r = await buscarPrecos(termo, {
      uf,
      onRow: (x) => { precos = [...precos, x]; renderPreco(); },
      onProgresso: (feitas, total) => { $('pStatus').textContent = `Consultando atas… ${feitas} de ${total}`; },
    });
    precos = r.rows; renderPreco();
    $('pStatus').textContent = `${r.atas} atas consultadas${r.falhas ? `, ${r.falhas} falharam` : ''}.`
      + (precos.length ? '' : ' Nenhum item homologado com todas as palavras; tente menos palavras.');
  } catch (err) {
    $('pStatus').textContent = '';
    $('aviso').textContent = 'Falha na consulta: ' + err.message; $('aviso').style.display = 'block';
  } finally {
    $('pBtn').disabled = false; $('pLive').disabled = false;
  }
}

function renderLote() {
  const tb = $('lTb'); tb.replaceChildren();
  for (const x of lote) {
    const tr = document.createElement('tr');
    tr.append(td(x.item, 'obj'), td(x.unidade), td(x.n || '—', 'num'), td(x.n ? fmtUnit(x.min) : '—', 'num'),
      td(x.n ? fmtUnit(x.mediana) : '—', 'num'), td(x.n ? fmtUnit(x.max) : '—', 'num'), td(x.fornecedor ? `${x.fornecedor} — ${x.orgao}` : x.obs));
    tb.append(tr);
  }
  $('lCsv').disabled = !lote.length;
}

async function pesquisarLote() {
  const termos = [...new Set($('lTexto').value.split('\n').map((s) => s.trim()).filter(Boolean))].slice(0, MAX_LOTE);
  if (!termos.length) return;
  const uf = $('pUf').value;
  lote = []; renderLote();
  $('lBtn').disabled = true;
  for (const [i, termo] of termos.entries()) {
    $('lStatus').textContent = `Item ${i + 1} de ${termos.length}: ${termo}…`;
    try {
      const guardado = emCache(termo, uf);
      const rows = guardado ? guardado.rows : (await buscarPrecos(termo, { uf })).rows;
      const grupos = resumoPorUnidade(rows);
      lote = [...lote, ...(grupos.length
        ? grupos.map((g) => ({ item: termo, unidade: g.unidade, n: g.n, min: g.min, mediana: g.mediana, max: g.max, fornecedor: g.menor.fornecedor, orgao: g.menor.orgao }))
        : [{ item: termo, unidade: '—', n: 0, obs: 'Sem preço homologado encontrado' }])];
    } catch (e) {
      lote = [...lote, { item: termo, unidade: '—', n: 0, obs: 'Falhou: ' + e.message }];
    }
    renderLote();
  }
  $('lStatus').textContent = `${termos.length} itens pesquisados. "Fornecedor — órgão" é o do menor preço de cada unidade.`;
  $('lBtn').disabled = false;
}

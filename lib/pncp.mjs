// Código compartilhado entre o site (navegador) e as Actions (Node 20): acesso à API do PNCP e cálculo de preços.
export const SEARCH = 'https://pncp.gov.br/api/search/';
export const PNCP = 'https://pncp.gov.br/api/pncp/v1';

const ATAS_POR_BUSCA = 15;
const ITENS_POR_ATA = 50;
const MAX_ITENS_POR_ATA = 5;
const PARALELO = 3;

export const config = { esperaMs: 600 }; // as Actions aumentam: o PNCP derruba conexões em rajadas

// A API do PNCP derruba conexões com frequência; a nova tentativa costuma passar.
export async function getJson(url, tentativas = 4) {
  let erro;
  for (let i = 0; i < tentativas; i++) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(20000) });
      if (r.status === 204) return null;
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return await r.json();
    } catch (e) {
      erro = e;
      await new Promise((ok) => setTimeout(ok, config.esperaMs * (i + 1)));
    }
  }
  throw erro;
}

// Converte um item da busca do PNCP (/api/search) no formato de linha usado pelo site e pelo cache.
export const normalizaBusca = (i) => ({
  id: i.numero_controle_pncp, orgao: i.orgao_nome, cnpj: i.orgao_cnpj, esfera: i.esfera_id,
  uf: i.uf, municipio: i.municipio_nome, unidade: i.unidade_nome, modalidade: i.modalidade_licitacao_nome,
  objeto: i.description, valorEstimado: i.valor_global, valorHomologado: null, situacao: i.situacao_nome,
  publicacao: i.data_publicacao_pncp, abertura: i.data_inicio_vigencia, encerramento: i.data_fim_vigencia,
  linkOrigem: null, linkPncp: 'https://pncp.gov.br/app/editais' + i.item_url.replace(/^\/compras/, ''),
  ano: i.ano, seq: i.numero_sequencial,
});

export const norm = (t) => t.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
export const casa = (descricao, palavras) => { const d = norm(descricao || ''); return palavras.every((w) => d.includes(w)); };

export function resumo(valores) {
  const s = [...valores].sort((a, b) => a - b);
  const m = s.length >> 1;
  return { n: s.length, min: s[0], max: s[s.length - 1], mediana: s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2, media: s.reduce((a, b) => a + b, 0) / s.length };
}

// Unidades diferentes (comprimido, frasco, ampola…) não se comparam: um resumo por unidade, com o menor preço.
export function resumoPorUnidade(rows) {
  const grupos = new Map();
  for (const r of rows) {
    const k = norm((r.unidade || 'sem unidade').trim());
    grupos.set(k, [...(grupos.get(k) || []), r]);
  }
  return [...grupos.values()].map((g) => ({
    unidade: g[0].unidade || 'sem unidade',
    ...resumo(g.map((r) => r.valorUnitario)),
    menor: g.reduce((a, b) => (b.valorUnitario < a.valorUnitario ? b : a)),
  })).sort((a, b) => b.n - a.n);
}

async function emLotes(lista, n, fn) {
  let i = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (i < lista.length) await fn(lista[i++]); }));
}

// ata -> itens da compra -> resultados (valor unitário homologado)
async function precosDaAta(a, palavras, juntar) {
  const [, , cnpj, ano, seq] = a.item_url.split('/');
  const base = `${PNCP}/orgaos/${cnpj}/compras/${ano}/${seq}`;
  const itens = (await getJson(`${base}/itens?pagina=1&tamanhoPagina=${ITENS_POR_ATA}`)) || [];
  const alvo = itens.filter((i) => i.temResultado && casa(i.descricao, palavras)).slice(0, MAX_ITENS_POR_ATA);
  for (const i of alvo) {
    const res = (await getJson(`${base}/itens/${i.numeroItem}/resultados`)) || [];
    res.filter((r) => !r.dataCancelamento && r.valorUnitarioHomologado > 0).forEach((r) => juntar({
      item: i.descricao, unidade: i.unidadeMedida, valorUnitario: r.valorUnitarioHomologado, quantidade: r.quantidadeHomologada,
      fornecedor: r.nomeRazaoSocialFornecedor, orgao: a.orgao_nome, uf: a.uf, municipio: a.municipio_nome,
      data: r.dataResultado, link: `https://pncp.gov.br/app/editais/${cnpj}/${ano}/${seq}`,
    }));
  }
}

// Preços homologados de um item nas atas de registro de preços mais recentes.
export async function buscarPrecos(termo, { uf = '', onRow = () => {}, onProgresso = () => {}, paralelo = PARALELO } = {}) {
  const palavras = norm(termo).split(/\s+/).filter(Boolean);
  const p = new URLSearchParams({ q: termo, tipos_documento: 'ata', ordenacao: '-data', pagina: 1, tam_pagina: ATAS_POR_BUSCA });
  if (uf) p.set('ufs', uf);
  // Várias atas podem vir da mesma compra; consultar a compra uma vez só.
  const compras = new Set();
  const atas = (((await getJson(`${SEARCH}?${p}`)) || {}).items || []).filter((a) => {
    const compra = a.item_url.split('/').slice(2, 5).join('/');
    if (a.cancelado || compras.has(compra)) return false;
    compras.add(compra); return true;
  });
  const rows = [];
  let feitas = 0; let falhas = 0;
  await emLotes(atas, paralelo, async (a) => {
    try { await precosDaAta(a, palavras, (r) => { rows.push(r); onRow(r); }); } catch { falhas++; }
    onProgresso(++feitas, atas.length);
  });
  rows.sort((a, b) => (b.data || '').localeCompare(a.data || ''));
  return { rows, atas: atas.length, falhas };
}

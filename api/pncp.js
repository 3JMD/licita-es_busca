// Vercel Serverless Function: proxy para a API de consulta do PNCP.
// Motivos do proxy: evitar CORS no navegador, validar parâmetros,
// consultar todas as modalidades em paralelo e enxugar o payload.

const BASE = 'https://pncp.gov.br/api/consulta/v1/contratacoes';
const MODALIDADES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13];

const reData = /^\d{8}$/;          // AAAAMMDD
const reUF = /^[A-Z]{2}$/;

function bad(res, msg) {
  res.status(400).json({ erro: msg });
}

async function fetchPncp(endpoint, params) {
  const url = `${BASE}/${endpoint}?${new URLSearchParams(params)}`;
  const r = await fetch(url, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(25000),
  });
  if (r.status === 204) return { data: [], totalRegistros: 0, totalPaginas: 0 };
  if (!r.ok) {
    const txt = (await r.text()).slice(0, 300);
    throw new Error(`PNCP respondeu ${r.status}: ${txt}`);
  }
  return r.json();
}

function enxugar(d) {
  const o = d.orgaoEntidade || {};
  const u = d.unidadeOrgao || {};
  return {
    id: d.numeroControlePNCP,
    orgao: o.razaoSocial,
    cnpj: o.cnpj,
    esfera: o.esferaId, // F, E, M, D (distrital), N (não se aplica)
    uf: u.ufSigla,
    municipio: u.municipioNome,
    unidade: u.nomeUnidade,
    modalidade: d.modalidadeNome,
    objeto: d.objetoCompra,
    valorEstimado: d.valorTotalEstimado,
    valorHomologado: d.valorTotalHomologado,
    situacao: d.situacaoCompraNome,
    publicacao: d.dataPublicacaoPncp,
    abertura: d.dataAberturaProposta,
    encerramento: d.dataEncerramentoProposta,
    linkOrigem: d.linkSistemaOrigem,
    linkPncp:
      o.cnpj && d.anoCompra && d.sequencialCompra
        ? `https://pncp.gov.br/app/editais/${o.cnpj}/${d.anoCompra}/${d.sequencialCompra}`
        : null,
  };
}

export default async function handler(req, res) {
  const q = req.query || {};
  const tipo = q.tipo || 'abertas';
  const dataInicial = q.dataInicial || '';
  const dataFinal = q.dataFinal || '';
  const uf = (q.uf || '').toUpperCase();
  const modalidade = q.modalidade ? Number(q.modalidade) : null;
  const pagina = Math.max(1, parseInt(q.pagina || '1', 10) || 1);
  const tamanhoPagina = Math.min(50, Math.max(10, parseInt(q.tamanhoPagina || '20', 10) || 20));

  if (!['abertas', 'publicadas'].includes(tipo)) return bad(res, 'tipo deve ser "abertas" ou "publicadas"');
  if (!reData.test(dataFinal)) return bad(res, 'dataFinal obrigatória no formato AAAAMMDD');
  if (tipo === 'publicadas' && !reData.test(dataInicial)) return bad(res, 'dataInicial obrigatória no formato AAAAMMDD');
  if (tipo === 'publicadas' && dataInicial > dataFinal) return bad(res, 'dataInicial maior que dataFinal');
  if (uf && !reUF.test(uf)) return bad(res, 'UF inválida');
  if (modalidade !== null && !MODALIDADES.includes(modalidade)) return bad(res, 'modalidade inválida');

  const base = { pagina, tamanhoPagina };
  if (uf) base.uf = uf;

  try {
    let data = [];
    let totalRegistros = 0;
    let totalPaginas = 0;
    const avisos = [];

    if (tipo === 'abertas') {
      // /proposta: contratações com recebimento de propostas em aberto,
      // encerrando até dataFinal. Modalidade é opcional neste endpoint.
      const params = { ...base, dataFinal };
      if (modalidade) params.codigoModalidadeContratacao = modalidade;
      const j = await fetchPncp('proposta', params);
      data = j.data || [];
      totalRegistros = j.totalRegistros || 0;
      totalPaginas = j.totalPaginas || 0;
    } else {
      // /publicacao: publicadas no período. Modalidade é OBRIGATÓRIA neste endpoint,
      // então sem modalidade consultamos todas em paralelo (página N de cada uma).
      const mods = modalidade ? [modalidade] : MODALIDADES;
      const results = await Promise.allSettled(
        mods.map((m) =>
          fetchPncp('publicacao', { ...base, dataInicial, dataFinal, codigoModalidadeContratacao: m })
        )
      );
      results.forEach((r, i) => {
        if (r.status === 'fulfilled') {
          data.push(...(r.value.data || []));
          totalRegistros += r.value.totalRegistros || 0;
          totalPaginas = Math.max(totalPaginas, r.value.totalPaginas || 0);
        } else {
          avisos.push(`Modalidade ${mods[i]} falhou: ${r.reason.message}`);
        }
      });
      if (avisos.length === mods.length) throw new Error(avisos[0]);
    }

    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
    res.status(200).json({
      tipo,
      pagina,
      totalRegistros,
      totalPaginas,
      avisos,
      data: data.map(enxugar),
    });
  } catch (e) {
    res.status(502).json({ erro: e.message || 'Falha ao consultar o PNCP' });
  }
}

// Converte um item da busca do PNCP (/api/search) no formato de linha usado pelo site e pelo cache.
export const normalizaBusca = (i) => ({
  id: i.numero_controle_pncp, orgao: i.orgao_nome, cnpj: i.orgao_cnpj, esfera: i.esfera_id,
  uf: i.uf, municipio: i.municipio_nome, unidade: i.unidade_nome, modalidade: i.modalidade_licitacao_nome,
  objeto: i.description, valorEstimado: i.valor_global, valorHomologado: null, situacao: i.situacao_nome,
  publicacao: i.data_publicacao_pncp, abertura: i.data_inicio_vigencia, encerramento: i.data_fim_vigencia,
  linkOrigem: null, linkPncp: 'https://pncp.gov.br/app/editais' + i.item_url.replace(/^\/compras/, ''),
  ano: i.ano, seq: i.numero_sequencial,
});

import assert from 'node:assert/strict';
import { novos, linha, secao, diasParaEncerrar } from './alertas.mjs';
import { normalizaBusca, norm, casa, resumo, resumoPorUnidade } from '../lib/pncp.mjs';

const agora = Date.parse('2026-10-16T12:00:00');
const item = (data, extra = {}) => ({ data_publicacao_pncp: data, item_url: '/compras/123/2026/9', orgao_nome: 'ORG', municipio_nome: 'Rio', uf: 'RJ', modalidade_licitacao_nome: 'Pregão', description: ' a\n b ', data_fim_vigencia: '2026-11-30T09:00', ...extra });

// alertas
assert.equal(novos([item('2026-10-16T07:00:00'), item('2026-10-10T07:00:00')], agora).length, 1);
assert.match(linha(item('x'), agora), /\(https:\/\/pncp\.gov\.br\/app\/editais\/123\/2026\/9\)/);
assert.match(linha(item('x'), agora), /\n {2}a b$/);
assert.doesNotMatch(linha(item('x'), agora), /encerra em/);
assert.match(linha(item('x', { data_fim_vigencia: '2026-10-18T12:00' }), agora), /⚠️ \*\*encerra em 2 d\*\*/);
assert.equal(diasParaEncerrar(item('x', { data_fim_vigencia: '2026-10-01T00:00' }), agora), null);
const s = secao({ termo: 'oxigênio', ufs: 'RJ' }, [item('x', { uf: 'SP' }), item('x', { data_fim_vigencia: '2026-12-01T00:00' }), item('x', { data_fim_vigencia: '2026-11-01T00:00' })], agora);
assert.match(s, /^## oxigênio \(RJ\) — 3\n\n### RJ \(2\)[\s\S]*### SP \(1\)/);
assert.ok(s.indexOf('2026-11-01') < s.indexOf('2026-12-01'), 'prazo mais curto primeiro');

// lib
const n = normalizaBusca({ ...item('x'), numero_controle_pncp: 'ID', ano: '2026', numero_sequencial: '9' });
assert.deepEqual([n.id, n.objeto, n.linkPncp, n.ano, n.seq], ['ID', ' a\n b ', 'https://pncp.gov.br/app/editais/123/2026/9', '2026', '9']);
assert.equal(norm('Dipirona SÓDICA'), 'dipirona sodica');
assert.ok(casa('DIPIRONA SÓDICA 500mg', ['dipirona', 'sodica']));
assert.ok(!casa('Soro', ['dipirona']));
assert.deepEqual(resumo([3, 1, 2, 10]), { n: 4, min: 1, max: 10, mediana: 2.5, media: 4 });
const grupos = resumoPorUnidade([
  { unidade: 'Comprimido', valorUnitario: 0.2, fornecedor: 'A' }, { unidade: 'COMPRIMIDO', valorUnitario: 0.1, fornecedor: 'B' },
  { unidade: 'Frasco', valorUnitario: 9, fornecedor: 'C' },
]);
assert.equal(grupos.length, 2);
assert.deepEqual([grupos[0].n, grupos[0].menor.fornecedor, grupos[1].unidade], [2, 'B', 'Frasco']);
console.log('ok');

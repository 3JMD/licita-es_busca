import assert from 'node:assert/strict';
import { novos, linha } from './alertas.mjs';

const agora = Date.parse('2026-10-16T12:00:00');
const item = (data) => ({ data_publicacao_pncp: data, item_url: '/compras/123/2026/9', orgao_nome: 'ORG', municipio_nome: 'Rio', uf: 'RJ', modalidade_licitacao_nome: 'Pregão', description: ' a\n b ' });
assert.equal(novos([item('2026-10-16T07:00:00'), item('2026-10-10T07:00:00')], agora).length, 1);
assert.match(linha(item('2026-10-16T07:00:00')), /\(https:\/\/pncp\.gov\.br\/app\/editais\/123\/2026\/9\)/);
assert.match(linha(item('x')), /\n {2}a b$/);
console.log('ok');

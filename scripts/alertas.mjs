// Consulta a busca do PNCP para cada termo de alerts.json e abre uma Issue com os editais
// publicados nas últimas HORAS horas (o GitHub avisa por e-mail); a Issue anterior é fechada.
// Também grava data/destaques.json (todos os abertos dos termos), que o site usa como cache.
// DRY_RUN=1 não abre nem fecha Issues.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { SEARCH, getJson, normalizaBusca, config } from '../lib/pncp.mjs';

const HORAS = 25; // cron diário + folga
const DIAS_URGENTE = 5;
const PAUSA_MS = 3000; // o PNCP derruba conexões em rajadas
const LABEL = 'alerta-licitacoes';

const dormir = (ms) => new Promise((ok) => setTimeout(ok, ms));

export function novos(items, agora = Date.now()) {
  const corte = agora - HORAS * 3600e3;
  return items.filter((i) => Date.parse(i.data_publicacao_pncp) >= corte);
}

export function diasParaEncerrar(i, agora = Date.now()) {
  const ms = Date.parse(i.data_fim_vigencia) - agora;
  return Number.isNaN(ms) || ms <= 0 ? null : ms / 86400e3;
}

export function linha(i, agora = Date.now()) {
  const url = 'https://pncp.gov.br/app/editais' + i.item_url.replace(/^\/compras/, '');
  const obj = (i.description || '').replace(/\s+/g, ' ').trim();
  const d = diasParaEncerrar(i, agora);
  const alerta = d !== null && d < DIAS_URGENTE ? `⚠️ **encerra em ${d < 1 ? 'menos de 1 dia' : Math.floor(d) + ' d'}** · ` : '';
  const fim = i.data_fim_vigencia ? `propostas até ${i.data_fim_vigencia.replace('T', ' ')}` : 'sem prazo informado';
  return `- [${i.orgao_nome} (${i.municipio_nome}/${i.uf})](${url}) · ${i.modalidade_licitacao_nome} · ${alerta}${fim}\n  ${obj}`;
}

const porPrazo = (a, b) => (a.data_fim_vigencia || '9').localeCompare(b.data_fim_vigencia || '9');

// Seção de um termo: editais agrupados por UF, os de prazo mais curto primeiro.
export function secao(a, itens, agora = Date.now()) {
  const porUf = new Map();
  for (const i of itens) porUf.set(i.uf, [...(porUf.get(i.uf) || []), i]);
  const blocos = [...porUf.entries()].sort(([x], [y]) => String(x).localeCompare(String(y)))
    .map(([uf, lst]) => `### ${uf} (${lst.length})\n\n${[...lst].sort(porPrazo).map((i) => linha(i, agora)).join('\n')}`);
  return `## ${a.termo}${a.ufs ? ` (${a.ufs})` : ''} — ${itens.length}\n\n${blocos.join('\n\n')}`;
}

// Termo cuja consulta falhou mantém as linhas do cache anterior (o PNCP oscila).
function gravarCache(rows, termos, termosComFalha) {
  const arquivo = new URL('../data/destaques.json', import.meta.url);
  let antigas = [];
  try { antigas = JSON.parse(readFileSync(arquivo, 'utf8')).rows.filter((r) => termosComFalha.has(r.termo)); } catch { /* sem cache anterior */ }
  const ids = new Set(rows.map((r) => r.id));
  const ordenadas = [...rows, ...antigas.filter((r) => !ids.has(r.id))]
    .sort((a, b) => (b.publicacao || '').localeCompare(a.publicacao || ''));
  mkdirSync(new URL('../data/', import.meta.url), { recursive: true });
  writeFileSync(arquivo, JSON.stringify({ geradoEm: new Date().toISOString(), termos, rows: ordenadas }));
}

function abrirIssue(titulo, corpo) {
  execFileSync('gh', ['label', 'create', LABEL, '--color', '0E8A16', '--force'], { stdio: 'ignore' });
  const url = execFileSync('gh', ['issue', 'create', '--title', titulo, '--body', corpo, '--label', LABEL], { encoding: 'utf8' }).trim();
  const nova = url.match(/\/issues\/(\d+)/)?.[1];
  console.log(url);
  const abertas = JSON.parse(execFileSync('gh', ['issue', 'list', '--label', LABEL, '--state', 'open', '--json', 'number'], { encoding: 'utf8' }));
  for (const { number } of abertas) {
    if (String(number) !== nova) execFileSync('gh', ['issue', 'close', String(number), '--comment', `Substituída por #${nova}.`], { stdio: 'inherit' });
  }
}

async function main() {
  config.esperaMs = 2000;
  const alertas = JSON.parse(readFileSync(new URL('../alerts.json', import.meta.url), 'utf8'));
  const secoes = [];
  const falhas = [];
  const vistos = new Set();
  const cache = new Map();
  const termosComFalha = new Set();
  const urgentes = new Map();
  for (const a of alertas) {
    const p = new URLSearchParams({
      q: a.termo, tipos_documento: 'edital', status: 'recebendo_proposta', ordenacao: '-data', pagina: 1, tam_pagina: 50,
    });
    if (a.ufs) p.set('ufs', a.ufs);
    try {
      const todos = ((await getJson(`${SEARCH}?${p}`, 5)) || {}).items || [];
      todos.forEach((i) => { if (!cache.has(i.id)) cache.set(i.id, { ...normalizaBusca(i), termo: a.termo }); });
      const itens = novos(todos).filter((i) => !vistos.has(i.id));
      itens.forEach((i) => {
        vistos.add(i.id);
        const d = diasParaEncerrar(i);
        if (d !== null && d < DIAS_URGENTE) urgentes.set(i.id, i);
      });
      if (itens.length) secoes.push(secao(a, itens));
    } catch (e) {
      falhas.push(`${a.termo}: ${e.message}`);
      termosComFalha.add(a.termo);
    }
    await dormir(PAUSA_MS);
  }
  if (cache.size || !alertas.length) gravarCache([...cache.values()], alertas, termosComFalha);
  if (urgentes.size) secoes.unshift(`## ⚠️ Encerram em menos de ${DIAS_URGENTE} dias — ${urgentes.size}\n\n${[...urgentes.values()].sort(porPrazo).map((i) => linha(i)).join('\n')}`);
  if (falhas.length) secoes.push(`## Falhas na consulta\n\n${falhas.map((f) => `- ${f}`).join('\n')}`);
  if (alertas.length && falhas.length === alertas.length) { console.error('Todas as consultas falharam.'); process.exitCode = 1; }
  if (!secoes.length) { console.log('Nada novo.'); return; }
  const titulo = `Novas licitações — ${new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`;
  const corpo = secoes.join('\n\n');
  if (process.env.DRY_RUN) { console.log(titulo + '\n\n' + corpo); return; }
  abrirIssue(titulo, corpo);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) await main();

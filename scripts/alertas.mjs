// Consulta a busca do PNCP para cada termo de alerts.json e abre uma Issue com os editais
// publicados nas últimas HORAS horas (o GitHub avisa por e-mail). DRY_RUN=1 não abre a Issue.
// Também grava data/destaques.json (todos os abertos dos termos), que o site usa como cache.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { normalizaBusca } from '../normaliza.mjs';

const SEARCH = 'https://pncp.gov.br/api/search/';
const HORAS = 25; // cron diário + folga
const PAUSA_MS = 3000; // o PNCP derruba conexões em rajadas

const dormir = (ms) => new Promise((ok) => setTimeout(ok, ms));

async function getJson(url, tentativas = 5) {
  let erro;
  for (let i = 0; i < tentativas; i++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': 'licita-es_busca-alertas' }, signal: AbortSignal.timeout(20000) });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return await r.json();
    } catch (e) {
      erro = e;
      await dormir(2000 * (i + 1));
    }
  }
  throw erro;
}

export function novos(items, agora = Date.now()) {
  const corte = agora - HORAS * 3600e3;
  return items.filter((i) => Date.parse(i.data_publicacao_pncp) >= corte);
}

export function linha(i) {
  const url = 'https://pncp.gov.br/app/editais' + i.item_url.replace(/^\/compras/, '');
  const obj = (i.description || '').replace(/\s+/g, ' ').trim();
  const fim = i.data_fim_vigencia ? ` · propostas até ${i.data_fim_vigencia.replace('T', ' ')}` : '';
  return `- [${i.orgao_nome} (${i.municipio_nome}/${i.uf})](${url}) · ${i.modalidade_licitacao_nome}${fim}\n  ${obj}`;
}

// Termo cuja consulta falhou mantém as linhas do cache anterior (o PNCP oscila).
function gravarCache(rows, termos, termosComFalha) {
  const arquivo = new URL('../data/destaques.json', import.meta.url);
  let antigas = [];
  try { antigas = JSON.parse(readFileSync(arquivo, 'utf8')).rows.filter((r) => termosComFalha.has(r.termo)); } catch { /* sem cache anterior */ }
  const ids = new Set(rows.map((r) => r.id));
  const ordenadas = [...rows, ...antigas.filter((r) => !ids.has(r.id))].sort((a, b) => (b.publicacao || '').localeCompare(a.publicacao || ''));
  mkdirSync(new URL('../data/', import.meta.url), { recursive: true });
  writeFileSync(arquivo, JSON.stringify({ geradoEm: new Date().toISOString(), termos, rows: ordenadas }));
}

async function main() {
  const alertas = JSON.parse(readFileSync(new URL('../alerts.json', import.meta.url), 'utf8'));
  const secoes = [];
  const falhas = [];
  const vistos = new Set();
  const cache = new Map();
  const termosComFalha = new Set();
  for (const a of alertas) {
    const p = new URLSearchParams({
      q: a.termo, tipos_documento: 'edital', status: 'recebendo_proposta', ordenacao: '-data', pagina: 1, tam_pagina: 50,
    });
    if (a.ufs) p.set('ufs', a.ufs);
    try {
      const todos = (await getJson(SEARCH + '?' + p)).items || [];
      todos.forEach((i) => { if (!cache.has(i.id)) cache.set(i.id, { ...normalizaBusca(i), termo: a.termo }); });
      const itens = novos(todos).filter((i) => !vistos.has(i.id));
      itens.forEach((i) => vistos.add(i.id));
      if (itens.length) secoes.push(`## ${a.termo}${a.ufs ? ` (${a.ufs})` : ''} — ${itens.length}\n\n${itens.map(linha).join('\n')}`);
    } catch (e) {
      falhas.push(`${a.termo}: ${e.message}`);
      termosComFalha.add(a.termo);
    }
    await dormir(PAUSA_MS);
  }
  if (cache.size) gravarCache([...cache.values()], alertas, termosComFalha);
  if (falhas.length) secoes.push(`## Falhas na consulta\n\n${falhas.map((f) => `- ${f}`).join('\n')}`);
  if (!secoes.length) { console.log('Nada novo.'); return; }
  const titulo = `Novas licitações — ${new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`;
  const corpo = secoes.join('\n\n');
  if (process.env.DRY_RUN) { console.log(titulo + '\n\n' + corpo); return; }
  execFileSync('gh', ['issue', 'create', '--title', titulo, '--body', corpo], { stdio: 'inherit' });
  if (falhas.length === alertas.length) process.exitCode = 1;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) await main();

// Gera data/precos.json: preços homologados dos itens de itens.json (mesma busca da aba "Preço de referência").
// Item cuja consulta falhar ou vier vazia mantém as linhas do cache anterior (o PNCP oscila).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { buscarPrecos, config } from '../lib/pncp.mjs';

const MAX_ITENS = 10;
const PAUSA_MS = 3000;
const ARQUIVO = new URL('../data/precos.json', import.meta.url);

const dormir = (ms) => new Promise((ok) => setTimeout(ok, ms));
const chave = (i) => `${i.termo.toLowerCase()}|${i.uf || ''}`;

config.esperaMs = 2000;
const itens = JSON.parse(readFileSync(new URL('../itens.json', import.meta.url), 'utf8')).slice(0, MAX_ITENS);
let antigos = [];
try { antigos = JSON.parse(readFileSync(ARQUIVO, 'utf8')).itens; } catch { /* primeiro uso */ }
const porChave = new Map(antigos.map((i) => [chave(i), i]));

const resultado = [];
let falhas = 0;
for (const item of itens) {
  const uf = item.uf || '';
  try {
    const r = await buscarPrecos(item.termo, { uf });
    if (r.rows.length) { resultado.push({ termo: item.termo, uf, atas: r.atas, rows: r.rows }); } else { throw new Error('sem preços'); }
  } catch (e) {
    falhas++;
    console.error(`${item.termo}: ${e.message}`);
    const antigo = porChave.get(chave({ termo: item.termo, uf }));
    if (antigo) resultado.push(antigo);
  }
  await dormir(PAUSA_MS);
}

mkdirSync(new URL('../data/', import.meta.url), { recursive: true });
writeFileSync(ARQUIVO, JSON.stringify({ geradoEm: new Date().toISOString(), itens: resultado }));
console.log(`${resultado.length} itens gravados, ${falhas} sem consulta nova.`);

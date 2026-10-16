// Utilidades de DOM e formatação do site.
export const UFS = 'AC AL AM AP BA CE DF ES GO MA MG MS MT PA PB PE PI PR RJ RN RO RR RS SC SE SP TO'.split(' ');
export const $ = (id) => document.getElementById(id);

export const fmtData = (s) => s ? new Date(s).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—';
export const fmtValor = (v) => (v === null || v === undefined || v === 0) ? '—'
  : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
export const fmtUnit = (v) => v == null ? '—' : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 4 });

export function td(text, cls) { const c = document.createElement('td'); if (cls) c.className = cls; c.textContent = text ?? '—'; return c; }
export const urlSegura = (u) => typeof u === 'string' && /^https?:\/\//i.test(u);
export function link(href, txt) { const a = document.createElement('a'); a.href = href; a.textContent = txt; a.target = '_blank'; a.rel = 'noopener noreferrer'; return a; }

export function baixarCsv(nome, cols, rows) {
  const esc = (v) => { const s = v === null || v === undefined ? '' : String(v).replace(/\r?\n/g, ' '); return /[;"]/.test(s) ? '"' + s.replaceAll('"', '""') + '"' : s; };
  const linhas = [cols.join(';'), ...rows.map((r) => cols.map((c) => esc(r[c])).join(';'))];
  const blob = new Blob(['﻿' + linhas.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
  a.download = nome; a.click(); URL.revokeObjectURL(a.href);
}

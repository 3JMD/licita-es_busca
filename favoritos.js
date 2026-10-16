// Favoritos ficam só no navegador (localStorage); falha de storage não pode quebrar a página.
const CHAVE = 'pncp.favoritos';
export const STATUS_FAVORITO = ['acompanhar', 'participar', 'descartar'];

export function lerFavoritos() {
  try {
    const f = JSON.parse(localStorage.getItem(CHAVE));
    if (f && typeof f === 'object' && !Array.isArray(f)) return f;
  } catch { /* storage indisponível ou JSON inválido */ }
  return {};
}

function gravar(f) {
  try { localStorage.setItem(CHAVE, JSON.stringify(f)); return true; } catch { return false; }
}

export function alternarFavorito(row) {
  const f = lerFavoritos();
  if (f[row.id]) return gravar(Object.fromEntries(Object.entries(f).filter(([id]) => id !== row.id)));
  const { nova, ...snapshot } = row;
  return gravar({ ...f, [row.id]: { status: 'acompanhar', nota: '', row: snapshot } });
}

export function atualizarFavorito(id, campos) {
  const f = lerFavoritos();
  return f[id] ? gravar({ ...f, [id]: { ...f[id], ...campos } }) : false;
}

// Cliente HTTP único: injeta o token e transforma erro da API em Error com a mensagem do backend.
const TOKEN_KEY = 'g9_token';
const USER_KEY = 'g9_usuario';

export function getSessao() {
  const token = sessionStorage.getItem(TOKEN_KEY);
  const usuario = sessionStorage.getItem(USER_KEY);
  return token ? { token, usuario: usuario ? JSON.parse(usuario) : null } : null;
}

export function salvarSessao(dados) {
  sessionStorage.setItem(TOKEN_KEY, dados.token);
  sessionStorage.setItem(USER_KEY, JSON.stringify({ nome: dados.nome, login: dados.login, perfil: dados.perfil }));
}

export function limparSessao() {
  sessionStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(USER_KEY);
}

export async function api(caminho, { method = 'GET', body } = {}) {
  const sessao = getSessao();
  const headers = { 'Content-Type': 'application/json' };
  if (sessao) headers.Authorization = `Bearer ${sessao.token}`;

  const resp = await fetch(`/api${caminho}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (resp.status === 401 && caminho !== '/auth/login') {
    limparSessao();
    window.dispatchEvent(new Event('g9-logout'));
  }
  if (resp.status === 204) return null;

  const dados = await resp.json().catch(() => null);
  if (!resp.ok) throw new Error(dados?.erro || `Erro ${resp.status}`);
  return dados;
}

// "2026-11-06T10:00:00" ou com fuso -> "06/11/2026 10:00"
export function formatarData(valor) {
  if (!valor) return '-';
  return new Date(valor).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

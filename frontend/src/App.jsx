import { useEffect, useState } from 'react';
import { api, getSessao, limparSessao } from './api.js';
import Login from './pages/Login.jsx';
import Painel from './pages/Painel.jsx';
import Salas from './pages/Salas.jsx';
import Reservas from './pages/Reservas.jsx';
import Auditoria from './pages/Auditoria.jsx';

const ABAS = [
  { id: 'painel', titulo: 'Painel', componente: Painel },
  { id: 'reservas', titulo: 'Reservas', componente: Reservas },
  { id: 'salas', titulo: 'Salas e recursos', componente: Salas },
  { id: 'auditoria', titulo: 'Auditoria', componente: Auditoria },
];

export default function App() {
  const [sessao, setSessao] = useState(getSessao());
  const [aba, setAba] = useState('painel');

  // Se qualquer chamada voltar 401, volta para o login
  useEffect(() => {
    const sair = () => setSessao(null);
    window.addEventListener('g9-logout', sair);
    return () => window.removeEventListener('g9-logout', sair);
  }, []);

  async function logout() {
    try { await api('/auth/logout', { method: 'POST' }); } catch { /* ignora */ }
    limparSessao();
    setSessao(null);
  }

  if (!sessao) return <Login onLogin={() => setSessao(getSessao())} />;

  const Atual = ABAS.find((a) => a.id === aba).componente;

  return (
    <div className="layout">
      <header className="topo">
        <div className="marca">
          <span className="logo">G9</span>
          <span>Reserva de Salas</span>
        </div>
        <nav className="abas">
          {ABAS.map((a) => (
            <button key={a.id} className={a.id === aba ? 'ativa' : ''} onClick={() => setAba(a.id)}>
              {a.titulo}
            </button>
          ))}
        </nav>
        <div className="usuario">
          <span>{sessao.usuario?.nome} <small>({sessao.usuario?.perfil})</small></span>
          <button className="secundario" onClick={logout}>Sair</button>
        </div>
      </header>
      <main className="conteudo">
        <Atual />
      </main>
    </div>
  );
}

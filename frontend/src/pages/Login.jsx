import { useState } from 'react';
import { api, salvarSessao } from '../api.js';
import ParticulasFundo from '../components/ParticulasFundo.jsx';

export default function Login({ onLogin }) {
  const [login, setLogin] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState('');
  const [carregando, setCarregando] = useState(false);

  async function entrar(e) {
    e.preventDefault();
    setErro('');
    setCarregando(true);
    try {
      const dados = await api('/auth/login', { method: 'POST', body: { login, senha } });
      salvarSessao(dados);
      onLogin();
    } catch (err) {
      setErro(err.message);
    } finally {
      setCarregando(false);
    }
  }

  return (
    <div className="tela-login">
      <ParticulasFundo />
      <form className="login-vidro" onSubmit={entrar}>
        <span className="logo grande">G9</span>
        <h1>Reserva de Salas</h1>
        <p className="sub">Acesso restrito a operadores</p>

        <label>Login
          <input value={login} onChange={(e) => setLogin(e.target.value)} autoFocus required autoComplete="username" />
        </label>
        <label>Senha
          <input type="password" value={senha} onChange={(e) => setSenha(e.target.value)} required autoComplete="current-password" />
        </label>

        {erro && <div className="alerta erro">{erro}</div>}
        <button type="submit" disabled={carregando}>{carregando ? 'Entrando...' : 'Entrar'}</button>
      </form>
    </div>
  );
}

import { useEffect, useState } from 'react';
import { api, formatarData } from '../api.js';

// Usa as duas VIEWS do banco + o teste de statement_timeout
export default function Painel() {
  const [salas, setSalas] = useState([]);
  const [hoje, setHoje] = useState([]);
  const [erro, setErro] = useState('');
  const [teste, setTeste] = useState({ estado: 'parado', msg: '' });

  async function carregar() {
    setErro('');
    try {
      const [s, h] = await Promise.all([api('/relatorios/salas-agora'), api('/relatorios/reservas-hoje')]);
      setSalas(s);
      setHoje(h);
    } catch (err) {
      setErro(err.message);
    }
  }

  useEffect(() => { carregar(); }, []);

  async function testarTimeout() {
    setTeste({ estado: 'rodando', msg: 'Executando pg_sleep(7) no banco...' });
    const t0 = Date.now();
    try {
      const r = await api('/relatorios/teste-timeout?segundos=7');
      setTeste({ estado: 'ok', msg: r.mensagem });
    } catch (err) {
      const seg = ((Date.now() - t0) / 1000).toFixed(1);
      setTeste({ estado: 'erro', msg: `${err.message} (após ${seg}s)` });
    }
  }

  return (
    <>
      <div className="titulo-pagina">
        <h2>Painel</h2>
        <button className="secundario" onClick={carregar}>Atualizar</button>
      </div>
      {erro && <div className="alerta erro">{erro}</div>}

      <section>
        <h3>Salas agora <small>view reserva.vw_salas_livres_agora</small></h3>
        <div className="grade-salas">
          {salas.map((s) => (
            <div key={s.id} className={`card sala ${s.situacao === 'LIVRE' ? 'livre' : 'ocupada'}`}>
              <div className="sala-topo">
                <strong>{s.nome}</strong>
                <span className={`selo ${s.situacao === 'LIVRE' ? 'verde' : 'vermelho'}`}>{s.situacao}</span>
              </div>
              <div className="detalhe">{s.localizacao} · {s.capacidade} lugares</div>
              {s.situacao === 'OCUPADA' && (
                <div className="detalhe">{s.reuniao_atual} até {formatarData(s.ocupada_ate)}</div>
              )}
            </div>
          ))}
        </div>
      </section>

      <section>
        <h3>Reservas de hoje <small>view reserva.vw_reservas_hoje</small></h3>
        <table>
          <thead>
            <tr><th>Sala</th><th>Título</th><th>Responsável</th><th>Início</th><th>Fim</th></tr>
          </thead>
          <tbody>
            {hoje.length === 0 && <tr><td colSpan="5" className="vazio">Nenhuma reserva hoje</td></tr>}
            {hoje.map((r) => (
              <tr key={r.id}>
                <td>{r.sala}</td><td>{r.titulo}</td><td>{r.responsavel}</td>
                <td>{formatarData(r.inicio)}</td><td>{formatarData(r.fim)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="card demo">
        <h3>Teste de statement_timeout</h3>
        <p>O usuário <code>app_user</code> tem <code>statement_timeout = 5s</code>. Este botão pede ao banco
          uma consulta de 7s; o Postgres deve cancelá-la.</p>
        <button onClick={testarTimeout} disabled={teste.estado === 'rodando'}>Rodar consulta de 7s</button>
        {teste.msg && <div className={`alerta ${teste.estado === 'erro' ? 'erro' : 'info'}`}>{teste.msg}</div>}
      </section>
    </>
  );
}

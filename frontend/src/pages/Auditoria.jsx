import { Fragment, useEffect, useState } from 'react';
import { api, formatarData } from '../api.js';

// Lê audit.log_alteracao (preenchida pelo trigger audit.fn_registrar_auditoria)
export default function Auditoria() {
  const [logs, setLogs] = useState([]);
  const [aberto, setAberto] = useState(null);
  const [erro, setErro] = useState('');

  async function carregar() {
    setErro('');
    try {
      setLogs(await api('/relatorios/auditoria'));
    } catch (err) {
      setErro(err.message);
    }
  }

  useEffect(() => { carregar(); }, []);

  const corOperacao = { INSERT: 'verde', UPDATE: 'amarelo', DELETE: 'vermelho' };

  return (
    <>
      <div className="titulo-pagina">
        <h2>Auditoria <small>audit.log_alteracao</small></h2>
        <button className="secundario" onClick={carregar}>Atualizar</button>
      </div>
      {erro && <div className="alerta erro">{erro}</div>}

      <table>
        <thead>
          <tr><th>#</th><th>Data/hora</th><th>Tabela</th><th>Operação</th><th>Registro</th><th>Usuário do banco</th><th>Operador</th><th></th></tr>
        </thead>
        <tbody>
          {logs.length === 0 && <tr><td colSpan="8" className="vazio">Nenhuma alteração registrada ainda</td></tr>}
          {logs.map((l) => (
            <Fragment key={l.id}>
              <tr>
                <td>{l.id}</td>
                <td>{formatarData(l.data_hora)}</td>
                <td><code>{l.tabela}</code></td>
                <td><span className={`selo ${corOperacao[l.operacao]}`}>{l.operacao}</span></td>
                <td>{l.registro_id}</td>
                <td>{l.usuario_db}</td>
                <td>{l.operador_app || '-'}</td>
                <td>
                  <button className="secundario" onClick={() => setAberto(aberto === l.id ? null : l.id)}>
                    {aberto === l.id ? 'Fechar' : 'Ver dados'}
                  </button>
                </td>
              </tr>
              {aberto === l.id && (
                <tr className="detalhe-log">
                  <td colSpan="8">
                    <div className="json-lado">
                      <div><strong>Antes</strong><pre>{formatarJson(l.dados_antigos)}</pre></div>
                      <div><strong>Depois</strong><pre>{formatarJson(l.dados_novos)}</pre></div>
                    </div>
                  </td>
                </tr>
              )}
            </Fragment>
          ))}
        </tbody>
      </table>
    </>
  );
}

function formatarJson(texto) {
  if (!texto) return '-';
  try { return JSON.stringify(JSON.parse(texto), null, 2); } catch { return texto; }
}

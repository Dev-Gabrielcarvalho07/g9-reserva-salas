import { useEffect, useState } from 'react';
import { api } from '../api.js';

const VAZIO = { nome: '', capacidade: '', localizacao: '', ativa: true };

export default function Salas() {
  const [salas, setSalas] = useState([]);
  const [recursos, setRecursos] = useState([]);
  const [form, setForm] = useState(VAZIO);
  const [editandoId, setEditandoId] = useState(null);
  const [novoRecurso, setNovoRecurso] = useState({ salaId: '', nome: '', descricao: '' });
  const [msg, setMsg] = useState({ tipo: '', texto: '' });

  async function carregar() {
    try {
      const [s, r] = await Promise.all([api('/salas'), api('/recursos')]);
      setSalas(s);
      setRecursos(r);
    } catch (err) {
      setMsg({ tipo: 'erro', texto: err.message });
    }
  }

  useEffect(() => { carregar(); }, []);

  async function salvar(e) {
    e.preventDefault();
    const body = { ...form, capacidade: Number(form.capacidade) };
    try {
      if (editandoId) {
        await api(`/salas/${editandoId}`, { method: 'PUT', body });
        setMsg({ tipo: 'sucesso', texto: 'Sala atualizada' });
      } else {
        await api('/salas', { method: 'POST', body });
        setMsg({ tipo: 'sucesso', texto: 'Sala criada' });
      }
      cancelar();
      carregar();
    } catch (err) {
      setMsg({ tipo: 'erro', texto: err.message });
    }
  }

  function editar(s) {
    setEditandoId(s.id);
    setForm({ nome: s.nome, capacidade: s.capacidade, localizacao: s.localizacao || '', ativa: s.ativa });
  }

  function cancelar() {
    setEditandoId(null);
    setForm(VAZIO);
  }

  async function excluir(s) {
    if (!window.confirm(`Excluir a sala "${s.nome}"?`)) return;
    try {
      await api(`/salas/${s.id}`, { method: 'DELETE' });
      setMsg({ tipo: 'sucesso', texto: 'Sala excluída' });
      carregar();
    } catch (err) {
      setMsg({ tipo: 'erro', texto: err.message });
    }
  }

  async function adicionarRecurso(e) {
    e.preventDefault();
    try {
      await api('/recursos', { method: 'POST', body: { ...novoRecurso, salaId: Number(novoRecurso.salaId) } });
      setNovoRecurso({ salaId: novoRecurso.salaId, nome: '', descricao: '' });
      carregar();
    } catch (err) {
      setMsg({ tipo: 'erro', texto: err.message });
    }
  }

  async function removerRecurso(id) {
    try {
      await api(`/recursos/${id}`, { method: 'DELETE' });
      carregar();
    } catch (err) {
      setMsg({ tipo: 'erro', texto: err.message });
    }
  }

  const recursosDa = (salaId) => recursos.filter((r) => r.salaId === salaId);

  return (
    <>
      <div className="titulo-pagina"><h2>Salas e recursos</h2></div>
      {msg.texto && <div className={`alerta ${msg.tipo}`}>{msg.texto}</div>}

      <form className="card formulario" onSubmit={salvar}>
        <h3>{editandoId ? `Editando sala #${editandoId}` : 'Nova sala'}</h3>
        <div className="linha">
          <label>Nome
            <input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} required />
          </label>
          <label>Capacidade
            <input type="number" min="1" value={form.capacidade}
              onChange={(e) => setForm({ ...form, capacidade: e.target.value })} required />
          </label>
          <label>Localização
            <input value={form.localizacao} onChange={(e) => setForm({ ...form, localizacao: e.target.value })} />
          </label>
          <label className="check">
            <input type="checkbox" checked={form.ativa} onChange={(e) => setForm({ ...form, ativa: e.target.checked })} />
            Ativa
          </label>
        </div>
        <div className="acoes">
          <button type="submit">{editandoId ? 'Salvar alterações' : 'Cadastrar sala'}</button>
          {editandoId && <button type="button" className="secundario" onClick={cancelar}>Cancelar</button>}
        </div>
      </form>

      <table>
        <thead>
          <tr><th>#</th><th>Nome</th><th>Capacidade</th><th>Localização</th><th>Recursos</th><th>Status</th><th></th></tr>
        </thead>
        <tbody>
          {salas.map((s) => (
            <tr key={s.id}>
              <td>{s.id}</td>
              <td>{s.nome}</td>
              <td>{s.capacidade}</td>
              <td>{s.localizacao}</td>
              <td>
                {recursosDa(s.id).map((r) => (
                  <span key={r.id} className="chip" title={r.descricao || ''}>
                    {r.nome}
                    <button className="x" onClick={() => removerRecurso(r.id)} title="Remover">×</button>
                  </span>
                ))}
              </td>
              <td><span className={`selo ${s.ativa ? 'verde' : 'cinza'}`}>{s.ativa ? 'Ativa' : 'Inativa'}</span></td>
              <td className="acoes-linha">
                <button className="secundario" onClick={() => editar(s)}>Editar</button>
                <button className="perigo" onClick={() => excluir(s)}>Excluir</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <form className="card formulario" onSubmit={adicionarRecurso}>
        <h3>Adicionar recurso a uma sala</h3>
        <div className="linha">
          <label>Sala
            <select value={novoRecurso.salaId} onChange={(e) => setNovoRecurso({ ...novoRecurso, salaId: e.target.value })} required>
              <option value="">Selecione...</option>
              {salas.map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}
            </select>
          </label>
          <label>Recurso
            <input placeholder="Projetor, TV, Webcam..." value={novoRecurso.nome}
              onChange={(e) => setNovoRecurso({ ...novoRecurso, nome: e.target.value })} required />
          </label>
          <label>Descrição
            <input value={novoRecurso.descricao} onChange={(e) => setNovoRecurso({ ...novoRecurso, descricao: e.target.value })} />
          </label>
        </div>
        <div className="acoes"><button type="submit">Adicionar</button></div>
      </form>
    </>
  );
}

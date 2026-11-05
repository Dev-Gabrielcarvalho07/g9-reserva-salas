import { useEffect, useState } from 'react';
import { api, formatarData } from '../api.js';
import BotaoConfirmar from '../components/BotaoConfirmar.jsx';

// valor mínimo do datetime-local: agora, no horário local
function agoraLocal() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

const VAZIO = { salaId: '', titulo: '', responsavel: '', inicio: '', fim: '' };

export default function Reservas() {
  const [reservas, setReservas] = useState([]);
  const [salas, setSalas] = useState([]);
  const [form, setForm] = useState(VAZIO);
  const [editandoId, setEditandoId] = useState(null);
  const [disponivel, setDisponivel] = useState(null);
  const [msg, setMsg] = useState({ tipo: '', texto: '' });

  async function carregar() {
    try {
      const [r, s] = await Promise.all([api('/reservas'), api('/salas')]);
      setReservas(r);
      setSalas(s);
    } catch (err) {
      setMsg({ tipo: 'erro', texto: err.message });
    }
  }

  useEffect(() => { carregar(); }, []);

  // Consulta a FUNCTION fn_sala_disponivel sempre que sala/período mudam
  useEffect(() => {
    setDisponivel(null);
    if (!form.salaId || !form.inicio || !form.fim) return;
    const params = { salaId: form.salaId, inicio: form.inicio, fim: form.fim };
    if (editandoId) params.ignorarId = editandoId;   // na edição, a própria reserva não conta
    const q = new URLSearchParams(params);
    api(`/relatorios/disponibilidade?${q}`).then((r) => setDisponivel(r.disponivel)).catch(() => {});
  }, [form.salaId, form.inicio, form.fim, editandoId]);

  const nomeSala = (id) => salas.find((s) => s.id === id)?.nome || `#${id}`;

  async function salvar(e) {
    e.preventDefault();
    const body = { ...form, salaId: Number(form.salaId) };
    try {
      if (editandoId) {
        await api(`/reservas/${editandoId}`, { method: 'PUT', body });
        setMsg({ tipo: 'sucesso', texto: 'Reserva atualizada com sucesso' });
      } else {
        await api('/reservas', { method: 'POST', body });
        setMsg({ tipo: 'sucesso', texto: 'Reserva criada com sucesso' });
      }
      limpar();
      carregar();
    } catch (err) {
      setMsg({ tipo: 'erro', texto: err.message });
    }
  }

  function editar(r) {
    setEditandoId(r.id);
    setForm({
      salaId: String(r.salaId),
      titulo: r.titulo,
      responsavel: r.responsavel,
      inicio: r.inicio.slice(0, 16),
      fim: r.fim.slice(0, 16),
    });
  }

  function limpar() {
    setEditandoId(null);
    setForm(VAZIO);
  }

  async function cancelarReserva(r) {
    try {
      await api(`/reservas/${r.id}/cancelar`, { method: 'PATCH' });
      setMsg({ tipo: 'sucesso', texto: `Reserva #${r.id} cancelada` });
      carregar();
    } catch (err) {
      setMsg({ tipo: 'erro', texto: err.message });
    }
  }

  async function excluir(r) {
    try {
      await api(`/reservas/${r.id}`, { method: 'DELETE' });
      setMsg({ tipo: 'sucesso', texto: 'Reserva excluída' });
      carregar();
    } catch (err) {
      setMsg({ tipo: 'erro', texto: err.message });
    }
  }

  return (
    <>
      <div className="titulo-pagina"><h2>Reservas</h2></div>
      {msg.texto && <div className={`alerta ${msg.tipo}`}>{msg.texto}</div>}

      <form className="card formulario" onSubmit={salvar}>
        <h3>{editandoId ? `Editando reserva #${editandoId}` : 'Nova reserva'}</h3>
        <div className="linha">
          <label>Sala
            <select value={form.salaId} onChange={(e) => setForm({ ...form, salaId: e.target.value })} required>
              <option value="">Selecione...</option>
              {salas.filter((s) => s.ativa).map((s) => (
                <option key={s.id} value={s.id}>{s.nome} ({s.capacidade} lugares)</option>
              ))}
            </select>
          </label>
          <label>Título
            <input value={form.titulo} onChange={(e) => setForm({ ...form, titulo: e.target.value })} required />
          </label>
          <label>Responsável
            <input value={form.responsavel} onChange={(e) => setForm({ ...form, responsavel: e.target.value })} required />
          </label>
        </div>
        <div className="linha">
          <label>Início
            <input type="datetime-local" min={editandoId ? undefined : agoraLocal()} value={form.inicio} onChange={(e) => setForm({ ...form, inicio: e.target.value })} required />
          </label>
          <label>Fim
            <input type="datetime-local" min={form.inicio || undefined} value={form.fim} onChange={(e) => setForm({ ...form, fim: e.target.value })} required />
          </label>
          <div className="disp">
            {disponivel === true && <span className="selo verde">Sala livre nesse horário</span>}
            {disponivel === false && <span className="selo vermelho">Sala ocupada nesse horário</span>}
          </div>
        </div>
        <div className="acoes">
          <button type="submit">{editandoId ? 'Salvar alterações' : 'Reservar'}</button>
          {editandoId && <button type="button" className="secundario" onClick={limpar}>Cancelar edição</button>}
        </div>
      </form>

      <table>
        <thead>
          <tr><th>#</th><th>Sala</th><th>Título</th><th>Responsável</th><th>Início</th><th>Fim</th><th>Status</th><th></th></tr>
        </thead>
        <tbody>
          {reservas.map((r) => (
            <tr key={r.id} className={r.status === 'CANCELADA' ? 'apagada' : ''}>
              <td>{r.id}</td>
              <td>{nomeSala(r.salaId)}</td>
              <td>{r.titulo}</td>
              <td>{r.responsavel}</td>
              <td>{formatarData(r.inicio)}</td>
              <td>{formatarData(r.fim)}</td>
              <td><span className={`selo ${r.status === 'ATIVA' ? 'verde' : 'cinza'}`}>{r.status}</span></td>
              <td className="acoes-linha">
                {r.status === 'ATIVA' && (
                  <>
                    <button className="secundario" onClick={() => editar(r)}>Editar</button>
                    <button className="secundario" onClick={() => cancelarReserva(r)}>Cancelar</button>
                  </>
                )}
                <BotaoConfirmar onConfirmar={() => excluir(r)} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

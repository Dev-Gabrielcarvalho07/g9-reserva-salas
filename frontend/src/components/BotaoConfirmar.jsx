import { useEffect, useState } from 'react';

// Botão de ação destrutiva em dois cliques: "Excluir" -> "Confirmar?" (volta sozinho após 3s).
// Substitui o window.confirm(), que trava a página e foge do visual do sistema.
export default function BotaoConfirmar({ onConfirmar, children = 'Excluir' }) {
  const [confirmando, setConfirmando] = useState(false);

  useEffect(() => {
    if (!confirmando) return undefined;
    const t = setTimeout(() => setConfirmando(false), 3000);
    return () => clearTimeout(t);
  }, [confirmando]);

  function clicar() {
    if (confirmando) {
      setConfirmando(false);
      onConfirmar();
    } else {
      setConfirmando(true);
    }
  }

  return (
    <button className={confirmando ? 'perigo-forte' : 'perigo'} onClick={clicar}>
      {confirmando ? 'Confirmar?' : children}
    </button>
  );
}

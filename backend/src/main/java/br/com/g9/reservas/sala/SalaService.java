package br.com.g9.reservas.sala;

import br.com.g9.reservas.common.AuditoriaSupport;
import br.com.g9.reservas.common.NaoEncontradoException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
public class SalaService {

    private final SalaRepository repository;
    private final AuditoriaSupport auditoria;

    public SalaService(SalaRepository repository, AuditoriaSupport auditoria) {
        this.repository = repository;
        this.auditoria = auditoria;
    }

    @Transactional(readOnly = true)
    public List<Sala> listar() {
        return repository.findAllByOrderByNomeAsc();
    }

    @Transactional(readOnly = true)
    public Sala buscar(Long id) {
        return repository.findById(id)
                .orElseThrow(() -> new NaoEncontradoException("Sala " + id + " não encontrada"));
    }

    @Transactional
    public Sala criar(SalaRequest req) {
        auditoria.marcarOperador();
        Sala sala = new Sala();
        aplicar(sala, req);
        return repository.saveAndFlush(sala);
    }

    @Transactional
    public Sala atualizar(Long id, SalaRequest req) {
        auditoria.marcarOperador();
        Sala sala = buscar(id);
        aplicar(sala, req);
        return repository.saveAndFlush(sala);
    }

    @Transactional
    public void excluir(Long id) {
        auditoria.marcarOperador();
        Sala sala = buscar(id);
        repository.delete(sala);
        repository.flush();
    }

    private void aplicar(Sala sala, SalaRequest req) {
        sala.setNome(req.nome());
        sala.setCapacidade(req.capacidade());
        sala.setLocalizacao(req.localizacao());
        sala.setAtiva(req.ativa() == null || req.ativa());
    }
}

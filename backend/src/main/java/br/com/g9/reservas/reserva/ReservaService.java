package br.com.g9.reservas.reserva;

import br.com.g9.reservas.auth.OperadorContexto;
import br.com.g9.reservas.common.AuditoriaSupport;
import br.com.g9.reservas.common.NaoEncontradoException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
public class ReservaService {

    private final ReservaRepository repository;
    private final JdbcTemplate jdbc;
    private final AuditoriaSupport auditoria;

    public ReservaService(ReservaRepository repository, JdbcTemplate jdbc, AuditoriaSupport auditoria) {
        this.repository = repository;
        this.jdbc = jdbc;
        this.auditoria = auditoria;
    }

    @Transactional(readOnly = true)
    public List<Reserva> listar() {
        return repository.findAllByOrderByInicioDesc();
    }

    @Transactional(readOnly = true)
    public Reserva buscar(Long id) {
        return repository.findById(id)
                .orElseThrow(() -> new NaoEncontradoException("Reserva " + id + " não encontrada"));
    }

    /**
     * Criação passa pela PROCEDURE reserva.sp_reservar_sala, que faz
     * SELECT ... FOR UPDATE na sala -> duas reservas simultâneas da mesma
     * sala entram em fila e a segunda é recusada se houver choque.
     */
    @Transactional
    public Reserva criar(ReservaRequest req) {
        auditoria.marcarOperador();
        Long operadorId = OperadorContexto.atual() != null ? OperadorContexto.atual().id() : null;

        Long novoId = jdbc.queryForObject(
                "CALL reserva.sp_reservar_sala(?, ?, ?, ?, ?, ?, NULL)",
                Long.class,
                req.salaId(), req.titulo(), req.responsavel(), req.inicio(), req.fim(), operadorId);

        return buscar(novoId);
    }

    /** Edição via JPA: o TRIGGER trg_valida_reserva barra choque de horário. */
    @Transactional
    public Reserva atualizar(Long id, ReservaRequest req) {
        auditoria.marcarOperador();
        Reserva r = buscar(id);
        r.setSalaId(req.salaId());
        r.setTitulo(req.titulo());
        r.setResponsavel(req.responsavel());
        r.setInicio(req.inicio());
        r.setFim(req.fim());
        return repository.saveAndFlush(r);
    }

    @Transactional
    public Reserva cancelar(Long id) {
        auditoria.marcarOperador();
        Reserva r = buscar(id);
        r.setStatus("CANCELADA");
        return repository.saveAndFlush(r);
    }

    @Transactional
    public void excluir(Long id) {
        auditoria.marcarOperador();
        Reserva r = buscar(id);
        repository.delete(r);
        repository.flush();
    }
}

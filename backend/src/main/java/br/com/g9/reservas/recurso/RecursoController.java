package br.com.g9.reservas.recurso;

import br.com.g9.reservas.common.AuditoriaSupport;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/** Recursos de infraestrutura das salas (projetor, TV, webcam...). */
@RestController
@RequestMapping("/api/recursos")
public class RecursoController {

    public record RecursoRequest(@NotNull Long salaId,
                                 @NotBlank @Size(max = 80) String nome,
                                 @Size(max = 200) String descricao) {
    }

    private final RecursoRepository repository;
    private final AuditoriaSupport auditoria;

    public RecursoController(RecursoRepository repository, AuditoriaSupport auditoria) {
        this.repository = repository;
        this.auditoria = auditoria;
    }

    @GetMapping
    public List<Recurso> listar(@RequestParam(required = false) Long salaId) {
        return salaId == null
                ? repository.findAllByOrderBySalaIdAscNomeAsc()
                : repository.findBySalaIdOrderByNomeAsc(salaId);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    @Transactional
    public Recurso criar(@RequestBody @Valid RecursoRequest req) {
        auditoria.marcarOperador();
        Recurso r = new Recurso();
        r.setSalaId(req.salaId());
        r.setNome(req.nome());
        r.setDescricao(req.descricao());
        return repository.saveAndFlush(r);
    }

    @DeleteMapping("/{id}")
    @Transactional
    public ResponseEntity<Void> excluir(@PathVariable Long id) {
        auditoria.marcarOperador();
        repository.deleteById(id);
        repository.flush();
        return ResponseEntity.noContent().build();
    }
}

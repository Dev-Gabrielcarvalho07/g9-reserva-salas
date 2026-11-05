package br.com.g9.reservas.recurso;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface RecursoRepository extends JpaRepository<Recurso, Long> {

    List<Recurso> findBySalaIdOrderByNomeAsc(Long salaId);

    List<Recurso> findAllByOrderBySalaIdAscNomeAsc();
}

package br.com.g9.reservas.sala;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

/** Spring Data JPA: todas as queries geradas usam Prepared Statements. */
public interface SalaRepository extends JpaRepository<Sala, Long> {

    List<Sala> findAllByOrderByNomeAsc();
}

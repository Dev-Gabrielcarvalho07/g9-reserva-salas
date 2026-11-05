package br.com.g9.reservas.common;

import br.com.g9.reservas.auth.OperadorContexto;
import br.com.g9.reservas.auth.SessaoOperador;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * Informa ao Postgres QUAL operador está fazendo a alteração.
 * set_config(..., true) = vale só para a transação atual (SET LOCAL),
 * por isso funciona com o PgBouncer em pool_mode=transaction.
 * O trigger audit.fn_registrar_auditoria lê com current_setting('app.operador').
 *
 * Deve ser chamado DENTRO de um método @Transactional.
 */
@Component
public class AuditoriaSupport {

    private final JdbcTemplate jdbc;

    public AuditoriaSupport(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public void marcarOperador() {
        SessaoOperador s = OperadorContexto.atual();
        String login = (s != null) ? s.login() : "desconhecido";
        jdbc.queryForObject("SELECT set_config('app.operador', ?, true)", String.class, login);
    }
}

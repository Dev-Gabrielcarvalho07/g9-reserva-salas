package br.com.g9.reservas.relatorio;

import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

/**
 * Consultas que usam os objetos do banco diretamente:
 * views, function e trilha de auditoria. Tudo com "?" (Prepared Statement).
 */
@RestController
@RequestMapping("/api/relatorios")
public class RelatorioController {

    private final JdbcTemplate jdbc;

    public RelatorioController(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /** VIEW reserva.vw_reservas_hoje */
    @GetMapping("/reservas-hoje")
    public List<Map<String, Object>> reservasHoje() {
        return jdbc.queryForList("SELECT * FROM reserva.vw_reservas_hoje");
    }

    /** VIEW reserva.vw_salas_livres_agora */
    @GetMapping("/salas-agora")
    public List<Map<String, Object>> salasAgora() {
        return jdbc.queryForList("SELECT * FROM reserva.vw_salas_livres_agora");
    }

    /** FUNCTION reserva.fn_sala_disponivel */
    @GetMapping("/disponibilidade")
    public Map<String, Object> disponibilidade(
            @RequestParam Long salaId,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) LocalDateTime inicio,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) LocalDateTime fim,
            @RequestParam(required = false) Long ignorarId) {
        // ignorarId: na edição, a própria reserva não conta como conflito
        Boolean livre = jdbc.queryForObject(
                "SELECT reserva.fn_sala_disponivel(?, ?, ?, ?::bigint)", Boolean.class,
                salaId, inicio, fim, ignorarId);
        return Map.of("salaId", salaId, "disponivel", Boolean.TRUE.equals(livre));
    }

    /** Tabela audit.log_alteracao (somente leitura para a aplicação) */
    @GetMapping("/auditoria")
    public List<Map<String, Object>> auditoria() {
        return jdbc.queryForList("""
                SELECT id, tabela, operacao, registro_id, usuario_db, operador_app,
                       data_hora, dados_antigos::text AS dados_antigos, dados_novos::text AS dados_novos
                  FROM audit.log_alteracao
                 ORDER BY id DESC
                 LIMIT 50
                """);
    }

    /**
     * DEMO do statement_timeout: o app_user tem limite de 5s.
     * Pedir 7s faz o Postgres cancelar a query (erro 57014 -> HTTP 408).
     */
    @GetMapping("/teste-timeout")
    public Map<String, Object> testeTimeout(@RequestParam(defaultValue = "7") int segundos) {
        jdbc.queryForObject("SELECT pg_sleep(?)::text", String.class, segundos);
        return Map.of("mensagem", "Consulta de " + segundos + "s terminou sem ser cancelada");
    }
}

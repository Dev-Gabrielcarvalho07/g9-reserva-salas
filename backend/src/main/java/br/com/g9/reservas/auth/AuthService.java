package br.com.g9.reservas.auth;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

@Service
public class AuthService {

    private static final Duration VALIDADE = Duration.ofHours(8);

    private final JdbcTemplate jdbc;
    private final Map<String, SessaoOperador> sessoes = new ConcurrentHashMap<>();

    public AuthService(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /**
     * A senha é conferida DENTRO do Postgres (pgcrypto/crypt).
     * O "?" garante Prepared Statement -> sem SQL Injection.
     */
    public Optional<String> login(String login, String senha) {
        List<SessaoOperador> encontrados = jdbc.query(
                "SELECT id, nome, login, perfil FROM seguranca.fn_autenticar(?, ?)",
                (rs, i) -> new SessaoOperador(
                        rs.getLong("id"),
                        rs.getString("nome"),
                        rs.getString("login"),
                        rs.getString("perfil"),
                        Instant.now().plus(VALIDADE)),
                login, senha);

        if (encontrados.isEmpty()) {
            return Optional.empty();
        }
        String token = UUID.randomUUID().toString();
        sessoes.put(token, encontrados.get(0));
        return Optional.of(token);
    }

    public Optional<SessaoOperador> validar(String token) {
        SessaoOperador sessao = sessoes.get(token);
        if (sessao == null) {
            return Optional.empty();
        }
        if (sessao.expirada()) {
            sessoes.remove(token);
            return Optional.empty();
        }
        return Optional.of(sessao);
    }

    public void logout(String token) {
        sessoes.remove(token);
    }
}

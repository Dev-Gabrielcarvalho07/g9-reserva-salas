package br.com.g9.reservas.auth;

import java.time.Instant;

/** Operador logado (vem da function seguranca.fn_autenticar). */
public record SessaoOperador(Long id, String nome, String login, String perfil, Instant expiraEm) {

    public boolean expirada() {
        return Instant.now().isAfter(expiraEm);
    }
}

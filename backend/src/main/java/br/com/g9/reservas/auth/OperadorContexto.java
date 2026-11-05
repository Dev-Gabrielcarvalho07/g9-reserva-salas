package br.com.g9.reservas.auth;

/**
 * Guarda o operador da requisição atual (uma thread por requisição).
 * Preenchido pelo AuthInterceptor e usado pela auditoria.
 */
public final class OperadorContexto {

    private static final ThreadLocal<SessaoOperador> ATUAL = new ThreadLocal<>();

    private OperadorContexto() {
    }

    public static void definir(SessaoOperador sessao) {
        ATUAL.set(sessao);
    }

    public static SessaoOperador atual() {
        return ATUAL.get();
    }

    public static void limpar() {
        ATUAL.remove();
    }
}

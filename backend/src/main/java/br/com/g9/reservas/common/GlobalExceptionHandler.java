package br.com.g9.reservas.common;

import org.postgresql.util.PSQLException;
import org.postgresql.util.ServerErrorMessage;
import org.springframework.dao.DataAccessException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.util.Map;
import java.util.stream.Collectors;

/** Converte erros (inclusive os RAISE EXCEPTION do Postgres) em JSON legível para o front. */
@RestControllerAdvice
public class GlobalExceptionHandler {

    @ExceptionHandler(NaoEncontradoException.class)
    public ResponseEntity<Map<String, String>> naoEncontrado(NaoEncontradoException e) {
        return erro(HttpStatus.NOT_FOUND, e.getMessage());
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<Map<String, String>> validacao(MethodArgumentNotValidException e) {
        String msg = e.getBindingResult().getFieldErrors().stream()
                .map(f -> f.getField() + ": " + f.getDefaultMessage())
                .collect(Collectors.joining("; "));
        return erro(HttpStatus.BAD_REQUEST, msg);
    }

    @ExceptionHandler(HttpMessageNotReadableException.class)
    public ResponseEntity<Map<String, String>> jsonInvalido(HttpMessageNotReadableException e) {
        return erro(HttpStatus.BAD_REQUEST, "JSON inválido ou campo com formato errado");
    }

    @ExceptionHandler(DataAccessException.class)
    public ResponseEntity<Map<String, String>> banco(DataAccessException e) {
        PSQLException psql = encontrarPsql(e);
        if (psql == null) {
            return erro(HttpStatus.INTERNAL_SERVER_ERROR, "Erro de acesso ao banco");
        }
        String sqlState = psql.getSQLState() == null ? "" : psql.getSQLState();
        ServerErrorMessage server = psql.getServerErrorMessage();
        String msgBanco = (server != null && server.getMessage() != null) ? server.getMessage() : psql.getMessage();

        return switch (sqlState) {
            case "23P01", "23514" -> erro(HttpStatus.CONFLICT, msgBanco);   // RAISE da procedure/trigger
            case "P0002" -> erro(HttpStatus.NOT_FOUND, msgBanco);
            case "23503" -> erro(HttpStatus.CONFLICT, "Registro em uso por outros dados (chave estrangeira)");
            case "23505" -> erro(HttpStatus.CONFLICT, "Já existe um registro com esse valor");
            // 504 e não 408: o navegador reenvia automaticamente requisições que recebem 408
            case "57014" -> erro(HttpStatus.GATEWAY_TIMEOUT, "Consulta cancelada pelo banco: statement_timeout");
            case "42501" -> erro(HttpStatus.FORBIDDEN, "Permissão negada no banco: " + msgBanco);
            default -> erro(HttpStatus.INTERNAL_SERVER_ERROR, msgBanco);
        };
    }

    private PSQLException encontrarPsql(Throwable t) {
        while (t != null) {
            if (t instanceof PSQLException p) {
                return p;
            }
            t = t.getCause();
        }
        return null;
    }

    private ResponseEntity<Map<String, String>> erro(HttpStatus status, String mensagem) {
        return ResponseEntity.status(status).body(Map.of("erro", mensagem == null ? "Erro" : mensagem));
    }
}

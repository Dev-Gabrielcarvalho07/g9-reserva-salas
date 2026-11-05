package br.com.g9.reservas.reserva;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.time.LocalDateTime;

/** Datas no formato ISO: "2026-11-06T14:00:00" */
public record ReservaRequest(
        @NotNull Long salaId,
        @NotBlank @Size(max = 120) String titulo,
        @NotBlank @Size(max = 100) String responsavel,
        @NotNull LocalDateTime inicio,
        @NotNull LocalDateTime fim) {
}

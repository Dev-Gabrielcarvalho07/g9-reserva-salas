package br.com.g9.reservas.sala;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record SalaRequest(
        @NotBlank @Size(max = 80) String nome,
        @NotNull @Min(1) Integer capacidade,
        @Size(max = 120) String localizacao,
        Boolean ativa) {
}

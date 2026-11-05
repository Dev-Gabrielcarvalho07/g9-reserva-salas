package br.com.g9.reservas.auth;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/auth")
public class AuthController {

    public record LoginRequest(@NotBlank String login, @NotBlank String senha) {
    }

    private final AuthService authService;

    public AuthController(AuthService authService) {
        this.authService = authService;
    }

    @PostMapping("/login")
    public ResponseEntity<?> login(@RequestBody @Valid LoginRequest req) {
        return authService.login(req.login(), req.senha())
                .<ResponseEntity<?>>map(token -> {
                    SessaoOperador s = authService.validar(token).orElseThrow();
                    return ResponseEntity.ok(Map.of(
                            "token", token,
                            "nome", s.nome(),
                            "login", s.login(),
                            "perfil", s.perfil()));
                })
                .orElseGet(() -> ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                        .body(Map.of("erro", "Login ou senha inválidos")));
    }

    @GetMapping("/me")
    public SessaoOperador me() {
        return OperadorContexto.atual();
    }

    @PostMapping("/logout")
    public ResponseEntity<Void> logout(@RequestHeader("Authorization") String header) {
        authService.logout(header.replace("Bearer ", ""));
        return ResponseEntity.noContent().build();
    }
}

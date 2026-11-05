package br.com.g9.reservas.config;

import br.com.g9.reservas.auth.AuthService;
import br.com.g9.reservas.auth.OperadorContexto;
import br.com.g9.reservas.auth.SessaoOperador;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;

import java.util.Optional;

/** Bloqueia toda rota /api/** (exceto login) sem token válido. */
@Component
public class AuthInterceptor implements HandlerInterceptor {

    private final AuthService authService;

    public AuthInterceptor(AuthService authService) {
        this.authService = authService;
    }

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler)
            throws Exception {
        if ("OPTIONS".equalsIgnoreCase(request.getMethod())) {
            return true;
        }
        String header = request.getHeader("Authorization");
        Optional<SessaoOperador> sessao = Optional.empty();
        if (header != null && header.startsWith("Bearer ")) {
            sessao = authService.validar(header.substring(7));
        }
        if (sessao.isEmpty()) {
            response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
            response.setContentType("application/json;charset=UTF-8");
            response.getWriter().write("{\"erro\":\"Não autenticado\"}");
            return false;
        }
        OperadorContexto.definir(sessao.get());
        return true;
    }

    @Override
    public void afterCompletion(HttpServletRequest request, HttpServletResponse response, Object handler,
                                Exception ex) {
        OperadorContexto.limpar();
    }
}

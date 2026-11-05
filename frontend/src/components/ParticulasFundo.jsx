import { useEffect, useRef } from 'react';

// Fundo animado do login: partículas que se ligam por linhas e são atraídas pelo mouse.
export default function ParticulasFundo() {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const reduzir = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const DISTANCIA_LINHA = 130;
    const RAIO_MOUSE = 180;
    let largura = 0;
    let altura = 0;
    let particulas = [];
    let quadro = null;
    const mouse = { x: -9999, y: -9999, ativo: false };

    function medir() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      largura = window.innerWidth;
      altura = window.innerHeight;
      canvas.width = largura * dpr;
      canvas.height = altura * dpr;
      canvas.style.width = `${largura}px`;
      canvas.style.height = `${altura}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      // Quantidade proporcional à área da tela (máx. 140, para não pesar)
      const total = Math.min(140, Math.round((largura * altura) / 11000));
      particulas = Array.from({ length: total }, () => ({
        x: Math.random() * largura,
        y: Math.random() * altura,
        vx: (Math.random() - 0.5) * 0.4,
        vy: (Math.random() - 0.5) * 0.4,
        r: 1 + Math.random() * 1.6,
      }));
      if (reduzir) desenhar();
    }

    function atualizar() {
      particulas.forEach((p) => {
        if (mouse.ativo) {
          const dx = mouse.x - p.x;
          const dy = mouse.y - p.y;
          const d = Math.hypot(dx, dy);
          if (d < RAIO_MOUSE && d > 1) {
            const forca = (1 - d / RAIO_MOUSE) * 0.06;
            p.vx += (dx / d) * forca;
            p.vy += (dy / d) * forca;
          }
        }
        p.vx *= 0.985;
        p.vy *= 0.985;
        // mantém um movimento mínimo para nunca ficar parado
        if (Math.abs(p.vx) < 0.05) p.vx += (Math.random() - 0.5) * 0.05;
        if (Math.abs(p.vy) < 0.05) p.vy += (Math.random() - 0.5) * 0.05;
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < 0 || p.x > largura) p.vx *= -1;
        if (p.y < 0 || p.y > altura) p.vy *= -1;
        p.x = Math.max(0, Math.min(largura, p.x));
        p.y = Math.max(0, Math.min(altura, p.y));
      });
    }

    function desenhar() {
      ctx.clearRect(0, 0, largura, altura);

      // brilho suave seguindo o mouse
      if (mouse.ativo) {
        const g = ctx.createRadialGradient(mouse.x, mouse.y, 0, mouse.x, mouse.y, RAIO_MOUSE * 1.4);
        g.addColorStop(0, 'rgba(99, 140, 255, 0.16)');
        g.addColorStop(1, 'rgba(99, 140, 255, 0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, largura, altura);
      }

      // linhas entre partículas próximas
      for (let i = 0; i < particulas.length; i++) {
        const a = particulas[i];
        for (let j = i + 1; j < particulas.length; j++) {
          const b = particulas[j];
          const d = Math.hypot(a.x - b.x, a.y - b.y);
          if (d < DISTANCIA_LINHA) {
            ctx.strokeStyle = `rgba(140, 170, 255, ${(1 - d / DISTANCIA_LINHA) * 0.35})`;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();
          }
        }
        // linhas até o mouse
        if (mouse.ativo) {
          const dm = Math.hypot(a.x - mouse.x, a.y - mouse.y);
          if (dm < RAIO_MOUSE) {
            ctx.strokeStyle = `rgba(170, 195, 255, ${(1 - dm / RAIO_MOUSE) * 0.6})`;
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(mouse.x, mouse.y);
            ctx.stroke();
          }
        }
      }

      // partículas
      particulas.forEach((p) => {
        ctx.fillStyle = 'rgba(205, 220, 255, 0.85)';
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      });
    }

    function loop() {
      atualizar();
      desenhar();
      quadro = requestAnimationFrame(loop);
    }

    function iniciar() {
      if (reduzir || quadro !== null || document.hidden) return;
      quadro = requestAnimationFrame(loop);
    }
    function parar() {
      if (quadro !== null) cancelAnimationFrame(quadro);
      quadro = null;
    }
    function aoMudarVisibilidade() {
      if (document.hidden) parar(); else iniciar();
    }
    function aoMover(e) {
      mouse.x = e.clientX;
      mouse.y = e.clientY;
      mouse.ativo = true;
      if (reduzir) desenhar();
    }
    function aoSair() {
      mouse.ativo = false;
    }

    medir();
    iniciar();
    window.addEventListener('resize', medir);
    window.addEventListener('mousemove', aoMover);
    document.addEventListener('mouseleave', aoSair);
    document.addEventListener('visibilitychange', aoMudarVisibilidade);

    return () => {
      parar();
      window.removeEventListener('resize', medir);
      window.removeEventListener('mousemove', aoMover);
      document.removeEventListener('mouseleave', aoSair);
      document.removeEventListener('visibilitychange', aoMudarVisibilidade);
    };
  }, []);

  return <canvas ref={canvasRef} className="particulas-fundo" aria-hidden="true" />;
}

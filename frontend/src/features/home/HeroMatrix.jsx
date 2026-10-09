import { useEffect, useRef } from 'react';

export default function HeroMatrix() {
  const canvasRef = useRef(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas.getContext('2d');
    if (!context) return;
    const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
    let width = 0, height = 0, phase = 0, frame = 0, lastPaint = 0;
    let visible = false, color, disposed = false;

    function draw() {
      if (!width || !height) return;
      context.clearRect(0, 0, width, height);
      context.fillStyle = color;
      const spacing = width < 600 ? 10 : 14;
      for (let y = spacing / 2; y < height; y += spacing) {
        const ny = y / height;
        for (let x = spacing / 2; x < width; x += spacing) {
          const nx = x / width;
          const crest = .48 + .16 * Math.sin(nx * 7 - phase * .45);
          const second = .72 + .1 * Math.cos(nx * 8 + phase * .3);
          const strength = Math.exp(-(((ny - crest) * 6) ** 2))
            + .35 * Math.exp(-(((ny - second) * 9) ** 2));
          const bend = Math.sin(ny * Math.PI);
          const px = x + Math.sin(nx * 6.5 + phase * .4) * 4 * bend;
          const py = y + Math.cos(nx * 5.5 - phase * .35) * 9 * bend;
          const radius = .55 + strength * 1.15;
          context.globalAlpha = .025 + strength * .3;
          context.beginPath();
          context.ellipse(px, py, radius, radius * .7, 0, 0, Math.PI * 2);
          context.fill();
        }
      }
    }

    function animate(now) {
      if (disposed) return;
      // The decorative loop is capped at 30fps and never drives React renders or layout.
      if (now - lastPaint >= 1000 / 30) {
        phase += Math.min((now - lastPaint) / 1000, .1);
        lastPaint = now;
        draw();
      }
      frame = requestAnimationFrame(animate);
    }

    function syncMotion() {
      cancelAnimationFrame(frame);
      if (!disposed && visible && !document.hidden && !reducedMotion.matches) {
        lastPaint = performance.now();
        frame = requestAnimationFrame(animate);
      }
    }

    const resize = new ResizeObserver(() => {
      if (disposed) return;
      const bounds = canvas.getBoundingClientRect();
      width = bounds.width;
      height = bounds.height;
      const ratio = Math.min(devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      color = getComputedStyle(canvas).color;
      draw();
    });
    resize.observe(canvas);
    const visibility = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      syncMotion();
    });
    visibility.observe(canvas.parentElement);
    reducedMotion.addEventListener('change', syncMotion);
    document.addEventListener('visibilitychange', syncMotion);
    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      resize.disconnect();
      visibility.disconnect();
      reducedMotion.removeEventListener('change', syncMotion);
      document.removeEventListener('visibilitychange', syncMotion);
    };
  }, []);

  return <canvas ref={canvasRef} className="hero-matrix" aria-hidden="true" />;
}

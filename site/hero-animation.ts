/**
 * Hero Animation — particle network background
 * Lightweight canvas animation: connected dots drifting gently
 */

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
}

const canvas = document.getElementById('hero-canvas') as HTMLCanvasElement;
if (canvas) {
  const ctx = canvas.getContext('2d')!;
  const particles: Particle[] = [];
  const PARTICLE_COUNT = 80;
  const CONNECTION_DISTANCE = 200;
  const PARTICLE_COLOR = 'rgba(88, 166, 255, 0.8)';
  const LINE_COLOR = 'rgba(88, 166, 255, 0.25)';

  // Exclusion zone: center area where title/tagline/buttons live
  // Particles bounce off this rectangle
  function getExclusionZone(): { x1: number; y1: number; x2: number; y2: number } {
    const w = canvas.offsetWidth;
    const h = canvas.offsetHeight;
    const zoneW = Math.min(700, w * 0.5);
    const zoneH = 280;
    return {
      x1: (w - zoneW) / 2,
      y1: (h - zoneH) / 2,
      x2: (w + zoneW) / 2,
      y2: (h + zoneH) / 2,
    };
  }

  function isInExclusionZone(x: number, y: number): boolean {
    const z = getExclusionZone();
    return x > z.x1 && x < z.x2 && y > z.y1 && y < z.y2;
  }

  function resize(): void {
    canvas.width = canvas.offsetWidth * devicePixelRatio;
    canvas.height = canvas.offsetHeight * devicePixelRatio;
    ctx.scale(devicePixelRatio, devicePixelRatio);
  }

  function initParticles(): void {
    particles.length = 0;
    const w = canvas.offsetWidth;
    const h = canvas.offsetHeight;
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      let x: number, y: number;
      do {
        x = Math.random() * w;
        y = Math.random() * h;
      } while (isInExclusionZone(x, y));
      particles.push({
        x, y,
        vx: (Math.random() - 0.5) * 0.4,
        vy: (Math.random() - 0.5) * 0.4,
        radius: Math.random() * 4 + 1,
      });
    }
  }

  function draw(): void {
    const w = canvas.offsetWidth;
    const h = canvas.offsetHeight;
    ctx.clearRect(0, 0, w, h);

    // Update positions
    const zone = getExclusionZone();
    for (const p of particles) {
      p.x += p.vx;
      p.y += p.vy;
      // Bounce off canvas edges
      if (p.x < 0 || p.x > w) p.vx *= -1;
      if (p.y < 0 || p.y > h) p.vy *= -1;
      // Deflect from exclusion zone
      if (p.x > zone.x1 && p.x < zone.x2 && p.y > zone.y1 && p.y < zone.y2) {
        const fromLeft = p.x - zone.x1;
        const fromRight = zone.x2 - p.x;
        const fromTop = p.y - zone.y1;
        const fromBottom = zone.y2 - p.y;
        const minDist = Math.min(fromLeft, fromRight, fromTop, fromBottom);
        if (minDist === fromLeft || minDist === fromRight) p.vx *= -1;
        else p.vy *= -1;
        // Push out
        if (minDist === fromLeft) p.x = zone.x1 - 1;
        else if (minDist === fromRight) p.x = zone.x2 + 1;
        else if (minDist === fromTop) p.y = zone.y1 - 1;
        else p.y = zone.y2 + 1;
      }
    }

    // Draw connections
    ctx.strokeStyle = LINE_COLOR;
    ctx.lineWidth = 1.5;
    for (let i = 0; i < particles.length; i++) {
      for (let j = i + 1; j < particles.length; j++) {
        const dx = particles[i].x - particles[j].x;
        const dy = particles[i].y - particles[j].y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < CONNECTION_DISTANCE) {
          const opacity = 1 - dist / CONNECTION_DISTANCE;
          ctx.strokeStyle = `rgba(88, 166, 255, ${0.25 * opacity})`;
          ctx.beginPath();
          ctx.moveTo(particles[i].x, particles[i].y);
          ctx.lineTo(particles[j].x, particles[j].y);
          ctx.stroke();
        }
      }
    }

    // Draw particles
    ctx.fillStyle = PARTICLE_COLOR;
    for (const p of particles) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
      ctx.fill();
    }

    requestAnimationFrame(draw);
  }

  resize();
  initParticles();
  draw();
  window.addEventListener('resize', () => { resize(); initParticles(); });
}

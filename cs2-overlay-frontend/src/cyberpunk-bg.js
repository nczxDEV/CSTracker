// Animated "Cyberpunk" synthwave canvas background effect.
// Purely a visual decoration - it has nothing to do with any data
// collection or the CS2 process, it only ever runs on our own window's
// <canvas> element. Same architecture as matrix-bg.js's MatrixRain /
// galaxy-bg.js's GalaxyBackground (a small, dependency-free class with
// start()/stop()/updateOptions()), so it plugs into settings-store.js
// `applyBackground()` the same way.
//
// Effect: a retro-synthwave skyline - a striped, pulsing "sun" disc on
// the horizon, a silhouette city skyline with blinking windows, an
// animated perspective neon grid "floor", drifting neon data-particles,
// a subtle scanline overlay, and a moving scan-sweep band - evoking a
// Cyberpunk/Synthwave mood for the Control Panel background.
class CyberpunkBackground {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.speed = 1;
    this.running = false;
    this.buildings = [];
    this.particles = [];
    this._gridOffset = 0;
    this._nextParticleReset = [];
    this._onResize = this._onResize.bind(this);
    this._tick = this._tick.bind(this);
  }

  _onResize() {
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = this.canvas.clientWidth * dpr;
    this.canvas.height = this.canvas.clientHeight * dpr;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this._initBuildings();
    this._initParticles();
  }

  /** Random-height building silhouettes with a few randomly-lit, blinking windows - built once per resize. */
  _initBuildings() {
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    const count = Math.max(14, Math.round(w / 34));
    const buildingWidth = w / count;
    this.buildings = [];
    for (let i = 0; i < count; i++) {
      const height = h * (0.06 + Math.random() * 0.22);
      const windows = [];
      const windowRows = Math.floor(height / 13);
      for (let r = 0; r < windowRows; r++) {
        if (Math.random() > 0.55) {
          windows.push({
            offsetX: 3 + Math.random() * Math.max(2, buildingWidth - 8),
            offsetY: r * 12 + 4,
            phase: Math.random() * Math.PI * 2,
          });
        }
      }
      this.buildings.push({ x: i * buildingWidth, width: buildingWidth * 0.82, height, windows });
    }
  }

  /** Neon "data particle" motes drifting upward through the scene, in the synthwave accent palette. */
  _initParticles() {
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    const colors = ["#ff2d96", "#7ee8ff", "#b52cff", "#ffd35c"];
    const count = Math.max(24, Math.round((w * h) / 26000));
    this.particles = [];
    for (let i = 0; i < count; i++) {
      this.particles.push(this._spawnParticle(colors, w, h));
    }
  }

  _spawnParticle(colors, w, h, fromBottom = false) {
    return {
      x: Math.random() * w,
      y: fromBottom ? h + 10 : Math.random() * h,
      size: 1 + Math.random() * 2,
      speed: 0.25 + Math.random() * 0.8,
      drift: (Math.random() - 0.5) * 0.3,
      color: colors[Math.floor(Math.random() * colors.length)],
      alpha: 0.3 + Math.random() * 0.55,
    };
  }

  start(options = {}) {
    if (options.speed !== undefined) this.speed = options.speed;
    window.addEventListener("resize", this._onResize);
    this._onResize();
    this.running = true;
    this._lastFrame = performance.now();
    this._raf = requestAnimationFrame(this._tick);
  }

  updateOptions(options = {}) {
    if (options.speed !== undefined) this.speed = options.speed;
  }

  stop() {
    this.running = false;
    if (this._raf) cancelAnimationFrame(this._raf);
    window.removeEventListener("resize", this._onResize);
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  _tick(now) {
    if (!this.running) return;
    const dt = Math.min(50, now - (this._lastFrame || now));
    this._lastFrame = now;
    this._draw(now, dt);
    this._raf = requestAnimationFrame(this._tick);
  }

  _draw(now, dt) {
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    const step = (dt / 16) * this.speed;
    const ctx = this.ctx;

    // --- Base sky gradient (dark magenta -> near-black) ---
    const sky = ctx.createRadialGradient(w * 0.5, h * 0.38, 0, w * 0.5, h * 0.38, Math.max(w, h) * 0.75);
    sky.addColorStop(0, "#2a0a3d");
    sky.addColorStop(0.35, "#140222");
    sky.addColorStop(1, "#05010a");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);

    // --- Retro striped sun disc ---
    const sunRadius = Math.min(w, h) * 0.22;
    const sunX = w * 0.5;
    const sunY = h * 0.32;
    const pulse = 0.75 + 0.25 * Math.sin(now / 2400);
    ctx.save();
    ctx.beginPath();
    ctx.arc(sunX, sunY, sunRadius, 0, Math.PI * 2);
    ctx.clip();
    const sunGrad = ctx.createLinearGradient(sunX, sunY - sunRadius, sunX, sunY + sunRadius);
    sunGrad.addColorStop(0, "#ffd35c");
    sunGrad.addColorStop(0.3, "#ff8a5c");
    sunGrad.addColorStop(0.6, "#ff3d7f");
    sunGrad.addColorStop(1, "#b52cff");
    ctx.fillStyle = sunGrad;
    ctx.shadowColor = `rgba(255, 61, 127, ${(0.55 * pulse).toFixed(2)})`;
    ctx.shadowBlur = 60 * pulse;
    ctx.fillRect(sunX - sunRadius, sunY - sunRadius, sunRadius * 2, sunRadius * 2);
    // Horizontal "retro" stripes cut out of the lower two-thirds of the disc.
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#140222";
    const stripeH = Math.max(2, sunRadius * 0.05);
    for (let y = sunY - sunRadius * 0.15; y < sunY + sunRadius; y += stripeH * 2) {
      ctx.fillRect(sunX - sunRadius, y, sunRadius * 2, stripeH);
    }
    ctx.restore();

    // --- City skyline silhouette on the horizon, with blinking windows ---
    const horizonY = h * 0.62;
    ctx.fillStyle = "#0d0416";
    this.buildings.forEach((b) => {
      ctx.fillRect(b.x, horizonY - b.height, b.width, b.height);
    });
    this.buildings.forEach((b) => {
      b.windows.forEach((win) => {
        const blink = 0.5 + 0.5 * Math.sin(now / 900 + win.phase);
        if (blink < 0.3) return;
        ctx.fillStyle = `rgba(255, 232, 156, ${(blink * 0.9).toFixed(2)})`;
        ctx.fillRect(b.x + win.offsetX, horizonY - b.height + win.offsetY, 3, 3);
      });
    });

    // --- Perspective neon grid floor, scrolling toward the viewer ---
    this._gridOffset = (this._gridOffset + step * 2.4) % 40;
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, horizonY, w, h - horizonY);
    ctx.clip();
    ctx.strokeStyle = "rgba(255, 45, 150, 0.55)";
    ctx.lineWidth = 1;
    const floorH = h - horizonY;
    // Horizontal converging lines (perspective feel via easing toward horizon).
    const rows = 14;
    for (let i = 0; i < rows; i++) {
      const t = (i + this._gridOffset / 40) / rows;
      const y = horizonY + Math.pow(t, 1.9) * floorH;
      ctx.globalAlpha = 0.15 + t * 0.55;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }
    // Vertical lines fanning out from a vanishing point at the horizon center.
    const vanishX = w / 2;
    const cols = 16;
    ctx.globalAlpha = 0.4;
    for (let i = -cols; i <= cols; i++) {
      const spread = i / cols;
      ctx.beginPath();
      ctx.moveTo(vanishX + spread * w * 0.06, horizonY);
      ctx.lineTo(vanishX + spread * w * 1.1, h);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    // Fade the floor back into darkness near the horizon.
    const floorFade = ctx.createLinearGradient(0, horizonY, 0, h);
    floorFade.addColorStop(0, "rgba(5,1,10,1)");
    floorFade.addColorStop(0.25, "rgba(5,1,10,0)");
    ctx.fillStyle = floorFade;
    ctx.fillRect(0, horizonY, w, h - horizonY);
    ctx.restore();

    // --- Drifting neon data-particles ---
    this.particles.forEach((p) => {
      ctx.globalAlpha = p.alpha;
      ctx.fillStyle = p.color;
      ctx.shadowColor = p.color;
      ctx.shadowBlur = 6;
      ctx.fillRect(p.x, p.y, p.size, p.size);
      p.y -= p.speed * step;
      p.x += p.drift * step;
      if (p.y < -10) Object.assign(p, this._spawnParticle(["#ff2d96", "#7ee8ff", "#b52cff", "#ffd35c"], w, h, true));
    });
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;

    // --- Scanline texture overlay ---
    ctx.save();
    ctx.globalAlpha = 0.05;
    ctx.fillStyle = "#ffffff";
    for (let y = 0; y < h; y += 3) {
      ctx.fillRect(0, y, w, 1);
    }
    ctx.restore();

    // --- Moving scan-sweep band ---
    const sweepPeriod = 5000;
    const sweepT = ((now % sweepPeriod) / sweepPeriod) * (h + 240) - 120;
    const sweepGrad = ctx.createLinearGradient(0, sweepT - 60, 0, sweepT + 60);
    sweepGrad.addColorStop(0, "rgba(255,45,150,0)");
    sweepGrad.addColorStop(0.5, "rgba(255,45,150,0.06)");
    sweepGrad.addColorStop(1, "rgba(255,45,150,0)");
    ctx.fillStyle = sweepGrad;
    ctx.fillRect(0, sweepT - 60, w, 120);

    // --- Vignette ---
    const vignette = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.75);
    vignette.addColorStop(0, "rgba(5,1,10,0)");
    vignette.addColorStop(1, "rgba(5,1,10,0.65)");
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, w, h);
  }
}

// Expose globally for the browser/Tauri webview environment (no bundler,
// we work with plain <script> tags) - same pattern as window.MatrixRain /
// window.GalaxyBackground.
window.CyberpunkBackground = CyberpunkBackground;

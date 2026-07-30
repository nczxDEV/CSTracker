// Animated "Galaxy" (Milky Way) canvas background effect.
// Purely a visual decoration - it has nothing to do with any data
// collection or the CS2 process, it only ever runs on our own window's
// <canvas> element. Same architecture as matrix-bg.js's MatrixRain (a
// small, dependency-free class with start()/stop()/updateOptions()), so
// it plugs into settings-store.js `applyBackground()` the same way.
//
// Effect: three parallax layers of twinkling stars drifting slowly (like
// flying through space), a few softly pulsing nebula-color glows in the
// app's own accent palette (blue/purple/gold), and occasional shooting
// stars streaking across - meant to feel like the Control Panel window
// is floating somewhere out in the Milky Way.
class GalaxyBackground {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.speed = 1;
    this.running = false;
    this.stars = [];
    this.nebulae = [];
    this.shootingStars = [];
    this._nextShootingStarAt = 0;
    this._onResize = this._onResize.bind(this);
    this._tick = this._tick.bind(this);
  }

  _onResize() {
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = this.canvas.clientWidth * dpr;
    this.canvas.height = this.canvas.clientHeight * dpr;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this._initStars();
    this._initNebulae();
  }

  /** Three depth layers (far/small/slow -> near/large/faster) for a parallax "flying through space" feel. */
  _initStars() {
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    const layers = [
      { count: Math.round((w * h) / 9000), speed: 0.12, sizeMin: 0.4, sizeMax: 1.1, alpha: 0.5 },
      { count: Math.round((w * h) / 15000), speed: 0.28, sizeMin: 0.7, sizeMax: 1.6, alpha: 0.72 },
      { count: Math.round((w * h) / 24000), speed: 0.5, sizeMin: 1.0, sizeMax: 2.1, alpha: 0.95 },
    ];
    this.stars = [];
    layers.forEach((layer, layerIndex) => {
      for (let i = 0; i < layer.count; i++) {
        this.stars.push({
          x: Math.random() * w,
          y: Math.random() * h,
          layer: layerIndex,
          speed: layer.speed,
          radius: layer.sizeMin + Math.random() * (layer.sizeMax - layer.sizeMin),
          baseAlpha: layer.alpha * (0.5 + Math.random() * 0.5),
          twinklePhase: Math.random() * Math.PI * 2,
          twinkleSpeed: 0.5 + Math.random() * 1.5,
        });
      }
    });
  }

  /** Soft, slowly-drifting radial "nebula" glows in the app's own accent palette (blue/purple/gold). */
  _initNebulae() {
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    const palette = ["rgba(76,141,255,", "rgba(157,123,255,", "rgba(242,169,59,", "rgba(76,141,255,"];
    this.nebulae = palette.map((color, i) => ({
      x: Math.random() * w,
      y: Math.random() * h,
      radius: Math.min(w, h) * (0.32 + Math.random() * 0.3),
      color,
      driftX: (Math.random() - 0.5) * 0.06,
      driftY: (Math.random() - 0.5) * 0.06,
      phase: Math.random() * Math.PI * 2 + i,
    }));
  }

  start(options = {}) {
    if (options.speed !== undefined) this.speed = options.speed;
    window.addEventListener("resize", this._onResize);
    this._onResize();
    this.running = true;
    this._lastFrame = performance.now();
    this._nextShootingStarAt = this._lastFrame + 2000 + Math.random() * 4000;
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
    const step = dt / 16;

    // Deep space base.
    this.ctx.fillStyle = "#05060a";
    this.ctx.fillRect(0, 0, w, h);

    // Nebula glows - additive blending so overlapping colors brighten
    // instead of muddying, like real nebula gas clouds.
    this.ctx.save();
    this.ctx.globalCompositeOperation = "lighter";
    this.nebulae.forEach((neb) => {
      neb.x += neb.driftX * this.speed * step;
      neb.y += neb.driftY * this.speed * step;
      if (neb.x < -neb.radius) neb.x = w + neb.radius;
      if (neb.x > w + neb.radius) neb.x = -neb.radius;
      if (neb.y < -neb.radius) neb.y = h + neb.radius;
      if (neb.y > h + neb.radius) neb.y = -neb.radius;

      const pulse = 0.7 + 0.3 * Math.sin(now / 3000 + neb.phase);
      const grad = this.ctx.createRadialGradient(neb.x, neb.y, 0, neb.x, neb.y, neb.radius);
      grad.addColorStop(0, `${neb.color}${(0.14 * pulse).toFixed(3)})`);
      grad.addColorStop(1, `${neb.color}0)`);
      this.ctx.fillStyle = grad;
      this.ctx.beginPath();
      this.ctx.arc(neb.x, neb.y, neb.radius, 0, Math.PI * 2);
      this.ctx.fill();
    });
    this.ctx.restore();

    // Twinkling, parallax-drifting stars.
    this.stars.forEach((star) => {
      star.x -= star.speed * this.speed * step;
      star.y += star.speed * this.speed * 0.12 * step;
      if (star.x < -2) star.x = w + 2;
      if (star.y > h + 2) star.y = -2;

      const twinkle = 0.55 + 0.45 * Math.sin((now / 1000) * star.twinkleSpeed + star.twinklePhase);
      const alpha = star.baseAlpha * twinkle;
      this.ctx.beginPath();
      this.ctx.fillStyle = `rgba(255,255,255,${alpha.toFixed(2)})`;
      this.ctx.arc(star.x, star.y, star.radius, 0, Math.PI * 2);
      this.ctx.fill();

      // Occasional soft glow halo on brighter near-layer stars, for a
      // touch of extra sparkle without slowing every star down.
      if (star.layer === 2 && twinkle > 0.9) {
        this.ctx.beginPath();
        this.ctx.fillStyle = `rgba(180,200,255,${(alpha * 0.25).toFixed(2)})`;
        this.ctx.arc(star.x, star.y, star.radius * 3, 0, Math.PI * 2);
        this.ctx.fill();
      }
    });

    // Rare shooting stars streaking across.
    if (now > this._nextShootingStarAt) {
      this.shootingStars.push({
        x: Math.random() * w * 0.6 + w * 0.2,
        y: Math.random() * h * 0.3,
        vx: -(6 + Math.random() * 6),
        vy: 3 + Math.random() * 3,
        life: 0,
        maxLife: 40 + Math.random() * 20,
      });
      this._nextShootingStarAt = now + 3000 + Math.random() * 6000;
    }
    this.shootingStars = this.shootingStars.filter((s) => s.life < s.maxLife);
    this.shootingStars.forEach((s) => {
      s.x += s.vx * this.speed;
      s.y += s.vy * this.speed;
      s.life++;
      const fade = 1 - s.life / s.maxLife;
      const grad = this.ctx.createLinearGradient(s.x, s.y, s.x - s.vx * 4, s.y - s.vy * 4);
      grad.addColorStop(0, `rgba(255,255,255,${fade.toFixed(2)})`);
      grad.addColorStop(1, "rgba(255,255,255,0)");
      this.ctx.strokeStyle = grad;
      this.ctx.lineWidth = 2;
      this.ctx.beginPath();
      this.ctx.moveTo(s.x, s.y);
      this.ctx.lineTo(s.x - s.vx * 4, s.y - s.vy * 4);
      this.ctx.stroke();
    });
  }
}

// Expose globally for the browser/Tauri webview environment (no bundler,
// we work with plain <script> tags) - same pattern as window.MatrixRain.
window.GalaxyBackground = GalaxyBackground;

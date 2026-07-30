// Animated "Team Spirit" mono-tactical canvas background effect.
// Purely a visual decoration - it has nothing to do with any data
// collection or the CS2 process, it only ever runs on our own window's
// <canvas> element. Same architecture as matrix-bg.js's MatrixRain /
// galaxy-bg.js's GalaxyBackground / cyberpunk-bg.js's CyberpunkBackground
// (a small, dependency-free class with start()/stop()/updateOptions()),
// so it plugs into settings-store.js `applyBackground()` the same way.
//
// Effect: a monochrome, black/white "tactical HUD" panel - a slowly
// shifting duotone split, faint vertical radar lines, a centered rotating
// radar sweep with two rings around the Team Spirit logo (glowing softly,
// pulsing), drifting dust particles, and an occasional white "glitch"
// flash line - evoking the reference mono-tactical design.
class TeamSpiritBackground {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.speed = 1;
    this.running = false;
    this.dust = [];
    this._flashes = [];
    this._nextFlashAt = 0;
    this._logoImg = null;
    this._logoReady = false;
    this._loadLogo();
    this._onResize = this._onResize.bind(this);
    this._tick = this._tick.bind(this);
  }

  /** Loads the Team Spirit logo once (shared across instances would be nicer, but this stays simple/self-contained like the other background classes). Draw calls silently no-op the logo until it's decoded. */
  _loadLogo() {
    const img = new Image();
    img.onload = () => {
      this._logoImg = img;
      this._logoReady = true;
    };
    img.onerror = () => {
      console.warn("TeamSpiritBackground: failed to load the Team Spirit logo asset.");
    };
    img.src = "assets/team-logos/team-spirit-logo.webp";
  }

  _onResize() {
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = this.canvas.clientWidth * dpr;
    this.canvas.height = this.canvas.clientHeight * dpr;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this._initDust();
  }

  _initDust() {
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    const count = Math.max(30, Math.round((w * h) / 22000));
    this.dust = [];
    for (let i = 0; i < count; i++) {
      this.dust.push(this._spawnDust(w, h));
    }
  }

  _spawnDust(w, h, fromBottom = false) {
    return {
      x: Math.random() * w,
      y: fromBottom ? h + 10 : Math.random() * h,
      size: 0.6 + Math.random() * 1.5,
      speed: 0.08 + Math.random() * 0.22,
      drift: (Math.random() - 0.5) * 0.22,
      alpha: 0.08 + Math.random() * 0.16,
    };
  }

  start(options = {}) {
    if (options.speed !== undefined) this.speed = options.speed;
    window.addEventListener("resize", this._onResize);
    this._onResize();
    this.running = true;
    this._lastFrame = performance.now();
    this._nextFlashAt = this._lastFrame + 1800 + Math.random() * 2500;
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

    // --- Base near-black fill ---
    ctx.fillStyle = "#050505";
    ctx.fillRect(0, 0, w, h);

    // --- Slowly-shifting light duotone split panel (right side) ---
    const cyclePos = (Math.sin((now / 1000) * this.speed * 0.1) + 1) / 2; // 0..1, ~10s cycle
    const topX = w * (0.58 + cyclePos * 0.06); // 58% -> 64%
    const botX = w * (0.46 + cyclePos * 0.06); // 46% -> 52%
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(topX, 0);
    ctx.lineTo(w, 0);
    ctx.lineTo(w, h);
    ctx.lineTo(botX, h);
    ctx.closePath();
    ctx.fillStyle = "rgba(242, 242, 242, 0.94)";
    ctx.fill();
    ctx.restore();

    // --- Faint vertical radar lines across the whole canvas ---
    ctx.save();
    ctx.strokeStyle = "rgba(255,255,255,0.025)";
    ctx.lineWidth = 1;
    for (let x = 0; x < w; x += 90) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    ctx.restore();

    // --- Centered emblem: rings + rotating sweep + Team Spirit logo ---
    const cx = w / 2;
    const cy = h / 2;
    const emblemRadius = Math.min(w, h) * 0.16;

    ctx.save();
    ctx.strokeStyle = "rgba(255,255,255,0.18)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, emblemRadius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = "rgba(255,255,255,0.1)";
    ctx.beginPath();
    ctx.arc(cx, cy, emblemRadius * 0.83, 0, Math.PI * 2);
    ctx.stroke();

    // Rotating radar sweep line (one full turn every ~6s).
    const sweepAngle = ((now / 6000) * this.speed * Math.PI * 2) % (Math.PI * 2);
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(sweepAngle);
    const sweepGrad = ctx.createLinearGradient(0, 0, emblemRadius, 0);
    sweepGrad.addColorStop(0, "rgba(255,255,255,0.9)");
    sweepGrad.addColorStop(1, "rgba(255,255,255,0)");
    ctx.strokeStyle = sweepGrad;
    ctx.lineWidth = 2;
    ctx.shadowColor = "rgba(255,255,255,0.5)";
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(emblemRadius, 0);
    ctx.stroke();
    ctx.restore();

    // Pulsing white glow halo behind the logo (keeps the mark visible
    // whether the emblem currently sits over the dark or the light side
    // of the shifting split panel above), then the logo itself on top,
    // exactly as provided (no recoloring).
    const glowPulse = 0.6 + 0.4 * Math.sin(now / 2000);
    const haloRadius = emblemRadius * 0.78;
    const halo = ctx.createRadialGradient(cx, cy, 0, cx, cy, haloRadius);
    halo.addColorStop(0, `rgba(255,255,255,${(0.5 * glowPulse).toFixed(2)})`);
    halo.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(cx, cy, haloRadius, 0, Math.PI * 2);
    ctx.fill();

    if (this._logoReady && this._logoImg) {
      const logoSize = emblemRadius * 1.1;
      const aspect = this._logoImg.width / this._logoImg.height;
      const drawW = aspect >= 1 ? logoSize : logoSize * aspect;
      const drawH = aspect >= 1 ? logoSize / aspect : logoSize;
      ctx.save();
      ctx.shadowColor = `rgba(255,255,255,${(0.55 * glowPulse).toFixed(2)})`;
      ctx.shadowBlur = 18 * glowPulse;
      ctx.drawImage(this._logoImg, cx - drawW / 2, cy - drawH / 2, drawW, drawH);
      ctx.restore();
    }
    ctx.restore();

    // --- Drifting dust particles (screen-blended, subtle) ---
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    this.dust.forEach((p) => {
      ctx.globalAlpha = p.alpha;
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
      p.y -= p.speed * step;
      p.x += p.drift * step;
      if (p.y < -10) Object.assign(p, this._spawnDust(w, h, true));
    });
    ctx.restore();

    // --- Faint grain texture (cheap approximation of the reference's SVG turbulence) ---
    ctx.save();
    ctx.globalAlpha = 0.035;
    ctx.fillStyle = "#ffffff";
    for (let i = 0; i < 60; i++) {
      ctx.fillRect(Math.random() * w, Math.random() * h, 1, 1);
    }
    ctx.restore();

    // --- Occasional horizontal "glitch" flash line ---
    if (now > this._nextFlashAt) {
      this._flashes.push({ y: Math.random() * h, life: 0, maxLife: 16 });
      this._nextFlashAt = now + 2500 + Math.random() * 4000;
    }
    this._flashes = this._flashes.filter((f) => f.life < f.maxLife);
    this._flashes.forEach((f) => {
      f.life++;
      const t = f.life / f.maxLife;
      const alpha = Math.sin(t * Math.PI) * 0.8;
      ctx.save();
      ctx.globalAlpha = Math.max(0, alpha);
      ctx.fillStyle = "rgba(255,255,255,0.9)";
      ctx.fillRect(0, f.y, w, 2);
      ctx.restore();
    });

    // --- Vignette ---
    const vignette = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.32, w / 2, h / 2, Math.max(w, h) * 0.72);
    vignette.addColorStop(0, "rgba(5,5,5,0)");
    vignette.addColorStop(1, "rgba(5,5,5,0.75)");
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, w, h);
  }
}

// Expose globally for the browser/Tauri webview environment (no bundler,
// we work with plain <script> tags) - same pattern as window.MatrixRain /
// window.GalaxyBackground / window.CyberpunkBackground.
window.TeamSpiritBackground = TeamSpiritBackground;

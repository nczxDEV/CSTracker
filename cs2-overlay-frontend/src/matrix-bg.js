// Matrix-style "digital rain" canvas background effect.
// Purely a visual decoration - it has nothing to do with any data
// collection or the CS2 process, it only ever runs on our own window's
// <canvas> element.
class MatrixRain {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.columns = 0;
    this.drops = [];
    this.fontSize = 15;
    this.color = "#22c55e";
    this.speed = 1;
    this.density = 1;
    this.running = false;
    this.chars = "アイウエオカキクケコサシスセソ0123456789ABCDEF@#$%&";
    this._onResize = this._onResize.bind(this);
    this._tick = this._tick.bind(this);
  }

  _onResize() {
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = this.canvas.clientWidth * dpr;
    this.canvas.height = this.canvas.clientHeight * dpr;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.columns = Math.ceil(this.canvas.clientWidth / this.fontSize);
    this.drops = new Array(this.columns).fill(0).map(() => Math.random() * -50);
  }

  start(options = {}) {
    if (options.color) this.color = options.color;
    if (options.speed) this.speed = options.speed;
    if (options.density) this.density = options.density;

    window.addEventListener("resize", this._onResize);
    this._onResize();
    this.running = true;
    this._lastFrame = performance.now();
    this._raf = requestAnimationFrame(this._tick);
  }

  updateOptions(options = {}) {
    if (options.color) this.color = options.color;
    if (options.speed !== undefined) this.speed = options.speed;
    if (options.density !== undefined) this.density = options.density;
  }

  stop() {
    this.running = false;
    if (this._raf) cancelAnimationFrame(this._raf);
    window.removeEventListener("resize", this._onResize);
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  _tick(now) {
    if (!this.running) return;
    const elapsed = now - (this._lastFrame || now);
    const frameInterval = 50 / Math.max(0.2, this.speed);

    if (elapsed > frameInterval) {
      this._lastFrame = now;
      this._draw();
    }
    this._raf = requestAnimationFrame(this._tick);
  }

  _draw() {
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;

    // slightly transparent black layer -> "fading trail" effect
    this.ctx.fillStyle = "rgba(5, 7, 10, 0.15)";
    this.ctx.fillRect(0, 0, w, h);

    this.ctx.fillStyle = this.color;
    this.ctx.font = `${this.fontSize}px monospace`;

    for (let i = 0; i < this.drops.length; i++) {
      if (Math.random() > this.density * 0.985) continue;
      const char = this.chars[Math.floor(Math.random() * this.chars.length)];
      const x = i * this.fontSize;
      const y = this.drops[i] * this.fontSize;
      this.ctx.fillText(char, x, y);

      if (y > h && Math.random() > 0.975) {
        this.drops[i] = 0;
      }
      this.drops[i]++;
    }
  }
}

// Expose globally for the browser/Tauri webview environment (no bundler,
// we work with plain <script> tags).
window.MatrixRain = MatrixRain;

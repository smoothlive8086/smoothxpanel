/**
 * SMOOTH x HOST - High-Performance Real-Time Canvas Charts
 */

class LiveChart {
  constructor(canvasId, options = {}) {
    this.canvas = document.getElementById(canvasId);
    if (!this.canvas) return;
    this.ctx = this.canvas.getContext('2d');
    this.color = options.color || '#00e5ff';
    this.fillColor = options.fillColor || 'rgba(0, 229, 255, 0.15)';
    this.maxPoints = options.maxPoints || 30;
    this.data = new Array(this.maxPoints).fill(0);
    this.maxValue = options.maxValue || 100;
    this.autoScale = options.autoScale !== undefined ? options.autoScale : false;

    this.setupResolution();
    this.render();
  }

  setupResolution() {
    if (!this.canvas) return;
    const rect = this.canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = (rect.width || 280) * dpr;
    this.canvas.height = (rect.height || 50) * dpr;
    this.ctx.scale(dpr, dpr);
    this.width = rect.width || 280;
    this.height = rect.height || 50;
  }

  push(val) {
    this.data.push(val);
    if (this.data.length > this.maxPoints) {
      this.data.shift();
    }
    this.render();
  }

  render() {
    if (!this.canvas || !this.ctx) return;
    const ctx = this.ctx;
    const w = this.width;
    const h = this.height;

    ctx.clearRect(0, 0, w, h);

    const max = this.autoScale
      ? Math.max(...this.data, 1) * 1.2
      : this.maxValue;

    const step = w / (this.maxPoints - 1);

    // Draw subtle grid lines
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, h * 0.5);
    ctx.lineTo(w, h * 0.5);
    ctx.stroke();

    // Line path
    ctx.beginPath();
    this.data.forEach((val, i) => {
      const x = i * step;
      const normalized = Math.min(val / max, 1);
      const y = h - (normalized * (h - 6)) - 3;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });

    // Stroke line
    ctx.strokeStyle = this.color;
    ctx.lineWidth = 2;
    ctx.shadowColor = this.color;
    ctx.shadowBlur = 6;
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Fill under path
    ctx.lineTo(w, h);
    ctx.lineTo(0, h);
    ctx.closePath();

    const gradient = ctx.createLinearGradient(0, 0, 0, h);
    gradient.addColorStop(0, this.fillColor);
    gradient.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = gradient;
    ctx.fill();
  }
}

window.LiveChart = LiveChart;

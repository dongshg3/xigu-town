import fs from 'node:fs';
let r = fs.readFileSync('src/render.js','utf8');

// 引入手感层
if (!r.includes("from './juice.js'")) {
  r = r.replace("import * as art from './art.js';", "import * as art from './art.js';\nimport { shakeOffset, decay } from './juice.js';");
}

r = r.replace(`  render(sim, state = {}) {
    const ctx = this.ctx;
    this.time = performance.now() / 1000;
    ctx.clearRect(0, 0, this.w, this.h);

    this.drawTiles(sim);`,
`  render(sim, state = {}) {
    const ctx = this.ctx;
    this.time = performance.now() / 1000;
    const dt = this._last ? Math.min(0.1, this.time - this._last) : 0;
    this._last = this.time;
    decay(dt);
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.w, this.h);

    // 震动只作用于世界层，UI 与夜色保持稳定
    const sh = shakeOffset();
    ctx.save();
    ctx.translate(sh.x, sh.y);

    this.drawTiles(sim);`);

r = r.replace(`    this.drawWeather(sim);
    this.drawNight(sim);
    this.drawOverlay(sim, state);
  }`,
`    this.drawWeather(sim);
    ctx.restore();

    this.drawNight(sim);
    this.drawOverlay(sim, state);
  }`);
fs.writeFileSync('src/render.js', r, 'utf8');
console.log('shake wired');
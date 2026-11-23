import fs from 'node:fs';
let r = fs.readFileSync('src/render.js','utf8');

// 1) 相机字段
r = r.replace("    this.ctx.scale(this.dpr, this.dpr);",
`    this.ctx.scale(this.dpr, this.dpr);
    this.cam = { x: 0, y: 0, zoom: 1 };`);

// 2) render 里应用相机
r = r.replace(`    const sh = shakeOffset();
    ctx.save();
    ctx.translate(sh.x, sh.y);

    this.drawTiles(sim);`,
`    const sh = shakeOffset();
    const cam = this.cam;
    ctx.save();
    ctx.translate(sh.x, sh.y);
    ctx.translate(-cam.x * cam.zoom, -cam.y * cam.zoom);
    ctx.scale(cam.zoom, cam.zoom);

    this.drawTiles(sim);`);

// 3) 夜色/遮罩留在相机内（世界坐标），保证 hover 卡片不被夜色压暗
r = r.replace(`    this.drawWeather(sim);
    ctx.restore();

    this.drawNight(sim);
    this.drawOverlay(sim, state);`,
`    this.drawWeather(sim);
    this.drawNight(sim);
    this.drawOverlay(sim, state);
    ctx.restore();`);

// 4) pickTile 反算相机
r = r.replace(`    const px = ((clientX - rect.left) / rect.width) * this.w;
    const py = ((clientY - rect.top) / rect.height) * this.h;
    return { x: Math.floor(px / TS), y: Math.floor(py / TS) };`,
`    const px = ((clientX - rect.left) / rect.width) * this.w;
    const py = ((clientY - rect.top) / rect.height) * this.h;
    const wx = (px / this.cam.zoom) + this.cam.x;
    const wy = (py / this.cam.zoom) + this.cam.y;
    return { x: Math.floor(wx / TS), y: Math.floor(wy / TS), wx, wy };`);

// 5) 相机控制方法
r = r.replace(`  render(sim, state = {}) {`,
`  clampCam() {
    const viewW = this.w / this.cam.zoom;
    const viewH = this.h / this.cam.zoom;
    const maxX = Math.max(0, this.w - viewW);
    const maxY = Math.max(0, this.h - viewH);
    this.cam.x = Math.min(maxX, Math.max(0, this.cam.x));
    this.cam.y = Math.min(maxY, Math.max(0, this.cam.y));
  }

  zoomAt(delta, clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    const px = ((clientX - rect.left) / rect.width) * this.w;
    const py = ((clientY - rect.top) / rect.height) * this.h;
    const wx = (px / this.cam.zoom) + this.cam.x;
    const wy = (py / this.cam.zoom) + this.cam.y;
    const next = Math.min(2.6, Math.max(1, this.cam.zoom * (1 + delta)));
    this.cam.zoom = next;
    this.cam.x = wx - px / next;
    this.cam.y = wy - py / next;
    this.clampCam();
    return next;
  }

  panBy(dx, dy) {
    this.cam.x += dx / this.cam.zoom;
    this.cam.y += dy / this.cam.zoom;
    this.clampCam();
  }

  centerOn(tx, ty) {
    this.cam.x = tx * TS - this.w / (2 * this.cam.zoom);
    this.cam.y = ty * TS - this.h / (2 * this.cam.zoom);
    this.clampCam();
  }

  render(sim, state = {}) {`);
fs.writeFileSync('src/render.js', r, 'utf8');
console.log('camera added');
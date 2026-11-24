// debug/perf.js — 性能面板（性能方案 §11）：帧耗时、模拟/渲染拆分、LOD 分层、
// 寻路队列、对象池命中率。F3 切换。只读观测，不参与模拟，不消耗 rng。
// window.__perf 暴露给自动化验证（CDP 可取 snapshot()）。
export class PerfMonitor {
  constructor(getSim) {
    this.getSim = getSim;
    this.simMs = [];       // 最近若干帧的模拟耗时
    this.renderMs = [];    // 最近若干帧的渲染耗时
    this.frames = 0;
    this.fps = 0;
    this._fpsAt = 0;
    this._lastT = 0;
    this.visible = false;
    this.el = null;
    this._paintAt = 0;
  }

  toggle() {
    this.visible = !this.visible;
    if (this.visible && !this.el) this._build();
    if (this.el) this.el.style.display = this.visible ? 'block' : 'none';
  }

  _build() {
    const el = document.createElement('div');
    el.id = 'perfOverlay';
    el.style.cssText = [
      'position:fixed', 'top:8px', 'left:8px', 'z-index:9999',
      'background:rgba(12,16,20,.88)', 'color:#cfe3b8',
      'font:11px/1.55 "Consolas","Microsoft YaHei",monospace',
      'padding:8px 10px', 'border-radius:8px', 'pointer-events:none',
      'white-space:pre', 'border:1px solid rgba(160,200,140,.25)',
    ].join(';');
    document.body.appendChild(el);
    this.el = el;
  }

  static avg(arr) {
    if (!arr.length) return 0;
    let s = 0;
    for (const v of arr) s += v;
    return s / arr.length;
  }

  static peak(arr) {
    let m = 0;
    for (const v of arr) if (v > m) m = v;
    return m;
  }

  // 每帧调用：simMs = 本帧模拟总耗时，renderMs = 渲染耗时
  frame(simMs, renderMs) {
    const now = performance.now();
    if (this._lastT) {
      this.frames++;
      if (now - this._fpsAt >= 500) {
        this.fps = Math.round((this.frames * 1000) / (now - this._fpsAt));
        this.frames = 0;
        this._fpsAt = now;
      }
    } else {
      this._fpsAt = now;
    }
    this._lastT = now;
    this.simMs.push(simMs);
    this.renderMs.push(renderMs);
    if (this.simMs.length > 120) this.simMs.shift();
    if (this.renderMs.length > 120) this.renderMs.shift();
    if (this.visible && now - this._paintAt > 250) {
      this._paintAt = now;
      this._paint();
    }
  }

  snapshot() {
    const sim = this.getSim();
    const lodCounts = sim?.lod ? sim.lod.counts() : [0, 0, 0, 0];
    return {
      fps: this.fps,
      simAvg: +PerfMonitor.avg(this.simMs).toFixed(2),
      simPeak: +PerfMonitor.peak(this.simMs).toFixed(2),
      renderAvg: +PerfMonitor.avg(this.renderMs).toFixed(2),
      renderPeak: +PerfMonitor.peak(this.renderMs).toFixed(2),
      npcs: sim?.npcs.length ?? 0,
      lodEnabled: !!sim?.lod?.enabled,
      lod: lodCounts,
      pathQueue: sim?.pathq?.length ?? 0,
      pathServed: sim?.pathq?.served ?? 0,
      pathDropped: sim?.pathq?.dropped ?? 0,
      effectPoolHit: +(sim?.effectPool?.hitRate ?? 1).toFixed(2),
      effects: sim?.effects.length ?? 0,
    };
  }

  _paint() {
    if (!this.el) return;
    const s = this.snapshot();
    this.el.textContent =
      `fps ${s.fps}   模拟 ${s.simAvg}ms (峰 ${s.simPeak})   渲染 ${s.renderAvg}ms (峰 ${s.renderPeak})\n` +
      `居民 ${s.npcs}   LOD ${s.lodEnabled ? '开' : '关'}  分层 ${s.lod.join('/')}\n` +
      `寻路队列 ${s.pathQueue}  已服务 ${s.pathServed}  丢弃 ${s.pathDropped}\n` +
      `飘字 ${s.effects}  池命中 ${Math.round(s.effectPoolHit * 100)}%`;
  }
}

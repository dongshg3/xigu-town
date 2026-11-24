// core/pool.js — 通用对象池（性能方案 §7：避免每帧 new/GC）。
// 命中率的统计给调试面板用；池空时回退到 create()，永不失败。
export class Pool {
  constructor(create, reset = null) {
    this.create = create;
    this.reset = reset;
    this.free = [];
    this.hits = 0;      // 复用次数
    this.misses = 0;    // 新建次数
  }

  take() {
    const o = this.free.pop();
    if (o) { this.hits++; return o; }
    this.misses++;
    return this.create();
  }

  give(o) {
    if (this.reset) this.reset(o);
    this.free.push(o);
  }

  get hitRate() {
    const total = this.hits + this.misses;
    return total ? this.hits / total : 1;
  }
}

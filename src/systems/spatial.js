// systems/spatial.js — 空间哈希索引（性能方案 §8：交互点与实体扫描优化）。
// 把 NPC/交互点按格子分桶，半径查询只扫邻近 9 宫格，不再全表 O(n)。
// 注意：只用于「集合筛选」，排序与平局裁决仍由调用方按原规则做（行为一致性）。
export class SpatialHash {
  constructor(cellSize = 4) {
    this.cell = cellSize;
    this.buckets = new Map();   // key -> array
  }

  key(x, y) {
    return ((Math.floor(x / this.cell) + 2048) << 12) | (Math.floor(y / this.cell) + 2048);
  }

  clear() { this.buckets.clear(); }

  insert(item, x, y) {
    const k = this.key(x, y);
    let arr = this.buckets.get(k);
    if (!arr) { arr = []; this.buckets.set(k, arr); }
    arr.push(item);
  }

  // 用实体列表重建（每 tick 一次，O(n)）
  rebuild(items, getXY = (it) => [it.x, it.y]) {
    this.clear();
    for (const it of items) {
      const [x, y] = getXY(it);
      this.insert(it, x, y);
    }
  }

  // 半径查询：返回候选集合（顺序按桶序，调用方自行排序/裁决）
  queryRadius(x, y, r) {
    const out = [];
    const c = this.cell;
    const x0 = Math.floor((x - r) / c), x1 = Math.floor((x + r) / c);
    const y0 = Math.floor((y - r) / c), y1 = Math.floor((y + r) / c);
    const r2 = r * r;
    for (let gx = x0; gx <= x1; gx++) {
      for (let gy = y0; gy <= y1; gy++) {
        const arr = this.buckets.get(((gx + 2048) << 12) | (gy + 2048));
        if (!arr) continue;
        for (const it of arr) {
          const dx = it.x - x, dy = it.y - y;
          if (dx * dx + dy * dy <= r2) out.push(it);
        }
      }
    }
    return out;
  }
}

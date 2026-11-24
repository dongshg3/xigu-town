// character/memory.js — 记忆库（架构 §10：来源/情感强度/衰减/遗忘）。
// 规则（与旧实现一致）：
//   - 同文同 kind 的重复事件只刷新时间与强度，不新增条目
//   - 每 tick 强度 ×0.9986 缓慢遗忘
//   - 超过 36 条按强度裁剪到 30 条
export class MemoryStore {
  constructor(owner) {
    this.owner = owner;   // NPC：取 simTick 用
    this.items = [];
  }

  get tick() { return this.owner.simTick ?? 0; }

  add(mem) {
    const dup = this.items.find((m) => m.text === mem.text && m.kind === (mem.kind || 'life'));
    if (dup) {
      dup.tick = this.tick;
      dup.strength = Math.min(1, Math.max(dup.strength, mem.strength ?? 0.7) + 0.05);
      return;
    }
    this.items.push({ tick: this.tick, strength: 0.7, valence: 0, kind: 'life', about: [], ...mem });
    if (this.items.length > 36) {
      this.items.sort((a, b) => b.strength - a.strength * 0.9);
      this.items = this.items.slice(0, 30);
    }
  }

  decay() {
    for (const m of this.items) m.strength *= 0.9986;
  }

  top(n = 6) {
    return this.items.slice().sort((a, b) => b.strength - a.strength).slice(0, n);
  }

  // 对心情的贡献（valence×strength 加总，上下限在 mood.js 里夹）
  moodContribution() {
    let mem = 0;
    for (const m of this.items) mem += m.valence * m.strength * 0.8;
    return mem;
  }
}

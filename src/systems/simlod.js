// systems/simlod.js — 模拟 LOD（性能方案 §2：全模拟/简化/统计/休眠）。
// 规则：
//   - 居民数 ≤ 24：全员全模拟（旧行为，逐刻更新，调参测试的基线不变）
//   - 超过阈值启用四级：tier0 近（≤14 格）每刻；tier1 中（≤28）每 2 刻；
//     tier2 远每 4 刻；tier3 休眠（远处睡觉）每 8 刻
//   - 降频时 dt 按步长放大：需求衰减/记忆衰减/动作倒计时都按 dt 缩放，
//     恢复全模拟时状态一致（无跳变）
//   - 相位用 id 散列取模，避免全员同一刻齐步更新造成尖峰；全程无 rng，可复现
export const LOD_THRESHOLD = 24;
export const LOD_STRIDES = [1, 2, 4, 8];

function idPhase(id) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export class SimulationLODService {
  constructor(sim) {
    this.sim = sim;
    this.tiers = new Map();
    this.enabled = false;
    this.assignAt = -999;
  }

  refresh() {
    const sim = this.sim;
    this.enabled = sim.npcs.length > LOD_THRESHOLD;
    if (!this.enabled) return;
    // 每 10 刻或人数变化时重分一次层
    if (sim.tick - this.assignAt < 10 && this.tiers.size === sim.npcs.length) return;
    this.assignAt = sim.tick;
    const p = sim.player;
    for (const n of sim.npcs) {
      // 危机晋升：饿/困到危险线或生病的居民永远全速模拟——LOD 不许杀人
      if (n.needs.hunger < 36 || n.needs.energy < 20 || n.sick) {
        this.tiers.set(n.id, 0);
        continue;
      }
      const d = Math.hypot(n.x - p.x, n.y - p.y);
      let tier = d <= 14 ? 0 : d <= 28 ? 1 : 2;
      if (tier === 2 && (n.act?.id === 'sleep' || n.sleeping)) tier = 3;
      this.tiers.set(n.id, tier);
    }
  }

  tierOf(npc) {
    if (!this.enabled) return 0;
    return this.tiers.get(npc.id) ?? 0;
  }

  strideOf(npc) {
    return LOD_STRIDES[this.tierOf(npc)];
  }

  // 本 tick 该不该更新这个 NPC
  due(npc, tick) {
    if (!this.enabled) return true;
    const s = this.strideOf(npc);
    if (s === 1) return true;
    return tick % s === idPhase(npc.id) % s;
  }

  counts() {
    const c = [0, 0, 0, 0];
    if (this.enabled) for (const t of this.tiers.values()) c[t]++;
    else c[0] = this.sim.npcs.length;
    return c;
  }
}

// systems/pathqueue.js — 寻路请求队列（性能方案 §5：时间切片）。
// LOD 启用时，NPC 的 goto 不再同步 A*，而是进队列；每 tick 按预算结算若干条。
// 优先级：tier0（玩家附近）优先，其余 FIFO；预算内没排到的下一 tick 继续。
// LOD 关闭（≤24 人）时完全走旧同步路径——调参行为基线不变。
export class PathRequestQueue {
  constructor(budget = 8) {
    this.budget = budget;
    this.pending = [];          // { npc, tx, ty, tier }
    this.served = 0;            // 累计服务数（调试面板）
    this.dropped = 0;
  }

  get length() { return this.pending.length; }

  clear() { this.pending.length = 0; }

  submit(npc, tx, ty, tier = 0) {
    // 同一 NPC 只保留最新一条请求（重复提交 = 目标变了）
    const old = this.pending.findIndex((r) => r.npc === npc);
    if (old >= 0) this.pending.splice(old, 1);
    this.pending.push({ npc, tx, ty, tier });
    this.pending.sort((a, b) => a.tier - b.tier);
    // 队列爆了丢最尾（最低优先级），NPC 超时后会重新提交（bt.js 防软锁）
    if (this.pending.length > 128) { this.pending.pop(); this.dropped++; }
  }

  // 每 tick 末结算：结果写回 npc._pq。预算随规模抬升（200 人早高峰需求 ~25 条/刻）
  process(sim) {
    const budget = Math.max(this.budget, Math.ceil(sim.npcs.length / 8));
    let n = 0;
    while (this.pending.length && n < budget) {
      const req = this.pending.shift();
      const p = sim.world.findPath(Math.round(req.npc.x), Math.round(req.npc.y), req.tx, req.ty);
      req.npc._pq = { done: true, path: p, tx: req.tx, ty: req.ty };
      n++;
      this.served++;
    }
  }
}

// systems/interactions.js — 交互点系统（架构 §6：占用/预约/队列/中断恢复）。
// 交互点 = 世界里可被占用的位置：床、长椅、池塘钓位、施工点、工作点、学堂。
// 规则：
//   - 容量 cap：床 2（同床伴侣）、长椅 2、钓位 1、施工 2、工作点 1、学堂 6、田地 3
//   - claim 成功占用；满了进队（最多 3 人排队）；队也满 → 'full'
//   - 占用与队列是运行时状态，不进存档；读档后重建，NPC 下个动作自然重新认领
//   - 一切释放都走 releaseAll(npc)：finishAct / failPlan / 中断，绝不泄漏
export const IX_CAP = { bed: 2, bench: 2, pond: 1, build: 2, work: 1, school: 6, farm: 3 };
export const IX_QUEUE_MAX = 3;

// 动作 id → 交互点 kind（没列出的动作不占点：聊天、吃饭、看风景等）
export const ACT_POINT_KIND = {
  sleep: 'bed',
  relax: 'any:bench,pond',
  fish: 'pond',
  build: 'build',
  work: 'any:work,farm',
  serve: 'work', treat: 'work', paint: 'work', trade: 'work',
  study: 'school',
};

function pt(id, kind, x, y, cap) {
  return { id, kind, x, y, cap: cap ?? IX_CAP[kind] ?? 1, occ: [], queue: [] };
}

// 从世界状态重建交互点登记表；已存在的点保留占用/队列
export function ensureInteractions(sim) {
  if (!sim.ix) sim.ix = { points: new Map() };
  const pts = sim.ix.points;
  const seen = new Set();
  const w = sim.world;
  // 规模抽象（性能方案 MVP3）：超过 50 人后，工作/田地/钓位/学堂按「人人有位」
  // 抽象扩容（床早已如此：容量=登记住户数）。否则 200 人抢 1 个工作台，
  // 全天「地方被占着」→ 计划空转 → 寻路队列爆 → 集体挨饿。
  // ≤50 人 everyone=false：一切容量旧值，调参基线与社交排队质感都不变。
  const scale = Math.max(1, Math.ceil(sim.npcs.length / 50));
  const everyone = scale >= 2;
  const workersAt = (name) => sim.npcs.filter((n) => n.profile?.work === name).length;
  const farmers = () => sim.npcs.filter((n) => n.job === 'farmer').length;
  const fishers = () => sim.npcs.filter((n) => n.job === 'fisher').length;

  const put = (point) => {
    seen.add(point.id);
    const ex = pts.get(point.id);
    if (ex) { ex.x = point.x; ex.y = point.y; ex.cap = point.cap; return; }
    pts.set(point.id, point);
  };

  // 床：每栋住宅/小屋一个点；容量 = max(2, 登记住户数)，一屋人夜里不用排队睡觉
  for (const b of w.buildings) {
    if (b.type !== 'house' && b.type !== 'cottage') continue;
    const residents = sim.npcs.filter((n) => n.profile?.home === b.name).length;
    put(pt(`bed:${b.name}`, 'bed', b.spot.x, b.spot.y, Math.max(2, residents)));
  }
  // 工作点：有 spot 的功能建筑（住宅除外）
  for (const b of w.buildings) {
    if (b.type === 'house' || b.type === 'cottage') continue;
    if (b.name === '学堂') { put(pt(`school:${b.name}`, 'school', b.spot.x, b.spot.y, IX_CAP.school * scale)); continue; }
    const cap = everyone ? Math.max(IX_CAP.work * scale, workersAt(b.name)) : IX_CAP.work;
    put(pt(`work:${b.name}`, 'work', b.spot.x, b.spot.y, cap));
  }
  // 长椅
  for (const d of w.decor) {
    if (d.type !== 'bench') continue;
    put(pt(`bench:${d.x},${d.y}`, 'bench', d.x, d.y, IX_CAP.bench * scale));
  }
  // 池塘钓位
  const pondCap = everyone ? Math.max(IX_CAP.pond, Math.ceil(fishers() / Math.max(1, w.pondSpots.length))) : IX_CAP.pond;
  for (const p of w.pondSpots) put(pt(`pond:${p.x},${p.y}`, 'pond', p.x, p.y, pondCap));
  // 施工点（图纸在就有）
  for (const bp of w.blueprints) put(pt(`build:${bp.id}`, 'build', bp.x, bp.y, IX_CAP.build * scale));
  // 田地块（农夫集中劳作区）
  const farmCap = everyone ? Math.max(IX_CAP.farm * scale, farmers()) : IX_CAP.farm;
  put(pt('farm:field', 'farm', 16, 21, farmCap));

  // 移除已消失且无人占用的点（施工完成、装饰拆除）
  for (const [id, p] of pts) {
    if (!seen.has(id) && !p.occ.length && !p.queue.length) pts.delete(id);
  }
  return sim.ix;
}

export function claimPoint(point, npcId) {
  if (point.occ.includes(npcId)) return 'hold';
  if (point.occ.length < point.cap) {
    point.occ.push(npcId);
    point.queue = point.queue.filter((id) => id !== npcId);
    return 'ok';
  }
  if (point.queue.includes(npcId)) return 'queued';
  if (point.queue.length < IX_QUEUE_MAX) {
    point.queue.push(npcId);
    return 'queued';
  }
  return 'full';
}

export function releasePoint(point, npcId) {
  point.occ = point.occ.filter((id) => id !== npcId);
  point.queue = point.queue.filter((id) => id !== npcId);
}

// 释放某 NPC 占着的所有点（中断恢复的兜底）
export function releaseAll(sim, npcId) {
  if (!sim.ix) return;
  for (const p of sim.ix.points.values()) releasePoint(p, npcId);
}

// 找动作对应的交互点：build 按图纸 id 精确匹配，其余按 kind + 距离（2.6 格内最近）
export function pointForAct(sim, npc, step) {
  if (!sim.ix) return null;
  const kindSpec = ACT_POINT_KIND[step.id];
  if (!kindSpec) return null;
  if (step.id === 'build' && step.data?.bpId) {
    return sim.ix.points.get(`build:${step.data.bpId}`) || null;
  }
  const kinds = kindSpec.startsWith('any:') ? kindSpec.slice(4).split(',') : [kindSpec];
  // 床只认自己家（睡觉回错床就怪了）
  if (step.id === 'sleep') {
    const home = npc.profile?.home;
    if (home && sim.ix.points.has(`bed:${home}`)) return sim.ix.points.get(`bed:${home}`);
  }
  let best = null, bd = Infinity;
  for (const p of sim.ix.points.values()) {
    if (!kinds.includes(p.kind)) continue;
    const d = Math.hypot(p.x - npc.x, p.y - npc.y);
    if (d < bd && d <= 2.6) { bd = d; best = p; }
  }
  return best;
}

// 调试面板用：全镇占用快照
export function occupancySnapshot(sim) {
  if (!sim.ix) return [];
  const rows = [];
  for (const p of sim.ix.points.values()) {
    if (p.occ.length || p.queue.length) {
      rows.push({ id: p.id, kind: p.kind, x: p.x, y: p.y, occ: [...p.occ], queue: [...p.queue], cap: p.cap });
    }
  }
  return rows;
}

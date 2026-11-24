// character/rels.js — 关系簿（架构 §11：多维关系矩阵）。
// 八个维度：好感 affinity / 信任 trust / 熟悉 familiarity（旧三维，语义与默认值不变）
//           恐惧 fear / 尊重 respect / 亏欠 debt / 嫉妒 envy / 亲密 intimacy / 竞争 rivalry
// 未建交的关系按需创建默认值；读档进来的旧三维数据在这里补全新维度。
import { clamp } from '../core.js';

export const REL_DIMS = {
  affinity: 30, trust: 18, familiarity: 4,
  fear: 0, respect: 0, debt: 0, envy: 0, intimacy: 0, rivalry: 0,
};

export const REL_DIM_NAMES = {
  affinity: '好感', trust: '信任', familiarity: '熟悉',
  fear: '恐惧', respect: '尊重', debt: '亏欠', envy: '嫉妒', intimacy: '亲密', rivalry: '竞争',
};

export class RelationBook {
  constructor() {
    this.map = new Map();
  }

  get(id) {
    if (!this.map.has(id)) this.map.set(id, { ...REL_DIMS, lastTalk: -999 });
    const r = this.map.get(id);
    for (const [k, def] of Object.entries(REL_DIMS)) {
      if (!Number.isFinite(r[k])) r[k] = def;
    }
    return r;
  }
}

// 单维调整（0-100 夹取），返回新值；所有新维度的写入都走这里
export function bumpRel(rel, dim, delta) {
  if (!Number.isFinite(rel[dim])) rel[dim] = REL_DIMS[dim] ?? 0;
  rel[dim] = clamp(rel[dim] + delta, 0, 100);
  return rel[dim];
}

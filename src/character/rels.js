// character/rels.js — 关系簿（架构 §11 多维关系的落点；当前三维：好感/信任/熟悉）。
// 未建交的关系按需创建默认值；读档进来的脏数据在这里兜底。
export class RelationBook {
  constructor() {
    this.map = new Map();
  }

  get(id) {
    if (!this.map.has(id)) this.map.set(id, { affinity: 30, trust: 18, familiarity: 4, lastTalk: -999 });
    const r = this.map.get(id);
    if (!Number.isFinite(r.affinity)) r.affinity = 30;
    if (!Number.isFinite(r.trust)) r.trust = 18;
    if (!Number.isFinite(r.familiarity)) r.familiarity = 4;
    return r;
  }
}

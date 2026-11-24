// eventBus.js — 「一切值得一提的事都是事件」的地基（架构 §5）。
// 本步（迁移第 1 步）只引入机制，不改行为：
//   - sim.log() 现在同时 emit 一条 'log.line' 事件，日志订阅者照常写 logs[]
//   - flush 在 sim.step 末尾调用，订阅者同步收到本 tick 的事件
//   - replay 环形缓冲为后续回放功能积累素材，不进存档
// 阶段约定：'sim' 相订阅者先派发（可再产事件，限深 3 层），'present' 相后派发（只读）。

let seq = 0;

export class EventBus {
  constructor(sim) {
    this.sim = sim;
    this.queue = [];
    this.subscribers = [];
    this.replay = [];            // 环形缓冲
    this.replayCap = 5000;
    this.depth = 0;              // 事件链限深，防循环派发
    this.strict = false;         // 开发模式可开：未登记 kind 报警
    this.knownKinds = null;      // data/present/feedback.js 注入
  }

  // ev: { kind, actors?, targets?, location?, parentEventId?, cause?, data?, visibility?, severity? }
  emit(partial) {
    if (this.depth >= 3) return null;    // 限深：事件引发的事件最多 3 层
    const ev = {
      id: `e${this.sim.tick}_${(++seq).toString(36)}`,
      tick: this.sim.tick,
      actors: [],
      targets: [],
      visibility: 'public',
      severity: 0.2,
      ...partial,
    };
    if (this.strict && this.knownKinds && !this.knownKinds.has(ev.kind)) {
      console.warn(`[eventBus] 未登记的事件 kind：${ev.kind}（请在 data/present/feedback.js 登记）`);
    }
    this.queue.push(ev);
    this.replay.push(ev);
    if (this.replay.length > this.replayCap) this.replay.splice(0, this.replay.length - this.replayCap);
    return ev;
  }

  // phase: 'sim'（默认，先派发）| 'present'（后派发，只读）
  subscribe(filter, handler, opts = {}) {
    const sub = { filter, handler, phase: opts.phase || 'sim' };
    this.subscribers.push(sub);
    return () => { this.subscribers = this.subscribers.filter((s) => s !== sub); };
  }

  #dispatch(phase) {
    let guard = 0;
    // 模拟相订阅者可能再产事件：循环直到队列排空或限深
    while (guard++ < 32) {
      const batch = this.queue.splice(0);
      if (!batch.length) break;
      this.depth++;
      for (const ev of batch) {
        for (const sub of this.subscribers) {
          if (sub.phase !== phase) continue;
          try {
            if (sub.filter(ev)) sub.handler(ev, this.sim);
          } catch (err) {
            console.error(`[eventBus] 订阅者处理 ${ev.kind} 出错：`, err);
          }
        }
      }
      this.depth--;
      if (phase === 'present') break;    // 表现相只派一批，不允许级联
      if (this.depth >= 3) { this.queue.length = 0; break; }
    }
  }

  // sim.step 末尾调用
  flush() {
    this.#dispatch('sim');
    this.#dispatch('present');
    this.queue.length = 0;
  }

  // 因果链回溯（架构 §5.3）：沿 parentEventId 向上走
  causalChain(eventId) {
    const byId = new Map(this.replay.map((e) => [e.id, e]));
    const chain = [];
    let cur = byId.get(eventId);
    let guard = 0;
    while (cur && guard++ < 64) {
      chain.unshift(cur);
      cur = cur.parentEventId ? byId.get(cur.parentEventId) : null;
    }
    return chain;
  }
}

// agent.js — one resident: traits, needs, memory, relationships, plan execution.
import { clamp, clockOf } from './core.js';
import { orderPlan } from './orders.js';
import { getAction, actionLabel } from './actions/registry.js';

import { JOBS, BIAS } from './data.js';
import { ensureMind, noteHabit } from './learning.js';
import { mergeTraits } from './character/traits.js';
import { NeedsComponent } from './character/needs.js';
import { MemoryStore } from './character/memory.js';
import { RelationBook } from './character/rels.js';
import { computeMood, moodLabelOf, moodColorOf } from './character/mood.js';

// 外部（god.js）从这里拿 mergeTraits：保持旧导入路径可用
export { mergeTraits };

export class NPC {
  constructor(profile, world, sim) {
    this.sim = sim;
    ensureMind(this);
    this.id = profile.id;
    this.profile = profile;
    profile.bias = BIAS[profile.id] || {};
    this.name = profile.name;
    this.title = profile.title;
    this.age = profile.age;
    this.color = profile.color;
    this.job = profile.job;
    this.traits = profile.traits.slice();
    this.mods = mergeTraits(this.traits);
    this.values = { ...profile.values };
    this.skills = { ...profile.skills };
    this.coins = profile.coins;

    // 需求组件：初始随机化的调用顺序必须和旧版一致（确定性红线）
    this.needsComp = new NeedsComponent(sim.rng);

    const home = world.findBuilding(profile.home) || world.homeOf(profile.id);
    const spawn = home ? home.door : { x: 20, y: 15 };
    this.x = spawn.x + sim.rng.float(-0.25, 0.25);
    this.y = spawn.y + sim.rng.float(-0.25, 0.25);
    this.path = null;
    this.facing = 1;

    this.plan = [];
    this.stepIndex = 0;
    this.goalId = null;
    this.goalLabel = '';
    this.thought = '刚醒，还没想好今天要做什么。';
    this.act = null;
    this.sleeping = false;
    this.talking = null;
    this.lastPlanAt = -999;
    this.failCool = 0;

    this.inventory = { food: 1, seeds: 0 };
    this.speech = null;
    this.history = [];
    this.order = null;
    this.sex = profile.sex || 'n';
    this.age = profile.age ?? 30;
    this.health = 78 + Math.round((profile.traits?.length || 0) * 0.5);
    this.education = profile.education ?? 22;
    this.partner = null;
    this.children = [];
    this.nextGreetAt = 0;
    this.dir = 'down';
    // 记忆与关系组件：数据归组件，NPC 上用 getter/setter 别名保持旧字段访问不变
    this.memoryComp = new MemoryStore(this);
    this.beliefs = [];
    this.relsComp = new RelationBook();
    this.recentGain = 0;

    this.seedMemories(sim);
  }

  // —— 组件别名：外部代码（sim.js 存读档、social.js 等）照旧读写 needs/memory/rels ——
  get needs() { return this.needsComp.values; }
  set needs(v) { this.needsComp.values = v; }
  get memory() { return this.memoryComp.items; }
  set memory(v) { this.memoryComp.items = v; }
  get rels() { return this.relsComp.map; }
  set rels(m) { this.relsComp.map = m; }

  seedMemories(sim) {
    const p = this.profile;
    this.addMemory({ text: `${p.bio.split('。')[0]}。`, valence: 1, strength: 0.55, kind: 'identity' });
    this.addMemory({ text: `最近总在想：${p.desire}`, valence: 1, strength: 0.5, kind: 'desire' });
  }

  note(text, kind = 'act') {
    this.history.push({ t: this.sim?.tick ?? 0, kind, text });
    if (this.history.length > 60) this.history.shift();
  }

  rel(id) {
    return this.relsComp.get(id);
  }

  addMemory(mem) {
    this.memoryComp.add(mem);
  }

  topMemories(n = 6) {
    return this.memoryComp.top(n);
  }

  get mood() {
    return computeMood(this);
  }

  get moodLabel() {
    return moodLabelOf(this.mood);
  }

  get moodColor() {
    return moodColorOf(this.mood);
  }

  get hour() { return clockOf(this.simTick ?? 0).hour; }

  workWindowOpen(clock) {
    const job = JOBS[this.job];
    if (!job) return false;
    return job.windows.some(([a, b]) => clock.hour >= a && clock.hour < b);
  }

  inWorkWindow(clock) {
    return this.workWindowOpen(clock);
  }

  normalizeNeeds() {
    this.needsComp.normalize();
  }

  update(sim) {
    this.tickUpdate(sim);
    this.normalizeNeeds();
  }

  tickUpdate(sim) {
    if (!Array.isArray(this.plan)) this.plan = [];
    this.simTick = sim.tick;
    const dt = 1;
    const sleeping = this.act?.id === 'sleep';
    const n = this.needs;
    const w = sim.world;

    this.needsComp.decay(this.mods, sleeping);
    this.memoryComp.decay();
    if (this.failCool > 0) this.failCool--;

    if (this.act) {
      if (sleeping) {
        this.sleeping = true;
        if (n.energy >= 99.5 && clockOf(sim.tick).hour >= 6) {
          this.finishAct(sim);
        } else {
          this.act.ticks -= dt;
          if (this.act.ticks <= 0) this.finishAct(sim);
        }
      } else {
        this.act.ticks -= dt;
        if (this.act.ticks <= 0) this.finishAct(sim);
      }
      return;
    }
    this.sleeping = false;

    if (this.path && this.path.length) {
      this.moveAlongPath(sim);
      return;
    }

    if (!this.plan.length || this.stepIndex >= this.plan.length) {
      if (this.order) {
        const op = orderPlan(this, sim);
        if (op) {
          this.plan = op.steps;
          this.stepIndex = 0;
          this.goalId = "order";
          this.goalLabel = op.label;
          this.note("按旅人的话行动：" + op.label, "order");
        } else {
          this.order = null;
          this.plan = [];
          this.choosePlan(sim);
        }
      } else {
        this.choosePlan(sim);
      }
    }
    if (!this.plan.length) return;

    const step = this.plan[this.stepIndex];
    if (!step) { this.plan = []; return; }

    if (step.kind === 'goto') {
      if (this.x === step.x && this.y === step.y) { this.stepIndex++; return; }
      const p = w.findPath(Math.round(this.x), Math.round(this.y), step.x, step.y);
      if (!p || p.length === 0) {
        if (p && p.length === 0) { this.stepIndex++; return; }
        this.failPlan(sim, '路走不通');
        return;
      }
      this.path = p;
      this.moveAlongPath(sim);
    } else if (step.kind === 'act') {
      this.startAct(sim, step);
    } else {
      this.stepIndex++;
    }
  }

  moveAlongPath(sim) {
    if (!this.path || !this.path.length) { this.path = null; return; }
    let budget = 0.95 * this.mods.moveSpeed;
    while (budget > 0 && this.path.length) {
      const node = this.path[0];
      const dx = node.x - this.x;
      const dy = node.y - this.y;
      const d = Math.hypot(dx, dy);
      if (d <= budget) {
        this.x = node.x; this.y = node.y;
        budget -= d;
        this.path.shift();
      } else {
        this.x += (dx / d) * budget;
        this.y += (dy / d) * budget;
        if (Math.abs(dx) > 0.01 && Math.abs(dx) >= Math.abs(dy)) this.dir = dx > 0 ? 'right' : 'left';
        else if (Math.abs(dy) > 0.01) this.dir = dy > 0 ? 'down' : 'up';
        budget = 0;
      }
    }
    if (!this.path.length) {
      this.path = null;
      this.stepIndex++;
      if (this.stepIndex >= (this.plan ? this.plan.length : 0)) this.finishPlan(sim);
    }
  }

  startAct(sim, step) {
    if ((step.dur || 0) >= 4) this.note('开始' + (step.label || actionLabel(step.id) || step.id));
    if (step.id === 'chat') {
      const other = sim.npcById(step.data?.otherId);
      if (!other || Math.hypot(other.x - this.x, other.y - this.y) > 2.6) {
        this.failPlan(sim, '想找的人不在了');
        return;
      }
    }
    this.act = {
      id: step.id,
      ticks: step.dur ?? 2,
      total: step.dur ?? 2,
      data: step.data || {},
      label: step.label || '做事',
      source: step,
    };
    this.talking = step.id === 'chat' ? step.data?.otherId : null;
  }

  finishAct(sim) {
    if (this.plan) this.note('干完：' + (actionLabel(this.act?.id) || this.plan.label || '这件事'));
    const act = this.act;
    this.act = null;
    if (!act) return;
    this.applyEffect(sim, act);
    this.stepIndex++;
    if (this.stepIndex >= this.plan.length) this.finishPlan(sim);
  }

  needSum() {
    return this.needsComp.sum();
  }

  finishPlan(sim) {
    if (this._needSum != null) noteHabit(this, this.goalId, this.needSum() - this._needSum);
    this._needSum = null;
    this.plan = [];
    this.stepIndex = 0;
    this.goalId = null;
    this.goalLabel = '';
    this.talking = null;
  }

  failPlan(sim, why) {
    this.plan = [];
    this.stepIndex = 0;
    this.act = null;
    this.path = null;
    this.goalId = null;
    this.thought = why + '，得重新想想。';
    this.failCool = 3;
    if (this._needSum != null) noteHabit(this, this.goalId, (this.needSum() - this._needSum) * 0.5);
    this._needSum = null;
    this.addMemory({ text: why + '。', valence: -0.5, strength: 0.25, kind: 'obstacle' });
  }

  choosePlan(sim) {
    if (sim.tick - this.lastPlanAt < 2) return;
    this.lastPlanAt = sim.tick;
    const chosen = sim.pickPlan(this);
    if (!chosen) return;
    this.plan = chosen.plan;
    this.stepIndex = 0;
    this.goalId = chosen.goal;
    this._needSum = this.needSum();
    this.goalLabel = chosen.label;
    this.thought = chosen.thought;
  }

  // 效果结算委托给动作注册表（架构 §3）；未登记的动作安全落空
  applyEffect(sim, act) {
    const def = getAction(act.id);
    if (def) def.apply(this, sim, act);
    this.recentGain = 0;
  }

  planView() {
    return this.plan.map((s, i) => ({
      text: s.kind === 'goto' ? `前往 (${Math.round(s.x)}, ${Math.round(s.y)})` : (s.label || actionLabel(s.id) || s.id),
      now: i === this.stepIndex,
      done: i < this.stepIndex,
    }));
  }
}

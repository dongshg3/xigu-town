// agent.js — one resident: traits, needs, memory, relationships, plan execution.
import { clamp, clockOf } from './core.js';
import { orderPlan } from './orders.js';

const ACT_NAMES = {
  work: '上工', eat: '吃饭', buyMeal: '在酒馆吃饭', sleep: '睡觉', chat: '聊天',
  relax: '歇一会儿', fish: '钓鱼', paint: '画画', treat: '看病', serve: '招呼客人',
  trade: '做买卖', watch: '看着街上', look: '看了看四周', harvest: '收割', water: '浇水',
  plant: '播种', chop: '砍树', build: '盖房子', study: '听课', forage: '找吃的',
};
import { TRAITS, JOBS, BIAS } from './data.js';
import { ensureMind, noteHabit } from './learning.js';

const MULT_KEYS = new Set(['workSpeed', 'moveSpeed', 'buildSpeed', 'hungerMul', 'energyMul', 'socialMul', 'funMul', 'spend']);

const DEFAULT_MODS = {
  workSpeed: 1, moveSpeed: 1, buildSpeed: 1,
  hungerMul: 1, energyMul: 1, socialMul: 1, funMul: 1, spend: 1,
  chatBonus: 0, conflictBias: 0, gossipRate: 0, trustGain: 0,
  moodBase: 0, moodSwing: 1, diligence: 0, curiosity: 0, resolve: 0,
};

export function mergeTraits(traitIds) {
  const mods = { ...DEFAULT_MODS };
  for (const id of traitIds) {
    const t = TRAITS[id];
    if (!t) continue;
    for (const [k, v] of Object.entries(t.mods || {})) {
      if (MULT_KEYS.has(k)) mods[k] = (mods[k] ?? 1) * v;
      else mods[k] = (mods[k] ?? 0) + v;
    }
  }
  return mods;
}

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

    this.needs = {
      hunger: sim.rng.float(62, 84),
      energy: sim.rng.float(66, 86),
      social: sim.rng.float(45, 66),
      fun: sim.rng.float(42, 64),
      purpose: sim.rng.float(50, 70),
    };

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
    this.memory = [];
    this.beliefs = [];
    this.rels = new Map();
    this.recentGain = 0;

    this.seedMemories(sim);
  }

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
    if (!this.rels.has(id)) this.rels.set(id, { affinity: 30, trust: 18, familiarity: 4, lastTalk: -999 });
    const r = this.rels.get(id);
    if (!Number.isFinite(r.affinity)) r.affinity = 30;
    if (!Number.isFinite(r.trust)) r.trust = 18;
    if (!Number.isFinite(r.familiarity)) r.familiarity = 4;
    return r;
  }

  addMemory(mem) {
    // 同一件事反复发生（睡了一觉、吃了饭）不该占满记忆——
    // 刷新时间与强度，而不是再记一条。
    const dup = this.memory.find((m) => m.text === mem.text && m.kind === (mem.kind || 'life'));
    if (dup) {
      dup.tick = this.simTick ?? 0;
      dup.strength = Math.min(1, Math.max(dup.strength, mem.strength ?? 0.7) + 0.05);
      return;
    }
    this.memory.push({ tick: this.simTick ?? 0, strength: 0.7, valence: 0, kind: 'life', about: [], ...mem });
    if (this.memory.length > 36) {
      this.memory.sort((a, b) => b.strength - a.strength * 0.9);
      this.memory = this.memory.slice(0, 30);
    }
  }

  topMemories(n = 6) {
    return this.memory.slice().sort((a, b) => b.strength - a.strength).slice(0, n);
  }

  get mood() {
    const n = this.needs;
    let v = 40
      + (n.hunger - 50) * 0.20
      + (n.energy - 50) * 0.10
      + (n.social - 50) * 0.16
      + (n.fun - 50) * 0.16
      + (n.purpose - 50) * 0.10;
    v += this.mods.moodBase;
    // 长期底色：连着过得不好会往下沉，好日子会慢慢回来（learning.js）
    v += this.mind?.moodBase || 0;
    // The street you build is part of how the day feels.
    const beauty = this.sim?.world?.beauty?.() ?? 6;
    v += clamp((beauty - 6) * 0.9, -8, 8);
    let mem = 0;
    for (const m of this.memory) mem += m.valence * m.strength * 0.8;
    v += clamp(mem, -16, 12);
    return clamp(v, 0, 100);
  }

  get moodLabel() {
    const m = this.mood;
    if (m >= 78) return '心情很好';
    if (m >= 62) return '还算愉快';
    if (m >= 45) return '平静';
    if (m >= 30) return '有点烦躁';
    if (m >= 15) return '低落';
    return '快到极限了';
  }

  get moodColor() {
    const m = this.mood;
    if (m >= 70) return '#79b46a';
    if (m >= 50) return '#c8c46a';
    if (m >= 30) return '#d9a05a';
    return '#d9766a';
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
    const n = this.needs;
    for (const k of ['hunger', 'energy', 'social', 'fun', 'purpose']) n[k] = clamp(n[k], 0, 100);
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

    n.hunger = clamp(n.hunger - 0.30 * this.mods.hungerMul * (sleeping ? 0.45 : 1), 0, 100);
    n.energy = clamp(n.energy + (sleeping ? 5.4 : -0.30 * this.mods.energyMul), 0, 100);
    n.social = clamp(n.social - 0.40 * this.mods.socialMul, 0, 100);
    n.fun = clamp(n.fun - 0.29 * this.mods.funMul, 0, 100);
    n.purpose = clamp(n.purpose - 0.21, 0, 100);

    for (const m of this.memory) m.strength *= 0.9986;
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
        if (Math.abs(dx) > 0.01) this.facing = Math.sign(dx);
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
    if ((step.dur || 0) >= 4) this.note('开始' + (step.label || ACT_NAMES[step.id] || step.id));
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
    if (this.plan) this.note('干完：' + (ACT_NAMES[this.act?.id] || this.plan.label || '这件事'));
    const act = this.act;
    this.act = null;
    if (!act) return;
    this.applyEffect(sim, act);
    this.stepIndex++;
    if (this.stepIndex >= this.plan.length) this.finishPlan(sim);
  }

  needSum() {
    const n = this.needs;
    return n.hunger + n.energy + n.social + n.fun + n.purpose;
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

  applyEffect(sim, act) {
    const n = this.needs;
    const w = sim.world;
    const d = act.data || {};
    const job = JOBS[this.job];
    switch (act.id) {
      case 'sleep': {
        n.energy = clamp(n.energy + 8, 0, 100);
        this.addMemory({ text: '睡了一觉，梦见了些说不清的东西。', valence: 1.4, strength: 0.4, kind: 'rest' });
        break;
      }
      case 'eat': {
        if (d.src === 'pack') {
          if (this.inventory.food <= 0) {
            // 口袋空了就花钱从镇上仓里买一份；买不起才是真的饿
            const price = 5;
            if ((sim.world.stock.food || 0) > 0 && this.coins >= price) {
              sim.world.stock.food--;
              this.coins -= price;
              if (sim.town) sim.town.coins += price;
              this.note('从仓里买了一份粮', 'market');
            } else {
              sim.log(`${this.name}摸了摸口袋，什么吃的都没有。`, 'social', [this.id]);
              break;
            }
          } else {
            this.inventory.food--;
          }
        }
        n.hunger = clamp(n.hunger + (d.src === 'meal' ? 52 : 40), 0, 100);
        n.fun += 2;
        this.addMemory({ text: d.src === 'meal' ? '在酒馆吃了一顿热乎的。' : '啃了点干粮，垫了垫肚子。', valence: 1.2, strength: 0.35, kind: 'food' });
        break;
      }
      case 'study': {
      if (this.sim?.dev) this.sim.dev.study += 1;
        n.purpose = clamp(n.purpose + 6, 0, 100);
        n.fun = clamp(n.fun + 3, 0, 100);
        this.education = clamp(this.education + 1.6, 0, 100);
        for (const k of Object.keys(this.skills)) this.skills[k] = Math.round((this.skills[k] + 0.05) * 10) / 10;
        this.addMemory({ text: '在学堂听了一堂课。', valence: 1, strength: 0.3, kind: 'study' });
        sim.log(`${this.name}在学堂听了一堂课。`, 'social', [this.id]);
        break;
      }
      case 'buyMeal': {
        const price = 6;
        if (this.coins < price) { sim.log(`${this.name}在酒馆门口数了数钱，又走开了。`, 'social', [this.id]); break; }
        if (sim.world.stock.food <= 0) { sim.log(`${this.name}掀开锅盖，里面是空的。`, 'social', [this.id]); break; }
        sim.world.stock.food--;
        this.coins -= price;
        sim.world.stock.coins += price;
        if (sim.town) sim.town.coins += price;
        n.hunger = clamp(n.hunger + 55, 0, 100);
        n.social += 7; n.fun += 7;
        this.addMemory({ text: '在酒馆吃了一顿热的，听了几耳朵闲话。', valence: 2, strength: 0.5, kind: 'food', about: ['man'] });
        sim.log(`${this.name}在酒馆吃了顿饭，花了 ${price} 枚硬币。`, 'work', [this.id, 'man']);
        break;
      }
      case 'forage': {
        this.inventory.food++;
        n.fun += 4; n.hunger += 4;
        this.addMemory({ text: '在林子边找到几颗野果。', valence: 1, strength: 0.3, kind: 'food' });
        break;
      }
      case 'work': {
        const amount = 1 + (this.skills.farming || 0) * 0.05;
        n.purpose = clamp(n.purpose + 16, 0, 100);
        this.coins += 3;
        sim.world.stock.coins = Math.max(0, sim.world.stock.coins - 3);
        this.skills[d.skill || 'farming'] = Math.min(10, (this.skills[d.skill || 'farming'] || 0) + 0.05);
        this.addMemory({ text: d.line || '干了一阵子活，手上有了些热气。', valence: 1, strength: 0.3, kind: 'work' });
        break;
      }
      case 'harvest': {
      if (this.sim?.dev) this.sim.dev.harvest += 1;
        const got = w.harvest(d.x, d.y);
        if (got) {
          sim.world.stock.food += got;
          n.purpose += 12; this.coins += 4;
          this.addMemory({ text: `收了一茬芜菁，装了 ${got} 筐。`, valence: 1.6, strength: 0.45, kind: 'work' });
          sim.log(`${this.name}收了一茬芜菁（+${got} 食物）。`, 'work', [this.id]);
        }
        break;
      }
      case 'water': {
        w.water(d.x, d.y);
        n.purpose += 4;
        break;
      }
      case 'plant': {
        if (sim.world.stock.seeds > 0 && w.plant(d.x, d.y)) {
          sim.world.stock.seeds--;
          n.purpose += 6;
          this.addMemory({ text: '在空地里下了种。', valence: 1, strength: 0.3, kind: 'work' });
        }
        break;
      }
      case 'chop': {
        const wood = w.chopTree(d.x, d.y);
        if (wood) {
          if (sim._chopDay !== sim.clock.day) { sim._chopDay = sim.clock.day; sim._chopCount = 0; }
          sim._chopCount = (sim._chopCount || 0) + 1;
          sim.world.stock.wood += wood;
          this.coins += 2; n.purpose += 10;
          this.addMemory({ text: `砍倒一棵树，得了 ${wood} 份木料。`, valence: 1, strength: 0.35, kind: 'work' });
          sim.log(`${this.name}砍了一棵树（+${wood} 木材）。`, 'work', [this.id]);
        }
        break;
      }
      case 'build': {
        const bp = w.blueprints.find((b) => b.id === d.bpId);
        if (!bp) break;
        const done = w.buildProgress(bp, 0.8 * this.mods.buildSpeed + 0.35);
        n.purpose += 10; this.coins += 4;
        if (done) {
          this.addMemory({ text: `把${bp.name}造好了，站在旁边看了好一会儿。`, valence: 2.4, strength: 0.9, kind: 'build' });
          sim.log(`${this.name}造好了「${bp.name}」。`, 'build', [this.id]);
          sim.onDecorBuilt(bp);
        } else {
          this.addMemory({ text: `在给${bp.name}收尾。`, valence: 0.6, strength: 0.3, kind: 'work' });
        }
        break;
      }
      case 'chat': {
        sim.doChat(this, sim.npcById(d.otherId));
        break;
      }
      case 'relax': {
        n.fun = clamp(n.fun + 15, 0, 100);
        n.energy = clamp(n.energy + 3, 0, 100);
        this.addMemory({ text: d.line || '坐了一会儿，什么也没干。', valence: 1.2, strength: 0.3, kind: 'leisure' });
        break;
      }
      case 'fish': {
        this.inventory.food++;
        n.fun += 6; n.purpose += 8; this.coins += 1;
        this.skills.fishing = Math.min(10, this.skills.fishing + 0.06);
        this.addMemory({ text: sim.rng.chance(0.2) ? '水面下有什么东西一闪而过，没钓上来。' : '钓上来一条不小的鱼。', valence: sim.rng.chance(0.2) ? 1.8 : 1.1, strength: 0.4, kind: 'work' });
        break;
      }
      case 'paint': {
        n.fun += 9; n.purpose += 10;
        this.skills.art = Math.min(10, this.skills.art + 0.08);
        if (sim.rng.chance(0.18)) {
          this.coins += 8;
          this.addMemory({ text: '画出了一小块满意的颜色，有人愿意买走它。', valence: 2.2, strength: 0.7, kind: 'work' });
          sim.log(`${this.name}卖掉了一幅小画。`, 'work', [this.id]);
        } else {
          this.addMemory({ text: '画了又刮掉，总觉得差一点。', valence: 0.2, strength: 0.3, kind: 'work' });
        }
        break;
      }
      case 'treat': {
        n.purpose += 12; this.coins += 4;
        this.skills.healing = Math.min(10, this.skills.healing + 0.05);
        if (sim.rng.chance(0.25)) {
          const other = sim.rng.pick(sim.npcs.filter((x) => x.id !== this.id));
          if (other) {
            other.needs.energy = clamp(other.needs.energy + 4, 0, 100);
            other.addMemory({ text: `去诊所找${this.name}看了看，她说什么事都没有，别硬撑。`, valence: 1.4, strength: 0.5, kind: 'care', about: [this.id] });
            sim.log(`${this.name}给${other.name}看了看脉。`, 'social', [this.id, other.id]);
          }
        }
        break;
      }
      case 'serve': {
        if (sim.world.stock.food <= 0) {
          const now = sim.tick;
          if ((sim._restockAt || -999) + 180 < now && this.coins >= 12) {
            sim._restockAt = now;
            this.coins -= 12;
            sim.world.stock.food += 6;
            this.addMemory({ text: '食材断了，跑了一趟才补上，真不该拖到今天。', valence: -0.8, strength: 0.6, kind: 'work', about: [] });
            sim.log(`${this.name}断了食材，花 12 硬币补了 6 份（-12 硬币）。`, 'work', [this.id]);
          } else if ((sim._restockAt || -999) + 180 >= now && !sim._restockNoted) {
            sim._restockNoted = true;
            sim.log(`酒馆没食材了，${this.name}把门板挂了上去。`, 'work', [this.id]);
          }
          break;
        }
        sim.world.stock.food--;
        this.coins += 5; n.social += 6; n.purpose += 6;
        const patron = sim.npcs.find((x) => x.id !== this.id && Math.hypot(x.x - this.x, x.y - this.y) < 6);
        if (patron) {
          patron.needs.social += 4;
          patron.addMemory({ text: `在酒馆坐了会儿，${this.name}给续了杯。`, valence: 1, strength: 0.3, kind: 'leisure', about: [this.id] });
        }
        this.addMemory({ text: '擦杯子、添酒、听人说话，一晚上就这么过去了。', valence: 1.2, strength: 0.35, kind: 'work' });
        break;
      }
      case 'trade': {
        this.coins += 4 + Math.round(this.skills.farming * 0.2);
        n.purpose += 8; n.social += 3;
        this.addMemory({ text: '在街口做成了两笔小买卖。', valence: 1.3, strength: 0.35, kind: 'work' });
        break;
      }
      case 'watch': {
        n.purpose += 7;
        this.addMemory({ text: '巡了一圈，街上没什么事。', valence: 0.8, strength: 0.25, kind: 'work' });
        break;
      }
      case 'look': {
        n.fun += 3;
        break;
      }
      default:
        break;
    }
    this.recentGain = 0;
  }

  planView() {
    return this.plan.map((s, i) => ({
      text: s.kind === 'goto' ? `前往 (${Math.round(s.x)}, ${Math.round(s.y)})` : (s.label || ACT_NAMES[s.id] || s.id),
      now: i === this.stepIndex,
      done: i < this.stepIndex,
    }));
  }
}

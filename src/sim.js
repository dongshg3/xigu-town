// sim.js — the simulation: clock, residents, economy, player, persistence.
import { RNG, clockOf, clamp } from './core.js';
import { World, TILE } from './world.js';
import { PROFILES, WEATHERS, SEASONS, JOBS, SEX, AGE } from './data.js';
import { NPC } from './agent.js';
import { pickPlan } from './goals.js';
import { chatter, pairCompatibility, playerTalk, playerGift } from './social.js';
import { compose, composeChatter } from './language.js';
import { rewardTalk, noteTopic, learnFromOthers, dailyMoodUpdate } from './learning.js';
import { issueOrder } from './orders.js';
import { ensureSociety, tickSocietyDay, seekCare, jailRelease, tickCrime } from './society.js';
import { ensureLedger, settleDay, refreshOrders, buy, sell, fulfillOrder, eatAtTavern, workShift } from './economy.js';
import { ensurePlots, claimPlot, onHouseBuilt, makeSettlerProfile, claimCost } from './territory.js';
import { ensureCouncil, tickPolitics, propose, voteFor, politicsSummary, playerStanding, runForMayor } from './politics.js';
import { ensureFaith, tickFaith, godAct } from './god.js';
import { ensureDev, tickDevelopment } from './development.js';
import { tickInfluence } from './influence.js';
import { EventBus } from './core/eventBus.js';
import { knownKinds } from './data/present/feedback.js';

export class Simulation {
  constructor(seed = 20261123) {
    this.seed = seed;
    this.rng = new RNG(seed);
    this.world = new World(seed);
    this.tick = 0;
    this.lastDay = 1;
    this.npcs = PROFILES.map((p) => new NPC({ ...p, sex: SEX[p.id], age: AGE[p.id] }, this.world, this));
    this.npcMap = new Map(this.npcs.map((n) => [n.id, n]));
    this.logs = [];
    // 事件总线（架构 §5）：本步只接机制——log() 会同步发 'log.line' 事件，
    // 日志本体照旧写 logs[]，行为与确定性不变（事件不消耗 rng）。
    this.events = new EventBus(this);
    this.events.knownKinds = knownKinds();
    this.dramaticFlags = [];
    this.effects = [];
    this.revealedSecrets = new Set();
    this.playerRels = new Map();
    this.pendingTalk = null;
    this.pendingGift = null;
    this.lastDialogue = null;
    this.weather = WEATHERS[0];
    this.weatherId = this.weather.id;
    this.ambientAt = 30;
    this.player = {
      name: '旅人', x: 20, y: 6, path: null, coins: 80,
      facing: 1, speed: 1.15,
      bag: { wood: 0, stone: 0, food: 1, seeds: 0 },
      hunger: 72,
    };
    this.initRelationships();
    ensureLedger(this);
    ensurePlots(this.world);
    this.pendingSettlers = 0;
    ensureSociety(this);
    ensureCouncil(this);
    ensureFaith(this);
    ensureDev(this);
    this.levels = [];
    this.milestones = [];
    this.influence = [];
    tickDevelopment(this);
    this.log(`第 1 天，你来到了溪谷镇。`, 'system', []);
    this.log(`镇上有 ${this.npcs.length} 位居民，各自过着自己的日子。`, 'system', []);
  }

  get clock() { return clockOf(this.tick); }

  initRelationships() {
    for (let i = 0; i < this.npcs.length; i++) {
      for (let j = i + 1; j < this.npcs.length; j++) {
        const a = this.npcs[i], b = this.npcs[j];
        const compat = pairCompatibility(a, b);
        const aff = clamp(22 + compat * 38 + this.rng.float(0, 10), 8, 92);
        a.rels.set(b.id, { affinity: aff, trust: 16 + compat * 22, familiarity: 6 + compat * 8, lastTalk: -999 });
        b.rels.set(a.id, { affinity: clamp(aff + this.rng.float(-4, 4), 8, 92), trust: 16 + compat * 22, familiarity: 6 + compat * 8, lastTalk: -999 });
      }
    }
  }

  npcById(id) { return this.npcMap.get(id) || null; }

  // A repeated event inside a short window folds into the previous line and
  // bumps its counter, so the journal stays a story instead of a log file.
  log(text, kind = 'system', about = []) {
    const c = this.clock;
    const last = this.logs[this.logs.length - 1];
    if (last && last.text === text && kind !== 'drama' && this.tick - last.tick < 60) {
      last.count = (last.count || 1) + 1;
      last.tick = this.tick;
      last.time = `D${c.day} ${c.short}`;
      return last;
    }
    const entry = { tick: this.tick, time: `D${c.day} ${c.short}`, text, kind, about, count: 1 };
    this.logs.push(entry);
    if (this.logs.length > 320) this.logs.shift();
    // 同时发一条事件：给回放、通知中心、因果链留素材（不改变日志本身的行为）
    this.events.emit({ kind: 'log.line', severity: 0.1, actors: about, data: { text, logKind: kind } });
    return entry;
  }

  floatText(x, y, text, color = '#e8e4da') {
    this.effects.push({ x, y, text, color, age: 0, ttl: 55 });
    if (this.effects.length > 40) this.effects.shift();
  }

  isTavernOpen() {
    const h = this.clock.hour;
    return h >= 8 && h < 23;
  }

  pickPlan(npc) { return pickPlan(npc, this); }

  doChat(a, b) {
    if (!a || !b) return;
    const res = chatter(a, b, this);
    const lines = composeChatter(a, b, this, res.kind);
    a.speech = { text: lines.a.text, until: this.tick + 9 };
    a.note('对' + b.name + '说：' + lines.a.text, 'say');
    b.speech = { text: lines.b.text, until: this.tick + 9 };
    b.note('对' + a.name + '说：' + lines.b.text, 'say');
    // 双方都从这次谈话里学到东西：说得好下次多说，话题也记住
    rewardTalk(a, lines.a.intent, res.delta);
    rewardTalk(b, lines.b.intent, res.delta);
    noteTopic(a, lines.a.fact?.topic, res.delta);
    noteTopic(b, lines.b.fact?.topic, res.delta);
    learnFromOthers(b, lines.a.text, res.delta);
    learnFromOthers(a, lines.b.text, res.delta);
    if (res.kind === 'quarrel') {
      this.floatText((a.x + b.x) / 2, (a.y + b.y) / 2 - 0.4, '怒', '#e6a89f');
    } else if (res.kind === 'deep') {
      this.floatText((a.x + b.x) / 2, (a.y + b.y) / 2 - 0.4, '心', '#d9b3c9');
    }
    return res;
  }

  // Residents notice you standing next to them and say something first — the
  // town should feel like it has its own attention, not only answers.
  maybeGreetPlayer() {
    const p = this.player;
    for (const n of this.npcs) {
      if (n.sleeping || n.act?.id === 'sleep') continue;
      if (this.tick < (n.nextGreetAt ?? 0)) continue;
      const d = Math.hypot(n.x - p.x, n.y - p.y);
      if (d > 2.3) continue;
      const pr = this.playerRel(n.id);
      if (pr.affinity < 26) continue;
      const sit = n.act && n.act.id !== 'chat' ? 'busy' : 'idle';
      const line = compose(n, this, 'greet').text;
      n.speech = { text: line.length > 24 ? line.slice(0, 22) + '…' : line, until: this.tick + 12 };
      n.nextGreetAt = this.tick + 220 + this.rng.int(0, 140);
      pr.affinity = clamp(pr.affinity + 0.6, 0, 100);
      if (this.rng.chance(0.25)) this.log(`${n.name}先跟你打了招呼。`, 'social', [n.id]);
    }
  }

  playerRel(id) {
    if (!this.playerRels.has(id)) this.playerRels.set(id, { affinity: 20, trust: 10, familiarity: 0 });
    return this.playerRels.get(id);
  }

  setPlayerTarget(x, y) {
    const p = this.world.findPath(Math.round(this.player.x), Math.round(this.player.y), x, y);
    if (p) {
      this.player.path = p;
      this.clearApproach();
    }
  }

  clearApproach() {
    this.approach = null;
    this.pendingTalk = null;
    this.pendingGift = null;
  }

  approachTo(npc, kind) {
    this.approach = { id: npc.id, kind, tries: 0, deadline: this.tick + 70 };
    this.pendingTalk = kind === 'talk' ? npc.id : null;
    this.pendingGift = kind === 'gift' ? npc.id : null;
    this.repathApproach(true);
    return null;
  }

  // 目标在移动：每刻检查一次，必要时重新规划路线；靠近了就触发交互
  repathApproach(force) {
    const a = this.approach;
    if (!a) return;
    const p = this.player;
    const npc = this.npcById(a.id);
    if (!npc) { this.clearApproach(); return; }
    const d = Math.hypot(npc.x - p.x, npc.y - p.y);
    if (d <= 2.6) {
      if (a.kind === 'talk') this.talkNow(npc); else this.giftNow(npc);
      return;
    }
    if (this.tick > a.deadline) {
      this.log(`${npc.name}走得快，你跟丢了。`, 'system');
      this.clearApproach();
      return;
    }
    const last = p.path && p.path.length ? p.path[p.path.length - 1] : null;
    const stale = !last || Math.hypot(last.x - npc.x, last.y - npc.y) > 1.8;
    if (!stale && !force) return;
    const path = this.world.findPath(Math.round(p.x), Math.round(p.y), Math.round(npc.x), Math.round(npc.y));
    a.tries += 1;
    if (path && path.length) p.path = path;
  }

  requestTalk(npc) {
    const d = Math.hypot(npc.x - this.player.x, npc.y - this.player.y);
    if (d <= 2.6) return this.talkNow(npc);
    return this.approachTo(npc, 'talk');
  }

  talkNow(npc) {
    const res = playerTalk(npc, this);
    this.lastDialogue = { npcId: npc.id, ...res, tick: this.tick };
    if (res.secret) this.floatText(npc.x, npc.y - 0.7, '秘', '#e0b05a');
    this.clearApproach();
    return res;
  }

  requestGift(npc) {
    const d = Math.hypot(npc.x - this.player.x, npc.y - this.player.y);
    if (d <= 2.6) return this.giftNow(npc);
    return this.approachTo(npc, 'gift');
  }

  giftNow(npc) {
    const res = playerGift(npc, this);
    this.clearApproach();
    if (res.ok) this.floatText(npc.x, npc.y - 0.6, '礼', '#e0b05a');
    return res;
  }

  stepPlayer() {
    const p = this.player;
    if (this.approach) this.repathApproach(false);
    if (!p.path || !p.path.length) {
      p.path = null;
      if (this.approach) this.repathApproach(true);
      return;
    }
    let budget = p.speed;
    while (budget > 0 && p.path.length) {
      const node = p.path[0];
      const dx = node.x - p.x, dy = node.y - p.y;
      const d = Math.hypot(dx, dy);
      if (d <= budget) { p.x = node.x; p.y = node.y; budget -= d; p.path.shift(); }
      else {
        p.x += (dx / d) * budget; p.y += (dy / d) * budget;
        if (Math.abs(dx) > 0.01) p.facing = Math.sign(dx);
        budget = 0;
      }
    }
    if (!p.path.length) p.path = null;
    if (this.approach) this.repathApproach(true);
  }

  placeBlueprint(type, x, y) {
    const res = this.world.placeBlueprint(type, x, y, this.world.stock);
    if (res.ok) {
      this.log(`你放下了一张「${res.bp.name}」的图纸，等木匠来建。`, 'build', []);
      this.effects.push({ x, y, text: '图', color: '#e0b05a', age: 0, ttl: 60 });
    }
    return res;
  }

  // 有人搬来：造一个真 NPC，接进关系网，从此有自己的一天。
  spawnSettlers() {
    let guard = 0;
    while (this.pendingSettlers > 0 && guard++ < 4) {
      const profile = makeSettlerProfile(this);
      const npc = new NPC(profile, this.world, this);
      this.npcs.push(npc);
      this.npcMap.set(npc.id, npc);
      for (const other of this.npcs) {
        if (other === npc) continue;
        const compat = pairCompatibility(npc, other);
        const aff = clamp(26 + compat * 30 + this.rng.float(0, 8), 10, 88);
        npc.rels.set(other.id, { affinity: aff, trust: 18 + compat * 18, familiarity: 4 + compat * 6, lastTalk: -999 });
        other.rels.set(npc.id, { affinity: clamp(aff + this.rng.float(-4, 4), 8, 92), trust: 18 + compat * 18, familiarity: 4 + compat * 6, lastTalk: -999 });
      }
      this.playerRels.set(npc.id, { affinity: 40, trust: 20, familiarity: 0, lastTalk: -999 });
      this.pendingSettlers--;
      this.log(npc.name + '搬进了新居，成了镇上的第 ' + this.npcs.length + ' 个人。', 'drama', [npc.id]);
      npc.addMemory({ text: '搬进溪谷镇的第一天，屋里还空着。', valence: 2, strength: 0.9, kind: "town", about: [] });
    }
  }

  buyGood(good, qty) { return buy(this, good, qty); }
  sellGood(good, qty) { return sell(this, good, qty); }
  takeOrder(id) { return fulfillOrder(this, id); }
  eatTavern() { return eatAtTavern(this); }
  claimLand(id) { return claimPlot(this, id); }
  workShift() { return workShift(this); }
  issueOrder(npcId, kind, arg) { return issueOrder(this, npcId, kind, arg); }
  runForMayor() { return runForMayor(this); }
  proposePolicy(id) { return propose(this, id); }
  voteFor(id) { return voteFor(this, id); }
  politics() { return politicsSummary(this); }
  landCost() { return claimCost(this.world); }
  standing() { return playerStanding(this); }

  onDecorBuilt(bp) {
    if (bp.type === 'cottage') {
      this.world.decor = this.world.decor.filter((d) => !(d.x === bp.x && d.y === bp.y));
      onHouseBuilt(this, bp.x, bp.y);
      return;
    }
    this.floatText(bp.x, bp.y - 0.5, '成', '#e0b05a');
    for (const n of this.npcs) {
      const d = Math.hypot(n.x - bp.x, n.y - bp.y);
      if (d < 10) {
        n.needs.fun = clamp(n.needs.fun + 4, 0, 100);
        n.addMemory({ text: `镇上多了个${bp.name}，看着心里舒坦。`, valence: 1.4, strength: 0.5, kind: 'town', about: [] });
      }
    }
  }

  dayRollover() {
    this.world.dailyUpdate();
    // 铁牛的商队每早补一次货
    this.world.stock.food = Math.min(60, (this.world.stock.food || 0) + 14);
    this.log('铁牛的驮队从镇口进来，卸下几袋粮食。', 'economy', ['niu']);
    const season = SEASONS[this.clock.season] || SEASONS[0];
    const w = this.rng.weighted(WEATHERS, (x) => season.weather[x.id] ?? 1);
    this.weather = w;
    this.weatherId = w.id;
    if (w.id === 'rain') this.world.weather = 'rain';
    else this.world.weather = w.id;
    const c = this.clock;
    this.log(`第 ${c.day} 天。${w.label}。`, 'system', []);
    // 换季值得说一句：颜色会变，地里的长势也会变
    if ((c.day - 1) % 7 === 0 && c.day > 1) {
      const lines = {
        春: '开春了，地气往上返，庄稼肯长。',
        夏: '入了夏，日头毒，蝉鸣一阵接一阵。',
        秋: '秋风一起，叶子开始泛黄，收成该归仓了。',
        冬: '入冬了，地里歇了，人也想往屋里缩。',
      };
      this.log(lines[season.label] || `换季：${season.label}。`, 'system', []);
      for (const n of this.npcs) {
        n.addMemory?.({ text: `换季了，${lines[season.label] || ''}`, valence: 0.3, strength: 0.3, kind: 'town', about: [] });
      }
    }
    for (const n of this.npcs) dailyMoodUpdate(n, this);
    settleDay(this);
    tickPolitics(this);
    tickSocietyDay(this);
    tickInfluence(this);
    tickDevelopment(this);
    tickFaith(this);
    this.spawnSettlers();
  }

  ambient() {
    if (this.tick < this.ambientAt) return;
    this.ambientAt = this.tick + 50 + Math.floor(this.rng.float(0, 40));
    const lines = [
      '风从河湾那边吹过来，带着水汽。',
      '街上有只猫从墙头跳下来，谁也不理。',
      '远处传来敲木头的声音，一下，又一下。',
      '云影从镇子上慢慢移过去。',
      '有人在哼一支很旧的小调。',
    ];
    this.log(this.rng.pick(lines), 'system', []);
  }

  step() {
    this.tick++;
    const c = this.clock;
    if (c.day !== this.lastDay) {
      this.lastDay = c.day;
      this.dayRollover();
    }
    this.world.tickCrops(0.085 * (SEASONS[this.clock.season]?.crop ?? 1), this.weather.crop ? 1.4 : 0);
    for (const n of this.npcs) n.update(this);
    if (this.tick % 20 === 0) seekCare(this);
    if (this.tick % 5 === 0) tickCrime(this);
    if (this.tick % 10 === 0) jailRelease(this);
    this.stepPlayer();
    this.maybeGreetPlayer();
    for (const n of this.npcs) {
      if (n.speech && this.tick > n.speech.until) n.speech = null;
    }
    for (const e of this.effects) { e.age++; e.y -= 0.006; }
    this.effects = this.effects.filter((e) => e.age < e.ttl);
    this.ambient();
    this.events.flush();
  }

  stats() {
    const avgMood = this.npcs.reduce((s, n) => s + n.mood, 0) / this.npcs.length;
    const avgSocial = this.npcs.reduce((s, n) => s + n.needs.social, 0) / this.npcs.length;
    const working = this.npcs.filter((n) => n.goalId === 'work').length;
    const asleep = this.npcs.filter((n) => n.act?.id === 'sleep').length;
    return {
      avgMood, avgSocial, working, asleep,
      beauty: this.world.beauty(),
      blueprints: this.world.blueprints.length,
    };
  }

  god(npcId, powerId) { return godAct(this, npcId, powerId); }

  devList() { return this.levels && this.levels.length ? this.levels : tickDevelopment(this); }

  scheduleFor(npc) {
    const job = JOBS[npc.job];
    return job ? job.windows : [];
  }

  toJSON() {
    const npcState = this.npcs.map((n) => ({
      id: n.id,
      needs: { ...n.needs },
      coins: n.coins,
      inventory: { ...n.inventory },
      skills: { ...n.skills },
      x: n.x, y: n.y,
      goalId: n.goalId,
      goalLabel: n.goalLabel,
      thought: n.thought,
      memory: n.memory.slice(-30),
      beliefs: n.beliefs.slice(-20),
      secretToldTo: n.secretToldTo || [],
      rels: [...n.rels.entries()].map(([id, r]) => [id, { ...r }]),
      plan: n.plan,
      stepIndex: n.stepIndex,
      act: n.act,
      health: n.health,
      education: n.education,
      sex: n.sex,
      age: n.age,
      sick: n.sick,
      jailedUntil: n.jailedUntil,
      partner: n.partner,
      children: n.children,
      history: (n.history || []).slice(-40),
      order: n.order,
      mind: n.mind,
      profile: n.profile,
      said: (n._said || []).slice(-8),
    }));
    return {
      version: 1,
      seed: this.seed,
      tick: this.tick,
      lastDay: this.lastDay,
      rngState: this.rng.s,
      stock: { ...this.world.stock },
      weather: this.weatherId,
      blueprints: this.world.blueprints.map((b) => ({ ...b })),
      decor: this.world.decor.map((d) => ({ ...d })),
      tiles: this.world.tiles.map((t) => ({
        obj: t.obj ? { ...t.obj } : null,
        crop: t.crop ? { ...t.crop } : null,
        regrow: t.regrow || 0,
      })),
      npcs: npcState,
      player: { ...this.player },
      town: JSON.parse(JSON.stringify(this.town)),
      plots: JSON.parse(JSON.stringify(this.world.plots || [])),
      houses: (this.world.buildings || []).filter((b) => b.dynamic).map((b) => ({ x: b.door.x, y: b.door.y - 2, name: b.name })),
      pendingSettlers: this.pendingSettlers || 0,
      playerRels: [...this.playerRels.entries()].map(([id, r]) => [id, { ...r }]),
      revealedSecrets: [...this.revealedSecrets],
      logs: this.logs.slice(-160),
      faith: JSON.parse(JSON.stringify(this.faith)),
      dev: { ...this.dev },
      levels: (this.levels || []).map((l) => ({ id: l.id, lv: l.lv, score: l.score })),
      milestones: (this.milestones || []).slice(-40),
      influence: (this.influence || []).slice(-20),
    };
  }

  restore(data) {
    if (!data || data.version !== 1) return false;
    this.tick = data.tick;
    this.lastDay = data.lastDay;
    this.rng.s = data.rngState >>> 0;
    Object.assign(this.world.stock, data.stock);
    const w = WEATHERS.find((x) => x.id === data.weather) || WEATHERS[0];
    this.weather = w;
    this.weatherId = w.id;
    this.world.weather = w.id;
    this.world.blueprints = data.blueprints.map((b) => ({ ...b }));
    if (data.faith) this.faith = { ...data.faith, log: (data.faith.log || []).slice(0, 24) };
    if (data.dev) ensureDev(this), Object.assign(this.dev, data.dev);
    if (data.milestones) this.milestones = data.milestones.slice(-40);
    if (data.influence) this.influence = data.influence.slice(-20);
    this.world.decor = data.decor.map((d) => ({ ...d }));
    data.tiles.forEach((saved, i) => {
      const t = this.world.tiles[i];
      if (!t) return;
      t.obj = saved.obj ? { ...saved.obj } : null;
      t.crop = saved.crop ? { ...saved.crop } : null;
      t.regrow = saved.regrow || 0;
    });
    // 先补建存档里多出来的人（移民、出生的孩子），再往他们身上写状态
    for (const sv of data.npcs) {
      if (this.npcById(sv.id) || !sv.profile) continue;
      const nn = new NPC(sv.profile, this.world, this);
      this.npcs.push(nn);
      this.npcMap.set(nn.id, nn);
    }
    for (const s of data.npcs) {
      const n = this.npcById(s.id);
      if (!n) continue;
      n.needs = { ...s.needs };
      n.coins = s.coins;
      n.inventory = { ...s.inventory };
      n.skills = { ...s.skills };
      n.x = s.x; n.y = s.y;
      n.goalId = s.goalId;
      n.goalLabel = s.goalLabel;
      n.thought = s.thought;
      if (s.mind) n.mind = s.mind;
      if (s.said) n._said = s.said;
      n.memory = s.memory || [];
      n.beliefs = s.beliefs || [];
      n.secretToldTo = s.secretToldTo || [];
      n.rels = new Map((s.rels || []).map(([id, r]) => [id, { ...r }]));
      n.plan = s.plan || [];
      n.stepIndex = s.stepIndex || 0;
      n.act = s.act || null;
      if (s.health != null) n.health = s.health;
      if (s.education != null) n.education = s.education;
      if (s.sex) n.sex = s.sex;
      if (s.age != null) n.age = s.age;
      n.sick = !!s.sick;
      n.jailedUntil = s.jailedUntil || 0;
      n.partner = s.partner || null;
      n.children = s.children || [];
      n.history = s.history || [];
      n.order = s.order || null;
      n.path = null;
      n.sleeping = n.act?.id === 'sleep';
    }
    Object.assign(this.player, data.player);
    if (!this.player.bag) this.player.bag = { wood: 0, stone: 0, food: 1, seeds: 0 };
    if (typeof this.player.hunger !== "number") this.player.hunger = 72;
    if (data.plots) {
      this.world.plots = data.plots.map((pp) => ({ ...pp }));
      this.world.buildings = this.world.buildings.filter((b) => !b.dynamic);
      for (const h of data.houses || []) this.world.addHouse(h.x, h.y, h.name);
    }
    if (data.town) this.town = { ...this.town, ...data.town };
    this.pendingSettlers = data.pendingSettlers || 0;
    for (const sv of data.npcs) {
      if (this.npcById(sv.id) || !sv.profile) continue;
      const nn = new NPC(sv.profile, this.world, this);
      this.npcs.push(nn);
      this.npcMap.set(nn.id, nn);
    }
    this.player.path = null;
    this.playerRels = new Map((data.playerRels || []).map(([id, r]) => [id, { ...r }]));
    this.revealedSecrets = new Set(data.revealedSecrets || []);
    this.logs = data.logs || [];
    this.pendingTalk = null;
    this.pendingGift = null;
    return true;
  }
}

// goals.js — utility scoring + plan construction (a small HTN planner).
import { clamp } from './core.js';
import { JOBS } from './data.js';
import { studyPlan } from './society.js';

const nearest = (p, list) => {
  let best = null, bd = Infinity;
  for (const q of list) {
    const d = Math.hypot(q.x - p.x, q.y - p.y);
    if (d < bd) { bd = d; best = q; }
  }
  return best;
};

function benches(world) { return world.decor.filter((d) => d.type === 'bench'); }
function pondSpot(npc, sim) { return nearest(npc, sim.world.pondSpots); }

function sleepTicks(sim) {
  const c = sim.clock;
  let minutes;
  if (c.hour >= 22 || c.hour < 6) {
    minutes = (6 * 60 - c.minutes + 1440) % 1440;
    if (minutes < 120) minutes = 480;
  } else {
    minutes = 70;
  }
  return clamp(Math.round(minutes / 5), 6, 110);
}

function workLines(npc) {
  const map = {
    farmer: '在田里蹲了半天，拔草、看墒情。',
    carpenter: '在工坊里刨木头，木屑落了一地。',
    artist: '对着画布发了一会儿呆，然后突然开始画。',
    doctor: '整理药柜，把每一味药都摆正。',
    tavern: '擦杯子、添酒、听人说话。',
    fisher: '水面很静，浮漂动了一下又不动了。',
    guard: '沿着主街走了一圈，看了看每扇门。',
    merchant: '在街口支起摊子，和路过的人搭话。',
  };
  return map[npc.job] || '忙了一阵。';
}

export const GOALS = [
  {
    id: 'eat', label: '去吃点东西',
    score(npc) {
      const h = npc.needs.hunger;
      let s = h < 36 ? 26 + (36 - h) * 2.7 : (100 - h) * 0.12;
      if (npc.goalId === 'eat') s += 6;
      return s;
    },
    thought(npc) {
      if (npc.needs.hunger < 22) return '饿得有点发慌了，得赶紧找点吃的。';
      return '肚子在提醒我，该吃点东西了。';
    },
    plan(npc, sim) {
      const w = sim.world;
      if (npc.inventory.food > 0) {
        const spot = nearest(npc, benches(w)) || w.findBuilding(npc.profile.home)?.spot;
        const target = spot || { x: Math.round(npc.x), y: Math.round(npc.y) };
        return [
          { kind: 'goto', x: target.x, y: target.y, label: '找个地方坐下' },
          { kind: 'act', id: 'eat', dur: 2, data: { src: 'pack' }, label: '吃随身干粮' },
        ];
      }
      const tavern = w.findBuilding('酒馆');
      if (tavern && sim.isTavernOpen() && npc.coins >= 6) {
        return [
          { kind: 'goto', x: tavern.door.x, y: tavern.door.y, label: '去酒馆' },
          { kind: 'act', id: 'buyMeal', dur: 2, data: {}, label: '点一份热饭' },
        ];
      }
      const spot = sim.world.randomWalkable(sim.rng, 36, 6, 5) || { x: 36, y: 9 };
      return [
        { kind: 'goto', x: spot.x, y: spot.y, label: '去林子边找吃的' },
        { kind: 'act', id: 'forage', dur: 3, data: {}, label: '采野果' },
        { kind: 'act', id: 'eat', dur: 2, data: { src: 'pack' }, label: '吃掉野果' },
      ];
    },
  },
  {
    id: 'sleep', label: '回家睡觉',
    score(npc, sim) {
      const e = npc.needs.energy;
      const c = sim.clock;
      let s = e < 42 ? (42 - e) * 2.3 : 0;
      if ((c.hour >= 22 || c.hour < 5) && e < 95) s += 140;
      else if (c.hour >= 21 && e < 95) s += 60;
      if (npc.goalId === 'sleep') s += 8;
      if (npc.act?.id === 'sleep') s += 60;
      return s;
    },
    thought() { return '眼皮有点沉，想回去躺一会儿。'; },
    plan(npc, sim) {
      const home = sim.world.findBuilding(npc.profile.home);
      const spot = home?.spot || npc;
      return [
        { kind: 'goto', x: spot.x, y: spot.y, label: '回家' },
        { kind: 'act', id: 'sleep', dur: sleepTicks(sim), data: {}, label: '睡觉' },
      ];
    },
  },
  {
    id: 'work', label: '去上工',
    score(npc, sim) {
      const job = JOBS[npc.job];
      const open = job?.windows.some(([a, b]) => sim.clock.hour >= a && sim.clock.hour < b);
      let s = open ? 44 + npc.mods.diligence * 7 + (100 - npc.needs.purpose) * 0.22 : 3;
      if (open && npc.needs.energy < 25) s *= 0.4;
      if (npc.goalId === 'work') s += 10;
      return s;
    },
    thought(npc, sim) {
      const job = JOBS[npc.job];
      return job ? `该去${npc.profile.work}了，手上的事不能一直拖着。` : '该干活了。';
    },
    plan(npc, sim) {
      const w = sim.world;
      const job = npc.job;

      if (job === 'farmer') {
        const ripe = w.ripeCrop();
        if (ripe) return [
          { kind: 'goto', x: ripe.x, y: ripe.y, label: '去田里' },
          { kind: 'act', id: 'harvest', dur: 3, data: { x: ripe.x, y: ripe.y }, label: '收割芜菁' },
        ];
        const thirsty = w.thirstyCrop();
        if (thirsty) return [
          { kind: 'goto', x: thirsty.x, y: thirsty.y, label: '去田里' },
          { kind: 'act', id: 'water', dur: 2, data: { x: thirsty.x, y: thirsty.y }, label: '浇水' },
        ];
        const empty = w.openFarmTile();
        if (empty && w.stock.seeds > 0) return [
          { kind: 'goto', x: empty.x, y: empty.y, label: '去田里' },
          { kind: 'act', id: 'plant', dur: 2, data: { x: empty.x, y: empty.y }, label: '播种' },
        ];
        return [
          { kind: 'goto', x: 16, y: 21, label: '去田里' },
          { kind: 'act', id: 'work', dur: 5, data: { skill: 'farming', line: workLines(npc) }, label: '照看田地' },
        ];
      }

      if (job === 'carpenter') {
        if (w.blueprints.length) {
          const bp = nearest(npc, w.blueprints);
          return [
            { kind: 'goto', x: bp.x, y: bp.y, label: '去工地' },
            { kind: 'act', id: 'build', dur: 4, data: { bpId: bp.id }, label: `建造${bp.name}` },
          ];
        }
        const choppedToday = sim._chopDay === sim.clock.day ? (sim._chopCount || 0) : 0;
        const trees = w.stock.wood < 32 && choppedToday < 3 ? w.trees.filter((t) => w.tile(t.x, t.y)?.obj?.type === 'tree') : [];
        const tree = trees.length ? nearest(npc, trees) : null;
        if (tree) return [
          { kind: 'goto', x: tree.x, y: tree.y, label: '去林子' },
          { kind: 'act', id: 'chop', dur: 4, data: { x: tree.x, y: tree.y }, label: '砍树' },
        ];
        const shop = w.findBuilding('工坊');
        return [
          { kind: 'goto', x: shop.spot.x, y: shop.spot.y, label: '去工坊' },
          { kind: 'act', id: 'work', dur: 5, data: { skill: 'building', line: workLines(npc) }, label: '做木工' },
        ];
      }

      const workName = npc.profile.work;
      const b = w.findBuilding(workName);
      const spot = b ? b.spot : { x: 22, y: 15 };
      const actionByJob = {
        artist: { id: 'paint', dur: 5, label: '画画', line: `${npc.name}对着画布，颜色一层层压上去。` },
        doctor: { id: 'treat', dur: 4, label: '看诊' },
        tavern: { id: 'serve', dur: 4, label: '照看酒馆' },
        fisher: { id: 'fish', dur: 5, label: '钓鱼' },
        guard: { id: 'watch', dur: 4, label: '巡街' },
        merchant: { id: 'trade', dur: 4, label: '看摊' },
      };
      const act = actionByJob[job] || { id: 'work', dur: 4, label: '干活', line: workLines(npc) };
      const dest = job === 'fisher' ? pondSpot(npc, sim) : (job === 'guard' ? sim.rng.pick(w.streetTiles) : spot);
      return [
        { kind: 'goto', x: dest.x, y: dest.y, label: `去${workName}` },
        { kind: 'act', id: act.id, dur: act.dur, data: { skill: job }, label: act.label },
      ];
    },
  },
  {
    id: 'social', label: '找人说说话',
    score(npc, sim) {
      let s = (100 - npc.needs.social) * 0.52 + 4;
      if (npc.mods.socialMul < 0.8) s *= 0.75;
      if (sim.clock.hour >= 22 || sim.clock.hour < 6) s *= 0.35;
      if (npc.goalId === 'social') s += 4;
      return s;
    },
    thought() { return '有点闷，想找个人说说话。'; },
    plan(npc, sim) {
      const others = sim.npcs.filter((o) => o.id !== npc.id && o.act?.id !== 'sleep');
      if (!others.length) return null;
      let best = null, bestScore = -Infinity;
      for (const o of others) {
        const rel = npc.rel(o.id);
        const d = Math.hypot(o.x - npc.x, o.y - npc.y);
        let s = rel.affinity * 0.6 - d * 0.9 + (100 - npc.needs.social) * 0.15;
        if (sim.tick - rel.lastTalk < 8) s -= 30;
        if (s > bestScore) { bestScore = s; best = o; }
      }
      if (!best) return null;
      return [
        { kind: 'goto', x: Math.round(best.x), y: Math.round(best.y), label: `去找${best.name}` },
        { kind: 'act', id: 'chat', dur: 3, data: { otherId: best.id }, label: `和${best.name}聊天` },
      ];
    },
  },
  {
    id: 'relax', label: '放松一下',
    score(npc, sim) {
      let s = (100 - npc.needs.fun) * 0.34 + 3;
      const h = sim.clock.hour;
      if (h >= 17 && h < 22) s += 12;
      if (npc.goalId === 'relax') s += 4;
      return s;
    },
    thought() { return '想歇一会儿，什么都不干。'; },
    plan(npc, sim) {
      const b = nearest(npc, benches(sim.world));
      if (b) return [
        { kind: 'goto', x: b.x, y: b.y, label: '去长椅' },
        { kind: 'act', id: 'relax', dur: 3, data: { line: '坐在长椅上，看街上的人来来往往。' }, label: '坐着发呆' },
      ];
      const p = pondSpot(npc, sim);
      return [
        { kind: 'goto', x: p.x, y: p.y, label: '去池塘边' },
        { kind: 'act', id: 'relax', dur: 3, data: { line: '在池塘边坐着，看水面上的光。' }, label: '看水' },
      ];
    },
  },
  {
    id: 'wander', label: '四处走走',
    score(npc) { return 5 + npc.mods.curiosity * 7; },
    thought() { return '没什么急事，随便走走。'; },
    plan(npc, sim) {
      const spot = sim.world.randomWalkable(sim.rng, npc.x, npc.y, 9);
      if (!spot) return null;
      return [
        { kind: 'goto', x: spot.x, y: spot.y, label: '随便走走' },
        { kind: 'act', id: 'look', dur: 1, data: {}, label: '看看四周' },
      ];
    },
  },
  {
    id: 'study', label: '去学堂',
    score(npc, sim) {
      if (npc.education >= 78 || npc.sick) return 0;
      const hour = sim.clock.hour;
      const open = hour >= 8 && hour <= 21;
      const evening = hour >= 18 ? 14 : 0;
      return (open ? 12 : 0) + evening + (70 - npc.education) * 0.5 + (npc.needs.fun < 40 ? 4 : 0);
    },
    thought() { return '想学点东西。'; },
    plan(npc, sim) { const p = studyPlan(npc, sim); return p ? p.steps : null; },
  },
];

import { scoreGoals } from './decide/decide.js';
import { decomposePlan } from './decide/htn.js';

// 三段式决策（架构 §3）：decide 打分留痕 → htn 分解出计划（带 why 解释）
export function pickPlan(npc, sim) {
  const scored = scoreGoals(GOALS, npc, sim);
  return decomposePlan(npc, sim, scored);
}

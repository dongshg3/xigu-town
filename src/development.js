// 每个系统都有自己的账本、自己的等级和自己的回馈。
// 环世界的深度来自「每样东西都在动」，开罗的深度来自「每样东西都能升」。
import { clamp } from './core.js';

export const SYSTEMS = [
  {
    id: 'market', name: '市集', icon: '市',
    desc: '买卖越旺，价钱越好，委托越多。',
    score: (sim) => (sim.town?.coins || 0) * 0.6 + (sim.dev?.trade || 0) * 14 + (sim.world.stock.wood + sim.world.stock.stone) * 0.6,
    effect: (lv) => `物价 +${(lv - 1) * 3}% · 委托上限 ${1 + lv}`,
  },
  {
    id: 'school', name: '学堂', icon: '学',
    desc: '识字的人越多，镇上越讲道理。',
    score: (sim) => avg(sim.npcs, (n) => n.education) * 1.2 + (sim.dev?.study || 0) * 0.8,
    effect: (lv) => `学识增速 +${(lv - 1) * 12}% · 孩子入学更早`,
  },
  {
    id: 'safety', name: '治安', icon: '安',
    desc: '抓得住贼，夜里才有人敢出门。',
    score: (sim) => 40 + (sim.dev?.caught || 0) * 16 - (sim.dev?.crimes || 0) * 6,
    effect: (lv) => `巡查成功 +${(lv - 1) * 6}% · 失窃 −${(lv - 1) * 5}%`,
  },
  {
    id: 'farm', name: '农事', icon: '农',
    desc: '地养得越好，收成越稳。',
    score: (sim) => (sim.dev?.harvest || 0) * 5 + (sim.world.stock.food || 0) * 1.1 + (sim.world.farmTiles?.length || 0) * 1.6,
    effect: (lv) => `生长 +${(lv - 1) * 8}% · 收成 +${(lv - 1) * 6}%`,
  },
  {
    id: 'politics', name: '镇政', icon: '政',
    desc: '议会坐得越稳，事情越好推。',
    score: (sim) => 26 + (sim.dev?.proposals || 0) * 18 + (sim.town?.council?.length || 0) * 6,
    effect: (lv) => `提案通过 +${(lv - 1) * 4}% · 公账 +${(lv - 1) * 4}%`,
  },
  {
    id: 'family', name: '家宅', icon: '家',
    desc: '成家的人越多，镇子越像个镇子。',
    score: (sim) => (sim.dev?.weddings || 0) * 22 + (sim.dev?.births || 0) * 26 + couples(sim) * 12,
    effect: (lv) => `好感涨得更快 · 新生儿更健康`,
  },
];

const THRESHOLDS = [0, 55, 130, 240, 400];

function avg(list, f) {
  if (!list.length) return 0;
  return list.reduce((s, x) => s + f(x), 0) / list.length;
}

function couples(sim) {
  return sim.npcs.filter((n) => n.partner).length / 2;
}

export function ensureDev(sim) {
  if (!sim.dev) {
    sim.dev = { trade: 0, study: 0, harvest: 0, crimes: 0, caught: 0, proposals: 0, weddings: 0, births: 0 };
  }
  if (!sim.levels) sim.levels = [];
  if (!sim.milestones) sim.milestones = [];
  return sim.dev;
}

export function levelsOf(sim) {
  ensureDev(sim);
  return SYSTEMS.map((s) => {
    const score = Math.round(s.score(sim));
    let lv = 1;
    for (let i = 0; i < THRESHOLDS.length; i++) if (score >= THRESHOLDS[i]) lv = i + 1;
    const next = THRESHOLDS[lv] ?? null;
    return { id: s.id, name: s.name, icon: s.icon, desc: s.desc, lv, score, next, effect: s.effect(lv) };
  });
}

// 每天算一次；升级记日志、给信仰、写里程碑。
export function tickDevelopment(sim) {
  ensureDev(sim);
  const before = new Map((sim.levels || []).map((l) => [l.id, l.lv]));
  const now = levelsOf(sim);
  sim.levels = now;
  for (const l of now) {
    const prev = before.get(l.id);
    if (prev && l.lv > prev) {
      sim.log(`${l.name}升到 ${l.lv} 级——${l.effect}。`, 'system', []);
      sim.milestones.push({ day: sim.clock.day, id: l.id, lv: l.lv });
      if (sim.faith) {
        sim.faith.points += 6;
        sim.faith.total += 6;
      }
    }
  }
  return now;
}

// 系统加成，给别的模块用
export function levelOf(sim, id) {
  const l = (sim.levels || []).find((x) => x.id === id);
  return l ? l.lv : 1;
}

export function marketBonus(sim) { return 1 + (levelOf(sim, 'market') - 1) * 0.03; }
export function schoolBonus(sim) { return 1 + (levelOf(sim, 'school') - 1) * 0.12; }
export function safetyBonus(sim) { return (levelOf(sim, 'safety') - 1) * 0.06; }
export function farmBonus(sim) { return 1 + (levelOf(sim, 'farm') - 1) * 0.08; }

// 称号：不是装饰，是他这些天活出来的样子
export function titleOf(npc) {
  if (npc.jailedUntil && npc.jailedUntil > 0) return '在押';
  if (npc.sick) return '病中';
  if ((npc.crimes || 0) >= 3) return '惯偷';
  if (npc.education >= 88) return '状元';
  if (npc.education >= 68) return '读书人';
  if (npc.children && npc.children.length >= 2) return '一族之长';
  if (npc.partner) return '有家室的人';
  if (npc.coins >= 260) return '富户';
  const skill = avg(Object.values(npc.skills || {}), (v) => v);
  if (skill >= 7) return '一把好手';
  if (npc.age && npc.age <= 10) return '孩子';
  return '';
}

export function townScore(sim) {
  const lv = sim.levels || levelsOf(sim);
  const sum = lv.reduce((s, l) => s + l.lv, 0);
  return { sum, max: lv.length * 5, avg: sum / lv.length };
}

export function developmentSummary(sim) {
  return (sim.levels || levelsOf(sim)).map((l) => `${l.name} Lv${l.lv}（${l.score}${l.next ? `/${l.next}` : ''}）`).join(' · ');
}

export function clampLevel(lv) {
  return clamp(lv, 1, 5);
}

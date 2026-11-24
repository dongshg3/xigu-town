// decide/decide.js — 决策第 1 段：效用评分（架构 §3.1）。
// 每个目标打分 = 基础分 × 个性抖动(0.9~1.1) + 习惯加成；>1.5 才进入候选。
// 评分过程全程留痕（base/jitter/habit），调试面板可以回答「为什么是这个分」。
// 红线：rng 调用顺序与旧 pickPlan 完全一致（每个 GOAL 依序一次 rng.next()）。
import { habitBonus } from '../learning.js';

export function scoreGoals(GOALS, npc, sim) {
  const scored = GOALS.map((g) => {
    const base = g.score(npc, sim);
    const jitter = 0.9 + sim.rng.next() * 0.2;
    const habit = habitBonus(npc, g.id);
    return { g, base, jitter, habit, score: base * jitter + habit };
  }).filter((c) => c.score > 1.5);
  scored.sort((a, b) => b.score - a.score);
  return scored;
}

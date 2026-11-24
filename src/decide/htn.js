// decide/htn.js — 决策第 2 段：HTN 分解（架构 §3.2）。
// 按分数从高到低尝试前 5 个候选目标的 plan() 分解，第一个产出非空步骤序列的胜出。
// 返回对象带 why 解释记录：选了谁、多少分、其他候选多少分、谁分解失败被跳过。
export function decomposePlan(npc, sim, scored) {
  const skipped = [];
  for (const c of scored.slice(0, 5)) {
    const plan = c.g.plan(npc, sim);
    if (plan && plan.length) {
      return {
        goal: c.g.id,
        label: c.g.label,
        thought: typeof c.g.thought === 'function' ? c.g.thought(npc, sim) : c.g.thought,
        plan,
        score: c.score,
        why: {
          tick: sim.tick,
          chosen: c.g.id,
          score: c.score,
          skipped,
          candidates: scored.slice(0, 5).map((x) => ({
            goal: x.g.id,
            score: Math.round(x.score * 10) / 10,
            base: Math.round(x.base * 10) / 10,
            habit: Math.round(x.habit * 10) / 10,
          })),
        },
      };
    }
    skipped.push(c.g.id);
  }
  return null;
}

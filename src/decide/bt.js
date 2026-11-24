// decide/bt.js — 决策第 3 段：行为树执行（架构 §3.3）。
// 当前形态是顺序计划执行器：计划 = Sequence[goto*, act...]，每 tick 推进一步。
// 语义与旧 agent.tickUpdate 的执行段逐行一致：进行中动作倒计时、路径移动、
// 计划耗尽时先问指令再自主决策、goto 寻路失败走 failPlan 重规划。
// 后续扩展（并行节点、条件装饰器、中断恢复）在此层加节点类型，不动模拟层。
import { clockOf } from '../core.js';
import { orderPlan } from '../orders.js';

export function tickBehavior(npc, sim, dt = 1) {
  const sleeping = npc.act?.id === 'sleep';
  const n = npc.needs;
  const w = sim.world;

  if (npc.act) {
    if (sleeping) {
      npc.sleeping = true;
      if (n.energy >= 99.5 && clockOf(sim.tick).hour >= 6) {
        npc.finishAct(sim);
      } else {
        npc.act.ticks -= dt;
        if (npc.act.ticks <= 0) npc.finishAct(sim);
      }
    } else {
      npc.act.ticks -= dt;
      if (npc.act.ticks <= 0) npc.finishAct(sim);
    }
    return;
  }
  npc.sleeping = false;

  if (npc.path && npc.path.length) {
    npc.moveAlongPath(sim, dt);
    return;
  }

  if (!npc.plan.length || npc.stepIndex >= npc.plan.length) {
    if (npc.order) {
      const op = orderPlan(npc, sim);
      if (op) {
        npc.plan = op.steps;
        npc.stepIndex = 0;
        npc.goalId = 'order';
        npc.goalLabel = op.label;
        npc.note('按旅人的话行动：' + op.label, 'order');
      } else {
        npc.order = null;
        npc.plan = [];
        npc.choosePlan(sim);
      }
    } else {
      npc.choosePlan(sim);
    }
  }
  if (!npc.plan.length) return;

  // 交互点排队中：原地等到 waitUntil，不推进步骤
  if (npc.waitUntil && sim.tick < npc.waitUntil) return;

  const step = npc.plan[npc.stepIndex];
  if (!step) { npc.plan = []; return; }

  if (step.kind === 'goto') {
    if (npc.x === step.x && npc.y === step.y) { npc.stepIndex++; return; }
    if (sim.lod?.enabled) {
      // 时间切片寻路（性能方案 §5）：提交请求，结算前原地等待，不堵主线程
      if (npc._pq) {
        if (!npc._pq.done) {
          if (sim.tick - (npc._pq.at ?? 0) <= 10) return;   // 等本刻结算
          npc._pq = null;   // 超时=请求被队列丢弃：重新提交，绝不干等（防软锁）
        }
      }
      if (npc._pq) {
        const { path: p, tx, ty } = npc._pq;
        npc._pq = null;
        if (tx !== step.x || ty !== step.y) return;   // 旧目标的结果，丢弃，下刻重新提交
        if (!p) { npc.failPlan(sim, '路走不通'); return; }
        if (!p.length) { npc.stepIndex++; return; }
        npc.path = p;
        npc.moveAlongPath(sim, dt);
        return;
      }
      npc._pq = { done: false, path: null, at: sim.tick };
      sim.pathq.submit(npc, step.x, step.y, sim.lod.tierOf(npc));
      return;
    }
    const p = w.findPath(Math.round(npc.x), Math.round(npc.y), step.x, step.y);
    if (!p || p.length === 0) {
      if (p && p.length === 0) { npc.stepIndex++; return; }
      npc.failPlan(sim, '路走不通');
      return;
    }
    npc.path = p;
    npc.moveAlongPath(sim, dt);
  } else if (step.kind === 'act') {
    npc.startAct(sim, step);
  } else {
    npc.stepIndex++;
  }
}

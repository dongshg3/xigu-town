// orders.js — 玩家对居民下达的指令。
// 一条指令不是"传送"，而是把这个人接下来的计划换掉：他还是自己走过去、自己干活、
// 干完在个人史里留下一条记录。玩家能指挥他，但改不了他的脾气。
import { clamp } from './core.js';

export const ORDER_KINDS = [
  { id: 'work', label: '去上工', hint: '按他的职业去干活' },
  { id: 'rest', label: '回家休息', hint: '回家睡觉，恢复精力' },
  { id: 'talk', label: '去聊聊', hint: '找指定的那个人说话' },
  { id: 'school', label: '去学堂', hint: '上一堂课，涨学识' },
  { id: 'buy', label: '去市集', hint: '去市集买点吃的' },
  { id: 'patrol', label: '去巡查', hint: '沿主街走一圈，看看有没有事' },
];

const label = (id) => ORDER_KINDS.find((k) => k.id === id)?.label || id;

export function issueOrder(sim, npcId, kind, arg) {
  const npc = sim.npcById(npcId);
  if (!npc) return { ok: false, msg: '没这个人' };
  if (npc.act?.id === 'sleep') return { ok: false, msg: '他睡着了，叫不醒。' };
  if (!ORDER_KINDS.some((k) => k.id === kind)) return { ok: false, msg: '没有这种指令。' };

  // 你得先找到人：站在他附近，或者你是镇长（镇长的指令靠威信传下去）
  const near = Math.hypot(npc.x - sim.player.x, npc.y - sim.player.y) <= 4.5;
  const isMayor = sim.town?.mayor === 'player';
  if (!near && !isMayor) return { ok: false, msg: '离得太远，先走近他再说。' };

  const order = {
    kind,
    arg: arg ?? null,
    issued: sim.tick,
    deadline: sim.tick + 160,
    label: label(kind),
  };
  npc.order = order;
  npc.plan = [];
  npc.stepIndex = 0;
  npc.thought = `旅人让他${order.label}`;
  npc.note(`旅人让他${order.label}`, 'order');
  npc.needs.purpose = clamp(npc.needs.purpose + 2, 0, 100);
  if (near) {
    npc.rel('player').affinity = clamp(npc.rel('player').affinity + 1.5, 0, 100);
  }
  sim.log(`${npc.name}接了旅人的话：${order.label}。`, 'social', [npc.id]);
  return { ok: true, order };
}

export function clearOrder(npc, why = 'done') {
  if (!npc.order) return;
  npc.note(npc.order.label + (why === 'done' ? '：办完了' : '：没办成'), 'order');
  npc.order = null;
  npc.plan = [];
  npc.stepIndex = 0;
}

// 把指令翻译成一个普通计划：后续的移动、干活、结算全部复用原有逻辑。
export function orderPlan(npc, sim) {
  const o = npc.order;
  if (!o) return null;
  if (sim.tick > o.deadline) { clearOrder(npc, 'expire'); return null; }
  const go = (x, y, actId, opts = {}) => ({
    goalId: 'order',
    label: o.label,
    steps: [
      { kind: 'goto', x, y },
      { kind: 'act', id: actId, ...opts },
    ],
  });

  if (o.kind === 'work') {
    const b = sim.world.findBuilding(npc.profile.work) || sim.world.findBuilding(npc.profile.home);
    if (!b) return null;
    return go(b.spot.x, b.spot.y, 'work');
  }
  if (o.kind === 'rest') {
    const b = sim.world.findBuilding(npc.profile.home);
    if (!b) return null;
    return go(b.spot.x, b.spot.y, 'sleep');
  }
  if (o.kind === 'talk') {
    const target = sim.npcById(o.arg);
    if (!target) return null;
    return {
      goalId: 'order',
      label: o.label,
      steps: [
        { kind: 'goto', x: target.x, y: target.y },
        { kind: 'act', id: 'chat', target: target.id },
      ],
    };
  }
  if (o.kind === 'school') {
    const b = sim.world.findBuilding('学堂');
    if (!b) return null;
    return go(b.spot.x, b.spot.y, 'study');
  }
  if (o.kind === 'buy') {
    const b = sim.world.findBuilding('市集') || sim.world.findBuilding('杂货铺') || sim.world.findBuilding('酒馆');
    if (!b) return null;
    return go(b.spot.x, b.spot.y, 'buyMeal');
  }
  if (o.kind === 'patrol') {
    return {
      goalId: 'order',
      label: o.label,
      steps: [
        { kind: 'goto', x: 6, y: 15 },
        { kind: 'act', id: 'look' },
        { kind: 'goto', x: 28, y: 16 },
        { kind: 'act', id: 'look' },
      ],
    };
  }
  return null;
}

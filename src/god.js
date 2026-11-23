// 神迹：玩家不是镇长，是这镇子上空的一只手。
// 信仰值来自居民过得怎么样；花掉它，就能改动一个人的命。
import { clamp } from './core.js';
import { TRAITS } from './data.js';
import { mergeTraits } from './agent.js';

export const POWERS = [
  { id: 'bless', name: '祝福', cost: 8, hint: '让他今天顺一点：好感、心情、乐趣都涨。' },
  { id: 'curse', name: '惩戒', cost: 10, hint: '让他难受：好感掉，成就感和心情一起沉。' },
  { id: 'inspire', name: '点醒', cost: 6, hint: '给他一个念头：成就感大涨，学识也跟着动。' },
  { id: 'reshape', name: '重塑', cost: 24, hint: '改写他的性格——随机多出一种天性，从此行为都受影响。' },
  { id: 'heal', name: '治愈', cost: 12, hint: '把病痛拿走，健康回到 92。' },
];

export function ensureFaith(sim) {
  if (!sim.faith) {
    sim.faith = { points: 16, total: 16, spent: 0, acts: 0, level: 1, log: [] };
  }
  return sim.faith;
}

export function systemBonus(sim) {
  const lv = sim.levels || [];
  return lv.reduce((s, l) => s + (l.lv - 1), 0) * 0.15;
}

export function faithIncome(sim) {
  const avgMood = sim.npcs.reduce((s, n) => s + n.mood, 0) / Math.max(1, sim.npcs.length);
  const beauty = sim.world.beauty();
  const base = 1.6 + (avgMood / 100) * 2.2 + beauty * 0.18 + systemBonus(sim);
  return Math.max(1, Math.round(base));
}

export function tickFaith(sim) {
  const f = ensureFaith(sim);
  const gain = faithIncome(sim);
  f.points += gain;
  f.total += gain;
  f.level = 1 + Math.min(4, Math.floor(f.spent / 60));
  f.log.unshift({ day: sim.clock.day, gain });
  if (f.log.length > 24) f.log.length = 24;
  if (gain >= 6) sim.log(`镇上的日子还算顺，信仰 +${gain}。`, 'system', []);
  return gain;
}

function pay(sim, cost) {
  const f = ensureFaith(sim);
  if (f.points < cost) return false;
  f.points -= cost;
  f.spent += cost;
  f.acts += 1;
  f.level = 1 + Math.min(4, Math.floor(f.spent / 60));
  return true;
}

export function godAct(sim, npcId, powerId) {
  const p = POWERS.find((x) => x.id === powerId);
  const npc = sim.npcById(npcId);
  if (!p || !npc) return { ok: false, msg: '没有这个神迹。' };
  if (!pay(sim, p.cost)) return { ok: false, msg: `信仰不够（需要 ${p.cost}）。` };

  if (p.id === 'bless') {
    const r = npc.rel('player');
    r.affinity = clamp(r.affinity + 10, 0, 100);
    r.trust = clamp(r.trust + 4, 0, 100);
    npc.needs.fun = clamp(npc.needs.fun + 12, 0, 100);
    if (npc.mind) npc.mind.moodBase = clamp(npc.mind.moodBase + 2, -7, 7);
    npc.note('像被什么轻轻扶了一把，心里松快。', 'god');
    npc.addMemory({ text: '有个念头忽然变得很轻，好像有人在替我撑着。', valence: 3, strength: 0.7, kind: 'god' });
    sim.log(`${npc.name}莫名其妙地顺了一点。`, 'drama', [npc.id]);
  } else if (p.id === 'curse') {
    const r = npc.rel('player');
    r.affinity = clamp(r.affinity - 12, 0, 100);
    r.trust = clamp(r.trust - 6, 0, 100);
    npc.needs.purpose = clamp(npc.needs.purpose - 10, 0, 100);
    npc.needs.fun = clamp(npc.needs.fun - 10, 0, 100);
    if (npc.mind) npc.mind.moodBase = clamp(npc.mind.moodBase - 3, -7, 7);
    npc.note('今天做什么都不对劲。', 'god');
    npc.addMemory({ text: '说不上来，今天像被什么东西压着。', valence: -3, strength: 0.8, kind: 'god' });
    sim.log(`${npc.name}今天格外不顺。`, 'drama', [npc.id]);
  } else if (p.id === 'inspire') {
    npc.needs.purpose = clamp(npc.needs.purpose + 20, 0, 100);
    npc.education = Math.min(100, npc.education + 2);
    npc.note('忽然想明白了一件事。', 'god');
    npc.addMemory({ text: '刚才那一下，像有人在我脑子里点了一盏灯。', valence: 2.6, strength: 0.7, kind: 'god' });
    sim.log(`${npc.name}像忽然想通了什么。`, 'drama', [npc.id]);
  } else if (p.id === 'reshape') {
    const owned = new Set(npc.traits);
    const pool = Object.entries(TRAITS)
      .filter(([id]) => !owned.has(id))
      .map(([id, t]) => ({ id, name: t.name }));
    if (!pool.length) return { ok: false, msg: '他的天性已经全了。' };
    const t = pool[Math.floor(sim.rng.next() * pool.length)];
    npc.traits.push(t.id);
    npc.mods = mergeTraits(npc.traits);
    npc.profile.traits = npc.traits.slice();
    npc.note(`心里多了一样东西：${t.name}。`, 'god');
    npc.addMemory({ text: `从那以后，我好像变得${t.name}了。`, valence: 1.4, strength: 0.9, kind: 'god' });
    sim.log(`你改了${npc.name}的性子——${t.name}。`, 'drama', [npc.id]);
  } else if (p.id === 'heal') {
    npc.health = 92;
    npc.sick = false;
    npc.note('病忽然好了。', 'god');
    npc.addMemory({ text: '昨天还烧得厉害，今天一早起来，全好了。', valence: 3, strength: 0.8, kind: 'god' });
    sim.log(`${npc.name}的病忽然好了。`, 'drama', [npc.id]);
  }

  ensureFaith(sim).log.unshift({ day: sim.clock.day, power: p.name, who: npc.name });
  return { ok: true, msg: `${p.name}：${npc.name}` };
}

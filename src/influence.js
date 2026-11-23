// 人与人之间的影响：不是只有「聊过天」，而是手艺会传、脾气会染、仇会结。
// 每天走一遍，只做四件事：传艺、结怨、探病、情绪传染。
import { clamp } from './core.js';

export const INFLUENCE_LOG_LIMIT = 40;

function ensureLog(sim) {
  if (!sim.influence) sim.influence = [];
  return sim.influence;
}

export function tickInfluence(sim) {
  const log = ensureLog(sim);
  const rng = sim.rng;
  const people = sim.npcs;

  // 1) 传艺：学识高的人带一个笨一点的
  for (const a of people) {
    if (a.education < 55 || a.sick || a.jailedUntil) continue;
    const pupils = people.filter(
      (b) => b !== a && b.education < a.education - 12 && b.age >= 10 && !b.sick && !b.jailedUntil
    );
    if (!pupils.length) continue;
    if (!rng.chance(0.35)) continue;
    const b = rng.pick(pupils);
    b.education = Math.min(100, b.education + 0.6);
    const keys = Object.keys(b.skills || {});
    if (keys.length) {
      const k = rng.pick(keys);
      b.skills[k] = Math.min(10, Math.round((b.skills[k] + 0.12) * 100) / 100);
    }
    const r = b.rel(a.id);
    r.affinity = clamp(r.affinity + 2.4, 0, 100);
    r.familiarity = clamp(r.familiarity + 2, 0, 100);
    b.addMemory({ text: `${a.name}教了我一点门道。`, valence: 1.8, strength: 0.5, kind: 'learn', about: [a.id] });
    const line = `${a.name}带了带${b.name}，教了点手上的门道。`;
    log.unshift(line);
    if (rng.chance(0.5)) sim.log(line, 'social', [a.id, b.id]);
  }

  // 2) 结怨：同行、都不顺、又还不够熟
  for (const a of people) {
    if (a.sick || a.jailedUntil) continue;
    for (const b of people) {
      if (b === a || b.sick || b.jailedUntil) continue;
      if (a.profile.job !== b.profile.job) continue;
      const r = a.rel(b.id);
      if (r.affinity < 24 || r.affinity > 62) continue;
      if (a.mood > 48 || b.mood > 48) continue;
      if (!rng.chance(0.1)) continue;
      r.affinity = clamp(r.affinity - 7, 0, 100);
      b.rel(a.id).affinity = clamp(b.rel(a.id).affinity - 7, 0, 100);
      a.addMemory({ text: `跟${b.name}为同一件事别了苗头。`, valence: -2.2, strength: 0.6, kind: 'quarrel', about: [b.id] });
      b.addMemory({ text: `${a.name}今天说话带刺。`, valence: -2, strength: 0.55, kind: 'quarrel', about: [a.id] });
      const line = `${a.name}和${b.name}为同一桩活计别了苗头。`;
      log.unshift(line);
      if (rng.chance(0.7)) sim.log(line, 'drama', [a.id, b.id]);
    }
  }

  // 3) 探病：交情够的人会去看看
  for (const sick of people) {
    if (!sick.sick) continue;
    const friends = people.filter((b) => b !== sick && b.rel(sick.id).affinity >= 52 && !b.sick && !b.jailedUntil);
    if (!friends.length || !rng.chance(0.45)) continue;
    const f = rng.pick(friends);
    sick.health = Math.min(100, sick.health + 3);
    const r = f.rel(sick.id);
    r.affinity = clamp(r.affinity + 3, 0, 100);
    sick.addMemory({ text: `${f.name}来看过我，还带了点吃的。`, valence: 2.4, strength: 0.6, kind: 'care', about: [f.id] });
    const line = `${f.name}去看了${sick.name}，坐了会儿。`;
    log.unshift(line);
    if (rng.chance(0.6)) sim.log(line, 'social', [f.id, sick.id]);
  }

  // 4) 情绪传染：一个人过得好，会慢慢带起来身边的人
  const avgMoodBase = people.reduce((s, n) => s + (n.mind?.moodBase || 0), 0) / Math.max(1, people.length);
  for (const n of people) {
    if (!n.mind) continue;
    if (Math.abs(avgMoodBase) < 0.4) continue;
    const pull = (avgMoodBase - n.mind.moodBase) * 0.18;
    n.mind.moodBase = clamp(n.mind.moodBase + pull, -7, 7);
  }

  if (log.length > INFLUENCE_LOG_LIMIT) log.length = INFLUENCE_LOG_LIMIT;
  return log;
}

// 给 UI：一个人对谁有影响、被谁影响
export function influenceOf(sim, npc) {
  const rels = [...npc.rels.entries()]
    .map(([id, r]) => ({ id, name: sim.npcById(id)?.name || id, ...r }))
    .sort((a, b) => b.affinity - a.affinity);
  return {
    close: rels.slice(0, 3),
    tense: rels.filter((r) => r.affinity < 32).slice(0, 2),
  };
}

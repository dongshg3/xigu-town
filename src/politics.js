// politics.js — 镇子怎么管事：议会、选举、政策。玩家的影响力来自关系，不是头衔。
import { clamp } from './core.js';

export const STANCES = {
  welfare: { key: 'welfare', label: '福利派', tax: 0.085, fund: 0.72, land: false },
  lowtax: { key: 'lowtax', label: '低税派', tax: 0.038, fund: 0.34, land: true },
  build: { key: 'build', label: '建设派', tax: 0.062, fund: 0.82, land: true },
  order: { key: 'order', label: '守成派', tax: 0.07, fund: 0.5, land: false },
};

export function stanceOf(npc) {
  const t = new Set(npc.profile.traits || []);
  if (npc.job === 'merchant') return 'lowtax';
  if (npc.job === 'guard') return 'order';
  if (npc.job === 'carpenter' || npc.job === 'farmer') return 'build';
  if (npc.job === 'doctor' || npc.job === 'artist') return 'welfare';
  if (t.has('generous') || t.has('warm')) return 'welfare';
  if (t.has('shrewd')) return 'lowtax';
  if (t.has('stubborn') || t.has('suspicious')) return 'order';
  return 'build';
}

// 一个人的"声望"：别人怎么看他。这是选举的唯一依据。
export function standingOf(sim, npc) {
  const rels = [...npc.rels.values()];
  if (!rels.length) return 40;
  return rels.reduce((s, r) => s + r.affinity, 0) / rels.length;
}

// 玩家在镇上的声望：所有人对你的好感均值。
export function playerStanding(sim) {
  const rels = [...sim.playerRels.values()];
  if (!rels.length) return 0;
  return rels.reduce((s, r) => s + r.affinity, 0) / rels.length;
}

export function ensureCouncil(sim) {
  if (!sim.town) return null;
  if (sim.town.council && sim.town.council.length) return sim.town.council;
  return elect(sim);
}

export function runForMayor(sim) {
  const town = sim.town;
  const standing = playerStanding(sim);
  if (town.mayor === 'player') return { ok: false, msg: '你已经是镇长了。' };
  if (standing < 40) return { ok: false, msg: '声望还不够（' + Math.round(standing) + '/40）。' };
  town.playerCandidate = true;
  sim.log('你宣布参选镇长。镇上的人开始拿你和现任比较。', 'drama', []);
  for (const n of sim.npcs) {
    n.addMemory({ text: '旅人说要参选镇长。', valence: 0.6, strength: 0.5, kind: 'politics', about: ['player'] });
  }
  return { ok: true, standing };
}

export function elect(sim) {
  const town = sim.town;
  const rng = sim.rng;
  const scored = sim.npcs.map((n) => {
    const stance = stanceOf(n);
    const votes = town.votes?.[n.id] || 0;
    return {
      id: n.id,
      name: n.name,
      stance,
      score: standingOf(sim, n) + rng.float(-4, 4) + votes * 12 + (stance === town.lastStance ? 4 : 0),
    };
  });
  if (town.playerCandidate) {
    const mine = town.votes?.player || 0;
    scored.push({ id: 'player', name: '你', stance: 'build', score: playerStanding(sim) * 1.15 + rng.float(-3, 3) + mine * 14 });
    town.playerCandidate = false;
  }
  scored.sort((a, b) => b.score - a.score);

  town.council = scored.slice(0, 3).map((s) => ({ id: s.id, name: s.name, stance: s.stance }));
  town.mayor = scored[0].id;
  const mayor = sim.npcById(scored[0].id);
  if (scored[0].id === 'player') {
    town.mayor = 'player';
    town.lastStance = 'build';
    town.taxRate = STANCES.build.tax;
    town.buildFund = STANCES.build.fund;
    sim.log('你当选了镇长。从今天起，镇上的钱怎么花，你说了算。', 'drama', []);
    return town.council;
  }
  town.lastStance = scored[0].stance;
  const st = STANCES[scored[0].stance];
  town.taxRate = st.tax;
  town.buildFund = st.fund;
  if (st.land) town.landOpen = true;
  town.votes = {};
  town.nextElectionDay = sim.clock.day + 7;
  sim.log(`${scored[0].name}当选镇长（${st.label}），议会里还有${scored[1].name}和${scored[2].name}。`, 'drama', [scored[0].id]);
  if (mayor) mayor.needs.purpose = clamp(mayor.needs.purpose + 12, 0, 100);
  return town.council;
}

export function voteFor(sim, npcId) {
  const town = sim.town;
  if (!sim.npcById(npcId)) return { ok: false, msg: '没这个人' };
  if (town.votes[npcId]) return { ok: false, msg: '这次你已经表过态了' };
  town.votes[npcId] = 1;
  sim.log(`你把这一票给了${sim.npcById(npcId).name}。`, 'system', []);
  return { ok: true };
}

const PROPOSALS = {
  land: { label: '开放镇外土地', apply: (t) => { t.landOpen = true; } },
  lowtax: { label: '把税降下来', apply: (t) => { t.taxRate = 0.04; } },
  welfare: { label: '加税修公共设施', apply: (t) => { t.taxRate = 0.09; t.buildFund = 0.75; } },
};

export function proposalsFor(sim) {
  return Object.entries(PROPOSALS).map(([id, p]) => ({ id, label: p.label }));
}

// 提案能否通过，取决于你在镇上的声望和议会席位。
export function propose(sim, id) {
  const town = sim.town;
  const p = PROPOSALS[id];
  if (!p) return { ok: false, msg: '没有这个提案' };
  const standing = playerStanding(sim);
  if (standing < 28) return { ok: false, msg: `你的面子还不够（声望 ${standing.toFixed(0)}/28）` };
  const allies = town.council.filter((c) => {
    const n = sim.npcById(c.id);
    return n && (sim.playerRel(c.id).affinity || 0) >= 45;
  }).length;
  const chance = clamp(0.28 + standing / 220 + allies * 0.09, 0.2, 0.86);
  if (!sim.rng.chance(chance)) {
    sim.log(`你提了「${p.label}」，议会没接。`, 'system', []);
    return { ok: false, msg: '议会否决了' };
  }
  p.apply(town);
  sim.log(`「${p.label}」通过了。`, 'drama', []);
  return { ok: true, chance };
}

export function politicsSummary(sim) {
  const t = sim.town;
  if (!t) return null;
  const mayor = sim.npcById(t.mayor);
  return {
    mayor: mayor ? mayor.name : '—',
    mayorStance: t.lastStance ? STANCES[t.lastStance].label : '—',
    council: t.council.map((c) => c.name),
    taxRate: t.taxRate,
    landOpen: t.landOpen,
    standing: playerStanding(sim),
    nextElectionDay: t.nextElectionDay,
    proposals: proposalsFor(sim),
  };
}

export function tickPolitics(sim) {
  if (!sim.town) return;
  if (sim.clock.day >= sim.town.nextElectionDay) elect(sim);
}
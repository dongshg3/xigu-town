// territory.js — 版图：镇外还有地，买下来、盖房子、就有人搬进来。
// 这是"扩大版图"的最小闭环：钱 → 政策 → 土地 → 房屋 → 人口 → 更多产出。
import { clamp } from './core.js';

export const PLOTS = [
  { id: 'east-n', x: 33, y: 4, w: 3, h: 3 },
  { id: 'east-m', x: 33, y: 9, w: 3, h: 3 },
  { id: 'south-e', x: 33, y: 21, w: 3, h: 3 },
  { id: 'south-w', x: 25, y: 26, w: 3, h: 3 },
];

export function ensurePlots(world) {
  if (world.plots) return world.plots;
  world.plots = PLOTS.map((p) => ({ ...p, claimed: false, built: false, houseName: null }));
  return world.plots;
}

export function claimCost(world) {
  const claimed = (world.plots || []).filter((p) => p.claimed).length;
  return 120 + claimed * 45;
}

export function plotAt(world, x, y) {
  return (world.plots || []).find((p) => x >= p.x && x < p.x + p.w && y >= p.y && y < p.y + p.h) || null;
}

export function claimPlot(sim, id) {
  const plots = ensurePlots(sim.world);
  const p = plots.find((q) => q.id === id);
  if (!p) return { ok: false, msg: '没有这块地' };
  if (p.claimed) return { ok: false, msg: '这块地已经是镇上的了' };
  if (!sim.town?.landOpen) return { ok: false, msg: '镇公所还没开放购地（先推动政策）' };
  const cost = claimCost(sim.world);
  if (sim.player.coins < cost) return { ok: false, msg: `还差 ${cost - sim.player.coins} 硬币` };
  sim.player.coins -= cost;
  p.claimed = true;
  // 划进版图就等于清场：树砍掉、石头搬走，留出能盖房的空地
  for (let yy = p.y; yy < p.y + p.h; yy++) {
    for (let xx = p.x; xx < p.x + p.w; xx++) {
      const tile = sim.world.tile(xx, yy);
      if (!tile) continue;
      tile.obj = null;
      tile.crop = null;
      if (tile.terrain !== 'water') tile.terrain = 'grass';
    }
  }
  sim.log(`你花 ${cost} 硬币，把镇东那块地划进了版图。`, 'build', []);
  return { ok: true, cost };
}

// 新居建成的那一刻：把地块标成"有房"，第二天有人搬来。
export function onHouseBuilt(sim, x, y) {
  const plots = ensurePlots(sim.world);
  const p = plotAt(sim.world, x, y) || plots.find((q) => q.claimed && !q.built);
  if (!p || p.built) return null;
  p.built = true;
  const name = `新居${plots.filter((q) => q.built).length}`;
  p.houseName = name;
  sim.world.addHouse(x, y, name);
  sim.log(`${name}盖好了，屋顶的木头还是新的。`, 'build', []);
  sim.pendingSettlers = (sim.pendingSettlers || 0) + 1;
  return p;
}

const NAMES = ['阿杏', '阿岩', '小舟', '阿穗', '青禾', '小满'];
const TITLES = [
  ['果农', 'farmer'], ['石匠', 'carpenter'], ['织工', 'artist'],
  ['药童', 'doctor'], ['跑船的', 'fisher'], ['帮工', 'guard'],
];
const TRAIT_POOL = ['diligent', 'warm', 'curious', 'steady', 'generous', 'honest', 'optimist', 'handy', 'shrewd', 'sensitive'];
const COLORS = ['#c98f5a', '#7fa8c9', '#b58fc9', '#8fc99a', '#c9b45a', '#c98f9a'];

let settlerSeq = 0;

export function makeSettlerProfile(sim) {
  const rng = sim.rng;
  settlerSeq++;
  const name = `${NAMES[settlerSeq % NAMES.length]}${settlerSeq > 5 ? settlerSeq : ''}`;
  const [title, job] = TITLES[rng.int(0, TITLES.length - 1)];
  const traits = [];
  while (traits.length < 3) {
    const t = TRAIT_POOL[rng.int(0, TRAIT_POOL.length - 1)];
    if (!traits.includes(t)) traits.push(t);
  }
  const id = `s${settlerSeq}`;
  return {
    id,
    name,
    age: rng.int(19, 46),
    title,
    job,
    bio: '从下游搬来的新住户，行李不多，话也不多。',
    desire: '在这里站稳脚跟。',
    fear: '再搬一次家。',
    secret: '离开上一处时，欠了人情没还。',
    skills: { [job]: 3 + rng.int(0, 4) },
    home: `新居${(sim.world.plots || []).filter((p) => p.built).length}`,
    work: '镇公所',
    coins: 20 + rng.int(0, 25),
    color: COLORS[settlerSeq % COLORS.length],
    traits,
  };
}
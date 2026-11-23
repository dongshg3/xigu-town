// economy.js — 镇子的钱怎么转：市价、买卖、工资、委托、酒馆。
// 设计原则：所有数字都要能解释，玩家能算出来自己为什么赚或亏。
import { clamp } from './core.js';

export const GOODS = {
  wood: { name: '木材', base: 5 },
  stone: { name: '石料', base: 7 },
  food: { name: '食物', base: 4 },
  seeds: { name: '种子', base: 6 },
};

export function ensureLedger(sim) {
  if (sim.town) return sim.town;
  sim.town = {
    coins: 240,
    taxRate: 0.06,
    buildFund: 0.5,
    landOpen: false,
    council: [],
    mayor: null,
    nextElectionDay: 7,
    votes: {},
    orders: [],
    history: [],
    lastWages: 0,
    lastTax: 0,
  };
  return sim.town;
}

// 价格 = 基础价 × 稀缺度。库存越少越贵，镇子越穷越卖不出价。
export function priceOf(sim, good) {
  const g = GOODS[good];
  if (!g) return 0;
  const stock = sim.world.stock[good] ?? 0;
  const scarcity = clamp(1.45 - stock / 42, 0.62, 1.6);
  const purse = sim.town?.coins ?? 200;
  const demand = clamp(0.9 + purse / 900, 0.85, 1.25);
  return Math.max(1, Math.round(g.base * scarcity * demand));
}

export function buy(sim, good, qty = 1) {
  const p = priceOf(sim, good) * qty;
  if (sim.player.coins < p) return { ok: false, msg: `钱不够（要 ${p}）` };
  if ((sim.world.stock[good] ?? 0) < qty) return { ok: false, msg: '仓里没这么多货' };
  sim.player.coins -= p;
  sim.player.bag[good] = (sim.player.bag[good] || 0) + qty;
  sim.world.stock[good] -= qty;
  sim.log(`你买了 ${qty} 份${GOODS[good].name}，花了 ${p} 硬币。`, 'system', []);
  return { ok: true, paid: p, price: priceOf(sim, good) };
}

export function sell(sim, good, qty = 1) {
  const have = sim.player.bag[good] || 0;
  if (have < qty) return { ok: false, msg: '你身上没有这么多' };
  const p = Math.max(1, Math.round(priceOf(sim, good) * 0.8 * qty));
  sim.player.bag[good] = have - qty;
  sim.world.stock[good] = (sim.world.stock[good] || 0) + qty;
  sim.player.coins += p;
  sim.log(`你卖掉 ${qty} 份${GOODS[good].name}，得到 ${p} 硬币。`, 'system', []);
  return { ok: true, earned: p };
}

// 镇子缺什么就派什么委托，价格比市价高一点——这是玩家稳定赚钱的正路。
export function refreshOrders(sim) {
  const town = ensureLedger(sim);
  town.orders = town.orders.filter((o) => o.expires > sim.clock.day);
  if (town.orders.length >= 3) return;
  const needs = ['wood', 'stone', 'food'].filter((g) => (sim.world.stock[g] ?? 0) < 24);
  for (const good of needs) {
    if (town.orders.some((o) => o.good === good)) continue;
    const need = good === 'food' ? 10 : 8;
    const reward = Math.round(priceOf(sim, good) * need * 1.45) + 10;
    town.orders.push({ id: `o${sim.tick}-${good}`, good, need, reward, expires: sim.clock.day + 3 });
    sim.log(`镇公所贴出委托：${need} 份${GOODS[good].name}，${reward} 硬币。`, 'system', []);
  }
}

export function fulfillOrder(sim, orderId) {
  const town = ensureLedger(sim);
  const o = town.orders.find((x) => x.id === orderId);
  if (!o) return { ok: false, msg: '委托已过期' };
  if ((sim.player.bag[o.good] || 0) < o.need) return { ok: false, msg: '货不够' };
  sim.player.bag[o.good] -= o.need;
  sim.world.stock[o.good] = (sim.world.stock[o.good] || 0) + o.need;
  sim.player.coins += o.reward;
  town.orders = town.orders.filter((x) => x.id !== orderId);
  sim.log(`你交上了 ${o.need} 份${GOODS[o.good].name}，拿到 ${o.reward} 硬币。`, 'system', []);
  for (const n of sim.npcs) {
    if (n.job === 'mayor' || n.profile.role === 'mayor') n.needs.purpose = clamp(n.needs.purpose + 3, 0, 100);
  }
  return { ok: true, earned: o.reward };
}

// 一天结束：收税 → 发工资 → 补委托。钱不够就欠着，居民会不高兴。
export function settleDay(sim) {
  const town = ensureLedger(sim);
  let tax = 1;
  for (const n of sim.npcs) tax += Math.round(n.coins * town.taxRate * 0.5);
  town.coins += tax;
  town.lastTax = tax;

  let wages = 0;
  for (const n of sim.npcs) {
    const job = n.job;
    const base = { farmer: 6, carpenter: 8, artist: 5, doctor: 9, tavern: 7, fisher: 5, guard: 7, merchant: 8 }[job] || 5;
    const skill = n.skills[job] || 4;
    const wage = Math.round(base + skill * 0.6);
    wages += wage;
  }
  if (town.coins >= wages) {
    town.coins -= wages;
    for (const n of sim.npcs) {
      const base = { farmer: 6, carpenter: 8, artist: 5, doctor: 9, tavern: 7, fisher: 5, guard: 7, merchant: 8 }[n.job] || 5;
      n.coins += Math.round(base + (n.skills[n.job] || 4) * 0.6);
    }
    town.lastWages = wages;
  } else {
    town.lastWages = 0;
    for (const n of sim.npcs) {
      n.needs.purpose = clamp(n.needs.purpose - 4, 0, 100);
      n.mind.moodBase = clamp((n.mind.moodBase || 0) - 0.3, -7, 7);
    }
    sim.log('这个月镇上发不出工钱，大家脸色都不太好看。', 'drama', []);
  }
  if (Math.abs(tax) > 0) town.history.push({ day: sim.clock.day, tax, wages });
  if (town.history.length > 30) town.history.shift();
  refreshOrders(sim);
}

// 玩家在酒馆吃一顿：钱进小满口袋，饥饿回满，社交小涨。
export function eatAtTavern(sim) {
  const tavern = sim.npcs.find((n) => n.job === 'tavern');
  const cost = 6;
  if (sim.player.coins < cost) return { ok: false, msg: '吃不起' };
  if ((sim.world.stock.food ?? 0) < 1) return { ok: false, msg: '酒馆没食材了' };
  sim.player.coins -= cost;
  sim.world.stock.food -= 1;
  if (tavern) { tavern.coins += cost; tavern.needs.social = clamp(tavern.needs.social + 5, 0, 100); }
  sim.player.hunger = clamp((sim.player.hunger ?? 60) + 45, 0, 100);
  sim.log('你在酒馆吃了一顿热的。', 'system', []);
  return { ok: true };
}
// 旅人打零工：镇上按天结算，出的是力气，换的是硬币和一点人情。
export function workShift(sim) {
  const hour = sim.clock.hour;
  if (hour < 8 || hour >= 18) return { ok: false, msg: '这个点没人开工。' };
  if (sim.player.hunger < 18) return { ok: false, msg: '饿得没力气，先吃点东西。' };
  if (sim.tick < (sim._shiftAt || 0) + 24) return { ok: false, msg: '刚干完一趟，歇口气。' };
  const pay = 11 + sim.rng.int(0, 5);
  if (sim.town.coins < pay) return { ok: false, msg: '镇上的钱不够付工钱。' };
  sim.town.coins -= pay;
  sim.player.coins += pay;
  sim.player.hunger = Math.max(0, sim.player.hunger - 14);
  sim._shiftAt = sim.tick;
  for (const n of sim.npcs) {
    const d = Math.hypot(n.x - sim.player.x, n.y - sim.player.y);
    if (d <= 6.5) n.addMemory({ text: '旅人今天在镇上帮了半天工。', valence: 0.8, strength: 0.3, kind: 'work', about: ['player'] });
  }
  sim.log('你在镇上帮了半天工，拿到 ' + pay + ' 枚硬币。', 'work', []);
  return { ok: true, pay };
}
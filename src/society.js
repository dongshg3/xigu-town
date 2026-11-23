// society.js — 身体、学堂、家庭、恋爱与治安。
// 这一层管的是"人怎样被日子磨损、又怎样重新长回来"：
// 健康会掉、病会传、学堂能把人变聪明、两个人会结成一家、走投无路的人会去偷。
import { clamp } from './core.js';
import { NAMES_F, NAMES_M } from './data.js';
import { NPC } from './agent.js';

export function ensureSociety(sim) {
  sim.crimeLog = sim.crimeLog || [];
  sim.births = sim.births || 0;
  for (const n of sim.npcs) {
    if (n.partner === undefined) n.partner = null;
    if (!n.children) n.children = [];
    if (n.sick === undefined) n.sick = false;
    if (n.jailedUntil === undefined) n.jailedUntil = 0;
    if (n.education === undefined) n.education = 22;
  }
}

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

// ---------- 身体 ----------
export function tickHealth(sim) {
  // 吃饱睡好的人自己会养回来
  for (const n of sim.npcs) {
    if (n.sick) continue;
    if (n.needs.energy > 72 && n.needs.hunger > 62) n.health = clamp(n.health + 0.5, 0, 100);
  }

  for (const n of sim.npcs) {
    const hungry = n.needs.hunger < 30;
    const tired = n.needs.energy < 24;
    // 日子本身也在磨损人：吃得差、睡得少，掉得更快。
    let d = 0.35;
    if (hungry) d += 0.8;
    if (tired) d += 0.5;
    if (sim.weather === 'rain') d += 0.2;
    if (hungry || tired) n.health = clamp(n.health - d, 0, 100);
    else if (n.needs.hunger > 55 && n.needs.energy > 45) n.health = clamp(n.health + 0.7, 0, 100);

    if (!n.sick && n.health < 38) {
      n.sick = true;
      n.note('病倒了', 'event');
      sim.log(`${n.name}病倒了，脸色很难看。`, 'drama', [n.id]);
    }
    if (n.sick && n.health > 62) {
      n.sick = false;
      n.note('病好了', 'event');
    }
  }
}

// 病人自己会去诊所；医生在场就治，诊金进诊所账上。
export function seekCare(sim) {
  const clinic = sim.world.findBuilding('诊所');
  if (!clinic) return;
  for (const n of sim.npcs) {
    if (!n.sick || n.order) continue;
    if (n.plan && n.plan.goalId === 'care') continue;
    const doctor = sim.npcs.find((d) => d.id === 'ye' && !d.sick && d.act?.id !== 'sleep');
    n.plan = {
      goalId: 'care',
      label: '去看病',
      steps: [
        { kind: 'goto', x: clinic.spot.x, y: clinic.spot.y },
        { kind: 'act', id: 'treat', doctor: doctor ? doctor.id : null },
      ],
    };
    n.stepIndex = 0;
    n.thought = '得去看看病';
    n.note('去诊所看病', 'act');
  }
}

// ---------- 学堂 ----------
export function studyPlan(npc, sim) {
  if (npc.education >= 80) return null;
  const school = sim.world.findBuilding('学堂');
  if (!school) return null;
  return {
    goalId: 'study',
    label: '去学堂听课',
    steps: [
      { kind: 'goto', x: school.spot.x, y: school.spot.y },
      { kind: 'act', id: 'study' },
    ],
  };
}

// ---------- 恋爱与家庭 ----------
export function tickRomance(sim) {
  const single = sim.npcs.filter((n) => !n.partner && n.age >= 18 && !n.sick);
  for (let i = 0; i < single.length; i++) {
    for (let j = i + 1; j < single.length; j++) {
      const a = single[i];
      const b = single[j];
      if (a.partner || b.partner) continue;
      if (a.sex === b.sex) continue;
      const rel = a.rels.get(b.id);
      const back = b.rels.get(a.id);
      if (!rel || !back) continue;
      if (rel.affinity < 62 || back.affinity < 58) continue;
      const mutual = Math.min(rel.affinity, back.affinity) / 100;
      if (!sim.rng.chance(0.05 + mutual * 0.08)) continue;
      if (sim.dev) sim.dev.weddings += 1;
    a.partner = b.id;
      b.partner = a.id;
      a.note(`和${b.name}在一起了`, 'family');
      b.note(`和${a.name}在一起了`, 'family');
      a.addMemory({ text: `和${b.name}把话说明白了。`, valence: 3, strength: 0.9, kind: 'love', about: [b.id] });
      b.addMemory({ text: `和${a.name}把话说明白了。`, valence: 3, strength: 0.9, kind: 'love', about: [a.id] });
      sim.log(`${a.name}和${b.name}在一起了。镇上的人第二天就都知道了。`, 'drama', [a.id, b.id]);
    }
  }

  // 成家的人会生孩子：孩子是新的 NPC，从小孩长起来。
  for (const a of sim.npcs) {
    if (!a.partner) continue;
    const b = sim.npcById(a.partner);
    if (!b) continue;
    if (a.id > b.id) continue; // 一对只处理一次
    if (a.children.length + b.children.length >= 2) continue;
    if (a.health < 50 || b.health < 50) continue;
    if (!sim.rng.chance(0.03)) continue;
    spawnChild(sim, a, b);
  }
}

function spawnChild(sim, a, b) {
  const id = `kid${sim.births + 1}`;
  sim.births++;
  const sex = sim.rng.chance(0.5) ? 'f' : 'm';
  const name = (sex === 'f' ? NAMES_F : NAMES_M)[sim.rng.int(0, 7)] + '（小）';
  const profile = {
    id,
    name,
    age: 6,
    sex,
    title: '孩子',
    job: 'child',
    home: a.profile.home,
    work: null,
    color: sex === 'f' ? '#e8b6c8' : '#b8cbe8',
    traits: [],
    bio: `${a.name}和${b.name}的孩子。`,
    desire: '快点长大。',
    fear: '被一个人留在家里。',
    secret: '偷偷把家里的糖藏在了床底下。',
    skills: { 家务: 1 },
    coins: 0,
  };
  const kid = new NPC({ ...profile }, sim.world, sim);
  kid.education = 8;
  if (sim.dev) sim.dev.births += 1;
  kid.partner = null;
  kid.children = [];
  a.children.push(id);
  b.children.push(id);
  sim.npcs.push(kid);
  sim.npcMap.set(id, kid);
  for (const p of [a, b]) {
    p.rels.set(id, { affinity: 88, trust: 80, familiarity: 30, lastTalk: sim.tick });
    kid.rels.set(p.id, { affinity: 88, trust: 80, familiarity: 30, lastTalk: sim.tick });
  }
  a.note(`有了孩子：${name}`, 'family');
  b.note(`有了孩子：${name}`, 'family');
  sim.log(`${a.name}和${b.name}有了孩子，取名${name}。`, 'drama', [a.id, b.id, id]);
}

// ---------- 治安 ----------
export function tickCrime(sim) {
  for (const n of sim.npcs) {
    if (n.age < 16 || n.sick) continue;
    if (sim.tick < n._nextCrime) continue;
    const hungry = n.needs.hunger < 30;
    const poor = n.coins < 12;
    const sour = n.mood < 50;
    const desperate = hungry || (poor && sour);
    if (!desperate) continue;
    // 饿极了会当场动手；心里不平衡的人则要等一个机会
    if (!sim.rng.chance(hungry ? 0.02 : 0.0002)) continue;
    const hasFood = (sim.world.stock.food || 0) > 0 && hungry;
    n._nextCrime = sim.tick + (hungry ? 1200 : 3600);

    let took = 'food';
    if (hasFood) {
      sim.world.stock.food--;
      n.needs.hunger = clamp(n.needs.hunger + 26, 0, 100);
    } else {
      // 粮仓空了，就摸别人口袋：找镇上最有钱的那个人
      const rich = sim.npcs.filter((o) => o !== n && o.coins > 12).sort((a, b) => b.coins - a.coins)[0];
      if (!rich) continue;
      const loot = Math.min(rich.coins, 4 + Math.floor(sim.rng.float(0, 4)));
      rich.coins -= loot;
      n.coins += loot;
      took = 'coins:' + rich.id;
      n.needs.hunger = clamp(n.needs.hunger + 6, 0, 100);
    }
    const guard = sim.npcs.find((g) => g.id === 'shi' && g.act?.id !== 'sleep' && dist(g, n) < 12);
    const caught = guard ? sim.rng.chance(0.55 + Math.max(0, 60 - n.skills['偷窃'] || 0) * 0.001) : false;
    n.note(caught ? '偷东西被石头抓住了' : '饿得没办法，拿了一点镇上的存粮', 'crime');
    sim.crimeLog.push({ t: sim.tick, who: n.id, caught, item: took });

    if (sim.dev) { sim.dev.crimes += 1; if (caught) sim.dev.caught += 1; }
    if (caught) {
      const fine = Math.min(n.coins, 12);
      n.coins -= fine;
      if (sim.town) sim.town.coins += fine;
      n.jailedUntil = sim.tick + 120;
      n.plan = [];
      n.order = null;
      n.needs.purpose = clamp(n.needs.purpose - 8, 0, 100);
      n.rel('shi').affinity = clamp(n.rel('shi').affinity - 14, 0, 100);
      n.addMemory({ text: '偷东西被抓住了，关了半天。', valence: -3, strength: 0.8, kind: 'crime', about: ['shi'] });
      sim.log(`${n.name}偷粮被石头抓住，罚了 ${fine} 枚硬币，关了半天。`, 'drama', [n.id, 'shi']);
    } else {
      n.addMemory({ text: '饿得没办法，偷拿了镇上的粮。', valence: -1.5, strength: 0.6, kind: 'crime' });
      sim.log(`镇上的存粮少了一点，没人看见是谁。`, 'drama', [n.id]);
    }
  }
}

export function jailRelease(sim) {
  for (const n of sim.npcs) {
    if (n.jailedUntil && sim.tick >= n.jailedUntil) {
      n.jailedUntil = 0;
      n.note('放出来了', 'event');
    }
  }
}

// 一天结算：病、恋爱、治安各跑一遍（在 dayRollover 里调用）
export function tickSocietyDay(sim) {
  tickHealth(sim);
  tickRomance(sim);
  tickCrime(sim);
}

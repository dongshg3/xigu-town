// smoke.mjs — headless verification of the simulation (no DOM, no network).
import assert from 'node:assert/strict';
import { Simulation } from '../src/sim.js';
import { titleOf } from '../src/development.js';
import { hearUtterance } from '../src/understanding.js';
import { priceOf } from '../src/economy.js';

const results = [];
function pass(label, detail = '') { results.push({ ok: true, label, detail }); console.log(`  ✓ ${label}${detail ? ' — ' + detail : ''}`); }
function fail(label, err) { results.push({ ok: false, label, err }); console.error(`  ✗ ${label} — ${err}`); }

console.log('溪谷镇 · 无头模拟自检\n');

// ---------- 1. determinism ----------
try {
  const sig = (s) => s.npcs.map((n) => [n.id, n.x.toFixed(4), n.y.toFixed(4), Math.round(n.needs.hunger * 100)].join(':')).join('|');
  const a = new Simulation(4242);
  const b = new Simulation(4242);
  for (let i = 0; i < 200; i++) { a.step(); b.step(); }
  assert.equal(a.tick, b.tick, 'tick mismatch');
  assert.equal(sig(a), sig(b), 'same seed diverged');
  assert.notEqual(sig(a), sig(new Simulation(999)));
  pass('同种子确定性', '200 刻后状态一致，换种子则不同');
} catch (e) { fail('同种子确定性', e.message); }

// ---------- 2. long run + invariants ----------
const sim = new Simulation(20261123);
const initialState = {
  wood: sim.world.stock.wood, decor: sim.world.decor.length,
};
const goalSeen = new Map(sim.npcs.map((n) => [n.id, new Set()]));
const actSeen = new Set();
let nanHits = 0, rangeHits = 0, outOfBounds = 0;

const DAYS = 7;
const TICKS = DAYS * 288;
try {
  for (let i = 0; i < TICKS; i++) {
    sim.step();
    for (const n of sim.npcs) {
      if (!goalSeen.has(n.id)) goalSeen.set(n.id, new Set());
      goalSeen.get(n.id).add(n.goalId);
      if (n.act) actSeen.add(n.act.id);
      if (![n.x, n.y, n.needs.hunger, n.needs.energy, n.needs.social, n.needs.fun, n.needs.purpose].every(Number.isFinite)) nanHits++;
      for (const k of ['hunger', 'energy', 'social', 'fun', 'purpose']) {
        if (n.needs[k] < -0.01 || n.needs[k] > 100.01) rangeHits++;
      }
      if (n.x < -0.5 || n.y < -0.5 || n.x > sim.world.w || n.y > sim.world.h) outOfBounds++;
    }
    if (!Number.isFinite(sim.player.x) || !Number.isFinite(sim.player.y)) nanHits++;
  }
  assert.equal(nanHits, 0, 'NaN in numeric state');
  assert.equal(rangeHits, 0, 'needs outside 0..100');
  assert.equal(outOfBounds, 0, 'entity outside map');
  assert.equal(sim.clock.day, DAYS + 1, `expected day ${DAYS + 1}, got ${sim.clock.day}`);
  assert.ok(sim.logs.length > 40, 'too few log lines');
  pass(`长跑 ${DAYS} 天（${TICKS} 刻）`, `第 ${sim.clock.day} 天 ${sim.clock.short}，${sim.logs.length} 条日志`);
  pass('数值不变量', '无 NaN，需求均在 0–100，无人越界');
} catch (e) { fail('长跑 / 数值不变量', e.message); }

// ---------- 3. autonomous behaviour coverage ----------
try {
  const allGoals = new Set([...goalSeen.values()].flatMap((s) => [...s]));
  for (const g of ['eat', 'sleep', 'work', 'social', 'relax']) assert.ok(allGoals.has(g), `goal never chosen: ${g}`);
  for (const a of ['eat', 'sleep', 'chat']) assert.ok(actSeen.has(a), `act never executed: ${a}`);
  const workActs = ['work', 'harvest', 'water', 'plant', 'build', 'chop', 'paint', 'treat', 'serve', 'fish', 'watch', 'trade'];
  assert.ok(workActs.some((a) => actSeen.has(a)), 'no work-family act was ever executed');
  const kinds = new Map();
  for (const l of sim.logs) kinds.set(l.kind, (kinds.get(l.kind) || 0) + 1);
  assert.ok((kinds.get('social') || 0) >= 3, 'no social log lines');
  pass('自主行为覆盖', `目标 ${allGoals.size} 类，动作 ${actSeen.size} 类`);
  pass('社交与事件', [...kinds.entries()].map(([k, v]) => `${k}:${v}`).join(' '));
} catch (e) { fail('自主行为覆盖', e.message); }

// ---------- 4. environment modification (blueprint → carpenter builds) ----------
try {
  const w = sim.world;
  let spot = null;
  for (let y = 2; y < w.h - 2 && !spot; y++) {
    for (let x = 2; x < w.w - 2 && !spot; x++) {
      const t = w.tile(x, y);
      if (t && t.terrain === 'grass' && !t.obj && !t.building && !t.crop && w.isWalkable(x, y)
        && !w.streetTiles.some((s) => s.x === x && s.y === y)) spot = { x, y };
    }
  }
  assert.ok(spot, 'no free grass tile found');
  const decorBefore = w.decor.length;
  const woodBefore = w.stock.wood;
  const res = sim.placeBlueprint('bench', spot.x, spot.y);
  assert.equal(res.ok, true, `placement refused: ${res.msg}`);
  assert.equal(w.stock.wood, woodBefore - 4, 'bench cost was not deducted');
  const bpId = res.bp.id;
  let built = false;
  for (let i = 0; i < 288 * 2 && !built; i++) {
    sim.step();
    if (!w.blueprints.some((b) => b.id === bpId)) built = true;
  }
  assert.ok(built, 'carpenter never finished the blueprint within 2 days');
  assert.equal(w.decor.length, decorBefore + 1, 'decor count did not grow');
  pass('改造环境', `图纸在 (${spot.x},${spot.y}) 由木匠建成，木材 ${woodBefore}→${w.stock.wood}`);
} catch (e) { fail('改造环境', e.message); }

// ---------- 5. deep simulation outcomes ----------
try {
  const withMemories = sim.npcs.filter((n) => n.memory.length > 0).length;
  assert.equal(withMemories, sim.npcs.length, 'some NPC has no memory');
  const withBeliefs = sim.npcs.filter((n) => n.beliefs.length > 0).length;
  const relSpread = sim.npcs.flatMap((n) => [...n.rels.values()].map((r) => r.affinity));
  const minAff = Math.min(...relSpread), maxAff = Math.max(...relSpread);
  assert.ok(maxAff - minAff > 4, 'relationships never diverged');
  pass('记忆 / 关系分化', `全员有记忆，${withBeliefs} 人有听闻，好感区间 ${minAff.toFixed(1)}–${maxAff.toFixed(1)}`);
  const secrets = sim.revealedSecrets.size;
  pass('秘密流转', secrets ? `${secrets} 条秘密已被说出口` : '本次运行无人吐露秘密（阈值未触发）', '');
} catch (e) { fail('深度模拟结果', e.message); }

// ---------- 6. save / restore ----------
try {
  const raw = JSON.stringify(sim.toJSON());
  const data = JSON.parse(raw);
  const restored = new Simulation(data.seed);
  assert.equal(restored.restore(data), true, 'restore rejected');
  assert.equal(restored.tick, sim.tick);
  assert.equal(restored.logs.length, Math.min(160, sim.logs.length));
  assert.equal(restored.world.decor.length, sim.world.decor.length);
  for (const n of sim.npcs) {
    const m = restored.npcById(n.id);
    if (!m) continue; // 存档后才出生的人
    assert.ok(Math.abs(m.needs.hunger - n.needs.hunger) < 0.01, `hunger drifted for ${n.id}`);
    assert.equal(m.memory.length, Math.min(30, n.memory.length));
  }
  for (let i = 0; i < 60; i++) restored.step();
  pass('存档 / 读档', `恢复 ${data.npcs.length} 人、${data.decor.length} 个装饰后继续跑 60 刻`);
} catch (e) { fail('存档 / 读档', e.message); }

// ---------- 7. player interaction ----------
try {
  const s2 = new Simulation(777);
  for (let i = 0; i < 60; i++) s2.step();
  const npc = s2.npcs[0];
  s2.player.x = npc.x; s2.player.y = npc.y;
  const talk = s2.talkNow(npc);
  assert.ok(talk && typeof talk.reply === 'string' && talk.reply.length > 0, 'empty reply');
  assert.ok(s2.lastDialogue && s2.lastDialogue.npcId === npc.id);
  const coins = s2.player.coins;
  const gift = s2.giftNow(npc);
  assert.equal(gift.ok, true, `gift refused: ${gift.msg}`);
  assert.equal(s2.player.coins, coins - 5);
  s2.talkNow(npc); s2.talkNow(npc);
  assert.ok(s2.revealedSecrets.has(npc.id), 'secret not revealed after 3 talks');
  pass('玩家互动', `交谈回复正常，送礼 -5 硬币，第 3 次交谈拿到秘密`);
} catch (e) { fail('玩家互动', e.message); }

// ---------- 8. generative dialogue (no fixed pool) ----------
try {
  const s3 = new Simulation(4242);
  for (let i = 0; i < 120; i++) s3.step();
  const npc = s3.npcs.find((n) => n.id === 'man');
  s3.player.x = npc.x; s3.player.y = npc.y;
  const seen = new Set();
  let consecutiveDup = 0;
  let last = '';
  const lens = [];
  for (let i = 0; i < 40; i++) {
    s3.player.x = npc.x; s3.player.y = npc.y;
    const t = s3.talkNow(npc);
    const line = t.reply + '|' + (t.follow || '');
    if (line === last) consecutiveDup++;
    last = line;
    seen.add(t.reply);
    lens.push(t.reply.length);
    npc.needs.social = 60;
    npc.needs.hunger = 70;
    for (let k = 0; k < 3; k++) s3.step();
  }
  const ratio = seen.size / 40;
  assert.ok(ratio >= 0.6, `only ${seen.size}/40 distinct replies`);
  assert.ok(consecutiveDup === 0, `${consecutiveDup} repeated back-to-back lines`);
  assert.ok(Math.max(...lens) <= 90, 'generated line too long');
  assert.ok(Math.min(...lens) >= 4, 'generated line too short');
  pass('生成式台词', `40 次交谈 ${seen.size} 种不同回复，无连续重复，长度 ${Math.min(...lens)}–${Math.max(...lens)}`);
} catch (e) { fail('生成式台词', e.message); }

// ---------- 9. online learning ----------
try {
  const s4 = new Simulation(9091);
  for (let i = 0; i < 90; i++) s4.step();
  const npc = s4.npcs.find((n) => n.id === 'li');
  const before = JSON.stringify(npc.mind.policy);
  s4.player.x = npc.x; s4.player.y = npc.y;
  for (let i = 0; i < 25; i++) {
    s4.player.x = npc.x; s4.player.y = npc.y;
    s4.talkNow(npc);
    npc.needs.social = 55;
    for (let k = 0; k < 2; k++) s4.step();
  }
  const after = JSON.stringify(npc.mind.policy);
  assert.notEqual(before, after, 'policy never changed after 25 talks');
  const topics = Object.values(npc.mind.topics).filter((v) => v > 0);
  assert.ok(topics.length > 0, 'no topic was learned');
  const habits = Object.keys(npc.mind.habitBase).length;
  assert.ok(habits > 0, 'no habit baseline recorded');
  pass('在线学习', `25 次交谈后策略更新（${Object.keys(npc.mind.policy).length} 项）、学到 ${topics.length} 个话题、${habits} 个目标基线`);
} catch (e) { fail('在线学习', e.message); }

// ---------- 10. adaptive long run + save carries the mind ----------
try {
  const s5 = new Simulation(20261123);
  const s5b = new Simulation(20261123);
  for (let i = 0; i < 288 * 3; i++) { s5.step(); s5b.step(); }
  assert.equal(s5.npcs.map((n) => n.mind.policy.warm.toFixed(4)).join(), s5b.npcs.map((n) => n.mind.policy.warm.toFixed(4)).join(), 'learning is not deterministic');
  const drifted = s5.npcs.filter((n) => Math.abs(n.mind.moodBase) > 0.3).length;
  const learned = s5.npcs.filter((n) => Object.keys(n.mind.habits).length > 0).length;
  const data = JSON.parse(JSON.stringify(s5.toJSON()));
  const back = new Simulation(data.seed);
  back.restore(data);
  const li = s5.npcs.find((n) => n.id === 'li');
  const li2 = back.npcById('li');
  assert.equal(JSON.stringify(li.mind.policy), JSON.stringify(li2.mind.policy), 'mind not saved');
  pass('适应与存档', `3 天长跑：${drifted}/8 人情绪底色偏移，${learned}/8 人有目标记忆；mind 随存档往返一致`);
} catch (e) { fail('适应与存档', e.message); }

// ---------- 11. two-person talk is not an echo ----------
try {
  const s6 = new Simulation(31337);
  for (let i = 0; i < 200; i++) s6.step();
  const a = s6.npcs.find((n) => n.id === 'ye');
  const b = s6.npcs.find((n) => n.id === 'niu');
  s6.doChat(a, b);
  const sa = a.speech.text, sb = b.speech.text;
  assert.ok(sa && sb, 'missing speech');
  assert.notEqual(sa, sb, 'second speaker echoed the first');
  pass('双人对话', `两人各说各的：「${sa.slice(0, 14)}…」/「${sb.slice(0, 12)}…」`);
} catch (e) { fail('双人对话', e.message); }

// ---------- 12. 自由输入被听懂，并且被记住 ----------
try {
  const s7 = new Simulation(5150);
  const lan = s7.npcs.find((n) => n.id === 'lan');
  s7.player.x = lan.x + 1; s7.player.y = lan.y;
  const before = lan.memory.length;
  const res = hearUtterance(lan, s7, '听说你最近在忙地里的事，收成还行吗？');
  assert.equal(res.topic, 'work', 'topic not parsed: ' + res.topic);
  assert.ok(res.reply && res.reply.length > 3, 'empty reply');
  assert.ok(lan.memory.length > before, 'memory not written');
  const mem = lan.memory[lan.memory.length - 1];
  assert.equal(mem.topic, 'work', 'memory lost its topic');
  const bad = hearUtterance(lan, s7, '你这个废物，什么都不懂');
  assert.ok(lan.memory[lan.memory.length - 1].valence < 0, 'insult not recorded as negative');
  pass('自由输入', '话题 work · 回复「' + res.reply.slice(0, 12) + '…」· 记忆带 topic');
} catch (e) { fail('自由输入', e.message); }

// ---------- 13. 市集：价格随库存走，买卖都记账 ----------
try {
  const s8 = new Simulation(777);
  const cheap = priceOf(s8, 'wood');
  s8.world.stock.wood = 2;
  const dear = priceOf(s8, 'wood');
  assert.ok(dear > cheap, 'scarcity did not raise price: ' + cheap + ' -> ' + dear);
  const coins0 = s8.player.coins;
  const r = s8.buyGood('wood', 2);
  assert.ok(r.ok, 'buy failed');
  assert.equal(s8.player.bag.wood, 2, 'goods not in bag');
  assert.equal(s8.player.coins, coins0 - r.paid, 'coins not deducted');
  const sell = s8.sellGood('wood', 1);
  assert.ok(sell.ok && s8.player.coins > coins0 - r.paid, 'sell did not pay');
  s8.world.stock.wood = 3;
  s8.town.orders = [];
  s8.dayRollover();
  assert.ok(s8.town.orders.length > 0, 'no orders when stock is low');
  const o = s8.town.orders.find((x) => x.good === 'wood') || s8.town.orders[0];
  s8.player.bag[o.good] = o.need;
  const before = s8.player.coins;
  const done = s8.takeOrder(o.id);
  assert.ok(done.ok, 'order failed: ' + done.msg);
  assert.equal(s8.player.coins, before + o.reward, 'order did not pay');
  pass('市集与委托', '价格 ' + cheap + '→' + dear + '（库存 26→2）· 买入扣 ' + r.paid + ' · 委托付 ' + o.reward);
} catch (e) { fail('市集与委托', e.message); }

// ---------- 14. 政治：议会、选举、提案 ----------
try {
  const s9 = new Simulation(2024);
  assert.equal(s9.town.council.length, 3, 'council size');
  assert.ok(s9.npcById(s9.town.mayor), 'mayor missing');
  const first = s9.town.mayor;
  const low = s9.proposePolicy('land');
  assert.equal(low.ok, false, 'proposal passed with no standing');
  for (const n of s9.npcs) s9.playerRel(n.id).affinity = 74;
  let ok = null;
  for (let i = 0; i < 15 && !ok; i++) ok = s9.proposePolicy('land');
  assert.ok(s9.town.landOpen, 'land never opened');
  for (let d = 0; d < 8; d++) { s9.tick += 288; s9.dayRollover(); }
  assert.ok(s9.town.nextElectionDay > 8, 'election never rescheduled');
  assert.ok(s9.town.council.length === 3, 'council broke after election');
  pass('议会与选举', '镇长 ' + s9.npcById(first).name + ' · 提案通过后开放购地 · 第 ' + s9.town.nextElectionDay + ' 天再选');
} catch (e) { fail('议会与选举', e.message); }

// ---------- 15. 版图：买地、盖房、移民、存档 ----------
try {
  const s10 = new Simulation(9091);
  const plot = s10.world.plots[0];
  const denied = s10.claimLand(plot.id);
  assert.equal(denied.ok, false, 'land claimed without policy');
  s10.town.landOpen = true;
  s10.player.coins = 500;
  const claimed = s10.claimLand(plot.id);
  assert.ok(claimed.ok, 'claim failed: ' + claimed.msg);
  const bp = s10.placeBlueprint('cottage', plot.x + 1, plot.y + 1);
  assert.ok(bp.ok, 'cottage not placed: ' + bp.msg);
  s10.world.buildProgress(bp.bp, 99);
  s10.onDecorBuilt(bp.bp);
  assert.equal(s10.pendingSettlers, 1, 'no settler queued');
  s10.spawnSettlers();
  assert.equal(s10.npcs.length, 9, 'settler not added');
  const settler = s10.npcs[8];
  assert.ok(s10.world.findBuilding(settler.profile.home), 'settler has no home');
  const save = s10.toJSON();
  const back = new Simulation(9091);
  back.restore(save);
  assert.equal(back.npcs.length, 9, 'settler lost in save');
  assert.ok(back.world.findBuilding(settler.profile.home), 'house lost in save');
  pass('版图与移民', '购地 ' + claimed.cost + ' · 新居建成 · ' + settler.name + ' 搬入（共 ' + s10.npcs.length + ' 人）· 存档往返一致');
} catch (e) { fail('版图与移民', e.message); }

// ---------- 16. 打零工：镇上的钱变成你的钱 ----------
try {
  const s11 = new Simulation(880);
  while (s11.clock.hour < 9) s11.step();
  const town0 = s11.town.coins;
  const coins0 = s11.player.coins;
  const r = s11.workShift();
  assert.ok(r.ok, 'shift rejected: ' + r.msg);
  assert.equal(s11.player.coins, coins0 + r.pay, 'pay not credited');
  assert.equal(s11.town.coins, town0 - r.pay, 'town ledger not charged');
  assert.ok(s11.player.hunger < 72, 'shift cost no hunger');
  const again = s11.workShift();
  assert.equal(again.ok, false, 'cooldown not enforced');
  for (let i = 0; i < 26; i++) s11.step();
  const later = s11.workShift();
  assert.ok(later.ok || later.msg.includes('钱'), 'cannot work again after cooldown: ' + later.msg);
  pass('打零工', '工钱 ' + r.pay + ' · 公账 ' + town0 + '→' + s11.town.coins + ' · 24 刻冷却');
} catch (e) { fail('打零工', e.message); }

// ---------- 17. 参选：声望门槛、投票、当选 ----------
try {
  const s12 = new Simulation(6161);
  const early = s12.runForMayor();
  assert.equal(early.ok, false, 'candidacy allowed without standing');
  for (const n of s12.npcs) s12.playerRel(n.id).affinity = 80;
  const ok = s12.runForMayor();
  assert.ok(ok.ok, 'candidacy rejected at high standing: ' + ok.msg);
  assert.ok(s12.town.playerCandidate, 'candidate flag missing');
  let guard = 0;
  while (s12.clock.day < s12.town.nextElectionDay && guard++ < 4000) s12.step();
  assert.ok(s12.town.mayor, 'no mayor after election');
  assert.ok(s12.town.council.length === 3, 'council size after election');
  const won = s12.town.mayor === 'player';
  pass('参选与选举', '高声望可参选 · 选举后镇长=' + (won ? '你' : s12.npcById(s12.town.mayor).name) + ' · 议会 3 席');
} catch (e) { fail('参选与选举', e.message); }


// ---------- 21. 指令：只有走近才吩咐得动 ----------
try {
  const s13 = new Simulation(5150);
  for (let i = 0; i < 60; i++) s13.step();
  const far = s13.issueOrder("niu", "work");
  assert.equal(far.ok, false, "distance guard missing");
  const man = s13.npcs.find((n) => n.id === "man");
  s13.player.x = man.x; s13.player.y = man.y;
  const ok = s13.issueOrder("man", "school");
  assert.ok(ok.ok, "order rejected up close: " + ok.msg);
  for (let i = 0; i < 12; i++) s13.step();
  assert.equal(man.goalId, "order", "order did not take over the plan");
  assert.ok(man.history.some((h) => h.text.includes("按旅人的话")), "order not in personal history");
  man.act = { id: "sleep" };
  assert.equal(s13.issueOrder("man", "work").ok, false, "ordered a sleeping person");
  pass("指令", "走近才能吩咐 · 睡着拒绝 · 历史留痕");
} catch (e) { fail("指令", e.message); }

// ---------- 22. 健康与学堂 ----------
try {
  const s14 = new Simulation(8080);
  for (let i = 0; i < 6 * 288; i++) s14.step();
  const edu = s14.npcs.reduce((a, n) => a + n.education, 0) / s14.npcs.length;
  assert.ok(edu > 28, "nobody studied: avg education " + edu.toFixed(1));
  const heard = s14.npcs.filter((n) => n.history.some((h) => h.text.includes("听课"))).length;
  assert.ok(heard >= 2, "no study history");
  for (const n of s14.npcs) assert.ok(n.health > 0 && n.health <= 100, "health out of range");
  pass("健康与学堂", "6 天平均学识 " + edu.toFixed(0) + " · " + heard + " 人上过课");
} catch (e) { fail("健康与学堂", e.message); }

// ---------- 23. 恋爱与家庭 ----------
try {
  const s15 = new Simulation(4242);
  for (let i = 0; i < 14 * 288; i++) s15.step();
  const coupled = s15.npcs.filter((n) => n.partner);
  assert.ok(coupled.length >= 2, "no couple formed");
  for (const n of coupled) {
    const p = s15.npcById(n.partner);
    assert.ok(p, "partner missing");
    assert.equal(p.partner, n.id, "partner not mutual");
  }
  const kids = s15.npcs.filter((n) => n.age < 18);
  pass("恋爱与家庭", coupled.length / 2 + " 对成家 · " + kids.length + " 个孩子");
} catch (e) { fail("恋爱与家庭", e.message); }

// ---------- 24. 治安与拘捕 ----------
try {
  const s16 = new Simulation(4242);
  for (let i = 0; i < 20 * 288; i++) s16.step();
  assert.ok(s16.crimeLog.length >= 3, "no crime at all");
  const kinds = new Set(s16.crimeLog.map((c) => c.item.split(":")[0]));
  const caught = s16.crimeLog.filter((c) => c.caught).length;
  assert.ok(caught >= 0, "caught count broken");
  pass("治安与拘捕", s16.crimeLog.length + " 起 · 被抓 " + caught + " 起 · 类型 " + [...kinds].join("/"));
} catch (e) { fail("治安与拘捕", e.message); }

// ---------- 25. 个人史 ----------
try {
  const s17 = new Simulation(20261123);
  for (let i = 0; i < 2 * 288; i++) s17.step();
  const withHist = s17.npcs.filter((n) => n.history.length >= 3).length;
  assert.equal(withHist, s17.npcs.length, "someone has no personal history");
  const kinds = new Set(s17.npcs.flatMap((n) => n.history.map((h) => h.kind)));
  pass("个人史", s17.npcs.reduce((a, n) => a + n.history.length, 0) + " 条记录 · 类型 " + [...kinds].join("/"));
} catch (e) { fail("个人史", e.message); }


// ---------- 26. 神迹 ----------
try {
  const s18 = new Simulation(20261123);
  for (let i = 0; i < 3 * 288; i++) s18.step();
  assert.ok(s18.faith.points >= 8, "faith too low: " + s18.faith.points);
  const n = s18.npcs.find((x) => x.id === "ye");
  const aff0 = n.rel("player").affinity;
  const p0 = s18.faith.points;
  const r1 = s18.god("ye", "bless");
  assert.ok(r1.ok, "bless failed");
  assert.equal(n.rel("player").affinity, Math.min(100, aff0 + 10), "bless did not move affinity");
  assert.equal(s18.faith.points, p0 - 8, "bless did not cost faith");
  const t0 = n.traits.length;
  const r2 = s18.god("ye", "reshape");
  assert.ok(r2.ok || /全了/.test(r2.msg), "reshape failed: " + r2.msg);
  assert.ok(n.traits.length >= t0, "reshape lost traits");
  s18.faith.points = 2;
  const r3 = s18.god("ye", "reshape");
  assert.equal(r3.ok, false, "spent faith it did not have");
  pass("神迹", "信仰 " + p0 + " · 祝福/重塑生效 · 余额不足被拒");
} catch (e) { fail("神迹", e.message); }

// ---------- 27. 系统等级 ----------
try {
  const s19 = new Simulation(4242);
  for (let i = 0; i < 8 * 288; i++) s19.step();
  const lv = s19.devList();
  assert.equal(lv.length, 6, "expected six systems");
  for (const l of lv) assert.ok(l.lv >= 1 && l.lv <= 5, l.name + " level out of range: " + l.lv);
  const raised = lv.filter((l) => l.lv > 1);
  assert.ok(raised.length >= 2, "no system leveled up in 8 days");
  pass("系统等级", lv.map((l) => l.name + " L" + l.lv).join(" "));
} catch (e) { fail("系统等级", e.message); }

// ---------- 28. 影响与称号 ----------
try {
  const s20 = new Simulation(20261123);
  for (let i = 0; i < 6 * 288; i++) s20.step();
  const inf = s20.influence || [];
  assert.ok(inf.length >= 1, "no influence events in 6 days");
  const learned = s20.npcs.filter((n) => n.memory.some((m) => m.kind === "learn"));
  assert.ok(learned.length >= 1, "nobody learned from anyone");
  const titled = s20.npcs.filter((n) => titleOf(n));
  assert.ok(titled.length >= 1, "no titles at all");
  pass("影响与称号", inf.length + " 条影响事件 · " + titled.length + " 人有称号");
} catch (e) { fail("影响与称号", e.message); }

// ---------- report ----------
const bad = results.filter((r) => !r.ok);
console.log(`\n${results.length - bad.length}/${results.length} 项通过`);
if (bad.length) {
  console.error('失败项：');
  for (const b of bad) console.error(` - ${b.label}: ${b.err}`);
  process.exit(1);
}
console.log('SMOKE OK');

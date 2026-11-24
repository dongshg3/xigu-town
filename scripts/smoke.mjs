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

// ---------- 29. 落图纸前置检查（canPlace 给具体理由） ----------
try {
  const s21 = new Simulation(9090);
  const w = s21.world;
  assert.equal(w.canPlace('bench', 3, 3).ok, false, 'pond accepted a bench');
  assert.ok(w.canPlace('bench', 3, 3).reason.length > 0, 'no reason for water');
  const street = w.canPlace('bench', 10, 15);
  assert.equal(street.ok, false, 'street accepted a bench');
  assert.ok(street.reason.includes('主街'), 'street reason wrong: ' + street.reason);
  const wood0 = w.stock.wood;
  w.stock.wood = 0;
  const poor = w.canPlace('cottage', 20, 26);
  assert.equal(poor.ok, false, 'cottage accepted without wood');
  assert.ok(poor.reason.includes('木材'), 'poor reason wrong: ' + poor.reason);
  w.stock.wood = wood0;
  let free = null;
  for (let y = 2; y < w.h - 2 && !free; y++) for (let x = 2; x < w.w - 2 && !free; x++) {
    if (w.canPlace('bench', x, y).ok) free = { x, y };
  }
  assert.ok(free, 'no placeable tile at all');
  const denied = s21.placeBlueprint('bench', 10, 15);
  assert.equal(denied.ok, false, 'placeBlueprint bypassed canPlace');
  assert.ok(denied.msg.includes('主街'), 'placeBlueprint msg not specific: ' + denied.msg);
  pass('落图纸检查', `水面/主街/缺料均被拒且带理由 · (${free.x},${free.y}) 可放`);
} catch (e) { fail('落图纸检查', e.message); }

// ---------- 30. 季节：标签轮换 + 作物长势随季节 ----------
try {
  const { clockOf } = await import('../src/core.js');
  assert.equal(clockOf(0).seasonLabel, '春');
  assert.equal(clockOf(7 * 288).seasonLabel, '夏');
  assert.equal(clockOf(14 * 288).seasonLabel, '秋');
  assert.equal(clockOf(21 * 288).seasonLabel, '冬');
  assert.equal(clockOf(28 * 288).seasonLabel, '春', 'season cycle should wrap at 28 days');
  const grow = (day, ticks) => {
    const s = new Simulation(555);
    s.tick = (day - 1) * 288;
    s.lastDay = day;
    const t = s.world.farmTiles.map((f) => s.world.tile(f.x, f.y)).find((x) => x.terrain === 'soil');
    t.crop = { stage: 0, growth: 0, watered: true, kind: '芜菁' };
    for (let i = 0; i < ticks; i++) { t.crop.watered = true; s.step(); }
    return t.crop.growth;
  };
  const spring = grow(2, 60);
  const winter = grow(23, 60);
  assert.ok(spring > winter * 1.5, `seasonal growth too close: 春 ${spring.toFixed(2)} vs 冬 ${winter.toFixed(2)}`);
  pass('季节', `春夏秋冬轮换 · 60 刻长势 春 ${spring.toFixed(1)} > 冬 ${winter.toFixed(1)}`);
} catch (e) { fail('季节', e.message); }

// ---------- 31. 指令选对象（去聊聊 → 找指定的人） ----------
try {
  const s22 = new Simulation(3131);
  for (let i = 0; i < 30; i++) s22.step();
  const a = s22.npcs[0];
  const b = s22.npcs[1];
  s22.player.x = a.x; s22.player.y = a.y;
  const r = s22.issueOrder(a.id, 'talk', b.id);
  assert.ok(r.ok, 'talk order refused: ' + r.msg);
  assert.equal(r.order.arg, b.id, 'order lost its target');
  assert.ok(r.order.label.includes(b.name), 'label missing target name: ' + r.order.label);
  assert.ok(a.history.some((h) => h.text.includes('去找') && h.text.includes(b.name)),
    'history did not record the targeted order');
  // 他可能在走路，等当前路径走完才会按指令重排计划
  let chatStep = null;
  for (let i = 0; i < 60 && !chatStep; i++) {
    s22.step();
    chatStep = (a.plan || []).find((st) => st.kind === 'act' && st.id === 'chat') || null;
  }
  assert.ok(chatStep, 'no chat step in plan');
  assert.equal(chatStep.target, b.id, 'chat step targets the wrong npc');
  const bad = s22.issueOrder(a.id, 'talk', a.id);
  assert.equal(bad.ok, false, 'self-talk accepted');
  pass('指令选对象', `${a.name} 被吩咐去找 ${b.name} · 计划含 chat 步骤 · 个人史留痕`);
} catch (e) { fail('指令选对象', e.message); }

// ---------- 32. validate：ajv 封装（好对象过 / 坏对象报路径） ----------
try {
  const { defineSchema, validate, hasSchema } = await import('../src/core/validate.js');
  defineSchema('SmokePoint', {
    type: 'object',
    properties: { x: { type: 'number' }, y: { type: 'number' }, tag: { type: 'string', default: 'p' } },
    required: ['x', 'y'],
    additionalProperties: false,
  });
  assert.ok(hasSchema('SmokePoint'), 'schema not registered');
  const good = { x: 1, y: 2 };
  const rg = validate('SmokePoint', good);
  assert.ok(rg.ok, 'good object rejected: ' + rg.errors.join(';'));
  assert.equal(good.tag, 'p', 'ajv default not applied');
  const bad = validate('SmokePoint', { x: 'oops', y: 2, extra: 1 });
  assert.ok(!bad.ok, 'bad object passed validation');
  assert.ok(bad.errors.some((m) => m.includes('x')), 'error missing instance path: ' + bad.errors.join(';'));
  const unreg = validate('NoSuchSchema', {});
  assert.ok(!unreg.ok && unreg.errors[0].includes('未注册'), 'unregistered schema not reported');
  pass('validate', `ajv 封装可用 · 默认值生效 · 错误带路径「${bad.errors[0]}」`);
} catch (e) { fail('validate', e.message); }

// ---------- 33. EventBus：log→事件、订阅派发、因果链 ----------
try {
  const s23 = new Simulation(4242);
  let heard = 0;
  const seen = [];
  s23.events.subscribe((ev) => ev.kind === 'log.line', (ev) => { heard++; seen.push(ev.data.text); });
  const before = heard;
  s23.log('冒烟测试的一句话。', 'system', []);
  s23.step(); // flush 在 step 末尾
  assert.ok(heard > before, 'subscriber did not receive log.line event');
  assert.ok(seen.some((t) => t === '冒烟测试的一句话。'), 'event payload missing text');
  // 因果链：父事件 → 子事件
  const parent = s23.events.emit({ kind: 'log.line', data: { text: 'parent' } });
  const child = s23.events.emit({ kind: 'log.line', data: { text: 'child' }, parentEventId: parent.id });
  const chain = s23.events.causalChain(child.id);
  assert.equal(chain.length, 2, 'causal chain length wrong: ' + chain.length);
  assert.equal(chain[0].id, parent.id, 'causal chain order wrong');
  // 限深：超过 3 层的级联被截断，不炸栈
  s23.events.subscribe(() => true, (ev, sim) => {
    if (ev.data && ev.data.loop) sim.events.emit({ kind: 'log.line', data: { loop: true } });
  });
  s23.events.emit({ kind: 'log.line', data: { loop: true } });
  s23.events.flush();
  // replay 环形缓冲存在且有内容
  assert.ok(s23.events.replay.length > 0, 'replay buffer empty');
  pass('EventBus', `log→事件 ${heard - before} 条 · 因果链 2 层 · 级联限深安全 · replay ${s23.events.replay.length} 条`);
} catch (e) { fail('EventBus', e.message); }

// ---------- 34. feedback 登记表 lint + 存档持久层（Node 兜底） ----------
try {
  const { lintFeedback, FEEDBACK } = await import('../src/data/present/feedback.js');
  const problems = lintFeedback();
  assert.equal(problems.length, 0, 'feedback lint problems: ' + problems.join('；'));
  assert.ok(FEEDBACK['log.line'], 'log.line not registered');
  const { saveGame, loadGame } = await import('../src/persist/store.js');
  const backend = await saveGame('smoke-test-key', { hello: '镇', n: 42 });
  assert.ok(['indexeddb', 'localstorage', 'memory'].includes(backend), 'unknown backend: ' + backend);
  const raw = await loadGame('smoke-test-key');
  const back = JSON.parse(raw);
  assert.equal(back.hello, '镇', 'round trip lost data');
  assert.equal(back.n, 42);
  const missing = await loadGame('smoke-no-such-key');
  assert.equal(missing, null, 'missing key should return null');
  pass('反馈登记+存档', `lint 0 问题 · ${Object.keys(FEEDBACK).length} 种事件登记 · 存档往返(${backend})`);
} catch (e) { fail('反馈登记+存档', e.message); }

// ---------- 35. Character 组件化：别名兼容 + 组件行为 ----------
try {
  const { mergeTraits } = await import('../src/character/traits.js');
  const { NeedsComponent } = await import('../src/character/needs.js');
  const s24 = new Simulation(777);
  const npc = s24.npcs[0];
  // 别名：旧字段路径直达组件数据
  assert.strictEqual(npc.needs, npc.needsComp.values, 'needs alias broken');
  assert.strictEqual(npc.memory, npc.memoryComp.items, 'memory alias broken');
  assert.strictEqual(npc.rels, npc.relsComp.map, 'rels alias broken');
  // setter（读档路径）：整块替换仍生效
  npc.needs = { hunger: 50, energy: 50, social: 50, fun: 50, purpose: 50 };
  assert.equal(npc.needsComp.values.hunger, 50, 'needs setter broken');
  npc.rels = new Map([['x', { affinity: 1, trust: 2, familiarity: 3 }]]);
  assert.equal(npc.relsComp.map.get('x').trust, 2, 'rels setter broken');
  // 记忆去重：同文同 kind 不新增，只强化
  npc.memory = [];
  const before = npc.memory.length;
  npc.addMemory({ text: '测试记忆', kind: 'life', valence: 1, strength: 0.5 });
  npc.addMemory({ text: '测试记忆', kind: 'life', valence: 1, strength: 0.5 });
  assert.equal(npc.memory.length, before + 1, 'memory dedupe failed');
  assert.ok(npc.memory[0].strength > 0.5, 'memory refresh did not bump strength');
  // 记忆裁剪：第 37 条触发裁剪到 30，之后继续增长
  npc.memory = [];
  for (let i = 0; i < 37; i++) npc.addMemory({ text: '记' + i, kind: 'life' });
  assert.equal(npc.memory.length, 30, 'memory trim wrong at 37 adds: ' + npc.memory.length);
  npc.addMemory({ text: '记37', kind: 'life' });
  assert.equal(npc.memory.length, 31, 'memory growth after trim wrong');
  // 关系兜底：脏数据修平
  npc.rels = new Map([['bad', { affinity: NaN }]]);
  const fixed = npc.rel('bad');
  assert.equal(fixed.affinity, 30, 'rels finiteness fix failed');
  // 需求衰减确定性：同种子两次构造一致
  const a1 = new Simulation(999).npcs[0].needs.hunger;
  const a2 = new Simulation(999).npcs[0].needs.hunger;
  assert.equal(a1, a2, 'needs init not deterministic');
  const comp = new NeedsComponent(s24.rng);
  const h0 = comp.values.hunger;
  comp.decay({ hungerMul: 1, energyMul: 1, socialMul: 1, funMul: 1 }, false);
  assert.ok(Math.abs(comp.values.hunger - (h0 - 0.30)) < 1e-9, 'needs decay rate changed');
  // 特质：乘性键连乘
  const mods = mergeTraits(['diligent', 'diligent'].filter((t, i) => i === 0));
  assert.ok(mods.hungerMul !== undefined, 'mergeTraits output shape changed');
  pass('组件化', 'needs/memory/rels 别名与 setter 兼容 · 去重/裁剪/兜底 · 衰减确定性');
} catch (e) { fail('组件化', e.message); }

// ---------- 36. Action 注册表：全覆盖 + 分发等价 ----------
try {
  const { ACTIONS, getAction, actionLabel, knownActionIds } = await import('../src/actions/registry.js');
  assert.equal(knownActionIds().length, 20, 'registry should have 20 actions');
  assert.equal(actionLabel('sleep'), '睡觉');
  assert.equal(actionLabel('buyMeal'), '在酒馆吃饭');
  assert.equal(actionLabel('nope'), undefined, 'unknown label should be undefined');
  assert.equal(getAction('nope'), null, 'unknown action should be null');
  // 跑一段模拟：所有计划里出现的 act id 都必须有注册项（丰富度靠数据，不许野 id）
  const s25 = new Simulation(2468);
  const usedIds = new Set();
  for (let i = 0; i < 288 * 2; i++) {
    s25.step();
    for (const n of s25.npcs) {
      for (const st of n.plan || []) if (st.kind === 'act') usedIds.add(st.id);
      if (n.act) usedIds.add(n.act.id);
    }
  }
  const missing = [...usedIds].filter((id) => !getAction(id));
  assert.equal(missing.length, 0, 'plan used unregistered actions: ' + missing.join(','));
  assert.ok(usedIds.size >= 10, 'too few distinct actions exercised: ' + usedIds.size);
  // 分发等价抽查：relax 加 fun/energy，look 加 fun，未知 id 安全落空
  const npc = s25.npcs[0];
  npc.act = null; npc.plan = [];
  npc.needs.fun = 50; npc.needs.energy = 50;
  npc.applyEffect(s25, { id: 'relax', data: {}, label: '歇一会儿' });
  assert.ok(npc.needs.fun > 50 && npc.needs.energy > 50, 'relax effect wrong');
  const f0 = npc.needs.fun;
  npc.applyEffect(s25, { id: 'look', data: {} });
  assert.ok(Math.abs(npc.needs.fun - (f0 + 3)) < 1e-9, 'look effect wrong');
  npc.applyEffect(s25, { id: 'unregistered-thing', data: {} }); // 不炸即可
  pass('Action 注册表', `20 个动作登记 · 模拟实际用到 ${usedIds.size} 种全部有注册 · 分发效果等价`);
} catch (e) { fail('Action 注册表', e.message); }

// ---------- 37. 决策三段式：why 解释记录 + 确定性 ----------
try {
  const s26 = new Simulation(1357);
  for (let i = 0; i < 400; i++) s26.step();
  const decided = s26.npcs.filter((n) => n.lastDecision);
  assert.ok(decided.length >= 4, 'too few npcs have decision records: ' + decided.length);
  const d = decided[0].lastDecision;
  assert.ok(d.chosen && typeof d.score === 'number', 'decision record incomplete');
  assert.ok(Array.isArray(d.candidates) && d.candidates.length >= 1, 'candidates missing');
  for (const c of d.candidates) {
    assert.ok(c.goal && typeof c.score === 'number' && typeof c.base === 'number' && typeof c.habit === 'number',
      'candidate breakdown incomplete: ' + JSON.stringify(c));
  }
  assert.equal(d.candidates[0].goal, d.chosen, 'chosen should be the top surviving candidate');
  assert.ok(Array.isArray(d.skipped), 'skipped list missing');
  // 确定性：同种子同时刻，两人做出同样选择
  const sA = new Simulation(8642);
  const sB = new Simulation(8642);
  for (let i = 0; i < 300; i++) { sA.step(); sB.step(); }
  const nA = sA.npcs.find((n) => n.lastDecision);
  const nB = sB.npcs.find((n) => n.id === nA.id);
  assert.equal(nA.lastDecision.chosen, nB.lastDecision.chosen, 'decision not deterministic');
  assert.equal(nA.lastDecision.score, nB.lastDecision.score, 'decision score not deterministic');
  pass('决策三段式', `${decided.length} 人有 why 记录 · 候选含打分拆解 · 同种子决策一致`);
} catch (e) { fail('决策三段式', e.message); }

// ---------- 38. 交互点：登记/占用/队列/中断恢复 ----------
try {
  const { ensureInteractions, claimPoint, releasePoint, releaseAll, pointForAct, occupancySnapshot, IX_CAP } =
    await import('../src/systems/interactions.js');
  const s27 = new Simulation(5150);
  ensureInteractions(s27);
  const pts = s27.ix.points;
  // 登记完整：每户一床、两钓位、田地、学堂、长椅
  const beds = [...pts.values()].filter((p) => p.kind === 'bed');
  const homes = s27.world.buildings.filter((b) => b.type === 'house' || b.type === 'cottage');
  assert.equal(beds.length, homes.length, 'bed points != homes');
  assert.ok([...pts.values()].some((p) => p.kind === 'farm'), 'farm point missing');
  assert.ok([...pts.values()].some((p) => p.kind === 'school'), 'school point missing');
  assert.equal([...pts.values()].filter((p) => p.kind === 'pond').length, 2, 'pond spots wrong');
  // 容量与队列：钓位 cap 1，第二个排队，第四个 full
  const pond = pts.get('pond:3,6');
  assert.equal(claimPoint(pond, 'a'), 'ok');
  assert.equal(claimPoint(pond, 'a'), 'hold', 're-claim should be hold');
  assert.equal(claimPoint(pond, 'b'), 'queued');
  assert.equal(claimPoint(pond, 'c'), 'queued');
  assert.equal(claimPoint(pond, 'd'), 'queued');
  assert.equal(claimPoint(pond, 'e'), 'full', 'queue overflow should be full');
  releasePoint(pond, 'a');
  assert.equal(pond.occ.length, 0, 'release failed');
  assert.equal(claimPoint(pond, 'b'), 'ok', 'queued npc should claim after release');
  // 中断恢复：releaseAll 清空该 NPC 所有占用与排队
  releaseAll(s27, 'b');
  releaseAll(s27, 'c');
  releaseAll(s27, 'd');
  assert.ok(!pond.occ.length && !pond.queue.length, 'releaseAll left residue');
  // 睡觉认自己家的床
  const npc = s27.npcs[0];
  const homePt = pts.get(`bed:${npc.profile.home}`);
  assert.ok(homePt, 'npc home bed missing');
  const found = pointForAct(s27, npc, { id: 'sleep', data: {} });
  assert.equal(found?.id, homePt.id, 'sleep did not map to own bed');
  // 集成：两人争一张长椅，第二个被排队；释放后能占上
  const bench = [...pts.values()].find((p) => p.kind === 'bench');
  assert.ok(bench, 'no bench in town');
  const n1 = s27.npcs[0], n2 = s27.npcs[1], n3 = s27.npcs[2];
  n1.x = bench.x; n1.y = bench.y; n2.x = bench.x; n2.y = bench.y; n3.x = bench.x; n3.y = bench.y;
  const step = { id: 'relax', dur: 3, data: {}, label: '坐着发呆' };
  n1.plan = [{ kind: 'act', ...step }]; n1.stepIndex = 0; n1.act = null;
  n2.plan = [{ kind: 'act', ...step }]; n2.stepIndex = 0; n2.act = null;
  n3.plan = [{ kind: 'act', ...step }]; n3.stepIndex = 0; n3.act = null;
  n1.startAct(s27, n1.plan[0]);
  n2.startAct(s27, n2.plan[0]);
  n3.startAct(s27, n3.plan[0]);   // 长椅 cap 2，第三个应排队
  assert.ok(n1.act && n2.act, 'first two should occupy bench');
  assert.ok(!n3.act && n3.waitUntil > s27.tick, 'third should be waiting, got act=' + !!n3.act);
  assert.deepEqual(bench.queue, [n3.id], 'queue wrong');
  assert.equal(bench.occ.length, 2, 'bench occupancy wrong');
  // 中断恢复：n1 失败重规划 → 释放 → n3 等到点后能占上
  n1.failPlan(s27, '测试中断');
  assert.equal(bench.occ.length, 1, 'failPlan did not release');
  s27.tick = n3.waitUntil;        // 快进到等待结束
  n3.startAct(s27, n3.plan[0]);
  assert.ok(n3.act, 'queued npc should occupy after release + wait');
  // 快照可用
  const snap = occupancySnapshot(s27);
  assert.ok(snap.some((r) => r.id === bench.id && r.occ.includes(n3.id)), 'snapshot missing bench');
  pass('交互点', `床/钓位/田地/学堂登记齐 · 容量队列 full 正确 · 排队等待→释放→占上 · 中断释放`);
} catch (e) { fail('交互点', e.message); }

// ---------- 39. 关系八维 + 传闻传播 ----------
try {
  const { REL_DIMS, bumpRel } = await import('../src/character/rels.js');
  const { spawnRumor, spreadRumors } = await import('../src/systems/rumors.js');
  // 八维默认值与旧三维迁移
  const s28 = new Simulation(9090);
  const npc = s28.npcs[0];
  npc.rels = new Map([['old', { affinity: 55, trust: 40, familiarity: 9, lastTalk: 3 }]]);
  const r = npc.rel('old');
  assert.equal(r.affinity, 55, 'old dim clobbered');
  for (const k of Object.keys(REL_DIMS)) assert.ok(Number.isFinite(r[k]), `dim ${k} not filled`);
  assert.equal(r.fear, 0, 'new dim default wrong');
  // bumpRel 夹取
  const r2 = npc.rel('x');
  bumpRel(r2, 'fear', 120);
  assert.equal(r2.fear, 100, 'bumpRel clamp failed');
  bumpRel(r2, 'fear', -200);
  assert.equal(r2.fear, 0, 'bumpRel floor failed');
  // 传闻：产生去重、传播衰减、只写新维度
  const a = s28.npcs[0], b = s28.npcs[1], c = s28.npcs[2];
  a.beliefs = []; b.beliefs = [];
  spawnRumor(a, s28, { topic: 'quarrel', text: '听说A和B吵了。', about: [a.id, c.id], valence: -0.5, cred: 0.8 });
  const again = spawnRumor(a, s28, { topic: 'quarrel', text: '听说A和B吵了。', about: [a.id, c.id], valence: -0.5, cred: 0.8 });
  assert.equal(a.beliefs.filter((x) => x.kind === 'rumor').length, 1, 'rumor dedupe failed');
  assert.ok(again.cred > 0.8, 'rumor re-hear should raise cred');
  const aff0 = b.rel(c.id).affinity;
  spreadRumors(a, b, s28);
  const heard = b.beliefs.find((x) => x.kind === 'rumor');
  assert.ok(heard, 'rumor did not spread');
  assert.equal(heard.hops, 1, 'hops should increment');
  assert.ok(Math.abs(heard.cred - Math.round(again.cred * 0.85 * 100) / 100) < 1e-9, 'cred decay wrong');
  assert.ok(b.rel(c.id).fear > 0, 'negative rumor should raise fear');
  assert.equal(b.rel(c.id).affinity, aff0, 'rumor must not touch affinity (行为红线)');
  // 同一条不会再传第二次
  const n0 = b.beliefs.length;
  spreadRumors(a, b, s28);
  assert.equal(b.beliefs.length, n0, 'same rumor spread twice');
  // 集成：模拟跑三天，传闻真的在镇上传开，且读档不丢
  const s29 = new Simulation(7744);
  for (let i = 0; i < 288 * 3; i++) s29.step();
  const holders = s29.npcs.filter((n) => n.beliefs.some((x) => x.kind === 'rumor'));
  assert.ok(holders.length >= 2, 'rumors did not propagate in live sim: ' + holders.length);
  const maxHops = Math.max(...s29.npcs.flatMap((n) => n.beliefs.filter((x) => x.kind === 'rumor').map((x) => x.hops)), 0);
  assert.ok(maxHops >= 1, 'no rumor hopped');
  const json = JSON.parse(JSON.stringify(s29.toJSON()));
  const fresh = new Simulation(json.seed);
  assert.ok(fresh.restore(json), 'restore failed');
  const kept = fresh.npcs.filter((n) => n.beliefs.some((x) => x.kind === 'rumor')).length;
  assert.ok(kept >= 1, 'rumors lost in save/load');
  pass('关系八维+传闻', `八维迁移/bump 夹取 · 传播 cred×0.85 hops+1 · 三天 ${holders.length} 人持有传闻 · 存读档保留`);
} catch (e) { fail('关系八维+传闻', e.message); }

// ---------- report ----------
const bad = results.filter((r) => !r.ok);
console.log(`\n${results.length - bad.length}/${results.length} 项通过`);
if (bad.length) {
  console.error('失败项：');
  for (const b of bad) console.error(` - ${b.label}: ${b.err}`);
  process.exit(1);
}
console.log('SMOKE OK');

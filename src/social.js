// social.js — conversation, gossip, secrets, player interactions.
import { clamp, clockOf } from './core.js';
import { replyFor, giftLine, secretLine } from './dialogue.js';
import { compose, composeChatter, sleepLine } from './language.js';
import { rewardTalk, noteTopic } from './learning.js';
import { bumpRel } from './character/rels.js';
import { spawnRumor } from './systems/rumors.js';

export function pairCompatibility(a, b) {
  const shared = a.traits.filter((t) => b.traits.includes(t)).length;
  const valueDiff = (
    Math.abs(a.values.work - b.values.work) +
    Math.abs(a.values.social - b.values.social) +
    Math.abs(a.values.leisure - b.values.leisure)
  ) / 3;
  const c = 0.28
    + shared * 0.11
    + (1 - clamp(valueDiff, 0, 1)) * 0.33
    + (a.mods.chatBonus + b.mods.chatBonus) * 0.012;
  return clamp(c, 0, 1);
}

export function relTag(affinity) {
  if (affinity >= 78) return '挚友';
  if (affinity >= 62) return '亲近';
  if (affinity >= 46) return '友好';
  if (affinity >= 32) return '点头之交';
  if (affinity >= 18) return '有点别扭';
  return '有芥蒂';
}

const CHAT_LINES = [
  '聊了聊今年的收成。',
  '说起昨晚的风，说像要变天。',
  '聊到镇上最近的变化，都说不清是好是坏。',
  '交换了几句关于天气和腰疼的抱怨。',
  '说起谁家的孩子又长高了。',
  '聊起酒馆最近的新菜。',
];

export function chatter(a, b, sim) {
  const r = sim.rng;
  const relA = a.rel(b.id);
  const relB = b.rel(a.id);
  const compat = pairCompatibility(a, b);
  const mood = (a.mood + b.mood) / 2;
  let delta = 1.4 + compat * 4.2 + (mood - 50) / 20 + a.mods.chatBonus + b.mods.chatBonus;
  let kind = 'chat';
  const quarrelP = clamp(0.07 + Math.max(0, a.mods.conflictBias + b.mods.conflictBias) * 0.045 - compat * 0.06, 0.01, 0.26);
  if (r.chance(quarrelP)) {
    kind = 'quarrel';
    delta = -1.5 - r.float(0.5, 4);
  } else if (compat > 0.62 && r.chance(0.22)) {
    kind = 'deep';
    delta += 3.5;
  }

  if (!Number.isFinite(delta)) delta = 1.2; // 空性格表也别把关系算成 NaN
  relA.affinity = clamp(relA.affinity + delta, 0, 100);
  relB.affinity = clamp(relB.affinity + delta * 0.92, 0, 100);
  const trustGain = 0.55 + compat * 1.5 + (a.mods.trustGain + b.mods.trustGain) * 0.45;
  relA.trust = clamp(relA.trust + (kind === 'quarrel' ? -1.1 : trustGain), 0, 100);
  relB.trust = clamp(relB.trust + (kind === 'quarrel' ? -0.9 : trustGain * 0.9), 0, 100);
  relA.familiarity = clamp(relA.familiarity + 2, 0, 100);
  relB.familiarity = clamp(relB.familiarity + 2, 0, 100);
  relA.lastTalk = sim.tick;
  relB.lastTalk = sim.tick;

  a.needs.social = clamp(a.needs.social + 11, 0, 100);
  b.needs.social = clamp(b.needs.social + 10, 0, 100);
  a.needs.fun = clamp(a.needs.fun + 4, 0, 100);
  b.needs.fun = clamp(b.needs.fun + 4, 0, 100);

  let topicText = r.pick(CHAT_LINES);
  if (kind === 'quarrel') {
    topicText = r.pick([
      '为了点小事顶了两句，气氛一下子僵了。',
      '一个觉得对方多管闲事，另一个觉得自己好心没好报。',
      '话赶话，说到了不该说的地方。',
    ]);
    a.addMemory({ text: `和${b.name}吵了两句，心里有点堵。`, valence: -2.2, strength: 0.8, kind: 'quarrel', about: [b.id] });
    b.addMemory({ text: `${a.name}今天说话有点冲。`, valence: -1.8, strength: 0.7, kind: 'quarrel', about: [a.id] });
    // 八维：吵架长竞争与一点惧意；现场产生传闻，之后会沿关系网扩散
    bumpRel(relA, 'rivalry', 3); bumpRel(relA, 'fear', 1);
    bumpRel(relB, 'rivalry', 3); bumpRel(relB, 'fear', 1);
    const quarrelNews = `听说${a.name}和${b.name}当众顶了起来，话说得很难听。`;
    spawnRumor(a, sim, { topic: 'quarrel', text: quarrelNews, about: [a.id, b.id], valence: -0.5, cred: 0.85 });
    spawnRumor(b, sim, { topic: 'quarrel', text: quarrelNews, about: [a.id, b.id], valence: -0.5, cred: 0.85 });
    sim.log(`${a.name}和${b.name}话不投机。`, 'drama', [a.id, b.id]);
    return { kind, text: topicText, delta };
  }

  if (kind === 'deep') {
    topicText = r.pick([
      '聊了很久，聊到了各自没说出口的事。',
      '说了些平时不会跟别人说的话。',
      '发现彼此都在担心同一件事。',
    ]);
    a.addMemory({ text: `和${b.name}聊得很深，像是被理解了一点。`, valence: 2.2, strength: 0.9, kind: 'deep', about: [b.id] });
    b.addMemory({ text: `和${a.name}聊了很久，心里松了些。`, valence: 2.2, strength: 0.9, kind: 'deep', about: [a.id] });
    // 八维：深聊长亲密与尊重；走得近本身也是镇上的谈资
    bumpRel(relA, 'intimacy', 2); bumpRel(relA, 'respect', 1);
    bumpRel(relB, 'intimacy', 2); bumpRel(relB, 'respect', 1);
    const closeNews = `听说${a.name}和${b.name}走得很近，常常聊到一处。`;
    spawnRumor(a, sim, { topic: 'close', text: closeNews, about: [a.id, b.id], valence: 0.4, cred: 0.75 });
    spawnRumor(b, sim, { topic: 'close', text: closeNews, about: [a.id, b.id], valence: 0.4, cred: 0.75 });
    sim.log(`${a.name}和${b.name}聊了很久。`, 'social', [a.id, b.id]);
  } else {
    a.addMemory({ text: `和${b.name}聊了几句。${topicText}`, valence: 0.9, strength: 0.45, kind: 'chat', about: [b.id] });
    b.addMemory({ text: `碰见${a.name}，${topicText}`, valence: 0.8, strength: 0.4, kind: 'chat', about: [a.id] });
    if (r.chance(0.3)) sim.log(`${a.name}和${b.name}闲聊了几句。`, 'social', [a.id, b.id]);
  }

  if (a.mods.gossipRate > 0 || r.chance(0.35)) {
    gossip(a, b, sim);
  }
  maybeRevealSecret(a, b, sim);
  maybeRevealSecret(b, a, sim);
  return { kind, text: topicText, delta };
}

function gossip(a, b, sim) {
  const r = sim.rng;
  const p = clamp(0.22 + a.mods.gossipRate * 0.6, 0.05, 0.85);
  if (!r.chance(p)) return;
  const pool = a.memory.filter((m) => m.strength > 0.25 && m.about?.some((id) => id !== b.id && id !== a.id));
  if (!pool.length) return;
  const mem = r.pick(pool);
  const targetId = mem.about.find((id) => id !== b.id && id !== a.id);
  const target = sim.npcById(targetId);
  if (!target) return;
  const text = mem.text.length > 46 ? mem.text.slice(0, 44) + '…' : mem.text;
  b.beliefs.push({ about: targetId, kind: 'hearsay', text, source: a.name, tick: sim.tick });
  if (b.beliefs.length > 24) b.beliefs.shift();
  b.addMemory({ text: `听${a.name}提起${target.name}：${text}`, valence: mem.valence > 0 ? 0.6 : -0.7, strength: 0.4, kind: 'hearsay', about: [a.id, targetId] });
  const rel = b.rel(targetId);
  rel.affinity = clamp(rel.affinity + (mem.valence > 0 ? 0.8 : -1.2), 0, 100);
  if (r.chance(0.18)) {
    sim.log(`${b.name}从${a.name}那里听说了${target.name}的事。`, 'social', [a.id, b.id, targetId]);
  }
}

function maybeRevealSecret(from, to, sim) {
  if (!from.profile.secret || from.secretToldTo?.includes(to.id)) return;
  const rel = from.rel(to.id);
  if (rel.trust < 42) return;
  if (!sim.rng.chance(0.14 + rel.trust / 700)) return;
  from.secretToldTo = from.secretToldTo || [];
  from.secretToldTo.push(to.id);
  to.beliefs.push({ about: from.id, kind: 'secret', text: from.profile.secret, source: from.name, tick: sim.tick });
  to.addMemory({ text: `${from.name}对我说了一件从没跟别人说过的事。`, valence: 2.6, strength: 1.0, kind: 'secret', about: [from.id] });
  from.addMemory({ text: `把心里的事告诉了${to.name}，不知道是对是错。`, valence: 1.6, strength: 1.0, kind: 'secret', about: [to.id] });
  sim.log(`［秘密］${from.name}向${to.name}说出了藏在心里的事。`, 'drama', [from.id, to.id]);
  sim.dramaticFlags.push({ tick: sim.tick, text: `${from.name}向${to.name}吐露了一个秘密` });
}

// Player-facing conversation. The line comes from the NPC's own voice, chosen
// by what they are doing, their mood, and how well they know you; the second
// beat is optional so repeated visits don't turn into monologues.
export function playerTalk(npc, sim) {
  const pr = sim.playerRel(npc.id);
  const asleep = npc.act?.id === 'sleep' || npc.sleeping;

  if (asleep) {
    npc.addMemory({ text: '有人来看我，但我睡着了。', valence: 0, strength: 0.2, kind: 'player' });
    return { reply: sleepLine(npc, sim), secret: null, familiarity: pr.familiarity, asleep: true };
  }

  pr.familiarity++;
  pr.affinity = clamp(pr.affinity + 2 + (npc.mods.chatBonus > 0 ? 1 : 0), 0, 100);
  npc.needs.social = clamp(npc.needs.social + 6, 0, 100);
  npc.addMemory({ text: '旅人来找我说话。', valence: 0.8, strength: 0.4, kind: 'player', about: [] });
  sim.log(`你和${npc.name}聊了几句。`, 'social', [npc.id]);

  // 现算一句：谁来、此刻什么心情、她真的知道什么，都进去
  const said = compose(npc, sim, 'reply');
  const reply = said.text;
  const asked = compose(npc, sim, 'follow', { avoid: said.fact?.id });
  const follow = sim.rng.chance(0.55) ? asked.text : null;
  rewardTalk(npc, said.intent, 2 + (npc.mods.chatBonus > 0 ? 1 : 0));
  noteTopic(npc, said.fact?.topic, 2);
  if (follow) noteTopic(npc, asked.fact?.topic, 1);
  npc.speech = { text: reply.length > 26 ? reply.slice(0, 24) + '…' : reply, until: sim.tick + 14 };

  let secret = null;
  if (pr.familiarity >= 3 && !sim.revealedSecrets.has(npc.id)) {
    sim.revealedSecrets.add(npc.id);
    secret = secretLine(npc, sim);
    pr.trust = clamp(pr.trust + 10, 0, 100);
    sim.log(`［秘密］${npc.name}犹豫了一下，对你说出了一件心事。`, 'drama', [npc.id]);
  }
  return { reply, follow, secret, familiarity: pr.familiarity };
}

export function playerGift(npc, sim) {
  const cost = 5;
  if (sim.player.coins < cost) return { ok: false, msg: '你身上的硬币不够。' };
  sim.player.coins -= cost;
  npc.coins += cost;
  const pr = sim.playerRel(npc.id);
  pr.affinity = clamp(pr.affinity + 7, 0, 100);
  pr.familiarity++;
  npc.needs.fun = clamp(npc.needs.fun + 6, 0, 100);
  npc.addMemory({ text: '旅人送了我一点东西，不好意思收，但还是收了。', valence: 1.8, strength: 0.7, kind: 'gift', about: [] });
  sim.log(`你送给${npc.name}一件小礼物（-${cost} 硬币）。`, 'social', [npc.id]);
  const line = giftLine(npc, sim, true);
  npc.speech = { text: line.length > 24 ? line.slice(0, 22) + '…' : line, until: sim.tick + 14 };
  return { ok: true, msg: `${npc.name}收下了礼物，态度亲近了一些。`, line };
}
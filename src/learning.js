// learning.js — 在线学习层。
//
// 每个居民脑子里有一小套会变的数：
//   policy   社交策略权重：抱怨 / 分享 / 打听 / 亲近，哪句话换来好反应就多说来
//   habits   哪个目标真的让她舒服（预期收益），喂进目标打分
//   topics   哪些话题谈得起来（从事实里学，不是背词）
//   moodBase 情绪的长期基准，长期憋着会往下走，过得好会慢慢回来
//   log      最近学到的东西，给玩家看（"他学到的"）
//
// 全部是确定性的 EMA / 软更新，没有 Math.random，存档可复现。
import { clamp } from './core.js';

const LR = 0.12;

export function ensureMind(npc) {
  if (npc.mind) return npc.mind;
  npc.mind = {
    policy: { complain: 0, share: 0, ask: 0, warm: 0 },
    habits: {},
    habitBase: {},
    topics: {},
    moodBase: 0,
    stats: { talks: 0, gifts: 0, quarrels: 0, deep: 0, secrets: 0 },
    log: [],
  };
  return npc.mind;
}

function note(npc, text) {
  const mind = ensureMind(npc);
  if (mind.log[0] === text) return;
  mind.log.unshift(text);
  if (mind.log.length > 6) mind.log.pop();
}

/**
 * 一次交谈之后更新策略：reward 是这次互动的实际收益（好感增量为主）。
 * 负收益的话，这种说法会慢慢被压下去。
 */
export function rewardTalk(npc, intent, delta) {
  const mind = ensureMind(npc);
  if (!(intent in mind.policy)) return;
  const reward = clamp(delta / 6, -1, 1);
  mind.policy[intent] = clamp(mind.policy[intent] + LR * (reward - mind.policy[intent] * 0.35), -0.9, 0.9);
  mind.stats.talks++;
  if (delta > 2.2) note(npc, '发现「多说点心里话」别人更愿意听');
  if (delta < -1) note(npc, '学会少说伤人的话');
}

/** 话题显著性：谈过且反应不错的话题，下次更容易被想起。 */
export function noteTopic(npc, topic, delta) {
  if (!topic || topic === 'none') return;
  const mind = ensureMind(npc);
  const cur = mind.topics[topic] || 0;
  mind.topics[topic] = clamp(cur + clamp(delta / 8, -0.3, 0.3) * 0.35, -0.4, 0.9);
}

/** 目标收益：这个目标到底有没有让她舒服（吃到、睡好、聊到）。 */
// 学的是"意外"，不是"收益"：每个目标有自己的基线，只有比平时明显好/差才动。
// 否则吃饭的收益永远最大，学习会把所有其他目标压死（这条被自检抓过一次）。
export function noteHabit(npc, goalId, gain) {
  if (!goalId) return;
  const mind = ensureMind(npc);
  const g = clamp(gain, -70, 70);
  const base = mind.habitBase[goalId] ?? g;
  mind.habitBase[goalId] = base * 0.9 + g * 0.1;
  const surprise = g - base;
  const cur = mind.habits[goalId] ?? 0;
  mind.habits[goalId] = clamp(cur * 0.9 + clamp(surprise / 22, -1, 1) * 0.1, -1, 1);
}

/** 目标打分里的学习项：−5 .. +5。 */
export function habitBonus(npc, goalId) {
  const v = npc.mind?.habits?.[goalId];
  if (!v || Math.abs(v) < 0.08) return 0;
  return clamp(v * 4, -4, 4);
}

/** 长期的"底色"：连着过得不好，心情基准会掉一点；好日子会慢慢回来。 */
export function dailyMoodUpdate(npc, sim) {
  const mind = ensureMind(npc);
  const avg = npc.needs.hunger + npc.needs.energy + npc.needs.social + npc.needs.fun + npc.needs.purpose;
  const score = avg / 5;
  if (score < 38) mind.moodBase = clamp(mind.moodBase - 0.6, -7, 7);
  else if (score > 68) mind.moodBase = clamp(mind.moodBase + 0.4, -7, 7);
  else mind.moodBase = clamp(mind.moodBase * 0.92, -7, 7);
  if (sim && Math.abs(mind.moodBase) > 5 && sim.rng.chance(0.05)) {
    note(npc, mind.moodBase > 0 ? '这些日子过得还算顺' : '最近总觉得提不起劲');
  }
}

/** 从别人的话里学：听到谁的事，就对那个话题更敏感一点。 */
export function learnFromOthers(npc, sourceText, delta) {
  const mind = ensureMind(npc);
  const topics = [
    ['钱', 'money'], ['账', 'money'], ['收成', 'crop'], ['地', 'crop'],
    ['雨', 'weather'], ['风', 'weather'], ['水', 'water'], ['鱼', 'water'],
    ['病', 'body'], ['药', 'body'], ['秘密', 'secret'], ['镇上', 'town'],
  ];
  for (const [word, topic] of topics) {
    if (sourceText.includes(word)) {
      mind.topics[topic] = clamp((mind.topics[topic] || 0) + 0.06 * Math.sign(delta || 1), -0.4, 0.9);
    }
  }
}

/** 一句话总结他此刻"学到"的东西，给 UI 用。 */
export function summarizeMind(npc) {
  const mind = ensureMind(npc);
  const pol = Object.entries(mind.policy).sort((a, b) => b[1] - a[1]);
  const habits = Object.entries(mind.habits).sort((a, b) => b[1] - a[1]);
  const topics = Object.entries(mind.topics).sort((a, b) => b[1] - a[1]);
  const label = { complain: '抱怨', share: '分享', ask: '打听', warm: '亲近' };
  const goalLabel = { eat: '吃饭', sleep: '睡觉', work: '干活', social: '找人说话', relax: '歇着', wander: '闲逛' };
  const topicLabel = {
    weather: '天气', crop: '收成', money: '钱', wood: '木料', food: '吃食',
    town: '镇上', people: '人情', body: '身体', you: '你', work: '手艺',
    night: '夜里', morning: '清早', water: '河水', secret: '心事',
  };
  return {
    policy: pol.filter(([, v]) => Math.abs(v) > 0.02).map(([k, v]) => ({ key: k, label: label[k] || k, value: v })),
    habits: habits.filter(([, v]) => Math.abs(v) > 0.03).slice(0, 3).map(([k, v]) => ({ key: k, label: goalLabel[k] || k, value: v })),
    topics: topics.filter(([, v]) => v > 0.05).slice(0, 3).map(([k, v]) => ({ key: k, label: topicLabel[k] || k, value: v })),
    moodBase: mind.moodBase,
    log: mind.log.slice(0, 3),
    stats: mind.stats,
  };
}

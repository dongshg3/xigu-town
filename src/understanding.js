// understanding.js — 玩家打的那句话，NPC 真的"听懂了"一点。
// 没有模型也能用：中文关键词 → 意图 / 话题 / 情绪 / 提到的人；
// 结果写进记忆、关系与学习层，之后会被回忆起来。
import { clamp } from './core.js';
import { compose } from './language.js';
import { noteTopic, rewardTalk } from './learning.js';

const TOPICS = [
  { id: 'money', words: ['钱', '生意', '买卖', '赚', '亏', '价', '成本', '客人', '营生', '账', '税', '工钱', '收入'] },
  { id: 'work', words: ['活', '工作', '忙', '累', '做', '干', '手艺', '工', '田', '地', '收成', '庄稼'] },
  { id: 'weather', words: ['天', '雨', '晴', '风', '云', '冷', '热', '晒', '湿'] },
  { id: 'food', words: ['吃', '饭', '喝', '酒', '菜', '汤', '饿', '粮'] },
  { id: 'people', words: ['她', '他', '谁', '朋友', '邻居', '大家', '镇上'] },
  { id: 'love', words: ['喜欢', '爱', '想', '惦记', '心事', '孤单', '嫁', '娶'] },
  { id: 'politics', words: ['官', '镇公所', '投票', '选', '政策', '公家', '规矩', '管'] },
  { id: 'land', words: ['地', '田', '扩', '买地', '版图', '开荒', '房子'] },
  { id: 'self', words: ['自己', '过得', '还好吗', '最近怎么样', '身体', '心事'] },
];

const INTENTS = [
  { id: 'greet', words: ['你好', '在吗', '早', '晚上好', '嗨', '喂', '打扰'] },
  { id: 'praise', words: ['谢谢', '谢', '厉害', '好样的', '佩服', '不错', '喜欢', '了不起'] },
  { id: 'insult', words: ['滚', '笨', '蠢', '讨厌', '骗子', '偷', '混蛋', '闭嘴'] },
  { id: 'ask_work', words: ['干活', '忙什么', '在做什么', '工作', '进展', '建', '修'] },
  { id: 'offer', words: ['帮你', '需要', '要不要', '我请', '给你', '送'] },
  { id: 'gossip', words: ['听说', '是不是真的', '秘密', '传', '据说', '知道吗'] },
  { id: 'ask_self', words: ['你怎么样', '还好吗', '你最近', '过得', '心事', '怎么想'] },
];

const POSITIVE = ['好', '谢谢', '喜欢', '帮', '厉害', '不错', '暖', '谢谢', '辛苦', '佩服', '是', '谢谢', '喜欢', '不错', '厉害', '辛苦', '帮', '放心', '照顾', '佩服', '漂亮'];
const NEGATIVE = ['滚', '笨', '蠢', '讨厌', '骗', '偷', '恨', '吵', '闭嘴', '烂', '废物', '没用', '不懂', '烦', '难看', '窝囊', '吹牛', '瞧不起', '多管闲事', '欠', '亏了'];

function hits(text, words) {
  let n = 0;
  for (const w of words) if (text.includes(w)) n++;
  return n;
}

export function parseUtterance(raw, npcs) {
  const text = String(raw || '').slice(0, 120);
  let topic = 'self';
  let best = 0;
  for (const t of TOPICS) {
    const n = hits(text, t.words);
    if (n > best) { best = n; topic = t.id; }
  }
  let intent = 'smalltalk';
  let intentScore = 0;
  for (const it of INTENTS) {
    const n = hits(text, it.words);
    if (n > intentScore) { intentScore = n; intent = it.id; }
  }
  const pos = hits(text, POSITIVE);
  const neg = hits(text, NEGATIVE);
  const sentiment = clamp((pos - neg) * 0.5, -1, 1);
  // 没有明显意图但带着问号：当成在问他自己的事，别回一句无关的寒暄
  if (intent !== 'insult' && intent !== 'praise' && /[?？]|怎么办|打算|怎么想/.test(text)) intent = 'ask_self';
  const named = (npcs || []).filter((n) => text.includes(n.name)).map((n) => n.id);
  return { text, topic, intent, sentiment, named, length: text.length };
}

// 语气风格：同一种意图，四种人四种说法。
function styleOf(npc) {
  if (npc.traits.includes('distant') || npc.traits.includes('steady')) return 'terse';
  if (npc.traits.includes('warm') || npc.traits.includes('generous')) return 'warm';
  if (npc.traits.includes('shrewd') || npc.traits.includes('suspicious')) return 'wry';
  return 'plain';
}

const LINES = {
  greet: {
    warm: ['来了。正想着今天会不会见到你。', '哎，你来了。坐会儿？'],
    terse: ['嗯。', '在。'],
    wry: ['来得正好，我这儿有点事想不通。', '又见面了。'],
    plain: ['你来了。', '是你啊。'],
  },
  praise: {
    warm: ['你这么说，我今天干活都有劲。', '别夸我，我会当真的。'],
    terse: ['……记下了。', '嗯，谢谢。'],
    wry: ['嘴上这么说，心里可别嫌我麻烦。', '客气话我收下了，实在的更好。'],
    plain: ['谢谢你这么说。', '举手之劳。'],
  },
  insult: {
    warm: ['你今天气不顺？要不先坐会儿。', '这话我不接。你歇歇。'],
    terse: ['……你再说一遍。', '我不喜欢这么说话。'],
    wry: ['行，这话我记住了。', '骂人不要钱，你倒是舍得。'],
    plain: ['何必这么说。', '我听着不太舒服。'],
  },
  ask_work: {
    warm: ['手上这点活，做完就能歇了。', '正忙着呢，不过跟你说两句不耽误。'],
    terse: ['在干活。', '还差一点。'],
    wry: ['干活是干活，就是不太划算。', '你问得可真是时候。'],
    plain: ['还有不少没做完。', '今天事多。'],
  },
  offer: {
    warm: ['你要帮？那我可就不客气了。', '真的？那太好了。'],
    terse: ['不用。', '我自己来。'],
    wry: ['帮我可以，账要算清楚。', '你图什么？算了，我领这个情。'],
    plain: ['那麻烦你了。', '行，多谢。'],
  },
  gossip: {
    warm: ['你也听说了？我还以为是我想多了。', '这事我知道一点，但不好乱讲。'],
    terse: ['没听说。', '别人的事，少问。'],
    wry: ['消息挺灵啊。谁跟你说的？', '传闻这东西，一半是编的。'],
    plain: ['听过一耳朵。', '不好说。'],
  },
  ask_self: {
    warm: ['还行，就是有点累。你呢？', '我啊，日子照过。'],
    terse: ['还成。', '没什么好说的。'],
    wry: ['你猜。', '表面上还行。'],
    plain: ['就那样。', '不算坏。'],
  },
  smalltalk: {
    warm: ['嗯，你说。', '我在听。'],
    terse: ['……', '说。'],
    wry: ['这话有意思。', '然后呢？'],
    plain: ['嗯。', '是吗。'],
  },
};

function pick(rng, list) { return list[Math.floor(rng.float(0, list.length)) % list.length]; }

// 记忆被真正用上：对方提过的事，会在之后的对话里被翻出来。
export function recallAbout(npc, topic) {
  const mem = npc.memory.filter((m) => m.topic === topic && m.kind === 'player');
  return mem.length ? mem[mem.length - 1] : null;
}

/**
 * 玩家说了一句话 → 对方听懂一部分 → 关系、记忆、学习一起更新。
 * 返回 { reply, topic, intent, sentiment, recall }
 */
export function hearUtterance(npc, sim, raw) {
  const parsed = parseUtterance(raw, sim.npcs);
  const pr = sim.playerRel(npc.id);
  const style = styleOf(npc);
  const rng = sim.rng;

  const trustGain = 0.4 + parsed.sentiment * 1.6 + (parsed.intent === 'ask_self' ? 1.2 : 0);
  pr.affinity = clamp(pr.affinity + parsed.sentiment * 3 + (parsed.intent === 'praise' ? 2 : 0), 0, 100);
  pr.trust = clamp(pr.trust + trustGain, 0, 100);
  pr.familiarity++;
  npc.needs.social = clamp(npc.needs.social + 5, 0, 100);
  npc.needs.fun = clamp(npc.needs.fun + (parsed.sentiment > 0 ? 3 : 0), 0, 100);

  npc.addMemory({
    text: `旅人对我说：「${parsed.text}」`,
    valence: parsed.sentiment,
    strength: 0.85,
    kind: 'player',
    topic: parsed.topic,
  });

  noteTopic(npc, parsed.topic, parsed.sentiment);
  rewardTalk(npc, parsed.intent === 'praise' ? 'warm' : parsed.intent === 'gossip' ? 'share' : 'ask', parsed.sentiment * 4);

  // 优先用生成器：接住对方说的话题，再按自己的声口回一句
  const TOPIC_MAP = { money: "money", work: "work", weather: "weather", food: "food", people: "people", love: "you", politics: "town", land: "town", self: "body" };
  const INTENT_MAP = { praise: "warm", insult: "complain", ask_work: "work", gossip: "share", offer: "warm", ask_self: "share", greet: "warm" };
  const gen = compose(npc, sim, "reply", { intent: INTENT_MAP[parsed.intent], topic: TOPIC_MAP[parsed.topic] });
  const line = (gen && gen.text) || pick(rng, LINES[parsed.intent]?.[style] || LINES.smalltalk[style]);
  let recall = null;
  const old = recallAbout(npc, parsed.topic);
  if (old && old.text !== `旅人对我说：「${parsed.text}」` && rng.chance(0.45)) {
    recall = old.text.replace(/^旅人对我说：「|」$/g, '');
  }

  const reply = recall
    ? `${line} 你上次说的「${recall.slice(0, 18)}」，我记着。`
    : line;

  npc.speech = { text: reply, until: sim.tick + 14 };
  sim.log(`你对${npc.name}说：「${parsed.text}」`, 'social', [npc.id]);
  if (parsed.sentiment <= -0.5) {
    sim.log(`${npc.name}脸色沉了下来。`, 'drama', [npc.id]);
  }
  sim.lastUtterance = { npcId: npc.id, ...parsed, reply };

  return { reply, recall, ...parsed, style };
}
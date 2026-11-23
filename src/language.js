// language.js — 生成式语言层。
//
// 台词不是从固定池子里抽的，而是每一步现算出来：
//   1. 选意图（此刻这个人在想什么：抱怨 / 分享 / 打听 / 干活 / 亲近 / 观望）
//   2. 选内容（从她自己的记忆、听来的话、镇上的真实状态里挑一条"事实"）
//   3. 用她自己的句式把内容说出来（语序、称谓、句尾、长度、是否反问，逐人不同）
//
// 因此同一句话不会自己重复出现，而每一句都必须落在这个人真的知道的事情上：
// 事实由 sim 现算，不是编的。人的性格只决定"怎么说"，不决定"说什么"。
import { clamp } from './core.js';

// ── 事实源 ───────────────────────────────────────────────────────────────
// 每条事实返回 { id, text, tone, topic, w }。text 是不带句末标点的短句。
const FACT_BUILDERS = [
  // 天气与时辰
  (npc, sim) => {
    const w = sim.weather;
    if (w === 'rain') return { id: 'rain', text: '这雨下了一整天', tone: 'neutral', topic: 'weather', w: 1.3 };
    if (w === 'wind') return { id: 'wind', text: '风从河那边一直吹过来', topic: 'weather', tone: 'neutral', w: 1.0 };
    if (w === 'cloud') return { id: 'cloud', text: '云压得低，像是要落雨', topic: 'weather', tone: 'neutral', w: 0.9 };
    return { id: 'sun', text: '今天日头太毒', topic: 'weather', tone: 'neutral', w: 0.9 };
  },
  (npc, sim) => {
    const c = sim.clock;
    if (c.hour >= 21 || c.hour < 5) return { id: 'latenight', text: '这个点还没睡的人，心里都有事', topic: 'night', tone: 'soft', w: 1.1 };
    if (c.hour >= 18) return { id: 'dusk', text: '天一擦黑，镇上就没什么声音了', topic: 'night', tone: 'soft', w: 0.8 };
    if (c.hour < 8) return { id: 'morning', text: '早上的露水还没干', topic: 'morning', tone: 'good', w: 0.8 };
    return null;
  },
  // 自己的工作与镇上的库存
  (npc, sim) => {
    const w = sim.world;
    if (npc.profile.job === 'farmer') {
      const ripe = w.ripeCrop();
      if (ripe) return { id: 'crop-ready', text: '地里有几垄已经能收了', topic: 'crop', tone: 'good', w: 1.5 };
      const dry = w.thirstyCrop?.();
      if (dry) return { id: 'crop-dry', text: '有几垄苗开始打蔫了', topic: 'crop', tone: 'bad', w: 1.4 };
    }
    if (npc.profile.job === 'carpenter' && w.stock.wood <= 32) {
      return { id: 'wood-low', text: `仓里木料只剩${w.stock.wood}根`, topic: 'wood', tone: 'bad', w: 1.4 };
    }
    if (npc.profile.job === 'merchant') {
      return { id: 'coin', text: `镇上的公账上还有${w.stock.coins}枚硬币`, topic: 'money', tone: 'neutral', w: 1.2 };
    }
    if (npc.profile.job === 'tavern' && w.stock.food <= 6) {
      return { id: 'food-low', text: '后厨的食材快见底了', topic: 'food', tone: 'bad', w: 1.4 };
    }
    if (npc.profile.job === 'doctor' && w.beauty?.() > 7) {
      return { id: 'town-pretty', text: '镇上这些日子好看了不少', topic: 'town', tone: 'good', w: 1.0 };
    }
    return null;
  },
  // 未完工的图纸：全镇都知道
  (npc, sim) => {
    const bp = sim.world.blueprints?.[0];
    if (!bp) return null;
    // 只读：buildProgress 是推进施工的，读它会污染进度（self-test caught this）
    const left = Math.max(1, Math.round(bp.need - (bp.progress || 0)));
    return { id: 'blueprint', text: `镇上还有张图纸没建完，就差${left}分工`, topic: 'town', tone: 'neutral', w: 1.0 };
  },
  // 自己的需求
  (npc) => {
    if (npc.needs.hunger < 34) return { id: 'hungry', text: '我从早上到现在还没正经吃过东西', topic: 'body', tone: 'bad', w: 1.6 };
    if (npc.needs.energy < 30) return { id: 'tired', text: '这两天睡得不好，手上没劲', topic: 'body', tone: 'bad', w: 1.5 };
    if (npc.needs.social < 30) return { id: 'lonely', text: '好些天没跟人好好说过话了', topic: 'people', tone: 'bad', w: 1.4 };
    if (npc.needs.purpose < 32) return { id: 'stuck', text: '手上的事做来做去还是那些', topic: 'work', tone: 'bad', w: 1.2 };
    return null;
  },
  // 关于玩家的关系
  (npc, sim) => {
    const pr = sim.playerRel(npc.id);
    if (pr.affinity >= 62) return { id: 'close', text: '跟你说话不费劲', topic: 'you', tone: 'good', w: 1.5 };
    if (pr.affinity <= 30 && pr.familiarity >= 2) return { id: 'wary', text: '我还没摸准你是什么人', topic: 'you', tone: 'bad', w: 1.3 };
    if (pr.familiarity <= 1) return { id: 'new', text: '你看着不像镇上的人', topic: 'you', tone: 'neutral', w: 1.2 };
    return null;
  },
  // 最近记住的事（对任何人都成立）
  (npc, sim) => {
    const mem = npc.topMemories?.(3)?.find((m) => m.kind !== 'player' && m.strength > 0.5);
    if (!mem) return null;
    const who = mem.about?.map((id) => sim.npcById(id)?.name).find(Boolean);
    const gist = mem.text.length > 22 ? mem.text.slice(0, 20) + '…' : mem.text;
    return { id: 'memory', text: who ? `${who}的事我一直记着——${gist}` : gist, topic: 'people', tone: mem.valence >= 0 ? 'good' : 'bad', w: 1.3 };
  },
  // 听来的话（信念）
  (npc, sim) => {
    const b = (npc.beliefs || []).filter((x) => x.kind === 'hearsay').slice(-3)[0];
    if (!b) return null;
    const target = sim.npcById(b.about)?.name || '有人';
    const gist = b.text.length > 20 ? b.text.slice(0, 18) + '…' : b.text;
    return { id: 'hearsay', text: `${target}那边，${gist}`, topic: 'people', tone: 'neutral', w: 1.5, source: b.source };
  },
  // 职业观察：每个人只看自己那摊
  (npc, sim) => {
    const job = npc.profile.job;
    const pool = {
      farmer: ['西边那块地的土还是太湿', '今年的苗出得比去年齐'],
      carpenter: ['这把刨子得磨了', '木头一受潮，尺寸就变'],
      artist: ['这条街的颜色今天偏灰', '光从东边来的时候，屋顶最好看'],
      doctor: ['入秋以后咳嗽的人会多起来', '镇上的人总是拖到不能拖了才来'],
      tavern: ['今天来喝酒的人比昨天少', '锅里的汤再炖一会儿就好'],
      fisher: ['河湾那边今天没什么鱼讯', '水涨了一点，岸边不好站'],
      guard: ['夜里巡逻得绕着粮仓走一圈', '最近没出什么事，这算好事'],
      merchant: ['这段时间铁器比粮食好卖', '进货的路要是再涨一次，价钱就压不住了'],
    }[job] || [];
    if (!pool.length) return null;
    return { id: 'job', text: pool[Math.floor(sim.rng.float(0, pool.length)) % pool.length], topic: 'work', tone: 'neutral', w: 1.1 };
  },
];

function gatherFacts(npc, sim) {
  const out = [];
  for (const build of FACT_BUILDERS) {
    let f = null;
    try { f = build(npc, sim); } catch { f = null; }
    if (f && f.text) out.push(f);
  }
  // 学会的话题会让她更常提起（learning.js 写进来）
  const topicBias = npc.mind?.topics || {};
  for (const f of out) f.weight = (f.w || 1) * (1 + (topicBias[f.topic] || 0) * 0.8);
  return out;
}

// ── 意图 ─────────────────────────────────────────────────────────────────
const INTENTS = ['complain', 'share', 'ask', 'work', 'warm', 'observe'];

function chooseIntent(npc, sim, mode) {
  const s = {};
  for (const k of INTENTS) s[k] = 0.4;
  const mood = npc.mood;
  const facts = gatherFacts(npc, sim);
  const bad = facts.some((f) => f.tone === 'bad');
  const good = facts.some((f) => f.tone === 'good');
  if (mood < 42) s.complain += 1.8;
  if (bad) s.complain += 1.1;
  if (good) s.share += 0.9;
  if (mood > 66) s.warm += 1.1;
  if (npc.needs.social < 40) s.ask += 0.8;
  if (npc.act && npc.act.id && npc.act.id !== 'chat') s.work += 0.9;
  if ((npc.beliefs || []).length) s.share += 1.2;
  if (sim.playerRel(npc.id).familiarity <= 1) s.ask += 1.0;
  if (mode === 'greet') { s.warm += 1.2; s.observe += 0.8; }
  if (mode === 'follow') { s.ask += 2.0; }

  // 人物固定的说话倾向（不是台词，是性格的语法）
  const bias = (npc.profile.bias || {});
  for (const k of INTENTS) s[k] += bias[k] || 0;
  // 学到的社交策略也会推着意图走
  const pol = npc.mind?.policy;
  if (pol) {
    s.complain += (pol.complain || 0) * 1.4;
    s.share += (pol.share || 0) * 1.4;
    s.ask += (pol.ask || 0) * 1.4;
    s.warm += (pol.warm || 0) * 1.4;
  }
  let best = 'observe';
  let bestV = -Infinity;
  for (const k of INTENTS) {
    const v = s[k] * (0.85 + sim.rng.float(0, 0.3));
    if (v > bestV) { bestV = v; best = k; }
  }
  return best;
}

// ── 表达：每个人的句式 ───────────────────────────────────────────────────
// {fact} 事实短句，{feel} 她自己的感受短句，{you} 对玩家的称呼。
const VOICE = {
  lan: {
    you: '你',
    tail: ['', '。', '，就是这样。'],
    feel: ['人一天就这么过去了', '急也急不来', '地不骗人，人骗人', '我得赶在天黑前弄完'],
    frames: {
      complain: ['{fact}，{feel}', '{fact}。{feel}，说出来也没用', '不是我爱念叨——{fact}'],
      share: ['{fact}。{feel}', '跟你说个事：{fact}', '{fact}，你听听就明白了'],
      ask: ['{you}那边怎么样。{fact}，我这边就是这样', '{fact}。{you}缺不缺人手'],
      work: ['{fact}。活还在等着，手上不能停', '先干活。{fact}'],
      warm: ['{you}来了正好，{fact}', '{fact}。有{you}在，这活轻快些'],
      observe: ['{fact}', '{fact}，年年都这样'],
    },
  },
  mo: {
    you: '你',
    tail: ['。', '。', '。'],
    feel: ['手生了', '不急', '做不完就明天', '木头不等人'],
    frames: {
      complain: ['{fact}。', '{fact}，烦。'],
      share: ['{fact}。', '{fact}。就这些。'],
      ask: ['{fact}。你那边呢。', '问个事。{fact}。'],
      work: ['在干活。{fact}。', '{fact}。等我刨完这块。'],
      warm: ['嗯。{fact}。', '{fact}。坐。'],
      observe: ['{fact}。', '{fact}。'],
    },
  },
  li: {
    you: '你',
    tail: ['', '。', '，你不觉得吗。'],
    feel: ['像还没画完的东西', '颜色是对的，形状不对', '我总在等一个瞬间', '看着看着就走了神'],
    frames: {
      complain: ['{fact}。{feel}', '{fact}——我今天什么都画不出来'],
      share: ['{fact}。{feel}', '你听：{fact}。{feel}'],
      ask: ['{fact}。{you}看见的是什么颜色', '{you}觉得，{fact}，这算不算一个开头'],
      work: ['别说话，我在等光。{fact}', '{fact}。手上这份还差一口气'],
      warm: ['{you}来了。{fact}，正好让我看看', '{fact}。{you}站着别动'],
      observe: ['{fact}。{feel}', '{fact}，像一句没写完的话'],
    },
  },
  ye: {
    you: '你',
    tail: ['', '。', '。你最近怎么样。'],
    feel: ['镇上的人总是拖', '我能做的其实有限', '这话我说了很多遍', '先把眼前这个处理好'],
    frames: {
      complain: ['{fact}。{feel}', '{fact}，但没人当回事'],
      share: ['{fact}。{feel}', '提醒你一句：{fact}'],
      ask: ['{fact}。{you}睡得怎么样', '{you}脸色不太好。{fact}', '{fact}。你自己有没有哪里不舒服'],
      work: ['等我包完这服。{fact}', '{fact}。一个一个来'],
      warm: ['{you}来了。{fact}，先坐', '{fact}。{you}比看上去会照顾人'],
      observe: ['{fact}。{feel}', '{fact}。这镇子就是这样'],
    },
  },
  man: {
    you: '你',
    tail: ['', '，对吧。', '。'],
    feel: ['生意就是这样', '人情比账本难算', '我这话说得直', '坐下来慢慢说'],
    frames: {
      complain: ['{fact}，{feel}', '{fact}。你说这日子'],
      share: ['{fact}。{feel}', '过来，跟你说个事——{fact}'],
      ask: ['{fact}。{you}听说了吗', '{you}最近在哪混。{fact}，我这儿消息灵'],
      work: ['锅上还炖着。{fact}', '{fact}。忙完这阵我陪你喝一杯'],
      warm: ['{you}来了！{fact}', '{fact}。坐，别客气'],
      observe: ['{fact}。{feel}', '{fact}，这镇上一天一个样'],
    },
  },
  he: {
    you: '你',
    tail: ['', '。', '……'],
    feel: ['水不说话，但水记得', '我说不好', '岸上比船上难待', '有时候只想坐着'],
    frames: {
      complain: ['{fact}。{feel}', '{fact}……算了'],
      share: ['{fact}。{feel}', '河上听来的：{fact}'],
      ask: ['{fact}。{you}会水吗', '{fact}。你从哪边来的'],
      work: ['{fact}。竿子还在水里', '{fact}。等鱼讯'],
      warm: ['{you}……来了。{fact}', '{fact}。坐这儿，风小'],
      observe: ['{fact}', '{fact}……我常想这个'],
    },
  },
  shi: {
    you: '你',
    tail: ['。', '。', '。听明白了吗。'],
    feel: ['规矩就是规矩', '出了事我担着', '不能松', '这事得记一笔'],
    frames: {
      complain: ['{fact}。{feel}。', '{fact}，这样不行。'],
      share: ['{fact}。记着。', '说一句：{fact}。'],
      ask: ['{fact}。你昨晚在哪。', '{you}，最近见过生人吗。{fact}'],
      work: ['巡逻。{fact}。', '{fact}。别在这儿站着'],
      warm: ['{fact}。你做得对。', '{you}。{fact}。有事找我。'],
      observe: ['{fact}。', '{fact}。镇上不能出乱子。'],
    },
  },
  niu: {
    you: '你',
    tail: ['', '，这笔账划得来。', '。'],
    feel: ['价钱是谈出来的', '进价再涨就没法做了', '我不做亏本买卖', '东西好，价钱自然好'],
    frames: {
      complain: ['{fact}，{feel}', '{fact}。这生意越来越难做'],
      share: ['{fact}。{feel}', '给你透个底：{fact}'],
      ask: ['{fact}。{you}手上有什么货', '{you}要不要做笔买卖。{fact}'],
      work: ['{fact}。账还没核完', '{fact}。等我拨完这笔'],
      warm: ['{you}是老主顾了。{fact}', '{fact}。给你留了一份'],
      observe: ['{fact}。{feel}', '{fact}。行情就是这样'],
    },
  },
};

const FALLBACK_VOICE = VOICE.lan;

// 反重复：最近说过的话记在 npc._said 里，形近就不再说。
function normalize(text) {
  return text.replace(/[。，、！？…—\s]/g, '');
}

function bigrams(text) {
  const t = normalize(text);
  const out = new Set();
  for (let i = 0; i < t.length - 1; i++) out.add(t.slice(i, i + 2));
  return out;
}

function similarity(a, b) {
  const A = bigrams(a);
  const B = bigrams(b);
  if (!A.size || !B.size) return 0;
  let hit = 0;
  for (const g of A) if (B.has(g)) hit++;
  return hit / Math.max(A.size, B.size);
}

function pickFact(npc, sim, tone, used) {
  const facts = gatherFacts(npc, sim).filter((f) => !used.has(f.id));
  if (!facts.length) return null;
  const pool = tone ? facts.filter((f) => f.tone === tone) : facts;
  const list = pool.length ? pool : facts;
  let total = 0;
  for (const f of list) total += f.weight;
  let r = sim.rng.float(0, total);
  for (const f of list) {
    r -= f.weight;
    if (r <= 0) return f;
  }
  return list[list.length - 1];
}

// 真随机在这里会造成存档不可复现，所以统一走 sim.rng。
function realWithRng(voice, intent, fact, feel, you, rng) {
  const frames = voice.frames[intent] || voice.frames.observe;
  const frame = frames[rng.int(0, frames.length - 1)];
  // 事实本身常带句号，塞进句式里会出现「。。」，先削掉再拼
  const body = String(fact).replace(/[。！？!?,，；;]+$/, '');
  let text = frame
    .replace('{fact}', body)
    .replace('{feel}', String(feel).replace(/[。！？!?,，；;]+$/, ''))
    .replace(/\{you\}/g, you);
  const tail = voice.tail[rng.int(0, voice.tail.length - 1)];
  if (tail && !/[。？！…]$/.test(text)) text += tail;
  return text;
}

/**
 * 生成一句话。mode: 'reply' | 'greet' | 'follow' | 'chat' | 'react'
 * 返回 { text, intent, fact, source }
 */
// 现算的事实里没有这个话题时用的兜底句：仍然是他自己的话，只是不依赖具体事件。
const TOPIC_FALLBACK = {
  money: ['这几天的客人比往年少了一半。', '价一天一个样，我都不敢多进货。', '账面上紧巴巴的，先熬过去再说。'],
  work: ['手上的活积了三天，做不完。', '这活儿看着轻，其实费腰。', '手艺是磨出来的，急不得。'],
  weather: ['今天日头太毒，晒得人发晕。', '这雨要来不来的，最磨人。', '风一起，屋里都是土。'],
  food: ['锅里还剩半锅汤，够两个人喝。', '最近吃得简单，不讲究。', '要是能踏踏实实吃顿热饭就好了。'],
  people: ['镇上这几个人，谁什么脾气我都清楚。', '有些话当面不好说。', '街坊之间，低头不见抬头见。'],
  body: ['这两天腰酸得厉害。', '睡一觉就好了，没什么大事。', '心里搁着点事，说不清。'],
  town: ['镇上说了算的，还是那几个人。', '规矩是死的，人是活的。', '公家的事，轮不到我插嘴。'],
};

function topicFacts(topic) {
  const list = TOPIC_FALLBACK[topic];
  if (!list) return [];
  return list.map((text, i) => ({ id: 'tf-' + topic + '-' + i, text, topic, tone: 'neutral', w: 0.8 }));
}
export function compose(npc, sim, mode = 'reply', opts = {}) {
  const voice = VOICE[npc.id] || FALLBACK_VOICE;
  const intent = opts.intent || chooseIntent(npc, sim, mode);
  npc._said = npc._said || [];
  const facts = gatherFacts(npc, sim);
  const frames = voice.frames[intent] || voice.frames.observe;

  // 不是"抽到不重复的就停"，而是把所有组合都算一遍相似度，取最不像最近说过的那句。
  // 这样即使世界状态没变，也不会退化成复读机。
  let best = null;
  let bestScore = Infinity;
  let pool = facts;
  // 第二拍不要接着说同一件事：那是复读，不是对话
  if (opts.avoid) {
    const others = facts.filter((f) => f.id !== opts.avoid);
    if (others.length) pool = others;
  }
  // 对方刚说了某个话题：优先谈这件事，这才叫接话
  if (opts.topic) {
    const topical = pool.filter((f) => f.topic === opts.topic);
    pool = topical.length ? topical : topicFacts(opts.topic);
    if (!pool.length) pool = facts;
  }
  for (const f of pool) {
    for (let fi = 0; fi < frames.length; fi++) {
      for (let k = 0; k < 2; k++) {
        const feel = voice.feel[sim.rng.int(0, voice.feel.length - 1)];
        const candidate = realWithRng(voice, intent, f.text, feel, voice.you, sim.rng);
        let score = 0;
        for (const old of npc._said) score = Math.max(score, similarity(old, candidate));
        if (f.id === npc._lastFact) score += 0.4;
        if (score < bestScore) { bestScore = score; best = { text: candidate, fact: f }; }
        if (score === 0) break;
      }
      if (bestScore === 0) break;
    }
    if (bestScore === 0) break;
  }

  let text, fact;
  if (best) {
    text = best.text;
    fact = best.fact;
  } else {
    text = mode === 'greet' ? `${voice.you}来了。` : '……';
    fact = { id: 'silent', topic: 'none' };
  }
  npc._said.push(text);
  if (npc._said.length > 16) npc._said.shift();
  return { text, intent, fact, source: 'local' };
}

/**
 * 双人闲聊：第二个人回应第一个人的"意图"，而不是复读同一句。
 */
export function composeChatter(a, b, sim, kind) {
  if (kind === 'quarrel') {
    return { a: compose(a, sim, 'chat'), b: { text: '……', intent: 'complain', fact: null } };
  }
  const first = compose(a, sim, 'chat');
  const r = sim.rng;
  if (kind === 'deep' && !r.chance(0.6)) {
    const second = { text: `${r.chance(0.5) ? '嗯。' : '……'}这话我记住了。`, intent: 'warm', fact: null };
    return { a: first, b: second };
  }
  const voice = VOICE[b.id] || FALLBACK_VOICE;
  const replies = [
    { text: `嗯。${voice.feel[r.int(0, voice.feel.length - 1)]}。`, intent: 'warm', fact: null },
    { text: '你说得对。', intent: 'warm', fact: null },
    { text: '是这么回事。', intent: 'share', fact: null },
    { text: compose(b, sim, 'chat').text, intent: 'share', fact: null },
  ];
  return { a: first, b: r.pick(replies) };

}


// 睡着的人不会说完整的句子——但也不该永远只回同一句。
const SLEEPY = {
  lan: ['唔……水……渠还没浇完……', '（翻了个身）……再一会儿……', '（没醒，含糊地）……地里的，我记着的。'],
  mo: ['……嗯。', '（哼了一声，没醒）', '……木头别受潮……'],
  li: ['……颜色，还没调匀……', '（把脸埋进枕头）……不画了……', '……别关灯……'],
  ye: ['……药三碗水……', '（在梦里应了一声）……我在。', '……谁不舒服了？'],
  man: ['……灶上还温着汤……', '（嘟囔）……账……明天再算……', '……再来一壶？'],
  he: ['……水涨了……', '（翻身）……嗯，鱼在那儿……', '……别吵，听水声……'],
  shi: ['……我在值夜。', '（警觉了一下，又睡过去）……谁？', '……门闩……插好了……'],
  niu: ['……这价，不能再低了……', '（含糊）……银货两讫……', '……路不好走，明早再说……'],
};

export function sleepLine(npc, sim) {
  const pool = SLEEPY[npc.id] || ['……唔。'];
  npc._said = npc._said || [];
  // 轮着说，不随机：睡着的三段话说完之前不会重复
  npc._sleepI = ((npc._sleepI || 0) + 1) % pool.length;
  const text = pool[npc._sleepI];
  npc._said.push(text);
  if (npc._said.length > 16) npc._said.shift();
  return text;
}

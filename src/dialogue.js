// dialogue.js — per-character voice. Lines are picked by situation, mood and
// how well the player knows the person. Written per person, not per archetype:
// 阿岚 talks about land and debt, 老墨 gives short factual sentences, 阿梨
// answers sideways, 苏叶 asks after you before herself, 小满 trades gossip,
// 青禾 talks about water, 石头 checks things, 铁牛 turns everything into a deal.
import { clamp } from './core.js';

export const VOICE = {
  lan: {
    greet: [
      '你来了。地里的事一天也停不得，不过说两句话的工夫还是有的。',
      '早。看你像是没睡好，我这有热水。',
      '正好，帮我看看这垄苗，是不是有点发黄？',
    ],
    busy: [
      '手上的活还没完，等会儿再聊。',
      '这畦得赶在晌午前浇完，你先坐着。',
      '别站田埂上，土松，会陷。',
    ],
    idle: [
      '土地不会骗人。你给它多少，它就还你多少——就是还的时候慢。',
      '我爹说，种地的人最怕两件事：天不下雨，和自己骗自己。',
      '今年要是收成好，我想把西边那块地也开出来。',
    ],
    night: ['天黑了，早点回吧。夜里的风对骨头不好。', '灯我留着，你走的时候帮我吹了。'],
    rain: ['下雨好，省一趟水。就是别下太久。', '雨天适合修农具，可惜我总懒得修。'],
    low: ['说实话，最近有点撑不住。', '有些账，不是勤快就能还上的。'],
    high: ['今年这苗长得比哪年都好。', '我今天心情不错，什么都想干一点。'],
    gift: ['……你留着钱自己用吧。不过既然给了，我记着。', '谢了。下回有新鲜菜，我给你留一份。'],
    secret: ['去年为了保住这块地，我向铁牛借了钱。到现在还没还上。', '我没跟人说过这事。你别看我这样，我也怕。'],
  },
  mo: {
    greet: ['嗯。', '来了。有事说事。', '站远点，锯末飞。'],
    busy: ['在干活。', '手上这个榫还没合上。', '等我把这块刨平。'],
    idle: [
      '木头有脾气。你顺着它，它就服你；你硬来，它裂给你看。',
      '镇上一半的房子是我修的。修得好的房子，人不记得是谁修的。',
      '手艺这东西，一天不摸就生。',
    ],
    night: ['夜里不做细活，眼睛不行。', '睡吧。明天还有明天的活。'],
    rain: ['雨天木头吸水，尺寸会变。今天只磨刀。'],
    low: ['……手有点抖。', '年纪到了，不服不行。'],
    high: ['今天这一刀很顺。', '这活我满意。'],
    gift: ['用不着。……放着吧。', '嗯。谢谢。'],
    secret: ['我有个女儿。早年洪水那年，没找回来。', '这事我不说，你也别问别人。'],
  },
  li: {
    greet: ['嘘——别动，光正好。', '你来得巧，我刚画完一片云。', '你身上有外面的味道，让我看看。'],
    busy: ['别说话，我在等光。', '这幅差一口气，你先坐。', '手上有颜料，不能握。'],
    idle: [
      '我想画镇子醒来的那一刻，可我自己总醒不过来。',
      '颜色是会说话的。你看这条街，它其实在打哈欠。',
      '有人说画要像，我觉得画要让人停下来。',
    ],
    night: ['夜里颜色都跑了，只剩蓝。', '这个时候画画最安静，也最容易画坏。'],
    rain: ['雨天最好画，什么都模模糊糊的，像还没发生。'],
    low: ['我可能只是有天赋，一辈子没有作品。', '今天画什么都不对。'],
    high: ['我感觉我能画出来。真的。', '你看这张，是不是有点意思了？'],
    gift: ['给我的？……我拿什么回你。', '这个颜色我喜欢。谢谢。'],
    secret: ['城里有个画廊请我过去。信来了两个月了，我一直没拆完。', '我怕走了以后，这里就不需要我了。'],
  },
  ye: {
    greet: ['来了。先坐下，我看你气色。', '手伸出来。……嗯，还好。', '你今天走路的样子不太对，腰疼？'],
    busy: ['等我包完这服药。', '有个病人还在里面，稍等。', '你先坐，我这边马上好。'],
    idle: [
      '镇上的人生病总是拖，拖到不能拖了才来。',
      '药柜比我家当多。这话不好笑，但确实是这样。',
      '我不是不信人，我是习惯了自己处理。',
    ],
    night: ['这个点还没睡的，多半有心事。', '夜里别喝凉的。'],
    rain: ['雨天关节疼的人多，我得多备些药。'],
    low: ['我救不回的人，比你以为的多。', '今天不太想说话，抱歉。'],
    high: ['今天来的都是小毛病，是好事。', '难得清闲，我居然有点不习惯。'],
    gift: ['你留着吧。……好，我收下，但下次别破费。', '谢谢。你这个人，比看上去细心。'],
    secret: ['我右手夜里会发麻。可能是病，也可能只是累。', '我没告诉过别人。医生最难医的是自己。'],
  },
  man: {
    greet: ['哟，来了！坐哪都行，就是别坐柜台——那是我算账的地方。', '喝点什么？今天有新的。', '你这衣服该换了，我给你介绍个做衣裳的？'],
    busy: ['锅上还炖着东西，等我一下。', '这会儿正忙，一会儿我过去给你倒一杯。', '哎，三号桌要结账——你先坐！'],
    idle: [
      '这镇上什么事我都知道一点。你想听哪件？',
      '酒馆是镇子的心脏，我负责让它跳。',
      '人一喝酒就说真话。所以我从不喝多。',
    ],
    night: ['这个点还坐着，是有心事还是有话？', '打烊了，但我可以给你留一盏灯。'],
    rain: ['雨天生意好，人都往有热气的地方钻。'],
    low: ['说实话，最近账不太好算。', '有时候我怕有一天没人再来。'],
    high: ['今天满座！这才像话。', '你看这些人，都是冲着我的菜来的。'],
    gift: ['给我的？那我得回你一杯。', '哎哟，这么客气。记你账上——不是钱，是人情。'],
    secret: ['酒馆的房契快到期了。债主是外镇的人，不好说话。', '我天天笑，一半是生意，一半是怕。'],
  },
  he: {
    greet: ['……嗯。', '水面上有动静，等我一下。', '你脚步轻，鱼没跑。'],
    busy: ['先别说话，浮子在动。', '这一竿还没收。'],
    idle: [
      '雨落在水面上的声音，和落在别处不一样。',
      '塘里有条白鳞鱼，我见过一次，没钓上来。',
      '镇上的人说我不爱说话。其实我只是不知道说给谁听。',
    ],
    night: ['夜里水面会响，像有人在下面走。', '你听。'],
    rain: ['下雨的时候鱼最活。你站远点，别踩着影子。'],
    low: ['今天什么都没钓到。', '……有时候觉得，一个人也挺好。'],
    high: ['今天有口。你看。', '风是斜的，鱼就靠边。'],
    gift: ['……不用。', '谢谢。我没什么能给你的，这条鱼你拿着。'],
    secret: ['夜里我会对着水面说话，像在跟谁汇报一天的事。', '别问是谁。我自己也说不清。'],
  },
  shi: {
    greet: ['站住。……是你。', '巡查。你有事？', '这条路我一天走六趟。'],
    busy: ['我在巡街，有话快说。', '那边门没关好，我去看看。'],
    idle: [
      '这块地砖松了三年，没人修。我记着。',
      '我不喜欢意外。意外意味着有人没做好自己的事。',
      '守夜的时候，镇子安静得能听见自己的心跳。',
    ],
    night: ['这个点在外面走的，要么有急事，要么有问题。', '回去吧。我送你到路口。'],
    rain: ['雨天路滑，别走河边。'],
    low: ['我判断错过一次。就一次。', '有些事我不想再提。'],
    high: ['今天一切正常。正常就是好消息。', '街上没什么事，挺好。'],
    gift: ['不用。……行，收下。', '谢了。有事喊我。'],
    secret: ['我退伍不是因为伤，是因为一次误判。', '那次之后我就知道，眼睛看见的不一定是真的。'],
  },
  niu: {
    greet: ['哎！来得正好，我这儿有笔生意。', '朋友，看你面相就是个能干事的。', '坐坐坐，别站着，站着像讨债的。'],
    busy: ['我在盘货，你等我点完这一箱。', '账不对，差三个铜板。'],
    idle: [
      '这镇上缺点什么？缺人气。人气来了，钱就来了。',
      '我不骗人。我只是把话说得让人爱听。',
      '走南闯北这么多年，我明白一件事：所有东西都有价。',
    ],
    night: ['夜里不谈生意，谈感情。……好吧，也谈生意。'],
    rain: ['雨天货不好走，路烂。'],
    low: ['最近手头紧。这话你别往外说。', '生意这东西，翻脸比翻书快。'],
    high: ['今天成交了三笔！这才叫日子。', '你看这条街，将来都是铺子。'],
    gift: ['你这就见外了。……不过我这人不怕见外。', '痛快！我记你一个人情。'],
    secret: ['我欠了外镇商队一大笔货款。拆东墙补西墙，补不了多久。', '看起来最有钱的人，往往最怕算账。'],
  },
};

const FALLBACK = {
  greet: ['嗯，你好。'],
  busy: ['我这儿还忙着，回头说。'],
  idle: ['今天还好，就是有点忙。'],
  night: ['天晚了，早点休息。'],
  rain: ['这雨下得正好。'],
  low: ['最近有点累。'],
  high: ['今天心情不错。'],
  gift: ['谢谢。'],
  secret: ['……这事我没跟别人说过。'],
};

function pick(rng, list) {
  if (!list || !list.length) return null;
  return list[Math.floor(rng.float(0, list.length)) % list.length];
}

// Which register is this person in right now?
export function situationOf(npc, sim) {
  if (npc.act?.id === 'sleep' || npc.sleeping) return 'sleep';
  const c = sim.clock;
  if (sim.weatherId === 'rain') return 'rain';
  if (c.hour >= 21 || c.hour < 6) return 'night';
  if (npc.act && ['work', 'harvest', 'water', 'plant', 'chop', 'build', 'fish', 'paint', 'treat', 'serve', 'trade', 'forage', 'buyMeal', 'eat'].includes(npc.act.id)) return 'busy';
  return 'idle';
}

// Player-facing line. Mood and familiarity override the situation register,
// so the same person sounds different at 20 trust and at 70.
export function replyFor(npc, sim) {
  const rng = sim.rng;
  const voice = VOICE[npc.id] || FALLBACK;
  const pr = sim.playerRel(npc.id);
  const sit = situationOf(npc, sim);
  const mood = npc.mood;

  if (sit === 'sleep') return '……（她睡着了，你没忍心叫醒）';

  let poolName = sit;
  if (mood < 26) poolName = 'low';
  else if (mood > 78) poolName = 'high';
  else if (pr.affinity > 62 && sit === 'idle') poolName = rng.chance(0.5) ? 'high' : 'idle';

  let line = pick(rng, voice[poolName]) || pick(rng, FALLBACK[poolName]) || pick(rng, FALLBACK.idle);
  if (pr.familiarity <= 1 && sit === 'idle' && voice.greet) line = pick(rng, voice.greet) || line;
  return line;
}

// A second beat: the person asks you something, or tells you what they heard.
// Returns null most of the time so conversations stay short.
export function followUpFor(npc, sim) {
  const rng = sim.rng;
  const pr = sim.playerRel(npc.id);
  const heard = npc.beliefs.filter((b) => b.kind === 'hearsay' || b.kind === 'secret');

  if (heard.length && rng.chance(0.34)) {
    const b = heard[Math.floor(rng.float(0, heard.length)) % heard.length];
    const who = sim.npcById(b.about)?.name || '某人';
    const gist = b.text.length > 30 ? b.text.slice(0, 29) + '…' : b.text;
    if (b.kind === 'secret') return `这事我只跟你说：${who}……算了，不说了。`;
    return rng.chance(0.5)
      ? `你听说了吗？${who}那边，${gist}`
      : `我跟你说个事，别外传——${who}，${gist}`;
  }
  if (pr.familiarity >= 3 && rng.chance(0.22)) {
    const asks = {
      lan: '你从外面来，外面的地，是不是也这样一年一年地熬？',
      mo: '你会做木活吗？不会我教你。手比嘴可靠。',
      li: '你说，人为什么非得画点什么才觉得自己活着？',
      ye: '你最近睡得好吗？别敷衍我，我看得出来。',
      man: '你说实话，我这酒馆，还能撑几年？',
      he: '你听过鱼在水底下叫吗？……我也没听过。',
      shi: '你在外面走过很多地方。有没有见过不该看见的事？',
      niu: '你身上有多少钱？……别紧张，我随口一问。',
    };
    return asks[npc.id] || null;
  }
  return null;
}

export function giftLine(npc, sim, ok) {
  const voice = VOICE[npc.id] || FALLBACK;
  if (!ok) return voice.busy?.[0] || '……';
  return pick(sim.rng, voice.gift) || '谢谢。';
}

export function secretLine(npc, sim) {
  const voice = VOICE[npc.id] || FALLBACK;
  return pick(sim.rng, voice.secret) || npc.profile.secret;
}

// Short ambient line for two NPCs talking, shown as a speech bubble.
// Short reactions — the second person in a conversation answers in their own
// voice instead of echoing the first one. Eight people, eight rhythms.
const BACK = {
  lan: ['嗯，是这个理。', '你这话我记下了。', '地里的活等不得，我先去了。'],
  mo: ['嗯。', '有道理。', '说完了？'],
  li: ['……你说得对。', '我回头画下来。', '嗯，我听见了。'],
  ye: ['你最近睡得好吗？', '别硬撑。', '嗯，我在听。'],
  man: ['来一杯？', '这话我爱听。', '你先坐，我给你倒水。'],
  he: ['水里的东西，说不准。', '嗯。', '风向变了。'],
  shi: ['我记下了。', '这事我留意。', '嗯。'],
  niu: ['这买卖能做。', '嗯，算得过来。', '有消息记得告诉我。'],
};

// Returns who says what: opener in a's voice, reaction in b's.
export function chatterBubble(a, b, kind, rng) {
  const va = VOICE[a.id] || FALLBACK;
  const vb = VOICE[b.id] || FALLBACK;
  if (kind === 'quarrel') {
    return {
      a: pick(rng, ['你这话什么意思？', '我懒得跟你说。', '行，你厉害。']),
      b: '……',
    };
  }
  if (kind === 'deep') {
    return {
      a: pick(rng, ['……你也这么想？', '这事我没跟别人说过。', '说出来好受点。']),
      b: pick(rng, (BACK[b.id] || ['嗯。']).slice(0, 2)),
    };
  }
  const wet = a.sim && a.sim.weather === 'rain';
  const dark = a.sim && a.sim.clock.isLate;
  const pool = wet ? (va.rain || va.idle) : dark ? (va.night || va.idle) : va.idle;
  return {
    a: pick(rng, pool),
    b: pick(rng, BACK[b.id] || vb.greet || ['嗯。']),
  };
}

// data.js — static content: traits, residents, jobs, buildings, weather.
// All numbers here are prototype tuning values, kept in one place on purpose.

export const TRAITS = {
  diligent: {
    name: '勤勉', desc: '闲下来会不安，干活时更专注。',
    mods: { workSpeed: 1.15, energyMul: 1.06, diligence: 1 },
  },
  lazy: {
    name: '懒散', desc: '能坐着就不站着，但很会享受生活。',
    mods: { workSpeed: 0.82, funMul: 1.2, energyMul: 0.92, diligence: -1 },
  },
  warm: {
    name: '热情', desc: '和人说话时眼睛会亮起来。',
    mods: { chatBonus: 2, socialMul: 0.85, trustGain: 0.3 },
  },
  distant: {
    name: '孤僻', desc: '独处比热闹更让他安心。',
    mods: { chatBonus: -2, socialMul: 0.7, conflictBias: 0.2 },
  },
  gossipy: {
    name: '八卦', desc: '镇上的事，她总是第一个知道。',
    mods: { gossipRate: 0.8, chatBonus: 1, socialMul: 0.9 },
  },
  steady: {
    name: '沉稳', desc: '很少被情绪推着走。',
    mods: { conflictBias: -1.2, workSpeed: 1.05, moodSwing: 0.8 },
  },
  impatient: {
    name: '急躁', desc: '走路快，说话也快。',
    mods: { moveSpeed: 1.12, conflictBias: 1, workSpeed: 1.04 },
  },
  handy: {
    name: '手巧', desc: '什么东西坏了，看一眼就知道怎么修。',
    mods: { buildSpeed: 1.45, workSpeed: 1.08 },
  },
  romantic: {
    name: '浪漫', desc: '会在意晚霞、旧歌和没说完的话。',
    mods: { funMul: 0.9, moodBase: 3, chatBonus: 1 },
  },
  suspicious: {
    name: '多疑', desc: '别人对他好，他先想为什么。',
    mods: { trustGain: -0.6, conflictBias: 0.6, moodBase: -2 },
  },
  generous: {
    name: '慷慨', desc: '口袋里有一块，愿意分半块出去。',
    mods: { spend: 1.2, chatBonus: 1, trustGain: 0.4 },
  },
  shrewd: {
    name: '精明', desc: '算盘在心里，从不吃亏。',
    mods: { spend: 0.8, workSpeed: 1.06, moodSwing: 0.9 },
  },
  sensitive: {
    name: '敏感', desc: '别人一句话，他能想一整晚。',
    mods: { moodSwing: 1.5, chatBonus: 1, conflictBias: 0.4 },
  },
  honest: {
    name: '正直', desc: '宁可吃亏，也不愿说假话。',
    mods: { trustGain: 0.6, conflictBias: -1 },
  },
  stubborn: {
    name: '固执', desc: '认定的事，九头牛也拉不回。',
    mods: { conflictBias: 0.8, resolve: 1 },
  },
  optimist: {
    name: '乐观', desc: '明天总会更好一点。',
    mods: { moodBase: 6, moodSwing: 0.85 },
  },
  pessimist: {
    name: '悲观', desc: '先把最坏的情况想好。',
    mods: { moodBase: -6, moodSwing: 1.1 },
  },
  curious: {
    name: '好奇', desc: '总想看看街角后面是什么。',
    mods: { curiosity: 1, moveSpeed: 1.05, funMul: 0.92 },
  },
};

export const JOBS = {
  farmer: { label: '农夫', windows: [[7, 11], [14, 18]], color: '#79b46a' },
  carpenter: { label: '木匠', windows: [[8, 17]], color: '#c2a06a' },
  artist: { label: '画家', windows: [[10, 20]], color: '#d98cc0' },
  doctor: { label: '医生', windows: [[8, 18]], color: '#8fd0c8' },
  tavern: { label: '酒馆老板', windows: [[10, 23]], color: '#e0a458' },
  fisher: { label: '渔夫', windows: [[6, 12], [16, 19]], color: '#5fa8d3' },
  guard: { label: '守卫', windows: [[7, 19]], color: '#9aa0a6' },
  merchant: { label: '商人', windows: [[9, 18]], color: '#c96f5a' },
};

export const BUILDING_DEFS = [
  { name: '阿岚家', type: 'house', x: 3, y: 10, w: 4, h: 3, owner: 'lan' },
  { name: '老墨家', type: 'house', x: 8, y: 10, w: 4, h: 3, owner: 'mo' },
  { name: '阿梨家', type: 'house', x: 13, y: 10, w: 4, h: 3, owner: 'li' },
  { name: '酒馆', type: 'tavern', x: 20, y: 9, w: 6, h: 4, owner: 'man' },
  { name: '诊所', type: 'clinic', x: 28, y: 10, w: 5, h: 3, owner: 'ye' },
  { name: '画室', type: 'studio', x: 34, y: 10, w: 4, h: 3, owner: 'li' },
  { name: '青禾家', type: 'house', x: 3, y: 17, w: 4, h: 3, owner: 'he' },
  { name: '石头家', type: 'house', x: 8, y: 17, w: 4, h: 3, owner: 'shi' },
  { name: '铁牛家', type: 'house', x: 13, y: 17, w: 4, h: 3, owner: 'niu' },
  { name: '小满家', type: 'house', x: 20, y: 17, w: 4, h: 3, owner: 'man' },
  { name: '镇公所', type: 'hall', x: 26, y: 17, w: 6, h: 3, owner: 'shi' },
  { name: '工坊', type: 'workshop', x: 34, y: 17, w: 4, h: 3, owner: 'mo' },
  { name: '学堂', type: 'school', x: 22, y: 21, w: 5, h: 3, owner: null },
];

export const BUILDING_STYLE = {
  house: { roof: '#a8624a', wall: '#d9c2a6', trim: '#7c4a38' },
  school: { roof: '#7b8fa8', wall: '#e9eef4', trim: '#4f6276' },
  tavern: { roof: '#8e5a3c', wall: '#e7cba0', trim: '#6d3f28' },
  clinic: { roof: '#6f9c94', wall: '#e8f0ea', trim: '#4d6f6a' },
  studio: { roof: '#a875a0', wall: '#f0e2ee', trim: '#7a5174' },
  hall: { roof: '#6d7f9c', wall: '#dde3ee', trim: '#4e5d78' },
  workshop: { roof: '#8a7a5a', wall: '#d7c9a8', trim: '#665a40' },
};

export const PROFILES = [
  {
    id: 'lan', name: '阿岚', title: '农夫', age: 34, color: '#8ec46a',
    traits: ['diligent', 'stubborn', 'honest'], job: 'farmer',
    home: '阿岚家', work: '农场', coins: 18,
    values: { work: 0.85, social: 0.35, leisure: 0.3 },
    skills: { farming: 8, building: 3, cooking: 4, art: 1, fishing: 2, healing: 1 },
    bio: '三代务农，父亲留下的地在河湾东侧。她相信土地不会骗人，也相信欠下的东西总要还。',
    desire: '让自家农场成为镇上最好的那一片。',
    fear: '干旱、欠收，以及被人发现她也有撑不住的时候。',
    secret: '去年为了保住地，她向铁牛借了一笔钱，至今没还上。',
  },
  {
    id: 'mo', name: '老墨', title: '木匠', age: 52, color: '#c2a06a',
    traits: ['steady', 'handy', 'distant'], job: 'carpenter',
    home: '老墨家', work: '工坊', coins: 34,
    values: { work: 0.9, social: 0.25, leisure: 0.35 },
    skills: { farming: 2, building: 9, cooking: 3, art: 4, fishing: 3, healing: 1 },
    bio: '从北边来，话少手稳。镇上的房子一半是他修的，但他从不参加庆功宴。',
    desire: '造一座能传下去的木塔，证明自己的手艺。',
    fear: '手开始抖。',
    secret: '他有一个早年在洪水里失踪的女儿，从不提起。',
  },
  {
    id: 'li', name: '阿梨', title: '画家', age: 25, color: '#dd94c7',
    traits: ['romantic', 'lazy', 'sensitive'], job: 'artist',
    home: '阿梨家', work: '画室', coins: 12,
    values: { work: 0.45, social: 0.5, leisure: 0.8 },
    skills: { farming: 1, building: 1, cooking: 2, art: 9, fishing: 1, healing: 1 },
    bio: '在城里学过画，回镇上租了间画室。她总说要画下“镇子醒来的那一刻”，却常常睡到中午。',
    desire: '画出让人停下来的画。',
    fear: '一辈子只是“有天赋”，却没有作品。',
    secret: '她收到了城里画廊的邀请，但害怕离开这里。',
  },
  {
    id: 'ye', name: '苏叶', title: '医生', age: 29, color: '#8fd0c8',
    traits: ['warm', 'sensitive', 'steady'], job: 'doctor',
    home: '诊所', work: '诊所', coins: 26,
    values: { work: 0.75, social: 0.6, leisure: 0.4 },
    skills: { farming: 2, building: 2, cooking: 4, art: 3, fishing: 1, healing: 9 },
    bio: '镇上唯一的医生，药柜比家当多。她习惯替所有人担心，唯独不习惯替自己担心。',
    desire: '镇上不再有人因为小病拖成大病。',
    fear: '救不回重要的人。',
    secret: '她的右手在夜里会发麻，可能是病，但她没告诉任何人。',
  },
  {
    id: 'man', name: '小满', title: '酒馆老板', age: 31, color: '#e0a458',
    traits: ['warm', 'gossipy', 'generous'], job: 'tavern',
    home: '小满家', work: '酒馆', coins: 40,
    values: { work: 0.6, social: 0.9, leisure: 0.55 },
    skills: { farming: 2, building: 3, cooking: 7, art: 3, fishing: 2, healing: 2 },
    bio: '酒馆是镇子的心脏，她是心脏的节拍。她记得每个人爱喝什么，也记得每个人不想被提起什么。',
    desire: '让酒馆夜夜有笑声。',
    fear: '有一天没人再来。',
    secret: '酒馆的房契快到期了，债主是外镇的人。',
  },
  {
    id: 'he', name: '青禾', title: '渔夫', age: 27, color: '#5fa8d3',
    traits: ['distant', 'steady', 'romantic'], job: 'fisher',
    home: '青禾家', work: '池塘', coins: 15,
    values: { work: 0.5, social: 0.3, leisure: 0.75 },
    skills: { farming: 2, building: 2, cooking: 3, art: 5, fishing: 9, healing: 1 },
    bio: '天不亮就在塘边，能听出雨落在水面上的差别。镇上的人说他不爱说话，其实他只是不擅长说给人听。',
    desire: '钓到传说里那条白鳞鱼。',
    fear: '池塘被填平，或者被人看穿他其实很怕孤单。',
    secret: '他夜里会对着水面说话，像在跟谁汇报一天的事。',
  },
  {
    id: 'shi', name: '石头', title: '守卫', age: 38, color: '#a6acb3',
    traits: ['honest', 'suspicious', 'stubborn'], job: 'guard',
    home: '石头家', work: '镇公所', coins: 22,
    values: { work: 0.8, social: 0.4, leisure: 0.35 },
    skills: { farming: 2, building: 4, cooking: 2, art: 1, fishing: 3, healing: 2 },
    bio: '退伍回来当了守卫，巡街时记得每一块松动的地砖。他不喜欢意外，也不喜欢解释自己。',
    desire: '镇子在他守夜时从不出事。',
    fear: '自己判断错一次。',
    secret: '他当年退伍不是因为伤，是因为一次误判。',
  },
  {
    id: 'niu', name: '铁牛', title: '商人', age: 44, color: '#c96f5a',
    traits: ['shrewd', 'warm', 'curious'], job: 'merchant',
    home: '铁牛家', work: '镇公所', coins: 55,
    values: { work: 0.7, social: 0.75, leisure: 0.5 },
    skills: { farming: 1, building: 3, cooking: 4, art: 2, fishing: 2, healing: 1 },
    bio: '走南闯北的货郎在镇上落了脚，算盘打得比谁都快，酒喝得比谁都多。他喜欢热闹，因为热闹里有钱的味道。',
    desire: '把这条街做成一条真正的生意街。',
    fear: '被人看穿他其实已经没什么本钱。',
    secret: '他欠了外镇商队一大笔货款，正在拆东墙补西墙。',
  },
];

export const DECOR_DEFS = {
  bench: { name: '长椅', desc: '坐下发呆，恢复乐趣', cost: { wood: 4 }, buildTicks: 5, color: '#b98455' },
  garden: { name: '花圃', desc: '让街角好看一点', cost: { wood: 2, seeds: 2 }, buildTicks: 4, color: '#8fbf6a' },
  fountain: { name: '喷泉', desc: '镇中心的地标', cost: { stone: 6, wood: 3 }, buildTicks: 8, color: '#7fb8d8' },
  lamp: { name: '路灯', desc: '夜里也看得清路', cost: { wood: 2, stone: 1 }, buildTicks: 3, color: '#e8cf86' },
  cottage: { name: '新居', desc: '盖在镇外的新房子，有人会搬进来', cost: { wood: 10, stone: 3 }, buildTicks: 26, color: '#c9a271', house: true },
};

export const WEATHERS = [
  { id: 'sunny', label: '晴', work: 1.05, fun: 1.05, crop: 0 },
  { id: 'cloud', label: '阴', work: 1, fun: 1, crop: 0 },
  { id: 'rain', label: '雨', work: 0.85, fun: 0.85, crop: 1 },
  { id: 'wind', label: '风', work: 0.95, fun: 1.02, crop: 0 },
];

export const LOG_KINDS = ['system', 'social', 'work', 'build', 'drama'];

// 说话倾向：不是台词，是"这个人一开口更可能往哪个方向走"。
// 具体说什么由 language.js 现算，这里只给一个偏移。
export const BIAS = {
  lan: { share: 0.8, complain: 0.4, warm: 0.2 },
  mo: { share: -0.4, ask: -0.3, complain: 0.2 },
  li: { share: 0.6, ask: 0.5 },
  ye: { ask: 0.9, warm: 0.4 },
  man: { share: 1.0, warm: 0.5 },
  he: { complain: 0.5, share: 0.2, ask: -0.2 },
  shi: { ask: 0.8, complain: 0.4, warm: -0.2 },
  niu: { share: 0.6, ask: 0.4 },
};


// 每个人被给定的东西：性别与年龄。它们不决定能力，只决定别人怎么称呼、以及谁能跟谁成为一家。
export const SEX = { lan: 'f', mo: 'm', li: 'f', ye: 'f', man: 'f', he: 'm', shi: 'm', niu: 'm' };
export const AGE = { lan: 34, mo: 41, li: 27, ye: 29, man: 36, he: 23, shi: 30, niu: 45 };
export const NAMES_F = ['阿岩', '小禾', '青杏', '阿棠', '麦子', '素云', '小满', '阿禾'];
export const NAMES_M = ['石头', '阿松', '大川', '小满', '阿岩', '二柱', '老周', '铁生'];

// data/personas.js — 组合式居民生成器（架构 §7：丰富度靠数据驱动 + 组合生成）。
// 8 位手写居民之外，用「名字池 × 职业 × 特质组合 × 背景模板」生成新镇民。
// 全程吃传入的 rng：同种子 → 同镇子（确定性红线）；不硬编码分支，只加数据。
import { JOBS } from '../data.js';

// —— 名字池（避开 8 位手写居民用过的） ——
const GIVEN_F = ['青杏', '阿棠', '麦子', '素云', '阿禾', '小芹', '巧儿', '银铃', '阿柳', '白苓', '织云', '杏儿', '阿桑', '露珠'];
const GIVEN_M = ['阿松', '大川', '二柱', '老周', '铁生', '阿杉', '长顺', '宝根', '小满', '石墩', '阿泉', '满仓', '水生', '阿黎'];
const FAMILY = ['溪', '河', '山', '田', '林', '柳', '谷', '梁', '宁', '方'];

// —— 职业分布（权重）：小镇以农渔为底，工匠商贩为骨 ——
const JOB_WEIGHTS = {
  farmer: 24, fisher: 12, carpenter: 9, merchant: 12,
  tavern: 8, doctor: 6, artist: 5, guard: 7,
};

// —— 特质组合规则：互斥对不能同现（数据驱动，不加分支） ——
const CONTRA = [
  ['diligent', 'lazy'], ['warm', 'distant'], ['optimist', 'pessimist'],
  ['honest', 'shrewd'], ['steady', 'impatient'], ['generous', 'shrewd'],
];
const TRAIT_POOL = [
  'diligent', 'lazy', 'warm', 'distant', 'gossipy', 'steady', 'impatient', 'handy',
  'romantic', 'suspicious', 'generous', 'shrewd', 'sensitive', 'honest', 'stubborn',
  'optimist', 'pessimist', 'curious',
];

// —— 职业 → 工作场所/主技能/价值观基线 ——
const JOB_TABLE = {
  farmer:    { work: '农场',   skill: 'farming',  v: [0.78, 0.42, 0.34] },
  carpenter: { work: '工坊',   skill: 'building', v: [0.82, 0.30, 0.36] },
  artist:    { work: '画室',   skill: 'art',      v: [0.44, 0.52, 0.78] },
  doctor:    { work: '诊所',   skill: 'healing',  v: [0.74, 0.58, 0.40] },
  tavern:    { work: '酒馆',   skill: 'cooking',  v: [0.60, 0.86, 0.55] },
  fisher:    { work: '池塘',   skill: 'fishing',  v: [0.52, 0.30, 0.72] },
  guard:     { work: '镇公所', skill: 'building', v: [0.80, 0.40, 0.34] },
  merchant:  { work: '镇公所', skill: 'farming',  v: [0.70, 0.72, 0.50] },
};

// —— 背景/渴望/恐惧/秘密：模板碎片池（组合出千人千面） ——
const ORIGIN = [
  '从河上游的村子搬来', '在镇上出生长大', '跟着商队路过，留下了',
  '从北边的矿镇来', '逃荒来的，在镇上扎了根', '从城里回来，说外头太累',
];
const QUIRK = [
  '闲下来就擦自己那把小刀', '说话总带着笑', '吃饭一定要坐在靠门的位置',
  '记性极好，谁欠他一把葱都记得', '睡觉很轻，狗一叫就醒', '喜欢收集奇形怪状的石头',
  '哼的歌谁也听不懂词', '雨天膝盖会疼',
];
const DESIRES = [
  '攒够钱，把屋顶翻新一次。', '让家里顿顿有热乎饭。', '在镇上攒出一点名声。',
  '找到一个能说到一处去的人。', '把手艺练到没人挑得出毛病。', '明年这个时候，日子比现在松快一点。',
  '让孩子（如果有的那一天）不用再这么累。',
];
const FEARS = [
  '一场大病把积蓄掏空。', '被人当着众人的面下不来台。', '欠下的债越滚越大。',
  '老了以后没人管。', '自己其实一无是处，只是没人拆穿。', '镇子败落下去，大家都走了。',
];
const SECRETS = [
  '他偷偷藏着一小袋钱，连家里人都不知道。', '她年轻时离开过镇子一次，不到一个月就回来了，谁也没说为什么。',
  '他其实不识字，一直在装。', '她每月十五都会去池塘边放一朵纸折的花。',
  '他欠外镇一个人一个天大的人情。', '她最怕的不是穷，是被人可怜。',
];

function pickTraits(rng) {
  const n = rng.chance(0.6) ? 2 : 3;
  const out = [];
  let guard = 0;
  while (out.length < n && guard++ < 40) {
    const t = rng.pick(TRAIT_POOL);
    if (out.includes(t)) continue;
    if (out.some((x) => CONTRA.some((p) => p.includes(x) && p.includes(t)))) continue;
    out.push(t);
  }
  return out.length >= 2 ? out : ['steady', 'curious'];
}

// 生成 count 个新镇民档案；existingNames 避免重名
export function generateTownsfolk(rng, count, world, existingNames = new Set()) {
  const homes = world.buildings.filter((b) => b.type === 'house').map((b) => b.name);
  const out = [];
  for (let i = 0; i < count; i++) {
    const sex = rng.chance(0.5) ? 'f' : 'm';
    const pool = sex === 'f' ? GIVEN_F : GIVEN_M;
    let name = rng.pick(pool);
    if (existingNames.has(name)) name = rng.pick(FAMILY) + name;
    let guard = 0;
    while (existingNames.has(name) && guard++ < 20) name = rng.pick(pool) + (sex === 'f' ? '儿' : '生');
    existingNames.add(name);

    const job = rng.weighted(Object.keys(JOB_WEIGHTS), (j) => JOB_WEIGHTS[j]);
    const jt = JOB_TABLE[job];
    const traits = pickTraits(rng);
    const age = rng.int(16, 58);
    const mainSkill = Math.round((2 + rng.float(0, 3)) * 10) / 10;
    const skills = {
      farming: 1, building: 1, cooking: 1, art: 1, fishing: 1, healing: 1,
      [jt.skill]: mainSkill,
    };
    const id = `t${i + 1}`;
    out.push({
      id, name, title: JOBS[job].label, age, sex,
      color: JOBS[job].color,
      traits, job,
      home: rng.pick(homes), work: jt.work,
      coins: rng.int(5, 40),
      values: {
        work: Math.min(1, Math.max(0, jt.v[0] + rng.float(-0.12, 0.12))),
        social: Math.min(1, Math.max(0, jt.v[1] + rng.float(-0.12, 0.12))),
        leisure: Math.min(1, Math.max(0, jt.v[2] + rng.float(-0.12, 0.12))),
      },
      skills,
      education: rng.int(8, 48),
      bio: `${rng.pick(ORIGIN)}，${rng.pick(QUIRK)}。`,
      desire: rng.pick(DESIRES),
      fear: rng.pick(FEARS),
      secret: rng.pick(SECRETS),
      generated: true,
    });
  }
  return out;
}

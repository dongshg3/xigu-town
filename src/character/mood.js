// character/mood.js — 情绪计算（架构 §2：当前是单轴 mood，PAD 扩展预留在此模块）。
// 输入：需求、特质 mods、长期底色（mind.moodBase）、街景美观、记忆情感加总。
// 公式与旧 agent.js 的 mood getter 完全一致。
import { clamp } from '../core.js';

export function computeMood(npc) {
  const n = npc.needs;
  let v = 40
    + (n.hunger - 50) * 0.20
    + (n.energy - 50) * 0.10
    + (n.social - 50) * 0.16
    + (n.fun - 50) * 0.16
    + (n.purpose - 50) * 0.10;
  v += npc.mods.moodBase;
  // 长期底色：连着过得不好会往下沉，好日子会慢慢回来（learning.js）
  v += npc.mind?.moodBase || 0;
  // The street you build is part of how the day feels.
  const beauty = npc.sim?.world?.beauty?.() ?? 6;
  v += clamp((beauty - 6) * 0.9, -8, 8);
  v += clamp(npc.memoryComp.moodContribution(), -16, 12);
  return clamp(v, 0, 100);
}

export function moodLabelOf(m) {
  if (m >= 78) return '心情很好';
  if (m >= 62) return '还算愉快';
  if (m >= 45) return '平静';
  if (m >= 30) return '有点烦躁';
  if (m >= 15) return '低落';
  return '快到极限了';
}

export function moodColorOf(m) {
  if (m >= 70) return '#79b46a';
  if (m >= 50) return '#c8c46a';
  if (m >= 30) return '#d9a05a';
  return '#d9766a';
}

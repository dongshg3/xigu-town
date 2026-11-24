// character/traits.js — 特质合成（从 agent.js 搬出，行为不变）。
// 乘性键连乘，其余键累加；结果挂在 npc.mods 上被需求/移动/工作速度消费。
import { TRAITS } from '../data.js';

export const MULT_KEYS = new Set(['workSpeed', 'moveSpeed', 'buildSpeed', 'hungerMul', 'energyMul', 'socialMul', 'funMul', 'spend']);

export const DEFAULT_MODS = {
  workSpeed: 1, moveSpeed: 1, buildSpeed: 1,
  hungerMul: 1, energyMul: 1, socialMul: 1, funMul: 1, spend: 1,
  chatBonus: 0, conflictBias: 0, gossipRate: 0, trustGain: 0,
  moodBase: 0, moodSwing: 1, diligence: 0, curiosity: 0, resolve: 0,
};

export function mergeTraits(traitIds) {
  const mods = { ...DEFAULT_MODS };
  for (const id of traitIds) {
    const t = TRAITS[id];
    if (!t) continue;
    for (const [k, v] of Object.entries(t.mods || {})) {
      if (MULT_KEYS.has(k)) mods[k] = (mods[k] ?? 1) * v;
      else mods[k] = (mods[k] ?? 0) + v;
    }
  }
  return mods;
}

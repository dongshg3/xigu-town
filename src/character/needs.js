// character/needs.js — 需求组件（架构 §2：needs）。
// 五项需求 0-100，自然衰减在 decay()；倍率来自特质 mods。
// 数值与旧 agent.js 内联实现逐行一致——迁移第 2 步只搬位置，不改行为。
import { clamp } from '../core.js';

export const NEED_KEYS = ['hunger', 'energy', 'social', 'fun', 'purpose'];

export class NeedsComponent {
  constructor(rng) {
    // 初始区间与调用顺序必须保持（同种子确定性红线）
    this.values = {
      hunger: rng.float(62, 84),
      energy: rng.float(66, 86),
      social: rng.float(45, 66),
      fun: rng.float(42, 64),
      purpose: rng.float(50, 70),
    };
  }

  // 每 tick 自然变化；sleeping 时能量回升、饥饿减缓
  decay(mods, sleeping) {
    const v = this.values;
    v.hunger = clamp(v.hunger - 0.30 * mods.hungerMul * (sleeping ? 0.45 : 1), 0, 100);
    v.energy = clamp(v.energy + (sleeping ? 5.4 : -0.30 * mods.energyMul), 0, 100);
    v.social = clamp(v.social - 0.40 * mods.socialMul, 0, 100);
    v.fun = clamp(v.fun - 0.29 * mods.funMul, 0, 100);
    v.purpose = clamp(v.purpose - 0.21, 0, 100);
  }

  normalize() {
    for (const k of NEED_KEYS) this.values[k] = clamp(this.values[k], 0, 100);
  }

  sum() {
    const v = this.values;
    return v.hunger + v.energy + v.social + v.fun + v.purpose;
  }
}

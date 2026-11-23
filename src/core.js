// core.js — deterministic RNG, clock, small utilities.
export const TICK_MINUTES = 5;
export const MINUTES_PER_DAY = 1440;
export const DAY_START = 6 * 60; // world starts at 06:00

export class RNG {
  constructor(seed = 1) {
    this.s = (seed >>> 0) || 0x9e3779b9;
  }
  next() {
    let t = (this.s += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  float(a = 0, b = 1) { return a + (b - a) * this.next(); }
  int(a, b) { return Math.floor(this.float(a, b + 1)); }
  pick(arr) { return arr[Math.floor(this.next() * arr.length)]; }
  chance(p) { return this.next() < p; }
  shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
  weighted(items, weightOf) {
    let total = 0;
    for (const it of items) total += Math.max(0, weightOf(it));
    if (total <= 0) return items[0] ?? null;
    let r = this.next() * total;
    for (const it of items) {
      r -= Math.max(0, weightOf(it));
      if (r <= 0) return it;
    }
    return items[items.length - 1];
  }
}

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
export const nowMs = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

export const SEASON_NAMES = ['春', '夏', '秋', '冬'];

export function clockOf(tick) {
  const abs = DAY_START + tick * TICK_MINUTES;
  const day = Math.floor(abs / MINUTES_PER_DAY) + 1;
  const mod = ((abs % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  const hour = Math.floor(mod / 60);
  const minute = mod % 60;
  const hh = String(hour).padStart(2, '0');
  const mm = String(minute).padStart(2, '0');
  // 7 天一个季节，28 天一轮；季节只由天数推导，存档不用额外存
  const season = Math.floor(((day - 1) % 28) / 7);
  return {
    day, hour, minute, minutes: mod,
    season, seasonLabel: SEASON_NAMES[season],
    label: `第 ${day} 天 ${hh}:${mm}`,
    short: `${hh}:${mm}`,
    isNight: hour < 6 || hour >= 21,
    isLate: hour >= 22 || hour < 5,
    atOrAfter: (h) => mod >= h * 60,
  };
}

export function hash2(x, y, salt = 0) {
  let h = Math.imul(x + 374761393, 668265263) ^ Math.imul(y + 1274126177, 2246822519) ^ Math.imul(salt + 1, 3266489917);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export const uid = (() => {
  let n = 0;
  return (p = 'id') => `${p}_${(++n).toString(36)}`;
})();

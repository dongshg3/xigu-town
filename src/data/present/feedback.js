// feedback.js — 事件 kind → 表现层反馈通道的登记表（架构 §9.1）。
// 规则（content-lint 强制）：
//   1. 任何被 emit 的 kind 必须在这里登记（eventBus.strict 下未登记会警告）
//   2. severity ≥ 0.5 的 kind，channels 必须 ≥ 2 项（「通知+地图标记」或同等组合）
// channels: notify / marker / anim / vfx / sfx / log / camera

export const FEEDBACK = {
  // —— 迁移第 1 步已有的事件 ——
  'log.line':        { channels: ['log'], severity: 0.1 },

  // —— 社交 ——
  'social.chatted':     { channels: ['anim', 'log'], severity: 0.15 },
  'social.quarreled':   { channels: ['anim', 'log', 'sfx'], severity: 0.5 },
  'social.reconciled':  { channels: ['anim', 'log'], severity: 0.3 },
  'social.rumorSpread': { channels: ['log'], severity: 0.2 },

  // —— 职业 ——
  'work.shiftStarted':  { channels: ['log'], severity: 0.05 },
  'work.completed':     { channels: ['log'], severity: 0.1 },
  'work.promoted':      { channels: ['notify', 'anim', 'log', 'sfx'], severity: 0.7 },
  'work.fired':         { channels: ['notify', 'log', 'sfx'], severity: 0.7 },

  // —— 家庭 ——
  'family.fellInLove':  { channels: ['notify', 'anim', 'log'], severity: 0.6 },
  'family.married':     { channels: ['notify', 'anim', 'vfx', 'sfx', 'log'], severity: 0.9 },
  'family.childBorn':   { channels: ['notify', 'marker', 'sfx', 'log'], severity: 0.9 },
  'family.divorced':    { channels: ['notify', 'log'], severity: 0.7 },
  'family.quarreled':   { channels: ['anim', 'log'], severity: 0.4 },

  // —— 政治 ——
  'politics.elected':       { channels: ['notify', 'log', 'sfx'], severity: 0.6 },
  'politics.policyEnacted': { channels: ['notify', 'marker', 'log'], severity: 0.5 },
  'politics.protestStarted':{ channels: ['notify', 'marker', 'anim', 'sfx'], severity: 0.8 },

  // —— 教育 ——
  'edu.enrolled':   { channels: ['log'], severity: 0.2 },
  'edu.examPassed': { channels: ['anim', 'log'], severity: 0.3 },
  'edu.graduated':  { channels: ['notify', 'anim', 'log'], severity: 0.5 },

  // —— 建造 ——
  'build.planned':   { channels: ['marker', 'log'], severity: 0.3 },
  'build.started':   { channels: ['marker', 'anim', 'log'], severity: 0.4 },
  'build.completed': { channels: ['marker', 'vfx', 'sfx', 'log'], severity: 0.6 },
  'build.damaged':   { channels: ['notify', 'marker', 'log'], severity: 0.6 },

  // —— 犯罪与司法 ——
  'crime.committed':  { channels: ['log'], severity: 0.4 },
  'crime.witnessed':  { channels: ['anim', 'log'], severity: 0.5 },
  'crime.reported':   { channels: ['marker', 'log'], severity: 0.5 },
  'justice.caseOpened': { channels: ['marker', 'log'], severity: 0.5 },
  'justice.arrested': { channels: ['notify', 'marker', 'anim', 'sfx'], severity: 0.8 },
  'justice.verdict':  { channels: ['notify', 'marker', 'log'], severity: 0.7 },
  'justice.jailed':   { channels: ['marker', 'log'], severity: 0.6 },
  'justice.released': { channels: ['notify', 'log'], severity: 0.5 },

  // —— 健康 ——
  'health.fellIll':   { channels: ['anim', 'log'], severity: 0.4 },
  'health.recovered': { channels: ['anim', 'log'], severity: 0.3 },

  // —— 玩家 ——
  'player.ordered': { channels: ['anim', 'log'], severity: 0.2 },
  'player.gifted':  { channels: ['anim', 'sfx', 'log'], severity: 0.3 },
  'player.talked':  { channels: ['anim', 'log'], severity: 0.1 },
  'player.miracle': { channels: ['notify', 'vfx', 'sfx', 'log'], severity: 0.7 },

  // —— 世界 ——
  'world.seasonChanged': { channels: ['notify', 'log'], severity: 0.4 },
  'world.weatherChanged':{ channels: ['log'], severity: 0.1 },
  'world.caravanArrived':{ channels: ['marker', 'log', 'sfx'], severity: 0.4 },
};

export const CHANNELS = ['notify', 'marker', 'anim', 'vfx', 'sfx', 'log', 'camera'];

// lint 用：登记项本身合不合法
export function lintFeedback() {
  const problems = [];
  for (const [kind, def] of Object.entries(FEEDBACK)) {
    if (!Array.isArray(def.channels) || !def.channels.length) {
      problems.push(`${kind}: 没有反馈通道`);
      continue;
    }
    for (const c of def.channels) {
      if (!CHANNELS.includes(c)) problems.push(`${kind}: 未知通道 ${c}`);
    }
    if ((def.severity ?? 0) >= 0.5 && def.channels.length < 2) {
      problems.push(`${kind}: 重要事件(severity≥0.5)反馈通道不足两项`);
    }
  }
  return problems;
}

export function knownKinds() { return new Set(Object.keys(FEEDBACK)); }

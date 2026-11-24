// systems/rumors.js — 传闻系统（架构 §8：传闻沿关系网传播、逐跳衰减）。
// 传闻是 beliefs 里的 kind:'rumor' 条目：{ key, topic, text, about, valence, cred, hops, source, tick }
// 规则：
//   - 产生：吵架/深聊/被抓现行等事件现场，当事人各记一条（去重只加可信度）
//   - 传播：聊天时双方各把「可信度最高的、对方没听过的」一条传过去，cred ×0.85，hops+1
//   - 影响：坏话长恐惧与竞争，好话长尊重与亲密（只动新维度，不碰旧三维的既有行为）
//   - 全程无 rng：选择规则确定（cred 降序、稳定排序），同种子结果可复现
import { bumpRel } from '../character/rels.js';

export function spawnRumor(npc, sim, { topic, text, about = [], valence = 0, cred = 0.8 }) {
  const key = topic + ':' + [...about].sort().join('+');
  const ex = npc.beliefs.find((b) => b.kind === 'rumor' && b.key === key);
  if (ex) {
    ex.cred = Math.min(1, Math.round((ex.cred + 0.1) * 100) / 100);
    ex.tick = sim.tick;
    return ex;
  }
  const r = { kind: 'rumor', key, topic, text, about: [...about], valence, cred, hops: 0, source: npc.name, tick: sim.tick };
  npc.beliefs.push(r);
  if (npc.beliefs.length > 24) npc.beliefs.shift();
  return r;
}

// 聊天时双向传一条（架构：传闻借社交边扩散）
export function spreadRumors(a, b, sim) {
  passRumor(a, b, sim);
  passRumor(b, a, sim);
}

function passRumor(from, to, sim) {
  const known = new Set(to.beliefs.filter((b) => b.kind === 'rumor').map((b) => b.key));
  const cands = from.beliefs.filter((b) => b.kind === 'rumor' && !known.has(b.key) && b.cred >= 0.15);
  if (!cands.length) return null;
  // cred 降序；并列保持先入先出（稳定排序 → 确定性）
  const sorted = cands.slice().sort((x, y) => y.cred - x.cred);
  const r = sorted[0];
  const copy = {
    ...r,
    cred: Math.round(r.cred * 0.85 * 100) / 100,
    hops: r.hops + 1,
    source: from.name,
    tick: sim.tick,
  };
  to.beliefs.push(copy);
  if (to.beliefs.length > 24) to.beliefs.shift();
  // 听完之后对人的看法会变：只写新维度（fear/rivalry/respect/intimacy）
  for (const id of copy.about) {
    if (id === to.id) continue;
    const rel = to.rel(id);
    const w = copy.cred;
    if (copy.valence < 0) {
      bumpRel(rel, 'fear', -copy.valence * 2 * w);
      bumpRel(rel, 'rivalry', -copy.valence * 1.2 * w);
    } else if (copy.valence > 0) {
      bumpRel(rel, 'respect', copy.valence * 1.6 * w);
      bumpRel(rel, 'intimacy', copy.valence * 0.8 * w);
    }
  }
  return copy;
}

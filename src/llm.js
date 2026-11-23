// 可选的语言模型层：把本地生成器写好的那句话说给一个 OpenAI 兼容端点，
// 让它用同一个人的声口重写一句。没配 Key 时整层静默跳过——游戏照常跑。
const KEY = 'xigu-llm-v1';

export function loadConfig() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { endpoint: '', model: '', apiKey: '' };
    const c = JSON.parse(raw);
    return { endpoint: c.endpoint || '', model: c.model || '', apiKey: c.apiKey || '' };
  } catch { return { endpoint: '', model: '', apiKey: '' }; }
}

export function saveConfig(cfg) {
  localStorage.setItem(KEY, JSON.stringify({
    endpoint: (cfg.endpoint || '').trim(),
    model: (cfg.model || '').trim(),
    apiKey: (cfg.apiKey || '').trim(),
  }));
}

export function clearConfig() { localStorage.removeItem(KEY); }

export function llmReady() {
  const c = loadConfig();
  return Boolean(c.endpoint && c.model);
}

function persona(npc) {
  const p = npc.profile;
  return [
    `你在扮演一个小镇居民：${npc.name}，${p.age} 岁，${p.title}。`,
    `背景：${p.bio}`,
    `渴望：${p.desire}；害怕：${p.fear}。`,
    `性格：${npc.traits.join('、')}。`,
    `他的秘密（绝不主动说出）：${p.secret}`,
    '说话规则：只用中文口语，符合这个人的身份与教养；不解释、不总结、不用书面腔；',
    '不编造世界里不存在的人和事；不超过 34 个字；只输出这一句话。',
  ].join('\n');
}

/**
 * 用外部模型重写一句台词。失败、超时、没配置都返回 null，调用方保留本地那句。
 */
export async function polishLine({ npc, sim, line, mode = 'reply' }) {
  if (!llmReady() || !line) return null;
  const cfg = loadConfig();
  const clock = sim.clock;
  const pr = sim.playerRel(npc.id);
  const recent = npc.topMemories(2).map((m) => m.text).join('；') || '没什么特别的';
  const user = [
    `现在是${clock.label}，天气${sim.weather.label}。`,
    `你手上的事：${npc.goalLabel || '发呆'}${npc.act ? `（${npc.act.label || npc.act.id}）` : ''}。`,
    `你对面前这个旅人的感觉：${pr.affinity >= 60 ? '信得过' : pr.affinity <= 35 ? '还有点防着' : '说不上熟'}，见过 ${pr.familiarity} 次。`,
    `你最近记得的事：${recent}。`,
    mode === 'follow' ? '对方刚接了你的话，你再补一句，可以反问。' : '对方刚跟你搭话，你回一句。',
    `你原本想说的是：「${line}」。把它改写成你此刻真正会脱口而出的一句话。`,
  ].join('\n');

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 7000);
  try {
    const res = await fetch(cfg.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(cfg.apiKey ? { Authorization: `Bearer ${cfg.apiKey}` } : {}),
      },
      body: JSON.stringify({
        model: cfg.model,
        messages: [{ role: 'system', content: persona(npc) }, { role: 'user', content: user }],
        temperature: 0.95,
        max_tokens: 120,
      }),
      signal: ctrl.signal,
    });
    if (!res.ok) return null;
    const data = await res.json();
    let text = data?.choices?.[0]?.message?.content || '';
    text = text.trim().replace(/^["“「']|["”」']$/g, '').replace(/\s+/g, ' ');
    if (!text || text.length > 60) return null;
    if (/作为(一个)?(AI|人工智能)|抱歉|无法|语言模型/i.test(text)) return null;
    return text;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
// ui.js — sidebar panels, resident dossier, log, dialogue modal.
import { TRAITS, JOBS, DECOR_DEFS } from './data.js';
import { clockOf } from './core.js';
import { relTag } from './social.js';
import { REL_DIM_NAMES } from './character/rels.js';
import { GOALS } from './goals.js';
import { summarizeMind } from './learning.js';
import { titleOf } from './development.js';
import { loadConfig, llmReady } from './llm.js';
import { townHTML } from './panels.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pct = (v) => `${Math.round(v)}%`;

export class UI {
  constructor(handlers) {
    this.handlers = handlers;
    this.panel = document.getElementById('panel');
    this.tabsEl = document.getElementById('tabs');
    this.clockEl = document.getElementById('clock');
    this.weatherEl = document.getElementById('weather');
    this.toastEl = document.getElementById('toast');
    this.modal = document.getElementById('modal');
    this.modalBody = document.getElementById('modalBody');
    this.hintEl = document.getElementById('hint');
    this.placementEl = document.getElementById('placement');
    this.placementLabel = document.getElementById('placementLabel');
    this.tab = 'world';
    this.selectedId = null;
    this.logFilter = 'all';
    this.toastTimer = null;
    this.lastPanelBuild = 0;

    this.tabsEl.addEventListener('click', (e) => {
      const b = e.target.closest('[data-tab]');
      if (!b) return;
      this.setTab(b.dataset.tab);
    });

    this.panel.addEventListener('click', (e) => {
      const el = e.target.closest('[data-act]');
      if (!el) return;
      const act = el.dataset.act;
      const id = el.dataset.npc;
      if (act === 'select') this.handlers.onSelect(id);
      else if (act === 'back') this.handlers.onBack();
      else if (act === 'talk') this.handlers.onTalk(id);
      else if (act === 'gift') this.handlers.onGift(id);
      else if (act === 'build') this.handlers.onBuild(el.dataset.type);
      else if (act === 'save') this.handlers.onSave();
      else if (act === 'load') this.handlers.onLoad();
      else if (act === 'newseed') this.handlers.onNewSeed();
      else if (act === 'filter') { this.logFilter = el.dataset.filter; this.render(); }
      else if (act === 'llm-save') this.handlers.onLlmSave?.(el);
      else if (act === 'llm-clear') this.handlers.onLlmClear?.();
      else if (act === 'say') {
        const input = this.panel.querySelector('[data-role=\"say\"]');
        const text = (input?.value || '').trim();
        if (text) { this.handlers.onSay?.(id, text); input.value = ''; }
      }
      else if (act === 'buy') this.handlers.onBuy?.(el.dataset.good, 1);
      else if (act === 'sell') this.handlers.onSell?.(el.dataset.good, 1);
      else if (act === 'order') this.handlers.onOrder?.(id, el.dataset.order);
      else if (act === 'god') this.handlers.onGod?.(id, el.dataset.god);
      else if (act === 'deliver') this.handlers.onDeliver?.(el.dataset.id);
      else if (act === 'claim') this.handlers.onClaim?.(el.dataset.plot);
      else if (act === 'propose') this.handlers.onPropose?.(el.dataset.id);
      else if (act === 'eat') this.handlers.onEat?.();
      else if (act === 'shift') this.handlers.onShift?.();
      else if (act === 'run') this.handlers.onRun?.();
    });

    this.panel.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      const input = e.target.closest('[data-role=\"say\"]');
      if (!input) return;
      e.preventDefault();
      const text = input.value.trim();
      if (text) { this.handlers.onSay?.(input.dataset.npc, text); input.value = ''; }
    });

    document.getElementById('cancelPlacement').addEventListener('click', () => this.handlers.onCancelPlacement());
    this.modal.addEventListener('click', (e) => {
      if (e.target === this.modal || e.target.closest('[data-close]')) this.closeModal();
    });
  }

  setTab(tab) {
    this.tab = tab;
    if (tab !== 'people') this.selectedId = null;
    for (const b of this.tabsEl.querySelectorAll('[data-tab]')) b.classList.toggle('active', b.dataset.tab === tab);
    this.render();
  }

  select(id) {
    this.selectedId = id;
    this.tab = 'people';
    for (const b of this.tabsEl.querySelectorAll('[data-tab]')) b.classList.toggle('active', b.dataset.tab === 'people');
    this.render();
  }

  updateClock(sim) {
    this.clockEl.textContent = sim.clock.label;
    this.weatherEl.textContent = `${sim.clock.seasonLabel}季 · ${sim.weather.label}`;
  }

  update(sim) {
    this.updateClock(sim);
    if (performance.now() - this.lastPanelBuild > 240) {
      this.lastPanelBuild = performance.now();
      this.render(sim);
    }
  }

  render(sim = this.sim) {
    if (!sim) return;
    this.sim = sim;
    const scroll = this.panel.scrollTop;
    if (this.tab === 'town') this.panel.innerHTML = townHTML(sim);
    else if (this.tab === 'world') this.panel.innerHTML = this.worldHTML(sim);
    else if (this.tab === 'people') this.panel.innerHTML = this.selectedId ? this.detailHTML(sim, sim.npcById(this.selectedId)) : this.peopleHTML(sim);
    else this.panel.innerHTML = this.logHTML(sim);
    this.panel.scrollTop = scroll;
  }

  statsHTML(sim) {
    const s = sim.stats();
    const w = sim.world.stock;
    return `
      <div class="statgrid">
        <div class="stat"><div class="k">居民</div><div class="v">${sim.npcs.length} <small>人</small></div></div>
        <div class="stat"><div class="k">平均心情</div><div class="v" style="color:${s.avgMood > 60 ? '#79b46a' : s.avgMood > 40 ? '#e0b05a' : '#d9766a'}">${Math.round(s.avgMood)}</div></div>
        <div class="stat"><div class="k">正在上工</div><div class="v">${s.working} <small>/ ${sim.npcs.length}</small></div></div>
        <div class="stat"><div class="k">正在睡觉</div><div class="v">${s.asleep}</div></div>
      </div>
      <h3>镇子仓库</h3>
      <div class="statgrid">
        <div class="stat"><div class="k">木材</div><div class="v">${w.wood}</div></div>
        <div class="stat"><div class="k">石料</div><div class="v">${w.stone}</div></div>
        <div class="stat"><div class="k">食物</div><div class="v">${w.food}</div></div>
        <div class="stat"><div class="k">种子</div><div class="v">${w.seeds}</div></div>
        <div class="stat"><div class="k">公共资金</div><div class="v">${w.coins} <small>枚</small></div></div>
        <div class="stat"><div class="k">街区美观</div><div class="v">${s.beauty}</div></div>
      </div>
    `;
  }

  worldHTML(sim) {
    const buildBtns = Object.entries(DECOR_DEFS).map(([type, d]) => {
      const cost = Object.entries(d.cost).map(([k, v]) => `${this.resName(k)}${v}`).join(' · ');
      return `<button class="btn buildbtn" data-act="build" data-type="${type}">${d.name}<span class="cost">${cost}</span></button>`;
    }).join('');
    return `
      <h2>溪谷镇</h2>
      <p class="bio">一个正在自己过日子的小镇。你不下令的时候，居民也会吃饭、上工、串门、争吵、藏心事。</p>
      ${this.statsHTML(sim)}
      <h3>改造环境</h3>
      <div class="buildlist">${buildBtns}</div>
      <p class="bio" style="margin-top:8px;color:#8f99a6">放下图纸后，木匠会自己来建。资源从镇子仓库扣除。</p>
      <h3>旅人</h3>
      <div class="statgrid">
        <div class="stat"><div class="k">硬币</div><div class="v">${sim.player.coins}</div></div>
        <div class="stat"><div class="k">位置</div><div class="v" style="font-size:13px">(${Math.round(sim.player.x)}, ${Math.round(sim.player.y)})</div></div>
      </div>
      ${this.llmHTML()}
      <h3>存档</h3>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn" data-act="save">保存到本地</button>
        <button class="btn" data-act="load">读取存档</button>
        <button class="btn danger" data-act="newseed">换个种子重开</button>
      </div>
      <p class="bio" style="margin-top:8px;color:#8f99a6">种子 ${sim.seed} · 第 ${sim.clock.day} 天 · 已运行 ${sim.tick} 刻</p>
    `;
  }

  resName(k) { return ({ wood: '木', stone: '石', food: '食', seeds: '种', coins: '钱' })[k] || k; }

  peopleHTML(sim) {
    const cards = sim.npcs.map((n) => {
      const state = n.act?.id === 'sleep' ? '正在睡觉' : (n.act?.label || n.goalLabel || '发呆');
      return `
        <div class="card" data-act="select" data-npc="${n.id}">
          <div class="row">
            <div class="avatar" style="background:${n.color}">${esc(n.name[0])}</div>
            <div style="flex:1;min-width:0">
              <div class="name">${esc(n.name)} <span class="sub">${n.age} · ${JOBS[n.job]?.label || n.title}</span></div>
              <div class="sub">${esc(n.moodLabel)} · ${esc(state)}</div>
            </div>
            <div style="width:54px"><div class="bar mood"><i style="width:${pct(n.mood)}"></i></div></div>
          </div>
          <div class="now">“${esc(n.thought)}”</div>
        </div>`;
    }).join('');
    return `<h2>居民</h2><p class="bio">点击任何一位，查看完整档案：性格、欲望、秘密、记忆与关系网。</p>${cards}`;
  }

  llmHTML() {
    const cfg = loadConfig();
    const ready = llmReady();
    return `
      <h3>语言模型（可选）</h3>
      <p class="bio" style="color:#8f99a6;margin-bottom:8px">留空就用本地生成器。填入 OpenAI 兼容端点后，每句台词会交给模型按人物设定重写一遍；超时或报错自动退回本地那句。</p>
      <div class="llmrow"><input id="llm-endpoint" placeholder="https://api.example.com/v1/chat/completions" value="${esc(cfg.endpoint)}"></div>
      <div class="llmrow"><input id="llm-model" placeholder="模型名，例如 gpt-4o-mini" value="${esc(cfg.model)}"></div>
      <div class="llmrow"><input id="llm-key" type="password" placeholder="API Key（只存在你的浏览器里）" value="${esc(cfg.apiKey)}"></div>
      <div style="display:flex;gap:8px;margin-top:8px;align-items:center">
        <button class="btn tiny" data-act="llm-save">保存</button>
        <button class="btn tiny" data-act="llm-clear">清除</button>
        <span class="chip ${ready ? 'gold' : ''}">${ready ? '已接入 · 台词由模型润色' : '未接入 · 本地生成'}</span>
      </div>
    `;
  }

  detailHTML(sim, n) {
    if (!n) return this.peopleHTML(sim);
    const mind = summarizeMind(n);
    const pr = sim.playerRel(n.id);
    const secretOpen = sim.revealedSecrets.has(n.id);
    const needRow = (label, key) => `
      <div class="needrow"><span>${label}</span><div class="bar ${key}"><i style="width:${pct(n.needs[key])}"></i></div><span class="num">${Math.round(n.needs[key])}</span></div>`;
    const traits = n.traits.map((t) => `<span class="chip trait" title="${esc(TRAITS[t]?.desc || '')}">${TRAITS[t]?.name || t}</span>`).join('');
    const skillChips = Object.entries(n.skills).sort((a, b) => b[1] - a[1]).slice(0, 4)
      .map(([k, v]) => `<span class="chip blue">${this.skillName(k)} ${v.toFixed(1)}</span>`).join('');
    const rels = [...n.rels.entries()].map(([id, r]) => ({ id, ...r, other: sim.npcById(id) }))
      .filter((r) => r.other).sort((a, b) => b.affinity - a.affinity);
    const relRows = rels.map((r) => {
      // 旧三维之后，把冒出来的新维度（惧/敬/欠/妒/亲/竞）也带出来
      const extras = ['fear', 'respect', 'debt', 'envy', 'intimacy', 'rivalry']
        .filter((k) => (r[k] || 0) >= 1)
        .map((k) => `${REL_DIM_NAMES[k]} ${Math.round(r[k])}`)
        .join(' · ');
      return `
      <div class="relrow">
        <span>${esc(r.other.name)}</span>
        <div class="bar"><i style="width:${pct(r.affinity)}"></i></div>
        <span class="num">${Math.round(r.affinity)}</span>
      </div>
      <div class="sub" style="margin:-4px 0 4px 64px;font-size:11px;color:#7f8b9b">${relTag(r.affinity)} · 信任 ${Math.round(r.trust)} · 熟识 ${Math.round(r.familiarity)}${extras ? ' · ' + extras : ''}</div>
    `;
    }).join('');
    const mems = n.topMemories(7).map((m) => {
      const c = clockOf(m.tick);
      const cls = m.strength > 0.75 ? 'big' : m.valence > 0.4 ? 'good' : m.valence < -0.4 ? 'bad' : '';
      return `<div class="mem ${cls}">${esc(m.text)}<div class="t">D${c.day} ${c.short} · 强度 ${(m.strength * 100).toFixed(0)}</div></div>`;
    }).join('');
    const beliefs = n.beliefs.slice(-8).reverse().map((b) => {
      // 传闻的 about 是数组，秘密/听来是单 id
      const aboutIds = Array.isArray(b.about) ? b.about : [b.about];
      const aboutNames = aboutIds.map((id) => sim.npcById(id)?.name || '某人').join('、');
      if (b.kind === 'rumor') {
        return `<div class="mem"><span class="chip purple" style="margin-right:6px">传闻</span>${esc(b.text)}<div class="t">关于${esc(aboutNames)} · 来自 ${esc(b.source)} · 可信度 ${Math.round((b.cred ?? 0) * 100)}%${b.hops ? ` · 传了 ${b.hops} 手` : ''} · D${clockOf(b.tick).day} ${clockOf(b.tick).short}</div></div>`;
      }
      const about = sim.npcById(aboutIds[0]);
      const tone = b.kind === 'secret' ? 'gold' : 'purple';
      return `<div class="mem ${b.kind === 'secret' ? 'big' : ''}"><span class="chip ${tone}" style="margin-right:6px">${b.kind === 'secret' ? '秘密' : '听来'}</span>关于${esc(about?.name || '某人')}：${esc(b.text)}<div class="t">来自 ${esc(b.source)} · D${clockOf(b.tick).day} ${clockOf(b.tick).short}</div></div>`;
    }).join('') || '<div class="empty">还没有从别人那里听到什么。</div>';
    const sexName = n.sex === 'f' ? '女' : '男';
    const partner = n.partner ? sim.npcById(n.partner) : null;
    const kids = (n.children || []).map((cid) => sim.npcById(cid)).filter(Boolean);
    const identity = `
      <div class="kv"><span>性别 · 年龄</span><b>${sexName} · ${n.age} 岁</b></div>
      <div class="kv"><span>健康</span><b>${n.sick ? '生病中 ' : ''}${Math.round(n.health)}/100</b></div>
      <div class="kv"><span>学识</span><b>${Math.round(n.education)}/100</b></div>
      <div class="kv"><span>家庭</span><b>${partner ? esc(partner.name) : '单身'}${kids.length ? ' · 孩子 ' + kids.map((k) => esc(k.name)).join('、') : ''}</b></div>
      ${titleOf(n) ? `<div class="kv"><span>称号</span><b>${esc(titleOf(n))}</b></div>` : ''}`;

    const godBtns = [
      ['bless', '祝福 8'], ['curse', '惩戒 10'], ['inspire', '点醒 6'], ['reshape', '重塑 24'], ['heal', '治愈 12'],
    ].map(([k, label]) => `<button class="mini" data-act="god" data-npc="${n.id}" data-god="${k}">${label}</button>`).join('');
    const faithNow = `<div class="sub" style="margin-top:6px;font-size:11px;color:#e0b05a">信仰 ${sim.faith ? sim.faith.points : 0} 点 · 神迹 ${sim.faith ? sim.faith.level : 1} 级</div>`;
    const orderBtns = [
      ['work', '去上工'], ['rest', '回家休息'], ['school', '去学堂'],
      ['buy', '去市集'], ['patrol', '去巡查'],
    ].map(([k, label]) => `<button class="mini" data-act="order" data-npc="${n.id}" data-order="${k}">${label}</button>`).join('');
    const orderNow = n.order ? `<div class="sub" style="margin-top:6px;font-size:11px;color:#e0b05a">正在执行：${esc(n.order.label)}</div>` : '';
    const historyRows = (n.history || []).slice(-18).reverse().map((h) => {
      const c = clockOf(h.tick ?? h.t ?? 0);
      return `<div class="mem ${h.kind === 'order' ? 'big' : ''}">${esc(h.text)}<div class="t">D${c.day} ${c.short} · ${h.kind}</div></div>`;
    }).join('') || '<div class="empty">还没有什么可记的。</div>';
    const steps = n.planView().map((s, i) => `<li class="${s.now ? 'now' : ''}"><span class="idx">${i + 1}</span><span>${esc(s.text)}</span></li>`).join('') || '<li><span class="idx">·</span><span>暂无计划</span></li>';
    const schedule = (JOBS[n.job]?.windows || []).map(([a, b]) => `<span class="chip">${String(a).padStart(2, '0')}:00–${String(b).padStart(2, '0')}:00</span>`).join('');
    const waiting = n.waitUntil && n.waitUntil > sim.tick;
    const working = n.act ? `${n.act.label}（还需约 ${n.act.ticks * 5} 分钟）` : (waiting ? '在排队等位置' : n.path ? '在路上' : n.goalLabel || '发呆');
    // 决策动机（架构：每个行为可回答「为什么做」）：选了谁、多少分、候选各多少、谁被跳过
    const why = n.lastDecision;
    const goalName = (id) => GOALS.find((g) => g.id === id)?.label || id;
    const whyHTML = n.order
      ? `<div class="mindrow"><b>决定</b><span>在执行旅人的指令：${esc(n.order.label)}</span></div>`
      : why ? `
        <div class="mindrow"><b>决定</b><span>${esc(goalName(why.chosen))} · 得分 ${why.score.toFixed(1)} · D${clockOf(why.tick).day} ${clockOf(why.tick).short}</span></div>
        <div class="mindrow"><b>候选</b><span>${why.candidates.map((c) => `${esc(goalName(c.goal))} ${c.score}（底 ${c.base}${c.habit ? (c.habit > 0 ? '+' : '') + c.habit + ' 习惯' : ''}）`).join(' · ')}</span></div>
        ${why.skipped && why.skipped.length ? `<div class="mindrow"><b>跳过</b><span>${why.skipped.map(goalName).join('、')}（当时凑不出可行计划）</span></div>` : ''}`
      : '<div class="empty">还没做过新的决定。</div>';

    return `
      <button class="btn tiny" data-act="back">← 返回居民列表</button>
      <div class="row" style="display:flex;gap:12px;margin-top:12px;align-items:center">
        <div class="avatar lg" style="background:${n.color}">${esc(n.name[0])}</div>
        <div>
          <h2>${esc(n.name)}</h2>
          <div class="sub">${n.age} 岁 · ${JOBS[n.job]?.label || n.title} · ${esc(n.profile.work)}</div>
        </div>
      </div>
      <div class="bio">${esc(n.profile.bio)}</div>
      <div class="kv"><b>渴望</b><span>${esc(n.profile.desire)}</span></div>
      <div class="kv"><b>害怕</b><span>${esc(n.profile.fear)}</span></div>
      <div class="kv"><b>秘密</b><span>${secretOpen ? esc(n.profile.secret) : '未公开 · 再聊 ' + Math.max(0, 3 - pr.familiarity) + ' 次，他也许会开口'}</span></div>

      <h3>此刻</h3>
      <div class="plan">
        <div class="goal">${esc(n.goalLabel || '发呆')} · <span style="color:#c8d1dd;font-weight:400">${esc(working)}</span></div>
        <ul class="steps">${steps}</ul>
      </div>
      <div class="chips" style="margin-top:8px">${schedule}</div>

      <h3>为什么这么做</h3>
      <div class="mind">${whyHTML}</div>

      <h3>状态</h3>
      <div class="needrow"><span>心情</span><div class="bar mood"><i style="width:${pct(n.mood)}"></i></div><span class="num">${Math.round(n.mood)}</span></div>
      ${needRow('饥饿', 'hunger')}
      ${needRow('精力', 'energy')}
      ${needRow('社交', 'social')}
      ${needRow('乐趣', 'fun')}
      ${needRow('成就', 'purpose')}

      <h3>性格</h3>
      <div class="chips">${traits}</div>
      <div class="chips" style="margin-top:8px">${skillChips}</div>

      <h3>脑内</h3>
      <div class="mind">
        <div class="mindrow"><b>说话倾向</b><span>${mind.policy.length ? mind.policy.map((p) => `${p.label} ${Math.round(p.value * 100)}`).join(' · ') : '还在观察'}</span></div>
        <div class="mindrow"><b>常提起</b><span>${mind.topics.length ? mind.topics.map((t) => `${t.label} ${Math.round(t.value * 100)}`).join(' · ') : '没有特别在意的'}</span></div>
        <div class="mindrow"><b>学到的事</b><span>${mind.log.length ? mind.log.join('；') : '还没学到什么'}</span></div>
        <div class="mindrow"><b>情绪底色</b><span>${mind.moodBase >= 0.5 ? '过得还算顺' : mind.moodBase <= -0.5 ? '最近有点沉' : '平稳'}（${mind.moodBase.toFixed(1)}）</span></div>
      </div>

      <h3>身份</h3>
      ${identity}
      <h3>神迹</h3>
      <div class="chips">${godBtns}</div>
      ${faithNow}
      <h3>指挥</h3>
      <div class="chips">${orderBtns}</div>
      ${orderNow}
      <h3>个人史</h3>
      <div class="skillchips">${historyRows}</div>
      <h3>关系网</h3>
      <div class="rellist">${relRows || '<div class="empty">还没有熟人。</div>'}</div>
      <div class="kv" style="margin-top:10px"><b>与旅人</b><span>${relTag(pr.affinity)} · 熟悉度 ${pr.familiarity}</span></div>

      <h3>最近的记忆</h3>
      <div class="memlist">${mems || '<div class="empty">还没有值得记住的事。</div>'}</div>

      <h3>听来的事</h3>
      <div class="memlist">${beliefs}</div>

      <h3>随身</h3>
      <div class="chips">
        <span class="chip gold">${n.coins} 枚硬币</span>
        <span class="chip">干粮 ${n.inventory.food}</span>
        <span class="chip">种子 ${n.inventory.seeds}</span>
      </div>

      <div class="sayrow">
        <input data-role="say" data-npc="${n.id}" maxlength="60" placeholder="对 ${esc(n.name)} 说点什么…">
        <button class="mini" data-act="say" data-npc="${n.id}">说</button>
      </div>
      <div style="display:flex;gap:8px;margin-top:10px">
        <button class="btn primary" data-act="talk" data-npc="${n.id}">走上前交谈</button>
        <button class="btn" data-act="gift" data-npc="${n.id}">送礼（5 硬币）</button>
      </div>
      <p class="bio" style="margin-top:8px;color:#8f99a6">交谈 3 次后，他可能会把秘密告诉你。</p>
    `;
  }

  skillName(k) {
    return ({ farming: '农耕', building: '木工', cooking: '厨艺', art: '绘画', fishing: '捕鱼', healing: '医术' })[k] || k;
  }

  logHTML(sim) {
    const filters = [['all', '全部'], ['social', '社交'], ['drama', '事件'], ['work', '劳作'], ['build', '建造'], ['system', '世界']];
    const chips = filters.map(([f, label]) => `<button class="btn tiny ${this.logFilter === f ? 'active' : ''}" data-act="filter" data-filter="${f}">${label}</button>`).join('');
    const rows = sim.logs.slice().reverse().filter((l) => this.logFilter === 'all' || l.kind === this.logFilter).slice(0, 120)
      .map((l) => `<div class="logline kind-${l.kind}"><span class="t">${esc(l.time)}</span><span class="m">${esc(l.text)}${l.count > 1 ? `<span class="rep">×${l.count}</span>` : ''}</span></div>`).join('');
    return `<h2>镇日志</h2><div class="chips" style="margin-bottom:10px">${chips}</div>${rows || '<div class="empty">还没有发生什么。</div>'}`;
  }

  toast(msg, ms = 2400) {
    this.toastEl.textContent = msg;
    this.toastEl.hidden = false;
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => { this.toastEl.hidden = true; }, ms);
  }

  showDialogue(sim, d) {
    const n = sim.npcById(d.npcId);
    if (!n) return;
    this.modal.hidden = false;
    this.modalBody.innerHTML = `
      <div style="display:flex;gap:12px;align-items:center">
        <div class="avatar lg" style="background:${n.color}">${esc(n.name[0])}</div>
        <div><h2>${esc(n.name)}</h2><div class="sub">${esc(n.moodLabel)} · ${esc(n.goalLabel || '')}</div></div>
      </div>
      ${d.asked ? '<p class="bio" style="font-size:13px;color:#8f99a6;margin-top:10px">你：“' + esc(d.asked) + '”</p>' : ''}
      <p class="bio" style="font-size:15px;color:#e8e4da;margin-top:${d.asked ? '6px' : '14px'}">“${esc(d.reply)}”</p>
      ${d.follow ? `<p class="bio" style="font-size:13.5px;color:#b9c3d1;margin-top:8px">${esc(d.follow)}</p>` : ''}
      ${d.secret ? `<div class="mem big" style="margin-top:14px"><span class="chip gold">秘密</span> ${esc(d.secret)}</div>` : ''}
      ${d.asleep ? `<p class="bio" style="color:#8f99a6;margin-top:10px">这个时间打扰，不太合适。</p>` : ''}
      <div style="display:flex;justify-content:flex-end;margin-top:16px"><button class="btn" data-close>知道了</button></div>
    `;
  }

  closeModal() { this.modal.hidden = true; }

  setPlacement(type) {
    if (!type) { this.placementEl.hidden = true; this.hintEl.textContent = '点击地面移动 · 点击居民打开档案 · 空格暂停'; return; }
    this.placementEl.hidden = false;
    this.placementLabel.textContent = `放置：${DECOR_DEFS[type]?.name || type} — 点击草地放下图纸`;
    this.hintEl.textContent = '选择一块空草地放下图纸，木匠会来处理。';
  }
}

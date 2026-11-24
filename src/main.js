// main.js — boot, input, time loop, persistence.
import { Simulation } from './sim.js';
import { hearUtterance } from './understanding.js';
import { Renderer } from './render.js';
import { UI } from './ui.js';
import { saveConfig, clearConfig, polishLine } from './llm.js';
import { DECOR_DEFS, JOBS } from './data.js';
import { ORDER_KINDS } from './orders.js';
import { relTag } from './social.js';
import { play, unlockAudio, setMuted, isMuted } from './audio.js';
import { kick } from './juice.js';
import { saveGame, loadGame } from './persist/store.js';
import { PerfMonitor } from './debug/perf.js';

const SAVE_KEY = 'xigu-town-save-v1';
const TS = 26;
const TPS_BASE = 1.6;          // simulation ticks per real second at 1×

const canvas = document.getElementById('map');
const renderer = new Renderer(canvas);
const speedbar = document.getElementById('speedbar');
const whoChip = document.getElementById('whoChip');
const buildTray = document.getElementById('buildTray');
const buildList = document.getElementById('buildList');
const orderMenu = document.getElementById('orderMenu');

let sim;
let speed = 1;
let paused = false;
let acc = 0;
let placement = null;
let showPlans = false;
let lastBuildMsg = '';
let followId = null;
let shownDialogue = null;
const perf = new PerfMonitor(() => sim);   // F3 性能面板（只读观测）

let polishToken = 0;

// 本地生成器已经把话说好了；配了模型就让它按人物设定重写一遍，
// 失败、超时、说得不像话都保留本地那句。
async function polish(npc) {
  const d = sim.lastDialogue;
  if (!d || !npc) return;
  const token = ++polishToken;
  const better = await polishLine({ npc, sim, line: d.reply });
  if (token !== polishToken) return;
  if (better) {
    d.reply = better;
    npc.speech = { text: better, until: sim.tick + 16 };
    if (!ui.modal.hidden) ui.showDialogue(sim, d);
  }
  if (d.follow) {
    const second = await polishLine({ npc, sim, line: d.follow, mode: 'follow' });
    if (token === polishToken && second) {
      d.follow = second;
      if (!ui.modal.hidden) ui.showDialogue(sim, d);
    }
  }
}
const state = { selectedId: null, hover: { x: -1, y: -1 }, hoverNpc: null, placement: null, showPlans: false };

function boot(seed) {
  sim = new Simulation(seed);
  state.selectedId = null;
  state.placement = null;
  placement = null;
  shownDialogue = null;
  acc = 0;
  ui.setPlacement(null);
  ui.closeModal();
  ui.setTab('world');
  ui.updateClock(sim);
  ui.render(sim);
  document.getElementById('hint').textContent = '点击地面移动 · 点击居民打开档案 · 空格暂停';
}

const ui = new UI({
  onSelect(id) {
    state.selectedId = id;
    ui.select(id);
    syncWho();
    obAdvance('selected');
  },
  onBack() { state.selectedId = null; ui.selectedId = null; followId = null; ui.render(sim); syncWho(); },
  async onTalk(id) {
    const npc = sim.npcById(id);
    if (!npc) return;
    state.selectedId = npc.id;
    ui.select(npc.id);
    const res = sim.requestTalk(npc);
    if (res) { ui.showDialogue(sim, sim.lastDialogue); shownDialogue = sim.lastDialogue; polish(npc); }
    else ui.toast('正在走过去…');
  },
  onSay(id, text) {
    const npc = sim.npcById(id);
    if (!npc) return;
    const d = Math.hypot(npc.x - sim.player.x, npc.y - sim.player.y);
    if (npc.act && npc.act.id === 'sleep') { ui.toast('这个时间，叫不醒。'); return; }
    if (d > 3.2) { ui.toast('走近一点再说。'); return; }
    const res = hearUtterance(npc, sim, text);
    sim.lastDialogue = { npcId: npc.id, reply: res.reply, asked: res.text, tick: sim.tick };
    ui.showDialogue(sim, sim.lastDialogue);
    play('chat');
    shownDialogue = sim.lastDialogue;
    polish(npc);
    ui.render(sim);
  },
  onBuy(good, qty) {
    play('coin');
    const r = sim.buyGood(good, qty);
    ui.toast(r.ok ? '买下了' : r.msg);
    ui.render(sim);
  },
  onSell(good, qty) {
    play('coin');
    const r = sim.sellGood(good, qty);
    ui.toast(r.ok ? '卖掉了' : r.msg);
    ui.render(sim);
  },
  onDeliver(id) {
    play('coin');
    const r = sim.takeOrder(id);
    ui.toast(r.ok ? '交货完成' : r.msg);
    ui.render(sim);
  },
  onGod(id, power) {
    play('levelup');
    const r = sim.god(id, power);
    ui.toast(r.ok ? r.msg : r.msg);
    ui.render(sim);
  },
  onOrder(id, kind, arg) {
    play('panel');
    const r = sim.issueOrder(id, kind, arg);
    ui.toast(r.ok ? '吩咐下去了' : r.msg);
    ui.render(sim);
  },
  onClaim(plotId) {
    const r = sim.claimLand(plotId);
    ui.toast(r.ok ? '这块地归镇上了' : r.msg);
    ui.render(sim);
  },
  onPropose(id) {
    const r = sim.proposePolicy(id);
    ui.toast(r.ok ? '提案通过了' : r.msg);
    ui.render(sim);
  },
  onShift() {
    const r = sim.workShift();
    ui.toast(r.ok ? '帮了半天工，拿到 ' + r.pay + ' 枚硬币' : r.msg);
    ui.render(sim);
  },
  onRun() {
    const r = sim.runForMayor();
    ui.toast(r.ok ? '你宣布参选，下次选举见分晓' : r.msg);
    ui.render(sim);
  },
  onEat() {
    const r = sim.eatTavern();
    ui.toast(r.ok ? '吃饱了' : r.msg);
    ui.render(sim);
  },
  onLlmSave(el) {
    const root = el.closest('#panel') || document;
    saveConfig({
      endpoint: root.querySelector('#llm-endpoint')?.value || '',
      model: root.querySelector('#llm-model')?.value || '',
      apiKey: root.querySelector('#llm-key')?.value || '',
    });
    ui.toast('已保存语言模型设置');
    ui.render(sim);
  },
  onLlmClear() {
    clearConfig();
    ui.toast('已清除，回到本地生成');
    ui.render(sim);
  },
  onGift(id) {
    play('coin');
    const npc = sim.npcById(id);
    if (!npc) return;
    const res = sim.requestGift(npc);
    if (res) {
      ui.toast(res.ok ? `你把 5 枚硬币塞给了${npc.name}。` : (res.msg || '他没有收下。'), 2200);
    } else ui.toast('正在走过去…');
  },
  onBuild(type) { startPlacement(type); },
  onCancelPlacement() { cancelPlacement(); },
  onSave() {
    (async () => {
      try {
        await saveGame(SAVE_KEY, sim.toJSON());
        ui.toast(`已保存（第 ${sim.clock.day} 天）。`);
      } catch (e) { ui.toast(`保存失败：${e.message}`, 3000); }
    })();
  },
  onLoad() {
    (async () => {
      try {
        const raw = await loadGame(SAVE_KEY);
        if (!raw) { ui.toast('本地没有存档。'); return; }
        const data = JSON.parse(raw);
        const fresh = new Simulation(data.seed || 20261123);
        if (!fresh.restore(data)) throw new Error('存档版本不匹配');
        sim = fresh;
        state.selectedId = null;
        ui.selectedId = null;
        cancelPlacement();
        ui.closeModal();
        ui.updateClock(sim);
        ui.render(sim);
        ui.toast('读取完成。');
      } catch (e) { ui.toast(`读取失败：${e.message}`, 3000); }
    })();
  },
  onNewSeed() {
    if (!confirm('放弃当前进度，换一个种子重新生成小镇？')) return;
    const seed = Math.floor(Math.random() * 1e9);
    history.replaceState(null, '', `?seed=${seed}`);
    boot(seed);
    ui.toast(`新的小镇：种子 ${seed}`);
  },
});


function startPlacement(type) {
  if (!DECOR_DEFS[type]) return;
  play('panel');
  placement = type;
  state.placement = type;
  ui.setPlacement(type);
  ui.toast('点地图放下图纸 · Esc 取消', 2200);
}

function cancelPlacement() {
  placement = null;
  state.placement = null;
  ui.setPlacement(null);
}

// ---------- input ----------
function clientToWorld(ev) {
  const p = renderer.pickTile(ev.clientX, ev.clientY);
  return { tx: p.wx / TS, ty: p.wy / TS };
}

function npcAt(tx, ty) {
  let best = null, bestD = 0.85;
  for (const n of sim.npcs) {
    const d = Math.hypot(n.x + 0.5 - tx, n.y + 0.5 - ty);
    if (d < bestD) { bestD = d; best = n; }
  }
  return best;
}

canvas.addEventListener('mousemove', (ev) => {
  const { tx, ty } = clientToWorld(ev);
  state.hover = { x: Math.floor(tx), y: Math.floor(ty) };
  const hitNpc = npcAt(tx, ty);
  state.hoverNpc = hitNpc ? hitNpc.id : null;
  canvas.style.cursor = placement ? 'crosshair' : (hitNpc ? 'pointer' : 'default');
});

canvas.addEventListener('mouseleave', () => { state.hover = { x: -1, y: -1 }; state.hoverNpc = null; });

canvas.addEventListener('pointerdown', () => unlockAudio(), { passive: true });

canvas.addEventListener('click', (ev) => {
  play('click');
  const { tx, ty } = clientToWorld(ev);
  const x = Math.floor(tx), y = Math.floor(ty);
  if (!sim.world.inBounds(x, y)) return;

  if (placement) {
    const res = sim.placeBlueprint(placement, x, y);
    if (res.ok) {
      ui.toast(`图纸已放下：${res.bp.name}。木匠会来处理。`, 2600);
      cancelPlacement();
      obAdvance('built');
    } else {
      ui.toast(res.msg || '这里放不下。', 2600);
    }
    return;
  }

  const npc = npcAt(tx, ty);
  if (npc) {
    state.selectedId = npc.id;
    ui.select(npc.id);
    obAdvance('selected');
    return;
  }
  sim.setPlayerTarget(x, y);
  obAdvance('moved');
  if (state.selectedId) { state.selectedId = null; ui.selectedId = null; }
});

canvas.addEventListener('contextmenu', (ev) => {
  ev.preventDefault();
  if (placement) cancelPlacement();
  else if (state.selectedId) { state.selectedId = null; ui.selectedId = null; ui.render(sim); }
});

speedbar.addEventListener('click', (ev) => {
  const btn = ev.target.closest('button');
  if (!btn) return;
  if (btn.dataset.cmd === 'mute') { setMuted(!isMuted()); syncMute(btn); play('panel'); return; }
  if (btn.dataset.cmd === 'pause') { paused = !paused; syncSpeedbar(); return; }
  if (btn.dataset.speed) {
    speed = Number(btn.dataset.speed) || 1;
    paused = false;
    syncSpeedbar();
  }
});

function syncMute(btn) {
  const b = btn || document.getElementById('muteBtn');
  if (!b) return;
  b.textContent = isMuted() ? '静音' : '有声';
  b.classList.toggle('active', !isMuted());
}



// ---- 底栏 -------------------------------------------------------------
function toggleTray(which) {
  if (which === 'build') openBuild();
  else openOrders();
}

function syncWho() {
  const npc = state.selectedId ? sim.npcById(state.selectedId) : null;
  if (!npc) {
    whoChip.textContent = '未选中 · 滚轮缩放 · 右键拖动画面 · WASD 移动';
    return;
  }
  const jobDef = JOBS[npc.profile.job];
  const job = (jobDef && jobDef.label) || npc.profile.job || '';
  const goal = npc.goalLabel || '闲着';
  whoChip.innerHTML = `<strong>${npc.name}</strong> · ${job} · ${goal} · 心情 ${Math.round(npc.mood)}`;
}

// 建造托盘：卡片式——图标、描述、材料（缺料标红）、工期
const BUILD_GLYPH = { bench: '椅', garden: '花', fountain: '泉', lamp: '灯', cottage: '屋' };

function openBuild() {
  buildList.innerHTML = '';
  for (const [id, def] of Object.entries(DECOR_DEFS)) {
    const b = document.createElement('button');
    b.className = 'bcard';
    b.dataset.build = id;
    const afford = Object.entries(def.cost).every(([k, v]) => (sim.world.stock[k] || 0) >= v);
    if (!afford) b.classList.add('poor');
    const costs = Object.entries(def.cost).map(([k, v]) => {
      const have = sim.world.stock[k] || 0;
      return `<span class="bc-cost ${have >= v ? '' : 'lack'}">${MAT_NAME[k] || k} ${have >= v ? v : `${have}/${v}`}</span>`;
    }).join('');
    b.innerHTML = `<span class="bc-icon" style="--c:${def.color || '#c9a271'}">${BUILD_GLYPH[id] || '建'}</span><span class="bc-body"><b>${def.name}</b><em>${def.desc || ''}</em><span class="bc-costs">${costs}</span></span><span class="bc-time">工期约 ${def.buildTicks * 5} 分钟</span>`;
    buildList.appendChild(b);
  }
  buildTray.hidden = !buildTray.hidden;
  orderMenu.hidden = true;
  document.querySelector('[data-act="build"]').classList.toggle('on', !buildTray.hidden);
  document.querySelector('[data-act="order"]').classList.remove('on');
}

// 指令菜单：先选做什么，「去聊聊」再选找谁
function renderOrderMenu(npc, pickingFor = null) {
  if (pickingFor) {
    const rows = sim.npcs
      .filter((n) => n.id !== npc.id)
      .map((n) => {
        const r = npc.rels.get(n.id);
        const tag = r ? relTag(r.affinity) : '陌生';
        const dist = Math.round(Math.hypot(n.x - npc.x, n.y - npc.y));
        return `<button class="btn tiny opick" data-order-target="${n.id}" data-kind="${pickingFor}"><b>${n.name}</b><em>${tag} · ${dist} 格外</em></button>`;
      }).join('');
    orderMenu.innerHTML = `<span class="bt-title">让 ${npc.name} 去找谁聊？</span><span class="bt-list ob-grid">${rows || '<span class="bt-title">镇上没别人了。</span>'}</span><button class="btn tiny" data-act="orderBack">← 返回</button>`;
    return;
  }
  const hint = npc.act?.id === 'sleep' ? '<span class="bt-title" style="color:#bf5442">他睡着了，指令叫不醒他。</span>' : '';
  const btns = ORDER_KINDS.map((k) =>
    `<button class="btn tiny" data-order="${k.id}" title="${k.hint}">${k.label}${k.id === 'talk' ? '…' : ''}</button>`).join('');
  orderMenu.innerHTML = `<span class="bt-title">让 ${npc.name} 去做什么？</span>${hint}<span class="bt-list">${btns}</span><button class="btn tiny" data-act="cancelOrder">算了</button>`;
}

function openOrders() {
  const npc = state.selectedId ? sim.npcById(state.selectedId) : null;
  if (!npc) { ui.toast('先点一个人。'); return; }
  if (orderMenu.hidden) {
    renderOrderMenu(npc);
    orderMenu.hidden = false;
  } else {
    orderMenu.hidden = true;
  }
  buildTray.hidden = true;
  document.querySelector('[data-act="order"]').classList.toggle('on', !orderMenu.hidden);
  document.querySelector('[data-act="build"]').classList.remove('on');
}

const MAT_NAME = { wood: '木', stone: '石', food: '粮', seeds: '种' };

document.getElementById('actionbar').addEventListener('click', (ev) => {
  const btn = ev.target.closest('button');
  if (!btn) return;
  const act = btn.dataset.act;
  if (act === 'build') { play('panel'); openBuild(); return; }
  if (act === 'cancelBuild' || act === 'cancelOrder') {
    buildTray.hidden = true; orderMenu.hidden = true;
    document.querySelectorAll('.act.on').forEach(b => b.classList.remove('on'));
    return;
  }
  if (act === 'zoomIn') { play('click'); renderer.zoomAt(0.18, canvas.getBoundingClientRect().left + 200, canvas.getBoundingClientRect().top + 200); return; }
  if (act === 'zoomOut') { play('click'); renderer.zoomAt(-0.15, canvas.getBoundingClientRect().left + 200, canvas.getBoundingClientRect().top + 200); return; }
  if (act === 'fit') { play('click'); renderer.cam = { x: 0, y: 0, zoom: 1 }; return; }

  const npc = state.selectedId ? sim.npcById(state.selectedId) : null;
  if (act === 'talk') { if (npc) ui.handlers.onTalk(npc.id); else ui.toast('先点一个人。'); }
  if (act === 'gift') { if (npc) ui.handlers.onGift(npc.id); else ui.toast('先点一个人。'); }
  if (act === 'order') { play('panel'); openOrders(); }
  if (act === 'follow') {
    if (!npc) { ui.toast('先点一个人。'); return; }
    followId = followId === npc.id ? null : npc.id;
    btn.classList.toggle('on', !!followId);
    if (followId) renderer.centerOn(npc.x, npc.y);
    ui.toast(followId ? `跟随 ${npc.name}` : '取消跟随');
  }
});

buildList.addEventListener('click', (ev) => {
  const b = ev.target.closest('[data-build]');
  if (!b) return;
  startPlacement(b.dataset.build);
  buildTray.hidden = true;
  document.querySelector('[data-act="build"]').classList.remove('on');
});

function closeOrderMenu() {
  orderMenu.hidden = true;
  document.querySelector('[data-act="order"]').classList.remove('on');
}

orderMenu.addEventListener('click', (ev) => {
  const b = ev.target.closest('button');
  if (!b) return;
  const npc = state.selectedId ? sim.npcById(state.selectedId) : null;
  if (b.dataset.act === 'cancelOrder') { closeOrderMenu(); return; }
  if (b.dataset.act === 'orderBack') { if (npc) renderOrderMenu(npc); return; }
  if (!npc) { closeOrderMenu(); return; }
  if (b.dataset.orderTarget) {
    ui.handlers.onOrder(npc.id, b.dataset.kind, b.dataset.orderTarget);
    closeOrderMenu();
    return;
  }
  if (b.dataset.order) {
    if (b.dataset.order === 'talk') { renderOrderMenu(npc, 'talk'); return; }
    ui.handlers.onOrder(npc.id, b.dataset.order);
    closeOrderMenu();
  }
});

// ---- 新手引导：三步，走完或跳过就写 localStorage，不再出现 ----
const ONBOARD_KEY = 'xigu-onboard-v1';
const obEl = document.getElementById('onboard');
const obText = document.getElementById('obText');
const obDots = document.getElementById('obDots');
const OB_STEPS = [
  { key: 'moved', text: '第一步：在地图上点一下，让「旅人」走过去。' },
  { key: 'selected', text: '第二步：点一位居民，看看他的档案——性格、渴望、秘密都在里面。' },
  { key: 'built', text: '第三步：按 B 或点右下角「建造」，挑一块草地放下一张图纸，木匠会自己来建。' },
];
const obFlags = { moved: false, selected: false, built: false };
let obStep = 0;

function obRender() {
  if (obEl.hidden) return;
  if (obStep >= OB_STEPS.length) { obFinish(); return; }
  obText.textContent = OB_STEPS[obStep].text;
  obDots.innerHTML = OB_STEPS.map((_, i) =>
    `<i class="${i < obStep ? 'done' : i === obStep ? 'now' : ''}"></i>`).join('');
}

function obStart() {
  try { if (localStorage.getItem(ONBOARD_KEY)) return; } catch { /* 隐私模式下随它去 */ }
  obStep = 0;
  obEl.hidden = false;
  obRender();
}

function obAdvance(key) {
  if (obEl.hidden) return;
  obFlags[key] = true;
  while (obStep < OB_STEPS.length && obFlags[OB_STEPS[obStep].key]) obStep++;
  if (obStep >= OB_STEPS.length) {
    ui.toast('引导完成。这个镇子归你看了——空格暂停，1/2/4/8 变速。', 3600);
  }
  obRender();
}

function obFinish() {
  obEl.hidden = true;
  try { localStorage.setItem(ONBOARD_KEY, '1'); } catch { /* 同上 */ }
}

document.getElementById('obSkip').addEventListener('click', () => { play('click'); obFinish(); });

// ---- 相机：滚轮缩放、右键/Shift 拖动、WASD ----------------------------
canvas.addEventListener('wheel', (ev) => {
  ev.preventDefault();
  renderer.zoomAt(-Math.sign(ev.deltaY) * 0.12, ev.clientX, ev.clientY);
}, { passive: false });

let drag = null;
canvas.addEventListener('pointerdown', (ev) => {
  if (ev.button === 2 || ev.button === 1 || (ev.button === 0 && ev.shiftKey)) {
    drag = { x: ev.clientX, y: ev.clientY };
    canvas.setPointerCapture(ev.pointerId);
    canvas.style.cursor = 'grabbing';
  }
});
canvas.addEventListener('pointermove', (ev) => {
  if (!drag) return;
  const rect = canvas.getBoundingClientRect();
  const dx = (ev.clientX - drag.x) * (renderer.w / rect.width);
  const dy = (ev.clientY - drag.y) * (renderer.h / rect.height);
  renderer.panBy(-dx, -dy);
  drag = { x: ev.clientX, y: ev.clientY };
});
canvas.addEventListener('pointerup', () => { drag = null; canvas.style.cursor = ''; });
canvas.addEventListener('contextmenu', (ev) => ev.preventDefault());

function syncSpeedbar() {
  for (const b of speedbar.querySelectorAll('[data-speed]')) b.classList.toggle('active', !paused && Number(b.dataset.speed) === speed);
  const pb = speedbar.querySelector('[data-cmd="pause"]');
  if (pb) pb.textContent = paused ? '▶' : '⏸';
}

window.addEventListener('keydown', (ev) => {
  if (ev.target instanceof HTMLInputElement || ev.target instanceof HTMLTextAreaElement) return;
  if (ev.code === 'Space') { ev.preventDefault(); paused = !paused; syncSpeedbar(); }
  else if (ev.key === 'Escape') {
    if (!ui.modal.hidden) ui.closeModal();
    else if (placement) cancelPlacement();
    else if (state.selectedId) { state.selectedId = null; ui.selectedId = null; ui.render(sim); }
  } else if (['1', '2', '4', '8'].includes(ev.key)) {
    speed = Number(ev.key); paused = false; syncSpeedbar();
  } else if (ev.key === 'b' || ev.key === 'B') { toggleTray('build'); }
  else if (ev.key === 't' || ev.key === 'T') { const n = state.selectedId && sim.npcById(state.selectedId); if (n) ui.handlers.onTalk(n.id); }
  else if (ev.key === 'g' || ev.key === 'G') { const n = state.selectedId && sim.npcById(state.selectedId); if (n) ui.handlers.onGift(n.id); }
  else if (ev.key === 'o' || ev.key === 'O') { toggleTray('order'); }
  else if (ev.key === 'f' || ev.key === 'F') {
    const n = state.selectedId && sim.npcById(state.selectedId);
    if (n) { followId = followId === n.id ? null : n.id; if (followId) renderer.centerOn(n.x, n.y); }
  }
  else if (['w', 'a', 's', 'd', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(ev.key)) {
    const step = 34;
    if (ev.key === 'w' || ev.key === 'ArrowUp') renderer.panBy(0, step);
    if (ev.key === 's' || ev.key === 'ArrowDown') renderer.panBy(0, -step);
    if (ev.key === 'a' || ev.key === 'ArrowLeft') renderer.panBy(step, 0);
    if (ev.key === 'd' || ev.key === 'ArrowRight') renderer.panBy(-step, 0);
  }
  else if (ev.key === '+' || ev.key === '=') renderer.zoomAt(0.18, innerWidth / 2, innerHeight / 2);
  else if (ev.key === '-') renderer.zoomAt(-0.15, innerWidth / 2, innerHeight / 2);
  else if (ev.key === 'F3') {
    ev.preventDefault(); perf.toggle();
  } else if (ev.key === 'p' || ev.key === 'P') {
    showPlans = !showPlans; state.showPlans = showPlans;
    ui.toast(showPlans ? '显示所有人的行走目标' : '隐藏行走目标', 1200);
  } else if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 's') {
    ev.preventDefault(); ui.handlers.onSave();
  } else if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'l') {
    ev.preventDefault(); ui.handlers.onLoad();
  }
});

// ---------- time loop ----------
let lastFrame = performance.now();
let lastGiftMsg = '';

function frame(now) {
  const dt = Math.min(0.1, (now - lastFrame) / 1000);
  lastFrame = now;

  const t0 = performance.now();
  if (!paused) {
    acc += dt * TPS_BASE * speed;
    let guard = 0;
    while (acc >= 1 && guard < 60) { acc -= 1; sim.step(); guard++; }
    if (guard >= 60) acc = 0;
  }
  const t1 = performance.now();

  if (followId) {
    const n = sim.npcById(followId);
    if (n) renderer.centerOn(n.x, n.y);
    else { followId = null; document.querySelector('[data-act="follow"]').classList.remove('on'); }
  }

  // walking up to someone finishes the request inside sim.step
  if (sim.lastDialogue && sim.lastDialogue !== shownDialogue) {
    shownDialogue = sim.lastDialogue;
    ui.showDialogue(sim, sim.lastDialogue);
    polish(sim.npcById(sim.lastDialogue.npcId));
  }
  const lastLog = sim.logs[sim.logs.length - 1];
  if (lastLog && lastLog.kind === 'gift' && lastLog.text !== lastGiftMsg) {
    lastGiftMsg = lastLog.text;
    ui.toast(lastLog.text, 1800);
  }
  if (lastLog && lastLog.text !== lastBuildMsg) {
    if (lastLog.text.includes('造好了')) { kick(5); play('build'); }
    else if (lastLog.text.includes('搬进了新居')) { kick(4); play('levelup'); }
    else if (lastLog.text.includes('偷')) { kick(2.5); play('alert'); }
    lastBuildMsg = lastLog.text;
  }

  renderer.render(sim, { ...state, selectedId: state.selectedId });
  perf.frame(t1 - t0, performance.now() - t1);   // 性能面板：模拟/渲染耗时拆分
  ui.update(sim);

  if (state.selectedId && !sim.npcById(state.selectedId)) state.selectedId = null;
  syncMute();
syncWho();
requestAnimationFrame(frame);
}

// ---------- start ----------
const params = new URLSearchParams(location.search);
const seedParam = Number(params.get('seed'));
boot(Number.isFinite(seedParam) && seedParam > 0 ? seedParam : 20261123);
syncSpeedbar();
obStart();
ui.toast('空格暂停 · 1/2/4/8 变速 · P 显示目标 · Ctrl+S 保存', 3600);
window.__sim = () => sim;
window.__ui = ui;
window.__perf = perf;
requestAnimationFrame(frame);

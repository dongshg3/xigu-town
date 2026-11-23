// main.js — boot, input, time loop, persistence.
import { Simulation } from './sim.js';
import { hearUtterance } from './understanding.js';
import { Renderer } from './render.js';
import { UI } from './ui.js';
import { saveConfig, clearConfig, polishLine } from './llm.js';
import { DECOR_DEFS } from './data.js';

const SAVE_KEY = 'xigu-town-save-v1';
const TS = 26;
const TPS_BASE = 1.6;          // simulation ticks per real second at 1×

const canvas = document.getElementById('map');
const renderer = new Renderer(canvas);
const speedbar = document.getElementById('speedbar');

let sim;
let speed = 1;
let paused = false;
let acc = 0;
let placement = null;
let showPlans = false;
let shownDialogue = null;

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
  onSelect(id) { state.selectedId = id; ui.select(id); },
  onBack() { state.selectedId = null; ui.selectedId = null; ui.render(sim); },
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
    shownDialogue = sim.lastDialogue;
    polish(npc);
    ui.render(sim);
  },
  onBuy(good, qty) {
    const r = sim.buyGood(good, qty);
    ui.toast(r.ok ? '买下了' : r.msg);
    ui.render(sim);
  },
  onSell(good, qty) {
    const r = sim.sellGood(good, qty);
    ui.toast(r.ok ? '卖掉了' : r.msg);
    ui.render(sim);
  },
  onDeliver(id) {
    const r = sim.takeOrder(id);
    ui.toast(r.ok ? '交货完成' : r.msg);
    ui.render(sim);
  },
  onOrder(id, kind) {
    const r = sim.issueOrder(id, kind);
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
    const npc = sim.npcById(id);
    if (!npc) return;
    const res = sim.requestGift(npc);
    if (res) {
      ui.toast(res.ok ? `你把 5 枚硬币塞给了${npc.name}。` : (res.msg || '他没有收下。'), 2200);
    } else ui.toast('正在走过去…');
  },
  onBuild(type) {
    if (!DECOR_DEFS[type]) return;
    placement = type;
    state.placement = type;
    ui.setPlacement(type);
  },
  onCancelPlacement() { cancelPlacement(); },
  onSave() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(sim.toJSON()));
      ui.toast(`已保存（第 ${sim.clock.day} 天）。`);
    } catch (e) { ui.toast(`保存失败：${e.message}`, 3000); }
  },
  onLoad() {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) { ui.toast('本地没有存档。'); return; }
    try {
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
  },
  onNewSeed() {
    if (!confirm('放弃当前进度，换一个种子重新生成小镇？')) return;
    const seed = Math.floor(Math.random() * 1e9);
    history.replaceState(null, '', `?seed=${seed}`);
    boot(seed);
    ui.toast(`新的小镇：种子 ${seed}`);
  },
});

function cancelPlacement() {
  placement = null;
  state.placement = null;
  ui.setPlacement(null);
}

// ---------- input ----------
function clientToWorld(ev) {
  const rect = canvas.getBoundingClientRect();
  const px = ((ev.clientX - rect.left) / rect.width) * renderer.w;
  const py = ((ev.clientY - rect.top) / rect.height) * renderer.h;
  return { tx: px / TS, ty: py / TS };
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

canvas.addEventListener('click', (ev) => {
  const { tx, ty } = clientToWorld(ev);
  const x = Math.floor(tx), y = Math.floor(ty);
  if (!sim.world.inBounds(x, y)) return;

  if (placement) {
    const res = sim.placeBlueprint(placement, x, y);
    if (res.ok) {
      ui.toast(`图纸已放下：${res.bp.name}。木匠会来处理。`, 2600);
      cancelPlacement();
    } else {
      ui.toast(res.msg || '这里放不下。', 2600);
    }
    return;
  }

  const npc = npcAt(tx, ty);
  if (npc) {
    state.selectedId = npc.id;
    ui.select(npc.id);
    return;
  }
  sim.setPlayerTarget(x, y);
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
  if (btn.dataset.cmd === 'pause') { paused = !paused; syncSpeedbar(); return; }
  if (btn.dataset.speed) {
    speed = Number(btn.dataset.speed) || 1;
    paused = false;
    syncSpeedbar();
  }
});

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

  if (!paused) {
    acc += dt * TPS_BASE * speed;
    let guard = 0;
    while (acc >= 1 && guard < 60) { acc -= 1; sim.step(); guard++; }
    if (guard >= 60) acc = 0;
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

  renderer.render(sim, { ...state, selectedId: state.selectedId });
  ui.update(sim);

  if (state.selectedId && !sim.npcById(state.selectedId)) state.selectedId = null;
  requestAnimationFrame(frame);
}

// ---------- start ----------
const params = new URLSearchParams(location.search);
const seedParam = Number(params.get('seed'));
boot(Number.isFinite(seedParam) && seedParam > 0 ? seedParam : 20261123);
syncSpeedbar();
ui.toast('空格暂停 · 1/2/4/8 变速 · P 显示目标 · Ctrl+S 保存', 3600);
window.__sim = () => sim;
window.__ui = ui;
requestAnimationFrame(frame);

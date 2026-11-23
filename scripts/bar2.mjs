import fs from 'node:fs';
let m = fs.readFileSync('src/main.js','utf8');

// --- 元素引用 ---
m = m.replace("const speedbar = document.getElementById('speedbar');",
`const speedbar = document.getElementById('speedbar');
const whoChip = document.getElementById('whoChip');
const buildTray = document.getElementById('buildTray');
const buildList = document.getElementById('buildList');
const orderMenu = document.getElementById('orderMenu');`);

// --- 状态 ---
m = m.replace("let lastBuildMsg = '';",
"let lastBuildMsg = '';\nlet followId = null;");

// --- 选择时更新底栏 ---
m = m.replace("  onSelect(id) { state.selectedId = id; ui.select(id); },",
`  onSelect(id) {
    state.selectedId = id;
    ui.select(id);
    syncWho();
  },`);

m = m.replace("  onBack() { state.selectedId = null; ui.selectedId = null; ui.render(sim); },",
`  onBack() { state.selectedId = null; ui.selectedId = null; followId = null; ui.render(sim); syncWho(); },`);

// --- 底栏与托盘逻辑 ---
const extra = `

// ---- 底栏 -------------------------------------------------------------
function syncWho() {
  const npc = state.selectedId ? sim.npcById(state.selectedId) : null;
  if (!npc) {
    whoChip.textContent = '未选中 · 滚轮缩放 · 右键拖动画面 · WASD 移动';
    return;
  }
  const job = npc.profile.jobName || npc.profile.job || '';
  const goal = npc.goalLabel || '闲着';
  whoChip.innerHTML = \`<strong>\${npc.name}</strong> · \${job} · \${goal} · 心情 \${Math.round(npc.mood)}\`;
}

function openBuild() {
  buildList.innerHTML = '';
  for (const [id, def] of Object.entries(DECOR_DEFS)) {
    const b = document.createElement('button');
    b.className = 'btn tiny';
    b.dataset.build = id;
    const cost = Object.entries(def.cost).map(([k, v]) => \`\${MAT_NAME[k] || k}\${v}\`).join(' ');
    const afford = Object.entries(def.cost).every(([k, v]) => (sim.world.stock[k] || 0) >= v);
    if (!afford) b.classList.add('poor');
    b.innerHTML = \`<b>\${def.name}</b><em>\${cost}</em>\`;
    buildList.appendChild(b);
  }
  buildTray.hidden = !buildTray.hidden;
  orderMenu.hidden = true;
  document.querySelector('[data-act="build"]').classList.toggle('on', !buildTray.hidden);
}

function openOrders() {
  const npc = state.selectedId ? sim.npcById(state.selectedId) : null;
  if (!npc) { ui.toast('先选一个人。'); return; }
  orderMenu.hidden = !orderMenu.hidden;
  buildTray.hidden = true;
  document.querySelector('[data-act="order"]').classList.toggle('on', !orderMenu.hidden);
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
    ui.toast(followId ? \`跟随 \${npc.name}\` : '取消跟随');
  }
});

buildList.addEventListener('click', (ev) => {
  const b = ev.target.closest('[data-build]');
  if (!b) return;
  startPlacement(b.dataset.build);
  buildTray.hidden = true;
  document.querySelector('[data-act="build"]').classList.remove('on');
});

orderMenu.addEventListener('click', (ev) => {
  const b = ev.target.closest('[data-order]');
  if (!b || !state.selectedId) return;
  ui.handlers.onOrder(state.selectedId, b.dataset.order);
  orderMenu.hidden = true;
  document.querySelector('[data-act="order"]').classList.remove('on');
});

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
`;

m = m.replace("function syncSpeedbar() {", extra + "\nfunction syncSpeedbar() {");

fs.writeFileSync('src/main.js', m, 'utf8');
console.log('actionbar logic wired');
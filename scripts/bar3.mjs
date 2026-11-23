import fs from 'node:fs';
let m = fs.readFileSync('src/main.js','utf8');

// clientToWorld 走 renderer 的相机反算
m = m.replace(`function clientToWorld(ev) {
  const rect = canvas.getBoundingClientRect();
  const px = ((ev.clientX - rect.left) / rect.width) * renderer.w;
  const py = ((ev.clientY - rect.top) / rect.height) * renderer.h;
  return { tx: px / TS, ty: py / TS };
}`,
`function clientToWorld(ev) {
  const p = renderer.pickTile(ev.clientX, ev.clientY);
  return { tx: p.wx / TS, ty: p.wy / TS };
}`);

// 建造入口统一
m = m.replace("  onBuild(type) {", "  onBuild(type) { startPlacement(type); },\n  _onBuildUnused(type) {");

// startPlacement 函数
const start = `
function startPlacement(type) {
  if (!DECOR_DEFS[type]) return;
  play('panel');
  placement = type;
  state.placement = type;
  ui.setPlacement(type);
  ui.toast('点地图放下图纸 · Esc 取消', 2200);
}
`;
m = m.replace("function cancelPlacement() {", start + "\nfunction cancelPlacement() {");

// 键盘：工具快捷键 + WASD 平移 + 缩放
m = m.replace("  } else if (ev.key === 'p' || ev.key === 'P') {",
`  } else if (ev.key === 'b' || ev.key === 'B') { toggleTray('build'); }
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
  else if (ev.key === 'p' || ev.key === 'P') {`);

// toggleTray 帮助函数
m = m.replace("function syncWho() {",
`function toggleTray(which) {
  if (which === 'build') openBuild();
  else openOrders();
}

function syncWho() {`);

// frame 内跟随
m = m.replace("  // walking up to someone finishes the request inside sim.step",
`  if (followId) {
    const n = sim.npcById(followId);
    if (n) renderer.centerOn(n.x, n.y);
    else { followId = null; document.querySelector('[data-act="follow"]').classList.remove('on'); }
  }

  // walking up to someone finishes the request inside sim.step`);

// 启动同步底栏
m = m.replace("syncMute();", "syncMute();\nsyncWho();");

fs.writeFileSync('src/main.js', m, 'utf8');
console.log('keys, follow, placement wired');
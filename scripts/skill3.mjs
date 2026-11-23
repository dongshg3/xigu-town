import fs from 'node:fs';
let m = fs.readFileSync('src/main.js','utf8');

m = m.replace("import { DECOR_DEFS } from './data.js';",
"import { DECOR_DEFS } from './data.js';\nimport { play, unlockAudio, setMuted, isMuted } from './audio.js';\nimport { kick } from './juice.js';");

// 首次交互解锁音频
m = m.replace("canvas.addEventListener('click', (ev) => {",
"canvas.addEventListener('pointerdown', () => unlockAudio(), { passive: true });\n\ncanvas.addEventListener('click', (ev) => {\n  play('click');");

// 建造完成的反馈：日志里出现「造好了」就震一下
m = m.replace(`  if (lastLog && lastLog.kind === 'gift' && lastLog.text !== lastGiftMsg) {
    lastGiftMsg = lastLog.text;
    ui.toast(lastLog.text, 1800);
  }`,
`  if (lastLog && lastLog.kind === 'gift' && lastLog.text !== lastGiftMsg) {
    lastGiftMsg = lastLog.text;
    ui.toast(lastLog.text, 1800);
  }
  if (lastLog && lastLog.text !== lastBuildMsg) {
    if (lastLog.text.includes('造好了')) { kick(5); play('build'); }
    else if (lastLog.text.includes('搬进了新居')) { kick(4); play('levelup'); }
    else if (lastLog.text.includes('偷')) { kick(2.5); play('alert'); }
    lastBuildMsg = lastLog.text;
  }`);

m = m.replace("let shownDialo", "let lastBuildMsg = '';\nlet shownDialo");

// 静音按钮
m = m.replace("if (btn.dataset.cmd === 'pause') {",
"if (btn.dataset.cmd === 'mute') { setMuted(!isMuted()); syncMute(btn); play('panel'); return; }\n  if (btn.dataset.cmd === 'pause') {");

m = m.replace("function syncSpeedbar() {",
`function syncMute(btn) {
  const b = btn || document.getElementById('muteBtn');
  if (!b) return;
  b.textContent = isMuted() ? '静音' : '有声';
  b.classList.toggle('active', !isMuted());
}

function syncSpeedbar() {`);

// 启动时同步一次
m = m.replace("requestAnimationFrame(frame);", "syncMute();\nrequestAnimationFrame(frame);");

// 对话打开时来一声
m = m.replace("    ui.showDialogue(sim, sim.lastDialogue);", "    ui.showDialogue(sim, sim.lastDialogue);\n    play('chat');");
fs.writeFileSync('src/main.js', m, 'utf8');
console.log('main wired: audio + shake');
// 合成音效：不加载任何音频文件，全部用 WebAudio 现场生成。
// 浏览器要求用户手势后才能播放，所以 AudioContext 懒创建。
let ac = null;
let master = null;
let muted = false;

const KEY = 'xigu-muted-v1';

try {
  muted = localStorage.getItem(KEY) === '1';
} catch { /* 隐私模式忽略 */ }

function ensure() {
  if (ac) return ac;
  const Ctor = window.AudioContext || window.webkitAudioContext;
  if (!Ctor) return null;
  ac = new Ctor();
  master = ac.createGain();
  master.gain.value = 0.16;
  master.connect(ac.destination);
  return ac;
}

// 一个音：频率从 f0 滑到 f1，带指数衰减包络
function tone(f0, f1, dur, type = 'triangle', gain = 1, delay = 0) {
  const c = ensure();
  if (!c || muted) return;
  const t0 = c.currentTime + delay;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(f0, t0);
  osc.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(0.9 * gain, t0 + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g);
  g.connect(master);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

function noise(dur, gain = 0.5) {
  const c = ensure();
  if (!c || muted) return;
  const len = Math.floor(c.sampleRate * dur);
  const buf = c.createBuffer(1, len, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = c.createBufferSource();
  src.buffer = buf;
  const g = c.createGain();
  g.gain.value = gain;
  const lp = c.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 1200;
  src.connect(lp); lp.connect(g); g.connect(master);
  src.start();
}

export const SFX = {
  click: () => tone(520, 660, 0.06, 'square', 0.5),
  panel: () => tone(420, 480, 0.08, 'sine', 0.4),
  coin: () => { tone(880, 880, 0.05, 'square', 0.5); tone(1320, 1320, 0.08, 'square', 0.45, 0.05); },
  chat: () => { tone(620, 720, 0.05, 'triangle', 0.45); tone(760, 700, 0.07, 'triangle', 0.35, 0.06); },
  build: () => { noise(0.18, 0.7); tone(180, 90, 0.22, 'sine', 0.8); },
  alert: () => { tone(340, 300, 0.12, 'sawtooth', 0.55); tone(300, 260, 0.14, 'sawtooth', 0.45, 0.12); },
  eat: () => tone(300, 240, 0.09, 'sine', 0.5),
  levelup: () => { [660, 880, 1100, 1320].forEach((f, i) => tone(f, f, 0.1, 'triangle', 0.45, i * 0.08)); },
};

export function play(kind) {
  const fn = SFX[kind];
  if (fn) fn();
}

export function setMuted(next) {
  muted = !!next;
  try { localStorage.setItem(KEY, muted ? '1' : '0'); } catch { /* ignore */ }
}

export function isMuted() {
  return muted;
}

export function unlockAudio() {
  const c = ensure();
  if (c && c.state === 'suspended') c.resume();
}

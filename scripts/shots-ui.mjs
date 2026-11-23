// shots-ui.mjs — 用真实 Chrome 捕捉本轮新 UI 的证据截图（不进 qa/verification.json）。
import { spawn } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync, statSync } from 'node:fs';
import { createServer } from 'node:net';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const OUT = join(ROOT, 'shots');
const PROFILE = join(ROOT, 'qa', '.chrome-profile-shots');
const CHROME = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
].filter(Boolean).find((p) => { try { return statSync(p).isFile(); } catch { return false; } });
if (!CHROME) throw new Error('no chrome');

const freePort = () => new Promise((res, rej) => {
  const s = createServer();
  s.once('error', rej);
  s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => res(port)); });
});

async function waitHttp(url, t = 15000) {
  const until = Date.now() + t;
  while (Date.now() < until) {
    try { const r = await fetch(url); if (r.ok) return; } catch { /* retry */ }
    await sleep(150);
  }
  throw new Error('timeout ' + url);
}

class CDP {
  static open(url) {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(url);
      const c = new CDP(ws);
      ws.addEventListener('open', () => resolve(c));
      ws.addEventListener('error', () => reject(new Error('ws failed')));
    });
  }
  constructor(ws) {
    this.ws = ws; this.nextId = 0; this.pending = new Map();
    ws.addEventListener('message', (ev) => {
      const m = JSON.parse(ev.data);
      if (m.id && this.pending.has(m.id)) {
        const { resolve, reject } = this.pending.get(m.id);
        this.pending.delete(m.id);
        m.error ? reject(new Error(m.error.message)) : resolve(m.result);
      }
    });
  }
  send(method, params = {}) {
    const id = ++this.nextId;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      setTimeout(() => { if (this.pending.has(id)) { this.pending.delete(id); reject(new Error('timeout ' + method)); } }, 20000);
    });
  }
  async eval(expression) {
    const r = await this.send('Runtime.evaluate', { expression: `(async () => { ${expression} })()`, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error('eval: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
    return r.result?.value;
  }
  async shot(name) {
    const { data } = await this.send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(join(OUT, name), Buffer.from(data, 'base64'));
    console.log('shot', name);
  }
  async move(x, y) { await this.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'none' }); }
  async click(x, y) {
    await this.move(x, y);
    await this.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
    await this.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
  }
}

const httpPort = await freePort();
const cdpPort = await freePort();
const base = `http://127.0.0.1:${httpPort}/`;
mkdirSync(OUT, { recursive: true });
const server = spawn(process.execPath, [join(ROOT, 'server.mjs')], { cwd: ROOT, env: { ...process.env, PORT: String(httpPort) }, stdio: 'ignore' });
rmSync(PROFILE, { recursive: true, force: true });
const browser = spawn(CHROME, [
  '--headless=new', `--remote-debugging-port=${cdpPort}`, `--user-data-dir=${PROFILE}`,
  '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--hide-scrollbars',
  '--window-size=1280,800', 'about:blank',
], { stdio: 'ignore' });

try {
  await waitHttp(base);
  await waitHttp(`http://127.0.0.1:${cdpPort}/json/version`);
  let target;
  for (let i = 0; i < 40 && !target; i++) {
    const list = await (await fetch(`http://127.0.0.1:${cdpPort}/json/list`)).json();
    target = list.find((t) => t.type === 'page');
    if (!target) await sleep(150);
  }
  const page = await CDP.open(target.webSocketDebuggerUrl);
  await page.send('Page.enable');
  await page.send('Runtime.enable');
  await page.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });

  // 全新访客：清掉引导标记，进到镇子
  await page.send('Page.navigate', { url: `${base}?seed=20261123` });
  await sleep(1500);
  await page.eval(`localStorage.removeItem('xigu-onboard-v1'); location.reload(); return 1;`);
  await sleep(1800);

  // 1. 新手引导条
  const obVisible = await page.eval(`return !document.getElementById('onboard').hidden;`);
  console.log('onboard visible:', obVisible);
  await page.shot('r11-onboard.png');

  // 2. 建造卡片托盘
  await page.eval(`document.querySelector('#actionbar [data-act="build"]').click(); return 1;`);
  await sleep(400);
  await page.shot('r11-buildcards.png');

  // 3. 放置预览：选长椅，悬停到地图上一块草地 / 再悬停到主街看红色原因
  await page.eval(`document.querySelector('#buildList [data-build="bench"]').click(); return 1;`);
  await sleep(300);
  const pt = await page.eval(`
    const r = document.getElementById('map').getBoundingClientRect();
    const renderer = window.__sim && null;
    return { left: r.left, top: r.top, w: r.width, h: r.height };
  `);
  // 世界坐标 (10,10) 格附近的草地 → 屏幕坐标
  const toScreen = await page.eval(`
    const r = document.getElementById('map').getBoundingClientRect();
    const cam = { x: 0, y: 0, zoom: 1 };
    return { left: r.left, top: r.top, sw: r.width / 1040, sh: r.height / 780 };
  `);
  const gx = (wx) => toScreen.left + (wx * 26 + 13) * toScreen.sw;
  const gy = (wy) => toScreen.top + (wy * 26 + 13) * toScreen.sh;
  await page.move(Math.round(gx(10)), Math.round(gy(8)));
  await sleep(400);
  await page.shot('r11-place-ok.png');
  await page.move(Math.round(gx(10)), Math.round(gy(15)));
  await sleep(400);
  await page.shot('r11-place-street.png');
  // 取消放置
  await page.eval(`window.__ui.handlers.onCancelPlacement(); return 1;`);

  // 4. 指令选人：选中阿岚 → 指令 → 去聊聊 → 选人列表
  await page.eval(`window.__ui.handlers.onSelect('lan'); return 1;`);
  await sleep(300);
  await page.eval(`document.querySelector('#actionbar [data-act="order"]').click(); return 1;`);
  await sleep(300);
  await page.shot('r11-order-menu.png');
  await page.eval(`document.querySelector('#orderMenu [data-order="talk"]').click(); return 1;`);
  await sleep(300);
  await page.shot('r11-order-pick.png');
  // 真的下一条带对象的指令，验证闭环
  const issued = await page.eval(`
    const b = document.querySelector('#orderMenu [data-order-target]');
    b.click();
    const s = window.__sim();
    const lan = s.npcById('lan');
    return { order: lan.order && lan.order.label, hist: lan.history[lan.history.length - 1]?.text };
  `);
  console.log('issued order:', JSON.stringify(issued));

  // 5. 季节换色：跳到秋天第 16 天、冬天第 24 天各截一张
  await page.eval(`const s = window.__sim(); s.tick = 15 * 288; s.lastDay = 16; return 1;`);
  await sleep(600);
  await page.shot('r11-autumn.png');
  await page.eval(`const s = window.__sim(); s.tick = 23 * 288; s.lastDay = 24; return 1;`);
  await sleep(600);
  await page.shot('r11-winter.png');

  const errs = await page.eval(`return window.__errs || [];`);
  console.log('done');
} finally {
  browser.kill();
  server.kill();
}

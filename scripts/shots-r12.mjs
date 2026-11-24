// shots-r12.mjs — 第 12 轮界面证据：居民详情的「为什么这么做 / 关系八维 / 传闻」。
import { spawn } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync, statSync } from 'node:fs';
import { createServer } from 'node:net';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const OUT = join(ROOT, 'shots');
const PROFILE = join(ROOT, 'qa', '.chrome-profile-shots-r12');
const CHROME = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
].filter(Boolean).find((p) => { try { return statSync(p).isFile(); } catch { return false; } });

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

  await page.send('Page.navigate', { url: `${base}?seed=20261123` });
  await sleep(1800);
  await page.eval(`localStorage.setItem('xigu-onboard-v1','1'); return 1;`);

  // 快进两天，让决策记录、传闻、八维都长出来
  const grown = await page.eval(`
    const s = window.__sim();
    for (let i = 0; i < 288 * 2; i++) s.step();
    const decided = s.npcs.filter((n) => n.lastDecision);
    const rumored = s.npcs.filter((n) => n.beliefs.some((b) => b.kind === 'rumor'));
    const dimmed = s.npcs.filter((n) => [...n.rels.values()].some((r) => (r.rivalry || 0) > 0 || (r.intimacy || 0) > 0 || (r.fear || 0) > 0));
    return { decided: decided.length, rumored: rumored.length, dimmed: dimmed.length };
  `);
  console.log('grown:', JSON.stringify(grown));

  // 打开一位有决策记录+传闻的居民详情
  const pickId = await page.eval(`
    const s = window.__sim();
    const best = s.npcs.find((n) => n.lastDecision && n.beliefs.some((b) => b.kind === 'rumor'))
      || s.npcs.find((n) => n.lastDecision);
    window.__ui.handlers.onSelect(best.id);
    return best.id;
  `);
  await sleep(500);
  await page.shot('r12-detail-top.png');
  // 滚到关系网/听来的事
  await page.eval(`document.querySelector('.panel').scrollTop = 99999; return 1;`);
  await sleep(300);
  await page.shot('r12-detail-rels.png');
  console.log('picked npc:', pickId);
  console.log('done');
} finally {
  browser.kill();
  server.kill();
}

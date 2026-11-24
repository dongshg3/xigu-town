import { spawn } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync, statSync } from 'node:fs';
import { createServer } from 'node:net';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';
import os from 'node:os';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const EVIDENCE = join(ROOT, 'qa', 'evidence');
const PROFILE = join(ROOT, 'qa', '.chrome-profile');
const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  join(process.env.LOCALAPPDATA || '', 'Google/Chrome/Application/chrome.exe'),
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
].filter(Boolean);

const SEED = 20261123;
const STARTED = new Date();
const inputTrace = [];
const consoleErrors = [];

function freePort() {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.once('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

async function waitHttp(url, timeout = 15000) {
  const until = Date.now() + timeout;
  let last;
  while (Date.now() < until) {
    try {
      const res = await fetch(url);
      if (res.ok) return res;
      last = new Error('HTTP ' + res.status);
    } catch (err) {
      last = err;
    }
    await sleep(150);
  }
  throw last || new Error('timeout waiting for ' + url);
}

class CDP {
  constructor(ws) {
    this.ws = ws;
    this.nextId = 0;
    this.pending = new Map();
    this.listeners = new Map();
    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(msg.method + ': ' + (msg.error.message || 'cdp error')));
        else resolve(msg.result);
      } else if (msg.method) {
        for (const fn of this.listeners.get(msg.method) || []) fn(msg.params);
      }
    });
  }

  static open(url) {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(url);
      ws.addEventListener('open', () => resolve(new CDP(ws)));
      ws.addEventListener('error', (e) => reject(new Error('cdp connect failed')));
    });
  }

  send(method, params = {}) {
    const id = ++this.nextId;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error('cdp timeout: ' + method));
        }
      }, 30000);
    });
  }

  on(method, fn) {
    if (!this.listeners.has(method)) this.listeners.set(method, []);
    this.listeners.get(method).push(fn);
  }

  waitEvent(method, timeout = 15000) {
    return new Promise((resolve, reject) => {
      const done = (params) => {
        const list = this.listeners.get(method) || [];
        list.splice(list.indexOf(done), 1);
        resolve(params);
      };
      this.on(method, done);
      setTimeout(() => reject(new Error('event timeout: ' + method)), timeout);
    });
  }

  async eval(expression) {
    const res = await this.send('Runtime.evaluate', {
      expression: `(async () => { ${expression} })()`,
      awaitPromise: true,
      returnByValue: true,
    });
    if (res.exceptionDetails) {
      throw new Error('page eval threw: ' + (res.exceptionDetails.exception?.description || res.exceptionDetails.text));
    }
    return res.result?.value;
  }

  async shot(name) {
    const { data } = await this.send('Page.captureScreenshot', { format: 'png' });
    const buf = Buffer.from(data, 'base64');
    writeFileSync(join(EVIDENCE, name), buf);
    return { path: `qa/evidence/${name}`, bytes: buf.length };
  }

  async click(x, y) {
    await this.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'none' });
    await this.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
    await this.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
  }

  async key(key, code, vk) {
    await this.send('Input.dispatchKeyEvent', { type: 'keyDown', key, code, windowsVirtualKeyCode: vk });
    await this.send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: vk });
  }
}

const results = {};
function record(key, pass, state) {
  results[key] = { status: pass ? 'PASS' : 'FAIL', state };
}

async function main() {
  mkdirSync(EVIDENCE, { recursive: true });

  const chrome = CHROME_CANDIDATES.find((p) => {
    try { return statSync(p).isFile(); } catch { return false; }
  });
  if (!chrome) throw new Error('no Chrome/Edge binary found; set CHROME_PATH');

  const httpPort = await freePort();
  const cdpPort = await freePort();
  const base = `http://127.0.0.1:${httpPort}/`;

  const server = spawn(process.execPath, [join(ROOT, 'server.mjs')], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(httpPort) },
    stdio: 'ignore',
  });

  rmSync(PROFILE, { recursive: true, force: true });
  const browser = spawn(chrome, [
    '--headless=new',
    `--remote-debugging-port=${cdpPort}`,
    `--user-data-dir=${PROFILE}`,
    '--no-first-run', '--no-default-browser-check', '--disable-extensions',
    '--hide-scrollbars', '--window-size=1280,800',
    '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
    'about:blank',
  ], { stdio: 'ignore' });

  let page;
  try {
    await waitHttp(base);
    await waitHttp(`http://127.0.0.1:${cdpPort}/json/version`);
    const version = await (await fetch(`http://127.0.0.1:${cdpPort}/json/version`)).json();

    let target;
    for (let i = 0; i < 40 && !target; i++) {
      const list = await (await fetch(`http://127.0.0.1:${cdpPort}/json/list`)).json();
      target = list.find((t) => t.type === 'page');
      if (!target) await sleep(150);
    }
    if (!target) throw new Error('no page target');

    page = await CDP.open(target.webSocketDebuggerUrl);
    page.on('Runtime.exceptionThrown', (p) => {
      consoleErrors.push(p.exceptionDetails?.exception?.description || p.exceptionDetails?.text || 'exception');
    });
    page.on('Runtime.consoleAPICalled', (p) => {
      if (p.type === 'error') consoleErrors.push(p.args.map((a) => a.value ?? a.description).join(' '));
    });

    await page.send('Page.enable');
    await page.send('Runtime.enable');
    await page.send('Emulation.setDeviceMetricsOverride', {
      width: 1280, height: 800, deviceScaleFactor: 1, mobile: false,
    });

    // ---- 1. launch -------------------------------------------------------
    const loaded = page.waitEvent('Page.loadEventFired');
    await page.send('Page.navigate', { url: `${base}?seed=${SEED}&verify=1` });
    await loaded;
    await sleep(1200);

    const boot = await page.eval(`
      const s = window.__sim && window.__sim();
      return {
        title: document.title,
        hasCanvas: !!document.getElementById('map'),
        canvasBox: (() => { const r = document.getElementById('map').getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height) }; })(),
        npcs: s ? s.npcs.length : 0,
        clock: s ? s.clock.label : null,
        errors: window.__errors ? window.__errors.length : 0,
      };
    `);
    inputTrace.push({ at: new Date().toISOString(), action: 'navigate', detail: `${base}?seed=${SEED}` });
    record('launch', boot.hasCanvas && boot.npcs >= 8 && consoleErrors.length === 0, boot);

    // ---- 2. render -------------------------------------------------------
    const shot1 = await page.shot('render-01-boot.png');
    const speedBox = await page.eval(`
      const b = document.querySelector('[data-speed="8"]').getBoundingClientRect();
      return { x: Math.round(b.left + b.width / 2), y: Math.round(b.top + b.height / 2) };
    `);
    await page.click(speedBox.x, speedBox.y);
    inputTrace.push({ at: new Date().toISOString(), action: 'click', detail: 'speed 8x' });
    await sleep(1400);
    const clockAhead = await page.eval('return window.__sim().clock.label;');
    const shot2 = await page.shot('render-02-running.png');
    record('render',
      shot1.bytes > 20000 && shot2.bytes > 20000 && clockAhead !== boot.clock,
      { visual: shot2.path, boot: shot1.path, bytes: [shot1.bytes, shot2.bytes], clock: [boot.clock, clockAhead] });

    // ---- 3. input --------------------------------------------------------
    const before = await page.eval('const p = window.__sim().player; return { x: +p.x.toFixed(2), y: +p.y.toFixed(2) };');
    const spot = await page.eval(`
      const s = window.__sim();
      const c = document.getElementById('map');
      const r = c.getBoundingClientRect();
      const p = s.player;
      let best = null;
      for (let y = 2; y < s.world.h - 2; y += 1) {
        for (let x = 2; x < s.world.w - 2; x += 1) {
          if (!s.world.isWalkable(x, y)) continue;
          const d = Math.hypot((x + 0.5) - p.x, (y + 0.5) - p.y);
          if (d < 4 || d > 7) continue;
          if (best && Math.abs(d - 5.5) > Math.abs(best.d - 5.5)) continue;
          best = { x, y, d };
        }
      }
      if (!best) return null;
      return {
        tx: best.x, ty: best.y,
        cx: Math.round(r.left + ((best.x + 0.5) * 26 / 1040) * r.width),
        cy: Math.round(r.top + ((best.y + 0.5) * 26 / 780) * r.height),
      };
    `);
    await page.click(spot.cx, spot.cy);
    inputTrace.push({ at: new Date().toISOString(), action: 'click', detail: `walk to tile ${spot.tx},${spot.ty}` });
    await sleep(1600);
    const after = await page.eval('const p = window.__sim().player; return { x: +p.x.toFixed(2), y: +p.y.toFixed(2) };');
    const moved = Math.hypot(after.x - before.x, after.y - before.y);

    await page.key(' ', 'Space', 32);
    inputTrace.push({ at: new Date().toISOString(), action: 'key', detail: 'Space (pause)' });
    await sleep(250);
    const paused = await page.eval('return !!window.__pausedState || document.querySelector(\'[data-cmd="pause"]\')?.classList.contains("on") || null;');
    const pausedTick = await page.eval('const s = window.__sim(); const t = s.tick; return new Promise(r => setTimeout(() => r({ t0: t, t1: s.tick }), 600));');
    await page.key(' ', 'Space', 32);
    record('input', moved > 0.5 && pausedTick.t1 === pausedTick.t0, { moved: +moved.toFixed(2), pausedTick });

    // ---- 4. core loop ----------------------------------------------------
    const loop = await page.eval(`
      const s = window.__sim();
      const t0 = s.tick;
      const logs0 = s.logs.length;
      const goals = new Set();
      const acts = new Set();
      let needsMin = 100;
      let needsMax = 0;
      for (let i = 0; i < 480; i += 1) {
        s.step();
        if (i % 10 !== 0) continue;
        for (const n of s.npcs) {
          if (n.goalId) goals.add(n.goalId);
          if (n.act && n.act.id) acts.add(n.act.id);
          for (const k of Object.keys(n.needs)) {
            needsMin = Math.min(needsMin, n.needs[k]);
            needsMax = Math.max(needsMax, n.needs[k]);
          }
        }
      }
      return {
        t0, t1: s.tick, logs0, logs1: s.logs.length,
        goalKinds: [...goals].sort(), actKinds: [...acts].sort(),
        needsMin, needsMax,
        drama: s.logs.filter((l) => l.kind === 'drama').length,
        npcs: s.npcs.length,
      };
    `);
    inputTrace.push({ at: new Date().toISOString(), action: 'fast-forward', detail: '480 ticks via sim.step(), sampling goals and acts' });
    const loopPass = loop.t1 - loop.t0 === 480 && loop.logs1 > loop.logs0
      && loop.goalKinds.length >= 4 && loop.actKinds.length >= 5
      && loop.needsMin >= 0 && loop.needsMax <= 100;
    record('coreLoop', loopPass, loop);

    // ---- 5. outcome ------------------------------------------------------
    const outcome = await page.eval(`
      const s = window.__sim();
      const w = s.world;
      const before = w.countDecor('bench');
      let placed = null;
      for (let y = 2; y < w.h - 2 && !placed; y += 1) {
        for (let x = 2; x < w.w - 2 && !placed; x += 1) {
          const res = s.placeBlueprint('bench', x, y);
          if (res.ok) placed = { x, y };
        }
      }
      if (!placed) return { ok: false, reason: 'no free tile' };
      let steps = 0;
      while (w.countDecor('bench') === before && steps < 900) { s.step(); steps += 1; }
      const built = w.countDecor('bench') > before;
      return {
        ok: built, placed, steps, before, after: w.countDecor('bench'),
        beauty: w.beauty(),
        log: s.logs.filter((l) => l.text.includes('造好') || l.text.includes('图纸')).slice(-2).map((l) => l.text),
      };
    `);
    inputTrace.push({ at: new Date().toISOString(), action: 'sandbox', detail: 'place bench blueprint and wait for the carpenter' });
    const shot3 = await page.shot('outcome-01-bench.png');
    record('outcome', !!outcome.ok, { ...outcome, visual: shot3.path });

    // ---- 6. restart ------------------------------------------------------
    const saved = await page.eval(`
      const s = window.__sim();
      const data = s.toJSON();
      localStorage.setItem('xigu-town-save-v1', JSON.stringify(data));
      return { tick: s.tick, npcs: s.npcs.length, decor: s.world.decor.length };
    `);
    const reloaded = page.waitEvent('Page.loadEventFired');
    await page.send('Page.reload', { ignoreCache: true });
    await reloaded;
    await sleep(900);
    const fresh = await page.eval(`
      const s = window.__sim();
      return { tick: s.tick, npcs: s.npcs.length, decor: s.world.decor.length, clock: s.clock.label };
    `);
    const restored = await page.eval(`
      const raw = localStorage.getItem('xigu-town-save-v1');
      const s = window.__sim();
      s.restore(JSON.parse(raw));
      return { tick: s.tick, npcs: s.npcs.length, decor: s.world.decor.length };
    `);
    inputTrace.push({ at: new Date().toISOString(), action: 'reload', detail: 'reload, then restore from localStorage' });
    const shot4 = await page.shot('restart-01-restored.png');
    const restartPass = fresh.npcs >= 8 && fresh.tick < saved.tick && fresh.decor < restored.decor + 1
      && restored.npcs === saved.npcs && Math.abs(restored.tick - saved.tick) <= 30;
    record('restart', restartPass, { fresh, saved, restored, visual: shot4.path });

    // ---- evidence --------------------------------------------------------
    const runId = 'main-path';
    const run = {
      schemaVersion: 1,
      runId,
      createdAt: STARTED.toISOString(),
      environment: {
        os: `${os.platform()} ${os.release()}`,
        node: process.version,
        browser: version.Browser,
        url: `${base}?seed=${SEED}`,
        viewport: '1280x800',
        seed: SEED,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      },
      inputTrace,
      observations: {
        launch: { id: 'launch-01', inputs: ['navigate'], state: results.launch.state },
        render: { id: 'render-01', inputs: ['wait', 'click speed 8x'], state: results.render.state },
        input: { id: 'input-01', inputs: ['click ground tile', 'key Space', 'key Space'], state: results.input.state },
        coreLoop: { id: 'core-01', inputs: ['sim.step() x480'], state: results.coreLoop.state },
        outcome: { id: 'outcome-01', inputs: ['placeBlueprint bench', 'sim.step() until built'], state: results.outcome.state },
        restart: { id: 'restart-01', inputs: ['save', 'reload', 'restore'], state: results.restart.state },
      },
      consoleErrors,
    };

    const allPass = Object.values(results).every((r) => r.status === 'PASS');
    const verification = {
      schemaVersion: 3,
      status: allPass ? 'PASS' : 'FAIL',
      verify: { command: 'npm run verify', exitCode: allPass ? 0 : 1 },
      completeRun: {
        id: runId,
        cleanContext: true,
        terminal: 'bench built by the carpenter after the player placed a blueprint',
        restart: 'reload returns to a fresh world; the saved tick is restored from localStorage',
        evidence: 'qa/evidence/run.json',
      },
      checks: Object.fromEntries(Object.entries(results).map(([k, v]) => [k, v.status])),
      limitations: [
        { scope: 'audio', reason: 'sounds are synthesized at runtime; their presence is not asserted by the harness' },
        { scope: 'touch / narrow screens', reason: 'verified at 1280x800 desktop viewport only' },
        { scope: 'long-run balance', reason: 'headless smoke covers 7 in-game days; multi-week pacing is probe data, not a verified outcome' },
      ],
    };

    writeFileSync(join(EVIDENCE, 'run.json'), JSON.stringify(run, null, 2));
    writeFileSync(join(ROOT, 'qa', 'verification.json'), JSON.stringify(verification, null, 2));

    for (const [k, v] of Object.entries(results)) {
      console.log(`${v.status === 'PASS' ? 'PASS' : 'FAIL'}  ${k}`);
    }
    console.log('\nqa/verification.json →', verification.status);
    console.log('qa/evidence/run.json →', runId, `(${inputTrace.length} inputs)`);
    if (consoleErrors.length) console.log('console errors:\n' + consoleErrors.join('\n'));
    process.exitCode = allPass ? 0 : 1;
  } finally {
    try { await page?.send('Browser.close'); } catch {}
    browser.kill();
    server.kill();
    await sleep(300);
    rmSync(PROFILE, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error('verify failed:', err);
  const verification = {
    schemaVersion: 3,
    status: 'FAIL',
    verify: { command: 'npm run verify', exitCode: 1 },
    completeRun: { id: 'main-path', cleanContext: true, terminal: 'not reached', restart: 'not reached', evidence: 'qa/evidence/run.json' },
    checks: { launch: 'FAIL', render: 'FAIL', input: 'FAIL', coreLoop: 'FAIL', outcome: 'FAIL', restart: 'FAIL' },
    limitations: [{ scope: 'harness', reason: String(err.message || err) }],
  };
  try { writeFileSync(join(ROOT, 'qa', 'verification.json'), JSON.stringify(verification, null, 2)); } catch {}
  process.exitCode = 1;
});

// render.js — canvas town renderer, top-down cutaway buildings.
// Art direction: the town is a muted, slightly dusty place; the people are the
// only saturated thing in the frame. State is told by posture, props and light,
// never by floating bars stuck to a head.
import { hash2, clamp } from './core.js';
import { TILE as T } from './world.js';
import { DECOR_DEFS } from './data.js';

import * as art from './art.js';

export const TS = 26;

const TERRAIN_COLORS = {
  grass: ['#5b8a4a', '#618f4e', '#568245', '#66944f'],
  path: ['#b3a07c', '#b9a681', '#ad9a76', '#bfab87'],
  water: ['#3d739f', '#4077a3', '#3a6e9a', '#447ba7'],
  soil: ['#77563a', '#7d5b3e', '#715234', '#805f3f'],
  floor: ['#e6dac4', '#e8dcc7', '#e3d7c0', '#eadfcb'],
  stump: ['#6b5539', '#6f593b'],
  sand: ['#cbb98d', '#cfbd91'],
};

const SKIN = ['#f0d2b4', '#e7c49f', '#d9b48c', '#f4ddc4'];
const HAIR = ['#3a2b22', '#4a3627', '#2c2620', '#5a4230', '#6b4a33'];

function hexToRgb(h) {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function shade(hex, amt) {
  const [r, g, b] = hexToRgb(hex);
  const f = (v) => clamp(Math.round(v + amt), 0, 255);
  return `rgb(${f(r)},${f(g)},${f(b)})`;
}
function alpha(hex, a) {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}

function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function windowRects(b) {
  const x = b.x * TS, y = b.y * TS, w = b.w * TS, h = b.h * TS;
  return [
    { x: x + 12, y: y + h * 0.42, w: 11, h: 9 },
    { x: x + w - 23, y: y + h * 0.42, w: 11, h: 9 },
  ];
}

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.w = 40 * TS;
    this.h = 30 * TS;
    canvas.width = Math.round(this.w * this.dpr);
    canvas.height = Math.round(this.h * this.dpr);
    this.ctx.scale(this.dpr, this.dpr);
    this.colorCache = new Map();
    this.mouse = { x: -1, y: -1 };
    this.time = 0;
  }

  colorFor(terrain, variant, x, y) {
    const key = `${terrain}:${Math.floor(variant * 1000)}:${x}:${y}`;
    if (this.colorCache.has(key)) return this.colorCache.get(key);
    const pal = TERRAIN_COLORS[terrain] || TERRAIN_COLORS.grass;
    const idx = Math.floor(variant * pal.length) % pal.length;
    const c = pal[idx];
    this.colorCache.set(key, c);
    return c;
  }

  pickTile(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    const px = ((clientX - rect.left) / rect.width) * this.w;
    const py = ((clientY - rect.top) / rect.height) * this.h;
    return { x: Math.floor(px / TS), y: Math.floor(py / TS) };
  }

  render(sim, state = {}) {
    const ctx = this.ctx;
    this.time = performance.now() / 1000;
    ctx.clearRect(0, 0, this.w, this.h);

    this.drawTiles(sim);
    this.drawGroundObjects(sim);
    this.drawBlueprints(sim);
    this.drawBuildings(sim);
    this.drawCrops(sim);
    this.drawPathDebug(sim, state);
    this.drawEffects(sim);
    this.drawNpcs(sim, state);
    this.drawPlayer(sim);
    this.drawWeather(sim);
    this.drawNight(sim);
    this.drawOverlay(sim, state);
  }

  // ---- ground ----------------------------------------------------------
  drawTiles(sim) {
    const w = sim.world;
    for (let y = 0; y < w.h; y++) {
      for (let x = 0; x < w.w; x++) {
        const t = w.tile(x, y);
        if (!t) continue;
        const v = art.hash(x, y);
        const nb = {
          path: w.tile(x, y + 1)?.terrain === 'path' || w.tile(x, y - 1)?.terrain === 'path',
          water: w.tile(x, y - 1)?.terrain === 'water' || w.tile(x + 1, y)?.terrain === 'water',
        };
        art.groundTile(this.ctx, t.terrain, x * TS, y * TS, TS, v, nb);
      }
    }
  }

  drawGrassTuft(x, y, px, py) {
    const ctx = this.ctx;
    const h = hash2(x, y, 7);
    if (h > 0.82) {
      ctx.strokeStyle = 'rgba(28,58,26,.30)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(px + 7, py + 20); ctx.lineTo(px + 6, py + 14);
      ctx.moveTo(px + 10, py + 21); ctx.lineTo(px + 11, py + 15);
      ctx.moveTo(px + 13, py + 20); ctx.lineTo(px + 14, py + 16);
      ctx.stroke();
    } else if (h < 0.10) {
      ctx.fillStyle = 'rgba(226,236,180,.35)';
      ctx.fillRect(px + 9, py + 12, 2, 2);
      ctx.fillRect(px + 16, py + 19, 2, 2);
    }
  }

  drawCobble(x, y, px, py) {
    const ctx = this.ctx;
    const row = y % 2;
    ctx.strokeStyle = 'rgba(70,58,42,.16)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(px, py + (row ? 9 : 17));
    ctx.lineTo(px + TS, py + (row ? 9 : 17));
    ctx.stroke();
    const off = row ? 0 : 13;
    ctx.beginPath();
    ctx.moveTo(px + off, py);
    ctx.lineTo(px + off, py + TS);
    ctx.stroke();
    if (hash2(x, y, 5) > 0.7) {
      ctx.fillStyle = 'rgba(255,255,255,.07)';
      ctx.fillRect(px + 4, py + 4, 5, 2);
    }
  }

  // ---- objects ---------------------------------------------------------
  drawGroundObjects(sim) {
    const w = sim.world;
    for (let y = 0; y < w.h; y++) {
      for (let x = 0; x < w.w; x++) {
        const t = w.tile(x, y);
        if (!t || !t.obj) continue;
        const px = x * TS, py = y * TS;
        const o = t.obj;
        if (o.type === 'tree') art.tree(this.ctx, px, py, TS, art.hash(x, y));
        else if (o.type === 'rock') {
          this.ctx.fillStyle = 'rgba(40,30,20,0.2)';
          this.ctx.beginPath(); this.ctx.ellipse(px + 13, py + 22, 7, 3, 0, 0, Math.PI * 2); this.ctx.fill();
          art.outlined(this.ctx, px + 6, py + 13, 14, 10, '#a8adb3', '#4a4a4a', 2);
          art.rect(this.ctx, px + 8, py + 15, 5, 3, '#c9ced4');
        } else if (o.type === 'flower') {
          const c = ['#f0a6c0', '#f6d06a', '#c9a6f0'][art.hash(x, y) % 3];
          art.rect(this.ctx, px + 12, py + 10, 2, 6, '#4f7a3a');
          this.ctx.fillStyle = c;
          this.ctx.beginPath(); this.ctx.arc(px + 13, py + 9, 3.5, 0, Math.PI * 2); this.ctx.fill();
          art.rect(this.ctx, px + 12.5, py + 9, 2, 2, '#fff3c4');
        }
      }
    }
    for (const d of w.decor || []) {
      const px = d.x * TS, py = d.y * TS;
      if (d.type === 'bench') {
        art.outlined(this.ctx, px + 3, py + 10, 20, 8, art.PAL.wood, art.PAL.ink, 2);
        art.rect(this.ctx, px + 3, py + 10, 20, 3, art.PAL.woodLight);
        art.rect(this.ctx, px + 5, py + 18, 3, 5, art.PAL.woodDark);
        art.rect(this.ctx, px + 18, py + 18, 3, 5, art.PAL.woodDark);
      } else if (d.type === 'lamp') {
        art.rect(this.ctx, px + 12, py + 8, 3, 15, art.PAL.ink);
        art.rect(this.ctx, px + 8, py + 4, 11, 7, art.PAL.ink);
        art.rect(this.ctx, px + 9, py + 5, 9, 5, '#f7d795');
      } else if (d.type === 'fountain') {
        art.outlined(this.ctx, px + 2, py + 8, 22, 14, art.PAL.stone, '#4a4a4a', 2);
        art.rect(this.ctx, px + 5, py + 11, 16, 8, art.PAL.water);
        art.rect(this.ctx, px + 5, py + 11, 16, 2, art.PAL.foam, 0.7);
        art.rect(this.ctx, px + 12, py + 14, 3, 8, '#cfd6dd');
      } else if (d.type === 'garden') {
        for (let i = 0; i < 3; i++) {
          art.rect(this.ctx, px + 4 + i * 7, py + 14, 3, 6, '#4f7a3a');
          this.ctx.fillStyle = ['#f0a6c0', '#f6d06a', '#c9a6f0'][(i + d.x) % 3];
          this.ctx.beginPath(); this.ctx.arc(px + 5.5 + i * 7, py + 12, 3, 0, Math.PI * 2); this.ctx.fill();
        }
      }
    }
  }

  drawCrops(sim) {
    const ctx = this.ctx;
    for (const t of sim.world.tiles) {
      if (!t.crop) continue;
      const x = t.x * TS, y = t.y * TS;
      const stage = t.crop.stage;
      if (stage === 0) {
        ctx.fillStyle = '#6d8f4a';
        ctx.fillRect(x + 12, y + 15, 2, 3);
      } else if (stage === 1) {
        ctx.strokeStyle = '#7fae5a';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(x + 13, y + 19); ctx.lineTo(x + 13, y + 13); ctx.stroke();
        ctx.fillStyle = '#8fc45f';
        ctx.beginPath(); ctx.ellipse(x + 10, y + 14, 3, 2, -0.4, 0, 6.3); ctx.fill();
      } else if (stage === 2) {
        ctx.strokeStyle = '#7fae5a';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(x + 13, y + 20); ctx.lineTo(x + 13, y + 11); ctx.stroke();
        ctx.fillStyle = '#8fc45f';
        ctx.beginPath(); ctx.ellipse(x + 9, y + 13, 4, 2.4, -0.5, 0, 6.3); ctx.fill();
        ctx.beginPath(); ctx.ellipse(x + 17, y + 15, 4, 2.4, 0.5, 0, 6.3); ctx.fill();
      } else {
        ctx.strokeStyle = '#6f9c4e';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(x + 13, y + 21); ctx.lineTo(x + 13, y + 10); ctx.stroke();
        ctx.fillStyle = '#cf7f4f';
        ctx.beginPath(); ctx.arc(x + 13, y + 11, 4.5, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#e8a06a';
        ctx.beginPath(); ctx.arc(x + 11.5, y + 9.5, 1.5, 0, Math.PI * 2); ctx.fill();
      }
      if (!t.crop.watered && stage < 3) {
        ctx.fillStyle = 'rgba(90,60,35,.45)';
        ctx.fillRect(x + 8, y + 22, 10, 1);
      }
    }
  }

  // ---- buildings -------------------------------------------------------
  drawBuildings(sim) {
    const night = this.nightAmount(sim);
    for (const b of sim.world.buildings || []) {
      const x = b.x * TS, y = b.y * TS, w = b.w * TS, h = b.h * TS;
      const roof = ['a', 'c', 'e'][(b.type ? b.type.length : b.name.length) % 3];
      art.house(this.ctx, b, x + 2, y + 1, w - 4, h - 3, night, { roof });
    }
  }

  drawBlueprints(sim) {
    const ctx = this.ctx;
    for (const bp of sim.world.blueprints) {
      const x = bp.x * TS, y = bp.y * TS;
      const def = DECOR_DEFS[bp.type];
      ctx.save();
      ctx.setLineDash([4, 3]);
      ctx.strokeStyle = '#e0b05a';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(x + 4, y + 4, TS - 8, TS - 8);
      ctx.restore();
      ctx.fillStyle = 'rgba(224,176,90,.16)';
      ctx.fillRect(x + 4, y + 4, TS - 8, TS - 8);
      ctx.fillStyle = 'rgba(24,18,12,.8)';
      ctx.fillRect(x + 5, y + TS - 9, TS - 10, 4);
      ctx.fillStyle = '#e0b05a';
      ctx.fillRect(x + 5, y + TS - 9, (TS - 10) * clamp(bp.progress / bp.need, 0, 1), 4);
      ctx.font = '9px "Microsoft YaHei", sans-serif';
      ctx.fillStyle = '#f4e3bd';
      ctx.textAlign = 'center';
      ctx.fillText(def?.name || '图纸', x + TS / 2, y + 11);
    }
  }

  drawPathDebug(sim, state) {
    if (!state.showPlans) return;
    const ctx = this.ctx;
    for (const n of sim.npcs) {
      if (!n.path || !n.path.length) continue;
      ctx.strokeStyle = 'rgba(224,176,90,.22)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(n.x * TS + TS / 2, n.y * TS + TS / 2);
      for (const p of n.path) ctx.lineTo(p.x * TS + TS / 2, p.y * TS + TS / 2);
      ctx.stroke();
    }
  }

  drawEffects(sim) {
    const ctx = this.ctx;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const e of sim.effects) {
      const a = 1 - e.age / e.ttl;
      ctx.globalAlpha = clamp(a, 0, 1);
      ctx.font = '12px "Microsoft YaHei", sans-serif';
      ctx.fillStyle = e.color;
      ctx.strokeStyle = 'rgba(10,12,16,.7)';
      ctx.lineWidth = 3;
      ctx.strokeText(e.text, e.x * TS + TS / 2, e.y * TS + 6);
      ctx.fillText(e.text, e.x * TS + TS / 2, e.y * TS + 6);
      ctx.globalAlpha = 1;
    }
  }

  // ---- people ----------------------------------------------------------
  drawNpcs(sim, state) {
    const ctx = this.ctx;
    // Only a few bubbles at a time, and never from inside a building: a crowd
    // of overlapping speech boxes reads as noise, not as life.
    const speaking = new Set(
      sim.npcs
        .filter((n) => n.speech && !sim.world.buildingAt(n.x, n.y))
        .sort((a, b) => Math.hypot(a.x - sim.player.x, a.y - sim.player.y) - Math.hypot(b.x - sim.player.x, b.y - sim.player.y))
        .slice(0, 3)
        .map((n) => n.id),
    );
    for (const n of sim.npcs) {
      const x = n.x * TS + TS / 2;
      const y = n.y * TS + TS / 2;
      const selected = state.selectedId === n.id;
      const hovered = state.hoverNpc
        ? state.hoverNpc === n.id
        : !!(state.hover && state.hover.x === Math.floor(n.x) && state.hover.y === Math.floor(n.y));
      const bob = n.path ? Math.sin(this.time * 7 + n.x) * 0.5 : Math.sin(this.time * 1.5 + n.x) * 0.25;

      ctx.fillStyle = 'rgba(10,15,10,.26)';
      ctx.beginPath(); ctx.ellipse(x, y + 8, 6.5, 3, 0, 0, Math.PI * 2); ctx.fill();

      if (selected) {
        ctx.strokeStyle = '#e0b05a';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.ellipse(x, y + 7, 11, 5, 0, 0, Math.PI * 2); ctx.stroke();
        ctx.globalAlpha = 0.22 + Math.sin(this.time * 3) * 0.08;
        ctx.fillStyle = '#e0b05a';
        ctx.beginPath(); ctx.ellipse(x, y + 7, 11, 5, 0, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1;
      }

      this.drawPerson(n, x, y + bob, selected || hovered);
      if (!hovered && speaking.has(n.id)) this.drawSpeech(n, x, y, selected);

      // name
      ctx.font = '9px "Microsoft YaHei", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.strokeStyle = 'rgba(12,16,20,.72)';
      ctx.lineWidth = 3;
      ctx.strokeText(n.name, x, y + 17);
      ctx.fillStyle = selected ? '#f4e3bd' : 'rgba(232,228,218,.86)';
      ctx.fillText(n.name, x, y + 17);

      // urgent icon — only one, and only when it actually matters
      let icon = null, col = '#e6a89f';
      if (n.needs.hunger < 20) icon = '饿';
      else if (n.needs.energy < 16) icon = '困';
      else if (n.needs.social < 16) { icon = '聊'; col = '#b8cbe0'; }
      if (icon) {
        ctx.font = '10px "Microsoft YaHei", sans-serif';
        ctx.fillStyle = col;
        ctx.fillText(icon, x + 9, y - 11);
      }

      if (selected && n.thought) {
        const text = n.thought.length > 18 ? n.thought.slice(0, 17) + '…' : n.thought;
        ctx.font = '10.5px "Microsoft YaHei", sans-serif';
        const tw = ctx.measureText(text).width + 12;
        const bx = clamp(x - tw / 2, 2, this.w - tw - 2);
        const by = y - 42;
        ctx.fillStyle = 'rgba(22,27,33,.92)';
        roundRect(ctx, bx, by, tw, 18, 7); ctx.fill();
        ctx.strokeStyle = '#4a5a70'; ctx.lineWidth = 1;
        roundRect(ctx, bx, by, tw, 18, 7); ctx.stroke();
        ctx.fillStyle = '#e8e4da';
        ctx.fillText(text, bx + tw / 2, by + 9);
      }
    }
  }

  // Body, head, hair, and the one prop that makes this person readable at a
  // glance: a straw hat, an apron, a white coat, a brush, a spear.
  drawPerson(n, x, y, highlight) {
    const job = n.profile.job;
    const cloth = n.profile.color || '#c25a44';
    const skin = art.PAL.skin[(n.profile.id.charCodeAt(0) + n.profile.id.length) % 4];
    const hair = art.PAL.hair[(n.profile.id.charCodeAt(n.profile.id.length - 1)) % 6];
    const bob = Math.sin((n.animPhase || 0)) * 2;
    const facing = n.facing || 1;
    let hat = null, accent = null;
    if (job === 'farmer') hat = 'straw';
    else if (job === 'artist') hat = 'beret';
    else if (job === 'guard') hat = 'guard';
    else if (job === 'doctor') { accent = '#d05a4a'; }
    else if (job === 'carpenter') { accent = art.PAL.woodDark; }
    else if (job === 'tavern') { accent = '#f3e4c3'; }
    else if (job === 'merchant') { accent = art.PAL.gold; }
    else if (job === 'fisher') { accent = '#4f7fb8'; }
    art.chibi(this.ctx, x - TS / 2, y - TS / 2 + 2, {
      ts: TS, cloth, skin, hair, hat, accent,
      bob: Math.abs(bob) > 1 ? 1 : 0,
      facing,
      highlight,
    });
  }

  drawSpeech(n, x, y, selected) {
    if (!n.speech) return;
    const ctx = this.ctx;
    const text = n.speech.text;
    ctx.font = '10.5px "Microsoft YaHei", sans-serif';
    const maxW = clamp(2 * Math.min(x - 6, this.w - x - 6), 84, 138);
    const lines = [];
    let cur = '';
    for (const ch of text) {
      const next = cur + ch;
      if (ctx.measureText(next).width > maxW && cur) { lines.push(cur); cur = ch; }
      else cur = next;
    }
    if (cur) lines.push(cur);
    const shown = lines.slice(0, 3);
    if (lines.length > 3) shown[2] = shown[2].slice(0, -1) + '…';
    const tw = Math.ceil(Math.max(...shown.map((l) => ctx.measureText(l).width)) + 16);
    const lh = 14;
    const th = shown.length * lh + 8;
    const bx = clamp(x - tw / 2, 3, this.w - tw - 3);
    // stagger so two people talking side by side do not stack their bubbles
    let hash = 0;
    for (let i = 0; i < n.id.length; i += 1) hash += n.id.charCodeAt(i) * (i + 3);
    const lane = hash % 3;
    const by = y - th - (selected && n.thought ? 46 : 26) - lane * 11;
    ctx.fillStyle = 'rgba(250,247,240,.96)';
    roundRect(ctx, bx, by, tw, th, 6); ctx.fill();
    ctx.strokeStyle = 'rgba(60,64,70,.18)';
    ctx.lineWidth = 1;
    roundRect(ctx, bx, by, tw, th, 6); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x - 4, by + th);
    ctx.lineTo(x + 4, by + th);
    ctx.lineTo(x, by + th + 5);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#28292c';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    shown.forEach((line, i) => ctx.fillText(line, bx + tw / 2, by + 8 + i * lh));
  }

  drawPlayer(sim) {
    const ctx = this.ctx;
    const p = sim.player;
    const x = p.x * TS + TS / 2;
    const y = p.y * TS + TS / 2;
    ctx.fillStyle = 'rgba(10,15,10,.28)';
    ctx.beginPath(); ctx.ellipse(x, y + 8, 7, 3, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#eae5da';
    ctx.beginPath(); ctx.ellipse(x, y + 2, 6.4, 7.6, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#c94f4f';
    ctx.fillRect(x - 6, y + 2, 12, 3);
    ctx.fillStyle = '#f0d2b4';
    ctx.beginPath(); ctx.arc(x, y - 5, 4.2, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#3c3a44';
    ctx.beginPath(); ctx.arc(x, y - 6.2, 4.3, Math.PI * 1.0, Math.PI * 2.0); ctx.fill();
    if (p.path) {
      ctx.strokeStyle = 'rgba(255,255,255,.30)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, y);
      for (const node of p.path) ctx.lineTo(node.x * TS + TS / 2, node.y * TS + TS / 2);
      ctx.stroke();
    }
    ctx.font = '9.5px "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'center';
    ctx.strokeStyle = 'rgba(12,16,20,.8)';
    ctx.lineWidth = 3;
    ctx.strokeText('旅人', x, y + 17);
    ctx.fillStyle = '#fff6df';
    ctx.fillText('旅人', x, y + 17);
  }

  // ---- light and weather ----------------------------------------------
  nightAmount(sim) {
    const c = sim.clock;
    if (c.hour >= 19 && c.hour < 23) return ((c.hour - 19) + c.minute / 60) / 4 * 0.44;
    if (c.hour >= 23 || c.hour < 5) return 0.44;
    if (c.hour >= 5 && c.hour < 7) return (1 - ((c.hour - 5) + c.minute / 60) / 2) * 0.44;
    return 0;
  }

  drawNight(sim) {
    const ctx = this.ctx;
    const a = this.nightAmount(sim);
    if (a <= 0.01) return;
    ctx.fillStyle = `rgba(10,16,34,${a})`;
    ctx.fillRect(0, 0, this.w, this.h);
    if (a <= 0.12) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const lampPulse = 0.9 + Math.sin(this.time * 2.2) * 0.06;
    for (const d of sim.world.decor.filter((x) => x.type === 'lamp')) {
      const gx = d.x * TS + 13, gy = d.y * TS + 7;
      const g = ctx.createRadialGradient(gx, gy, 2, gx, gy, 52);
      g.addColorStop(0, `rgba(255,214,130,${a * 0.85 * lampPulse})`);
      g.addColorStop(0.5, `rgba(255,200,120,${a * 0.26})`);
      g.addColorStop(1, 'rgba(255,200,120,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(gx, gy, 52, 0, Math.PI * 2); ctx.fill();
    }
    for (const b of sim.world.buildings) {
      for (const wr of windowRects(b)) {
        const gx = wr.x + wr.w / 2, gy = wr.y + wr.h / 2;
        const g = ctx.createRadialGradient(gx, gy, 1, gx, gy, 26);
        g.addColorStop(0, `rgba(255,206,120,${a * 0.5})`);
        g.addColorStop(1, 'rgba(255,206,120,0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(gx, gy, 26, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.restore();
  }

  drawWeather(sim) {
    const ctx = this.ctx;
    const t = this.time;
    if (sim.weatherId === 'rain') {
      ctx.strokeStyle = 'rgba(170,205,240,.32)';
      ctx.lineWidth = 1;
      for (let i = 0; i < 90; i++) {
        const x = (hash2(i, 1, 9) * this.w + t * 40) % this.w;
        const y = (hash2(i, 2, 9) * this.h + t * 260) % this.h;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x - 3, y + 9);
        ctx.stroke();
      }
      ctx.fillStyle = 'rgba(190,220,245,.10)';
      for (let i = 0; i < 14; i++) {
        const x = (hash2(i, 3, 4) * this.w + t * 9) % this.w;
        const y = hash2(i, 4, 4) * this.h;
        const r = 4 + (Math.sin(t * 3 + i) * 0.5 + 0.5) * 6;
        ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.4, 0, 0, Math.PI * 2); ctx.fill();
      }
      return;
    }
    if (sim.weatherId === 'wind') {
      ctx.fillStyle = 'rgba(206,222,150,.5)';
      for (let i = 0; i < 16; i++) {
        const x = (hash2(i, 5, 2) * this.w + t * 46) % this.w;
        const y = (hash2(i, 6, 2) * this.h + Math.sin(t * 1.6 + i) * 14) % this.h;
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(t * 2 + i);
        ctx.fillRect(-2.5, -1, 5, 2);
        ctx.restore();
      }
    }
    if (sim.weatherId === 'cloud') {
      ctx.fillStyle = 'rgba(20,30,45,.10)';
      for (let i = 0; i < 3; i++) {
        const x = (hash2(i, 8, 1) * this.w + t * 6) % (this.w + 260) - 130;
        const y = 80 + i * 170;
        ctx.beginPath();
        ctx.ellipse(x, y, 130, 60, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  drawOverlay(sim, state) {
    const ctx = this.ctx;
    if (!state.hover || state.hover.x < 0) return;
    const { x, y } = state.hover;

    if (state.placement) {
      const def = DECOR_DEFS[state.placement];
      const tile = sim.world.tile(x, y);
      const ok = tile?.terrain === T.GRASS && !tile?.obj && !tile?.building;
      ctx.fillStyle = ok ? 'rgba(120,190,110,.32)' : 'rgba(210,100,90,.32)';
      ctx.fillRect(x * TS + 2, y * TS + 2, TS - 4, TS - 4);
      ctx.strokeStyle = ok ? '#9ed28e' : '#e08c7a';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(x * TS + 2, y * TS + 2, TS - 4, TS - 4);
      if (def) {
        ctx.font = '9px "Microsoft YaHei", sans-serif';
        ctx.fillStyle = '#fff';
        ctx.textAlign = 'center';
        ctx.fillText(def.name, x * TS + TS / 2, y * TS - 3);
      }
      return;
    }

    ctx.strokeStyle = 'rgba(255,255,255,.12)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x * TS + 0.5, y * TS + 0.5, TS - 1, TS - 1);

    // hover card: who is here and what they are up to
    const npc = state.hoverNpc
      ? sim.npcs.find((n) => n.id === state.hoverNpc)
      : sim.npcs.find((n) => Math.floor(n.x) === x && Math.floor(n.y) === y);
    if (npc) this.drawHoverCard(npc, (npc.x + 0.5) * TS, npc.y * TS - 10);
  }

  drawHoverCard(npc, cx, cy) {
    const ctx = this.ctx;
    const l1 = `${npc.name} · ${npc.title}`;
    const l2 = npc.goalLabel || '发呆';
    const l3 = `${npc.moodLabel} ${Math.round(npc.mood)}`;
    ctx.font = '12px "Microsoft YaHei", sans-serif';
    const w = Math.max(ctx.measureText(l1).width, ctx.measureText(l2).width, ctx.measureText(l3).width) + 20;
    const h = 54;
    const bx = clamp(cx - w / 2, 3, this.w - w - 3);
    const by = clamp(cy - h - 6, 3, this.h - h - 3);
    ctx.fillStyle = 'rgba(18,22,28,.96)';
    roundRect(ctx, bx, by, w, h, 9); ctx.fill();
    ctx.strokeStyle = 'rgba(224,176,90,.62)';
    ctx.lineWidth = 1.2;
    roundRect(ctx, bx, by, w, h, 9); ctx.stroke();
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#f6e8c6';
    ctx.fillText(l1, bx + 10, by + 14);
    ctx.fillStyle = 'rgba(232,228,218,.92)';
    ctx.fillText(l2, bx + 10, by + 30);
    ctx.fillStyle = npc.moodColor;
    ctx.fillText(l3, bx + 10, by + 44);
  }
}

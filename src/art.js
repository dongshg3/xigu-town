// art.js — 开罗式的手感：粗描边、暖色调、一切都能一眼认出来。
// 所有绘制都以 26px 格子为基准，内部按 2px 像素块对齐，避免糊边。

export const PAL = {
  grass: ['#8cbd5e', '#95c766', '#84b356', '#9bce6c'],
  grassDark: '#6c9b47',
  grassEdge: '#5d8a3c',
  path: ['#d9b184', '#e2bd92', '#d0a678'],
  pathDark: '#b98f66',
  pathEdge: '#a87e58',
  water: '#4f92c6',
  waterLight: '#6aa9d8',
  waterDeep: '#3d76a5',
  foam: '#d6ecf7',
  soil: '#8f6a49',
  soilDark: '#6f4f33',
  soilLight: '#a87e57',
  wood: '#a9743f',
  woodLight: '#c08a52',
  woodDark: '#7d5227',
  stone: '#9aa0a6',
  stoneDark: '#767c83',
  wall: '#f4e5c6',
  wallShade: '#e3cfa9',
  roofA: '#c25a44', roofB: '#d1705a', roofDark: '#8f3f2e',
  roofC: '#5b8f8a', roofD: '#74a8a2', roofCDark: '#3f6c68',
  roofE: '#7a6f9c', roofF: '#9287b4', roofEDark: '#584f75',
  ink: '#3b2a1f',
  inkSoft: '#5a4433',
  skin: ['#f4d6b6', '#eac09a', '#ddb08a', '#f7e0c6'],
  hair: ['#3a2b22', '#4a3627', '#2b2520', '#5a4230', '#6b4a33', '#8a6a45'],
  cloth: ['#c25a44', '#4f7fb8', '#6a9e58', '#c99a3e', '#8f6aa8', '#5e8f8a', '#b06a86', '#7d6a55'],
  white: '#fffaf0',
  gold: '#e8b45a',
};

const B = 2; // 像素块

export function hash(x, y) {
  let h = (x * 73856093) ^ (y * 19349663);
  h = (h ^ (h >>> 13)) * 1274126177;
  return Math.abs(h >>> 0) % 997;
}

export function snap(v) { return Math.round(v / B) * B; }

export function rect(ctx, x, y, w, h, color, alpha = 1) {
  const prev = ctx.globalAlpha;
  if (alpha !== 1) ctx.globalAlpha = prev * alpha;
  ctx.fillStyle = color;
  ctx.fillRect(snap(x), snap(y), snap(w), snap(h));
  if (alpha !== 1) ctx.globalAlpha = prev;
}

// 带 2px 墨线的方框（开罗的招牌手法）
export function outlined(ctx, x, y, w, h, fill, ink = PAL.ink, t = 2) {
  ctx.fillStyle = ink;
  ctx.fillRect(snap(x) - t, snap(y) - t, snap(w) + t * 2, snap(h) + t * 2);
  ctx.fillStyle = fill;
  ctx.fillRect(snap(x), snap(y), snap(w), snap(h));
}

function rr(ctx, x, y, w, h, r, color) {
  const rad = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.arcTo(x + w, y, x + w, y + h, rad);
  ctx.arcTo(x + w, y + h, x, y + h, rad);
  ctx.arcTo(x, y + h, x, y, rad);
  ctx.arcTo(x, y, x + w, y, rad);
  ctx.closePath();
  ctx.fill();
}

// ---------- 地面 ----------
const NAMES = ['grass', 'path', 'water', 'soil', 'floor', 'stump', 'sand'];

export function groundTile(ctx, terrain, px, py, ts, variant, neighbors = {}) {
  const key = typeof terrain === 'number' ? NAMES[terrain] : terrain;
  const v = Math.abs(variant | 0) % 4;
  if (key === 'grass') {
    const patch = hash(Math.floor(px / (ts * 3)), Math.floor(py / (ts * 3))) % 3;
    rect(ctx, px, py, ts, ts, ['#8dbd61', '#8ec063', '#8bbb5f'][patch]);
    if (v % 5 === 0) rect(ctx, px, py, ts, ts, '#97c76a', 0.18);
    if (v % 7 === 0) rect(ctx, px, py, ts, ts, '#82b455', 0.16);
    if (v === 1 || v === 3) {
      rect(ctx, px + 6, py + 8, 2, 3, PAL.grassDark, 0.5);
      rect(ctx, px + 14, py + 15, 2, 3, PAL.grassDark, 0.45);
    }
    if (v === 2) rect(ctx, px + 18, py + 6, 2, 2, '#c3e096', 0.75);
    if (neighbors.path) rect(ctx, px, py + ts - 2, ts, 2, PAL.grassEdge, 0.22);
    if (neighbors.water) rect(ctx, px, py, ts, 2, '#cfe3a8', 0.3);
  } else if (key === 'path') {
    rect(ctx, px, py, ts, ts, '#dcb689');
    // 碎石：位置由格子哈希决定，跨格无缝
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 3; col++) {
        const h = hash(px + row * 7, py + col * 11);
        if (h % 3 === 0) continue;
        const sx = col * 9 + (h % 4);
        const sy = row * 9 + ((h >> 3) % 4);
        if (sx > ts - 5 || sy > ts - 4) continue;
        const tone = ['#d2ab7f', '#e3c096', '#cba577'][h % 3];
        rect(ctx, px + sx, py + sy, 5, 3, tone);
        rect(ctx, px + sx, py + sy + 2, 5, 1, '#b08a63', 0.35);
      }
    }
    if (!neighbors.path) {
      rect(ctx, px, py, ts, 2, PAL.pathEdge, 0.4);
      rect(ctx, px, py + ts - 2, ts, 2, PAL.pathEdge, 0.3);
    }
  } else if (key === 'water') {
    rect(ctx, px, py, ts, ts, PAL.water);
    const w = (py / ts) % 2 === 0 ? 3 : 9;
    rect(ctx, px, py + w, ts, 2, PAL.waterLight, 0.55);
    rect(ctx, px + 6, py + w + 7, 10, 2, PAL.waterDeep, 0.35);
    if (!neighbors.water) {
      rect(ctx, px, py, ts, 2, PAL.foam, 0.55);
      rect(ctx, px, py + ts - 2, ts, 2, PAL.waterDeep, 0.35);
    }
    if (neighbors.path) rect(ctx, px, py, 2, ts, '#cfe6c0', 0.35);
  } else if (key === 'soil') {
    rect(ctx, px, py, ts, ts, '#8d6747');
    for (let i = 0; i < 3; i++) {
      rect(ctx, px + 1, py + 3 + i * 8, ts - 2, 4, '#9a7250');
      rect(ctx, px + 1, py + 7 + i * 8, ts - 2, 1, '#6f4f33', 0.55);
    }
    if (v % 4 === 0) rect(ctx, px + 5, py + 12, 2, 2, '#b08a63', 0.8);
  } else if (key === 'floor') {
    rect(ctx, px, py, ts, ts, PAL.wallShade);
  } else {
    rect(ctx, px, py, ts, ts, '#cbb08a');
  }
}

// ---------- 树 ----------
export function tree(ctx, px, py, ts, variant) {
  const cx = px + ts / 2, base = py + ts - 2;
  rect(ctx, cx - 3, base - 10, 6, 10, PAL.woodDark);
  rect(ctx, cx - 3, base - 10, 3, 10, PAL.wood);
  const big = variant % 2 === 0;
  const r = big ? ts * 0.42 : ts * 0.34;
  const cy = base - 14 - (big ? 4 : 0);
  // 阴影 + 三层树冠
  ctx.fillStyle = 'rgba(40,30,20,0.18)';
  ctx.beginPath(); ctx.ellipse(cx, base + 2, r * 0.9, r * 0.35, 0, 0, Math.PI * 2); ctx.fill();
  for (const [ox, oy, rad, col] of [
    [-r * 0.45, 2, r * 0.72, '#2f5a2c'],
    [r * 0.45, 2, r * 0.72, '#2f5a2c'],
    [0, -r * 0.42, r * 0.92, '#2f5a2c'],
    [0, 0, r * 0.95, '#3d7038'],
    [-r * 0.2, -r * 0.25, r * 0.55, '#4d8a42'],
    [r * 0.15, -r * 0.05, r * 0.42, '#5c9c4c'],
  ]) {
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.arc(cx + ox, cy + oy, rad, 0, Math.PI * 2); ctx.fill();
  }
  rect(ctx, cx - r * 0.55, cy - r * 0.55, r * 0.35, r * 0.2, '#7fbd66', 0.85);
}

// ---------- 作物 ----------
export function crop(ctx, px, py, ts, stage) {
  const cols = ['#7fbd66', '#93cd74', '#a8dc84'];
  const c = cols[stage % 3];
  if (stage <= 0) {
    rect(ctx, px + 9, py + 16, 8, 4, '#b9d98f');
    rect(ctx, px + 11, py + 14, 2, 3, '#7fae5a');
    return;
  }
  const h = 6 + stage * 4;
  for (const dx of [-7, 0, 7]) {
    rect(ctx, px + 13 + dx, py + 22 - h, 2, h, '#3f6a2f');
    rect(ctx, px + 9 + dx, py + 20 - h, 8, 4, c);
    rect(ctx, px + 10 + dx, py + 19 - h, 5, 2, '#c4ea9e', 0.7);
  }
  if (stage >= 2) {
    rect(ctx, px + 11, py + 6, 4, 4, PAL.gold);
    rect(ctx, px + 12, py + 5, 2, 2, '#ffe9a8');
  }
}

// ---------- 人 ----------
// 一个 16×22 的小人：大头、粗描边、两帧走路、按职业换色。
export function chibiLegacy(ctx, px, py, opts) {
  const { ts, cloth, skin = '#f4d6b6', hair = '#3a2b22', hat = null, bob = 0, facing = 1, accent = null, highlight = false } = opts;
  const cx = px + ts / 2;
  const ground = py + ts - 1;
  const step = Math.round(bob) % 2;
  const bodyY = ground - 16 - (step ? 1 : 0);

  ctx.fillStyle = 'rgba(40,30,20,0.22)';
  ctx.beginPath(); ctx.ellipse(cx, ground, 8, 3, 0, 0, Math.PI * 2); ctx.fill();

  if (highlight) {
    ctx.strokeStyle = 'rgba(255,236,170,0.95)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(cx, ground - 10, 11, 15, 0, 0, Math.PI * 2); ctx.stroke();
  }

  // 腿
  rect(ctx, cx - 4, ground - 6, 3, 6, PAL.ink);
  rect(ctx, cx + 1, ground - 6, 3, 6, PAL.ink);
  rect(ctx, cx - 4, ground - 5, 3, 3, '#4a3a2e');
  rect(ctx, cx + 1, ground - 5, 3, 3, '#4a3a2e');

  // 身体
  outlined(ctx, cx - 6, bodyY + 6, 12, 10, cloth, PAL.ink, 2);
  rect(ctx, cx - 5, bodyY + 8, 4, 6, '#ffffff', 0.18);
  if (accent) rect(ctx, cx - 2, bodyY + 8, 4, 8, accent);

  // 手臂
  rect(ctx, cx - 9, bodyY + 7, 3, 7, cloth);
  rect(ctx, cx + 6, bodyY + 7, 3, 7, cloth);
  rect(ctx, cx - 9, bodyY + 12, 3, 2, skin);
  rect(ctx, cx + 6, bodyY + 12, 3, 2, skin);

  // 头
  outlined(ctx, cx - 6, bodyY - 4, 12, 12, skin, PAL.ink, 2);
  // 头发
  rect(ctx, cx - 7, bodyY - 6, 14, 5, hair);
  rect(ctx, cx - 7, bodyY - 1, 3, 4, hair);
  rect(ctx, cx + 4, bodyY - 1, 3, 4, hair);
  // 眼睛
  rect(ctx, cx - 4 + (facing > 0 ? 1 : 0), bodyY + 2, 2, 2, PAL.ink);
  rect(ctx, cx + 2 + (facing > 0 ? 1 : 0), bodyY + 2, 2, 2, PAL.ink);
  // 嘴
  rect(ctx, cx - 1 + (facing > 0 ? 1 : 0), bodyY + 6, 2, 1, '#b0705a', 0.8);

  // 帽子/道具
  if (hat === 'straw') {
    rect(ctx, cx - 9, bodyY - 5, 18, 3, '#e3c06a');
    rect(ctx, cx - 6, bodyY - 8, 12, 4, '#efd080');
    rect(ctx, cx - 9, bodyY - 5, 18, 1, '#b8974a');
  } else if (hat === 'beret') {
    rect(ctx, cx - 7, bodyY - 7, 14, 4, '#b0564a');
    rect(ctx, cx + 3, bodyY - 9, 4, 3, '#b0564a');
  } else if (hat === 'guard') {
    rect(ctx, cx - 7, bodyY - 7, 14, 4, '#8b93a0');
    rect(ctx, cx - 7, bodyY - 4, 14, 1, '#5c636e');
  }
}

// ---------- 房子 ----------
export function house(ctx, b, x, y, w, h, night = 0, style = {}) {
  const roof = style.roof || 'a';
  const R = {
    a: [PAL.roofA, PAL.roofB, PAL.roofDark],
    c: [PAL.roofC, PAL.roofD, PAL.roofCDark],
    e: [PAL.roofE, PAL.roofF, PAL.roofEDark],
  }[roof] || [PAL.roofA, PAL.roofB, PAL.roofDark];

  ctx.fillStyle = 'rgba(40,30,20,0.20)';
  ctx.fillRect(x + 4, y + h - 4, w - 2, 6);

  const wallTop = y + h * 0.55;
  const wallH = h - h * 0.55;

  // 墙
  outlined(ctx, x + 2, wallTop, w - 4, wallH - 2, PAL.wall, PAL.ink, 2);
  // 木板纹理
  for (let i = 1; i < 3; i++) {
    rect(ctx, x + 4, wallTop + (wallH / 3) * i, w - 8, 1, PAL.wallShade, 0.9);
  }
  rect(ctx, x + 2, y + h - 4, w - 4, 3, PAL.woodDark, 0.5);

  // 门
  const dw = 12, dx = x + w / 2 - dw / 2, dy = y + h - 18;
  outlined(ctx, dx, dy, dw, 14, PAL.woodDark, PAL.ink, 2);
  rect(ctx, dx + 2, dy + 2, dw - 4, 12, PAL.wood);
  rect(ctx, dx + dw - 5, dy + 7, 2, 2, PAL.gold);
  rect(ctx, x + w / 2 - 8, y + h - 4, 16, 3, PAL.stone, 0.9); // 踏脚石

  // 窗
  const wins = [x + w * 0.22, x + w * 0.68];
  for (const wx of wins) {
    const ww = 10, wh = 9, wy = wallTop + 8;
    outlined(ctx, wx, wy, ww, wh, night > 0.2 ? '#f7d795' : '#cfe0e8', PAL.ink, 2);
    rect(ctx, wx + ww / 2 - 1, wy, 2, wh, PAL.ink, 0.55);
    rect(ctx, wx, wy + wh / 2 - 1, ww, 2, PAL.ink, 0.55);
    if (night > 0.2) {
      const g = ctx.createRadialGradient(wx + ww / 2, wy + wh / 2, 2, wx + ww / 2, wy + wh / 2, 22);
      g.addColorStop(0, 'rgba(247,215,149,0.55)');
      g.addColorStop(1, 'rgba(247,215,149,0)');
      ctx.fillStyle = g;
      ctx.fillRect(wx - 16, wy - 16, ww + 32, wh + 32);
    }
  }

  // 屋顶（上宽下窄的梯形 + 瓦行 + 墨线）
  const roofH = wallTop - y + 4;
  const over = 5;
  ctx.beginPath();
  ctx.moveTo(x - over, y + roofH - 3);
  ctx.lineTo(x + over, y - 3);
  ctx.lineTo(x + w - over, y - 3);
  ctx.lineTo(x + w + over, y + roofH - 3);
  ctx.closePath();
  ctx.strokeStyle = PAL.ink;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = R[2];
  ctx.beginPath();
  ctx.moveTo(x - over + 2, y + roofH);
  ctx.lineTo(x + over + 2, y);
  ctx.lineTo(x + w - over + 2, y);
  ctx.lineTo(x + w + over + 2, y + roofH);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = R[0];
  ctx.beginPath();
  ctx.moveTo(x - over, y + roofH - 3);
  ctx.lineTo(x + over, y - 3);
  ctx.lineTo(x + w - over, y - 3);
  ctx.lineTo(x + w + over, y + roofH - 3);
  ctx.closePath();
  ctx.fill();

  // 瓦
  ctx.strokeStyle = R[1];
  ctx.lineWidth = 1;
  for (let i = 1; i < 5; i++) {
    const t = i / 5;
    const yy = y - 3 + roofH * t;
    ctx.beginPath();
    ctx.moveTo(x - over + over * 2 * t, yy);
    ctx.lineTo(x + w + over - over * 2 * t, yy);
    ctx.stroke();
  }
  // 屋脊高光
  ctx.strokeStyle = '#ffe9c9';
  ctx.globalAlpha = 0.5;
  ctx.beginPath();
  ctx.moveTo(x + over, y - 2);
  ctx.lineTo(x + w - over, y - 2);
  ctx.stroke();
  ctx.globalAlpha = 1;

  // 招牌
  if (b.name) {
    const label = b.name;
    ctx.font = '9px "Microsoft YaHei", sans-serif';
    const tw = ctx.measureText(label).width + 10;
    const sx = x + w / 2 - tw / 2, sy = y + roofH - 8;
    outlined(ctx, sx, sy, tw, 14, '#f7ead0', PAL.ink, 2);
    ctx.fillStyle = '#4a3324';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, x + w / 2, sy + 7);
  }
}



// 四向 + 走路帧 + 坐姿的 Q 版小人。所有尺寸按 ts/26 缩放，
// 这样 26px 的格子和 56px 的样张看起来是同一个人。
export function chibi(ctx, px, py, opts) {
  const {
    ts, cloth, skin = '#f4d6b6', hair = '#3a2b22', hat = null, accent = null,
    facing = 'down', frame = 0, pose = 'stand', highlight = false,
  } = opts;
  const k = ts / 26;
  const u = (v) => Math.max(1, Math.round(v * k));
  const cx = px + ts / 2;
  const ground = py + ts - u(1);
  const walking = pose === 'walk';
  const sit = pose === 'sit';
  const up = facing === 'up';
  const side = facing === 'left' || facing === 'right';
  const flip = facing === 'left' ? -1 : 1;

  ctx.fillStyle = 'rgba(40,30,20,0.22)';
  ctx.beginPath(); ctx.ellipse(cx, ground, u(sit ? 7 : 8), u(3), 0, 0, Math.PI * 2); ctx.fill();

  if (highlight) {
    ctx.strokeStyle = 'rgba(255,236,170,0.95)';
    ctx.lineWidth = u(2);
    ctx.beginPath(); ctx.ellipse(cx, ground - u(sit ? 9 : 13), u(11), u(sit ? 11 : 17), 0, 0, Math.PI * 2); ctx.stroke();
  }

  if (sit) {
    const bodyY = ground - u(16);
    // 折起来的两条腿 + 鞋（在身体之前，露在两侧）
    rect(ctx, cx - u(10), ground - u(6), u(7), u(4), '#4a3a2e');
    rect(ctx, cx + u(3), ground - u(6), u(7), u(4), '#4a3a2e');
    rect(ctx, cx - u(11), ground - u(3), u(6), u(3), '#8a6a4a');
    rect(ctx, cx + u(5), ground - u(3), u(6), u(3), '#8a6a4a');
    // 身体
    outlined(ctx, cx - u(7), bodyY, u(14), u(12), cloth, PAL.ink, u(2));
    if (accent) rect(ctx, cx - u(2), bodyY + u(2), u(4), u(8), accent);
    // 放在膝上的手
    rect(ctx, cx - u(8), bodyY + u(2), u(3), u(6), cloth);
    rect(ctx, cx + u(5), bodyY + u(2), u(3), u(6), cloth);
    rect(ctx, cx - u(8), bodyY + u(7), u(3), u(2), skin);
    rect(ctx, cx + u(5), bodyY + u(7), u(3), u(2), skin);
    // 头
    const hy = bodyY - u(13);
    outlined(ctx, cx - u(7), hy, u(14), u(14), skin, PAL.ink, u(2));
    rect(ctx, cx - u(8), hy - u(2), u(16), u(6), hair);
    rect(ctx, cx - u(8), hy + u(3), u(3), u(5), hair);
    rect(ctx, cx + u(5), hy + u(3), u(3), u(5), hair);
    if (!up) {
      rect(ctx, cx - u(4), hy + u(6), u(2), u(2), PAL.ink);
      rect(ctx, cx + u(2), hy + u(6), u(2), u(2), PAL.ink);
    }
    if (hat === 'straw') { rect(ctx, cx - u(10), hy - u(3), u(20), u(3), '#e3bd72'); rect(ctx, cx - u(5), hy - u(6), u(10), u(3), '#efcf8d'); }
    return;
  }

  const swing = walking ? [0, 1, 0, -1][frame % 4] : 0;
  const lift = walking && (frame % 2) ? 1 : 0;
  const bodyY = ground - u(22) - u(lift);
  const w = u(14);

  // 腿：走路时一前一后，抬脚那侧短一截
  const lx1 = cx - u(5) + u(swing);
  const lx2 = cx + u(2) - u(swing);
  rect(ctx, lx1, ground - u(8) + (swing > 0 ? u(1) : 0), u(4), u(8) - (swing > 0 ? u(1) : 0), '#4a3a2e');
  rect(ctx, lx2, ground - u(8) + (swing < 0 ? u(1) : 0), u(4), u(8) - (swing < 0 ? u(1) : 0), '#4a3a2e');
  rect(ctx, lx1, ground - u(2), u(5), u(2), '#8a6a4a');
  rect(ctx, lx2, ground - u(2), u(5), u(2), '#8a6a4a');

  // 身体
  outlined(ctx, cx - w / 2, bodyY + u(8), w, u(14), cloth, PAL.ink, u(2));
  if (!up) rect(ctx, cx - w / 2 + u(1), bodyY + u(10), u(5), u(8), '#ffffff', 0.18);
  if (accent && !up) rect(ctx, cx - u(2), bodyY + u(10), u(4), u(10), accent);
  if (up) rect(ctx, cx - u(5), bodyY + u(10), u(10), u(8), '#000000', 0.1);

  // 手臂：与腿反相摆动，末端一双小手
  const arm = walking ? -swing : 0;
  rect(ctx, cx - w / 2 - u(3), bodyY + u(9) + u(arm), u(3), u(9), cloth);
  rect(ctx, cx + w / 2, bodyY + u(9) - u(arm), u(3), u(9), cloth);
  rect(ctx, cx - w / 2 - u(3), bodyY + u(16) + u(arm), u(3), u(3), skin);
  rect(ctx, cx + w / 2, bodyY + u(16) - u(arm), u(3), u(3), skin);

  // 头：侧向时向朝向偏 1px
  const hx = cx + (side ? flip * u(1) : 0);
  const hy = bodyY - u(6);
  outlined(ctx, hx - u(7), hy, u(14), u(14), skin, PAL.ink, u(2));
  // 头发
  rect(ctx, hx - u(8), hy - u(3), u(16), u(6), hair);
  if (up) {
    rect(ctx, hx - u(7), hy + u(3), u(14), u(9), hair);       // 后脑勺
    rect(ctx, hx - u(6), hy + u(4), u(12), u(2), '#5a4433');  // 发顶高光
    rect(ctx, hx - u(7), hy + u(11), u(14), u(2), skin);      // 后颈
    rect(ctx, hx - u(8), hy + u(12), u(16), u(2), cloth);     // 衣领
  } else {
    rect(ctx, hx - u(8), hy + u(2), u(3), u(6), hair);
    rect(ctx, hx + u(5), hy + u(2), u(3), u(6), hair);
    if (side) {
      rect(ctx, hx + flip * u(2), hy + u(7), u(2), u(2), PAL.ink);
      rect(ctx, hx + flip * u(2), hy + u(10), u(2), u(1), '#c98a72', 0.6);
    } else {
      rect(ctx, hx - u(4), hy + u(7), u(2), u(2), PAL.ink);
      rect(ctx, hx + u(2), hy + u(7), u(2), u(2), PAL.ink);
      rect(ctx, hx - u(1), hy + u(10), u(3), u(1), '#c98a72', 0.7);
    }
  }

  if (hat === 'straw') {
    rect(ctx, hx - u(10), hy - u(4), u(20), u(3), '#e3bd72');
    rect(ctx, hx - u(5), hy - u(7), u(10), u(3), '#efcf8d');
    rect(ctx, hx - u(10), hy - u(1), u(20), u(1), '#b08a45', 0.6);
  } else if (hat === 'beret') {
    rect(ctx, hx - u(8), hy - u(5), u(16), u(4), accent || '#8a5a7a');
    rect(ctx, hx - u(2), hy - u(7), u(4), u(2), accent || '#8a5a7a');
  } else if (hat === 'cap') {
    rect(ctx, hx - u(8), hy - u(4), u(16), u(4), '#33414f');
    rect(ctx, hx - u(8), hy + (side ? u(0) : u(0)), u(9), u(2), '#26313c');
  }
}

import fs from 'node:fs';
let a = fs.readFileSync('src/art.js','utf8');
const start = a.indexOf('// 四向 + 走路帧 + 坐姿的 Q 版小人。');
if (start < 0) throw new Error('anchor missing');
const head = a.slice(0, start);
const body = `
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
    // 折起来的两条腿 + 鞋
    rect(ctx, cx - u(7), ground - u(5), u(6), u(3), '#3a2b22');
    rect(ctx, cx + u(1), ground - u(5), u(6), u(3), '#3a2b22');
    rect(ctx, cx - u(7), ground - u(2), u(6), u(2), '#6b4a33');
    rect(ctx, cx + u(1), ground - u(2), u(6), u(2), '#6b4a33');
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
  rect(ctx, lx1, ground - u(2), u(5), u(2), '#6b4a33');
  rect(ctx, lx2, ground - u(2), u(5), u(2), '#6b4a33');

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
    rect(ctx, hx - u(7), hy + u(3), u(14), u(10), hair);      // 后脑勺
    rect(ctx, hx - u(8), hy + u(11), u(16), u(3), skin);      // 脖子露一点
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
`;
fs.writeFileSync('src/art.js', head + body, 'utf8');
console.log('chibi scaled');
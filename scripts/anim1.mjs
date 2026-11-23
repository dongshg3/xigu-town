import fs from 'node:fs';
let a = fs.readFileSync('src/art.js','utf8');
a = a.replace('export function chibi(ctx, px, py, opts) {', 'export function chibiLegacy(ctx, px, py, opts) {');
a += `

// 四向 + 走路帧 + 坐姿的 Q 版小人。
// opts: { ts, cloth, skin, hair, hat, accent, facing, frame, pose, highlight }
export function chibi(ctx, px, py, opts) {
  const {
    ts, cloth, skin = '#f4d6b6', hair = '#3a2b22', hat = null, accent = null,
    facing = 'down', frame = 0, pose = 'stand', highlight = false,
  } = opts;
  const cx = px + ts / 2;
  const ground = py + ts - 2;
  const walking = pose === 'walk';
  const sit = pose === 'sit';
  const up = facing === 'up';
  const side = facing === 'left' || facing === 'right';
  const flip = facing === 'left' ? -1 : 1;

  ctx.fillStyle = 'rgba(40,30,20,0.22)';
  ctx.beginPath(); ctx.ellipse(cx, ground, sit ? 7 : 8, 3, 0, 0, Math.PI * 2); ctx.fill();

  if (highlight) {
    ctx.strokeStyle = 'rgba(255,236,170,0.95)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(cx, ground - (sit ? 7 : 10), 11, sit ? 10 : 15, 0, 0, Math.PI * 2); ctx.stroke();
  }

  if (sit) {
    // 坐：身体矮下去，腿向前折
    const bodyY = ground - 12;
    rect(ctx, cx - 6, ground - 4, 12, 3, '#3a2b22');
    outlined(ctx, cx - 6, bodyY, 12, 9, cloth, PAL.ink, 2);
    rect(ctx, cx - 9, bodyY + 1, 3, 6, cloth);
    rect(ctx, cx + 6, bodyY + 1, 3, 6, cloth);
    if (accent) rect(ctx, cx - 2, bodyY + 2, 4, 6, accent);
    outlined(ctx, cx - 6, bodyY - 10, 12, 12, skin, PAL.ink, 2);
    rect(ctx, cx - 7, bodyY - 12, 14, 5, hair);
    rect(ctx, cx - 7, bodyY - 7, 3, 4, hair);
    rect(ctx, cx + 4, bodyY - 7, 3, 4, hair);
    if (!up) { rect(ctx, cx - 3, bodyY - 5, 2, 2, PAL.ink); rect(ctx, cx + 2, bodyY - 5, 2, 2, PAL.ink); }
    if (hat === 'straw') { rect(ctx, cx - 9, bodyY - 12, 18, 3, '#e3bd72'); rect(ctx, cx - 5, bodyY - 15, 10, 3, '#efcf8d'); }
    return;
  }

  const swing = walking ? [0, 1, 0, -1][frame % 4] : 0;
  const lift = walking && (frame % 2) ? 1 : 0;
  const bodyY = ground - 16 - lift;

  // 腿（走路时前后交替）
  rect(ctx, cx - 4 + swing, ground - 6, 3, 6, PAL.ink);
  rect(ctx, cx + 1 - swing, ground - 6, 3, 6, PAL.ink);
  rect(ctx, cx - 4 + swing, ground - 5, 3, 3, '#4a3a2e');
  rect(ctx, cx + 1 - swing, ground - 5, 3, 3, '#4a3a2e');

  // 身体
  outlined(ctx, cx - 6, bodyY + 6, 12, 10, cloth, PAL.ink, 2);
  if (!up) rect(ctx, cx - 5, bodyY + 8, 4, 6, '#ffffff', 0.18);
  if (accent && !up) rect(ctx, cx - 2, bodyY + 8, 4, 8, accent);
  if (up) rect(ctx, cx - 4, bodyY + 8, 8, 6, '#000000', 0.12);

  // 手臂（与腿反相摆动）
  const armSwing = walking ? -swing : 0;
  rect(ctx, cx - 9, bodyY + 7 + armSwing, 3, 7, cloth);
  rect(ctx, cx + 6, bodyY + 7 - armSwing, 3, 7, cloth);
  rect(ctx, cx - 9, bodyY + 12 + armSwing, 3, 2, skin);
  rect(ctx, cx + 6, bodyY + 12 - armSwing, 3, 2, skin);

  // 头（侧向时整体偏移 1px，做出朝向）
  const hx = cx + (side ? flip * 1 : 0);
  outlined(ctx, hx - 6, bodyY - 4, 12, 12, skin, PAL.ink, 2);
  rect(ctx, hx - 7, bodyY - 6, 14, 5, hair);
  if (up) {
    rect(ctx, hx - 7, bodyY - 2, 14, 9, hair);   // 背面：整颗后脑勺
  } else {
    rect(ctx, hx - 7, bodyY - 1, 3, 4, hair);
    rect(ctx, hx + 4, bodyY - 1, 3, 4, hair);
    if (side) {
      rect(ctx, hx + flip * 2, bodyY + 1, 2, 2, PAL.ink);
    } else {
      rect(ctx, hx - 3, bodyY + 1, 2, 2, PAL.ink);
      rect(ctx, hx + 2, bodyY + 1, 2, 2, PAL.ink);
      rect(ctx, hx - 1, bodyY + 5, 3, 1, '#c98a72', 0.7);
    }
  }

  // 帽子
  if (hat === 'straw') {
    rect(ctx, hx - 9, bodyY - 8, 18, 3, '#e3bd72');
    rect(ctx, hx - 5, bodyY - 11, 10, 3, '#efcf8d');
    rect(ctx, hx - 9, bodyY - 5, 18, 1, '#b08a45', 0.6);
  } else if (hat === 'beret') {
    rect(ctx, hx - 7, bodyY - 8, 14, 4, accent || '#8a5a7a');
    rect(ctx, hx - 2, bodyY - 10, 4, 2, accent || '#8a5a7a');
  } else if (hat === 'cap') {
    rect(ctx, hx - 7, bodyY - 7, 14, 4, '#33414f');
    rect(ctx, hx - 7, bodyY - 3, 9, 2, '#26313c');
  }
}
`;
fs.writeFileSync('src/art.js', a, 'utf8');
console.log('chibi rewritten');
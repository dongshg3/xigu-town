import fs from 'node:fs';
let a = fs.readFileSync('src/art.js','utf8');
// 屋顶描边：在填色前后各画一圈墨线
a = a.replace(`  // 屋顶（上宽下窄的梯形 + 瓦行）
  const roofH = wallTop - y + 4;
  const over = 5;`,
`  // 屋顶（上宽下窄的梯形 + 瓦行 + 墨线）
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
  ctx.stroke();`);
fs.writeFileSync('src/art.js', a, 'utf8');
console.log('roof outline');
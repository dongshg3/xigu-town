import fs from 'node:fs';
let a = fs.readFileSync('src/art.js','utf8');

a = a.replace(`export function rect(ctx, x, y, w, h, color, alpha = 1) {
  if (alpha !== 1) { const p = ctx.globalAlpha; ctx.globalAlpha = p * alpha; }
  ctx.fillStyle = color;
  ctx.fillRect(snap(x), snap(y), snap(w), snap(h));
  if (alpha !== 1) ctx.globalAlpha = alpha === 1 ? 1 : ctx.globalAlpha;
}`,
`export function rect(ctx, x, y, w, h, color, alpha = 1) {
  const prev = ctx.globalAlpha;
  if (alpha !== 1) ctx.globalAlpha = prev * alpha;
  ctx.fillStyle = color;
  ctx.fillRect(snap(x), snap(y), snap(w), snap(h));
  if (alpha !== 1) ctx.globalAlpha = prev;
}`);

a = a.replace(`export function groundTile(ctx, terrain, px, py, ts, variant, neighbors = {}) {
  const n = [(variant >> 0) & 3];
  const v = n[0];
  if (terrain === 0) {`,
`const NAMES = ['grass', 'path', 'water', 'soil', 'floor', 'stump', 'sand'];

export function groundTile(ctx, terrain, px, py, ts, variant, neighbors = {}) {
  const key = typeof terrain === 'number' ? NAMES[terrain] : terrain;
  const v = Math.abs(variant | 0) % 4;
  if (key === 'grass') {`);
a = a.replace("  } else if (terrain === 1) {", "  } else if (key === 'path') {");
a = a.replace("  } else if (terrain === 2) {", "  } else if (key === 'water') {");
a = a.replace("  } else if (terrain === 3) {", "  } else if (key === 'soil') {");
a = a.replace("  } else if (terrain === 4) {", "  } else if (key === 'floor') {");
fs.writeFileSync('src/art.js', a, 'utf8');
console.log('art fixed', a.includes("key === 'grass'"));
import fs from 'node:fs';
let a = fs.readFileSync('src/art.js','utf8');
if (!a.includes('export function hash')) {
  a = a.replace("export function snap(v)", "export function hash(x, y) {\n  let h = (x * 73856093) ^ (y * 19349663);\n  h = (h ^ (h >>> 13)) * 1274126177;\n  return Math.abs(h >>> 0) % 997;\n}\n\nexport function snap(v)");
}
fs.writeFileSync('src/art.js', a, 'utf8');
let r = fs.readFileSync('src/render.js','utf8');
r = r.replace("          art.ctxFlower?.(this.ctx, px + 5 + i * 7, py + 12);\n", "");
fs.writeFileSync('src/render.js', r, 'utf8');
console.log('hash added');
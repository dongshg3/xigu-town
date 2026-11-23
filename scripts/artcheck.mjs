import fs from 'node:fs';
const s = fs.readFileSync('src/art.js','utf8');
console.log('hash ok', s.includes('export function hash'));
// verify no leftover references
const r = fs.readFileSync('src/render.js','utf8');
for (const name of ['drawGrassTuft','drawCobble','drawTiles','drawGroundObjects','drawBuildings','drawPerson']) {
  console.log(name, r.includes(name + '('));
}
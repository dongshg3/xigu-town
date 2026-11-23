import fs from 'node:fs';
let r = fs.readFileSync('src/render.js','utf8');

// 1) neighbors with string terrain
r = r.replace(`        const nb = {
          path: w.tile(x, y + 1)?.terrain === 1,
          water: w.tile(x, y - 1)?.terrain === 2 || w.tile(x + 1, y)?.terrain === 2,
        };`,
`        const nb = {
          path: w.tile(x, y + 1)?.terrain === 'path' || w.tile(x, y - 1)?.terrain === 'path',
          water: w.tile(x, y - 1)?.terrain === 'water' || w.tile(x + 1, y)?.terrain === 'water',
        };`);

// 2) drawPerson receives centered coords: shift sprite so its feet sit on npc tile center
r = r.replace(`    art.chibi(this.ctx, x - TS / 2, y - TS / 2, {
      ts: TS, cloth, skin, hair, hat, accent,`,
`    art.chibi(this.ctx, x - TS / 2, y - TS / 2 + 2, {
      ts: TS, cloth, skin, hair, hat, accent,`);
fs.writeFileSync('src/render.js', r, 'utf8');
console.log('render tuned');
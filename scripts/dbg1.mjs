import fs from 'node:fs';
const w = fs.readFileSync('src/world.js','utf8');
console.log(w.slice(0, 400));
const r = fs.readFileSync('src/render.js','utf8');
const i = r.indexOf('drawTiles(sim)');
console.log(r.slice(i-60, i+520));
import fs from 'node:fs';
const r = fs.readFileSync('src/render.js','utf8');
const i = r.indexOf('  drawNpcs(sim, state) {');
console.log(r.slice(i, i+1100));
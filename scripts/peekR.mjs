import fs from 'node:fs';
const s = fs.readFileSync('src/render.js','utf8');
s.split('\n').forEach((l,i)=>{ if(/^  [a-zA-Z]+\(|^export |^const |^function /.test(l)) console.log((i+1)+': '+l.trim()); });
console.log('LINES', s.split('\n').length);
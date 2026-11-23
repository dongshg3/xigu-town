import fs from 'node:fs';
const r = fs.readFileSync('src/render.js','utf8');
const i = r.indexOf('art.chibi(');
console.log(r.slice(i - 300, i + 420));
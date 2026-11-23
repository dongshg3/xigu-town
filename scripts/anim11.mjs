import fs from 'node:fs';
const m = fs.readFileSync('src/main.js','utf8');
const i = m.indexOf('function frame(');
console.log(m.slice(i, m.indexOf('requestAnimationFrame(frame);', i) + 30));
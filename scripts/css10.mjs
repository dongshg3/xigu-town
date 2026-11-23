import fs from 'node:fs';
let s = fs.readFileSync('styles.css','utf8');
const i = s.indexOf('#hint');
console.log(i >= 0 ? s.slice(i, i + 220) : 'no #hint');
const j = s.indexOf('.hint');
console.log(j >= 0 ? s.slice(j, j + 220) : 'no .hint');
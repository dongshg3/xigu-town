import fs from 'node:fs';
const s = fs.readFileSync('styles.css','utf8');
for (const m of s.matchAll(/[^\n]*#(?:8b95a3|9aa4b2|aab4c0|7d8b9a|8f9aa8|b0bac6)[^\n]*/g)) console.log(m[0].trim());
console.log('--- dim rule');
const i = s.indexOf('.dim {');
console.log(s.slice(i, s.indexOf('}', i) + 1));
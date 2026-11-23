import fs from 'node:fs';
const s = fs.readFileSync('styles.css','utf8');
console.log(s.slice(0, 1500));
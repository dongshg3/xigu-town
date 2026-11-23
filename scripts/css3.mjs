import fs from 'node:fs';
const s = fs.readFileSync('styles.css','utf8');
const set = new Map();
for (const m of s.matchAll(/color:\s*(#[0-9a-fA-F]{3,8})/g)) {
  set.set(m[1], (set.get(m[1]) || 0) + 1);
}
console.log([...set.entries()].sort((a,b)=>b[1]-a[1]));
import fs from 'node:fs';
const s = fs.readFileSync('styles.css','utf8');
for (const sel of ['.stage', '.bio', '.layout', '.side', '.kv']) {
  const i = s.indexOf(sel + ' {');
  console.log('---', sel, i >= 0 ? s.slice(i, i + 220).split('\n')[0] : 'missing');
  if (i >= 0) console.log(s.slice(i, s.indexOf('}', i) + 1));
}
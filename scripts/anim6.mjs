import fs from 'node:fs';
const r = fs.readFileSync('src/render.js','utf8');
for (const key of ['drawNameTag', 'nameTag', 'fillText(n.name']) {
  const i = r.indexOf(key);
  console.log('---', key, i);
  if (i > 0) console.log(r.slice(i - 200, i + 400));
}
import fs from 'node:fs';
let s = fs.readFileSync('styles.css','utf8');
s = s.replace(".stage { position: relative; flex: 1 1 auto; min-width: 0; display: flex; align-items: center; justify-content: center; padding: 14px; background: #101318; }",
".stage { position: relative; flex: 1 1 auto; min-width: 0; display: flex; align-items: center; justify-content: center; padding: 14px; background: radial-gradient(700px 500px at 50% 0%, #fdf4e0 0%, #efdfbe 100%); }");
fs.writeFileSync('styles.css', s, 'utf8');
let c = s;
const i = c.indexOf('canvas {');
if (i > 0) console.log(c.slice(i, c.indexOf('}', i) + 1));
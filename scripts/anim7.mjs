import fs from 'node:fs';
const r = fs.readFileSync('src/render.js','utf8');
const i = r.indexOf("      ctx.strokeStyle = 'rgba(12,16,20,.72)';");
console.log(r.slice(i - 420, i + 260));
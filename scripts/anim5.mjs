import fs from 'node:fs';
let a = fs.readFileSync('src/art.js','utf8');
a = a.replace("rect(ctx, px, py, ts, ts, ['#8abd5f', '#90c265', '#85b659'][patch]);",
"rect(ctx, px, py, ts, ts, ['#8dbd61', '#8ec063', '#8bbb5f'][patch]);");
a = a.replace("if (v % 5 === 0) rect(ctx, px, py, ts, ts, '#9aca6c', 0.35);",
"if (v % 5 === 0) rect(ctx, px, py, ts, ts, '#97c76a', 0.18);");
a = a.replace("if (v % 7 === 0) rect(ctx, px, py, ts, ts, '#7cae52', 0.28);",
"if (v % 7 === 0) rect(ctx, px, py, ts, ts, '#82b455', 0.16);");
fs.writeFileSync('src/art.js', a, 'utf8');
console.log('grass calmed');
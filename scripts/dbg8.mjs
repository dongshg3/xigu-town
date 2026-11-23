import fs from 'node:fs';
let a = fs.readFileSync('src/art.js','utf8');
a = a.replace(`  } else if (key === 'path') {
    rect(ctx, px, py, ts, ts, PAL.path[v % 3]);
    // 两排错缝的碎石
    for (let row = 0; row < 2; row++) {
      const oy = 5 + row * 11;
      const off = row % 2 ? 4 : 0;
      for (let i = 0; i < 3; i++) {
        const sx = 2 + off + i * 8;
        if (sx > ts - 6) continue;
        rect(ctx, px + sx, py + oy, 6, 5, PAL.path[v % 3]);
        rect(ctx, px + sx, py + oy + 4, 6, 1, PAL.pathDark, 0.45);
        rect(ctx, px + sx, py + oy, 6, 1, '#f0d5b0', 0.5);
      }
    }`,
`  } else if (key === 'path') {
    rect(ctx, px, py, ts, ts, '#dcb689');
    // 碎石：位置由格子哈希决定，跨格无缝
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 3; col++) {
        const h = hash(px + row * 7, py + col * 11);
        if (h % 3 === 0) continue;
        const sx = col * 9 + (h % 4);
        const sy = row * 9 + ((h >> 3) % 4);
        if (sx > ts - 5 || sy > ts - 4) continue;
        const tone = ['#d2ab7f', '#e3c096', '#cba577'][h % 3];
        rect(ctx, px + sx, py + sy, 5, 3, tone);
        rect(ctx, px + sx, py + sy + 2, 5, 1, '#b08a63', 0.35);
      }
    }`);

a = a.replace(`  } else if (key === 'soil') {
    rect(ctx, px, py, ts, ts, PAL.soil);
    rect(ctx, px, py + 5, ts, 3, PAL.soilDark, 0.5);
    rect(ctx, px, py + 15, ts, 3, PAL.soilDark, 0.45);
    rect(ctx, px + 4, py + 2, ts - 8, 2, PAL.soilLight, 0.4);`,
`  } else if (key === 'soil') {
    rect(ctx, px, py, ts, ts, '#8d6747');
    for (let i = 0; i < 3; i++) {
      rect(ctx, px + 1, py + 3 + i * 8, ts - 2, 4, '#9a7250');
      rect(ctx, px + 1, py + 7 + i * 8, ts - 2, 1, '#6f4f33', 0.55);
    }
    if (v % 4 === 0) rect(ctx, px + 5, py + 12, 2, 2, '#b08a63', 0.8);`);
fs.writeFileSync('src/art.js', a, 'utf8');
console.log('path/soil patched');
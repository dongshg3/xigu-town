import fs from 'node:fs';
let a = fs.readFileSync('src/art.js','utf8');

// grass: large soft patches, not per-tile checkerboard
a = a.replace(`  if (key === 'grass') {
    rect(ctx, px, py, ts, ts, PAL.grass[v % 4]);
    // 草簇：确定性的小点，靠 variant 决定位置
    if (v === 1 || v === 3) {
      rect(ctx, px + 6, py + 8, 2, 3, PAL.grassDark, 0.55);
      rect(ctx, px + 14, py + 15, 2, 3, PAL.grassDark, 0.5);
    }
    if (v === 2) rect(ctx, px + 18, py + 6, 2, 2, '#b7d98a', 0.8);
    if (neighbors.path) rect(ctx, px, py + ts - 3, ts, 3, PAL.grassEdge, 0.28);
    if (neighbors.water) rect(ctx, px, py, ts, 3, '#cfe3a8', 0.35);
  }`,
`  if (key === 'grass') {
    const patch = hash(Math.floor(px / (ts * 3)), Math.floor(py / (ts * 3))) % 3;
    rect(ctx, px, py, ts, ts, ['#8abd5f', '#90c265', '#85b659'][patch]);
    if (v % 5 === 0) rect(ctx, px, py, ts, ts, '#9aca6c', 0.35);
    if (v % 7 === 0) rect(ctx, px, py, ts, ts, '#7cae52', 0.28);
    if (v === 1 || v === 3) {
      rect(ctx, px + 6, py + 8, 2, 3, PAL.grassDark, 0.5);
      rect(ctx, px + 14, py + 15, 2, 3, PAL.grassDark, 0.45);
    }
    if (v === 2) rect(ctx, px + 18, py + 6, 2, 2, '#c3e096', 0.75);
    if (neighbors.path) rect(ctx, px, py + ts - 2, ts, 2, PAL.grassEdge, 0.22);
    if (neighbors.water) rect(ctx, px, py, ts, 2, '#cfe3a8', 0.3);
  }`);

// path: cobble rows
a = a.replace(`  } else if (key === 'path') {
    rect(ctx, px, py, ts, ts, PAL.path[v % 3]);
    rect(ctx, px + 3, py + 5, 4, 3, PAL.pathDark, 0.35);
    rect(ctx, px + 13, py + 14, 5, 3, PAL.pathDark, 0.28);
    rect(ctx, px + 19, py + 4, 3, 2, '#efd3ac', 0.5);`,
`  } else if (key === 'path') {
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
    }`);

// water shoreline
a = a.replace(`    if (!neighbors.water) {
      rect(ctx, px, py, ts, 3, PAL.foam, 0.5);
      rect(ctx, px, py + ts - 3, ts, 2, PAL.waterDeep, 0.3);
    }`,
`    if (!neighbors.water) {
      rect(ctx, px, py, ts, 2, PAL.foam, 0.55);
      rect(ctx, px, py + ts - 2, ts, 2, PAL.waterDeep, 0.35);
    }
    if (neighbors.path) rect(ctx, px, py, 2, ts, '#cfe6c0', 0.35);`);

// crops bigger and clearer
a = a.replace(`export function crop(ctx, px, py, ts, stage) {
  const cols = ['#7fbd66', '#93cd74', '#a8dc84'];
  const c = cols[stage % 3];
  if (stage <= 0) {
    rect(ctx, px + 10, py + 16, 6, 4, '#b9d98f');
    return;
  }
  for (const dx of [-6, 0, 6]) {
    rect(ctx, px + 13 + dx, py + 12 - stage * 2, 2, 8 + stage * 2, '#4f7a3a');
    rect(ctx, px + 13 + dx - 3, py + 11 - stage * 2, 8, 3, c);
  }
  if (stage >= 2) rect(ctx, px + 11, py + 9, 4, 4, PAL.gold);
}`,
`export function crop(ctx, px, py, ts, stage) {
  const cols = ['#7fbd66', '#93cd74', '#a8dc84'];
  const c = cols[stage % 3];
  if (stage <= 0) {
    rect(ctx, px + 9, py + 16, 8, 4, '#b9d98f');
    rect(ctx, px + 11, py + 14, 2, 3, '#7fae5a');
    return;
  }
  const h = 6 + stage * 4;
  for (const dx of [-7, 0, 7]) {
    rect(ctx, px + 13 + dx, py + 22 - h, 2, h, '#3f6a2f');
    rect(ctx, px + 9 + dx, py + 20 - h, 8, 4, c);
    rect(ctx, px + 10 + dx, py + 19 - h, 5, 2, '#c4ea9e', 0.7);
  }
  if (stage >= 2) {
    rect(ctx, px + 11, py + 6, 4, 4, PAL.gold);
    rect(ctx, px + 12, py + 5, 2, 2, '#ffe9a8');
  }
}`);
fs.writeFileSync('src/art.js', a, 'utf8');
console.log('ground art improved');
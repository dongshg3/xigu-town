import fs from 'node:fs';
let s = fs.readFileSync('styles.css','utf8');
s = s.replace("canvas { width: auto; height: auto; max-width: 100%; max-height: 100%; border-radius: 14px; box-shadow: 0 20px 60px rgba(0,0,0,.5), 0 0 0 1px #2a313b; image-rendering: auto; cursor: crosshair; }",
"canvas { width: auto; height: auto; max-width: 100%; max-height: 100%; border-radius: 14px; box-shadow: 0 10px 26px rgba(90,66,32,.28), 0 0 0 4px #c9a97a, 0 0 0 6px #8d6c46; image-rendering: auto; cursor: crosshair; }");
fs.writeFileSync('styles.css', s, 'utf8');
console.log('canvas framed');
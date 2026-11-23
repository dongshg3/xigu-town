import fs from 'node:fs';
let s = fs.readFileSync('styles.css','utf8');
const map = {
  '#e8e4da': '#4a3826',
  '#c4ccd6': '#5f4b33',
  '#b9c4d1': '#5f4b33',
  '#b9c2cf': '#5f4b33',
  '#cfd6df': '#4f3d28',
  '#cfd8e4': '#4f3d28',
  '#b9c3cf': '#6b563c',
  '#8d99a8': '#8b7456',
  '#7f8b9b': '#8b7456',
  '#6f7b8b': '#8b7456',
  '#d6dde6': '#4a3826',
  '#4a5664': '#8b7456',
  '#cfd7e2': '#3f3020',
  '#7d8794': '#8b7456',
  '#6b7684': '#8b7456',
  '#435064': '#7a6142',
  '#8f99a6': '#8b7456',
  '#14171c': '#fdf6e4',
};
for (const [k, v] of Object.entries(map)) {
  s = s.split(k).join(v);
}
fs.writeFileSync('styles.css', s, 'utf8');
console.log('recolored');
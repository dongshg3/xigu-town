import fs from 'node:fs';
let r = fs.readFileSync('src/render.js','utf8');
r = r.replace("      this.roundRect(x - tw / 2, ty - 6, tw, 12, 3);", "      roundRect(ctx, x - tw / 2, ty - 6, tw, 12, 3);");
fs.writeFileSync('src/render.js', r, 'utf8');
let m = fs.readFileSync('src/main.js','utf8');
m = m.replace("  try { renderer.render(sim, { ...state, selectedId: state.selectedId }); }\n  catch (e) { window.__frameErr = String(e && e.stack || e); }",
"  renderer.render(sim, { ...state, selectedId: state.selectedId });");
fs.writeFileSync('src/main.js', m, 'utf8');
console.log('nameplate fixed');
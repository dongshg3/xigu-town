import fs from 'node:fs';
let m = fs.readFileSync('src/main.js','utf8');
m = m.replace("  renderer.render(sim, { ...state, selectedId: state.selectedId });",
"  try { renderer.render(sim, { ...state, selectedId: state.selectedId }); }\n  catch (e) { window.__frameErr = String(e && e.stack || e); }");
fs.writeFileSync('src/main.js', m, 'utf8');
console.log('frame guarded');
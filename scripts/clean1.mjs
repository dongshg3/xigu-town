import fs from 'node:fs';
let m = fs.readFileSync('src/main.js','utf8');
m = m.replace(`  onBuild(type) { startPlacement(type); },
  _onBuildUnused(type) {
    if (!DECOR_DEFS[type]) return;
    placement = type;
    state.placement = type;
    ui.setPlacement(type);
  },`, `  onBuild(type) { startPlacement(type); },`);
fs.writeFileSync('src/main.js', m, 'utf8');
console.log('cleaned');
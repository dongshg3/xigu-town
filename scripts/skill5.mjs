import fs from 'node:fs';
let m = fs.readFileSync('src/main.js','utf8');
const add = (sig, sound) => {
  const i = m.indexOf(sig);
  if (i < 0) throw new Error('miss ' + sig);
  const brace = m.indexOf('{', i);
  m = m.slice(0, brace + 1) + `\n    play('${sound}');` + m.slice(brace + 1);
};
add('  onBuy(good, qty) {', 'coin');
add('  onSell(good, qty) {', 'coin');
add('  onGift(id) {', 'coin');
add('  onOrder(id, kind) {', 'panel');
add('  onGod(id, power) {', 'levelup');
add('  onDeliver(id) {', 'coin');
fs.writeFileSync('src/main.js', m, 'utf8');
console.log('sounds attached');
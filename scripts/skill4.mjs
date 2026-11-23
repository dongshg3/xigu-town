import fs from 'node:fs';
let h = fs.readFileSync('index.html','utf8');
if (!h.includes('muteBtn')) {
  h = h.replace('<div class="speedbar" id="speedbar">',
`<button class="btn" id="muteBtn" data-cmd="mute" title="开关音效">有声</button>
      <div class="speedbar" id="speedbar">`);
  fs.writeFileSync('index.html', h, 'utf8');
}
console.log('mute button added');

let m = fs.readFileSync('src/main.js','utf8');
// 商店与送礼也发声
m = m.replace("function onBuy(id) {", "function onBuy(id) {\n  play('coin');");
m = m.replace("function onSell(id) {", "function onSell(id) {\n  play('coin');");
m = m.replace("function onGift(npcId) {", "function onGift(npcId) {\n  play('coin');");
m = m.replace("function onOrder(npcId, kind) {", "function onOrder(npcId, kind) {\n  play('panel');");
m = m.replace("function onGod(npcId, power) {", "function onGod(npcId, power) {\n  play('levelup');");
fs.writeFileSync('src/main.js', m, 'utf8');
console.log('handler sounds');
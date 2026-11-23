import fs from 'node:fs';
let s = fs.readFileSync('styles.css','utf8');
s = s.replace(`:root {
  --bg: #14171c;
  --panel: #1b2027;
  --panel-2: #222932;
  --line: #2f3844;
  --text: #e8e4da;
  --muted: #9aa4b2;
  --gold: #e0b05a;
  --green: #79b46a;
  --blue: #6fa8d8;
  --red: #d9766a;
  --purple: #b58ad0;
}`, `:root {
  --bg: #f0e2c6;
  --panel: #fbf3df;
  --panel-2: #f3e6ca;
  --line: #c9b18a;
  --text: #4a3826;
  --muted: #8b7456;
  --gold: #c8901f;
  --green: #5e9440;
  --blue: #3f7fa8;
  --red: #bf5442;
  --purple: #7d5f9e;
  --ink: #4a3826;
  --shadow: 0 2px 0 #bda37a, 0 4px 10px rgba(80, 60, 30, .18);
}`);

s = s.replace(`body {
  background: radial-gradient(1200px 700px at 20% -10%, #24303c 0%, var(--bg) 60%);
  color: var(--text);
  font: 14px/1.55 "Segoe UI", "Microsoft YaHei", system-ui, sans-serif;
  overflow: hidden;
}`, `body {
  background:
    radial-gradient(900px 520px at 15% -10%, #fbf1d9 0%, rgba(251, 241, 217, 0) 60%),
    repeating-linear-gradient(45deg, #efe0c2 0 12px, #edddbd 12px 24px);
  color: var(--text);
  font: 14px/1.55 "Segoe UI", "Microsoft YaHei", system-ui, sans-serif;
  overflow: hidden;
}`);

s = s.replace(`  border-bottom: 1px solid var(--line);
  background: rgba(20, 23, 28, .88);
  backdrop-filter: blur(10px);`, `  border-bottom: 2px solid var(--line);
  background: linear-gradient(#fff8e6, #f6ead0);
  box-shadow: 0 2px 0 rgba(180, 150, 110, .45);`);

s = s.replace(`.btn {
  border: 1px solid var(--line);
  background: var(--panel-2);
  color: var(--text);
  padding: 6px 12px;
  border-radius: 8px;`, `.btn {
  border: 2px solid #a98c62;
  background: linear-gradient(#fffdf6, #f2e3c4);
  color: var(--text);
  padding: 5px 12px;
  border-radius: 10px;
  box-shadow: 0 2px 0 #c3a97f, inset 0 1px 0 #fff;
  font-weight: 600;`);
fs.writeFileSync('styles.css', s, 'utf8');
console.log('theme base patched');
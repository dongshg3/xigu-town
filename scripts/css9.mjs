import fs from 'node:fs';
let s = fs.readFileSync('styles.css','utf8');
// 侧栏与顶栏描边加重，像纸质面板
s = s.replace(".side { width: 430px; flex: 0 0 430px; border-left: 1px solid var(--line);",
              ".side { width: 430px; flex: 0 0 430px; border-left: 2px solid #d3bb93;");
s = s.replace(".tabs { display: flex; border-bottom: 1px solid var(--line); }",
              ".tabs { display: flex; border-bottom: 2px solid #dcc6a2; background: #fbf3df; }");
s = s.replace(".tabs button.active { color: var(--gold); border-bottom-color: var(--gold); }",
              ".tabs button.active { color: #8a5a12; border-bottom-color: #c8901f; background: #fff8e8; font-weight: 700; }");
fs.writeFileSync('styles.css', s, 'utf8');
console.log('panel chrome');
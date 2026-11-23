import fs from 'node:fs';
let s = fs.readFileSync('styles.css','utf8');
s = s.replace(".hint { position: absolute; left: 28px; bottom: 24px; color: #5f4b33; background: rgba(16,19,24,.72); border: 1px solid var(--line); padding: 6px 12px; border-radius: 999px; font-size: 12px; pointer-events: none; }",
".hint { position: absolute; left: 28px; bottom: 24px; color: #4a3826; background: linear-gradient(#fffdf4, #f5e7cb); border: 2px solid #c9a97a; padding: 6px 14px; border-radius: 999px; font-size: 12px; font-weight: 600; box-shadow: 0 2px 0 #c3a97f; pointer-events: none; }");
s = s.replace(".bio { color: #5f4b33; font-size: 13px; margin-top: 8px; }",
".bio { color: #4a3826; font-size: 13px; margin-top: 8px; line-height: 1.65; }");
fs.writeFileSync('styles.css', s, 'utf8');
console.log('hint fixed');
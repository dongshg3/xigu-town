import fs from 'node:fs';
let s = fs.readFileSync('styles.css','utf8');
const rep = (a,b) => { if (!s.includes(a)) throw new Error('miss: '+a.slice(0,50)); s = s.replace(a,b); };

rep(".panel { flex: 1; overflow-y: auto; padding: 16px; scrollbar-width: thin; scrollbar-color: #3a4552 transparent; }",
    ".panel { flex: 1; overflow-y: auto; padding: 16px; scrollbar-width: thin; scrollbar-color: #c2a880 transparent; }");
rep(".panel::-webkit-scrollbar-thumb { background: #333d49; border-radius: 4px; }",
    ".panel::-webkit-scrollbar-thumb { background: #cdb692; border-radius: 4px; }");
rep(".card { background: var(--panel-2); border: 1px solid var(--line); border-radius: 10px; padding: 10px 12px; margin-bottom: 8px; cursor: pointer; transition: border-color .12s, background .12s; }",
    ".card { background: linear-gradient(#fffcf2, #f6ead2); border: 2px solid #d3bb93; border-radius: 12px; padding: 10px 12px; margin-bottom: 8px; cursor: pointer; box-shadow: 0 2px 0 #ddc8a4; transition: transform .08s, border-color .12s; }");
rep(".card:hover { border-color: #4a5a70; background: #26303a; }",
    ".card:hover { border-color: #b08f5e; transform: translateY(-1px); }");
rep(".card .now { color: #c8d1dd; font-size: 12px; margin-top: 4px; }",
    ".card .now { color: #6f5a3e; font-size: 12px; margin-top: 4px; }");
fs.writeFileSync('styles.css', s, 'utf8');
console.log('cards patched');
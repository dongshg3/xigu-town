import fs from 'node:fs';
const a = fs.readFileSync('src/agent.js','utf8');
const i = a.indexOf('  moveAlongPath(');
console.log(a.slice(i, i + 700));
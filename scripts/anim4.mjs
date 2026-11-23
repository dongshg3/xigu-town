import fs from 'node:fs';
let a = fs.readFileSync('src/agent.js','utf8');
a = a.replace(`        if (Math.abs(dx) > 0.01) this.facing = Math.sign(dx);`,
`        if (Math.abs(dx) > 0.01 && Math.abs(dx) >= Math.abs(dy)) this.dir = dx > 0 ? 'right' : 'left';
        else if (Math.abs(dy) > 0.01) this.dir = dy > 0 ? 'down' : 'up';`);
a = a.replace(`    this.nextGreetAt = 0;`, `    this.nextGreetAt = 0;
    this.dir = 'down';`);
fs.writeFileSync('src/agent.js', a, 'utf8');
console.log('facing wired');

let r = fs.readFileSync('src/render.js','utf8');
r = r.replace(`    art.chibi(this.ctx, x - TS / 2, y - TS / 2 + 2, {
      ts: TS, cloth, skin, hair, hat, accent,
      bob: Math.abs(bob) > 1 ? 1 : 0,
      facing,
      highlight,
    });`,
`    const moving = !!(n.path && n.path.length);
    const pose = n.act?.id === 'relax' ? 'sit' : (moving ? 'walk' : 'stand');
    art.chibi(this.ctx, x - TS / 2, y - TS / 2 + 2, {
      ts: TS, cloth, skin, hair, hat, accent,
      facing: n.dir || 'down',
      frame: Math.floor(this.time * 7) % 4,
      pose,
      highlight,
    });`);
fs.writeFileSync('src/render.js', r, 'utf8');
console.log('render wired');
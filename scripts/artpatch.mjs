import fs from 'node:fs';
let s = fs.readFileSync('src/render.js','utf8');

// import art
if (!s.includes("from './art.js'")) {
  s = s.replace("export const TS = 26;", "import * as art from './art.js';\n\nexport const TS = 26;");
}

function replaceBetween(src, startMark, endMark, body) {
  const i = src.indexOf(startMark);
  const j = src.indexOf(endMark, i + 1);
  if (i < 0 || j < 0) throw new Error('anchor missing: ' + startMark + ' / ' + endMark);
  return src.slice(0, i) + body + src.slice(j);
}

const tilesBody = `  drawTiles(sim) {
    const w = sim.world;
    for (let y = 0; y < w.h; y++) {
      for (let x = 0; x < w.w; x++) {
        const t = w.tile(x, y);
        if (!t) continue;
        const v = art.hash(x, y);
        const nb = {
          path: w.tile(x, y + 1)?.terrain === 1,
          water: w.tile(x, y - 1)?.terrain === 2 || w.tile(x + 1, y)?.terrain === 2,
        };
        art.groundTile(this.ctx, t.terrain, x * TS, y * TS, TS, v, nb);
      }
    }
  }

`;

const objectsBody = `  drawGroundObjects(sim) {
    const w = sim.world;
    for (let y = 0; y < w.h; y++) {
      for (let x = 0; x < w.w; x++) {
        const t = w.tile(x, y);
        if (!t || !t.obj) continue;
        const px = x * TS, py = y * TS;
        const o = t.obj;
        if (o.type === 'tree') art.tree(this.ctx, px, py, TS, art.hash(x, y));
        else if (o.type === 'rock') {
          this.ctx.fillStyle = 'rgba(40,30,20,0.2)';
          this.ctx.beginPath(); this.ctx.ellipse(px + 13, py + 22, 7, 3, 0, 0, Math.PI * 2); this.ctx.fill();
          art.outlined(this.ctx, px + 6, py + 13, 14, 10, '#a8adb3', '#4a4a4a', 2);
          art.rect(this.ctx, px + 8, py + 15, 5, 3, '#c9ced4');
        } else if (o.type === 'flower') {
          const c = ['#f0a6c0', '#f6d06a', '#c9a6f0'][art.hash(x, y) % 3];
          art.rect(this.ctx, px + 12, py + 10, 2, 6, '#4f7a3a');
          this.ctx.fillStyle = c;
          this.ctx.beginPath(); this.ctx.arc(px + 13, py + 9, 3.5, 0, Math.PI * 2); this.ctx.fill();
          art.rect(this.ctx, px + 12.5, py + 9, 2, 2, '#fff3c4');
        }
      }
    }
    for (const d of w.decor || []) {
      const px = d.x * TS, py = d.y * TS;
      if (d.type === 'bench') {
        art.outlined(this.ctx, px + 3, py + 10, 20, 8, art.PAL.wood, art.PAL.ink, 2);
        art.rect(this.ctx, px + 3, py + 10, 20, 3, art.PAL.woodLight);
        art.rect(this.ctx, px + 5, py + 18, 3, 5, art.PAL.woodDark);
        art.rect(this.ctx, px + 18, py + 18, 3, 5, art.PAL.woodDark);
      } else if (d.type === 'lamp') {
        art.rect(this.ctx, px + 12, py + 8, 3, 15, art.PAL.ink);
        art.rect(this.ctx, px + 8, py + 4, 11, 7, art.PAL.ink);
        art.rect(this.ctx, px + 9, py + 5, 9, 5, '#f7d795');
      } else if (d.type === 'fountain') {
        art.outlined(this.ctx, px + 2, py + 8, 22, 14, art.PAL.stone, '#4a4a4a', 2);
        art.rect(this.ctx, px + 5, py + 11, 16, 8, art.PAL.water);
        art.rect(this.ctx, px + 5, py + 11, 16, 2, art.PAL.foam, 0.7);
        art.rect(this.ctx, px + 12, py + 14, 3, 8, '#cfd6dd');
      } else if (d.type === 'garden') {
        for (let i = 0; i < 3; i++) {
          art.rect(this.ctx, px + 4 + i * 7, py + 14, 3, 6, '#4f7a3a');
          art.ctxFlower?.(this.ctx, px + 5 + i * 7, py + 12);
          this.ctx.fillStyle = ['#f0a6c0', '#f6d06a', '#c9a6f0'][(i + d.x) % 3];
          this.ctx.beginPath(); this.ctx.arc(px + 5.5 + i * 7, py + 12, 3, 0, Math.PI * 2); this.ctx.fill();
        }
      }
    }
  }

`;

const buildingsBody = `  drawBuildings(sim) {
    const night = this.nightAmount(sim);
    for (const b of sim.world.buildings || []) {
      const x = b.x * TS, y = b.y * TS, w = b.w * TS, h = b.h * TS;
      const roof = ['a', 'c', 'e'][(b.type ? b.type.length : b.name.length) % 3];
      art.house(this.ctx, b, x + 2, y + 1, w - 4, h - 3, night, { roof });
    }
  }

`;

const personBody = `  drawPerson(n, x, y, highlight) {
    const job = n.profile.job;
    const cloth = n.profile.color || '#c25a44';
    const skin = art.PAL.skin[(n.profile.id.charCodeAt(0) + n.profile.id.length) % 4];
    const hair = art.PAL.hair[(n.profile.id.charCodeAt(n.profile.id.length - 1)) % 6];
    const bob = Math.sin((n.animPhase || 0)) * 2;
    const facing = n.facing || 1;
    let hat = null, accent = null;
    if (job === 'farmer') hat = 'straw';
    else if (job === 'artist') hat = 'beret';
    else if (job === 'guard') hat = 'guard';
    else if (job === 'doctor') { accent = '#d05a4a'; }
    else if (job === 'carpenter') { accent = art.PAL.woodDark; }
    else if (job === 'tavern') { accent = '#f3e4c3'; }
    else if (job === 'merchant') { accent = art.PAL.gold; }
    else if (job === 'fisher') { accent = '#4f7fb8'; }
    art.chibi(this.ctx, x - TS / 2, y - TS / 2, {
      ts: TS, cloth, skin, hair, hat, accent,
      bob: Math.abs(bob) > 1 ? 1 : 0,
      facing,
      highlight,
    });
  }

`;

s = replaceBetween(s, '  drawTiles(sim) {', '  drawGrassTuft(', tilesBody);
s = replaceBetween(s, '  drawGroundObjects(sim) {', '  drawCrops(', objectsBody);
s = replaceBetween(s, '  drawBuildings(sim) {', '  drawBlueprints(', buildingsBody);
s = replaceBetween(s, '  drawPerson(n, x, y, highlight) {', '  drawSpeech(', personBody);

fs.writeFileSync('src/render.js', s, 'utf8');
console.log('render patched', s.split('\n').length, 'lines');
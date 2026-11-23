import fs from 'node:fs';
let r = fs.readFileSync('src/render.js','utf8');
r = r.replace(`      // name
      ctx.font = '9px "Microsoft YaHei", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.strokeStyle = 'rgba(12,16,20,.72)';
      ctx.lineWidth = 3;
      ctx.strokeText(n.name, x, y + 17);
      ctx.fillStyle = selected ? '#f4e3bd' : 'rgba(232,228,218,.86)';
      ctx.fillText(n.name, x, y + 17);`,
`      // 名牌：奶白小牌 + 墨字，像别在胸前的一枚木片
      ctx.font = 'bold 9px "Microsoft YaHei", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const tw = ctx.measureText(n.name).width + 8;
      const ty = y + 16;
      ctx.fillStyle = selected ? '#ffe9b8' : 'rgba(255,249,233,.92)';
      ctx.strokeStyle = selected ? '#b8862c' : 'rgba(120,96,64,.75)';
      ctx.lineWidth = 1;
      this.roundRect(x - tw / 2, ty - 6, tw, 12, 3);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#4a3826';
      ctx.fillText(n.name, x, ty);`);
fs.writeFileSync('src/render.js', r, 'utf8');
console.log('name plate restyled');
import fs from 'node:fs';
let a = fs.readFileSync('src/art.js','utf8');
// up：后脑勺加高光和收边，不要一块死黑
a = a.replace(`    rect(ctx, hx - u(7), hy + u(3), u(14), u(10), hair);      // 后脑勺
    rect(ctx, hx - u(8), hy + u(11), u(16), u(3), skin);      // 脖子露一点`,
`    rect(ctx, hx - u(7), hy + u(3), u(14), u(9), hair);       // 后脑勺
    rect(ctx, hx - u(6), hy + u(4), u(12), u(2), '#5a4433');  // 发顶高光
    rect(ctx, hx - u(7), hy + u(11), u(14), u(2), skin);      // 后颈
    rect(ctx, hx - u(8), hy + u(12), u(16), u(2), cloth);     // 衣领`);

// sit：腿画在身前，看得出是盘腿坐
a = a.replace(`    // 折起来的两条腿 + 鞋
    rect(ctx, cx - u(7), ground - u(5), u(6), u(3), '#3a2b22');
    rect(ctx, cx + u(1), ground - u(5), u(6), u(3), '#3a2b22');
    rect(ctx, cx - u(7), ground - u(2), u(6), u(2), '#6b4a33');
    rect(ctx, cx + u(1), ground - u(2), u(6), u(2), '#6b4a33');`,
`    // 折起来的两条腿 + 鞋（在身体之前，露在两侧）
    rect(ctx, cx - u(10), ground - u(6), u(7), u(4), '#4a3a2e');
    rect(ctx, cx + u(3), ground - u(6), u(7), u(4), '#4a3a2e');
    rect(ctx, cx - u(11), ground - u(3), u(6), u(3), '#8a6a4a');
    rect(ctx, cx + u(5), ground - u(3), u(6), u(3), '#8a6a4a');`);

// 鞋：亮一点，草地上才看得见
a = a.replace(`  rect(ctx, lx1, ground - u(2), u(5), u(2), '#6b4a33');
  rect(ctx, lx2, ground - u(2), u(5), u(2), '#6b4a33');`,
`  rect(ctx, lx1, ground - u(2), u(5), u(2), '#8a6a4a');
  rect(ctx, lx2, ground - u(2), u(5), u(2), '#8a6a4a');`);
fs.writeFileSync('src/art.js', a, 'utf8');
console.log('sprite polish');
// actions/registry.js — 动作注册表（架构 §3：每个行为可回答「做什么/效果/耗时」）。
// 迁移第 3 步：把旧 agent.js applyEffect 的 switch 分支拆成数据驱动条目。
// 每个条目：{ id, name, apply(npc, sim, act) }；act = { id, ticks, total, data, label, source }。
// 行为红线：效果数值与旧实现逐行一致；后续扩字段（前置条件/动画/中断）在此登记。
import { clamp } from '../core.js';

export const ACTIONS = {
  sleep: {
    id: 'sleep', name: '睡觉',
    apply(npc, sim, act) {
      const n = npc.needs;
      n.energy = clamp(n.energy + 8, 0, 100);
      npc.addMemory({ text: '睡了一觉，梦见了些说不清的东西。', valence: 1.4, strength: 0.4, kind: 'rest' });
    },
  },

  eat: {
    id: 'eat', name: '吃饭',
    apply(npc, sim, act) {
      const n = npc.needs;
      const d = act.data || {};
      if (d.src === 'pack') {
        if (npc.inventory.food <= 0) {
          // 口袋空了就花钱从镇上仓里买一份；买不起才是真的饿
          const price = 5;
          if ((sim.world.stock.food || 0) > 0 && npc.coins >= price) {
            sim.world.stock.food--;
            npc.coins -= price;
            if (sim.town) sim.town.coins += price;
            npc.note('从仓里买了一份粮', 'market');
          } else {
            sim.log(`${npc.name}摸了摸口袋，什么吃的都没有。`, 'social', [npc.id]);
            return;
          }
        } else {
          npc.inventory.food--;
        }
      }
      n.hunger = clamp(n.hunger + (d.src === 'meal' ? 52 : 40), 0, 100);
      n.fun += 2;
      npc.addMemory({ text: d.src === 'meal' ? '在酒馆吃了一顿热乎的。' : '啃了点干粮，垫了垫肚子。', valence: 1.2, strength: 0.35, kind: 'food' });
    },
  },

  study: {
    id: 'study', name: '听课',
    apply(npc, sim, act) {
      const n = npc.needs;
      if (npc.sim?.dev) npc.sim.dev.study += 1;
      n.purpose = clamp(n.purpose + 6, 0, 100);
      n.fun = clamp(n.fun + 3, 0, 100);
      npc.education = clamp(npc.education + 1.6, 0, 100);
      for (const k of Object.keys(npc.skills)) npc.skills[k] = Math.round((npc.skills[k] + 0.05) * 10) / 10;
      npc.addMemory({ text: '在学堂听了一堂课。', valence: 1, strength: 0.3, kind: 'study' });
      sim.log(`${npc.name}在学堂听了一堂课。`, 'social', [npc.id]);
    },
  },

  buyMeal: {
    id: 'buyMeal', name: '在酒馆吃饭',
    apply(npc, sim, act) {
      const n = npc.needs;
      const price = 6;
      if (npc.coins < price) { sim.log(`${npc.name}在酒馆门口数了数钱，又走开了。`, 'social', [npc.id]); return; }
      if (sim.world.stock.food <= 0) { sim.log(`${npc.name}掀开锅盖，里面是空的。`, 'social', [npc.id]); return; }
      sim.world.stock.food--;
      npc.coins -= price;
      sim.world.stock.coins += price;
      if (sim.town) sim.town.coins += price;
      n.hunger = clamp(n.hunger + 55, 0, 100);
      n.social += 7; n.fun += 7;
      npc.addMemory({ text: '在酒馆吃了一顿热的，听了几耳朵闲话。', valence: 2, strength: 0.5, kind: 'food', about: ['man'] });
      sim.log(`${npc.name}在酒馆吃了顿饭，花了 ${price} 枚硬币。`, 'work', [npc.id, 'man']);
    },
  },

  forage: {
    id: 'forage', name: '找吃的',
    apply(npc, sim, act) {
      const n = npc.needs;
      npc.inventory.food++;
      n.fun += 4; n.hunger += 4;
      npc.addMemory({ text: '在林子边找到几颗野果。', valence: 1, strength: 0.3, kind: 'food' });
    },
  },

  work: {
    id: 'work', name: '上工',
    apply(npc, sim, act) {
      const n = npc.needs;
      const d = act.data || {};
      n.purpose = clamp(n.purpose + 16, 0, 100);
      npc.coins += 3;
      sim.world.stock.coins = Math.max(0, sim.world.stock.coins - 3);
      npc.skills[d.skill || 'farming'] = Math.min(10, (npc.skills[d.skill || 'farming'] || 0) + 0.05);
      npc.addMemory({ text: d.line || '干了一阵子活，手上有了些热气。', valence: 1, strength: 0.3, kind: 'work' });
    },
  },

  harvest: {
    id: 'harvest', name: '收割',
    apply(npc, sim, act) {
      const n = npc.needs;
      const d = act.data || {};
      if (npc.sim?.dev) npc.sim.dev.harvest += 1;
      const got = sim.world.harvest(d.x, d.y);
      if (got) {
        sim.world.stock.food += got;
        n.purpose += 12; npc.coins += 4;
        npc.addMemory({ text: `收了一茬芜菁，装了 ${got} 筐。`, valence: 1.6, strength: 0.45, kind: 'work' });
        sim.log(`${npc.name}收了一茬芜菁（+${got} 食物）。`, 'work', [npc.id]);
      }
    },
  },

  water: {
    id: 'water', name: '浇水',
    apply(npc, sim, act) {
      const n = npc.needs;
      const d = act.data || {};
      sim.world.water(d.x, d.y);
      n.purpose += 4;
    },
  },

  plant: {
    id: 'plant', name: '播种',
    apply(npc, sim, act) {
      const n = npc.needs;
      const d = act.data || {};
      if (sim.world.stock.seeds > 0 && sim.world.plant(d.x, d.y)) {
        sim.world.stock.seeds--;
        n.purpose += 6;
        npc.addMemory({ text: '在空地里下了种。', valence: 1, strength: 0.3, kind: 'work' });
      }
    },
  },

  chop: {
    id: 'chop', name: '砍树',
    apply(npc, sim, act) {
      const n = npc.needs;
      const d = act.data || {};
      const wood = sim.world.chopTree(d.x, d.y);
      if (wood) {
        if (sim._chopDay !== sim.clock.day) { sim._chopDay = sim.clock.day; sim._chopCount = 0; }
        sim._chopCount = (sim._chopCount || 0) + 1;
        sim.world.stock.wood += wood;
        npc.coins += 2; n.purpose += 10;
        npc.addMemory({ text: `砍倒一棵树，得了 ${wood} 份木料。`, valence: 1, strength: 0.35, kind: 'work' });
        sim.log(`${npc.name}砍了一棵树（+${wood} 木材）。`, 'work', [npc.id]);
      }
    },
  },

  build: {
    id: 'build', name: '盖房子',
    apply(npc, sim, act) {
      const n = npc.needs;
      const d = act.data || {};
      const w = sim.world;
      const bp = w.blueprints.find((b) => b.id === d.bpId);
      if (!bp) return;
      const done = w.buildProgress(bp, 0.8 * npc.mods.buildSpeed + 0.35);
      n.purpose += 10; npc.coins += 4;
      if (done) {
        npc.addMemory({ text: `把${bp.name}造好了，站在旁边看了好一会儿。`, valence: 2.4, strength: 0.9, kind: 'build' });
        sim.log(`${npc.name}造好了「${bp.name}」。`, 'build', [npc.id]);
        sim.onDecorBuilt(bp);
      } else {
        npc.addMemory({ text: `在给${bp.name}收尾。`, valence: 0.6, strength: 0.3, kind: 'work' });
      }
    },
  },

  chat: {
    id: 'chat', name: '聊天',
    apply(npc, sim, act) {
      const d = act.data || {};
      sim.doChat(npc, sim.npcById(d.otherId));
    },
  },

  relax: {
    id: 'relax', name: '歇一会儿',
    apply(npc, sim, act) {
      const n = npc.needs;
      const d = act.data || {};
      n.fun = clamp(n.fun + 15, 0, 100);
      n.energy = clamp(n.energy + 3, 0, 100);
      npc.addMemory({ text: d.line || '坐了一会儿，什么也没干。', valence: 1.2, strength: 0.3, kind: 'leisure' });
    },
  },

  fish: {
    id: 'fish', name: '钓鱼',
    apply(npc, sim, act) {
      const n = npc.needs;
      npc.inventory.food++;
      n.fun += 6; n.purpose += 8; npc.coins += 1;
      npc.skills.fishing = Math.min(10, npc.skills.fishing + 0.06);
      npc.addMemory({ text: sim.rng.chance(0.2) ? '水面下有什么东西一闪而过，没钓上来。' : '钓上来一条不小的鱼。', valence: sim.rng.chance(0.2) ? 1.8 : 1.1, strength: 0.4, kind: 'work' });
    },
  },

  paint: {
    id: 'paint', name: '画画',
    apply(npc, sim, act) {
      const n = npc.needs;
      n.fun += 9; n.purpose += 10;
      npc.skills.art = Math.min(10, npc.skills.art + 0.08);
      if (sim.rng.chance(0.18)) {
        npc.coins += 8;
        npc.addMemory({ text: '画出了一小块满意的颜色，有人愿意买走它。', valence: 2.2, strength: 0.7, kind: 'work' });
        sim.log(`${npc.name}卖掉了一幅小画。`, 'work', [npc.id]);
      } else {
        npc.addMemory({ text: '画了又刮掉，总觉得差一点。', valence: 0.2, strength: 0.3, kind: 'work' });
      }
    },
  },

  treat: {
    id: 'treat', name: '看病',
    apply(npc, sim, act) {
      const n = npc.needs;
      n.purpose += 12; npc.coins += 4;
      npc.skills.healing = Math.min(10, npc.skills.healing + 0.05);
      if (sim.rng.chance(0.25)) {
        const other = sim.rng.pick(sim.npcs.filter((x) => x.id !== npc.id));
        if (other) {
          other.needs.energy = clamp(other.needs.energy + 4, 0, 100);
          other.addMemory({ text: `去诊所找${npc.name}看了看，她说什么事都没有，别硬撑。`, valence: 1.4, strength: 0.5, kind: 'care', about: [npc.id] });
          sim.log(`${npc.name}给${other.name}看了看脉。`, 'social', [npc.id, other.id]);
        }
      }
    },
  },

  serve: {
    id: 'serve', name: '招呼客人',
    apply(npc, sim, act) {
      const n = npc.needs;
      if (sim.world.stock.food <= 0) {
        const now = sim.tick;
        if ((sim._restockAt || -999) + 180 < now && npc.coins >= 12) {
          sim._restockAt = now;
          npc.coins -= 12;
          sim.world.stock.food += 6;
          npc.addMemory({ text: '食材断了，跑了一趟才补上，真不该拖到今天。', valence: -0.8, strength: 0.6, kind: 'work', about: [] });
          sim.log(`${npc.name}断了食材，花 12 硬币补了 6 份（-12 硬币）。`, 'work', [npc.id]);
        } else if ((sim._restockAt || -999) + 180 >= now && !sim._restockNoted) {
          sim._restockNoted = true;
          sim.log(`酒馆没食材了，${npc.name}把门板挂了上去。`, 'work', [npc.id]);
        }
        return;
      }
      sim.world.stock.food--;
      npc.coins += 5; n.social += 6; n.purpose += 6;
      const patron = sim.npcs.find((x) => x.id !== npc.id && Math.hypot(x.x - npc.x, x.y - npc.y) < 6);
      if (patron) {
        patron.needs.social += 4;
        patron.addMemory({ text: `在酒馆坐了会儿，${npc.name}给续了杯。`, valence: 1, strength: 0.3, kind: 'leisure', about: [npc.id] });
      }
      npc.addMemory({ text: '擦杯子、添酒、听人说话，一晚上就这么过去了。', valence: 1.2, strength: 0.35, kind: 'work' });
    },
  },

  trade: {
    id: 'trade', name: '做买卖',
    apply(npc, sim, act) {
      const n = npc.needs;
      npc.coins += 4 + Math.round(npc.skills.farming * 0.2);
      n.purpose += 8; n.social += 3;
      npc.addMemory({ text: '在街口做成了两笔小买卖。', valence: 1.3, strength: 0.35, kind: 'work' });
    },
  },

  watch: {
    id: 'watch', name: '看着街上',
    apply(npc, sim, act) {
      const n = npc.needs;
      n.purpose += 7;
      npc.addMemory({ text: '巡了一圈，街上没什么事。', valence: 0.8, strength: 0.25, kind: 'work' });
    },
  },

  look: {
    id: 'look', name: '看了看四周',
    apply(npc, sim, act) {
      const n = npc.needs;
      n.fun += 3;
    },
  },
};

export function getAction(id) {
  return ACTIONS[id] || null;
}

// 展示名：旧 ACT_NAMES 的等价物；未登记返回 undefined 以便 || 兜底链
export function actionLabel(id) {
  return ACTIONS[id]?.name;
}

export function knownActionIds() {
  return Object.keys(ACTIONS);
}

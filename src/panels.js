// panels.js — 镇务面板（市政 / 版图 / 市集 / 委托）。纯字符串，不碰 DOM 状态。
import { GOODS, priceOf } from './economy.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function townHTML(sim) {
  const t = sim.town || {};
  const pol = sim.politics ? sim.politics() : null;
  const plots = sim.world.plots || [];
  const cost = sim.landCost ? sim.landCost() : 0;

  const priceList = Object.entries(GOODS).map(([id, g]) => {
    const p = priceOf(sim, id);
    const stock = sim.world.stock[id] || 0;
    const have = sim.player.bag?.[id] || 0;
    return `<div class="mktrow">
      <span class="gname">${g.name}</span>
      <span class="gprice">${p} 硬币</span>
      <span class="gstock">库存 ${stock}</span>
      <span class="gbag">身上 ${have}</span>
      <button class="mini" data-act="buy" data-good="${id}">买 1</button>
      <button class="mini" data-act="sell" data-good="${id}">卖 1</button>
    </div>`;
  }).join('');

  const orders = (t.orders || []).map((o) => `<div class="orderrow">
      <span>${GOODS[o.good].name} × ${o.need}</span>
      <span class="gprice">${o.reward} 硬币</span>
      <span class="dim">第 ${o.expires} 天前有效</span>
      <button class="mini" data-act="deliver" data-id="${o.id}">交货</button>
    </div>`).join('') || '<p class="dim">暂时没有委托。</p>';

  const plotList = plots.map((p) => {
    const state = p.built ? `已建成 ${p.houseName || '新居'}` : p.claimed ? '已划入版图，可盖新居' : '镇外荒地';
    const btn = p.claimed ? '' : `<button class="mini" data-act="claim" data-plot="${p.id}">购地 ${cost}</button>`;
    return `<div class="plotrow"><span>${p.id}</span><span class="dim">${state}</span>${btn}</div>`;
  }).join('') || '<p class="dim">这里还没有可扩张的地。</p>';

  const proposals = (pol?.proposals || [])
    .map((p) => `<button class="mini" data-act="propose" data-id="${p.id}">${p.label}</button>`)
    .join('') || '<span class="dim">暂时没有提案</span>';

  const bag = Object.entries(GOODS)
    .map(([id, g]) => `<span class="chip">${g.name} ${sim.player.bag?.[id] || 0}</span>`)
    .join('');

  return `
    <h2>镇务</h2>
    <p class="bio">钱从哪来、谁说了算、镇子往哪长——这三件事现在都能被你推动。</p>
    <div class="kv"><b>镇长</b><span>${pol ? `${esc(pol.mayor)}（${esc(pol.mayorStance)}）` : '—'}</span></div>
    <div class="kv"><b>议会</b><span>${pol ? esc(pol.council.join('、')) : '—'}</span></div>
    <div class="kv"><b>税率</b><span>${pol ? Math.round(pol.taxRate * 100) + '%' : '—'} · 下次选举 第 ${pol ? pol.nextElectionDay : '—'} 天</span></div>
    <div class="kv"><b>你的声望</b><span>${pol ? Math.round(pol.standing) : 0} / 100</span></div>
    <div class="kv"><b>营生</b><span><button class="mini" data-act="shift">打零工（半天）</button> 
      <button class="mini" data-act="run">参选镇长</button></span></div>
    <div class="kv"><b>公账</b><span>${t.coins || 0} 硬币</span></div>
    <h3>提案</h3>
    <div class="chips">${proposals}</div>
    <h3>版图 <span class="dim">购地 ${cost} 硬币</span></h3>
    <div class="plots">${plotList}</div>
    <p class="dim">买下地之后放一张「新居」图纸，木匠盖好，第二天就有人搬进来。</p>
    <h3>市集</h3>
    <div class="market">${priceList}</div>
    <h3>委托</h3>
    <div class="orders">${orders}</div>
    <h3>你的背包</h3>
    <div class="chips">${bag}<span class="chip gold">${sim.player.coins} 硬币</span></div>
    <div class="rowbtns"><button class="ghost" data-act="eat">在酒馆吃一顿（6）</button></div>
  `;
}
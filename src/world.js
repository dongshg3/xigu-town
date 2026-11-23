// world.js — tile grid, town layout, pathfinding, crops, blueprints, decorations.
import { RNG, clamp, hash2, uid } from './core.js';
import { BUILDING_DEFS, BUILDING_STYLE, DECOR_DEFS } from './data.js';

export const TILE = {
  GRASS: 'grass', PATH: 'path', WATER: 'water', SOIL: 'soil',
  FLOOR: 'floor', STUMP: 'stump', SAND: 'sand',
};

const SOLID_OBJS = new Set(['tree', 'rock', 'fountain']);

export class World {
  constructor(seed = 20261123) {
    this.seed = seed;
    this.rng = new RNG(seed);
    this.w = 40;
    this.h = 30;
    this.tiles = [];
    this.buildings = [];
    this.blueprints = [];
    this.decor = [];
    this.trees = [];
    this.stock = { wood: 26, stone: 9, food: 14, seeds: 12, coins: 90 };
    this.weather = 'sunny';
    this.farmTiles = [];
    this.pondSpots = [{ x: 3, y: 6 }, { x: 6, y: 6 }];
    this.streetTiles = [];
    this.generate();
  }

  idx(x, y) { return y * this.w + x; }
  inBounds(x, y) { return x >= 0 && y >= 0 && x < this.w && y < this.h; }
  tile(x, y) { return this.inBounds(x, y) ? this.tiles[this.idx(x, y)] : null; }
  buildingAt(x, y) {
    const t = this.tile(x, y);
    return t && t.building ? this.buildings.find((b) => b.id === t.building) : null;
  }

  generate() {
    const { w, h, rng } = this;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        this.tiles.push({ x, y, terrain: TILE.GRASS, building: null, obj: null, crop: null, regrow: 0, variant: hash2(x, y, this.seed) });
      }
    }

    // pond
    for (let y = 2; y <= 5; y++) for (let x = 2; x <= 6; x++) {
      const edge = x === 2 || x === 6 || y === 2 || y === 5;
      this.setTerrain(x, y, edge && (x === 2 || y === 2) ? TILE.SAND : TILE.WATER);
    }
    // main street (two rows) + plaza
    for (let x = 1; x <= 38; x++) { this.setTerrain(x, 15, TILE.PATH); this.setTerrain(x, 16, TILE.PATH); }
    for (let x = 22; x <= 27; x++) for (let y = 13; y <= 14; y++) this.setTerrain(x, y, TILE.PATH);

    // buildings
    for (const def of BUILDING_DEFS) {
      const b = {
        ...def,
        id: uid('b'),
        style: BUILDING_STYLE[def.type],
        door: { x: def.x + Math.floor(def.w / 2), y: def.y < 15 ? def.y + def.h : def.y - 1 },
        spot: { x: def.x + Math.floor(def.w / 2), y: def.y + 1 },
      };
      this.buildings.push(b);
      for (let y = b.y; y < b.y + b.h; y++) for (let x = b.x; x < b.x + b.w; x++) {
        const t = this.tile(x, y);
        if (!t) continue;
        t.terrain = TILE.FLOOR;
        t.building = b.id;
        t.obj = null;
      }
      this.setTerrain(b.door.x, b.door.y, TILE.PATH);
      if (b.door.y === 13) for (let yy = 13; yy <= 14; yy++) this.setTerrain(b.door.x, yy, TILE.PATH);
    }

    // paths to pond / farm / forest
    for (let y = 6; y <= 14; y++) this.setTerrain(4, y, TILE.PATH);
    for (let y = 17; y <= 20; y++) this.setTerrain(16, y, TILE.PATH);
    for (let y = 9; y <= 14; y++) this.setTerrain(36, y, TILE.PATH);

    // farm plots
    for (let y = 21; y <= 24; y++) for (let x = 13; x <= 18; x++) {
      this.setTerrain(x, y, TILE.SOIL);
      this.farmTiles.push({ x, y });
      const t = this.tile(x, y);
      t.crop = { stage: 0, growth: 0, watered: false, kind: '芜菁' };
      if (rng.chance(0.55)) { t.crop.stage = rng.int(0, 2); t.crop.growth = t.crop.stage * 12; }
    }

    // forest
    for (let y = 1; y <= 8; y++) for (let x = 33; x <= 39; x++) {
      if (this.tile(x, y).terrain !== TILE.GRASS) continue;
      if (rng.chance(0.62)) this.addTree(x, y);
    }
    for (let y = 25; y <= 29; y++) for (let x = 1; x <= 10; x++) {
      if (rng.chance(0.4)) this.addTree(x, y);
    }
    // scattered trees + rocks + flowers
    for (let i = 0; i < 16; i++) {
      const x = rng.int(1, 38), y = rng.int(1, 28);
      const t = this.tile(x, y);
      if (t && t.terrain === TILE.GRASS && !t.obj && !(x >= 19 && x <= 21 && y <= 6)) this.addTree(x, y);
    }
    for (let i = 0; i < 7; i++) {
      const x = rng.int(1, 38), y = rng.int(1, 28);
      const t = this.tile(x, y);
      if (t && t.terrain === TILE.GRASS && !t.obj) t.obj = { type: 'rock', variant: rng.int(0, 2) };
    }
    for (let i = 0; i < 26; i++) {
      const x = rng.int(1, 38), y = rng.int(1, 28);
      const t = this.tile(x, y);
      if (t && t.terrain === TILE.GRASS && !t.obj && !t.crop) t.obj = { type: 'flower', variant: rng.int(0, 3) };
    }

    // benches & lamps
    for (const [x, y] of [[17, 14], [25, 14], [6, 24]]) this.addDecor('bench', x, y);
    for (const [x, y] of [[20, 14], [28, 15], [6, 15]]) this.addDecor('lamp', x, y);

    // street tiles for patrols
    for (let x = 4; x <= 36; x++) this.streetTiles.push({ x, y: 15 });
  }

  setTerrain(x, y, terrain) {
    const t = this.tile(x, y);
    if (t) { t.terrain = terrain; if (terrain !== TILE.GRASS) t.obj = null; }
  }

  addTree(x, y) {
    const t = this.tile(x, y);
    if (!t || t.obj) return;
    t.obj = { type: 'tree', variant: this.rng.int(0, 3), wood: this.rng.int(2, 4) };
    this.trees.push({ x, y });
  }

  addDecor(type, x, y) {
    const t = this.tile(x, y);
    if (!t) return;
    const def = DECOR_DEFS[type];
    t.obj = { type, built: true, color: def?.color };
    this.decor.push({ type, x, y });
    if (type === 'fountain') t.terrain = TILE.PATH;
  }

  // 新居：把 3×1 的地块变成一个真的房子，有门、有室内点。
  addHouse(x, y, name) {
    const bw = 3, bh = 2;
    const bx = clamp(x - 1, 0, this.w - bw);
    const by = clamp(y - 1, 0, this.h - bh - 1);
    const b = {
      name, type: 'house', x: bx, y: by, w: bw, h: bh,
      door: { x: bx + 1, y: by + bh },
      spot: { x: bx + 1, y: by + 1 },
      owner: null, dynamic: true,
    };
    for (let yy = by; yy < by + bh; yy++) {
      for (let xx = bx; xx < bx + bw; xx++) {
        const t = this.tile(xx, yy);
        if (!t) continue;
        t.obj = null;
        t.crop = null;
        t.building = b;
        t.terrain = TILE.FLOOR;
      }
    }
    this.buildings.push(b);
    return b;
  }

  findBuilding(name) { return this.buildings.find((b) => b.name === name) || null; }
  homeOf(profileId) { return this.buildings.find((b) => b.owner === profileId && b.type === 'house') || null; }

  isWalkable(x, y) {
    const t = this.tile(x, y);
    if (!t) return false;
    if (t.terrain === TILE.WATER) return false;
    if (t.obj && SOLID_OBJS.has(t.obj.type)) return false;
    return true;
  }

  nearestWalkable(x, y, maxR = 6) {
    const cx = clamp(Math.round(x), 0, this.w - 1);
    const cy = clamp(Math.round(y), 0, this.h - 1);
    if (this.isWalkable(cx, cy)) return { x: cx, y: cy };
    for (let r = 1; r <= maxR; r++) {
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
        if (this.isWalkable(cx + dx, cy + dy)) return { x: cx + dx, y: cy + dy };
      }
    }
    return null;
  }

  findPath(sx, sy, tx, ty) {
    const start = this.nearestWalkable(sx, sy, 3);
    const goal = this.nearestWalkable(tx, ty, 4);
    if (!start || !goal) return null;
    if (start.x === goal.x && start.y === goal.y) return [];
    const W = this.w, H = this.h;
    const key = (x, y) => y * W + x;
    const open = [start];
    const came = new Map();
    const g = new Map([[key(start.x, start.y), 0]]);
    const f = new Map([[key(start.x, start.y), Math.abs(goal.x - start.x) + Math.abs(goal.y - start.y)]]);
    const closed = new Set();
    let guard = 0;
    while (open.length && guard++ < 6000) {
      let bi = 0;
      for (let i = 1; i < open.length; i++) if ((f.get(key(open[i].x, open[i].y)) ?? 1e9) < (f.get(key(open[bi].x, open[bi].y)) ?? 1e9)) bi = i;
      const cur = open.splice(bi, 1)[0];
      const ck = key(cur.x, cur.y);
      if (cur.x === goal.x && cur.y === goal.y) {
        const path = [];
        let k = ck;
        while (came.has(k)) {
          const p = came.get(k);
          path.push({ x: p.x, y: p.y });
          k = key(p.x, p.y);
        }
        path.reverse();
        return path;
      }
      closed.add(ck);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = cur.x + dx, ny = cur.y + dy;
        if (!this.isWalkable(nx, ny)) continue;
        const nk = key(nx, ny);
        if (closed.has(nk)) continue;
        const ng = (g.get(ck) ?? 0) + 1;
        if (ng < (g.get(nk) ?? 1e9)) {
          came.set(nk, cur);
          g.set(nk, ng);
          f.set(nk, ng + Math.abs(goal.x - nx) + Math.abs(goal.y - ny));
          if (!open.some((o) => o.x === nx && o.y === ny)) open.push({ x: nx, y: ny });
        }
      }
    }
    return null;
  }

  randomWalkable(rng, cx, cy, radius = 12) {
    for (let i = 0; i < 60; i++) {
      const x = clamp(Math.round(cx + rng.float(-radius, radius)), 0, this.w - 1);
      const y = clamp(Math.round(cy + rng.float(-radius, radius)), 0, this.h - 1);
      if (this.isWalkable(x, y)) return { x, y };
    }
    return this.nearestWalkable(cx, cy, 8);
  }

  openFarmTile() {
    return this.farmTiles.find(({ x, y }) => {
      const t = this.tile(x, y);
      return t && !t.crop;
    }) || null;
  }

  ripeCrop() {
    for (const { x, y } of this.farmTiles) {
      const t = this.tile(x, y);
      if (t?.crop && t.crop.stage >= 3) return { x, y };
    }
    return null;
  }

  thirstyCrop() {
    for (const { x, y } of this.farmTiles) {
      const t = this.tile(x, y);
      if (t?.crop && !t.crop.watered && t.crop.stage < 3) return { x, y };
    }
    return null;
  }

  plant(x, y) {
    const t = this.tile(x, y);
    if (!t || t.terrain !== TILE.SOIL || t.crop) return false;
    t.crop = { stage: 0, growth: 0, watered: true, kind: '芜菁' };
    return true;
  }

  water(x, y) {
    const t = this.tile(x, y);
    if (!t?.crop) return false;
    t.crop.watered = true;
    return true;
  }

  harvest(x, y) {
    const t = this.tile(x, y);
    if (!t?.crop || t.crop.stage < 3) return 0;
    const amount = 2 + Math.floor(t.crop.stage);
    t.crop = { stage: 0, growth: 0, watered: false, kind: '芜菁' };
    return amount;
  }

  chopTree(x, y) {
    const t = this.tile(x, y);
    if (!t || t.obj?.type !== 'tree') return 0;
    const wood = t.obj.wood || 3;
    t.obj = { type: 'stump' };
    t.regrow = 220;
    return wood;
  }

  dailyUpdate() {
    for (const t of this.tiles) {
      if (t.crop) {
        t.crop.watered = this.weather === 'rain';
      }
      if (t.regrow > 0) {
        t.regrow--;
        if (t.regrow === 0 && t.obj?.type === 'stump') t.obj = { type: 'tree', variant: this.rng.int(0, 3), wood: 3 };
      }
    }
  }

  tickCrops(dt, weatherBonus = 0) {
    for (const t of this.tiles) {
      if (!t.crop || t.crop.stage >= 3) continue;
      if (!t.crop.watered) continue;
      t.crop.growth += dt * (1 + weatherBonus);
      t.crop.stage = Math.min(3, Math.floor(t.crop.growth / 10));
    }
  }

  placeBlueprint(type, x, y, stock) {
    const def = DECOR_DEFS[type];
    if (!def) return { ok: false, msg: '未知建筑' };
    const t = this.tile(x, y);
    if (!t) return { ok: false, msg: '超出地图' };
    if (t.terrain !== TILE.GRASS || t.obj || t.building || t.crop) return { ok: false, msg: '这里已经有东西了' };
    if (this.streetTiles.some((s) => s.x === x && s.y === y)) return { ok: false, msg: '不能挡住主街' };
    for (const [k, v] of Object.entries(def.cost)) {
      if ((stock[k] || 0) < v) return { ok: false, msg: `资源不足：${k} 需要 ${v}` };
    }
    for (const [k, v] of Object.entries(def.cost)) stock[k] -= v;
    const bp = { id: uid('bp'), type, x, y, progress: 0, need: def.buildTicks, name: def.name };
    this.blueprints.push(bp);
    return { ok: true, bp };
  }

  buildProgress(bp, amount) {
    bp.progress += amount;
    if (bp.progress >= bp.need) {
      this.blueprints = this.blueprints.filter((b) => b.id !== bp.id);
      this.addDecor(bp.type, bp.x, bp.y);
      return true;
    }
    return false;
  }

  countDecor(type) { return this.decor.filter((d) => d.type === type).length; }

  beauty() {
    return this.countDecor('garden') * 2 + this.countDecor('fountain') * 5 + this.countDecor('lamp') * 1 + this.countDecor('bench') * 1;
  }
}

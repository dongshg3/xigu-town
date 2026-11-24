// store.js — 存档持久层（架构 §16 持久化适配）。
// 浏览器：优先 IndexedDB（idb-keyval，容量大、不阻塞主线程 JSON 之外的配额压力）；
// 失败或不支持（隐私模式、Node 冒烟环境）自动回落 localStorage，再不行回落内存 Map。
// 对外接口是 async，但行为与旧同步 localStorage 完全一致（同一份 JSON、同一个 key）。
import { get as idbGet, set as idbSet } from '../vendor/idb-keyval.js';

const mem = new Map(); // 最后的兜底（Node 冒烟/极端环境）

function hasIDB() {
  try { return typeof indexedDB !== 'undefined' && !!indexedDB; } catch { return false; }
}
function hasLS() {
  try {
    if (typeof localStorage === 'undefined') return false;
    localStorage.getItem('__probe__');
    return true;
  } catch { return false; }
}

// 返回实际使用的后端名，便于调试面板显示
export async function saveGame(key, data) {
  const json = JSON.stringify(data);
  if (hasIDB()) {
    try {
      await idbSet(key, json);
      return 'indexeddb';
    } catch { /* 掉进 localStorage */ }
  }
  if (hasLS()) {
    localStorage.setItem(key, json);
    return 'localstorage';
  }
  mem.set(key, json);
  return 'memory';
}

export async function loadGame(key) {
  if (hasIDB()) {
    try {
      const v = await idbGet(key);
      if (typeof v === 'string') return v;
      // IDB 里没有，再看 localStorage（兼容旧版本写下的存档）
    } catch { /* 继续往下 */ }
  }
  if (hasLS()) {
    const v = localStorage.getItem(key);
    if (v != null) return v;
  }
  return mem.has(key) ? mem.get(key) : null;
}

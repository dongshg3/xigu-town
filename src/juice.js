// 手感层：屏幕震动 + 弹出数字的曲线。刻意克制——只有真正发生事的时候才动。
let shake = 0;
let shakeDecay = 5.2;

export function kick(amount = 4) {
  shake = Math.min(9, shake + amount);
}

export function decay(dt) {
  if (shake <= 0) { shake = 0; return 0; }
  shake = Math.max(0, shake - dt * shakeDecay);
  return shake;
}

export function shakeOffset() {
  if (shake < 0.15) return { x: 0, y: 0 };
  const a = shake;
  return {
    x: (Math.random() * 2 - 1) * a,
    y: (Math.random() * 2 - 1) * a * 0.7,
  };
}

// 数字弹出：先冲过头再回落，比线性上浮更像"数出来"
export function popEase(t) {
  const p = Math.min(1, Math.max(0, t));
  return 1 - Math.pow(1 - p, 3);
}

export function popScale(t) {
  const p = Math.min(1, Math.max(0, t));
  if (p < 0.3) return 0.6 + (p / 0.3) * 0.6;
  const q = (p - 0.3) / 0.7;
  return 1.2 - q * 0.2;
}

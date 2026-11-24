// validate.js — ajv 封装（架构决策 D-2）。
// 全项目的 schema 校验只走这里：内容 CI（content-lint）与运行时共用同一份注册表。
// 用法：
//   import { defineSchema, validate } from './validate.js';
//   defineSchema('Event', {...});
//   const r = validate('Event', obj);   // r.ok / r.errors（带实例路径的中文可读信息）
import Ajv2020 from '../vendor/ajv.js';

const ajv = new Ajv2020({ allErrors: true, strict: false, useDefaults: true });

const registry = new Map();

export function defineSchema(name, schema) {
  registry.set(name, schema);
  ajv.removeSchema(name);
  ajv.addSchema({ $id: name, ...schema }, name);
}

export function hasSchema(name) { return registry.has(name); }

export function validate(name, obj) {
  if (!registry.has(name)) return { ok: false, errors: [`未注册的 schema：${name}`] };
  const ok = ajv.validate(name, obj);
  if (ok) return { ok: true, errors: [] };
  const errors = (ajv.errors || []).map((e) => {
    const path = e.instancePath || '(根)';
    return `${path} ${e.message}`;
  });
  return { ok: false, errors };
}

// 开发期哨兵：生产路径上别为每个对象都校验（性能），只在写入/读取边界校验。
export function assertValid(name, obj, where = '') {
  const r = validate(name, obj);
  if (!r.ok) {
    const msg = `[schema:${name}]${where ? ' @' + where : ''} ${r.errors.join('；')}`;
    throw new Error(msg);
  }
  return obj;
}

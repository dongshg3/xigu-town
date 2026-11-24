// vendor.mjs — 把运行时依赖打成单文件 ESM，vendor 进 src/vendor/。
// 这样开发期保持「node server.mjs 直跑、无构建步骤」，浏览器直接 import vendor 文件。
// 用法：npm run vendor（依赖升级后重跑并提交产物）
import { build } from 'esbuild';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const OUT = join(ROOT, 'src', 'vendor');
mkdirSync(OUT, { recursive: true });

const entries = [
  {
    out: 'ajv.js',
    // ajv v8 本体是 CJS；打 2020-12 draft 的默认实例
    contents: "import Ajv2020 from 'ajv/dist/2020.js'; export default Ajv2020; export { default as Ajv } from 'ajv/dist/2020.js';",
  },
  {
    out: 'idb-keyval.js',
    contents: "export * from 'idb-keyval';",
  },
];

for (const e of entries) {
  await build({
    stdin: { contents: e.contents, resolveDir: ROOT, loader: 'js' },
    bundle: true,
    format: 'esm',
    platform: 'browser',
    target: 'es2022',
    minify: true,
    outfile: join(OUT, e.out),
    logLevel: 'warning',
  });
  console.log('vendored', e.out);
}
console.log('done → src/vendor/');

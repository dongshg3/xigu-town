# 溪谷镇 · 构建简报（BUILD_BRIEF）

> 上游：[design/GAME_DESIGN.md](../design/GAME_DESIGN.md) · [design/ART_DIRECTION.md](../design/ART_DIRECTION.md)
> 本文件只回答一个问题：**这个候选是怎么跑起来的、验过什么、还有什么没验。**

## 1. targetFinish / buildStage / buildPath

| 字段 | 值 |
| --- | --- |
| targetFinish | 可玩的网页原型（playable web prototype），桌面 Chrome / Edge，1280×800 |
| buildStage | vertical slice：一座 40×30 的小镇、8 个自主居民、12 栋建筑、4 种装饰、4 种天气、昼夜、存档 |
| buildPath | 零依赖静态站点。原生 ES module + Canvas 2D，不打包、不编译、无 npm 依赖 |
| 目标运行时 | `node server.mjs` 本地静态服务（生产等价：任何静态托管，含 GitHub Pages 根目录） |
| 入口 | `index.html` → `./src/main.js` |
| 状态来源 | 逻辑层 `src/sim.js` 是唯一事实源；渲染层只读；UI 只读 + 发指令 |

## 2. 必须保真（不可在后续迭代中退化）

1. **模拟可在无浏览器环境裸跑**：`new Simulation(seed)` 在 Node 里能推进、能存档、能读档。`scripts/smoke.mjs` 依赖这一点。
2. **确定性**：同种子 + 同步数 = 同状态。任何 `Math.random()` 都视为缺陷。
3. **纯静态**：所有资源相对路径，无后端、无环境变量、无构建步骤。`.nojekyll` 就绪即可由 GitHub Pages 根目录托管。
4. **居民自主**：无玩家输入时，8 个人仍然吃饭、上工、社交、睡觉、谈恋爱式闲聊、传闲话、动工建造。
5. **玩家三种干预**：走过去说话（自动追人）、送礼、放图纸。三者都必须有可见后果。
6. **不把状态贴在头上**：见 ART_DIRECTION 第 2 节第 3 条。

## 3. 复现路径

```bash
# 1. 起服务（默认 5173）
node server.mjs
# 2. 打开
#    http://localhost:5173/?seed=20261123
# 3. 无头自检（不开浏览器，10 项）
npm run smoke
# 4. 证据化验收（自动起服务 + 无头 Chrome，六项）
npm run verify
```

`npm run verify` 会自动：起本地服务 → 起无头 Chrome（CDP）→ 跑六项 → 写 `qa/verification.json` 与 `qa/evidence/run.json` 并截图到 `qa/evidence/`。它不依赖任何 npm 包，只用 Node 内置 `WebSocket` 与 `fetch`。

## 4. toolchain 与命令

| 依赖 | 版本要求 | 用途 | 缺失时 |
| --- | --- | --- | --- |
| Node.js | ≥ 20（本机 v24.13.1） | 静态服务、自检、验收 | 无法运行，无降级 |
| Chrome 或 Edge | 任意近期版本 | `npm run verify` 的真实渲染 | 设 `CHROME_PATH` 指向可执行文件 |
| 浏览器 | 支持 ES module + Canvas 2D | 游玩 | 无降级（不提供 IE 兼容） |

npm 依赖：**零**。`package.json` 里没有 `dependencies`，也不需要 `npm install`。

## 5. verification

| 字段 | 值 |
| --- | --- |
| owner | lead（本仓库维护者） |
| command | `npm run verify`（六项证据）与 `npm run smoke`（逻辑回归） |
| evidence | `qa/verification.json`（唯一事实源，schemaVersion 3）+ `qa/evidence/run.json`（schemaVersion 1）+ `qa/evidence/*.png` |
| 最近一次结果 | 六项 PASS；smoke 10/10 |
| 验过什么 | 启动无异常、画面随时间变化、真实鼠标点击让人走动、空格真的暂停、480 刻内出现 5 类目标 13 类动作、放图纸后木匠建成、刷新回到初始态且能从存档恢复 |
| 没验什么 | 音效（无）、窄屏/触屏（未适配）、多周目长线平衡（只有探针数据）、Safari/Firefox（未跑） |

## 6. 目录结构

```
index.html          入口
styles.css          全部样式
server.mjs          零依赖静态服务（仅开发/本地）
src/core.js         时间、随机数、工具
src/data.js         性格/职业/建筑/居民/装饰/天气数据
src/world.js        地形生成、A* 寻路、作物、建造
src/agent.js        NPC 状态、需求、移动、动作结算
src/goals.js        目标打分与计划生成
src/dialogue.js     八人台词库与语气判定
src/social.js       关系三维、闲聊、秘密、玩家交谈/送礼
src/sim.js          模拟总装、日志、存档
src/render.js       Canvas 渲染
src/ui.js           右侧面板与弹窗
scripts/smoke.mjs   逻辑自检（10 项）
scripts/verify.mjs  浏览器证据化验收（六项）
qa/                 验收产物（verification.json / evidence/）
design/ docs/       设计与技术文档
```

## 7. limitations（诚实清单）

1. **没有声音**。没有环境音、没有动作音、没有音乐。
2. **只验了桌面 1280×800**。窄屏会挤压画布；触屏没有手势。
3. **长线平衡是探针，不是结论**。14 天三颗种子的数据在 README，但没有做 30 天以上的可玩性判断。
4. **台词是有限集**。每人 9 类情境、每类 2–3 句，长时间游玩会重复。
5. **没有战斗、没有联机、没有季节、没有玩家自宅**。见 ROADMAP 的"明确不做"。
6. **视觉是小尺寸矢量**。缩放到 0.79×，最小文字实际约 9.5px。
7. **验收用的是无头 Chrome**，与真实用户的可视窗口在 GPU 合成路径上不完全一致；这一点写在这里而不是假装等价。
# 溪谷镇 · 交接档案

> 给下一个接手的人（或 AI）。读完这份就能改代码、跑测试、推上线，不需要翻聊天记录。
>
> 最后更新：第 12 轮迭代进行中（深化架构迁移第 1 步：EventBus + ajv 校验 + 反馈登记 + IndexedDB 存档）
> 线上：https://dongshg3.github.io/xigu-town/

---

## 0. 三十秒速览

**是什么**：一个纯前端、零依赖的 2D 俯视生活模拟原型。玩家扮演「旅人」，在一个有 8 位居民的小镇里走动、聊天、送礼、建造、下令、当镇长。核心卖点不是种田，是 **NPC 自己过自己的日子**：有需求、有目标、有记忆、有关系、会学习、会说话（句子是现场生成的）、会犯罪、会恋爱生子、会被神迹影响。

**技术形态**：原生 ES module + Canvas 2D + 一个 40 行的 Node 静态服务器。没有打包、没有 npm 依赖、没有后端、没有数据库。存档在 `localStorage`。

**当前状态**：

```
npm run smoke   → 28/28
npm run verify  → 6/6 PASS（launch / render / input / coreLoop / outcome / restart）
线上            → 200
```

**怎么跑**：

```bash
node server.mjs          # 或 npm run dev，默认 http://localhost:5173
npm run smoke            # 无头跑模拟，28 项断言
npm run verify           # 起 Chrome 跑真实浏览器，六项检查 + 截图证据
```

需要 Node ≥ 20（用了内置 `WebSocket`、`node:test` 风格的断言是手写的，但 `scripts/verify.mjs` 依赖 Node 22+ 的全局 WebSocket）。本机验证用 Node v24.13.1 + Chrome 157。

---

## 1. 目录地图

| 路径 | 行数 | 职责 |
| --- | --- | --- |
| `index.html` | 83 | 骨架：顶栏、画布、右侧面板、底部操作条、建造托盘、指令菜单、弹窗 |
| `styles.css` | 445 | 羊皮纸主题；唯一的样式表 |
| `server.mjs` | 38 | 静态服务器，`PORT` 默认 5173 |
| `src/core.js` | 78 | `TICK_MINUTES=5`、`DAY_START=360`、`RNG`、`clockOf`、`clamp/lerp/dist`、`hash2` |
| `src/data.js` | 251 | 全部静态数据：18 个天性、8 个职业、12 栋建筑、8 个居民、道具、天气、性别年龄、性格 bias |
| `src/world.js` | 369 | 40×30 地图、建筑、作物、树、装饰、A* 寻路、仓库 |
| `src/agent.js` | 326 | NPC 内核（注册表后）：计划执行、指令；数据层在 character/，效果结算在 actions/ |
| `src/actions/registry.js` | 307 | **动作注册表**：20 个动作的展示名与效果结算，apply(npc, sim, act) 分发 |
| `src/character/needs.js` | 44 | **需求组件**：五项需求、衰减、normalize、sum |
| `src/character/memory.js` | 52 | **记忆库**：去重强化、衰减遗忘、裁剪、心情贡献 |
| `src/character/rels.js` | 18 | **关系簿**：按需建交、读档脏数据兜底 |
| `src/character/mood.js` | 44 | **情绪计算**：需求+特质+底色+街景+记忆 → mood（PAD 预留位） |
| `src/character/traits.js` | 28 | **特质合成**：mergeTraits（乘性键连乘，其余累加） |
| `src/goals.js` | 274 | 目标定义与打分、计划生成（吃/睡/工作/社交/放松/闲逛/上学） |
| `src/social.js` | 177 | 关系演化、闲聊、玩家交谈/送礼、秘密吐露 |
| `src/society.js` | 214 | 健康、看病、上学、恋爱结婚生子、偷窃与拘捕 |
| `src/economy.js` | 145 | 市集定价、买卖、委托、税与工资、酒馆吃饭、打零工 |
| `src/politics.js` | 140 | 四派立场、议会、选举、提案、政策落地 |
| `src/territory.js` | 91 | 四块镇外荒地、购地、盖新居、移民生成 |
| `src/god.js` | 99 | 信仰点数、五项神迹（祝福/诅咒/启示/重塑/治愈） |
| `src/development.js` | 116 | 六系统等级、里程碑、称号、镇子底子分 |
| `src/influence.js` | 86 | 居民互相影响：传艺、结怨、探病、情绪传染 |
| `src/language.js` | 403 | **句子生成器**：事实抽取 → 意图选择 → 句式实现 → 去重 |
| `src/learning.js` | 107 | **在线学习**：说话策略、话题权重、目标习惯、情绪底色 |
| `src/understanding.js` | 156 | 自由输入解析（话题/意图/情绪）与回应 |
| `src/llm.js` | 79 | 可选模型层：OpenAI 兼容端点，只做改写，失败回落本地 |
| `src/orders.js` | 123 | 六种指令：上工/休息/聊聊/学堂/市集/巡查 |
| `src/sim.js` | 556 | 世界总装：tick 循环、日志、玩家、存档、日结 |
| `src/render.js` | 717 | 渲染：相机、地形、建筑、人物、气泡、夜色、天气、悬停卡 |
| `src/art.js` | 490 | 像素美术语言：调色板、地块、树、作物、Q 版小人、房子 |
| `src/audio.js` | 77 | WebAudio 合成音效（无音频文件） |
| `src/juice.js` | 29 | 屏幕震动与缓动 |
| `src/ui.js` | 394 | 右侧面板：世界/镇务/居民/日志四页，居民详情、对话弹窗 |
| `src/panels.js` | 71 | 镇务页 HTML 生成（纯函数） |
| `src/main.js` | 629 | 装配：主循环、输入、相机、建造、指令、存档、音频触发 |
| `src/core/validate.js` | 40 | **ajv 封装**：`defineSchema/validate/assertValid`，内容 CI 与运行时共用 |
| `src/core/eventBus.js` | 92 | **事件总线**：emit/subscribe/flush 两相派发、限深 3 层、replay 环形 5000、因果链 |
| `src/data/present/feedback.js` | 92 | **反馈登记表**：事件 kind → 通知/标记/动画/音效等通道；lint 强制重要事件 ≥2 通道 |
| `src/persist/store.js` | 55 | **存档持久层**：IndexedDB 优先，localStorage/内存兜底，浏览器与 Node 通吃 |
| `src/vendor/` | — | esbuild 从 node_modules 打出的浏览器可用包（ajv、idb-keyval），`npm run vendor` 复现 |
| `scripts/vendor.mjs` | — | vendor 打包脚本（esbuild stdin 方式） |
| `scripts/smoke.mjs` | — | 36 项无头断言 |
| `scripts/verify.mjs` | — | CDP 驱动真实浏览器，写 `qa/` |
| `sprites.html` | 54 | 开发用样张页：四向 × 四帧小人 |
| `design/` | — | GAME_DESIGN / ART_DIRECTION |
| `docs/` | — | NPC_AI_ARCHITECTURE / ROADMAP / SKILLS_APPLIED / **DEEP_SIM_ARCHITECTURE**（第 12 轮：深化架构目标与路线图） |
| `build/BUILD_BRIEF.md` | 54 | 构建契约（targetFinish / 复现路径 / limitations） |
| `qa/` | — | verification.json（唯一事实源）+ evidence/run.json + 截图 |

历史设计文档仍有效，但**代码是唯一真相**。文档里写的数值可能已经调过。

---

## 2. 架构与数据流

```
main.js  ── rAF ──►  sim.step()  ──►  NPC.update()  ──►  choosePlan() → 步骤执行 → applyEffect()
   │                    │                    │
   │                    ├─ dayRollover()      ├─ society / influence / development / god
   │                    ├─ world.tickCrops()
   │                    └─ maybeGreetPlayer()
   └── render.render(sim, state)  ◄── 每帧（相机、人物、气泡）
       ui.update(sim)             ◄── 每 240ms 重建面板
```

**确定性**：所有随机都走 `sim.rng`（`RNG` 类，mulberry32 风格）。**不要用 `Math.random()`**——`smoke` 里有两项断言靠同种子复现（政策权重、三日长跑）。种子的来源是 URL `?seed=`，默认按日期。

**时间**：1 tick = 5 游戏分钟；`clockOf(tick)` 给出 `{day,hour,minute,label,isNight,...}`。一天 288 tick。`TPS_BASE=1.6`，速度档 1/2/4/8 只是倍率。

**一 tick 的顺序**（`sim.step`）：

1. `tick++`，必要时 `dayRollover()`（换日 → 天气 → 世界日更 → 税/工资 → 选举 → 移民）
2. `world.tickCrops()`
3. 每个 NPC `update()`：需求衰减 → 睡眠恢复 → 若在睡觉则绕过 → 空计划就选 → 执行当前步骤（走路或动作）
4. `stepPlayer()`：玩家沿路径走
5. `maybeGreetPlayer()`：附近的人可能主动打招呼
6. 清理过期气泡、特效、环境句

**每 20 刻** `seekCare`（病人去诊所），**每 10 刻** `jailRelease`（刑满释放）。

---

## 3. 世界与数据（`world.js` / `data.js`）

**地图**：40×30 格，`TS=26` 像素/格，画布 1040×780。`tiles[y*w+x] = {terrain, building, obj, crop, regrow, variant}`。

- `TILE`：GRASS / PATH / WATER / SOIL / FLOOR / STUMP / SAND
- 建筑 12 栋（8 个民居 + 酒馆/诊所/画室/镇公所/工坊），每栋有 `door`（门格）与 `spot`（进屋后的站位）
- 农田 13..18 × 21..24；池塘在左上；主街 y=15/16
- `world.stock = {wood, stone, food, seeds, coins}` 是全镇仓库，玩家与 NPC 共用

**寻路**：`findPath(x0,y0,x1,y1)` 四方向 A*，八方向会被建筑卡住。走不通时 `nearestWalkable`。

**数据表**（改这些不用碰逻辑）：

| 表 | 内容 |
| --- | --- |
| `TRAITS` | 18 个天性，带 `mods`（乘区 / 加区） |
| `JOBS` | 8 个职业，`windows` 是工作时段，`label` 是中文名（**不是 `name`**） |
| `PROFILES` | 8 个居民：bio / desire / fear / secret / values / skills / home / work / traits |
| `DECOR_DEFS` | 长椅、花圃、喷泉、路灯、**新居**（`house:true`） |
| `WEATHERS` | sunny / cloud / rain / wind，带中文标签 |
| `SEX` / `AGE` / `NAMES_F` / `NAMES_M` | 性别、年龄、移民取名池 |
| `BIAS` | 每人的说话倾向偏好（喂给生成器） |

---

## 4. NPC 内核（`agent.js`）

```js
npc = {
  needs: { hunger, energy, social, fun, purpose },   // 0..100
  coins, inventory: { food, seeds }, skills,
  rels: Map<id, {affinity, trust, familiarity}>,
  memory: [{ text, tick, strength, valence, topic }],
  beliefs: [{ text, from, secret }],                  // 听来的事
  plan: [step], stepIndex, goalId, goalLabel, act,
  x, y, path, dir,                                    // dir: right/left/up/down
  speech, nextGreetAt,
  mind,                                               // learning.js 的学习状态
  history: [{ text, t, kind }],                       // 个人史，上限 60
  order,                                              // 玩家下的指令
  sex, age, health, education, partner, children, sick, jailedUntil,
}
```

**心情**：

```
基础 = 需求加权平均
     + 天性加区
     + clamp((街区美观 - 6) * 0.9, -8, 8)
     + mind.moodBase                                  // 长期情绪底色
```

**计划永远是数组**。这是本项目最容易踩的坑，见 §14。

**步骤**：`{ kind:'goto', x, y }` 或 `{ kind:'act', id, dur, target? }`。`startAct` 做距离校验（聊天 2.6 格），`finishAct` 进 `applyEffect(act)` 的大 switch。

**`applyEffect` 的动作表**：sleep / eat / buyMeal / forage / work / harvest / water / plant / chop / build / chat / relax / fish / paint / treat / serve / trade / watch / look / study / patrol。

> 设计约定：**内容约束放在决策层，结算层宽松**。例如「酒馆没食材」由 `goals` 决定不选，而不是在 `serve` 里报错。

**个人史**：`note(text, kind)`，同文本 120 刻内合并，`kind ∈ act/say/event/crime/god/order/learn`。

---

## 5. 决策（`goals.js`）

```js
GOALS = [eat, sleep, work, social, relax, wander, study]
pickPlan(npc, sim) → 按 score 排序取前 5，逐个尝试 plan()，第一个返回数组的胜出
```

- `score` = 需求缺口 × 权重 + 时段 + 职业 + 天性 + `habitBonus(npc, goalId)`（学出来的）
- `plan()` 返回**步骤数组**，或 `null`（表示现在做不了）
- `study` 的 plan 来自 `society.studyPlan()`，注意它返回 `{goalId,label,steps}`，必须取 `.steps`
- 指令优先：`agent.tickUpdate` 在选计划之前检查 `this.order`，走 `orders.orderPlan()`

---

## 6. 说话：生成而不是拼装

三层，缺一不可：

**`language.js`** — 现场造句

```
gatherFacts(npc, sim)   8–12 条真实事实（天气、时辰、库存、图纸、需求、关系、记忆、传闻）
chooseIntent(...)       complain / share / ask / work / warm / observe 加权
VOICE[id].frames        每人每个意图 2–3 个句式，带 {fact} {feel} {you} 槽位
compose(npc, sim, mode, opts)
                        mode: reply / greet / follow
                        opts.intent / opts.topic 可以强制指路（自由输入靠这个接话）
```

**去重**：`similarity()` 用二元组 Jaccard；`compose` 枚举所有「事实 × 句式 × 语气」组合，取与 `npc._said`（最近 16 句）最不相似的那条。曾有 `Math.random` 版本，已被删除——**加新句式时不要引入非确定性**。

**`understanding.js`** — 自由输入

```
parseUtterance(raw, npcs) → { text, topic, intent, sentiment, named }
hearUtterance(npc, sim, raw)
    改好感/信任/熟识 → 写带 topic 的记忆 → noteTopic/rewardTalk
    → compose(npc, sim, 'reply', { intent, topic }) → 45% 回引旧话
```

九个话题：money / work / weather / food / people / love / politics / land / self。

**`llm.js`** — 可选模型层

面板「世界 → 语言模型（可选）」填 endpoint / model / key，存在 `localStorage['xigu-llm-v1']`。它只改写本地那句，超时 7s、非 200、空串、超 60 字、出现「作为 AI / 抱歉 / 无法」一律丢弃，保留本地版本。**没有 key 时游戏功能不缺一块**。

---

## 7. 学习（`learning.js`）

每个 NPC 一个 `mind`：

| 字段 | 学什么 | 影响 |
| --- | --- | --- |
| `policy{complain,share,ask,warm}` | 哪类话能换好感 | 意图权重 |
| `topics{}` | 哪个话题对方有反应 | 事实抽样权重 |
| `habits{}` + `habitBase{}` | 哪个目标**超出预期**地解决需求 | 目标打分 ±4 |
| `moodBase` | 长期过得好不好 | 心情底色 ±7 |
| `stats` / `log` | 统计与人类可读的学习记录 | 居民页「脑内」 |

关键：`noteHabit` 学的是**意外**（gain − 基线）的 EMA，不是收益本身。直接学收益会让「吃饭」永远最划算，木匠再也不去工地——这个 bug 被 smoke 抓到过。

---

## 8. 社会（`social.js` / `society.js`）

- 关系三维：`affinity`（好感）、`trust`（信任）、`familiarity`（熟识）
- `chatter()`：日常闲聊，影响好感/信任/熟识，可能争吵或深谈，会传播第三方传闻
- 秘密：`trust ≥ 42` 时以 `0.14 + trust/700` 的概率吐露；玩家要 `familiarity ≥ 3`
- 健康：每天基础 −0.35，饿/累/淋雨加速；健康 < 38 生病，> 62 痊愈；病人会自动去诊所
- 学堂：`education < 80` 且有学堂时会出现 `study` 目标；`education` 影响称号与传艺
- 恋爱：异性、成年、好感 ≥ 58–62，每日 `5% + 8%×好感`；成家后每日 1.2% 生子，最多 2 个
- 犯罪：`hunger<30` 或（`coins<12` 且 `mood<50`），概率 0.02 / 0.0002，冷却 1200–3600 刻；被石头抓到概率 0.55（12 格内、醒着），罚款进公账 + 拘留

---

## 9. 经济 / 政治 / 版图

**价格**：

```
price = base × clamp(1.45 - stock/42, 0.62, 1.6) × clamp(0.9 + purse/900, 0.85, 1.25)
base: wood 5, stone 7, food 4, seeds 6
```

**公账的三条收入**：税、罚款、委托溢价；**三条支出**：工资（底薪 + 技能×0.6）、补贴、工程。

**政治**：四派（福利/减税/建设/守成），`stanceOf` 按职业与天性分派。每 7 天选举，`score = 声望 + rng±4 + 票×12 + 连任+4`，前 3 名进议会、第 1 名当镇长，并把税率/建设比/是否开放土地写进 `town`。玩家声望 ≥ 28 可提案，通过率 `0.28 + 声望/220 + 盟友×0.09`（夹 0.2–0.86）。

**版图**：四块 3×3 荒地，`claimCost = 120 + 45×已占`；购地后放「新居」图纸，木匠盖好 → `pendingSettlers++` → 次日生成一个移民 NPC（新名字、职业、性格、家）。

---

## 10. 神迹 / 等级 / 互相影响

- **信仰**：`faith.points`，每日结算（基础 + 平均心情 + 美观 + 系统等级）
- **神迹**：祝福 8 / 诅咒 10 / 启示 6 / 重塑 24 / 治愈 12。重塑会重算天性（`mergeTraits`）
- **六系统等级**：市集 / 学堂 / 治安 / 农事 / 镇政 / 家宅，阈值 `[0,55,130,240,400]`，升级写里程碑并给信仰
- **称号**：在押 / 病中 / 惯偷 / 状元 / 读书人 / 一族之长 / 有家室的人 / 富户 / 一把好手 / 孩子
- **互相影响**：每日一次——传艺（高学识教低学识）、结怨（同行 + 双方心情差）、探病、情绪传染（`moodBase` 向全镇均值收敛 0.18）

---

## 11. 界面与输入（`main.js` / `ui.js` / `panels.js`）

**右侧面板**四页：世界 / 镇务 / 居民 / 日志。`ui.update(sim)` 每 240ms 整块重建（保留滚动位置）。所有按钮走事件委托：`data-act` / `data-tab` / `data-build` / `data-order` / `data-god`。

**底部操作条**：`whoChip`（姓名·职业·目标·心情）+ 建造 / 交谈 / 送礼 / 指令 / 跟随 / − / + / 复位。

**键盘**：

| 键 | 作用 |
| --- | --- |
| `Space` | 暂停 / 继续 |
| `1 2 4 8` | 速度 |
| `B` `T` `G` `O` `F` | 建造 / 交谈 / 送礼 / 指令 / 跟随 |
| `WASD` / 方向键 | 平移相机 |
| `+` `-` | 缩放 |
| `Esc` | 关弹窗 → 取消放置 → 取消选中 |

**相机**：`renderer.cam = {x, y, zoom}`，zoom 1–2.6。世界层 `translate(-cam.x*zoom) → scale(zoom)`；夜色和遮罩也在相机内，避免悬停卡被压暗。**所有屏幕→世界坐标必须走 `renderer.pickTile()`**，不要再自己按 1040/780 换算。

**跟随**：`followId` 每帧 `centerOn(n.x, n.y)`。

---

## 12. 渲染与美术

- `TS = 26`；`art.js` 提供调色板与图元，`render.js` 负责编排
- 画法顺序：地形 → 地面物件 → 图纸 → 建筑（含屋顶带、窗、门、家具、木牌）→ 作物 → 特效 → NPC（含气泡、名牌）→ 玩家 → 天气 → 夜色 → 悬停/放置预览
- 小人：`art.chibi(ctx, px, py, {ts, cloth, skin, hair, hat, accent, facing, frame, pose})`，四向 × 走/站/坐
- 气泡：按字符测量换行，最多 3 行，宽度夹 84–138；同格多人按 `hash(id)%3` 错开；被悬停者不画气泡（卡片接管）
- 夜景：19–23 渐暗、23–5 最暗，路灯与窗户有暖光晕

改美术时看 `design/ART_DIRECTION.md` 的「第七轮落地」一节，里面有明确规则（2px 像素块、2px 墨线、暖色六色、屋顶 55%、Q 版规格）。

---

## 13. 存档

```js
sim.toJSON()      // version: 1
sim.restore(data) // 必须是同一个实例：new Simulation(seed) 之后 restore
```

`localStorage['xigu-town-save-v1']`。存档包含：tick、天气、tiles 的 obj/crop/regrow、建筑、图纸、装饰、仓库、每个 NPC 的完整状态（含 `mind`、`history`、`_said`、关系）、玩家（位置/硬币/背包）、`town`、`plots`、`houses`、`pendingSettlers`、日志（截 160 条）。

**恢复顺序不能改**：先 `plots`/`houses` 重建动态建筑 → 再**补建**存档里多出来的人（`new NPC(...)`）→ 再逐字段写入。否则新生儿童会用默认值（曾报 `hunger drifted for kid1`）。

---

## 14. 测试与验收

**`npm run smoke`（28 项，无头，约 3 秒）**

覆盖：同种子确定性、7 天长跑数值不变量（需求 0–100、无 NaN）、目标/动作覆盖、蓝图由木匠建成、记忆与关系分化、存档往返、玩家交谈/送礼/秘密、生成式台词去重率（40 次交谈 ≥ 0.6 不同）、在线学习（策略/话题/基线在变）、三日长跑确定性、双人对话不复读、六种指令、健康与学堂、恋爱与家庭、盗窃与拘捕、个人史、五项神迹、六系统等级、互相影响与称号。

**`npm run verify`（6 项，真实 Chrome + CDP）**

`launch / render / input / coreLoop / outcome / restart`，产出：

- `qa/verification.json` — `schemaVersion:3`，`status` 只允许 `PASS/FAIL/NOT_RUN`，`checks` 必须恰好这六个键
- `qa/evidence/run.json` — 环境、7 条输入轨迹、六段观测、截图路径

改完代码**两个都跑**，别只跑 smoke：`this.roundRect` 那个 bug 就是 smoke 全绿、浏览器一片死。

---

## 15. 部署

- 仓库：`https://github.com/dongshg3/xigu-town`（public）
- Pages：`main` 分支、根目录、`legacy` 构建，`.nojekyll` 已在根目录
- 流程：`git add -A && git commit && git push origin main` → 等 30–60 秒 → 打开 `https://dongshg3.github.io/xigu-town/`
- 缓存：Pages 有 CDN 缓存，验证新代码时加查询串，例如 `?v=104`，或直接 `curl /src/main.js?v=x | grep 新函数名`
- 凭据在本机 `git credential`（Windows Credential Manager），**不要把 token 写进任何文件**

---

## 16. 已知缺陷（按优先级）

1. ~~落图纸没有红绿网格预览~~（第 11 轮已做：`world.canPlace` 统一前置检查，3×3 邻格红绿底 + 悬停标签给出具体原因）
2. ~~没有新手引导~~（第 11 轮已做：三步引导条，`localStorage['xigu-onboard-v1']` 记忆，可跳过）
3. ~~指令菜单不能选对象~~（第 11 轮已做：「去聊聊」二级选人，带关系标签与距离）
4. ~~建造托盘是方块按钮~~（第 11 轮已做：卡片式——图标 + 描述 + 材料缺料标红 + 工期）
5. **窄屏只做了基本适配**：900px 以下收了侧栏与快捷键提示，但更小的屏（平板竖屏）没管。
6. **无战斗、无联机、无 3D**——这是明确的产品边界，不是遗漏。
7. **动画只有走/站/坐**，没有吃饭、挥手、做买卖的动作帧。
8. **长线平衡是探针数据**，不是被验证的结论（7 天在 smoke 里，20 天只手动跑过）。

### 第 11 轮新增的系统：季节

- 7 天一个季节，28 天一轮；`clockOf(tick).season / seasonLabel`，只由天数推导，不进存档
- `data.js` 的 `SEASONS`：`crop` 长势倍率（春 1.25 / 夏 1.0 / 秋 0.8 / 冬 0.35）+ 次日天气抽签权重
- `art.js` 的 `GRASS_SEASON` / `TREE_SEASON` 两套四季调色板，`groundTile` / `tree` 末位参数是季节
- 换季当天写一条日志，全员记一条弱记忆

---

## 17. 踩过的坑（照着躲）

| 坑 | 症状 | 正确做法 |
| --- | --- | --- |
| CSS 写 `//` 注释 | 紧跟的整条规则被丢弃（操作条变 `display:block`） | 只用 `/* */` |
| 把 `plan` 当对象 | `plan.length` 为 undefined，该目标永远不被选 | `plan` 一律数组；`studyPlan()` 返回对象时要取 `.steps` |
| 存档先写状态后建人 | 新生儿属性漂移 | 先补建 NPC，再写字段 |
| 自己按画布尺寸换算点击 | 缩放后落点错格 | 永远用 `renderer.pickTile()` |
| 在渲染里用实例方法 | `this.roundRect is not a function`，rAF 死掉、画面冻结 | 模块级函数要显式传 `ctx` |
| PowerShell 直接读 UTF-8 | 中文显示成乱码（文件其实没坏） | 用 `node -e` 或 `[IO.File]::ReadAllText(p, UTF8)` 检查；写文件用 `WriteAllText + UTF8Encoding($false)` |
| `Add-Content -Encoding utf8` | 文件中间插入 BOM | 追加后用 node 去掉 `\uFEFF` |
| git 的 stderr | PowerShell 把进度信息当错误抛出（`exit code 1`） | 看最后一行是否 `main -> main`，别被红色骗了 |
| 点击落在格子边界 | `floor(ty)` 落到上一格，报「这里已经有东西了」 | 用 `(tx+0.5, ty+0.5)` |
| 用 `Math.random()` | 同种子跑出不同结果，smoke 的确定性断言挂掉 | 一律 `sim.rng` |
| 日志不折叠 | 酒馆缺货时每 tick 刷一条 | `sim.log()` 已按文本 + 60 刻合并，别绕开它 |

---

## 18. 交接后第一批任务（含验收）

**A. 落图纸网格预览** ✅ 第 11 轮完成（canPlace 抽离、3×3 预览、原因 toast、smoke 第 29 项）

**B. 五分钟新手引导** ✅ 第 11 轮完成（三步引导条、可跳过、localStorage 记忆）

**C. 指令选对象** ✅ 第 11 轮完成（二级选人，`issueOrder(sim, npcId, 'talk', targetId)`，smoke 第 31 项）

**D. 系统加深**（按优先级）

1. ~~季节~~ ✅ 第 11 轮完成（四季调色板、长势倍率、天气权重；smoke 第 30 项）
2. **商路**：外来商队每 N 天进城，带来稀缺物资、抬高价格、发布大额委托；验收：价格曲线与委托日志
3. **教育分层**：学堂按 `education` 分班，高学识者可当先生（`teach` 动作），影响全镇学识增速
4. **犯罪链**：惯偷 → 销赃 → 巡逻加强 → 监狱容量；验收：20 天探针里出现完整链条

---

## 19. 约定

- **中文 UI，英文标识符**；注释用中文，写「为什么」而不是「是什么」
- 不引入构建工具、不引入 npm 依赖——保持「双击就能跑」
- 每次改动：`node --check` → `npm run smoke` → 需要时 `npm run verify` → 截图 → commit → push
- 提交信息：一句话说清「改了什么 + 修了什么」，例如 `可玩性重做：相机缩放平移、底部操作条…`
- 美术改动同步 `design/ART_DIRECTION.md`；系统改动同步 `docs/NPC_AI_ARCHITECTURE.md`

---

## 20. 一句话交接

> 这是一个「NPC 有自己的生活」的模拟器，不是种田游戏。玩家的乐趣来自**观察与干预**：看他们怎么过日子，然后决定要不要伸手。改代码时守住这条——任何让你更想「盯着数字」而不是「盯着人」的改动，都值得先怀疑一下。

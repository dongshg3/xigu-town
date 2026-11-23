# 12 个游戏开发 skill 的落地对照

你给的那张榜单里的 12 个 skill，本地环境里 **一个都没有装**——`E:\DSH\profiles\desktop\node_modules\dsh-agnes-studio\vendor\oh-story\novel-to-game\skills` 下只有 5 个 `game-*`（concept / world-design / art-direction / build / qa），我前几轮一直在用它们。所以这份文档不是"我读了那 12 个 SKILL.md"，而是**把这 12 个能力域逐个映射到溪谷镇的具体实现**，说明做了什么、代码在哪、哪些明确不做。

## 对照表

| # | Skill | 落到哪里 | 状态 |
| --- | --- | --- | --- |
| 01 | higgsfield-game-generation（AI 生成玩法/素材） | `src/llm.js` 可选模型层 + 本地生成器 `src/language.js` | 已用 |
| 02 | game-engine（引擎/架构思路） | 分离的 sim / render / ui 三层 + 固定步长 tick | 已用 |
| 03 | multiplayer-game（多人联机） | — | 不做（单机模拟） |
| 04 | game-developer（通用开发） | 整个工程：零依赖 ES module + 静态托管 | 已用 |
| 05 | game-ui-design（UI 设计） | 羊皮纸面板、木框画布、木牌名牌 | 已用 |
| 06 | game-design-theory（设计理论） | `design/GAME_DESIGN.md` 的玩家承诺与三级循环 | 已用 |
| 07 | game-feel（手感/反馈） | `src/juice.js` 震动 + `src/audio.js` 合成音效 | 本轮新增 |
| 08 | game-ui-ux（交互体验） | 悬停卡片、键盘快捷键、日志折叠、滚动位置记忆 | 已用 |
| 09 | threejs-game-ui-designer（3D UI） | — | 不做（2D 像素） |
| 10 | develop-web-game（Web 游戏） | Canvas 2D + rAF 固定步长 + localStorage 存档 | 已用 |
| 11 | pixel-art-game-assets（像素素材） | `src/art.js` 程序化绘制 + `sprites.html` 样张页 | 已用 |
| 12 | procedural-level-design（程序化关卡） | `world.js` 以种子生成池塘/树/装饰；地形按邻居拼接 | 部分 |

## 07 game-feel：这轮真正新写的东西

### 反馈的三条原则

1. **只有真发生事才动**：没有人点按钮就抖。震动只给四类事件——建筑落成、移民搬入、盗窃发生、神迹。
2. **幅度小、衰减快**：`kick(5)` 在 5.2/s 的衰减下 1 秒内归零，抖 3–5px。开罗那种"每一下都弹"的密度，靠的是频率不是幅度。
3. **世界抖，UI 不抖**：`render()` 里只对世界层 `translate`，夜色与遮罩在 `restore()` 之后画，所以画面晃的时候顶栏和侧栏是稳的。

```js
// src/juice.js
export function kick(amount = 4) { shake = Math.min(9, shake + amount); }
export function decay(dt) { shake = Math.max(0, shake - dt * shakeDecay); return shake; }
```

### 音效是算出来的，不是文件

`src/audio.js` 里没有任何 mp3/ogg，全部是 WebAudio 现场合成：

| 事件 | 合成方式 |
| --- | --- |
| 点击 | 520→660Hz 方波 60ms |
| 铜钱 | 880 + 1320Hz 两声方波，间隔 50ms |
| 说话 | 620→720Hz 三角波 + 760→700Hz 尾音 |
| 建成 | 白噪声 180ms（低通 1200Hz）+ 180→90Hz 正弦 |
| 报警 | 340→300Hz 锯齿波两声 |
| 升级 | 660/880/1100/1320 四连音 |

主音量 0.16，包络 8ms 起音 + 指数衰减，所以是"嗒/叮"而不是"哔——"。顶栏有 `有声/静音` 开关，状态存 localStorage；第一次 pointerdown 才创建 AudioContext（浏览器策略）。

### 为什么不用素材包

开罗的音效是采样，但我们没有授权素材；合成音在 20KB 代码内可控、可调、不会因为加载失败没声音。这是取舍，不是等价替代。

## 11 pixel-art-game-assets：程序化像素而不是贴图

`src/art.js` 里每个物件都是函数：`groundTile / tree / crop / chibi / house`。好处是全套尺寸随 `ts` 缩放（`u(v) = round(v * ts/26)`），改一格大小不用重画。`sprites.html` 是开发样张页，一屏看 4 方向 × 4 帧 + 坐/站，改完立刻肉眼验。

## 12 procedural-level-design：做到哪一步

- **已做**：地图以种子生成——池塘位置、树丛分布、散石与花、建筑占位；地形按 4 邻居拼接（草地/路/水/土的过渡）；每格哈希决定草簇与碎石，避免机械重复。
- **没做**：整张地图的程序化布局（建筑仍是固定 12 栋 + 4 块待开发地），没有房间/迷宫式关卡生成。这个游戏的重点是"人"不是"关卡"，程序化只服务于"每一局看起来不完全一样"。

## 03 与 09 为什么不做

- **multiplayer**：核心卖点是"NPC 有自己的生活"，联机不增加这个卖点，但会把确定性模拟、存档、同步全部推翻。要做也是另一个项目。
- **three.js**：2D 像素 + 俯视剖切是美术方向的一部分（`design/ART_DIRECTION.md`），换 3D 等于重画全部资产。

## 想继续的话，下一步最值的是

1. **01 的深水区**：把 `llm.js` 从"改写一句话"扩到"生成今日计划"——让 NPC 早上用模型排一天，而不是从 7 个目标里打分。
2. **07 的深水区**：给建造加"施工中"的持续粒子与锤击音，让 26 刻的建造过程有存在感。
3. **12 的深水区**：开局生成 3 种村落布局（沿河 / 十字街 / 环湖），种子决定。

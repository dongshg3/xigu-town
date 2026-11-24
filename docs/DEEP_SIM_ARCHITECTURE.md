# 溪谷镇 · 深度模拟架构方案（DEEP_SIM_ARCHITECTURE）

> 版本：v1.0 · 2026-11-24
> 地位：本文件是「高智能角色系统 + 表现层」的目标架构与落地路线图。代码仍是唯一真相；
> 本文件描述的是代码要长成什么样，以及从现状（第 11 轮）到目标的迁移路径。
> 读者设定：接手开发的工程师 / AI。所有接口都给出文件落点，可以直接开写。

---

## 0. 澄清问题与假设

**关键澄清问题**（最多 5 个；答案会影响取舍，但不阻塞，下面按假设推进）：

1. **规模目标**：200 NPC 是线上常态目标，还是压力测试上限？（影响 LOD 与分块加载的投入顺序）
2. **技术边界**：是否坚持「纯前端、零 npm 依赖、双击即跑」？（影响能否引入 WASM 寻路/物理、IndexedDB 封装库）
3. **LLM 资源**：是否已有可用端点与预算？允许云调用还是必须本地小模型？
4. **「多人同步互动」**：指同屏多个 NPC 的协作/同步互动（如合奏、婚礼、围殴），还是联机多人？
5. **画面层**：维持 Canvas 2D 像素语言，还是允许 WebGL / 骨骼动画运行时？

**工作假设**（在得到答案前按此设计；每条都在后文标注影响面）：

- A1（对应 2）：坚持纯前端零依赖。所有系统用原生 ES module 实现；存档从 `localStorage` 升级为「localStorage 自动存 + 可导出/导入 JSON 文件」。→ 影响：全部数据结构必须可 JSON 序列化（Map 用数组包装，函数不进状态）。
- A2（对应 1）：以 **200 NPC 为 LOD 设计上限**，常态 50，MVP 10。性能预算按 200 给。
- A3（对应 3）：LLM 可选，延续 `llm.js` 的「本地生成兜底、模型只做润色」原则；离线批量扩写走脚本，产物入库人工审核，运行时零依赖。
- A4（对应 4）：「多人同步互动」按**多 NPC 同场景同步互动**设计（InteractionGroup），不做联机。
- A5（对应 5）：维持 Canvas 2D 像素风；动画用「状态机 + 事件驱动插槽」，不引入骨骼运行时，但动画状态定义数据化，未来可平移到骨骼。

---

## 1. 架构总览

### 1.1 一张图

```
┌──────────────────────────── 模拟层（纯逻辑，无 DOM/Canvas）────────────────────────────┐
│                                                                                      │
│  WorldState（tiles/buildings/zones）   SocialState（rels/factions/cases/households）  │
│           ▲                                  ▲                                       │
│           │ 写（只能经 Action 结算）           │                                        │
│  ┌────────┴──────────────────────────────────┴───────┐                               │
│  │                 Simulation (sim.js)               │                               │
│  │  tickScheduler → systems[] → eventBus.flush()     │                               │
│  └────────┬──────────────────────────────────┬───────┘                               │
│           │                                  │                                        │
│   PerceptionSystem                  GoalPlanningSystem                                 │
│   （感知→记忆写入）        （效用评分→HTN 展开→BT 执行）                                │
│           │                                  │                                        │
│  ┌────────┴──────────────────────────────────┴───────┐                               │
│  │  EventBus：emit(event{kind,actors,cause,parent})  │  ← 所有“值得一提的事”         │
│  └────────┬──────────────────────────────────┬───────┘                               │
└───────────┼──────────────────────────────────┼────────────────────────────────────────┘
            │ 订阅（只读，不回写）                │ 订阅
┌───────────┴───────────────┐   ┌──────────────┴──────────────┐
│ PresentationRouter        │   │ ReplayRecorder / DebugTap   │
│ （表现层路由：节流/批处理）  │   │ （回放与调试：事件即真相）    │
│  → UI / Map / Anim / VFX  │   └─────────────────────────────┘
│    / SFX / Notification   │
└───────────────────────────┘
```

### 1.2 五条不可破坏的边界

1. **模拟层不知道表现层存在**。模拟层只 `emit(event)`；谁订阅、怎么呈现，模拟层不关心。表现层永不回写模拟状态（玩家输入走 `Command`，不走事件）。
2. **状态只能被 Action 结算修改**。NPC 想改变世界 → 发起 Action → Action 有前置/耗时/中断/结算 → 结算时改状态并发事件。杜绝系统之间互相直接改字段（现状的痛点之一：`society` 改 `agent`、`economy` 改 `world`）。
3. **每个“值得一提的事”都是事件**。事件带 `parentEventId`，形成因果链：「他饿了（需求事件）→ 去偷面包（行为事件）→ 被石头看见（目击事件）→ 立案（司法事件）」。回放 = 按链重放事件流。
4. **丰富度 = 数据 × 模板组合，不是 if-else**。新职业 = 加数据；新社交行为 = 加 InteractionDef；新传闻 = 加模板。禁止为新内容写新的硬编码分支（现有 `applyEffect` 大 switch 要拆成 Action 注册表）。
5. **确定性**。一切随机走 `sim.rng`；LLM 输出只进「文本槽」，永远不进数值结算。同种子 + 同事件流 ⇒ 同结果（LLM 缓存 miss 时回落本地文本，数值不受影响）。

### 1.3 为什么多系统并行不会爆炸

- **系统间零直接调用，全部经事件与只读查询**。职业系统不知道家庭系统存在；它只在「配偶生病」事件到达时给目标打分加一个修饰符。
- **每个系统只回答三个问题**：我关心什么事件（`onEvent`）、我周期做什么（`onTick(layer)`）、我怎么序列化（`toJSON/fromJSON`）。新增系统 = 加一个文件 + 注册一行。
- **组合爆炸外包给数据**：18 特质 × 8 职业 × 9 话题 × N 模板，靠「修饰符表 + 加权抽样」组合，不靠分支展开。内容量增长是加 JSON，不是加代码路径。
- **决策成本封顶**：效用评分只对「候选目标集合」打分，候选集合由数据驱动的 `GoalDef.applicable(ctx)` 过滤产生，常规 ≤ 12 个；GOAP 只在效用 Top-K（≤3）且本地计划失败时启用（见 §3.4）。

### 1.4 与现状的迁移映射（第 11 轮代码 → 目标架构）

| 现状 | 目标 | 迁移方式 |
| --- | --- | --- |
| `npc = {...}` 大平面对象 | Character 组件化（§2.1） | 逐字段搬到组件，保留 `npc.rels/mind/history` 访问别名，分 3 个 PR 完成 |
| `goals.js` 的 `GOALS[]` + `pickPlan` | GoalDef 注册表 + 效用评分（§3.3） | 现有 7 个 goal 原样数据化，打分公式不动 |
| `plan=[steps]`、`applyEffect` 大 switch | HTN 展开 + Action 注册表 + BT 执行（§3.4/3.5） | steps 即 HTN 的 primitive 序列；applyEffect 每个 case 搬成 ActionDef |
| `social.js chatter`、`society.js` | SocialSystem 模块（§4） | 现有逻辑搬进模块，字段换成多维关系矩阵（§2.4） |
| `sim.log()`、气泡 | EventBus + PresentationRouter（§5/§8） | log 成为 `kind:'log'` 的订阅者之一 |
| `learning.js mind` | 保留，作为「经验学习组件」挂进决策修饰 | 不动 |
| `llm.js` | LLM 网关（§3.6），加 JSON Schema 校验与离线管线 | 扩展现文件 |
| 存档 `toJSON/restore` | 版本化快照 + 组件级序列化（§16 接口清单） | 写 `migrateV1toV2` |

---

## 2. 数据模型

约定：

- 所有 id 为字符串；时间统一用 `tick`（1 tick = 5 游戏分钟）与派生的 `day/hour`。
- 所有「多维度量」用 0..100 浮点，情绪 PAD 用 -1..1，概率 0..1。
- **一切状态可 JSON 序列化**：`Map` → `{k:v}` 对象或 `[k,v][]`；运行时缓存（如路径）不进存档。
- 每个实体带 `schemaVersion`，迁移函数链 `migrateVn→Vn+1` 集中放在 `src/persist/migrations.js`。
- 校验器：手写一个 60 行的 `validate(schema, obj)`（`src/lib/validate.js`），支持 type/enum/required/range/items，**不引 ajv**（零依赖约束 A1）。

### 2.1 Character（角色核心模型）

现状的 `npc` 平面对象拆成 16 个组件。组件是「带 schema 的命名子对象」，挂在 Character 上；系统只读写自己负责的组件。

```jsonc
// src/model/character.schema.json —— schemaVersion: 2
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "Character",
  "type": "object",
  "required": ["id", "identity", "body", "mind", "needs", "mood", "skills", "traits",
               "relations", "memory", "goals", "plan", "queue", "schedule", "inventory",
               "social", "locomotion", "knowledge"],
  "properties": {
    "schemaVersion": { "const": 2 },
    "id":   { "type": "string" },
    "identity": {                              // 基础属性 + 社会身份锚点
      "type": "object",
      "properties": {
        "name": { "type": "string" },
        "sex": { "enum": ["m", "f", "n"] },
        "age": { "type": "number", "minimum": 0 },
        "lifeStage": { "enum": ["child", "teen", "adult", "elder"] },
        "citizenship": { "enum": ["resident", "settler", "visitor", "outlaw"] },
        "socialClass": { "enum": ["poor", "common", "prosperous", "elite"] },
        "reputation": { "$ref": "#/$defs/Reputation" }
      }
    },
    "body": {                                  // 健康/生理
      "type": "object",
      "properties": {
        "health": { "type": "number", "minimum": 0, "maximum": 100 },
        "sick":   { "type": ["string", "null"] },       // 病症 id 或 null
        "trauma": { "type": "array", "items": { "type": "string" } },  // 心理创伤标签
        "fatigue":{ "type": "number" }
      }
    },
    "mind": {                                  // OCEAN 性格（-1..1）+ 价值观（0..1）
      "type": "object",
      "properties": {
        "ocean": {
          "type": "object",
          "properties": {
            "openness":          { "type": "number", "minimum": -1, "maximum": 1 },
            "conscientiousness": { "type": "number", "minimum": -1, "maximum": 1 },
            "extraversion":      { "type": "number", "minimum": -1, "maximum": 1 },
            "agreeableness":     { "type": "number", "minimum": -1, "maximum": 1 },
            "neuroticism":       { "type": "number", "minimum": -1, "maximum": 1 }
          }
        },
        "values": {                            // 价值观：目标打分的长期偏移
          "type": "object",
          "properties": {
            "work":     { "type": "number" },  // 勤劳 ↔ 享乐
            "family":   { "type": "number" },  // 家庭 ↔ 自我
            "money":    { "type": "number" },  // 逐利 ↔ 淡泊
            "order":    { "type": "number" },  // 守序 ↔ 自由
            "faith":    { "type": "number" },  // 虔诚
            "loyalty":  { "type": "number" }   // 重情 ↔ 重理
          }
        },
        "moodBase": { "type": "number" }       // 长期情绪底色（现 learning.js 的 moodBase）
      }
    },
    "needs": {                                 // 需求：现状 5 项扩到 7 项
      "type": "object",
      "properties": {
        "hunger":  { "type": "number" }, "energy": { "type": "number" },
        "social":  { "type": "number" }, "fun":    { "type": "number" },
        "purpose": { "type": "number" },
        "comfort": { "type": "number" },       // 环境舒适（住所质量/美观）
        "safety":  { "type": "number" }        // 安全感（治安/被威胁）
      }
    },
    "mood": {                                  // PAD 情绪模型（-1..1），派生 + 事件扰动
      "type": "object",
      "properties": {
        "pleasure": { "type": "number" },      // 愉悦
        "arousal":  { "type": "number" },      // 激活（对话节奏/动画幅度）
        "dominance":{ "type": "number" },      // 支配（冲突中谁压谁）
        "label":    { "type": "string" }       // 缓存的中文标签：平静/烦躁/沮丧/兴奋…
      }
    },
    "skills": {                                // 技能 0..10，经验制（现 skills 扩字段）
      "type": "object",
      "additionalProperties": {
        "type": "object",
        "properties": {
          "level": { "type": "number" },
          "xp":    { "type": "number" }
        }
      }
    },
    "traits": {                                // 特质 id 列表 → data/traits.js（修饰符表）
      "type": "array", "items": { "type": "string" }, "maxItems": 5
    },
    "relations": { "$ref": "#/$defs/RelationshipMatrix" },
    "memory":   { "type": "array", "items": { "$ref": "#/$defs/Memory" } },
    "goals": {                                 // 目标栈：顶 = 当前追求
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "goalId":   { "type": "string" },    // → data/goals/*.def.json
          "priority": { "type": "number" },
          "params":   { "type": "object" },    // 例如 {target:'npc_shi'}
          "since":    { "type": "integer" },
          "deadline": { "type": ["integer", "null"] }
        }
      }
    },
    "plan": {                                  // 当前计划（HTN 展开结果）
      "type": ["object", "null"],
      "properties": {
        "goalId": { "type": "string" },
        "steps":  { "type": "array", "items": { "$ref": "#/$defs/ActionCall" } },
        "stepIndex": { "type": "integer" },
        "status": { "enum": ["running", "blocked", "done", "failed"] },
        "why": { "type": "string" }            // 决策时的解释快照（调试面板直接显示）
      }
    },
    "queue": {                                 // 行动队列：插队指令/预约占用
      "type": "array", "items": { "$ref": "#/$defs/ActionCall" }
    },
    "schedule": {                              // 日程：工作日历 + 今日例外
      "type": "object",
      "properties": {
        "weekly": { "type": "array", "items": { "$ref": "#/$defs/ScheduleBlock" } },
        "overrides": { "type": "array", "items": { "$ref": "#/$defs/ScheduleBlock" } }
      }
    },
    "inventory": {                             // 物品：id → {qty}
      "type": "object", "additionalProperties": { "type": "integer" }
    },
    "social": {                                // 社会角色集合（一人多角）
      "type": "object",
      "properties": {
        "career":     { "$ref": "#/$defs/CareerTrack" },
        "lifeQuests": { "type": "array", "items": { "$ref": "#/$defs/LifeQuest" } },
        "householdId":{ "type": ["string", "null"] },
        "factionId":  { "type": ["string", "null"] },
        "legal":      { "$ref": "#/$defs/LegalStatus" },
        "education":  { "type": "object" }     // {level, schoolId, courses[], degree}
      }
    },
    "locomotion": {                            // 位置 + 动画状态（表现层只读这里）
      "type": "object",
      "properties": {
        "x": { "type": "number" }, "y": { "type": "number" },
        "dir": { "enum": ["up", "down", "left", "right"] },
        "anim": { "$ref": "#/$defs/AnimationState" }
      }
    },
    "knowledge": {                             // 知识/信念：听来的事，带可信度
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "subject": { "type": "string" },     // 关于谁/什么
          "claim":   { "type": "string" },     // 内容（模板填好的句子）
          "claimType": { "enum": ["fact", "rumor", "secret", "opinion"] },
          "credence": { "type": "number" },    // 可信度 0..1（来源信任 × 传播衰减）
          "source":  { "type": "string" },     // 来源 npcId / 'self' / 'press'
          "learnedAt": { "type": "integer" }
        }
      }
    }
  }
}
```

### 2.2 ActionCall / AnimationState / Memory

```jsonc
// ActionCall：一次可调用的动作（计划步骤、队列元素共用）
{
  "$id": "ActionCall",
  "type": "object",
  "required": ["actionId"],
  "properties": {
    "actionId": { "type": "string" },          // → data/actions/*.def.json
    "target":   { "type": ["string", "null"] },// npcId / pointId / buildingId
    "goto":     { "type": ["object", "null"], "properties": { "x": {}, "y": {} } },
    "params":   { "type": "object" },
    "dur":      { "type": "integer" },         // 覆盖默认耗时（tick）
    "resume":   { "type": ["object", "null"] } // 中断恢复快照：{progress, reason}
  }
}

// AnimationState：表现层每帧只读这个，绝不推状态
{
  "$id": "AnimationState",
  "type": "object",
  "properties": {
    "state":  { "enum": ["idle","walk","sit","work","eat","talk","sleep","carry",
                         "argue","escort","build","tend","celebrate","cower"] },
    "frame":  { "type": "integer" },
    "facing": { "enum": ["up","down","left","right"] },
    "slots":  {                              // 事件驱动动画槽：一次性叠加动作
      "type": "array",
      "items": { "type": "object", "properties": {
        "kind": { "type": "string" },        // wave / clap / flinch / bow
        "until": { "type": "integer" }
      } }
    },
    "prop":   { "type": ["string", "null"] },// 携带物 sprite id
    "speed":  { "type": "number" }
  }
}

// Memory：记忆条目（详见 §3.2 记忆系统）
{
  "$id": "Memory",
  "type": "object",
  "required": ["id", "type", "text", "tick"],
  "properties": {
    "id":       { "type": "string" },
    "type":     { "enum": ["experience","observation","hearsay","trauma","achievement","promise"] },
    "text":     { "type": "string" },
    "tick":     { "type": "integer" },
    "strength": { "type": "number" },          // 0..1，衰减按类型半衰期
    "valence":  { "type": "number" },          // -1..1 情感色彩
    "arousal":  { "type": "number" },          // 情绪激活度（影响是否进入闲聊）
    "credence": { "type": "number" },          // 可信度（传闻 < 亲见）
    "about":    { "type": "array", "items": { "type": "string" } },  // 关联 npcId
    "topic":    { "type": "string" },          // 话题槽：money/work/love/crime…
    "source":   { "type": "string" },          // self / npcId / press / witness
    "triggers": { "type": "array", "items": { "type": "string" } },  // 触发词（对话/决策索引）
    "eventId":  { "type": ["string","null"] }, // 来源事件（因果链回溯用）
    "halfLife": { "type": "integer" }          // 半衰期（tick），由类型默认值覆盖
  }
}
```

### 2.3 事件 Event 与因果链

```jsonc
// Event：一切“值得一提的事”。回放 = 重放事件流。
{
  "$id": "Event",
  "type": "object",
  "required": ["id", "kind", "tick"],
  "properties": {
    "id":        { "type": "string" },
    "kind":      { "type": "string" },         // 见 §5.1 事件种类注册表
    "tick":      { "type": "integer" },
    "actors":    { "type": "array", "items": { "type": "string" } },   // 主语
    "targets":   { "type": "array", "items": { "type": "string" } },   // 宾语
    "location":  { "type": ["object","null"], "properties": { "x": {}, "y": {} } },
    "parentEventId": { "type": ["string","null"] },  // 因：上游事件
    "cause":     { "type": "string" },               // 人类可读原因：“饥饿 18 → 偷窃”
    "data":      { "type": "object" },               // 各 kind 的负载（增量、文本、金额）
    "visibility":{ "enum": ["public","local","private","secret"] },    // 谁“看得见”
    "severity":  { "type": "number" }                // 0..1，通知/传闻优先级
  }
}
```

### 2.4 关系多维矩阵 RelationshipMatrix

现状 `affinity/trust/familiarity` 三维扩到八维，全部 0..100，事件驱动更新（§8.1 更新表）。

```jsonc
{
  "$id": "RelationshipMatrix",
  "type": "object",                             // key: npcId 或 'player'
  "additionalProperties": {
    "type": "object",
    "properties": {
      "affection": { "type": "number" },        // 好感（原 affinity）
      "trust":     { "type": "number" },        // 信任：分享秘密/借钱的前提
      "respect":   { "type": "number" },        // 尊重：师徒/上下级/技能认可
      "fear":      { "type": "number" },        // 恐惧：威慑、目击威胁
      "debt":      { "type": "number" },        // 亏欠：人情债（可正负）
      "envy":      { "type": "number" },        // 嫉妒：相近条件 + 对方获得
      "intimacy":  { "type": "number" },        // 亲密：恋爱/家人专属通道
      "rivalry":   { "type": "number" },        // 竞争：同业/同目标
      "familiarity": { "type": "number" },      // 熟识（见面次数累计）
      "bonds":     { "type": "array", "items": { "enum":
        ["kin","spouse","ex","mentor","apprentice","colleague","neighbor","rival","creditor"] } },
      "lastEventAt": { "type": "integer" }
    }
  }
}
```

### 2.5 社会实体 Schema（紧凑定义）

> 均为独立 JSON 文档，存 `sim.social.*`，事件驱动更新。

```jsonc
CareerTrack {                                 // 职业线
  jobId: string,                               // → data/jobs/*.def.json（含晋升线 next[]）
  employerId: string|null,                     // 建筑/店主
  rank: int, wage: number, performance: 0..100,
  shift: [[startHour,endHour]...],             // 班次
  bossId: string|null, colleagues: [npcId],
  sideGigs: [{jobId, since}],                  // 副业
  careerQuests: [{questId, stage, progress}],  // 职业任务链
  since: tick, firedAt: tick|null
}

LifeQuest {                                    // 个人人生主线（渴望/恐惧的数据化）
  questId: string,                             // → data/lifequests/*.def.json
  stage: int, progress: 0..1,
  milestones: [{text, at: tick}],
  status: enum(active, done, failed, abandoned),
  secretRelated: string|null                   // 关联秘密 id
}

Household {                                    // 家庭
  id, members: [{npcId, role: enum(spouse,child,parent,sibling,guardian)}],
  homeId: buildingId, funds: number,           // 家庭共账
  chores: [{kind, assignee, due}],             // 家务
  reputation: 0..100,
  grievances: [{from, about, topic, heat}],    // 家庭矛盾（heat 归零自动消解）
  inheritance: [{beneficiary, share}]          // 继承份额
}

Faction {                                      // 派系
  id, name, ideology: {order, welfare, liberty, devout},  // -1..1 四维
  members: [{npcId, role, influence}],
  platform: [policyId], treasury: number,
  rivalry: {factionId: 0..100}
}

Policy {                                       // 政策（现状 politics.js 扩展）
  id, kind: enum(tax,welfare,construction,land,curfew,permit),
  params: object, enactedAt: tick, sponsorId: npcId|'player',
  support: 0..100, sunset: tick|null
}

School { id, buildingId, headmasterId, courses: [courseId], capacity }
Course { id, name, skillId, level: enum(basic,advanced,master),
         teacherId, students: [{npcId, progress, attendance}],
         schedule: ScheduleBlock[], examAt: tick|null, fee }

BuildProject {                                 // 建造项目（详见 §12 建筑系统）
  id, blueprintId, plotId, status: enum(planning,permit,funding,building,inspection,done),
  progress: 0..1, workers: [{npcId, role}], materials: {delivered, required},
  contractorId, safety: 0..100, defects: [string]
}

Permit { id, plotId, applicantId, kind: enum(build,business,stall,event),
         status: enum(applied,approved,rejected,revoked), fee, issuedAt }

CrimeRecord {                                  // 前科（挂在 LegalStatus 里）
  crimeId, kind: enum(theft,fraud,assault,vandalism,smuggling,organized),
  severity: 1..5,                              // 严重性分级（≥4 仅抽象建模，不呈现过程）
  at: tick, victimId, caseId, conviction: enum(none,probation,jail,fine,community)
}

Case {                                         // 案件链
  id, kind, severity, status: enum(reported,investigating,warrant,trial,closed,cold),
  suspectId: string|null, investigatorId: npcId|null,
  evidence: [{kind: enum(witness,item,trace,confession), strength: 0..1, fromId, at}],
  witnesses: [npcId],                          // 目击（含可信度）
  filedAt, trialAt: tick|null, verdict: string|null
}

LegalStatus {                                  // 角色的法律状态
  records: [CrimeRecord], openCases: [caseId],
  status: enum(clean,suspect,wanted,onBail,probation,jailed,rehab),
  jailedUntil: tick|null, reoffendRisk: 0..1
}

Reputation {                                   // 声誉：分维度、分圈层
  general: -100..100,
  byFaction: {factionId: number},
  tags: [string]                               // '守信'/'惯偷'/'妙手'（由事件打标签）
}

Rumor {                                        // 传闻（传播实体，见 §8.3）
  id, claim: string, claimType: enum(rumor,secret,news),
  about: [npcId], originId, credibility: 0..1,
  mutations: int,                              // 每手传播 +1，文本可微变异
  heardBy: [npcId], diedAt: tick|null
}
```

### 2.6 调试可解释性基线

每个组件带 `_debug`（不进存档）：最近一次的「为什么」——决策的打分明细、计划的展开路径、动作失败原因。调试面板（§14）直接渲染它，不需要再猜。

---

## 3. AI 决策

### 3.1 混合架构分层与职责

```
层级        技术              频率          职责
──────────────────────────────────────────────────────────────
L1 反应层    行为树 (BT)       每 tick      执行当前 step：移动/播放动画/进度条/中断检查
L2 计划层    HTN（现状 plan）  计划失效时    goal → 方法展开 → primitive 序列
L2.5 搜索层  GOAP             仅 HTN 失败   A* 搜「动作效果链」满足前置（预算 200 节点）
L3 评估层    效用评分          0.5s/事件    候选目标打分排序，产出 Top1 + why
L4 生成层    目标生成器        5s/事件      需求缺口/日程/事件触发 → 候选目标集合
L5 解释层    LLM（可选）       对话/传闻    只填文本槽，不进数值决策（§3.6）
```

为什么是这个组合而不是纯 GOAP：现状「7 个手写 goal + 手写 plan」其实就是退化的 HTN，已经work且可解释；GOAP 只作为**兜底重规划器**——当 HTN 的方法都返回 null（桥断了、店关了、人不在），用动作效果表搜一条能走通的路。这样 95% 的决策走可读性最高的 HTN，GOAP 的使用频率有硬预算（每 NPC 每天 ≤ 3 次），性能可控。

### 3.2 记忆系统

**来源与类型**：`experience`（亲历）、`observation`（目击，半径 6 格视线内）、`hearsay`（听闻，带 credence 折扣）、`trauma`（高强度负价，半衰期极长）、`achievement`（里程碑）、`promise`（承诺/约定，未完成会持续产生压力）。

**衰减与遗忘**（每日 tick 层处理，§6）：

```python
HALF_LIFE = { experience: 8天, observation: 5天, hearsay: 3天,
              trauma: 40天, achievement: 20天, promise: ∞(履约/违约才移除) }
strength *= 0.5 ** (Δt / halfLife)
if strength < 0.05: 遗忘（移除；trauma 保留 0.05 地板值，仅影响情绪不影响回忆）
```

**触发条件**：`triggers[]` 是话题/事件关键词。对话时若对方提到 trigger，记忆被「召回」：强度 +20%（用进废退）、进入 `compose()` 的事实池（现状 language.js 的 gatherFacts 扩展）、可能改变情绪 PAD。

**影响决策**：目标打分修饰 = Σ（召回记忆.valence × strength × 目标与记忆话题的相关度）。例：「上次在市集被偷」（负价记忆，topic=money）→ 「去市集」目标 -6 分；safety 需求权重 +0.3。

**影响对话**：现状 `npc._said` 去重保留；新增：hearsay 记忆是闲聊的「话题库存」，gossip 行为从库存按 arousal×credence 加权抽一条讲给对方，并生成传播事件（§8.3）。

### 3.3 行为选择算法（伪代码）

每个 NPC 的完整决策循环。所有阈值/权重都在 `data/ai/tuning.js`，不进代码。

```python
# src/ai/decide.js —— 每 0.5s（感知层）与事件触发时运行
def decide(npc, sim):
    # 1. 感知（PerceptionSystem，0.5s 层）
    obs = perceive(npc, sim)            # 视线 6 格：人/事件/物品/状态变化
    for o in obs:
        maybe_write_memory(npc, o)      # §3.2：目击类记忆，credence=1
        if o.triggers_fear(npc):        # 目击暴力/被通缉者靠近
            interrupt_plan(npc, reason='fear')
            push_goal(npc, GoalDef('flee' or 'report_crime'), priority=HIGH)

    # 2. 需求/情绪评估（每 5s 层已更新需求；这里算 PAD）
    npc.mood = pad_from(npc.needs, npc.mind, recent_memories(npc, window=1day))
    #    pleasure = f(需求均值, 记忆正负比)  arousal = f(最近事件强度)  dominance = f(地位差)

    # 3. 目标生成（候选集合，数据驱动过滤）
    cands = []
    for gdef in GOAL_REGISTRY:                      # data/goals/*.def.json
        if not gdef.applicable(npc, sim): continue  # 前置：时间窗/职业/状态/冷却
        cands.append(gdef)
    cands += goals_from_events(npc)                 # 被辱骂→报复/疏远；受托→办事
    cands += goals_from_schedule(npc, sim.clock)    # 日程块：上工/上学/家庭聚餐
    if npc.order: cands.insert(0, goal_from_order(npc.order))   # 玩家指令最高优先

    # 4. 效用评分（每个候选 ≤ 1µs，全量 ≤ 12 个）
    best, breakdown = null, {}
    for g in cands:
        u = g.base                                  # 基础分（需求缺口 × 权重）
        u += trait_mod(g, npc.traits)               # 特质修饰（数据表）
        u += ocean_mod(g, npc.mind.ocean)           # OCEAN 修饰（高神经质 flee+）
        u += value_mod(g, npc.mind.values)          # 价值观长期偏移
        u += mood_mod(g, npc.mood)                  # PAD：arousal 高偏好高激活行为
        u += memory_mod(g, recalled(npc, g.topic))  # §3.2 记忆修饰
        u += relation_mod(g, npc.relations)         # 找好感高的人聊，躲 fear 高的人
        u += habit_mod(g, npc.mind.habits)          # learning.js：意外收益 EMA
        u *= g.urgency_window(sim.clock)            # 时段窗口（上班快迟到 ×1.5）
        u -= switch_cost(g, npc.plan)               # 换目标惩罚（防抖动，现 failCool）
        breakdown[g.id] = u
        if u > (best?.score ?? -inf): best = (g, u)
    npc._debug.scores = breakdown                   # 动机面板直接渲染

    # 5. 计划（HTN → GOAP 兜底）
    if best.goal.id != npc.plan?.goalId or npc.plan.status in ('done','failed'):
        plan = htn_expand(best.goal, npc, sim)      # 方法表：goal → [method]
        if plan is None:
            plan = goap_plan(best.goal, npc, sim, budget=200)   # 效果链 A*
            if plan: npc._debug.note('GOAP fallback: ' + plan.why)
        if plan is None:
            best.goal.cooldown(npc)                 # 冷却，下轮不再选它
            return replan(npc, exclude=best.goal)   # 重规划：选次优目标
        adopt(npc, plan, why=explain(best, breakdown))  # why 进 plan.why，可解释

    # 6. 行为树执行（每 tick）
    step = npc.plan.steps[npc.plan.stepIndex]
    bt_tick(npc, step, sim)                         # §3.5：MoveTo/DoAction/Wait/Check
```

**结果回写与传播**（动作结算时）：

```python
def settle_action(npc, action, outcome, sim):
    apply_effects(outcome.effects, npc, sim)        # 数值结算（唯一改状态的地方）
    write_memory(npc, action, outcome)              # 亲历记忆
    npc.mind.noteHabit(action, outcome)             # learning.js 保留
    ev = emit(sim, Event(                           # 事件：因果链 + 表现层 + 传播源
        kind=action.eventKind, actors=[npc.id], targets=outcome.targets,
        parentEventId=npc.plan?.eventId, cause=npc.plan.why, data=outcome.summary))
    propagate_relations(ev, sim)                    # §8.1：关系矩阵更新
    if ev.visibility != 'secret': schedule_rumor(ev, sim)   # §8.3：进入传闻池
    legal_check(ev, sim)                            # §4.6：犯罪事件→目击/立案
    npc.queue.clear(); npc.plan.status = 'done'     # 清理 → 下个 0.5s 重新 decide
```

**失败重规划**：BT 节点返回 failure → 标记原因（`unreachable/outOfStock/targetGone/interrupted`）→ 同 goal 换一种 method 再试一次 → 仍失败则 goal 进冷却（`failCool`，现状已有），事件记录失败原因（回放可查「他为什么没去成」）。

### 3.4 ActionDef：可解释性的载体

每个行为一份定义（`data/actions/*.def.json`）。「为什么做、前置、效果、冷却、优先级、动画、耗时、中断条件」全在这里，调试面板直接读：

```jsonc
// data/actions/chat.def.json
{
  "id": "chat", "label": "聊天",
  "preconditions": [
    { "check": "targetAlive", "target": "$target" },
    { "check": "distanceLte", "target": "$target", "value": 2.6 },
    { "check": "notActing", "target": "$target", "except": ["relax"] }
  ],
  "effects": [
    { "path": "self.needs.social", "add": 12 },
    { "path": "target.needs.social", "add": 10 },
    { "rel": "affection", "target": "$target", "add": 1.5, "mod": "chatBonus" }
  ],
  "cooldown": { "same": 20, "sameTarget": 90 },       // tick
  "priority": 50,
  "anim": { "self": "talk", "target": "talk", "faceEachOther": true },
  "duration": 6,                                       // tick = 30 分钟
  "interrupt": ["order", "fear", "needCritical"],      // 中断条件
  "onEvent": "social.chatted",                         // 结算后发出的事件 kind
  "why": "社交需求 {needs.social}，对方好感 {rel.affection}"
}
```

### 3.5 行为树执行层

step 是 primitive（goto/act），BT 负责「这一步怎么被正确地做完」：

```
Root (selector)
├── Sequence[执行当前 step]
│   ├── Condition: 计划仍有效？（目标未消失/未被中断标记）
│   ├── MoveTo(step.goto)          → 寻路 + walk 动画 + 每帧位移；不可达→failure(unreachable)
│   ├── ReserveTarget(step)        → §13 交互点：占用/排队；拿不到→Wait(≤8 tick)→failure
│   └── DoAction(step)             → 进度推进 + 动画状态写入 locomotion.anim
│       ├── Running: 每 tick progress+=1，中断条件命中→Abort(写 resume 快照)
│       └── Success: settle_action()
└── Selector[空闲兜底]
    ├── 队列里还有 ActionCall → 继续
    └── idle 漫游（现状 wander）
```

BT 节点本身无状态机以外的内存，中断/恢复靠 `ActionCall.resume`：被打断时保存 `{progress, reason}`，恢复时优先 resume 原动作（条件仍满足）否则丢弃。存档时 BT 状态 = plan.stepIndex + resume 快照，天然可存读。

### 3.6 LLM 边界（允许调用，但不进每帧决策）

**只用于三件事**：① 对话润色（现状 `polishLine`）；② 传闻文本变异（传播时的措辞漂移）；③ 动机解释的自然语言化（把 `plan.why` 的打分明细写成一句人话，给玩家看）。

**硬约束**：

```jsonc
// LLM 网关（src/ai/llmGate.js）规则
{
  "jsonSchema": {                       // 每类调用一个 schema，输出校验不过→降级
    "polish":  { "line": "string, ≤60字, 无违禁前缀(作为AI/抱歉/无法)" },
    "rumor":   { "claim": "string", "aboutIds": ["string"], "mustKeepFacts": ["string"] },
    "explain": { "text": "string, ≤80字" }
  },
  "cache": {
    "key": "sha1(kind + npcId + 输入事实签名)",   // localStorage + 存档内联（传闻文本进存档）
    "ttl": "永不过期（同事实同措辞）"
  },
  "budget": { "perDay": 40, "perNpcPerHour": 2 },  // 超限→直接本地模板
  "fallback": "本地生成器（language.js）",            // 超时 7s/非 200/校验失败 → 回落，静默
  "offline": "scripts/llm-batch.mjs 批量扩写 → data/gen/*.json → 人工审核 → 入库（§7）"
}
```

**绝不进入**：需求数值、目标打分、计划选择、关系增减、司法判定。同种子复现要求：LLM 只影响「说出口的字符串」，缓存 key 含事实签名，数值路径与 LLM 完全隔离。

---

## 4. 社会模拟（七模块）

统一契约：每个模块是一个文件，导出 `{ id, onEvent(ev, sim), onTick(layer, sim), toJSON(), fromJSON(data) }`。
**数据字段**见 §2.5 对应 schema；本节给每个模块的**事件、更新规则、冲突与联动**。现状代码已覆盖的部分标注（现）。

### 4.1 职业与活动主线 CareerSystem

- **数据**：`CareerTrack`（§2.5）+ `JobDef` 扩展：晋升线 `next: [{jobId, requires:{skill, rank, years}}]`、绩效因子表、职业任务链 `careerQuests`。
- **发出事件**：`work.shiftStarted / completed / skipped`、`work.promoted / demoted / fired / hired`、`career.questAdvanced`、`economy.wagePaid`。
- **更新规则**：班次内工作每分钟产出绩效 `+= skill × workSpeed × moodMod`；绩效周结算决定晋升/警告/解雇；失业 → `purpose` 需求持续流失 + 触发求职目标；副业占用 `fun` 恢复时间换硬币。
- **冲突与联动**：班次与家庭日程冲突（错过家庭聚餐 → Household.grievances+）；高绩效被同事 `envy+`；职业秘密（铁牛的债务）是 `LifeQuest` 的引信。
- **个人人生主线**：`LifeQuest` 由 `desire/fear` 数据化生成（阿岚「最好的农场」= 农事等级+地块收购链；老墨「传下去的木塔」= 建造任务链）。每个 milestone 发 `lifequest.milestone` 事件，是**故事化的主线抓手**——玩家面板能看到每个人「这辈子在追什么、走到哪了」。

### 4.2 家庭系统 FamilySystem

- **数据**：`Household`（§2.5）；恋爱/婚育判定逻辑沿用现状 `society.js` 数值（好感 ≥58–62 等），搬入模块。
- **发出事件**：`family.fellInLove / married / childBorn / divorced / quarreled / reconciled / inherited`。
- **更新规则**：同住成员每日家务结算（舒适度±）；`grievances.heat` 由「爽约/偏心/债务」事件累加，>70 触发争吵（公开事件，可被目击传播），<20 自动消解；离婚拆分 `funds` 与子女监护；死亡（若启用）触发 `inheritance` 分配。
- **冲突与联动**：`intimacy` 高而 `rivalry` 高的组合产生「相爱相杀」对话素材；家庭声誉影响子女入学与婚事（对方家庭 `respect` 校验）；生育带来新 NPC（现状已有，接入 `education` 儿童线）。

### 4.3 政治系统 PoliticsSystem

- **数据**：`Faction/Policy`（§2.5）；现状四派立场/议会/选举逻辑迁入。
- **发出事件**：`politics.electionCalled / voteCast / elected / policyEnacted / protestStarted / lobbied`。
- **更新规则**：选举周期（现状 7 天）；投票权重 = `respect + 派系忠诚 + 私交`；政策落地修改全局参数（税率/补贴/许可费），并以 `policy.effect` 注入需求/经济修饰；公共舆论（`opinion` 聚合全镇 `mood` 与传闻）低于阈值可能触发 `protest`（集会事件，占用广场交互点）。
- **冲突与联动**：游说/腐败——`debt` 高的议员接受「赞助」改票（secret 事件，若被目击进司法）；抗议激化时 `safety` 需求全镇下降；玩家声望 ≥ 阈值可提案（现状保留）。

### 4.4 教育系统 EducationSystem

- **数据**：`School/Course`（§2.5）；现状「学堂听课 + education 数值」扩展为课程制。
- **发出事件**：`edu.enrolled / attended / examPassed / graduated / droppedOut / apprenticed`。
- **更新规则**：课程按 `ScheduleBlock` 开课；出勤 + 教师 `skill × teachMod` → `skills.xp`；考试（周期事件）决定学位；学徒制：低学历者可拜高技能者为师（`respect ≥ 40` 触发 `mentor` 关系 bond），现实中对应现状「传艺」的扩展。
- **冲突与联动**：学费 × 家庭资金（交不起 → 辍学事件，人生主线分岔）；学位是职业晋升前置（医生 rank3 需要 healing 学位）；教师是职业线之一（苏叶/老墨可兼课）。

### 4.5 建造与经济系统 BuildEconomySystem

- **数据**：`BuildProject/Permit`（§2.5）+ 产权登记 `Deed {plotId, ownerId, mortgage, rent}`；现状 `territory.js`（购地/新居/移民）与经济（定价/委托/税）迁入。
- **发出事件**：`build.planned / permitApproved / started / stageDone / completed / damaged / repaired`、`econ.priceShift / orderPosted / orderFulfilled / rentDue / deedTransferred`。
- **更新规则**：建造 = 许可申请（费用+审批 tick）→ 材料交付（运输动作，NPC 搬运可见）→ 施工阶段（地基/框架/封顶/装修，各阶段有进度与动画）→ 验收（缺陷率与工人技能相关）→ 交付/入住；租金按周期从租户扣给产权人；建材价格沿用现状供需公式并接入商路事件。
- **冲突与联动**：施工噪音让附近住户 `comfort-`；产权是家庭资产与继承标的；无证施工被巡查发现 → 司法模块 `fine`；经济危机（公账枯竭）→ 停工事件链。

### 4.6 犯罪与司法系统 JusticeSystem

- **数据**：`CrimeRecord/Case/LegalStatus`（§2.5）；现状「偷窃+石头抓捕+拘留」升级为完整链条。**分级与抽象化**：severity 1–2（小偷小摸/口角）完整模拟；3（欺诈/斗殴）模拟起因与结果、过程用对峙抽象动画；**4–5（组织犯罪/暴力重罪）只建模前因后果**（账本、赃物、审判、刑期），不呈现过程画面。
- **发出事件**：`crime.committed / witnessed / reported`、`justice.caseOpened / evidenceAdded / warrantIssued / arrested / trialHeld / verdict / jailed / released / paroled / rehabbed`。
- **更新规则**：犯罪动机沿用现状（hunger<30 或 coins<12 且 mood<50）+ `values.order` 与 `reoffendRisk` 修正；目击判定 = 视线 6 格 × 目击者 `honest/警觉`；举报概率随 `trust(对守卫)` 与 `fear(对罪犯)` 变化；证据强度累计 ≥ 阈值 → 通缉 → 逮捕（escort 动画）→ 审判（镇公所，议员/镇长裁决）→ 刑罚（罚金/社区服务/监禁/缓刑）；服刑结束 → `rehab` 期再犯风险衰减，受害者获得 `受害者支持`（慰问事件）。
- **冲突与联动**：惯偷被打上 `Reputation.tags=['惯偷']` → 商店交互被拒；目击暴力产生 `trauma` 记忆；包庇（家属隐瞒）消耗 `debt`；监狱容量是政策议题（建造模块可盖监房）。

### 4.7 媒体 / 文化 / 宗教 / 健康（可选层）

每个都是**可拆卸模块**（没有它们游戏依然完整）：

| 模块 | 核心机制 | 事件 | 联动 |
| --- | --- | --- | --- |
| 媒体/传闻 | 布告栏 + 酒馆的「镇报」：把公共事件汇编成每日一条 | `press.published` | 传闻 credence +0.2（白纸黑字） |
| 文化/节庆 | 季节节日（丰收祭）：广场集会、全体 `fun+` | `festival.held` | 暂停班次一天；情侣 `intimacy+` |
| 宗教/信仰 | 现状 god.js 下沉为「镇民信仰」：信仰点数仍由镇况产出 | `faith.miracle` | 神迹事件是舆论放大器 |
| 健康/心理 | 现状健康/看病扩展：`trauma` 需要苏叶的「谈心」动作缓解 | `health.recovered` | 长期病痛 → 家庭 grievance |
| 交通/通勤 | 远距离居住区（镇外新居）产生通勤时间与疲劳 | `commute.started` | 通勤 >20 分钟 → `energy-`，坐骑/车道成政策议题 |

---

## 5. 事件总线与因果链

### 5.1 事件种类注册表（节选，全量在 `data/events/kinds.js`）

```
social.chatted / quarreled / reconciled / rumorSpread
work.shiftStarted / completed / promoted / fired
family.fellInLove / married / childBorn / divorced
politics.elected / policyEnacted / protestStarted
edu.enrolled / examPassed / graduated
build.started / completed / damaged
crime.committed / witnessed / reported
justice.caseOpened / arrested / verdict / jailed / released
health.fellIll / recovered
player.ordered / gifted / talked / miracle
world.seasonChanged / weatherChanged / caravanArrived
```

### 5.2 总线实现（`src/core/eventBus.js`）

```python
class EventBus:
    queue = []                       # 本 tick 产生的事件
    def emit(ev):                    # 结算期调用；id = `e${tick}_${seq}`
        ev.parentEventId ??= current_action?.eventId
        queue.push(ev); replay_log.append(ev)     # 回放流（环形 5000 条）
    def flush():                     # tick 末尾：派发给订阅者（同步、按注册序）
        for ev in queue:
            for sub in subscribers:                # 社会系统（写）→ 表现层（读）
                if sub.filter(ev): sub.onEvent(ev)
        queue.clear()
```

订阅者分两组、两个派发阶段：**模拟系统先**（可因事件再产事件，限深 3 层防循环），**表现层后**（只读）。事件不持久化全部，只存：进存档的 `history` 摘要 + 回放环形缓冲（可导出）。

### 5.3 因果链（「谁因为什么做了什么，导致什么」）

每个事件带 `parentEventId` + `cause`。因果链查询 = 沿 parent 指针向上回溯：

```python
def causal_chain(ev_id):            # 例：阿岚被捕
    # justice.arrested ← crime.witnessed(石头目击) ← crime.committed(偷面包)
    #   ← needs.hungerCritical(饥饿 18) ← work.fired(上周被解雇) ← economy.recession(公账枯竭)
    return [walk_up(ev_id)]          # 调试面板与回放按此渲染（§14）
```

**验收标准**：任意 `severity ≥ 0.5` 的事件，在调试 UI 里能 1 秒展开完整上游链，且每一环都有 tick、当事人、cause 文本。

---

## 6. Tick 调度与 LOD

### 6.1 分层表（模拟层 + 表现层合并视图）

| 层 | 周期（现实时间） | 游戏时间 | 内容 | 预算（200 NPC） |
| --- | --- | --- | --- | --- |
| Frame | 每帧（≤16.6ms） | — | 插值移动、动画帧推进、VFX、镜头、BT 的 Running 节点推进 | 渲染 ≤10ms，逻辑 ≤4ms |
| UI | 0.25s | — | 面板节流刷新（现状 240ms 保留）、通知合并、悬停卡 | ≤2ms |
| Perception | 0.5s | ≈2.5 分钟 | 感知扫描、局部决策（decide §3.3）、地图标记、交互点状态 | ≤0.02ms/NPC → 4ms |
| Social | 5s | ≈25 分钟 | 需求衰减、PAD 情绪、闲聊撮合、交互队列重排 | ≤6ms |
| Hour | 每游戏小时（12 tick） | 1h | 日程块切换、班次结算、课程出勤、目标重生成 | ≤5ms |
| Day | 每游戏天（288 tick） | 1d | 关系/记忆衰减、家庭结算、健康、天气、季节、日结 | ≤8ms |
| Week | 7d | 7d | 派系立场漂移、舆论统计、犯罪统计、商队 | ≤3ms |
| Month | 28d | 28d | 选举、政策日落、经济月结、租金 | ≤5ms |
| Year | 336d | 336d | 人口（出生/死亡/迁移）、学位授予、继承 | ≤5ms |

总预算：常态帧均模拟 ≤8ms（60fps 下渲染余量充足），峰值（月初）≤15ms，用「层内 NPC 分片」削峰——大层（Day/Week）按 `npcIndex % shardCount` 把 NPC 摊到连续几个 tick 处理，效果与同日全量一致（衰减用精确 Δt）。

### 6.2 LOD（200 NPC 的性能策略）

| LOD | 判定 | 模拟精度 | 表现 |
| --- | --- | --- | --- |
| L0 全量 | 视口内 / 玩家关注 / 事件主角 | 完整 decide + BT + 感知 | 全动画状态机 + 气泡 + 名牌 |
| L1 中景 | 视口外 1 屏内的活动 NPC | decide 降到 2s 一次，感知关 | 简化动画（idle/walk 两态），无气泡 |
| L2 远景 | 建筑内 / 镇外 | 需求/日程照走，行为抽象结算（不进 BT，直接 tick 效果） | 不渲染个体，建筑图标聚合 |
| L3 休眠 | 出镇旅行等 | 仅日/周/月层结算 | 无 |

升级/降级规则与「事件唤醒」：L2/L3 的 NPC 成为事件 target 时立刻升 L0。LOD 分档由 `distanceToCamera + relevanceScore`（最近事件严重度、与玩家关系）计算，每 2s 重评。

### 6.3 数据结构配套

- 感知用**网格空间索引**（`Map<cellKey, npcId[]>`，NPC 移动时维护），视线查询 O(邻居格)。
- 关系矩阵**稀疏存储**（只存有交互过的对），200 NPC 常态 ≤ 3000 条边。
- 记忆按 NPC 分桶 + 全局事件 id 索引，衰减只在 Day 层按分片处理。
- 热力图（§10）用降采样网格（40×30 → 20×15 累加），Day 层重算，渲染读缓存。

---

## 7. 内容生成管线

### 7.1 原则：数据驱动 + 组合生成 + 人工审核

```
data/ 内容源（手写 + 生成，全部过 schema 校验）
├── traits/ jobs/ goals/ actions/ interactions/ lifequests/
├── events/ rumors/ dialogues/ festivals/ careers/
└── gen/                ← LLM 离线扩写产物（带 reviewed: false，人工勾掉才生效）

scripts/
├── llm-batch.mjs       ← 离线扩写：模板 + 事实约束 → JSON → 校验 → gen/
├── content-lint.mjs    ← CI 检查：schema / 引用完整性（jobId 存在吗）/ 去重 / 敏感词
└── content-stats.mjs   ← 覆盖率报告：每职业几句台词、每话题几条传闻模板
```

### 7.2 各内容线的生成方式

| 内容 | 模板骨架 | 组合变量 | LLM 角色 |
| --- | --- | --- | --- |
| 角色模板 | archetype（农夫/手艺人/商贩…） | OCEAN 抽样 + 价值观 + 3–5 特质 + 家庭结构 + 秘密池 | 离线扩写 bio/desire/fear/secret，人工审 |
| 职业线 | JobDef + 晋升阶梯 + 任务链模板 | 技能门槛、绩效因子、任务链步骤 | 任务链的叙事文本 |
| 人生主线 | LifeQuestDef（阶段 + 里程碑条件） | 与职业/家庭/秘密绑定 | 里程碑描述 |
| 对话 | language.js 三层（事实→意图→句式）保留 | 话题 × 意图 × 性格 bias × 关系档位 | 运行时润色（§3.6） |
| 传闻 | RumorTemplate：`{subject} 好像 {claim}（{hedge}）` | claim 池 × 传播变异度 | 离线扩写 claim 池 + 运行时变异 |
| 事件模板 | EventTemplate（触发条件 + 参与角色选择器 + 结算效果） | 季节/派系/经济状况组合 | 无（数值不进 LLM） |
| 案件模板 | CaseTemplate（证据链骨架） | 罪犯选择器 × 证据类型 × 严重度 | 案件名/庭审摘要 |
| 建筑蓝图 | BuildingBlueprint（§12） | 模块组合（墙/顶/门窗/功能间） | 无 |

### 7.3 质量门

1. **schema 校验**：`content-lint` 全量过 `validate()`，失败即拒绝入库。
2. **引用完整性**：模板里引用的 jobId/traitId/goalId 必须存在；事件模板引用的 actionId 必须注册。
3. **确定性抽查**：gen 产物参与的组合，用固定种子跑 smoke，断言「同种子同行为」（文本可不同，数值必须一致）。
4. **人工审核**：`gen/*.json` 带 `reviewed` 标记，未审核的内容不进运行时抽样池；审核界面 = 简单 HTML 页（`scripts/review.html`），逐条 ✅/❌。

---

## 8. 社会网络与传播

### 8.1 关系更新表（事件 → 多维矩阵增量；全表在 `data/social/relEffects.js`）

| 事件 | affection | trust | respect | fear | debt | envy | intimacy | rivalry |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 愉快闲聊 | +1.5 | +0.5 | | | | | +0.3 | |
| 争吵 | -4 | -1 | | | | | -1 | +1 |
| 送礼（被收） | +3 | +0.5 | | | +2 | | +0.5 | |
| 合作完成（施工/备课） | +2 | +2 | +1 | | +1 | | | |
| 被对方晋升（同岗） | | | | | | +3 | | +2 |
| 目击对方犯罪 | -3 | -4 | | +2 | | | | |
| 被举报/被捕（对举报者） | -8 | -10 | | +4 | | | | +3 |
| 救助（治病/还债/保释） | +5 | +6 | +2 | | +6 | | +2 | |
| 背叛（泄密/挖墙脚） | -10 | -15 | -5 | | -8 | | -6 | +4 |
| 师徒传艺 | +2 | +3 | +4 | | +2 | | | |

更新带**人格放大器**：`suspicious` 特质让负向 ×1.3、正向 ×0.7；`forgiving`（新增特质）让负向衰减更快。衰减：fear/envy/rivalry 日衰减 2%，debt 不衰减（人情债要还才消）。

### 8.2 关系如何影响行动（查询接口）

```python
# 决策修饰（§3.3 relation_mod 的实现）
talk_utility(target)    += affection * 0.1 + intimacy * 0.2 - fear * 0.3
ask_help_utility(target)+= trust * 0.2 + debt * 0.3          # 欠我人情的更可能被求助
crime_utility(target)   += rivalry * 0.1 - respect * 0.2 - fear_of(守卫) * 0.4
marry_gate(target)       = intimacy ≥ 58 and affection ≥ 55  # 现状阈值的双维化
```

### 8.3 传闻传播

```
事件（visibility != secret 且 severity ≥ 0.3）
  → 目击者在场？生成 Rumor(origin=目击者, credibility=目击者 trust 均值/100)
  → 传闻进入携带者的「话题库存」（hearsay 记忆）
闲聊时：按 arousal × credence 加权抽一条讲给对方
  → 对方生成 hearsay（credence ×0.85 × 对讲述者的 trust/100）
  → mutations+1；mutations ≥ 3 时文本经 LLM/模板变异（事实骨架不变，措辞漂移）
  → credence < 0.15 或 heardBy > 60% 人口 → 传闻死亡
传闻影响：关于某人的传闻会临时性修饰全镇对其的 affection/respect（±severity×5）
秘密（claimType=secret）：只在 trust ≥ 42 的关系间传播（现状阈值保留）
```

### 8.4 网络叠加

社交图不是一张图，是**四张图的叠加**：亲属网（kin/spouse）、职业网（colleague/boss）、派系网（faction）、邻里网（地理）。传播与求助沿不同网走不同概率：家事沿亲属网传得快，行业消息沿职业网传得快。可视化（§14）按网分层渲染，玩家能一眼看出「这条传闻是从酒馆（职业网）还是从阿梨家（亲属网）漏出来的」。

---

## 9. 表现层：总架构与 UI/UX 信息架构

### 9.1 GameEvent → PresentationRouter → 反馈通道

```
模拟层 emit(ev)
   │
   ▼
PresentationRouter (src/present/router.js)     ← 表现层唯一入口，模拟层不可见
   │ classify(ev) → EventPresentation（§9.2）：重要性/通道集合/节流键
   ├── importance ≥ 0.8 ──→ NotificationCenter（强通知 + 音效 + 地图标记脉冲）
   ├── importance ≥ 0.5 ──→ 日志 + 地图标记 + 相关 NPC 动画槽（至少两项 ✓）
   ├── importance ≥ 0.2 ──→ 日志 + 轻反馈（飘字/气泡）
   └── importance <  0.2 ──→ 仅日志（合并折叠，现状 sim.log 的去重逻辑下沉到这里）
   │
   ├──→ UI 通道        面板脏标记（不直接改 DOM，0.25s 节流批刷）
   ├──→ Map 通道       标记增删/脉冲/热力图脏格
   ├──→ Animation 通道 向 NPC 的 locomotion.anim.slots 写一次性动作（§11）
   ├──→ VFX 通道       粒子/浮字请求（对象池）
   ├──→ SFX 通道       合成音效（现状 audio.js 扩展事件映射表）
   └──→ Replay 通道    回放记录器（事件 + 镜头快照 hint）
```

**约束（对应「重要事件至少两项反馈」）**：`EventPresentation.channels` 数组长度 ≥2 是 lint 规则；`feedbackPlan` 由数据定义（`data/present/feedback.js`），新增事件 kind 必须登记，否则 content-lint 报错。

**优先级与节流**：每个通知带 `throttleKey`（如 `theft:${npcId}`），同 key 250ms 内合并为一条（计数 ×N）；通知中心同时最多 5 条，溢出进「还有 N 条」聚合；批处理：UI 通道的脏标记按面板聚合，0.25s 一次性重渲染（现状 `ui.update` 模式泛化）。

**回放**：ReplayRecorder 存「事件流 + 每 5s 世界快照哈希」，回放时以事件流驱动镜头与动画重演（不是录屏，是**可暂停、可跳转、可沿因果链导航**的事件重演）。

### 9.2 EventPresentation schema

```jsonc
{
  "$id": "EventPresentation",
  "type": "object",
  "properties": {
    "eventId": { "type": "string" },
    "importance": { "type": "number" },        // 0..1 = severity × 玩家相关度 × 距离衰减
    "channels": { "type": "array", "minItems": 2,
      "items": { "enum": ["notify","marker","anim","vfx","sfx","log","camera"] } },
    "throttleKey": { "type": "string" },
    "notify":  { "$ref": "#/$defs/NotificationDef" },
    "marker":  { "$ref": "#/$defs/MapMarker" },
    "anim":    { "type": "object", "properties": {
                   "npcId": {}, "slot": {}, "until": {} } },
    "vfx":     { "$ref": "#/$defs/VFXEventDef" },
    "sfx":     { "type": "string" },           // → data/audio map
    "logKind": { "type": "string" }
  }
}
```

### 9.3 UI/UX 信息架构（渐进披露，防信息过载）

```
顶栏 HUD（常驻，≤1 行）
├── 时钟 + 季节 + 天气（现状）
├── 速度/暂停（现状）
├── 资源胶囊：木/石/粮/种/公账（hover 展开供需曲线）
└── 警报铃铛：importance ≥0.8 的未读计数 → 点击开通知中心

左：画布（地图 §10）            右：上下文侧栏（430px，§9.4）
底部：操作条（现状，扩「建造模式/地图模式」两个模式开关）

通知中心（抽屉，从右缘滑出）
├── 未读列表（重要性排序，可一键全读）
├── 每条：[图标] 一句人话 + 时间 + [定位] [因果链] [相关人]
日志页（现状保留 + 搜索/筛选/导出）
```

**渐进披露三原则**：
1. **默认只给结论，深挖永远多一步**：居民列表只有名字/此刻/心情条；点开才有 13 个标签页（见下）；标签页里每块数据都能再点开看来源（记忆条目 → 来源事件 → 因果链）。
2. **数字分级显示**：条（0–100）→ 档位词（糟糕/偏低/不错/极好）→ 精确值（hover/按住 Alt）。默认渲染档位词，数字不刷屏。
3. **同屏信息上限**：气泡 ≤3（现状保留）、通知 ≤5、标记 ≤12（超出按重要性聚合为「区域簇」）。

**角色详情 13 标签页**：概览 / 需求 / 情绪（PAD 三维 + 底色）/ 技能 / 关系（矩阵 + 图）/ 记忆（时间线）/ 职业（绩效 + 晋升线 + 任务链）/ 人生主线（LifeQuest 进度）/ 家庭（Household 成员 + 矛盾）/ 政治（派系 + 投票记录）/ 教育（学籍 + 课程 + 学位）/ 法律（前科 + 在办案件 + 再犯风险）/ 健康（病症 + 创伤）。**不是全部平铺**：无内容的标签页自动隐藏（单身无案件的人不会出现「法律」页红点）。

**社会面板**（侧栏第 5 页签）：关系图 / 家庭树 / 派系图 / 案件链 / 建造项目——五张社会视图共用一个「图浏览器」组件（§14.2）。

### 9.4 导航与输入

| 输入 | 约定 |
| --- | --- |
| 键鼠 | 现状全套（点击/右键/滚轮/WASD/快捷键）+ `Tab` 在「画布 → 侧栏 → 操作条」三区间循环焦点；`Ctrl+F` 全局搜索（人/建筑/事件） |
| 手柄（可选层） | 左摇杆平移、右摇杆光标（虚拟指针）、A 确认/互动、B 取消/返回、LB/RB 切侧栏页、十字键切速度 |
| 触屏（可选层） | 单指平移、双指缩放、点按=点击、长按=悬停卡/上下文菜单；底部操作条高度 ≥48px |

**确认与撤销**：所有「花钱/花资源/不可逆」操作二次确认（现状 confirm 换成统一确认条）；建造在图纸未开工前可撤销退款（`build.cancelled` 事件）；误删/误令 5s 内 toast 带「撤销」按钮（Command 反向执行，仅限无副作用类）。

### 9.5 可访问性 AccessibilitySettings

```jsonc
{
  "$id": "AccessibilitySettings",
  "type": "object",
  "properties": {
    "colorBlind": { "enum": ["off","protan","deutan","tritan"] },  // 调色板整体替换（含季节板）
    "fontScale": { "type": "number", "minimum": 0.85, "maximum": 1.6 },
    "reduceMotion": { "type": "boolean" },   // 关镜头震动/脉冲/粒子，动画减帧
    "screenReader": { "type": "boolean" },   // aria-live 播报通知与日志，画布挂文本替身（最近 10 条事件）
    "keyboardOnly": { "type": "boolean" },   // 全功能键盘可达（焦点环 + 快捷键表）
    "subtitleScale": { "type": "number" }    // 气泡字号独立缩放
  }
}
```

默认 `prefers-reduced-motion` 媒体查询自动开启 reduceMotion；色盲模式下「绿/红放置预览」同时用 ✓/✗ 形状区分（不只靠颜色）。

### 9.6 本地化

- 文案全部走 `t(key, vars)`（`src/i18n/index.js`），语言包 `data/i18n/zh-CN.js`（唯一内置语言，结构上预留多语）。
- **生成文本的本地化**：句式模板在语言包内，不在代码里；LLM 润色指令带目标语言。
- 数字/日期/姓名序按语言包规则；存档内只存 key 与参数，不存渲染后字符串（memory.text 例外——它是内容，随语言包生成时落定）。
- UIWidgetDef：侧栏每个信息块是声明式 widget，布局/显隐/权限都由数据驱动：

```jsonc
{
  "$id": "UIWidgetDef",
  "type": "object",
  "properties": {
    "id": { "type": "string" }, "panel": { "type": "string" },
    "title": { "type": "string" },                // i18n key
    "binds": { "type": "array", "items": { "type": "object",
      "properties": { "path": {}, "format": { "enum": ["bar","tier","num","text","chips","timeline"] } } } },
    "visibleIf": { "type": "string" },            // 表达式："npc.legal.records.length > 0"
    "drilldown": { "type": ["string","null"] }    // 点击钻取目标（事件链/图视图 id）
  }
}
```

---

## 10. 地图系统

### 10.1 多图层模型

```
LayerStack（自下而上）
├── ground     地形（现状 tiles.terrain + 季节调色板）
├── height     高度场（v2：坡度/台地，影响移动代价与视线；v1 全 0）
├── zone       区域标签（住宅/商业/农田/林地/公地 + 自定义命名区）
├── road       道路网（含路况等级，寻路代价系数）
├── navmesh    导航层：tile walkable 缓存 + 动态障碍掩码（施工围栏/集会封路）
├── buildable  可建造网格（zoning 许可 × 地形 × 产权）
├── parcel     分区与产权（plotId → Deed；地界描边渲染）
├── interior   室内层（进入建筑时切换，§10.4）
├── roof       屋顶层（俯视默认显示，进入/悬停建筑时淡出）
└── overlay    昼夜/天气/迷雾/标记/热力图
```

```jsonc
// TileDef（现状 tile 对象扩展，保持 tiles[y*w+x] 连续数组，cache 友好）
{ "$id": "TileDef", "type": "object", "properties": {
  "terrain": { "enum": ["grass","path","water","soil","floor","stump","sand","road","wall"] },
  "height": { "type": "integer", "default": 0 },
  "zoneId": { "type": ["string","null"] },
  "parcelId": { "type": ["string","null"] },
  "buildingId": { "type": ["string","null"] },
  "obj": { "type": ["object","null"] },
  "crop": { "type": ["object","null"] },
  "nav": { "type": "object", "properties": {
      "walkable": { "type": "boolean" }, "cost": { "type": "number", "default": 1 },
      "dynamicBlock": { "type": "integer", "default": 0 } } },   // 引用计数，施工/集会 +1/-1
  "door": { "type": ["object","null"], "properties": { "to": {}, "locked": {}, "permitId": {} } },
  "fog": { "enum": ["visible","dim","hidden"] } } }

// MapLayerDef：图层的渲染与更新策略声明
{ "$id": "MapLayerDef", "type": "object", "properties": {
  "id": {}, "zIndex": { "type": "integer" },
  "visibleIf": { "type": "string" },             // "mode !== 'interior' || layer !== 'roof'"
  "dirtyPolicy": { "enum": ["static","daily","perEvent","perFrame"] },
  "render": { "type": "string" } } }             // → render/layers/*.js 函数名
```

### 10.2 寻路与动态障碍

- 静态寻路沿用现状四方向 A*，代价从 `nav.cost` 读（道路 0.8 / 草地 1 / 泥地 1.4）。
- 动态障碍：`dynamicBlock` 引用计数；施工开始 +1（围栏格）、集会事件对广场格 +1。A* 每 0.5s 对「受影响区域」做增量重算（只重算穿过脏区的在途路径）。
- **多层寻路**（v2 室内/高度）：分层图 + 传送边（门/楼梯 = 层间边，代价 = 通行时间）。门状态（locked/permit）在寻路前置过滤，走不到门 ⇒ 直接报 `unreachable(doorLocked)` 进重规划。
- **路径预览**：玩家点击目的地时显示路径虚线（现状玩家已有），NPC 在 `P` 调试模式下显示全员路径（现状 showPlans 保留）。

### 10.3 热力图模式（分析视图）

| 模式 | 数据源 | 更新层 |
| --- | --- | --- |
| 政治 | 派系立场 × 住户聚合 | Day |
| 犯罪 | 案件发生地 × 严重度 × 时间衰减 | 事件触发 + Day 衰减 |
| 家庭 | Household 分布 + grievance 热度 | Day |
| 经济 | 价格热度 / 委托密度 / 租金 | Day |
| 教育 | 学位密度 / 在学率 | Week |
| 建造 | 施工项目进度 / 缺陷率 | 事件触发 |
| 舆情 | 传闻密度 × 情感均值 | 事件触发 |

实现：统一 `HeatmapLayer { grid: Float32Array(20×15), palette, legend, min, max }`，由各系统往网格累加，渲染层调色板映射 + 半透明叠加；降采样 2×，200 NPC 下每次重算 <1ms。热力图模式与普通模式共享镜头，叠加图例与时间轴（可拖回放联动）。

```jsonc
{ "$id": "HeatmapLayer", "type": "object", "properties": {
  "id": {}, "label": {}, "gridW": {}, "gridH": {},
  "accumulate": { "type": "string" },            // 事件→权重的映射表 id
  "decayPerDay": { "type": "number" },
  "palette": { "type": "array", "items": { "type": "string" } } } }
```

### 10.4 室内外切换与小地图

- 点击建筑 → 镜头「推门」：屋顶层淡出 → interior 层淡入（300ms 交叉淡化），室内显示家具/交互点/人物；Esc 或点击室外返回。
- 小地图（右上角 160×120，可折叠）：整镇缩略 + 视口框 + 标记点；点击跳转镜头。
- 迷雾（可选模式）：未到访区域 dim；玩家/居民足迹逐步揭开。

### 10.5 地图标记

```jsonc
{ "$id": "MapMarker", "type": "object", "properties": {
  "id": {}, "kind": { "enum": ["event","crime","build","quest","rumor","custom"] },
  "x": {}, "y": {}, "icon": {}, "label": {},
  "pulse": { "type": "boolean" },                 // 重要事件脉冲扩散圈
  "clusterKey": { "type": ["string","null"] },    // 同 key 超限时聚合为簇
  "ttl": { "type": "integer" }, "onClick": { "type": "string" } } }   // 跳转/打开面板动作
```

### 10.6 性能

地形渲染已按 tile 绘制；优化：ground/road 层离屏预渲染成 2 张大缓存画布（季节/天气变化时重绘），每帧 `drawImage`；动态层（标记/VFX/人物）单独画布叠加。建筑按「镇区分块」（4 块 20×15）分块加载与脏矩形重绘。

---

## 11. 动画与动效

### 11.1 状态机（数据驱动）

现状 `art.chibi`（走/站/坐）扩为**声明式动画状态机**（`data/anim/states.js`），渲染器每帧读 `locomotion.anim`，**表现层不推状态，只消费**：

```jsonc
{ "$id": "AnimationStateDef",
  "type": "object", "properties": {
    "id": { "enum": ["idle","walk","sit","work","eat","talk","sleep","carry",
                     "argue","escort","build","tend","celebrate","cower"] },
    "frames": { "type": "integer" }, "fps": { "type": "number" },
    "loop": { "type": "boolean" },
    "transitions": { "type": "object" },          // {toState: {blend: ms, rule}}
    "skeleton": { "type": "object" },             // 头/身/手/道具的逐帧偏移（2D 纸片骨骼）
    "emotes": { "type": "array", "items": { "type": "string" } } } }
```

**混合与过渡**：状态切换带 80–150ms 混合（位移/缩放插值），同族状态（walk↔carry）直接切帧不闪。表情/口型：头部叠加层（3 种嘴型 × 5 种眉），由 `talk` 状态 + PAD.arousal 驱动；头顶气泡沿用现状（含换行/错层规则）。

**事件驱动动画槽**：`anim.slots[]` 是一次性叠加动作（wave/clap/flinch/bow），由 PresentationRouter 按事件写入，播完自动移除；与底层状态机正交（走路中也能挥手）。

### 11.2 抽象动画（工作/社交/冲突/司法）

| 场景 | 抽象表现 |
| --- | --- |
| 工作 | 工位循环小动作 + 进度环（现状 build 进度条的通用化） |
| 社交 | 面对面站位（§13.4）+ 气泡 + 情绪图标（PAD 标签符号化） |
| 冲突 | 对峙（相向、红色轮廓脉冲）→ 和解（互相转身离开）或升级（司法接管，画面收敛） |
| 司法 | 逮捕=escort（守卫在前、嫌犯跟随、低头）；审判=镇公所内三人座位构图；severity ≥4 **只用图标+文字呈现结果**，不渲染过程（产品边界） |
| 仪式 | 婚礼/丰收祭：celebrate 群动画 + 粒子 |

### 11.3 携带物与伪 IK

携带物挂 `anim.prop`（背袋/木料/餐盘 sprite），位置随手部关键帧表偏移（每状态一张手部位移表）；不做真 IK，2D 像素下「手部挂点 + 逐帧偏移」足够，成本为零依赖。

### 11.4 UI 动效与反馈

- 通知从右缘滑入堆叠（新在上），5s 自动沉降为日志；hover 暂停计时。
- 地图标记脉冲：新标记 3 圈扩散；可点击标记呼吸闪烁。
- 关系变化飘字：事件发生时在两人之间飘「+信任」「-好感」（小字、800ms、对象池）。
- 建造进度：脚手架帧序列 + 进度环 + 完成时 dust 粒子 + 镜头轻震（juice.js 保留，可关）。
- 镜头反馈：震动/推镜仅 importance ≥0.6 事件触发，`reduceMotion` 下全部禁用（§9.5）。
- **动画 LOD**：L0 全状态机；L1 只 idle/walk；L2 不渲染。对象池：飘字 64、粒子 256、标记 32 复用；精灵全部进一张图集（`art/atlas.js` 生成），同贴图 drawCall 合批。

---

## 12. 建筑系统

### 12.1 模块化蓝图

现状「单格图纸 → 整栋装饰」升级为**模块组装**：蓝图 = 地基矩形 + 模块列表（墙段/地板/门/窗/屋顶/功能间/家具/装饰）。v1 保持整栋蓝图（酒馆/诊所式预制），但数据结构按模块化设计，v2 开放自由拼装。

```jsonc
// BuildingBlueprint
{ "$id": "BuildingBlueprint", "type": "object", "properties": {
  "id": {}, "name": {}, "kind": { "enum": ["house","shop","workshop","civic","decor"] },
  "footprint": { "type": "object", "properties": { "w": {}, "h": {} } },
  "modules": { "type": "array", "items": { "type": "object", "properties": {
      "type": { "enum": ["wall","floor","door","window","roof","room","furniture","decor"] },
      "x": {}, "y": {}, "w": {}, "h": {}, "defId": {} } } },
  "rooms": { "type": "array", "items": { "type": "object", "properties": {
      "name": {}, "tiles": {}, "function": { "enum": ["bedroom","kitchen","shop","clinic","hall","cell"] },
      "capacity": { "type": "integer" } } } },
  "cost": { "type": "object" }, "stages": { "type": "array",
    "items": { "enum": ["foundation","frame","roof","fitout"] } },
  "permitKind": { "type": "string" },
  "comfort": {}, "privacy": {}, "safety": {}, "maintenance": { "type": "number" } } }

// BuildingInstance（世界里的实体）
{ "$id": "BuildingInstance", "type": "object", "properties": {
  "id": {}, "blueprintId": {}, "plotId": {}, "ownerId": {}, "deedId": {},
  "status": { "enum": ["blueprint","building","active","damaged","condemned"] },
  "condition": { "type": "number" },              // 0..100 维护度，日衰减，低于 30 报修
  "projectId": { "type": ["string","null"] },     // 在建 → BuildProject
  "tenants": { "type": "array", "items": { "type": "string" } },
  "rent": { "type": "number" },
  "interactionPoints": { "type": "array", "items": { "type": "string" } } } }

// FurnitureDef / InteractionPointDef 见 §13
```

### 12.2 施工管线（事件驱动、可视化）

```
planning → permit（申请费 + 审批 tick，政策可改费率）
→ funding（材料清单 → 市集采购/委托，产生运输动作：NPC 搬木料沿街走，可见）
→ building：foundation(20%) → frame(45%) → roof(70%) → fitout(100%)
   每阶段：脚手架外观、工人 build 动画、进度环；事故率 = f(工人技能, safety)
→ inspection（验收：defects 概率 = f(赶工, 技能)；缺陷 → 返工阶段）
→ done：onDecorBuilt → 产权登记（Deed）→ 入住/招租/开业事件
```

损坏/维修：condition 日衰减（天气加成）；<30 触发「待维修」标记 + 木匠委托任务；<10 condemned（不可用，居民搬出事件）。施工安全：`safety` 由工头技能与政策（安全条例）决定，事故 → 司法/医疗联动。

### 12.3 产权与许可可视化

- parcel 层地界描边：自有（金）/ 公有（灰）/ 他人（暗）；hover 显示 Deed 卡（业主/抵押/租金）。
- 许可：无证施工 = 红色警示标记 + 巡查事件链；许可状态在建造面板时间线展示（申请→审批→施工→验收）。

### 12.4 建筑 LOD 与分块

L0 视口内全细节（室内可进入）；L1 邻屏外观完整、室内冻结；L2 远屏只画轮廓色块 + 状态图标；数据按 20×15 区块分包，镜头跨块时异步（`requestIdleCallback`）解码。

---

## 13. 人物与实体互动

### 13.1 交互点模型

一切可交互物（工作台/门/床/椅子/货架/施工点/证据点/祭坛）都是 `InteractionPoint`，有**容量、权限、状态机**：

```jsonc
// InteractionPointDef
{ "$id": "InteractionPointDef", "type": "object", "properties": {
  "id": {}, "kind": { "enum": ["seat","bed","bench","counter","stall","door",
                               "workstation","altar","construction","evidence","stage"] },
  "buildingId": {}, "x": {}, "y": {}, "capacity": { "type": "integer", "default": 1 },
  "allowedActions": { "type": "array", "items": { "type": "string" } },
  "permission": { "enum": ["public","resident","staff","owner","permit"] },
  "state": { "enum": ["free","occupied","reserved","locked","broken"] },
  "queue": { "type": "array", "items": { "$ref": "#/$defs/Reservation" } } } }

// Reservation：预约/占用的凭据
{ "$id": "Reservation", "type": "object", "required": ["npcId","pointId","from","to"],
  "properties": {
    "npcId": {}, "pointId": {},
    "from": { "type": "integer" }, "to": { "type": "integer" },   // tick 区间
    "kind": { "enum": ["occupy","reserve","queue"] },
    "groupId": { "type": ["string","null"] },     // 多人同步互动组
    "interruptible": { "type": "boolean" } } }
```

### 13.2 占用/预约/排队伪代码（`src/sim/interactions.js`）

```python
def acquire(npc, point, action, sim):
    if not permitted(npc, point): return fail('forbidden')      # 权限：居民/雇员/持许可
    if point.state == 'broken':   return fail('broken')
    if occupancy(point) < point.capacity:
        point.queue.push(Reservation(npc, kind='occupy', from=now, to=now+action.dur))
        point.state = 'occupied'; return ok
    if action.queuable:                                          # 可排队动作（买饭/看病）
        eta = earliest_free(point)
        if eta - now <= action.maxWait:                          # 等得起才排
            point.queue.push(Reservation(npc, kind='queue', from=eta, to=eta+action.dur))
            npc.plan.insert(WaitStep(until=eta, at=nearby(point)))
            return ok
    return fail('busy', retryAfter=estimate(point))              # 进重规划（§3.3）

def release(npc, point, reason):                                 # 完成/中断/被打断统一释放
    point.queue.remove(r for r.npcId == npc)
    promote_queue(point)                                         # 队首转 occupy，通知其 BT
    if empty(point.queue): point.state = 'free'
    emit('interaction.released', {npc, point, reason})           # 中断原因进因果链
```

**到达→占用→动画→效果→释放**：BT 的 DoAction 节点标准化这五步：MoveTo(point) → acquire → anim 状态写入（坐下/操作）→ 每 tick 结算效果（吃饭回血、工作产出）→ release。中断（order/fear/needCritical）→ 写 `ActionCall.resume` → release(reason) → 恢复时若点仍可用且时间窗未过，直接 resume 到原进度。

### 13.3 多人同步互动（InteractionGroup）

婚礼、合奏、围炉夜话、押解：一个 `groupId` 把多个 Reservation 绑成一组——**同步开始**（全员到齐才开场，等人阶段各播 idle/sit）、**同步推进**（共享进度条，动画槽对齐）、**一人中断则组降级**（婚礼变尬聊，事件记录「被谁搅了」）。失败反馈：组不成时主持者收到明确原因（「新郎还在田里」），进重规划。

### 13.4 面对面社交姿势

聊天/争吵开始时，参与者互相转向（facing 对齐）、间距对齐到 1.2 格；群体对话围半圆（按到场序取位）。这些只是表现层排布，不改模拟坐标——松开时回到原格。

### 13.5 目击与举报的抽象可视化

犯罪动作发生时，对视线内的旁观者：头顶「！」图标 → 2s 内决定举报（向守卫走）或沉默（眼神躲闪动画槽）；玩家看到的是**可读的因果**：谁看见了、谁去报了、谁装没看见（`fear`/`debt` 驱动的沉默也是事件）。隐私保护：室内发生的事件 visibility=private，不生成目击，除非门开着（door 状态参与判定）。

---

## 14. 调试与可视化

### 14.1 原则：每个行为都能回答六个问题

为什么做（plan.why + 打分明细）/ 前置条件（ActionDef.preconditions 哪条不满足）/ 效果（结算增量）/ 冷却（剩余 tick）/ 优先级（utility 得分与排名）/ 中断条件（触发日志）。全部来自 `_debug` 快照，**不入侵决策路径**（只读）。

### 14.2 面板清单（`?debug=1` 开启，独立 overlay，不进存档）

| 面板 | 内容 | 数据源 |
| --- | --- | --- |
| 动机面板 | 候选目标 utility 榜、每项修饰加减分、最终 why | `npc._debug.scores` |
| 计划/BT 视图 | 当前 plan 步骤 + BT 节点状态（running/success/failure 色块） | plan + BT trace |
| 关系图 | 力导向图，八维边可切换着色，四网分层（亲属/职业/派系/邻里） | RelationshipMatrix |
| 家庭树 | 谱系树 + Household 矛盾热度 | Household |
| 派系图 | 派系立场四维奇异值 + 成员影响力 | Faction |
| 案件链 | Case 状态机流转 + 证据强度累积曲线 | JusticeSystem |
| 建造进度 | 项目时间线（许可→材料→阶段→验收） | BuildProject |
| 记忆时间线 | 横轴时间、纵轴 valence，点=记忆（大小=strength），点击看来源事件 | memory[] |
| 行为日志 | 全量事件表：筛选（人/kind/严重度）+ 文本搜索 | EventBus |
| 事件因果图 | 从任一事件展开 parent/children 双向往返（§5.3） | parentEventId 链 |
| 地图热力图 | §10.3 七模式 + 时间轴拖拽 | HeatmapLayer |
| 动画调试 | 状态机当前态高亮、slot 列表、帧率 | locomotion.anim |
| 交互点热力 | 占用率/排队长度/拒绝原因 TOP | InteractionPoint 统计 |
| 回放 | 事件流重演：播放/暂停/步进/跳事件/沿因果链导航，镜头自动跟主角 | ReplayRecorder |

### 14.3 回放格式

```jsonc
{ "seed": 20261123, "version": 2,
  "snapshots": [{ "tick": 0, "hash": "…", "stateRef": "checkpoint-0" }],   // 每 5s 一个
  "events": [ /* Event[]，环形 5000 */ ] }
```
回放 = 从最近 checkpoint 重建世界 → 按事件流快进重演。断言工具：`replay.assert(tick, invariant)` 可写进 smoke（例：「tick 1000 时全镇无 NaN」）。

---

## 15. MVP 分阶段与验收

> 现状已完成：8 NPC 闭环（需求/目标/记忆/关系/学习/生成式对话）、政治/经济/神迹雏形、四季、可玩性批次。以下为「深化」的增量阶段。每阶段验收 = smoke/verify 断言 + 可观察标准，沿用现有两套测试基座。

### 阶段 1：10 NPC · 职业 + 家庭闭环（4 周）

范围：Character 组件化迁移、CareerTrack（8 职业 + 各 1 条晋升线）、Household（恋爱/结婚/生育/矛盾）、LifeQuest（每人 1 条）、交互点（床/工位/柜台）、事件总线 + 因果链 v1、动机面板 + 关系图 + 记忆时间线。
验收（可量化）：
- smoke 新增：晋升事件 ≥2 起/20 天；家庭 grievance 触发与消解各 ≥1 次；LifeQuest 里程碑 ≥5 个/20 天；存档往返后 CareerTrack/Household 无漂移。
- 因果链：随机抽 10 个 severity≥0.5 事件，上游链完整率 100%。
- 性能：10 NPC 帧均模拟 ≤2ms。
- 可解释：动机面板展示 ≥8 个候选目标的打分明细；任意行为能答六问（§14.1）。

### 阶段 2：50 NPC · 政治/教育/犯罪抽象 + 表现层（6 周）

范围：移民/生成管线扩容到 50、派系/舆论/抗议、课程制教育、司法链（目击→立案→审判→服刑）、传闻传播、通知中心、热力图 4 模式（政治/犯罪/经济/舆情）、动画状态机全量 + 事件槽、建造模式（许可 + 施工阶段 + 产权）、回放 v1。
验收：
- smoke：选举换届时派系席位有变化的种子占比 ≥60%（10 种子跑批）；课程出勤 → 学位 ≥3 人/28 天；完整案件链 ≥3 起/28 天（含一次审判）；传闻 3 手传播 credence 衰减曲线符合公式（±5%）。
- 通知合并：同 throttleKey 250ms 内只出 1 条；同屏标记 ≤12（超出自动聚合）。
- 重要事件「通知+标记」双反馈覆盖率 =100%（lint 静态检查 + 运行时抽查）。
- 性能：50 NPC 帧均 ≤5ms；热力图重算 ≤1ms。
- 回放：从第 3 天 checkpoint 重演到第 4 天，世界哈希与实时运行一致（确定性）。

### 阶段 3：200 NPC · LOD + 规模化 + 可访问性（8 周）

范围：LOD 全档、网格空间索引、分片大层、室内/室外切换、多人同步互动（婚礼/集会/押解）、可访问性全套（色盲/字号/减动效/读屏/键盘）、手柄与触屏导航层、内容管线 CI（lint + 审核页）、回放 v2（因果链导航 + 导出）。
验收：
- 性能：200 NPC 帧均模拟 ≤8ms、渲染 ≤10ms（60fps）；Day 层分片后峰值 ≤15ms；内存（存档）≤8MB。
- LOD：L2 抽象结算与 L0 全量在需求维度上 7 天漂移 ≤5%（对照实验种子）。
- 多人互动：婚礼组同步开始/一人中断降级，事件链完整率 100%。
- 可访问性：键盘可完成「选人→交谈→下指令→建造」全链路；色盲三模式下放置预览可区分（✓/✗ 形状）；reduceMotion 下无镜头震动与脉冲。
- 内容：职业 ≥12、人生主线模板 ≥20、传闻模板 ≥120（人工审核入库率 ≥90%）。

---

## 16. 文件与接口清单（可直接开写）

### 16.1 新增/改造地图（相对仓库根）

```
src/
├── core/
│   ├── eventBus.js          新增  EventBus（emit/flush/subscribe/replay 环形缓冲）
│   └── validate.js          新增  60 行 JSON Schema 校验器（type/enum/range/required）
├── model/
│   ├── character.js         改造  npc → 组件化 Character（保留旧字段别名一个版本）
│   └── schemas.js           新增  §2 全部 schema 的 JS 内联定义（供 validate）
├── ai/
│   ├── decide.js            新增  §3.3 决策循环（感知→生成→评分→计划）
│   ├── htn.js               新增  goal→method→primitive 展开器（吸收现 goals.js）
│   ├── goap.js              新增  兜底规划器（预算 200 节点）
│   ├── bt.js                新增  行为树执行器（MoveTo/DoAction/Wait/Check）
│   ├── actions.js           新增  Action 注册表（吸收现 applyEffect 大 switch）
│   └── llmGate.js           改造  llm.js 扩展：schema 校验/缓存/预算/离线管线
├── social/
│   ├── relations.js         新增  八维矩阵 + 事件更新表（吸收现 social.js 一部分）
│   ├── rumor.js             新增  传闻生成/传播/衰减
│   ├── career.js            新增  §4.1（吸收现 economy 工资/绩效片段）
│   ├── family.js            改造  society.js 恋爱婚育部分迁入 + Household
│   ├── politics.js          改造  现 politics.js 迁入 + Faction/Policy/舆论
│   ├── education.js         改造  现学堂逻辑迁入 + Course/学位
│   ├── justice.js           改造  现犯罪/拘捕迁入 + Case/证据/审判
│   └── media.js             新增  §4.7 可选层（镇报/节庆）
├── sim/
│   ├── interactions.js      新增  §13 交互点（acquire/release/queue/InteractionGroup）
│   ├── scheduler.js         新增  §6.1 分层 tick + 分片 + LOD 分档器
│   └── spatial.js           新增  网格空间索引
├── present/
│   ├── router.js            新增  §9.1 PresentationRouter（分类/节流/批处理）
│   ├── notify.js            新增  通知中心 + 合并规则
│   ├── markers.js           新增  地图标记 + 聚合簇
│   ├── heatmap.js           新增  §10.3 热力图网格 + 调色板
│   ├── animSM.js            新增  §11 动画状态机解释器（读 data/anim/states.js）
│   └── replay.js            新增  §14.3 回放器
├── persist/
│   ├── snapshot.js          改造  toJSON/restore → 组件级 + version 2
│   └── migrations.js        新增  v1→v2 迁移（旧存档兼容）
└── i18n/index.js            新增  t(key, vars) 与语言包加载

data/
├── actions/*.def.json       新增  §3.4 ActionDef（首批从 applyEffect 21 个动作搬）
├── goals/*.def.json         新增  GoalDef（首批 = 现 7 个 goal + flee/report）
├── ai/tuning.js             新增  全部阈值/权重（从各系统里抽出来）
├── anim/states.js           新增  §11.1 状态机定义
├── social/relEffects.js     新增  §8.1 关系更新表
├── present/feedback.js      新增  事件 kind → 反馈通道映射（lint 强制登记）
├── events/kinds.js          新增  §5.1 事件注册表
└── gen/                     新增  LLM 离线产物（reviewed 标记）

scripts/
├── llm-batch.mjs            新增  离线内容扩写
├── content-lint.mjs         新增  内容 CI（schema/引用/反馈登记检查）
└── review.html              新增  人工审核页
```

### 16.2 关键接口签名（TypeScript 风格，实现为 JS + JSDoc）

```ts
// core/eventBus.js
emit(sim, ev: Partial<Event> & {kind: string}): Event
subscribe(filter: (ev: Event) => boolean, handler: (ev, sim) => void, opts?: {phase: 'sim'|'present'}): void
flush(sim): void                                    // sim.step 末尾调用

// ai/decide.js
decide(npc: Character, sim: Sim, ctx?: {event?: Event}): void   // 主入口（0.5s 层）

// ai/htn.js
htnExpand(goal: GoalDef, npc: Character, sim: Sim): Plan | null  // 方法按序尝试

// ai/goap.js
goapPlan(goal: GoalDef, npc: Character, sim: Sim, budget = 200): Plan | null

// ai/bt.js
btTick(npc: Character, sim: Sim): 'running'|'success'|'failure'  // 每 tick 一步
btAbort(npc: Character, reason: InterruptKind): ResumeSnapshot

// ai/actions.js
registerAction(def: ActionDef): void
settle(npc: Character, call: ActionCall, sim: Sim): Outcome      // 唯一改状态的出口

// sim/interactions.js
acquire(npc, point: InteractionPoint, action: ActionDef, sim): AcquireResult
release(npc, point, reason: string, sim): void
formGroup(def: GroupDef, members: npcId[], sim): InteractionGroup

// social/relations.js
applyRelEvent(ev: Event, sim): void                 // §8.1 表驱动
relBetween(a: npcId, b: npcId, sim): RelVector

// present/router.js
route(ev: Event, sim): EventPresentation            // 只读，产出反馈计划

// persist/snapshot.js
save(sim): SaveV2                                    // {version:2, components, eventTail}
load(json): Sim                                      // 自动走 migrations
```

### 16.3 迁移顺序（每步独立可交付、全程绿测试）

1. **EventBus + validate + feedback 登记表**（1 天）：先把 `sim.log` 与气泡变成订阅者，行为不变，打通「事件即真相」的地基。
2. **Character 组件化 + migrations**（2 天）：旧存档无损升级，smoke 的存档断言自动覆盖。
3. **Action 注册表**（2 天）：applyEffect 21 个 case 平移，行为逐一对比（同种子 diff 日志应为空）。
4. **decide/htn/bt**（3 天）：goals.js 数据化；BT 接管 step 执行；动机面板同步上线（它需要的数据正是这一步产生的）。
5. **交互点**（2 天）：床/工位/柜台先行，排队与中断恢复闭环。
6. **关系八维 + 传闻**（3 天）：relEffects 表 + rumor 模块 + 关系图面板。
7. 之后按 §15 阶段推进职业/家庭/政治/教育/司法/建造/表现层。

---

## 附：不可妥协清单（验收红线）

1. 同种子确定性：任何 LLM/内容变化不得改变数值路径（smoke 断言守护）。
2. 每个行为可答六问（为什么/前置/效果/冷却/优先级/中断），缺一项算 bug。
3. 重要事件双反馈（§9.1），lint 强制。
4. 一切状态可序列化，存档带版本与迁移链；回放哈希一致才算确定性达标。
5. 丰富度只许「加数据」，不许「加分支」：review 时见到为单一内容写的 if-else 一律打回。
6. 表现层零回写：渲染/动画/UI 代码里出现对模拟状态的赋值即打回。

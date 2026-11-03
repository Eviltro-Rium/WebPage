# AGENTS.md · Furry Trial 仓库协作说明

本文件面向在本仓库中工作的 AI/人类协作者。目标是让你在不破坏静态部署、脚本加载顺序和既有规则的前提下，快速找到改动位置、跑对验证命令，并同步文档。

> 文档语言：中文优先。代码注释、提交说明和规则文档沿用仓库现有的中文风格。

## 1. 先读什么

按任务类型选择入口：

| 任务 | 先读 |
| --- | --- |
| 总体架构 / 分层 / 重构边界 | [`game/docs/ARCHITECTURE.md`](game/docs/ARCHITECTURE.md) |
| 攻击、防御、状态、判定牌结算 | [`game/docs/reference/COMBAT_SETTLEMENT.md`](game/docs/reference/COMBAT_SETTLEMENT.md) |
| Buff / Debuff 定义与触发 | [`game/docs/reference/buff_guide.md`](game/docs/reference/buff_guide.md) |
| 卡牌、牌库、弃牌规则 | [`game/docs/reference/Cards_deck.md`](game/docs/reference/Cards_deck.md) |
| 跨引擎边界小规则 | [`game/docs/reference/small_rules.md`](game/docs/reference/small_rules.md) |
| 冒险怪物 / 掉落 / 房间 | [`game/docs/adventure_guide/README.md`](game/docs/adventure_guide/README.md) |
| 在线对决 | [`game/docs/online/README.md`](game/docs/online/README.md) |
| 文档总索引 | [`game/docs/README.md`](game/docs/README.md) |

规则文档和代码冲突时，**先确认哪边是本次需求的事实来源**。怪物数值、技能和战利品表通常以 `game/docs/adventure_guide/<scene>.md` 为准；如果需求明确要求改规则，则同时改文档和代码，不要只改一边。

## 2. 项目概览

这是个人网站 + 静态网页卡牌游戏仓库，没有构建步骤，也没有根级 `package.json` 或打包器。浏览器通过原生 `<script>` 顺序加载脚本，所有模块挂在 `window` 全局命名空间下，必须保持 `file://` 可运行。

- 根目录 `index.html`、`projects.html`、`launchpad.html`、`materials.html`、`guestbook.html`、`styles.css`、`js/`：个人网站，不属于游戏逻辑。
- `game/`：Furry Trial 游戏本体。
- `game/index.html`：经典单机入口（1v1 / 1v2 / 领主）。
- `game/adventure/adventure.html`：冒险模式入口。
- `game/online_game/index.html`：在线对决入口。
- `game/docs/`：规则、架构、角色、冒险、在线文档。
- `game/tests/`：Node 内置 `node:test` 测试。
- `game/scripts/`：统一检查和静态脚本加载顺序校验。
- 当前版本标识在 `game/js/version.js`（`3.4`，`IS_TEST = true`）。

## 3. 仓库地图

```text
.
├── AGENTS.md                  # 本文件
├── index.html ...             # 个人网站页面（通常不要动）
├── js/                        # 个人网站脚本
├── game/
│   ├── index.html             # 单机入口
│   ├── script_manifest.json   # 共享脚本清单（测试和加载顺序校验使用）
│   ├── css/ avatars/ icons/ backgrounds/
│   ├── js/
│   │   ├── characters/        # 玩家角色定义
│   │   ├── ai/                # 各角色 AI 策略
│   │   ├── combat/            # 公共协议、引擎、状态、牌堆、适配器
│   │   └── ui/                # 共享 GameUI 与渲染/事件/弹窗
│   ├── adventure/
│   │   ├── adventure.html
│   │   ├── maps/              # 冒险地图 CSV
│   │   ├── js/content/        # 注册表、怪物桥、房间、图鉴文案
│   │   ├── js/monsters/       # 各场景怪物/Boss/精英池
│   │   ├── js/engine/         # 地图运行时、掉落、奖励、商店、故障房、献祭房
│   │   ├── js/items/          # 道具定义与效果注册表
│   │   ├── js/battle/         # AdventureBattleEngine、控制器、骰子边界
│   │   ├── js/save/           # 地图存档
│   │   └── js/ui/             # 冒险 UI 与视图
│   ├── online_game/           # 在线大厅、房间、P2P、信令 Worker
│   ├── tests/                 # 73 个 *.test.js
│   ├── scripts/               # check.js、verify-load-order.js
│   └── docs/                  # 文档
└── node_modules/              # 仅测试依赖（jsdom 等）
```

## 4. 运行与验证

### 4.1 本地打开

项目没有构建步骤：

- 直接双击 `game/index.html` 或 `game/adventure/adventure.html` 可以运行。
- 需要更接近部署环境时，在仓库根目录启动静态服务器：

```bash
python3 -m http.server 8000
# 打开 http://localhost:8000/game/index.html
```

在线房间需要 HTTPS 或 `localhost`，以及 `game/online_game/online_config.js` 中配置的信令地址。

### 4.2 必跑检查

从仓库根目录运行：

```bash
node game/scripts/check.js
```

它会：

1. 运行 `game/scripts/verify-load-order.js`，校验三张页面的脚本路径、顺序和 UI 拆分。
2. 对 `game/` 下所有 JavaScript 执行 `node --check`。
3. 以 `--test-concurrency=1` 运行 25 个稳定测试（协议、事件、AI、状态、回合机、适配器、不变量、在线等）。

完整回归：

```bash
node game/scripts/check.js --all
```

`--all` 会运行 `game/tests/` 下全部 73 个测试。部分旧冒险测试依赖随机掉落或历史牌数断言；如果只有它们失败，先用 `git stash` 或单独运行确认是否为既有问题，不要把无关失败混进本次改动。

### 4.3 单个测试

```bash
node --test game/tests/hypnosis-sleep.test.js
node --test game/tests/defense-effects.test.js game/tests/hypnosis-sleep.test.js
```

测试通常用 `node:vm` 创建上下文，再通过 `game/tests/_load.js` 的 `loadInto()`/`expand()` 按 `script_manifest.json` 分组加载源码；UI 测试使用 `jsdom`。新增测试优先复用这套方式，不要引入新的测试框架。

### 4.4 只校验脚本顺序

```bash
node game/scripts/verify-load-order.js
```

地图重新生成：`node game/adventure/generate_maps.js`（固定种子生成60张 CSV 并同步内嵌地图）；仅同步已编辑的 CSV：`node game/adventure/regen_maps.js`。生成器不加入浏览器脚本清单。

### 4.5 在线信令 Worker

```bash
cd game/online_game/signaling
npx wrangler deploy --config wrangler.jsonc
```

不要从仓库根目录部署 Worker；`wrangler.jsonc` 已独立放在信令目录，避免把 `.git` 和整个仓库作为静态资源上传。

## 5. 架构速查

### 5.1 分层与数据流

```text
页面入口（GameUI / AdventureUI / OnlineUI）
  → CombatSession（Local / Adventure / Online）
  → Engine / AdventureBattleEngine
  → CardEffects / 角色技能 / StatusService / DeckPort / EngineModes
  → engine.emit() 生成结构化事件
  → CombatState.project() 生成快照
  → UI 事件播放器按版本播放
  → acknowledgeEvents() 释放延迟结算和下一阶段
```

核心原则：

- UI 不直接修改 `engine.s`；只读 `state()`/投影，通过 `dispatch` 提交动作。
- 在线层不重新实现卡牌规则；房主运行唯一权威 `Engine`。
- 冒险地图层不创建第二套战斗引擎；战斗统一走 `AdventureBattleEngine`。
- 动画不是权威状态；事件播放期间不能再次改牌堆或生命值。

### 5.2 三个入口

| 页面 | 入口对象 | 会话 |
| --- | --- | --- |
| `game/index.html` | `GameUI` | `LocalCombatSession` → `Bridge` → `Engine` |
| `game/adventure/adventure.html` | `AdventureUI` | `AdventureBattleController` → `AdventureBattleEngine`，再挂载共享 `GameUI` |
| `game/online_game/index.html` | `OnlineUI` | `OnlineHostSession` / `OnlineGuestSession` → 共享 `GameUI` |

### 5.3 战斗域关键文件

| 文件 | 职责 |
| --- | --- |
| `game/js/combat/protocol.js` | `Card`、`CombatEvent` 原子协议 |
| `game/js/combat/state.js` | 状态默认值、纯投影、校验 |
| `game/js/combat/events.js` | 事件/目标/伤害类型常量 |
| `game/js/combat/runtime.js` | 可注入随机数、统一定时器、等待/取消 |
| `game/js/combat/status_registry.js` | Buff/Debuff 元数据、上限、净化、触发时机 |
| `game/js/combat/status_service.js` | 状态写入、clamp、清除、手牌上限修正 |
| `game/js/combat/card_effects.js` | 通用卡牌效果识别/应用注册表 |
| `game/js/combat/deck.js` / `piles.js` / `deck_port.js` | 牌库、弃牌、洗牌和冒险牌库边界 |
| `game/js/combat/modes.js` | 1v1/1v2/lord/adventure 的参与者、目标和不变量视图 |
| `game/js/combat/attack_buffs.js` | 熔脉/暴击等攻击修正 Buff 的互斥与消耗策略 |
| `game/js/combat/engine.js` | 经典 1v1 主流程（仍是最大的兼容核心） |
| `game/js/combat/engine_attack.js` | 统一攻击效果暂存、状态公式、潜水/飞翔/守护、命中入口 |
| `game/js/combat/engine_1v2.js` / `engine_lord.js` | 多目标模式扩展 |
| `game/js/combat/turn_machine.js` | 延迟结算和事件确认连续体 |

`Engine` 通过 `Engine.prototype` 扩展协作，不是 ES module。新增逻辑应放进对应扩展文件；只有跨模式通用规则才进 `engine.js`。

### 5.4 冒险域关键文件

| 文件 | 职责 |
| --- | --- |
| `game/adventure/js/engine/adventure_engine.js` | 地图、房间、货币、库存、奖励、商店、铁匠铺、场景历史 |
| `game/adventure/js/engine/loot.js` | 场景/怪物 → D12 → 战利白卡 |
| `game/adventure/js/engine/glitch.js` | 故障房一次性 D12 事件与检查点 |
| `game/adventure/js/engine/sacrifice.js` | 献祭房扣血换道具/升级白卡 |
| `game/adventure/js/battle/battle_engine.js` | `AdventureBattleEngine`，冒险战斗和双牌堆 |
| `game/adventure/js/battle/dice_controller.js` | D12 决策边界（遥控骰子/魔术师） |
| `game/adventure/js/content/monster_registry.js` | 怪物技能到共享战斗引擎的桥接 |
| `game/adventure/js/items/item_defs.js` | 道具/战利白卡/配饰定义 |
| `game/adventure/js/items/combat_effects.js` | 战斗内道具效果注册表 |
| `game/adventure/js/items/map_effects.js` | 地图场景道具效果注册表 |
| `game/adventure/js/save/adventure_save.js` | 地图存档（localStorage） |
| `game/adventure/js/battle/adventure_battle_session.js` | 战斗快照（sessionStorage） |

## 6. 常见改动流程

### 6.1 新增/调整玩家角色

1. `game/js/characters/<name>.js`：登记 `name/hp/type/passive/effect/defend` 等。
2. `game/js/ai/<name>_ai.js`：实现 `attackScore`、`defendScore`、`keepScore`、必要时 `skip`。
3. `game/js/ui/skills.js`：同步技能描述文本。
4. `game/script_manifest.json` 的 `characters` / `ai` 分组。
5. 三张入口页的 `<script>` 与 `?v=` cache query。
6. `game/docs/Characters/<name>.md` 和 `game/docs/Characters/README.md`。
7. 测试：技能、AI、防御、在线投影至少覆盖相关分支。

### 6.2 新增/调整 Buff / Debuff

1. `game/js/combat/status_registry.js`：定义 `id/property/label/icon/polarity/stack/max/cleanse/trigger`；需要时加 `handLimitDelta`。
2. `game/js/combat/status_service.js`：确保写入、clamp、清除走统一入口。
3. `game/js/ui/render/status_render.js` 和 `game/icons/buff_icons/`：图标与显示。
4. `game/js/combat/engine_attack.js` / `engine.js` / 角色技能：只在明确时机触发，不要按描述文本猜。
5. `game/docs/reference/buff_guide.md`。
6. 测试：层数上限、净化、重复施加、攻击/防御/回合触发、在线目标映射。

### 6.3 新增/调整冒险怪物或 Boss

1. `game/adventure/js/monsters/<scene>.js`：`registerMonster`/`registerBoss`，并维护 `AdventureMonsterPool`、`AdventureElitePool`、`AdventureBossPool` 的层数与 `minStage`。
2. `game/adventure/js/content/monster_registry.js`：桥接 `attack*`/`defend*`/阶段修正/技能文本。
3. `game/adventure/js/content/stage_guide.js`：图鉴文案、出现条件和阶段强化。
4. `game/adventure/js/engine/loot.js`：掉落表（区间用包含等号的 `roll <= threshold`；普通 ≤4/12，Boss ≤6/12；精英第 10 面 `DrawTwoTrophy`）。
5. `game/docs/adventure_guide/<scene>.md`、`loot.md`、必要时 `rooms.md`。
6. 测试：基础数值、阶段修正、攻击/防御钩子、掉落边界（1/4/6/10/11/12）、Boss 池层数。

### 6.4 新增冒险道具

1. `game/adventure/js/items/item_defs.js`：`kind` 为 `consumable` / `trophyWhite` / `accessory`。
2. 战斗内效果注册到 `combat_effects.js`，地图效果注册到 `map_effects.js`；不要在 `AdventureBattleEngine` 里加 `switch` 分支。
3. 处理器返回 `{ok:true,message,...}`、`{ok:false,message}` 或 `{pending:true}`；失败/待决策不能消耗道具。
4. 需要选自己手牌时走 `pendingHandDiscard` + `HandDiscardPicker`。
5. 图标、图鉴 `docs/adventure_guide/consumables.md`、商店/奖励池、测试。

### 6.5 新增 UI 模块

1. 新文件放在 `game/js/ui/` 对应目录。
2. 加入 `game/script_manifest.json` 的 `ui_shell` 或相应分组。
3. 按依赖顺序加入三张入口页（在线页只加载共享 UI 子集）。
4. 运行 `node game/scripts/verify-load-order.js`。
5. 修改文件后同步更新 HTML 中的 `?v=` cache query。

### 6.6 在线改动

- 权威逻辑仍放共享 `Engine`；在线层只做大厅、传输、投影和幂等。
- 客机不能提交生命值、牌堆或伤害结果。
- 事件/快照按 viewer 交换 `player/ai` owner/target；私有选择只发给有决策权的一方。
- 修改协议字段时同步 `protocolVersion`、快照恢复和双端测试。
- 不要把 TURN 或第二套渲染器加回来；`verify-load-order.js` 会检查这些回归。

## 7. 关键约束与易错点

1. **脚本顺序是硬约束**：新文件必须同时进 `script_manifest.json` 和对应 HTML；`index.html`、`adventure/adventure.html` 由清单校验，`online_game/index.html` 单独校验。顺序错误会直接 `CHECK FAILED`。
2. **cache query**：修改脚本后更新该 `<script src="...?v=...">`，避免浏览器继续用旧文件。版本号风格为 `YYYYMMDD-短描述`。
3. **不要从 UI 改状态**：UI 只读投影、发动作；需要新动作时加 `dispatch` 方法或控制器入口。
4. **目标键统一**：只用 `player` / `ai` / `ai2`，通过 `EngineModes.targetFor/resolveAttackTarget` 解析；不要从“对手1/对手2”文本或 DOM 顺序推断。
5. **状态写入统一**：优先 `StatusService`；新增状态先注册 `StatusRegistry`，不要在角色技能里直接写 `entity.burn++`。
6. **攻击时机显式声明**：`attackEffectTiming` 决定 `beforeDamage`/`afterDamage`；攻击后置状态不能参与本次伤害公式。
7. **随机/定时器统一**：使用 `CombatRuntime.random/randomInt/schedule/wait/cancel`；不要新增裸 `Math.random()`/`setTimeout()`。冒险骰子必须走 `rollD12()`。
8. **牌堆边界**：玩家/NPC 牌堆隔离；冒险挑战房两个 NPC 共享 NPC 牌堆；弃牌库顶必须是真实牌；房间结束回收 NPC 手牌。改动后跑 `runtime-invariants`。
9. **存档与快照分离**：地图存档在 localStorage，战斗快照在 sessionStorage；主动退出清二者，安全点只存地图，测试战斗不写正式存档。
10. **掉落表只在一处**：显示和发牌都查 `AdventureLoot.getDropRule()` 返回的同一张表；不要按地图场景再写一份。
11. **场景池不全局兜底**：缺当前层配置时只能看本场景其他层；无可用敌人时拒绝进入，不能自动通关。
12. **文档与代码同步**：改怪物数值/掉落先对齐 `docs/adventure_guide/*.md`；改技能同步 `skills.js`；改状态同步 `buff_guide.md`；改架构同步 `ARCHITECTURE.md`。
13. **`--all` 的既有失败**：先用 `git stash` 或单独运行确认，不要为了变绿随意改旧测试期望。
14. **不要提交 `.DS_Store`、`.codeartsdoer/temp/` 等临时产物**；仓库已忽略部分目录，但编辑时仍要避免引用它们。

## 8. 代码风格

- 经典脚本 + IIFE，例如：

  ```js
  (function () {
    const R = window.AdventureRegistry;
    // ...
  })();
  ```

- 2 空格缩进；对象/数组尾逗号按现有文件风格；不引入 ES module、TypeScript 或打包器。
- 全局命名空间沿用现有对象：`FurryGame`、`CharacterRegistry`、`AIRegistry`、`AdventureRegistry`、`AdventureMonsterBridge`、`AdventureLoot` 等。
- 注释和文档用中文；代码标识符用英文。复杂规则在代码旁写明“为什么”，不要只复述代码。
- 优先小步修改，保持现有文件名、函数名和 DOM `id`/`data-*`/CSS class 契约不变。
- 不删除或覆盖不熟悉的文件/未提交改动；先 `git status`、`git diff` 调查。

## 9. 测试约定

- 测试文件命名：`<主题>.test.js`，放在 `game/tests/`。
- 纯引擎测试：`node:vm` + `_load.js` 按 manifest 分组加载。
- UI 测试：`jsdom` + `runScripts:'outside-only'`，必要时 `w.eval(...)`。
- 断言用 `node:assert/strict`；异步用 `await Promise.resolve()` 或 `setImmediate`。
- 新增测试后，把它加入 `check.js` 的 `stableTests` 仅当你确认它稳定且属于核心协议；否则留给 `--all`。
- 掉落/随机测试使用固定随机源或直接传 `roll`，不要依赖真实随机。

## 10. 文档地图

```text
game/docs/
├── README.md                 # 文档总索引
├── ARCHITECTURE.md           # 总体架构、边界、重构路线
├── reference/                # 通用规则与开发参考（本仓库新增的归档目录）
│   ├── README.md
│   ├── COMBAT_SETTLEMENT.md
│   ├── Cards_deck.md
│   ├── attack_guide.md
│   ├── buff_guide.md
│   ├── small_rules.md
│   ├── dice_controller.md
│   ├── RENDER_PERFORMANCE.md
│   └── recovery_20261027.md
├── Characters/               # 玩家角色
├── adventure_guide/          # 冒险怪物、道具、掉落、房间
└── online/                   # 在线功能、风险、延迟审查
```

规则变更时至少更新对应专题文档和 `game/docs/README.md`；新增文档放进合适的子目录，不要继续堆在 `game/docs/` 根目录。

## 11. 完成标准（Definition of Done）

一次改动完成前确认：

- [ ] 行为符合需求，未顺带改变无关规则。
- [ ] 相关源码、脚本清单和 HTML 加载顺序一致。
- [ ] 修改过的脚本更新了 `?v=` cache query。
- [ ] 相关文档、图鉴或技能描述已同步。
- [ ] 至少运行了受影响的单测；提交前运行 `node game/scripts/check.js`。
- [ ] 涉及冒险/在线/全量规则时运行 `node game/scripts/check.js --all`，并说明既有失败。
- [ ] 没有把临时文件、调试输出或第二套规则实现带进仓库。
- [ ] 如果改了架构边界或新增模块，更新 `ARCHITECTURE.md` 和本文件的目录/流程说明。

## 个人网站共享背景补充

非游戏的五个 HTML 入口通过 `js/site-navigation.js` 使用 `site-shell.html` 常驻背景宿主；Three.js / 山丘只在宿主加载，正文视图不再单独创建背景。涉及导航时检查 HTTP 与 file://、刷新/后退、主题同步，以及游戏链接退出宿主。维护说明见 `docs/homepage.md`，不要把宿主脚本加入游戏加载清单。

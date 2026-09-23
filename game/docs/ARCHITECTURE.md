# Furry Trial 游戏架构

> 文档版本：2026-09-23
> 适用范围：单机 1v1、单机 1v2、领主模式、冒险模式、在线对决。
> 运行方式：静态网页、原生浏览器脚本，无构建器也可以通过 `file://` 加载。

这份文档描述**当前代码真正采用的边界**，并把仍在迁移中的部分单独列出。项目已经统一了牌、状态、事件、牌堆和战斗会话的公共协议，但 `Engine` 和 `AdventureBattleEngine` 仍是通过原型扩展逐步拆分的“大模块”，不能把它们误认为已经完全模块化。

## 1. 总体分层

```text
┌──────────────────────────────────────────────────────────────┐
│ 页面入口                                                     │
│ game/index.html · adventure/adventure.html · online_game/...  │
└──────────────────────────────┬───────────────────────────────┘
                               │
┌──────────────────────────────▼───────────────────────────────┐
│ UI 层                                                        │
│ GameUI = ui_core + render/* + events + controls + feedback    │
│ AdventureUI + adventure_ui_views                            │
│ OnlineUI（大厅/房间/传输状态）                               │
└──────────────────────────────┬───────────────────────────────┘
                               │ CombatSession
┌──────────────────────────────▼───────────────────────────────┐
│ 会话与适配层                                                  │
│ LocalCombatSession → Bridge                                  │
│ AdventureBattleController → AdventureBattleEngine             │
│ OnlineHostSession / OnlineGuestSession → OnlineMatchHost      │
└──────────────────────────────┬───────────────────────────────┘
                               │
┌──────────────────────────────▼───────────────────────────────┐
│ 战斗域                                                         │
│ Engine + 回合/攻击/AI/快照/1v2/领主扩展                        │
│ CardEffects · StatusService · DeckPort · TurnMachine           │
│ EngineModes · OpponentHandPolicy · CombatInvariants            │
└──────────────────────────────┬───────────────────────────────┘
                               │
┌──────────────────────────────▼───────────────────────────────┐
│ 冒险内容 / 在线基础设施                                        │
│ AdventureEngine、地图、房间、奖励、商店、存档                  │
│ Cloudflare Worker Durable Object、WebRTC DataChannel、Relay     │
└──────────────────────────────────────────────────────────────┘
```

核心原则：UI 不直接改战斗状态；在线层不重新实现卡牌规则；冒险地图层不创建第二套战斗引擎；模式差异通过适配器和牌堆边界表达。

## 2. 三个页面入口

| 页面 | 入口对象 | 主要职责 | 战斗会话 |
| --- | --- | --- | --- |
| `game/index.html` | `GameUI` | 角色选择、规则页、经典战斗 | `LocalCombatSession` → `Bridge` → `Engine` |
| `game/adventure/adventure.html` | `AdventureUI` | 地图、房间、奖励、商店、铁匠铺 | `AdventureBattleController` → `AdventureBattleEngine`，再注入共享 `GameUI` |
| `game/online_game/index.html` | `OnlineUI` | 创建/加入房间、准备、选角、连接状态 | `OnlineHostSession` / `OnlineGuestSession` → 共享 `GameUI` |

页面使用原生 `<script>` 顺序加载。 `game/script_manifest.json` 是脚本清单，`game/scripts/verify-load-order.js` 会验证三张页面的路径、顺序、缺失文件和旧的单体 `ui.js`。

## 3. 公共协议（唯一数据词汇）

所有公共协议挂在 `window.FurryGame` 下；全局类名仅为兼容旧调用保留。

### 3.1 `Card`

由 `js/combat/protocol.js` 的 `Card.number()`、`Card.item()` 创建，旧存档通过 `Card.normalize()` 归一化。最小结构如下：

```js
{
  uid: 'c…',
  color: 'RED | YELLOW | BLUE | GREEN | BLACK | WHITE',
  value: 0,                 // 数字牌 0~7，道具牌 -1
  isNumberCard: true,
  isItemCard: false,
  isBlack: false,
  isWhite: false
}
```

`chosenColor` 是黑/白牌当前回合的临时颜色，`npcCard`/`borrowedMonster` 是渲染身份字段，`borrowedFrom`/`borrowedMonsterName` 用于变色龙颜料等临时借牌。它们不能改变牌的物理归属。

牌的效果识别统一走 `CardEffects.resolve(card)`；新代码不要继续扩散 `if (card.potion)`、`if (card.trophyWhite)` 等分支。当前核心中仍有一部分历史兼容判断，见“迁移任务”。

### 3.2 `CombatState`

`CombatState.create()` 负责初始化通用状态，`CombatState.project(source, options)` 负责生成 UI/网络快照。 `project()` 是纯序列化函数：不能调用会改变上下文的合法性计算，也不能写回引擎。

常用字段：

- 回合：`phase`、`turn`、`busy`、`activeAttacker`、`modeId`。
- 参与者：`player`、`ai`、可选 `ai2`。
- 当前牌：`discardTop`、`atkCard`、`defCard` 及 owner 字段。
- 决策：`selectedCard`、`selectedCards`、`selectedAICard`、`pendingDialog`、`needColorChoice`。
- 事件/投影：`events`、`eventLogVersion`、`legalHand`、牌库计数和私有手牌。

引擎内部仍使用 `engine.s` 作为兼容入口；UI 和在线投影只应读取 `state()` 结果，不能依赖内部数组引用。

### 3.3 `CombatEvent`

由 `engine.emit()` 生成 JSON 事件，事件文本只用于展示，业务逻辑必须使用结构化字段：

```js
{
  id: 42,
  type: 'hit',
  target: 'player | ai | ai2',
  amount: 4,
  kind: 'normal',
  desc: '受到4点伤害'
}
```

事件类型和伤害类型集中在 `js/combat/events.js`。不得再用 `evt.desc.includes('[伤害]')` 判断事件类别；伤害、流血、中毒、吸血、炸弹必须使用 `type`、`target`、`kind`、`amount`。

### 3.4 `CombatSession`

`js/combat/session.js` 约定 UI 使用的会话接口：

```text
getState() → state
dispatch(method, params) → { ok, state, events, error }
subscribe/onStateChange(listener)
acknowledgeEvents(throughId)
close()
```

本地、冒险、在线会话都返回同一结果形状，因此 `GameUI` 不需要知道状态来自本地引擎还是远端投影。

## 4. 战斗域模块

| 模块 | 当前职责 | 依赖规则 |
| --- | --- | --- |
| `protocol.js` | Card、CombatEvent 原子协议 | 不依赖引擎/UI |
| `state.js` | 状态默认值、纯投影、校验 | 不执行动作 |
| `events.js` | 事件/目标/伤害类型常量 | 不读 DOM |
| `runtime.js` | 可注入随机数、统一定时器、等待/取消 | 新随机和延时必须从此进入 |
| `dice.js` | 12 面骰等骰子对象 | 调用 `CombatRuntime` |
| `status_registry.js` | Buff/Debuff 元数据、图标、层数、净化、触发时机 | 只读定义 |
| `status_service.js` | 状态写入、clamp、清除和标准化 | 主路径已使用；仍有兼容回退和直接恢复写入 |
| `status.js` | HP、伤害、流血结算、吸血等兼容门面 | 内部委托 `StatusService` |
| `card_effects.js` | 卡牌效果识别/通用应用注册表 | 已建立并有局部接入；尚非所有模式的唯一结算入口 |
| `deck.js` / `piles.js` | 标准牌库、抽牌、弃牌、洗牌 | 不决定角色技能 |
| `deck_port.js` | 共享牌库的引擎边界 | 冒险模式由自身双牌堆覆盖 |
| `damage.js` | 伤害门面、炸弹倒计时 | 不决定目标拓扑 |
| `modes.js` | 1v1/1v2/lord/adventure 的参与者、目标和不变量视图 | 模式差异集中在这里 |
| `opponent_hand_policy.js` | 抽取/弃掉对手手牌的交互策略 | 冒险可选牌，经典/在线自动随机 |
| `invariants.js` | 牌堆隔离、共享关系、顶牌归属、牌数守恒 | 只观察，不修复状态 |

### 4.1 状态注册表

`StatusRegistry` 是状态的唯一元数据入口。当前状态包括灼烧、流血、中毒、冷冻、致盲、定时炸弹、冰封、失温、捆缚、守护、飞翔、暴击、茂盛、寄生、潜水、嗜血和四种混沌。

每个定义至少包含：`id`、`property`、`label`、`icon`、`polarity`、`stack`、`max`、`cleanse`、`trigger`。注册表已经是状态元数据主来源；`StatusService` 覆盖了主要写入路径，但 `status.js` 和 `engine.js` 仍保留兼容回退、批量恢复等直接字段写入。下一轮应先消除这些旁路，再把“唯一状态入口”作为已完成架构约束。

### 4.2 卡牌效果注册表

`CardEffects.resolve(card)` 能把历史字段转换成 `id/kind/family`，`apply(engine, card, context)` 集中了多类通用牌效果；目前 1v2 等路径已有局部调用，但主引擎中仍有重复的卡牌分支，尚未形成所有模式共用的唯一结算入口。下一轮迁移要逐类完成并删除重复路径，不能只把新卡登记到注册表就视为接入完成。复杂效果仍由引擎/适配器提供稳定能力，不让注册表持有回合状态。

## 5. 引擎与模式适配器

### 5.1 当前引擎拆分状态

`js/combat/engine.js` 当前约 118.8 KB、约 1,195 行，仍混合状态与合法性、牌效果兼容分支、AI 决策、状态结算、事件确认和经典 1v1 主流程。若干职责已移至下表文件，但这些文件主要通过 `Engine.prototype` 扩展/覆盖协作，不等于已完成服务化拆分：

| 文件 | 作用 |
| --- | --- |
| `engine_turns.js` | 回合开始/结束、弃牌阶段、手牌补齐 |
| `engine_attack.js` | 稳定的攻击/防御门面 |
| `engine_ai.js` | AI 上下文和角色策略入口；具体策略在 `js/ai/*` |
| `engine_snapshot.js` | 战斗快照 capture/restore |
| `engine_1v2.js` | 1v2 参与者、AI 轮换、死亡和共享牌库流程 |
| `engine_1v2_adapter.js` | 对 1v2 的 state/check/ack/dispatch 路由覆盖 |
| `engine_lord.js` | 领主目标轮换、双敌人结算 |
| `turn_machine.js` | 共享的延迟结算和事件确认连续体 |

这是一种“渐进式拆分”，不是 ES module。新增逻辑应放在对应模块；只有跨模式的通用规则才进入 `engine.js`。后续要把核心进一步拆成纯函数服务，见“迁移任务”。

### 5.2 模式适配器

`EngineModes.adapters` 为每种战斗模式提供参与者、牌堆拓扑、手牌上限、目标规范化和不变量视图：

| `modeId` | 参与者 | 牌堆关系 | 特殊规则 |
| --- | --- | --- | --- |
| `1v1` | `player + ai` | 一份共享标准牌库 | 经典本地对战 |
| `1v2` | `player + ai + ai2` | 三方共用标准牌库 | 两个 AI 轮流攻击 |
| `lord` | `player + ai + ai2` | 三方共用标准牌库 | 玩家目标轮换，领主结算 |
| `adventure` | `player + ai` 或 `player + ai + ai2` | 玩家牌库独立；NPC 牌库独立；冒险 1v2 的两个 NPC 共享 NPC 牌库 | 玩家状态跨房间保持，NPC 结束时回收重洗 |

适配器解决的是**拓扑和资源差异**，不复制一套战斗规则。目标必须使用 `EngineModes.targetFor/resolveAttackTarget`，不能根据界面上的“对手1/对手2”字符串猜测。

### 5.3 一次出牌的通用路径

```text
用户选择/双击
  → GameUI._apiAction()
  → CombatSession.dispatch()
  → Engine.dispatch()（模式适配器先规范化 owner/target）
  → CardEffects / 角色技能 / StatusService / DeckPort
  → engine.emit() 生成事件
  → state() / CombatState.project() 生成快照
  → UI 事件播放器按版本播放
  → acknowledgeEvents() 释放延迟结算和下一阶段
```

动画不是权威状态；事件播放期间可以锁定必要决策，但不能再次修改牌堆或生命值。

## 6. 冒险模式边界

冒险模式不是第二个“单机战斗分支”，而是地图运行时包围一个短生命周期战斗会话：

| 文件 | 职责 |
| --- | --- |
| `adventure/js/engine/adventure_engine.js` | 地图位置、房间、货币、库存、奖励、商店、铁匠铺和跨房间玩家状态 |
| `adventure/js/engine/loot.js` | 按场景和怪物集中管理 D12 战利白卡掉落规则；不参与商店或普通奖励池 |
| `adventure/js/battle/battle_engine.js` | `AdventureBattleEngine`，唯一的冒险战斗规则和双牌堆实现 |
| `adventure/js/battle/adventure_battle_items.js` | 冒险配饰、道具和战斗 Buff 扩展 |
| `adventure/js/engine/combat_result.js` | 把战斗结果写回地图、房间清理和结算阶段 |
| `adventure/js/battle/adventure_battle_controller.js` | 挂载/卸载共享 `GameUI`、开始/结束、刷新恢复和结算交接 |
| `adventure/js/battle/adventure_battle_session.js` | `sessionStorage` 战斗快照边界；引擎不直接访问 storage |
| `adventure/js/ui/adventure_ui.js` | 冒险状态协调、动作处理、存档和战斗交接 |
| `adventure/js/ui/adventure_ui_map_view.js` | 地图/标题渲染；地图以纯投影数据输入，交互属性由控制器委派 |
| `adventure/js/ui/adventure_ui_panels.js` | 侧栏、背包、商店、铁匠铺、奖励和弃置页的渲染方法 |
| `adventure/js/ui/adventure_ui_views.js` | 按阶段组合页面；不负责游戏规则和用户动作 |

`AdventureBattleEngine` 的牌堆规则：

1. 玩家 `deck/hand/discard` 与 NPC 资源完全隔离。
2. 挑战房两个 NPC 共享同一个 NPC `deck/discard` 数组，但手牌各自独立。
3. 弃牌库顶是某个 owner 弃牌库中的实际最后一张；不能在计数时再虚构一张。
4. NPC 牌库少于三张时，先把 NPC 弃牌库（保留当前顶牌）洗回 NPC 牌库。
5. 房间结束时 NPC 手牌全部回收到 NPC 牌库并重洗；玩家牌库、手牌和弃牌库返回地图后继续保持。

地图存档（`AdventureSave`，localStorage）和战斗快照（`AdventureBattleSession`，sessionStorage）是两种不同生命周期：主动退出清除二者，安全结算点只保存地图状态，测试战斗不写入正式冒险存档。

## 7. UI 结构与约束

### 7.1 共享 `GameUI`

`ui_core.js` 定义 `GameUI`、常量、卡牌/动画基础工具；其余功能按职责拆分：

- `render/home_screen.js`：模式和角色选择页。
- `render/combat_screen.js`：战斗 DOM 骨架和标题/参与者区域。
- `render/zone_render.js`：进攻、防御、判定、弃牌库顶区域。
- `render/hand_render.js`：手牌、合法高亮、悬停说明、双击出牌。
- `render/status_render.js`：状态图标和触发闪烁。
- `render/adventure_bar.js`：冒险货币、道具、配饰和牌堆信息。
- `particles.js`：背景粒子和性能受控的动画层。
- `renderer.js`：卡牌飞行、弃牌/抽牌/交换牌动画、区域说明展开收回。
- `events.js`：`CombatEvent` 播放和事件去重。
- `feedback.js`：飘字、受伤闪烁、命中反馈。
- `controls.js`：按钮、对话框动作和在线结算按钮。
- `mode_1v2.js` / `mode_lord.js`：多目标 UI 组合，不承载战斗规则。

`GameUI.mountBattle(session, state, gameScreen)` 是单机、冒险、在线共用的装配入口。在线 UI 通过 `_onlineResultSink` 把本地/远端结果送入同一个版本队列；在线页面不应再创建一套卡牌渲染器。

卡牌能否出牌由快照中的 `legalHand` 决定。不可出的牌应不可选中，但悬停仍可显示技能说明；选中、动画和状态反馈只能影响 DOM/CSS，不能直接修改 `engine.s`。

### 7.2 冒险 UI 与战斗 UI 的关系

冒险 UI 负责地图页面，进入房间后暂时隐藏 `adventure-container`，显示共享 `game-container`。战斗结束由 Controller 先收口战斗快照，再交给 `AdventureEngine.applyBattleResult()` 和结算页面；不要在地图 UI 中再次调用 `playerPlayCard`、`npcDefendTurn` 等战斗方法。

## 8. 在线对决架构

```text
浏览器 A OnlineUI ─ OnlineHostSession ─┐
                                       ├─ OnlineMatchHost（房主唯一权威 Engine）
浏览器 B OnlineUI ─ OnlineGuestSession ┘
          │
          ├─ WebRTC DataChannel（可靠、有序，优先）
          └─ WebSocket → Cloudflare Worker → Durable Object（未直连时中继）
```

### 8.1 房间和传输

- `signaling/worker.js` 为每个房间码建立 Durable Object，服务端生成 `peerId`，最多两名成员。
- Worker 校验 Origin（可选白名单）、握手超时、消息 UTF-8 大小和基础频率，并把大厅消息按连接身份重写。
- `p2p_adapter.js` 优先使用 WebRTC；DataChannel 未打开、关闭或背压时使用同一信令 WebSocket 中继。当前按小规模上线要求不配置 TURN。
- 浏览器刷新通过 localStorage 的房间记录和短期重连令牌保留房间名额；Worker 为非主动断开保留约 15 秒窗口。

### 8.2 权威状态和私有投影

- `OnlineMatchHost` 持有唯一真实 `Engine`、双方手牌、牌库、`matchId`、`stateVersion` 和 request cache。
- `OnlineHostSession` 给房主发送 host 投影，给客机发送 guest 投影；客机不能提交生命值、牌堆或伤害结果。
- 客机动作带 `protocolVersion`、`matchId`、`requestId`、`expectedStateVersion`，房主验证行动者、阶段、待决策和参数后才调用引擎。
- `projectEvents()` 按 viewer 交换 `player/ai` 相关 owner/target 字段；事件和快照只进入一个 `_battleAnimation` 版本队列，重复事件不重复播放。
- 选牌/悬停属于本地 UI；真正出牌、选色、净化、排序和目标选择才提交命令。Chan 排序、Saiki 6 判定等私有选择只发送给拥有决策权的一方。

### 8.3 当前在线边界

这是“房主权威”的熟人/测试对战架构，不是可信竞技裁判：房主浏览器掌握完整规则和随机数，不能防止房主篡改本地代码。Worker 可以在大厅阶段把剩余成员提升为房主；正在进行的对局仍依赖原房主快照，不能把活跃战斗安全地迁移到新房主，除非后续实现可验证的快照交接。

当前还需要持续验证：跨通道切换时的消息序号、真实双浏览器刷新/断线、旧页面规则版本协商、完整结算/再战流程和中国境内网络可达性。

## 9. 统一不变量与随机/定时器

### 9.1 牌堆不变量

`CombatInvariants.check(engine, reason)` 通过当前模式适配器获取物理牌堆视图，在初始化、抽牌、出牌、弃牌、洗牌、弃牌库顶变更和房间结束后检查：

- 玩家/NPC 牌堆隔离。
- 冒险 1v2 的两个 NPC 共享同一牌库和弃牌库。
- 牌按 canonical 字段不凭空增加或丢失。
- 弃牌库顶 owner 合法且确实属于对应弃牌堆。
- 战斗结束 NPC 手牌已回收。

检查器只报告问题，不尝试自动修牌；测试可传 `{ throw: true }`，调试可传 `{ warn: true }`。

### 9.2 随机和定时器

新代码使用 `CombatRuntime.random()`、`randomInt()`、`schedule()`、`wait()` 和 `cancel()`。角色策略、冒险抽奖、12 面骰和动画延时不能直接新增 `Math.random()`/`setTimeout()`。统一入口允许测试注入固定随机源，并按 owner/channel 取消竞争中的动画或计时器。

## 10. 扩展新角色、状态或卡牌

1. **协议**：使用 `Card.number/item`，不要手写另一种牌对象。
2. **卡牌效果**：在 `CardEffects` 注册匹配规则和稳定 `id/kind`；复杂效果暴露一个引擎门面。
3. **状态**：先在 `StatusRegistry` 定义元数据和图标，再通过 `StatusService` 修改；同步净化、状态 UI 和测试。
4. **角色**：在 `characters/*` 登记角色基础数据，在 `ai/*` 登记独立 AI 策略；冒险怪物通过 `AdventureRegistry/AdventureMonsterBridge` 注入。
5. **目标**：使用 `EngineModes`/ `attackTarget` 的 owner key，不从描述文本或 DOM 顺序推断目标。
6. **UI**：只添加技能描述、渲染和交互，不把业务结算写进 UI。
7. **测试**：至少覆盖 `player/ai/ai2 × normal/bleed/poison/bomb`，并增加牌堆归属、私有投影、重复命令和动画事件回归。
8. **发布**：新增脚本加入 `script_manifest.json`，运行 `verify-load-order.js` 和统一检查后再更新 HTML cache query。

## 11. 检查和测试入口

从仓库根目录运行：

```bash
node game/scripts/check.js
```

默认检查：

- 三张入口页的脚本图和 UI 拆分顺序。
- 全部游戏 JavaScript 语法。
- 协议、事件、AI、卡牌、状态、回合机、适配器、不变量和在线测试。

完整回归（包含所有历史冒险测试）：

```bash
node game/scripts/check.js --all
```

重点测试文件：

| 测试 | 覆盖内容 |
| --- | --- |
| `combat-protocol.test.js` | Card/State/Event 协议和纯投影 |
| `combat-events.test.js`、`ui-feedback.test.js` | 结构化伤害事件、飘字和命中特效 |
| `turn-machine.test.js`、`fly-guard.test.js` | 延迟结算、飞翔失败后守护 |
| `card-effects.test.js`、`status-registry.test.js` | 注册表和唯一状态入口 |
| `engine-modules.test.js`、`runtime-invariants.test.js` | 模块边界、随机/定时器、牌堆不变量 |
| `adventure-battle.test.js`、`adventure-save.test.js`、`adventure-reward.test.js` | 冒险战斗、存档和结算 |
| `online-match.test.js`、`signaling-room.test.js` | 私有投影、幂等、刷新、重连、Worker 房间 |

自动化通过只代表代码路径通过；在线发布前仍需两台独立浏览器、跨 Wi-Fi/手机网络和信令中继实测。

## 12. 下一轮代码结构优化计划

> 计划更新：2026-09-23。此节是实施路线图；当前状态以本节“基线”描述为准。下一轮先做边界清晰、可独立回归的 UI 拆分，不把多个高风险引擎迁移捆成一次改动。

### 12.1 当前基线

| 区域 | 已有基础 | 尚未完成的结构问题 |
| --- | --- | --- |
| 共享战斗 UI | `GameUI` 已拆为核心、渲染、事件、反馈、控制等模块，单机/冒险/在线复用 | 部分多模式 UI 与历史脚本全局仍需继续收敛 |
| 冒险主界面 | 地图视图、面板视图和阶段组合器已分开；地图模型/日志/锻造可支付状态从快照投影 | `adventure_ui.js` 约 54.6 KB / 1,023 行；测试界面与弹窗仍在控制器；部分视图 builder 仍通过原型 helper 协作 |
| 通用战斗引擎 | 回合、攻击、AI、快照、1v2、领主等已有扩展文件 | `engine.js` 约 118.8 KB / 1,195 行；仍混合牌效果、状态回退、AI、结算及事件推进；扩展间有原型覆盖耦合 |
| 冒险战斗引擎 | 地图运行时、战斗会话、牌堆服务、掉落和战斗结果已有边界 | `AdventureBattleEngine` 约 60.2 KB / 1,319 行；牌堆所有权/回收、战斗阶段钩子、道具和模式生命周期仍较集中 |
| 卡牌效果 | `CardEffects.resolve/apply` 和注册定义已存在，部分路径已接入 | 并非所有模式统一调用；核心中仍有重复布尔字段分支 |
| 状态系统 | `StatusRegistry` 管元数据，`StatusService` 覆盖主要写入操作 | 兼容回退和状态快照/攻击 buff 暂存恢复仍有直接写字段旁路 |
| 页面装载 | 维持原生脚本、静态部署和 `file://` 兼容 | 模块依赖脚本顺序及全局命名空间；新增文件必须同步维护入口顺序 |

### 12.2 R1：冒险主界面视图拆分（第一批已完成）

**已完成的第一批**：标题/地图视图和主要侧栏、商店、奖励、铁匠铺面板已移至专门的 view 文件；地图 click/dblclick 改为控制器委派；地图、日志、锻造可支付信息由 `AdventureUI.render()` 组成显式投影。房间规则、奖励结算与存档逻辑未迁移。下一批继续分离测试流程和弹窗渲染，并消除 view builder 对 UI 原型 helper 的隐式依赖。

后续 R1.1 拆分顺序：

1. **测试页面**：把测试配装、模式/对手选择和结果页迁到专属 view 模块；控制器只提供选择状态与动作处理。
2. **详情弹窗**：拆分战利白卡背包、预言球、确认/提示弹窗的 DOM 生成；事件回调由控制器传入，避免 view 直接调用引擎。
3. **消除原型 helper 隐式依赖**：把目前跨 view 调用的卡牌挂载、奖励格式化等方法改为模块内 helper 或显式 renderer 参数；保留冒险地图返回动画的 presentation state 在 UI 层。

地图、库存、商店、铁匠铺和奖励页面的主体渲染已在第一批拆出，不在 R1.1 重复搬迁。

**保留不变**：DOM `id`、`data-*` 委派契约、CSS class、存档结构、战斗入口、地图操作语义、静态页面脚本加载能力。视图模块不得直接修改引擎状态、写存档或注册彼此冲突的全局事件监听；事件监听统一由控制器挂载并委派。

**R1 验收条件**：

- 已迁移视图接收明确快照或投影数据，不直接读取引擎；后续视图继续保持该边界，同一输入重复渲染结果一致。
- 点击、双击、弹层关闭和刷新恢复的现有行为保持一致；已有 DOM 选择器和委派动作不变。
- 冒险 UI 样式/移动端布局不回退；共享战斗 UI 和在线页面不受影响。
- 视图模块不包含奖励结算、购买扣款、存档写入或战斗逻辑；控制器保留这些动作的唯一入口。
- 第一批已让 `adventure_ui.js` 从约 88.7 KB 降至约 54.6 KB（缩减约 38%）；后续维持清晰分层，不按小面板过度拆文件。
- 同步更新静态脚本入口顺序、架构文档和相应的 UI 回归覆盖。

### 12.3 后续阶段（按依赖顺序）

| 阶段 | 范围 | 完成判据 | 风险/边界 |
| --- | --- | --- | --- |
| R2 卡牌效果唯一入口 | 先盘点所有通用牌在 1v1、1v2、冒险测试/实战、在线的入口；逐类把药水/魔法/抽弃换牌/净化/战利白卡迁入 `CardEffects`，然后删除重复分支 | 每个通用牌族在各模式只有一个规则结算实现；角色技能与模式专属效果仍留在对应能力服务/适配器 | 不要一次性改完所有牌；保留清晰的 owner/target、异步选择、动画事件契约 |
| R3 冒险牌堆边界 | 把冒险 `deck/hand/discard` 所有权、NPC 共享牌堆、回收阈值和弃牌顶规则收口到专属 DeckPort/牌堆服务 | 玩家/NPC 隔离、挑战房 NPC 共享、弃牌顶归属、房间结束回收及总数守恒均有统一不变量入口 | 与现有战斗快照和地图持久化交互高；不能在结构迁移中顺带改牌堆规则 |
| R4 状态唯一写入边界 | 先迁移攻击 buff 暂存/还原、批量净化、回合触发与快照恢复；再删除 `status.js/engine.js` 的直接属性回退 | 运行时代码中的状态变化都经 `StatusService`；加载/恢复通过 `hydrate/restore` API；净化/UI/触发时机继续由 Registry 元数据驱动 | 兼容旧存档需有显式归一化，不因删字段别名破坏恢复 |
| R5 引擎组合方式 | 在 R2-R4 稳定后，逐步把 1v2/lord/adventure 原型覆盖改成显式 adapter hooks 或策略依赖 | 一个方法的最终行为来源可直接追踪；适配器不再靠加载顺序覆盖核心方法 | 高回归风险；不与规则语义变更、文件大搬迁同批进行 |

### 12.4 独立于下一轮的事项

- **在线协议版本、序号与 schema 校验**：属于线上兼容/安全工作，应独立评估发布，不和 R1 冒险 UI 拆分捆绑。
- **房主迁移和断线恢复协议**：需要明确权威快照、连接代次和冲突裁决，作为在线专项，不作为通用引擎拆分的附带内容。
- **ES module / bundler 迁移**：当前静态部署依赖原生脚本加载和 `file://` 运行；除非另立迁移项目并验证部署路径，不在 R1 擅自引入构建步骤。

### 12.5 每轮实施门槛

1. 先列出本轮涉及的公开协议、页面入口和脚本依赖，再移动代码。
2. 结构迁移与规则改动分开提交；有意改变规则时单独更新规则文档。
3. 先补覆盖本轮边界的回归用例，再迁移；迁移后验证全部模式入口及牌堆/状态不变量。
4. 每次只推进一个阶段，保留可回退的中间状态；验收通过后才删旧兼容路径。
5. 完成后同步更新本文基线、文档索引及脚本装载清单。

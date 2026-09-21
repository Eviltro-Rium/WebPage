# Furry Trial 游戏架构

> 文档版本：2026-09-16
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
| `status_service.js` | 状态唯一写入入口、clamp、清除、快照 | 新状态修改必须经此服务 |
| `status.js` | HP、伤害、流血结算、吸血等兼容门面 | 内部委托 `StatusService` |
| `card_effects.js` | 牌效果注册表和通用应用入口 | 新牌先注册，再接引擎 handler |
| `deck.js` / `piles.js` | 标准牌库、抽牌、弃牌、洗牌 | 不决定角色技能 |
| `deck_port.js` | 共享牌库的引擎边界 | 冒险模式由自身双牌堆覆盖 |
| `damage.js` | 伤害门面、炸弹倒计时 | 不决定目标拓扑 |
| `modes.js` | 1v1/1v2/lord/adventure 的参与者、目标和不变量视图 | 模式差异集中在这里 |
| `opponent_hand_policy.js` | 抽取/弃掉对手手牌的交互策略 | 冒险可选牌，经典/在线自动随机 |
| `invariants.js` | 牌堆隔离、共享关系、顶牌归属、牌数守恒 | 只观察，不修复状态 |

### 4.1 状态注册表

`StatusRegistry` 是状态的唯一元数据入口。当前状态包括灼烧、流血、中毒、冷冻、致盲、定时炸弹、冰封、失温、捆缚、守护、飞翔、暴击、茂盛、寄生、潜水、嗜血和四种混沌。

每个定义至少包含：`id`、`property`、`label`、`icon`、`polarity`、`stack`、`max`、`cleanse`、`trigger`。净化、超级净化、冒险道具、状态 UI 都必须从 `StatusRegistry/StatusService` 读取，不能再维护第二份状态清单。

### 4.2 卡牌效果注册表

`CardEffects.resolve(card)` 将历史布尔字段转换成 `id/kind/family`；`CardEffects.apply(engine, card, context)` 负责通用药水、紫/绿魔法、抽牌、净化、换牌、洗牌和战利白卡入口。复杂效果由引擎提供稳定方法，注册表只负责路由，不持有回合状态。

## 5. 引擎与模式适配器

### 5.1 当前引擎拆分状态

`js/combat/engine.js` 仍是约 109 KB 的兼容核心，保留状态初始化、通用合法性、事件、牌效果兼容分支和经典 1v1 主流程。以下文件通过 `Engine.prototype` 扩展补充职责：

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
| `adventure/js/ui/adventure_ui.js` | 地图 UI 状态和动作 |
| `adventure/js/ui/adventure_ui_views.js` | 按阶段组合地图、商店、奖励和侧栏页面 |

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

## 12. 后续重构任务

按风险排序，后续建议如下：

1. **继续拆 `engine.js`**：把牌合法性、状态迁移、攻击结算、AI 决策、存档和兼容层改为纯服务，最后让 Engine 只做依赖注入和调度。
2. **拆 `AdventureBattleEngine`**：抽出 `adventure_piles`、`adventure_attack`、`adventure_snapshot`、`adventure_effects`，保留一个很薄的模式适配器。
3. **完成 `CardEffects` 迁移**：消除核心中剩余的卡牌布尔字段分支，保证所有新卡只需注册一次。
4. **完成状态写入收口**：移除直接写 `entity.burn/guard/...` 的历史兼容代码，保留读取别名但统一由 `StatusService` 写入。
5. **统一协议校验**：为在线消息增加规则版本/build ID、跨通道序号和明确的 schema 校验，再考虑增量快照。
6. **在线房主迁移**：定义可验证的战斗快照交接和旧连接代次，避免只在大厅层提升 role。
7. **收敛原型混入**：UI 和引擎模块过渡完成后改用显式构造器/服务对象，减少脚本加载顺序对隐式全局的依赖。

这些任务都应以先补回归测试、再移动逻辑、最后删除兼容分支为顺序，避免再次出现“单机、冒险、在线各执行一遍”的分叉链路。

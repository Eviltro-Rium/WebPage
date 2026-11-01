# Furry Trial 游戏架构

> 文档版本：2026-11-01
> 适用范围：单机 1v1、单机 1v2、领主模式、冒险模式、在线对决。
> 运行方式：静态网页、原生浏览器脚本，无构建器也可以通过 `file://` 加载。

这份文档描述**当前代码真正采用的边界**，并把仍在迁移中的部分单独列出。项目已经统一了牌、状态、事件、牌堆和战斗会话的公共协议，但 `Engine` 和 `AdventureBattleEngine` 仍是通过原型扩展逐步拆分的“大模块”，不能把它们误认为已经完全模块化。

文档中的行数和体积是 2026-11-01 的实测值，只用于判断模块规模；代码变动后以实际文件为准。

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
│ AdventureEngine、地图、房间、奖励、商店、献祭、故障房、存档    │
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

页面使用原生 `<script>` 顺序加载。`game/script_manifest.json` 是共享脚本清单：`index.html` 和 `adventure/adventure.html` 直接按清单分组校验，`online_game/index.html` 由 `game/scripts/verify-load-order.js` 单独校验共享 UI 子集、缺失文件和旧的单体 `ui.js`。

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
| `attack_buffs.js` | 攻击修正 Buff 的可用性、互斥、消耗顺序和可序列化选择 | 只产出决策策略，UI/模式不能自行改伤害 |
| `invariants.js` | 牌堆隔离、共享关系、顶牌归属、牌数守恒 | 只观察，不修复状态 |

### 4.1 状态注册表

`StatusRegistry` 是状态的唯一元数据入口。当前状态包括：

- Debuff：灼伤、炙热、流血、中毒、冷冻、致盲、定时炸弹、冰封、失温、捆缚、嘲弄、催眠、沉睡、荆棘、沙盲、流沙。
- Buff：守护、飞翔、硬化、暴击、熔脉、茂盛、寄生、潜水、嗜血、四种混沌（红/黄/蓝/绿）。

`StatusRegistry.handLimitDelta` 还会表达持续状态对手牌上限的修正（例如流沙 -1）；牌堆和存档始终保存基础上限。

每个定义至少包含：`id`、`property`、`label`、`icon`、`polarity`、`stack`、`max`、`cleanse`、`trigger`。注册表已经是状态元数据主来源；`StatusService` 覆盖了主要写入路径，但 `status.js` 和 `engine.js` 仍保留兼容回退、批量恢复等直接字段写入。下一轮应先消除这些旁路，再把“唯一状态入口”作为已完成架构约束。

### 4.2 卡牌效果注册表

`CardEffects.resolve(card)` 能把历史字段转换成 `id/kind/family`，`apply(engine, card, context)` 集中了多类通用牌效果；目前 1v2 等路径已有局部调用，但主引擎中仍有重复的卡牌分支，尚未形成所有模式共用的唯一结算入口。下一轮迁移要逐类完成并删除重复路径，不能只把新卡登记到注册表就视为接入完成。复杂效果仍由引擎/适配器提供稳定能力，不让注册表持有回合状态。

攻击结算顺序及扩展协议见 [统一攻击与伤害结算](reference/COMBAT_SETTLEMENT.md)。

## 5. 引擎与模式适配器

### 5.1 当前引擎拆分状态

`js/combat/engine.js` 当前约 164 KB、1,878 行，仍混合状态与合法性、牌效果兼容分支、状态结算、事件确认和经典 1v1 主流程。若干职责已移至下表文件，但这些文件主要通过 `Engine.prototype` 扩展/覆盖协作，不等于已完成服务化拆分：

| 文件 | 作用 |
| --- | --- |
| `engine_turns.js` | 回合开始/结束、弃牌阶段、手牌补齐 |
| `engine_attack.js` | 统一攻击效果暂存、状态公式重算、潜水/飞翔/守护减伤与命中入口 |
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
| `adventure/js/content/registry.js` | 怪物、Boss、道具的注册表；普通怪与 Boss 的 NPC 牌组各含 1 张白 0 |
| `adventure/js/content/monster.js` / `boss.js` | 怪物/Boss 基础类与阶段强化 |
| `adventure/js/monsters/castle.js` / `forest.js` / `ocean.js` / `desert.js` / `volcano.js` | 各场景普通怪、精英怪、Boss 和遭遇池；规则镜像 `docs/adventure_guide/*.md` |
| `adventure/js/content/monster_registry.js` | 怪物技能到共享战斗引擎的桥接、阶段修正和技能文本 |
| `adventure/js/content/stage_guide.js` | 图鉴文案、出现条件和阶段强化说明 |
| `adventure/js/content/room.js` | 房间类型、CSV 编码和房间基础数据 |
| `adventure/js/engine/adventure_engine.js` | 地图位置、房间、货币、库存、奖励、商店、铁匠铺、场景历史和跨房间玩家状态 |
| `adventure/js/engine/glitch.js` | 故障房的一次性 D12 事件和检查点；离开/刷新不会重复投掷 |
| `adventure/js/engine/sacrifice.js` | 献祭房：同步扣除生命并发放道具或升级战利白卡 |
| `adventure/js/engine/loot.js` | 按场景和怪物集中管理 D12 战利白卡掉落规则；不参与商店或普通奖励池 |
| `adventure/js/engine/rewards.js` / `shop.js` / `inventory.js` | 奖励池、商店与背包/道具槽 |
| `adventure/js/items/item_defs.js` | 一次性道具、战利白卡、配饰定义 |
| `adventure/js/items/combat_effects.js` | 战斗内道具效果注册表；新道具按 `combatUse` 注册，不扩引擎 switch |
| `adventure/js/items/map_effects.js` | 地图场景道具效果注册表；与战斗内效果分离 |
| `adventure/js/deck/adventure_deck.js` / `npc_strategy.js` | 冒险牌库和 NPC 出牌策略 |
| `adventure/js/battle/battle_engine.js` | `AdventureBattleEngine`，唯一的冒险战斗规则和双牌堆实现 |
| `adventure/js/battle/adventure_battle_items.js` | 冒险配饰、道具和战斗 Buff 扩展 |
| `adventure/js/battle/dice_controller.js` | 冒险 D12 决策边界；等待遥控骰子/魔术师时用 JSON 检查点恢复 |
| `adventure/js/engine/combat_result.js` | 把战斗结果写回地图、房间清理和结算阶段 |
| `adventure/js/battle/adventure_battle_controller.js` | 挂载/卸载共享 `GameUI`、开始/结束、刷新恢复和结算交接 |
| `adventure/js/battle/adventure_battle_session.js` | `sessionStorage` 战斗快照边界；引擎不直接访问 storage |
| `adventure/js/save/adventure_save.js` | 地图存档（localStorage），与战斗快照生命周期分离 |
| `adventure/js/ui/adventure_ui.js` | 冒险状态协调、动作处理、存档和战斗交接 |
| `adventure/js/ui/adventure_ui_map_view.js` | 地图/标题渲染；地图以纯投影数据输入，交互属性由控制器委派 |
| `adventure/js/ui/adventure_ui_panels.js` | 侧栏、背包、商店、铁匠铺、奖励和弃置页的渲染方法 |
| `adventure/js/ui/adventure_ui_glitch.js` / `adventure_ui_sacrifice.js` | 故障房与献祭房的界面流程 |
| `adventure/js/ui/adventure_ui_views.js` | 按阶段组合页面；不负责游戏规则和用户动作 |

`AdventureBattleEngine` 的牌堆规则：

1. 玩家 `deck/hand/discard` 与 NPC 资源完全隔离。
2. 挑战房两个 NPC 共享同一个 NPC `deck/discard` 数组，但手牌各自独立。
3. 弃牌库顶是某个 owner 弃牌库中的实际最后一张；不能在计数时再虚构一张。
4. NPC 牌库少于三张时，先把 NPC 弃牌库（保留当前顶牌）洗回 NPC 牌库。
5. 房间结束时 NPC 手牌全部回收到 NPC 牌库并重洗；玩家牌库、手牌和弃牌库返回地图后继续保持。

### 6.1 场景、房间与遭遇池

- 场景池为 `castle`、`forest`、`ocean`、`desert`、`volcano`；每层从可用场景中无放回抽取，已用场景记入 `s.usedScenes`。
- 普通怪、精英怪和 Boss 分别来自 `AdventureMonsterPool`、`AdventureElitePool`、`AdventureBossPool`。缺该层配置时只能回退到本场景其他层，禁止全局怪物/Boss 池兜底。
- 房间编码：`-1` 空、`0` 起点、`1` 普通、`2` Boss、`3` 奖励、`4` 商店、`5` 铁匠铺、`6` 挑战、`7` 故障、`8` 精英、`10` 献祭；`9` 作为旧精英存档兼容。
- 故障房每房只投一次 D12，检查点随房间保存；献祭房在保存/播放动画前同步提交扣血，避免刷新重刷。
- 精英房是 1v1 精英怪，奖励同普通房，但战利品骰投 2 次；Boss 投 3 次，普通怪投 1 次。

### 6.2 战利白卡掉落

`AdventureLoot` 只负责“场景 + 怪物 + D12 → 战利白卡”的映射，调用方决定何时投骰和如何持久化：

- 普通怪最多 4/12 中签，Boss 最多 6/12；判定使用包含等号的 `roll <= threshold`。
- 多个 `outcomes` 按阈值从小到大匹配，区间不重叠。
- 精英怪第 10 面额外掉落 `DrawTwoTrophy`；所有表的 11/12 仍为通用 `SmallPotionTrophy` / `PurifyWaterTrophy`。
- 仅铁匠可获得的战利白卡（俄盘、缴械、暴乱等）不出现在普通/Boss 掉落表。
- 掉落显示与实际发牌必须查同一张表；`trophyRolls`、`trophyDropHandled` 和录像随机带保证刷新恢复时不重复发牌。

地图存档（`AdventureSave`，localStorage）和战斗快照（`AdventureBattleSession`，sessionStorage）是两种不同生命周期：主动退出清除二者，安全结算点只保存地图状态，测试战斗不写入正式冒险存档。

## 7. UI 结构与约束

### 7.1 共享 `GameUI`

`ui_core.js` 定义 `GameUI`、常量、卡牌/动画基础工具；其余功能按职责拆分：

- `skills.js`：角色/怪物技能说明文案；改技能后必须与规则同步。
- `rules.js`：规则页静态内容。
- `card_style.js`：卡面颜色、图标和白卡/魔法牌样式。
- `adventure_codex.js`：冒险图鉴查询和展示。
- `dialogs.js`：净化、选色、守卫/飞翔、骰子等通用弹窗。
- `hand_discard_picker.js`：统一手牌弃牌选择器（Vixraps、失温、超限、克拉肯、道具弃牌）。
- `render/runtime.js`：稳定图片 DOM、图标入退场生命周期、共用动画 RAF 调度。
- `render/home_screen.js`：模式和角色选择页。
- `render/combat_screen.js`：战斗 DOM 骨架和标题/参与者区域。
- `render/zone_render.js`：进攻、防御、判定、弃牌库顶区域。
- `render/hand_render.js`：手牌、合法高亮、悬停说明、双击出牌。
- `render/status_render.js`：状态图标和触发闪烁。
- `render/adventure_bar.js`：冒险货币、道具、配饰和牌堆信息。
- `render/particles.js`：背景粒子和性能受控的动画层。
- `renderer.js`：卡牌飞行、弃牌/抽牌/交换牌动画、区域说明展开收回。
- `events.js`：`CombatEvent` 播放和事件去重。
- `feedback.js`：飘字、受伤闪烁、命中反馈。
- `controls.js`：按钮、对话框动作、冒险道具和在线结算按钮。
- `mode_1v2.js` / `mode_lord.js`：多目标 UI 组合，不承载战斗规则。

`GameUI.mountBattle(session, state, gameScreen)` 是单机、冒险、在线共用的装配入口。在线 UI 通过 `_onlineResultSink` 把本地/远端结果送入同一个版本队列；在线页面不应再创建一套卡牌渲染器。

卡牌能否出牌由快照中的 `legalHand` 决定。不可出的牌应不可选中，但悬停仍可显示技能说明；选中、动画和状态反馈只能影响 DOM/CSS，不能直接修改 `engine.s`。

渲染稳定性、位图缓存与动画算法详见 [RENDER_PERFORMANCE.md](reference/RENDER_PERFORMANCE.md)。

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
4. **角色**：在 `characters/*` 登记角色基础数据，在 `ai/*` 登记独立 AI 策略；冒险怪物通过 `AdventureRegistry/AdventureMonsterBridge` 注入 `monsters/<scene>.js` 与 `content/monster_registry.js`。
5. **冒险道具**：定义放 `items/item_defs.js`；战斗内效果注册到 `items/combat_effects.js`，地图效果注册到 `items/map_effects.js`，不要在 `AdventureBattleEngine` 里继续加分支。
6. **场景/房间**：新增怪物池、Boss 池、精英池和掉落表；同步 `docs/adventure_guide/<scene>.md`、`loot.md` 和图鉴文案。
7. **目标**：使用 `EngineModes`/ `attackTarget` 的 owner key，不从描述文本或 DOM 顺序推断目标。
8. **UI**：只添加技能描述、渲染和交互，不把业务结算写进 UI。技能文案在 `skills.js`，规则页在 `rules.js`。
9. **测试**：至少覆盖 `player/ai/ai2 × normal/bleed/poison/bomb`，并增加牌堆归属、私有投影、重复命令和动画事件回归。
10. **发布**：新增脚本加入 `script_manifest.json` 和对应 HTML（含 `?v=` cache query），运行 `verify-load-order.js` 与统一检查；文档变动同步更新本文件、`docs/README.md` 和 `docs/reference/README.md`。

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

当前 `game/tests/` 共 73 个 `*.test.js`。默认检查运行 25 个稳定测试，`--all` 运行全部；部分旧冒险测试依赖随机掉落或历史牌数，可能单独失败。

重点测试文件：

| 测试 | 覆盖内容 |
| --- | --- |
| `combat-protocol.test.js` | Card/State/Event 协议和纯投影 |
| `combat-events.test.js`、`ui-feedback.test.js` | 结构化伤害事件、飘字和命中特效 |
| `turn-machine.test.js`、`fly-guard.test.js` | 延迟结算、飞翔失败后守护 |
| `attack-timing.test.js`、`defense-effects.test.js` | 攻击后置效果、防御同步结算和在线目标投影 |
| `hypnosis-sleep.test.js` | 催眠/沉睡、Vixraps 技能和被动 |
| `card-effects.test.js`、`status-registry.test.js` | 卡牌/状态注册表与净化 |
| `magma-vein.test.js`、`scorch.test.js`、`thorns.test.js`、`sandblind.test.js`、`quicksand.test.js` | 攻击修正与新增 Debuff |
| `engine-modules.test.js`、`runtime-invariants.test.js` | 模块边界、随机/定时器、牌堆不变量 |
| `adventure-battle.test.js`、`adventure-save.test.js`、`adventure-reward.test.js` | 冒险战斗、存档和结算 |
| `adventure-kraken.test.js`、`adventure-octopus.test.js`、`desert-*.test.js`、`volcano-monsters.test.js` | 场景怪物、Boss、阶段修正和掉落 |
| `dice-controller.test.js`、`loot-dice-sheet.test.js` | D12 决策边界、遥控骰子和掉落展示 |
| `online-match.test.js`、`online-transport.test.js`、`signaling-room.test.js` | 私有投影、幂等、刷新、重连、Worker 房间 |

自动化通过只代表代码路径通过；在线发布前仍需两台独立浏览器、跨 Wi-Fi/手机网络和信令中继实测。

## 12. 下一轮代码结构优化计划

> 计划更新：2026-09-23。此节是实施路线图；当前状态以本节“基线”描述为准。下一轮先做边界清晰、可独立回归的 UI 拆分，不把多个高风险引擎迁移捆成一次改动。

### 12.1 当前基线

| 区域 | 已有基础 | 尚未完成的结构问题 |
| --- | --- | --- |
| 共享战斗 UI | `GameUI` 已拆为核心、渲染、事件、反馈、控制等模块，单机/冒险/在线复用 | 部分多模式 UI 与历史脚本全局仍需继续收敛 |
| 冒险主界面 | 地图、面板、故障房、献祭房和阶段组合器已分开；地图模型/日志/锻造可支付状态从快照投影 | `adventure_ui.js` 约 82.6 KB / 1,638 行；测试界面与部分弹窗仍在控制器；部分视图 builder 仍通过原型 helper 协作 |
| 通用战斗引擎 | 回合、攻击、AI、快照、1v2、领主等已有扩展文件 | `engine.js` 约 164 KB / 1,878 行；仍混合牌效果、状态回退、AI、结算及事件推进；扩展间有原型覆盖耦合 |
| 冒险战斗引擎 | 地图运行时、战斗会话、牌堆服务、掉落、骰子决策和战斗结果已有边界 | `AdventureBattleEngine` 约 77.7 KB / 1,695 行；牌堆所有权/回收、战斗阶段钩子、道具和模式生命周期仍较集中 |
| 冒险内容 | 五场景怪物/Boss/精英池、图鉴文案、道具效果注册表、故障房和献祭房已拆分 | `monster_registry.js` 约 88.2 KB / 1,730 行，仍是怪物技能桥接的主要集中点 |
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
- 第一批拆分时 `adventure_ui.js` 曾从约 88.7 KB 降至约 54.6 KB；后续新增故障房、献祭房、图鉴和测试流程又增长到约 82.6 KB。判断标准是职责边界和回归覆盖，不是单纯追求文件更小；不要按小面板过度拆文件。
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

### 冒险地图与刷新存档（2026-10-03）

- 地图单击只更新选中位置；成功进入房间才写 visited。起点、已通关战斗房、已进入商店、已付费开门的奖励房/铁匠铺可扩展探索边界。Map.explorablePositions 从起点计算连通区域及边界，UI 与引擎使用同一结果，旧 visited 标记不能绕过未通关战斗房。
- AdventureSave 以完整序列化快照去重，只有 savedAt 不参与内容比较；兽元、Buff、牌序和房间奖励变化都能保存。写入失败不更新去重缓存，之后允许重试。
- 存档携带地图布局 mapLayout 和 explorationVersion；旧存档按房间实际进入/通关证据修正 visited。新存档优先从保存的布局恢复，避免地图资源变化影响已有进度。
- continueTo 同步更新 mapName、stage、scene 并清除旧战斗锁。UI 在下一层地图加载成功后才切层，阻止重复点击；刷新从已保存角色继续，恢复失败保留原存档。

### 持续状态与手牌上限

手牌弃牌交互统一见 `docs/reference/small_rules.md`「统一手牌弃牌交互」：`pendingHandDiscard` + 战斗 `confirmDiscard`/`cancelDiscard`、地图 `selectHandDiscardIndex`→`confirmHandDiscard`/`cancelHandDiscard`；弃牌符/熔炉无 index 自动 `beginHandDiscard`。

`StatusRegistry.handLimitDelta` 定义持续状态对手牌上限的修正；`StatusService.handLimit(entity, base)` 纯计算有效上限，`EngineModes.handLimit()` / `Engine.getHandLimit(owner)` 统一用于补牌、AI 弃牌和玩家回合结束检查。流沙（`quicksand`）上限为 1，修正为 -1。牌堆和存档里的 `handLimit` 始终保存基础上限，避免刷新、净化和配饰同步造成重复扣减。

铁匠铺成本中的 `wuneng` 是必须预留并扣除的万能兽元；剩余万能兽元才可替代普通兽元不足部分。支付抉择：`pendingBeastPayment.plans`；`usesWild` 仅指标替普通的万能。方案按扣款组合去重（不按 `wildSub` 合并；本+火+万2 → 4 条）。`plans.length > 1` 或任一 `usesWild` → 弹窗；唯一且无顶替 → 直接扣。见 `docs/adventure_guide/rooms.md`。

### 攻击修正 Buff

`combat/attack_buffs.js` 统一负责熔脉/暴击可用性、单次攻击互斥、状态消耗与 NPC 优先级。UI 仅提交 `resolveAttackBuffChoice({buff})`（magmaVein / crit / null），不能自行改伤害。先选择 Buff，选择消耗后跳过攻击修正道具；不使用时才进入道具阶段。`pendingAttack.attackModifier` 随快照保存，阻止重复消耗和客户端绕过互斥。熔脉只乘技能基础伤害（含技能 AoE），不乘正义之锤等额外固定修正、独立 Buff 伤害或反击；实时伤害公式重新计算后仍按 ×1.5 向上取整。新技能当次获得的熔脉不立即消耗，留给后续数字牌进攻。

### 冒险地图返回结算与场景历史

- s.pendingMapReturnEffects 保存生命核心、智慧项链和新层回血的待结算标记；onCombatReturnToMap() 仅在 MAP 阶段消费一次。UI render() 在投影与存档前结算，奖励/溢出弹窗不消费，恢复存档后沿用同一入口。
- 地图回血事件携带 extra.amount/hpBefore/hpAfter/timing，UI 从 extra 读取并依次播放饰品闪烁、血条发光和回复飘字；满血仍闪烁但不显示 +0。
- s.usedScenes 记录本局场景历史；地图入口和战斗结算入口均传给 selectStageMap(stage, usedScenes)。只有成功载入下一层才追加历史，四层从五场景无放回抽取，Stage 4 胜利终止冒险。

### Boss 战利品骰

- 普通怪出局投 1 次 D12，精英怪投 2 次，Boss 投 3 次；统一由 AdventureBattleEngine._resolveAdventureTrophyDrop() 按其 AdventureLoot 掉落表结算。每次中签即时创建玩家战利白卡并排入 trophyDrop 动画，落空不补偿，不额外增加普通掉落。
- 每颗骰子仍通过 rollD12() 的遥控骰子边界；trophyDropHandled、trophyRolls 与录像随机带支持中途存档恢复、避免重复发牌。Stage 4 同样先播放三次骰子和获取动画，再展示通关。
- 冒险奖励层不再滚动 Boss 饰品。Boss 结算直接进入 boss-exit，白卡已入手，无需领取/暂存。战斗 trophyDrop 和地图 itemAcquired(kind=trophyWhite) 统一负责各自的小动画，不二次创建实体牌。

### 冒险场景与遭遇池边界

- AdventureEngine.availableScenes(stage) 使用与遭遇选择相同的场景池和 minStage 条件；城堡、丛林、冻洋、沙漠、火山按各自 Boss 的 `minStage` 参与对应层抽取。
- 普通怪物与 Boss 仅从当前场景池选取；缺少该层配置时仅查看本场景其他层的名字，再过滤出现条件。禁止全局怪物/Boss 池兜底。
- 房间预设或存档缓存的敌人须属于当前场景的可用池；不合法时进入前重选。无可用敌人时拒绝进入并保留未清除状态，不能自动通关。已开始战斗的会话仍保留其原始敌人以确保可恢复。

### 掉落结算与播放顺序

- 掉落表以被击败 NPC 的 AdventureLoot.getDropRule() 返回场景为准，显示与发牌始终查同一张表；地图场景只负责选择遭遇，旧跨场景会话及冒险测试仍可正确发放对应掉落。
- 骰子事件携带 drops 结果，trophyDrop 同时携带 dropSummary。每次显示骰面与获得内容/无收获，保持可读停留后播放白卡入手动画，再进入下一次投掷；快进模式不压缩掉落结果停留时间。
- 胜利事件在掉落播放之后呈现，控制器在待播放事件或遥控骰子决定未结束前不保存最终奖励、不打开结算页。结束兜底新生成的掉落队列也必须先播放，防止刷新跳过动画。

### 故障房与献祭房

- 故障房（`GLITCH`）每房只允许投一次 D12；`room.glitchEvent` 保存 `status/roll/originalRoll/adjusted` 等检查点。离开、刷新或重进不会补投。异常战斗结束后只把事件标记为 `done`，不再重复结算奖励。
- 献祭房（`SACRIFICE`）的扣血在 UI 保存或播放动画前同步提交，且必须至少保留 1 点生命。献祭 1 点生命换随机道具，献祭 5 点生命升级 1 张战利白卡；结果写入 `room.sacrificeResult`，刷新后不能重刷。
- 精英房（`ELITE`）使用 `AdventureElitePool` 的 1v1 精英怪，奖励结算同普通房，但战利品骰投 2 次，并在第 10 面额外给 `DrawTwoTrophy`。

### 冒险道具效果注册表

- 道具定义统一在 `items/item_defs.js`：`consumable` 占 6 格道具槽，`trophyWhite` 进入玩家牌库循环，`accessory` 获得后自动生效并受携带上限限制。
- 战斗内效果按 `combatUse` 注册在 `items/combat_effects.js`；地图效果注册在 `items/map_effects.js`。处理器返回 `{ok:true,message,...}`、`{ok:false,message}` 或 `{pending:true}`；失败/待决策不得消耗道具。
- 黑曜石、弃牌符、熔炉等“从手牌选牌”的道具统一走 `pendingHandDiscard` 和 `HandDiscardPicker`，不要新增一套弹窗选择器。
- 新道具需要同步图标、图鉴 `docs/adventure_guide/consumables.md`、商店/奖励池和回归测试。

### D12 判定边界

- `adventure/js/battle/dice_controller.js` 是冒险模式唯一允许“暂停后恢复”的骰子决策边界。等待遥控骰子或魔术师时只保存 JSON 检查点并重放单次入口动作，不提前提交计时器或完成结果。
- 遥控骰子与魔术师配饰互斥；若同次判定两者都可用，顺序固定为“先遥控骰子，再魔术师 ±1”。致盲时不能使用遥控骰子。
- 掉落骰、致盲判定、技能判定和 BOSS 多次掉落都必须走 `rollD12()`；不要直接调用 `Math.random()` 绕过遥控/录像随机带。

### 近期状态与技能时机

- 灼伤在 `turnEnd` 结算；`炙热`（scorch）在灼伤结算后触发额外效果；`沙盲`（sandblind）在攻击技能后按层数触发；`荆棘`（thorns）在受击/攻击技能路径上反伤；`流沙`（quicksand）把有效手牌上限压到 1。
- 攻击效果通过 `attackEffectTiming` 明确声明 `beforeDamage` / `afterDamage`，禁止根据技能描述文本猜测时机。攻击方增益在整批命中结束后提交，不能提前清空当前攻击的后置状态。
- 防御技能在该次防御内同步执行：状态、反击、恢复 → 重算伤害 → 潜水/飞翔/守护 → 扣血。防御效果不进入攻击后置队列。
- 潜水只免疫蓝色攻击伤害，不取消目标状态；飞翔失败后仍可选择守护；一次命中只处理一次特殊减伤。相关快照字段 `divingHandled`、`divingBlocked`、`avoidanceHandled` 必须随存档恢复。

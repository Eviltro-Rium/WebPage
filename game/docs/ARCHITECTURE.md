# Combat architecture

战斗核心通过 `window.FurryGame` 暴露三个稳定协议。协议文件不依赖打包器，普通网页、冒险网页和 `file://` 运行方式都可以直接加载。

## Card

由 `js/combat/protocol.js` 中的 `Card.number()`、`Card.item()` 创建。所有牌至少包含：

```js
{
  color: 'RED | YELLOW | BLUE | GREEN | BLACK | WHITE',
  value: 0,                 // 数字牌为 0~7，道具牌为 -1
  isNumberCard: true,
  isItemCard: false,
  isBlack: false,
  isWhite: false
}
```

道具效果使用现有兼容字段（`potion`、`purify`、`trophyWhite` 等）。新增代码应优先使用 `Card.kind(card)`、`Card.normalize(card)`，不要重新定义一套牌对象。

## CardEffects 注册表

`js/combat/card_effects.js` 暴露 `CardEffects.resolve(card)`。它把历史兼容字段
归一化为稳定的 `id`/`kind`，统一识别数字牌、普通道具、紫/绿魔法和战利白卡；
`CardEffects.apply(engine, card, context)` 负责调用引擎的治疗、抽牌、净化、换牌及
战利白卡效果。战斗流程只需通过 `CardEffects.isItem()`、`kind()` 或 `apply()`，不应再
为每个新道具增加一组分散的 `if (card.xxx)` 分支。新增卡牌时先在注册表登记匹配规则，
再为复杂效果提供引擎方法或战利白卡 handler。

## CombatState

由 `CombatState.create()` 创建，使用 `CombatState.project(engine)` 输出给 UI/桥接层。引擎仍保留 `engine.s` 作为兼容入口，但状态初始化和序列化不再由引擎手写。

通用字段包括：

- 回合：`phase`、`turn`、`busy`、`activeAttacker`
- 参与者：`player`、`ai`、可选 `ai2`
- 当前牌：`discardTop`、`atkCard`、`defCard` 及对应 owner
- 交互：`selectedCard`、`selectedCards`、`pendingDialog`
- 事件和牌库投影：`events`、`eventLogVersion`、`deck`、`discard`

模式专用字段（例如冒险牌堆计数、领主目标索引）可以继续作为扩展字段挂在状态对象上，不应复制另一套战斗状态结构。

## CombatEvent

由 `engine.emit()` 统一生成 JSON 事件：

```js
{
  id: 42,
  type: 'hit',
  desc: '受到4点伤害',
  target: 'player | ai | ai2',
  amount: 4,
  kind: 'normal'
}
```

事件消费者应根据 `type` 和结构化字段处理逻辑；`desc` 只用于展示，不可再作为业务判断条件。

## 模式适配器

`js/combat/modes.js` 暴露 `EngineModes.adapters`。每个适配器都实现相同的
`createState()`、`createPiles()`、`participants`、`handLimit()` 和目标规范化接口。
`EngineModes.current()` / `forEngine()` 同时接受状态快照或引擎实例，并为快照写入
稳定的 `modeId`，避免从多个布尔字段猜测模式：

- `1v1`：两个参与者，共享标准牌库。
- `1v2`：三个参与者，共享标准牌库，第二个 NPC 使用 `ai2`。
- `lord`：领主拓扑，复用 1v2 参与者但使用独立的回合目标策略。
- `adventure`：三个参与者，可由冒险牌库注入玩家/NPC 牌堆，资源彼此隔离。

引擎只负责通用规则；开始战斗、状态默认值、牌堆资源和目标拓扑通过适配器
获取。新增模式时应新增适配器并实现这些接口，避免在 `engine.js` 中增加整段
`is1v2/isAdventure` 初始化分支。

## 冒险战斗边界

冒险地图引擎和战斗引擎的职责已经分开：

- `adventure/js/battle/battle_engine.js` 是冒险战斗的唯一规则入口，继承通用
  `Engine`，负责状态装配、牌堆连接和通用战斗生命周期。
- `adventure/js/battle/adventure_battle_items.js` 是冒险道具、配饰和 Buff
  转移扩展。它只向 `AdventureBattleEngine.prototype` 注入冒险专属效果，不再把
  道具分支和牌堆生命周期混在同一个类文件中。
- `adventure/js/battle/adventure_battle_controller.js` 只负责浏览器生命周期：
  挂载/卸载战斗 UI、保存恢复当前标签页快照、调用 `finishAdventureBattle()`，
  不实现出牌或防御规则。
- `adventure/js/engine/combat_result.js` 只负责把战斗结果写回地图引擎，处理房间
  清理、胜利回血、奖励阶段和失败状态。

地图引擎只保存一个轻量的 `s.combat` 遭遇描述（敌人、房间类型和 1v2 标志），
不再创建旧的 `AdventurePile` 战斗副本。这样玩家牌库、NPC 牌库和当前战斗状态
不会被两条链路同时修改。新增战斗功能应修改 `AdventureBattleEngine`，不要在地图
引擎中重新实现一套 `playerPlayCard`/`npcDefendTurn`。

## 冒险主界面与战斗会话

冒险页面采用“状态/动作”和“页面组合”两层：`adventure/js/ui/adventure_ui.js`
负责存档、地图动作、商店/奖励页构建方法以及状态刷新；
`adventure/js/ui/adventure_ui_views.js` 只负责依据阶段选择要挂载的页面、组合侧栏和
日志。这样新增房间页面时只改视图路由，不需要把地图动作和战斗页面重新复制一份。

浏览器生命周期统一由 `adventure/js/battle/adventure_battle_controller.js` 管理，
战斗暂停、刷新恢复、清理和主动退出统一经过
`adventure/js/battle/adventure_battle_session.js`。战斗引擎和地图存档不直接访问
`sessionStorage`；测试战斗也不会写入会话。主动从菜单退出时先清理会话和地图存档，
正常结算则由控制器把结果交回地图引擎。

## 状态注册表

`js/combat/status_registry.js` 暴露 `FurryGame.StatusRegistry`，而
`js/combat/status_service.js` 暴露唯一写入入口 `FurryGame.StatusService`。每个状态只在注册表
定义一次：

```js
{
  id: 'hypothermia', property: 'hypothermia', label: '失温',
  icon: 'buff_icons/hypothermia.png', polarity: 'debuff',
  stack: true, max: 2, cleanse: 'reset', trigger: 'onThreshold'
}
```

注册表提供只读元数据和查询；状态服务提供 `ensure()`、`set()`、`add()`、`remove()`、
`clear()`、`clearGroup()`、`snapshot()` 和 `restore()`。战斗净化、超级净化、冒险净化、
Buff 图标和 Buff 转移 UI 都应从这两个接口读取，不能再各自维护状态数组或直接写入
状态字段。新增状态时至少补齐 `property`、`polarity`、`icon`、`cleanse` 和 `trigger`，
再在实际触发逻辑中调用 `StatusService`；不要只在 UI 增加一个图标。

## 统一检查

从仓库根目录运行 `node game/scripts/check.js` 可执行稳定检查：HTML/UI 模块图、
全部游戏脚本语法，以及协议、事件矩阵、适配器、状态注册表和 UI 测试。提交前需要完整回归时
再运行 `node game/scripts/check.js --all`；该模式会额外执行所有冒险测试。

## CombatRuntime 与牌堆不变量

`js/combat/runtime.js` 是浏览器和测试共用的运行时边界：

- `CombatRuntime.random()`、`randomInt()` 是唯一的随机数入口，测试可用
  `setRandomSource(fn)` 注入固定序列，结束后调用 `resetRandomSource()`。
- `schedule(owner, fn, delay, channel)`、`wait()`、`cancel()` 统一一次性定时器。
  同一个 owner/channel 的旧计时器会先取消，避免抽牌、飘字和卡牌动画互相竞争。

`js/combat/invariants.js` 暴露 `CombatInvariants.check(engine, reason)`。引擎在初始化、
出牌、抽牌、弃牌、弃牌库顶变更、洗牌和冒险房间结束后调用它，检查：

- 玩家与 NPC 牌堆引用隔离；冒险 1v2 两个 NPC 共享同一牌库/弃牌库；
- 牌的按类型数量相对初始化快照不增加或丢失；
- 当前弃牌库顶仍属于记录的 owner；
- 冒险战斗结束时 NPC 手牌已全部回收。

检查失败默认只返回带 reason 的报告，不向生产控制台刷屏；调试时可传入 `{ warn: true }`
记录警告，测试可传入 `{ throw: true }` 让它直接抛错。
这些检查只观察状态，不改变牌堆内容。

## Engine 模块边界

`engine.js` 保留兼容的核心状态和事件入口，职责通过原型模块继续拆分：

- `engine_turns.js`：普通 1v1 的回合、阶段、弃牌和结束回合状态机。
- `engine_attack.js`：攻击/防御结算的稳定门面（`resolveAttack()`、
  `resolveDefense()`），供模式适配器调用。
- `engine_ai.js`：AI 角色策略上下文和出牌辅助，具体技能仍由 `AIRegistry` 提供。
- `engine_snapshot.js`：可序列化的 `combatSnapshot()`/`restoreCombatSnapshot()`，
  用于刷新恢复和存档，不把 UI 临时字段写入地图存档。
- `engine_1v2.js`：挑战/双雄的牌堆、AI 回合和目标切换实现。
- `engine_1v2_adapter.js`：1v2 的状态投影、事件确认和 dispatch 路由覆盖。

`engine.js` 不再包含 `start1v2`、`aiTurn1v2` 或 `defend1v2` 的实现，只保留通用
Engine 和稳定兼容入口。1v2、领主和冒险模式继续在适配器中覆盖目标选择、牌堆边界
和特殊阶段；新模式应优先组合这些模块，而不是把模式分支重新塞回 `engine.js`。

## 牌库边界

`CombatDeck` 负责标准牌库创建、初始弃牌库顶和共享牌库回退操作；`EnginePiles`/`DeckPort` 负责兼容旧引擎和模式适配。冒险模式可以覆盖同名牌库方法，但玩家与 NPC 的资源必须通过各自 owner 访问。

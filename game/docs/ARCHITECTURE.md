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

## 统一检查

从仓库根目录运行 `node game/scripts/check.js` 可执行稳定检查：HTML/UI 模块图、
全部游戏脚本语法，以及协议、事件矩阵、适配器和 UI 测试。提交前需要完整回归时
再运行 `node game/scripts/check.js --all`；该模式会额外执行所有冒险测试。

## 牌库边界

`CombatDeck` 负责标准牌库创建、初始弃牌库顶和共享牌库回退操作；`EnginePiles`/`DeckPort` 负责兼容旧引擎和模式适配。冒险模式可以覆盖同名牌库方法，但玩家与 NPC 的资源必须通过各自 owner 访问。

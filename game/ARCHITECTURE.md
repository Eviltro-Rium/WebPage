# Furry Trial 代码结构

## 当前分层

游戏仍使用 classic script，保证直接双击 `index.html` 时也能运行。脚本通过明确的加载顺序组成以下几层：

```text
数据注册层       characters/、ai/、adventure/js/monsters/、items/
事件协议层       js/combat_events.js
战斗规则层       js/engine.js + engine_lord.js + adventure_battle_engine.js
战斗服务层       engine_piles.js、engine_status.js、engine_damage.js、engine_modes.js
冒险持久化层     adventure_engine.js、adventure_deck.js、adventure_save.js
连接层           bridge.js、combat_bridge.js
界面入口层       ui.js（状态/启动入口）
界面渲染层       ui_renderer.js、ui_1v2.js、ui_lord.js、dialogs.js
界面事件层       ui_events.js
界面交互层       ui_controls.js
反馈层           ui_feedback.js、game.css
```

## 扩展规则

1. 新玩法先放在规则层，UI 只能读取状态和播放事件，不能直接修改生命、牌库或 buff。
2. 新事件优先使用 `FurryGame.CombatEvents.Types` 中的类型，并把可计算字段放在事件属性里：`target`、`who`、`amount`、`kind`、`card`。`target` 表示受影响的参与者，`who` 保留为动作发起者/旧事件兼容字段。不要让 UI 通过 `desc` 文本判断规则。
3. 新状态至少同步四处：角色状态初始化、规则结算、事件反馈、净化/存档；最后补一条 `player/ai/ai2` 的回归测试。
4. 新怪物只注册 `monster_registry.js` 所需的攻击/防御回调，不在 `ui.js` 里写怪物特判。

## 本次已完成的结构整理

- `ui.js` 保留启动、状态快照和页面入口；事件播放、视觉渲染、交互控制分别由 `ui_events.js`、`ui_renderer.js`、`ui_controls.js` 组合到 `GameUI.prototype`。
- `ui_feedback.js` 独立负责飘字、命中闪烁、粒子和震屏。
- `engine_piles.js`、`engine_status.js`、`engine_damage.js` 抽取牌库、状态、伤害/炸弹结算；`engine_modes.js` 提供 1v1/1v2/领主/冒险的参与者拓扑适配。
- 普通伤害改用 `kind: 'normal'` 的独立 `hit` 事件，和流血/中毒等语义伤害事件分离；UI 不再读取 `desc.includes('[伤害]')`。
- `combat_events.js` 提供共享事件词汇和目标规范化函数，逐步替代散落在引擎和 UI 中的字符串常量。
- 1v1 与冒险页都按相同顺序加载公共模块，避免某个模式缺少反馈能力。

## 下一阶段建议

### 1. 继续拆分战斗回合状态机

将 `engine.js` 剩余的攻击/防御流程拆成回合服务；1v1、1v2、冒险模式只提供目标选择和牌堆实现。这样增加新模式时不需要复制整套 `aiDefend`/`continueAfterAttack`。

### 2. 统一目标模型

内部统一使用 `player`、`ai`、`ai2` 三个 key，NPC/敌人等显示名称只在 UI 层转换。事件使用 `target`，并通过 `CombatEvents.targetOf()` 兼容旧的 `who: 'enemy'`。

### 3. 建立独立测试目录

把事件协议、牌库、状态效果、AI 选择和 UI 反馈分别测试。现有冒险测试保留为集成测试，不再承担所有模块的回归职责。`combat-events.test.js` 已覆盖 `player/ai/ai2 × normal/bleed/poison/bomb`。

## 加载顺序约定

公共页面和冒险页面都应遵循：

```text
角色/AI注册 → combat_events → engine_piles/status/damage/modes → engine → bridge → 数据注册 → card_style → ui → ui_feedback → ui_renderer → ui_events → ui_controls → 模式扩展
```

新增公共模块时必须同时更新两个 HTML 入口和对应的 Node 测试加载列表。

# Furry Trial 代码结构

## 当前分层

游戏仍使用 classic script，保证直接双击 `index.html` 时也能运行。脚本通过明确的加载顺序组成以下几层：

```text
数据注册层       characters/、ai/、adventure/js/monsters/、items/
事件协议层       js/combat_events.js
战斗规则层       js/engine.js + engine_lord.js + adventure_battle_engine.js
冒险持久化层     adventure_engine.js、adventure_deck.js、adventure_save.js
连接层           bridge.js、combat_bridge.js
界面层           ui.js、ui_1v2.js、ui_lord.js、dialogs.js
反馈层           ui_feedback.js、game.css
```

## 扩展规则

1. 新玩法先放在规则层，UI 只能读取状态和播放事件，不能直接修改生命、牌库或 buff。
2. 新事件优先使用 `FurryGame.CombatEvents.Types` 中的类型，并把可计算字段放在事件属性里：`who`、`amount`、`kind`、`card`。不要让 UI 通过 `desc` 文本判断规则。
3. 新状态至少同步四处：角色状态初始化、规则结算、事件反馈、净化/存档；最后补一条 `player/ai/ai2` 的回归测试。
4. 新怪物只注册 `monster_registry.js` 所需的攻击/防御回调，不在 `ui.js` 里写怪物特判。

## 本次已完成的结构整理

- `ui_feedback.js` 独立负责飘字、命中闪烁、粒子和震屏。
- 普通伤害改用独立 `hit` 事件，和流血/中毒等语义飘字事件分离。
- `combat_events.js` 提供共享事件词汇，逐步替代散落在引擎和 UI 中的字符串常量。
- 1v1 与冒险页都按相同顺序加载公共模块，避免某个模式缺少反馈能力。

## 下一阶段建议

### 1. 拆分 `ui.js`

按职责拆成 `ui_renderer.js`（牌、区域、血条）、`ui_events.js`（事件播放）、`ui_controls.js`（按钮和阶段交互）。保留 `GameUI` 作为外部入口，内部通过原型组合，避免一次性改动页面调用方。

### 2. 拆分战斗引擎

将牌库操作、状态效果、攻击结算和回合状态机分别抽成服务；1v1、1v2、冒险模式只提供目标选择和牌堆实现。这样增加新模式时不需要复制整套 `aiDefend`/`continueAfterAttack`。

### 3. 统一目标模型

内部统一使用 `player`、`ai`、`ai2` 三个 key，NPC/敌人等显示名称只在 UI 层转换。事件使用 `who`，不要混用 `enemy`、`NPC`、`AI2` 等别名。

### 4. 建立独立测试目录

把事件协议、牌库、状态效果、AI 选择和 UI 反馈分别测试。现有冒险测试保留为集成测试，不再承担所有模块的回归职责。

## 加载顺序约定

公共页面和冒险页面都应遵循：

```text
角色/AI注册 → combat_events → engine → bridge → 数据注册 → card_style → ui → ui_feedback → 模式扩展
```

新增公共模块时必须同时更新两个 HTML 入口和对应的 Node 测试加载列表。

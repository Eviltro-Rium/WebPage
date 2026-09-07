# Furry Trial 代码结构

## 目录分层

游戏仍使用 classic script，保证直接双击 `index.html` / `adventure/adventure.html` 也能运行。脚本按类型分目录：

```text
js/characters/          角色注册
js/ai/                  AI 策略注册
js/combat/              战斗协议 / 服务 / 引擎 / Bridge
js/ui/                  对战 UI、对话框、技能文案、图鉴
adventure/js/content/   冒险注册表、货币、房间、怪物基元
adventure/js/monsters/  怪物内容
adventure/js/items/     道具定义 + combat/map 效果表
adventure/js/map/       地图与 CSV
adventure/js/deck/      冒险牌库 / NPC 策略
adventure/js/engine/    AdventureEngine 核心 + shop/rewards/inventory/combat_legacy
adventure/js/battle/    冒险战斗引擎 + combat bridge
adventure/js/save/      存档
adventure/js/ui/        冒险地图 UI / 卡牌渲染
```

加载清单真源：`script_manifest.json`。校验：`node scripts/verify-load-order.js`。

## 扩展规则

1. 新玩法先放在规则层，UI 只能读取状态和播放事件，不能直接修改生命、牌库或 buff。
2. 新事件优先使用 `FurryGame.CombatEvents.Types`；字段用 `target` / `who` / `amount` / `kind` / `card`。用 `CombatEvents.targetOf()`，不要解析 `desc`。
3. 新状态至少同步：角色初始化、规则结算、事件反馈、净化/存档；补 `player/ai/ai2` 回归测试。
4. 新怪物只注册 `monster_registry` 回调，禁止在引擎/UI 硬编码怪物名。
5. 新战斗模式：实现 `EngineModes` + `DeckPort`（或覆盖同名抽弃牌方法），不要复制 `aiTurn` / `defend` / `acknowledgeEvents`。
6. 新一次性道具：`item_defs.js` + `items/combat_effects.js`（对战）和/或 `items/map_effects.js`（地图），禁止再往引擎 `switch` 堆逻辑。

## 已完成的结构整理

- UI mixin 去重；反馈层独立。
- `EngineStatus` / `EngineDamage` / `DeckPort` / `TurnMachine` / `EngineModes` 已接线。
- 冒险道具对战/地图效果表驱动；魔法转移双向；`CastleGhost` 等走 registry。
- **脚本按类型分装进目录**（见上）。
- `AdventureEngine` 拆成 `engine/` 下核心 + shop / rewards / inventory / combat_legacy 混入。
- 公共加载顺序由 `script_manifest.json` 约束，双 HTML 与 Node 测试共用同一组路径约定。

## 加载顺序

```text
characters → ai → combat/* → ui(skills/dialogs/…) → adventure content/items →
map/deck → adventure engine(+mixins) → battle → save → adventure ui
```

新增公共模块时：先改 `script_manifest.json`，再跑 `node scripts/verify-load-order.js`，并更新相关 `tests/*` 加载列表。

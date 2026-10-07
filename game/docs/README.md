# Furry Trial 文档索引

## 架构与开发

- [架构总览与重构路线图](ARCHITECTURE.md)：页面、UI、战斗会话、适配器、牌堆、状态和在线传输的实际边界，以及下一轮拆分顺序与验收条件。
- [战斗结算协议](COMBAT_SETTLEMENT.md)：攻击结算顺序及扩展协议。
- [渲染性能](RENDER_PERFORMANCE.md)：渲染稳定性、位图缓存与动画算法。
- [卡牌与牌库](Cards_deck.md)：卡牌协议、牌堆初始化和弃牌库规则。
- [攻击与防御](attack_guide.md)：冒险怪物伤害方法（普通 / 不可防御 / AOE / 吸血 / 自伤 / 反击 / DoT）调用方式。
- [Buff 图鉴](buff_guide.md)：状态效果、净化规则和触发时机。
- [小规则汇总](small_rules.md)：各引擎边界处理规则与代码位置。

## 冒险模式

- [冒险指南](adventure_guide/README.md)：地图、房间、奖励和测试模式。
  - [城堡怪物](adventure_guide/castle.md) · [丛林怪物](adventure_guide/forest.md) · [冻洋怪物](adventure_guide/ocean.md) · [沙漠怪物](adventure_guide/desert.md)（框架）
  - [配饰](adventure_guide/accessories.md) · [一次性道具](adventure_guide/consumables.md)
  - [掉落](adventure_guide/loot.md) · [奖励](adventure_guide/rewards.md)
- [角色图鉴](Characters/README.md)：玩家角色技能说明。

## 在线模式

- [在线文档索引](online/README.md)
- [功能清单](online/function_list.md)：当前在线 MVP 的功能范围。
- [风险审查](online/bug_risk_review.md)：安全、断线、状态同步和部署风险。
- [延迟与性能审查](online/latency_performance_review.md)：传输、渲染和重连优化建议。
- [在线模式说明](../online_game/README.md)：信令 Worker、房间和本地部署说明。

新增规则或模块时，先更新协议和对应注册表，再补充测试与本索引，避免文档和实现再次分叉。

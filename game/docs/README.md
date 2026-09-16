# Furry Trial 文档索引

## 架构与开发

- [架构总览](ARCHITECTURE.md)：页面、UI、战斗会话、适配器、牌堆、状态和在线传输的实际边界。
- [卡牌与牌库](Cards_deck.md)：卡牌协议、牌堆初始化和弃牌库规则。
- [攻击与防御](attack_guide.md)：战斗阶段、目标和结算顺序。
- [Buff 图鉴](buff_guide.md)：状态效果、净化规则和触发时机。

## 冒险模式

- [冒险指南](adventure_guide/)：地图、房间、奖励和测试模式。
- [角色图鉴](Characters/)：玩家角色技能说明。

## 在线模式

- [功能清单](online/function_list.md)：当前在线 MVP 的功能范围。
- [风险审查](online/bug_risk_review.md)：安全、断线、状态同步和部署风险。
- [延迟与性能审查](online/latency_performance_review.md)：传输、渲染和重连优化建议。
- [在线模式说明](../online_game/README.md)：信令 Worker、房间和本地部署说明。

新增规则或模块时，先更新协议和对应注册表，再补充测试与本索引，避免文档和实现再次分叉。

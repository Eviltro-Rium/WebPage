# Furry Trial 文档索引

## 架构与开发

- [架构总览与重构路线图](ARCHITECTURE.md)：页面、UI、战斗会话、适配器、牌堆、状态和在线传输的实际边界，以及下一轮拆分顺序与验收条件。
- [2026-11-01 混版修复记录](reference/recovery_20261101.md)：恢复范围、保留的新功能与验证方式。
- [规则与开发参考](reference/README.md)：战斗结算、卡牌/牌库、伤害写法、Buff、小规则、遥控骰子和渲染性能。
- [AI 协作说明](../../AGENTS.md)：仓库结构、常用命令、改代码/改文档流程和完成标准。

## 冒险模式

- [冒险指南](adventure_guide/README.md)：地图、房间、奖励和测试模式。
  - [城堡怪物](adventure_guide/castle.md) · [丛林怪物](adventure_guide/forest.md) · [冻洋怪物](adventure_guide/ocean.md) · [沙漠怪物](adventure_guide/desert.md) · [火山怪物](adventure_guide/volcano.md)
  - [配饰](adventure_guide/accessories.md) · [一次性道具](adventure_guide/consumables.md)
  - [掉落](adventure_guide/loot.md) · [房间](adventure_guide/rooms.md)（含献祭房每层3次升级与致命献祭规则）
- [角色图鉴](Characters/README.md)：玩家角色技能说明。

## 在线模式

- [在线文档索引](online/README.md)
- [功能清单](online/function_list.md)：当前在线 MVP 的功能范围。
- [风险审查](online/bug_risk_review.md)：安全、断线、状态同步和部署风险。
- [延迟与性能审查](online/latency_performance_review.md)：传输、渲染和重连优化建议。
- [在线模式说明](../online_game/README.md)：信令 Worker、房间和本地部署说明。

新增规则或模块时，先更新协议和对应注册表，再补充测试与本索引，避免文档和实现再次分叉。

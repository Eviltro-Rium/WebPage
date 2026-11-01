# 规则与开发参考

这里收纳从 `game/docs/` 根目录归档的通用规则、开发说明和历史记录。专题内容仍放在各自的目录：

- 角色技能：[`../Characters/`](../Characters/README.md)
- 冒险玩法与怪物：[`../adventure_guide/`](../adventure_guide/README.md)
- 在线对决：[`../online/`](../online/README.md)
- 总体架构：[`../ARCHITECTURE.md`](../ARCHITECTURE.md)

## 战斗与规则

- [战斗结算协议](COMBAT_SETTLEMENT.md)：攻击、防御、状态提交、潜水/飞翔/守护和判定牌的结算顺序。
- [卡牌与牌库](Cards_deck.md)：卡牌协议、牌堆初始化和弃牌库规则。
- [伤害方法调用指南](attack_guide.md)：普通 / 不可防御 / AOE / 吸血 / 自伤 / 反击 / DoT 的怪物技能写法。
- [Buff 与 Debuff 图鉴](buff_guide.md)：状态效果、层数上限、净化规则和触发时机。
- [小规则汇总](small_rules.md)：跨引擎的边界处理规则与代码位置。
- [遥控骰子](dice_controller.md)：D12 判定、遥控骰子与魔术师配饰的边界。

## 开发与表现

- [渲染稳定性与性能](RENDER_PERFORMANCE.md)：图片 DOM、位图缓存、动画调度和性能约束。

## 历史记录

- [2026-10-27 选择性恢复记录](recovery_20261027.md)：一次回退/恢复的范围说明，仅作历史参考。

- [2026-11-01 混版修复记录](recovery_20261101.md)：恢复范围、规则核对与入口验证。

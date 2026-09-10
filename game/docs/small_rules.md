# 小规则汇总

本文档收录游戏中非主流规则文档容易遗漏的边界处理规则。代码位置以 `engine.js` = `game/js/combat/engine.js` 为基准。

---

## 1. 追加数字牌判定 — 空手牌自动判定为0点

**适用技能：** Ryan 5牌、Saiki 6牌、Moze 4牌、Otto 5牌

玩家打出上述技能后需要再从手牌中选择一张数字牌进行判定。若打出后没有可用的数字牌，**自动判定为0点**（0点伤害，跳过防御），而非卡住等待玩家操作。

- 代码：`engine.js:430`（1v1）、`engine.js:962`（1v2）`needsNumberFollowup` 检查
- 借用牌（`borrowedMonster`）跳过此检查

---

## 2. 牌库空时弃牌库洗回牌堆

抽牌时若牌库为空且弃牌库非空，自动将弃牌库洗回牌堆后继续抽牌。

- 代码：`engine.js:21` `refillDeckIfNeeded()`
- 道具 `shuffleToDeck` 可主动触发洗回

---

## 3. 手牌超限强制弃牌

回合结束时若手牌超过上限（默认5张），进入强制弃牌阶段，玩家须弃至不超过上限。

- 代码：`engine.js:731` `endTurn()`、`engine.js:1318`（1v2）、`engine_lord.js:130`（领主）

---

## 4. 冰封 — 补牌少补1张

有冰封 buff 时，下次补牌少补1张，随后消耗1层冰封。上限1层。

- 代码：`engine.js:240` `_drawNeedWithIceSeal()`

---

## 5. 失温 — 2层强制弃牌

失温达到2层时，玩家必须弃掉1张牌（进入 `PLAYER_DISCARD` 阶段）；AI 自动选择最差牌弃掉。触发后失温层数-1。上限2层。

- 代码：`engine.js:256` `hypothermia()`

---

## 6. 先攻 — 对手先行进攻

怪物拥有 `firstStrike` 属性时，跳过玩家开场补牌，直接进入 AI 回合让对手先行进攻。

- 代码：`battle_engine.js:169`（1v1）、`battle_engine.js:289`（1v2）

---

## 7. 嗜血 — Serenity 专属

Serenity 受到伤害后 HP < 30 时进入嗜血状态；治疗后 HP >= 30 时退出嗜血并触发被动+1生命。

- 代码：`engine.js:260` `hurt()`、`engine.js:236` `heal()`

---

## 8. 潜水 — 免疫蓝色攻击

有潜水 buff 时，免疫有效颜色为蓝色的攻击伤害。AOE 范围内潜水目标同样被跳过。

- 代码：`engine.js:252` `divingBlocksDamage()`、`engine.js:264` `performAttack()`

---

## 9. 冷冻 — 无法防御蓝色攻击

有冷冻 buff 时，无法防御有效颜色为蓝色的攻击（玩家抛错，AI 自动跳过防御）。

- 代码：`engine.js:49` `_freezeBlocksDefend()`

---

## 10. 1v2挑战房胜利后不自动补牌

1v2 挑战房（领主模式/冒险模式）胜利后，不自动补牌，保留结束时的手牌状态直接进入下一关。

- 代码：`engine.js:808` `_checkDeath1v2()`（仅非领主非冒险模式才补齐存活AI手牌）、`engine_lord.js:162` `_lordStartNextAI()`（全灭时跳过补牌直接结束）

---

## 11. AOE 跳过主目标

AOE（范围攻击）跳过主目标，只命中其他目标。1v1 中因无其他目标自然退化。

- 代码：`engine.js:264` `performAttack()` 中 `if(skipTarget&&vk===tk)continue;`

---

## 12. 借用牌不加入玩家收藏

借用怪物牌（`borrowedMonster`）在使用完毕后归还到 NPC 弃牌堆，不进入玩家收藏。借用牌跳过追加数字牌判定、攻击 debuff 记忆和 Saiki 被动。

- 代码：`battle_engine.js:1050` `_returnBorrowedCardsFromHand()`

---

## 13. 暴击 — 消耗规则

Otto 伤害 > 4 且非不可防御且有暴击层数时，可消耗1层暴击将伤害变为不可防御。暴击上限3层。

- 代码：`engine.js:168` `_canOfferOttoCrit()`、`engine.js:173` `_applyOttoCritSpend()`

---

## 14. 灼烧 — 回合结束扣血

回合结束时按当前灼烧层数扣血，层数-1。Leon 免疫灼烧（施加和扣血均跳过）。灼烧上限5层。Blaze 伤害有灼烧加成（+1）。

- 代码：`engine.js:731` `endTurn()`、`engine.js:843`（1v2 AI）

---

## 15. Leon 0牌 — 弃对手2张手牌

Leon 0牌对所有存活对手 +1层灼烧、7点不可防御伤害，自身受到 `目标数×2` 点伤害，并要求弃掉对手2张手牌。若对手手牌不足则弃掉所有可用手牌。

- 代码：`engine.js:1013` `leonZero1v2()`

---

## 16. 对手无手牌时的自动处理

对手无手牌时按角色自动判定：Chan 4牌=2点伤害跳防御、Chan 7牌=6点、Saiki=2点、Blaze=2+灼烧加成、Moze 5牌=恢复2点+1层守护跳防御。

- 代码：`engine.js:149` `opponentEmpty()`

---

## 17. 缴械 — 对手无手牌可弃

缴械效果触发时若对手没有手牌，技能空过。

- 代码：`engine.js:352` `'缴械：对手没有手牌可弃'`

---

## 18. 优惠券 — 商店商品价格减半

持有优惠券配饰（仅能携带1个，锻造需1本兽元+2万能兽元）时，商店所有商品（兽元、配饰、道具、战利白卡）价格变为原来的1/2（向上取整）。商店刷新费用不受折扣影响。

- 代码：`shop.js` `_applyShopDiscount()`、`_shopBeastPrice()`、`_shopSlotPrice()`
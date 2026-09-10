# 伤害方法调用指南

本文档介绍冒险模式战斗中，对怪物 / 玩家造成各种伤害的方法调用方式。所有方法在 `registerMonster()` 的怪物定义中实现，由 `monster_registry.js` 桥接层统一调度。

---

## Emoji 说明

| Emoji | 含义 |
|-------|------|
| 🗡️ | 伤害点数 |
| ❤️ | 恢复生命值 |
| 🛡️ | 格挡/防御 |
| 🃏 | 卡牌 |

---

## 通用上下文对象 `ctx`

`attackDamage(card, ctx)` 第二个参数 `ctx` 在进攻开始时构建：

```javascript
const ctx = {
  playerHandSize:   eng.h.player ? eng.h.player.length : 0,  // 玩家手牌数
  attackerHandSize: eng.h[attackerKey] ? eng.h[attackerKey].length : 0,  // 攻击者手牌数
  attackerHand:     eng.h[attackerKey] || [],                  // 攻击者手牌数组
  playerBleed:      (target.bleed || 0),   // 目标（防守方）【流血】层数
  playerPoison:     (target.poison || 0),  // 目标（防守方）中毒层数
  attackerLush:     (attacker.lush || 0),   // 攻击者自身茂盛层数
};
```

---

## 一、普通伤害

### 方法签名

```javascript
attackDamage(card, ctx) {
  // card: 出牌对象，card.value 为点数 0~6
  // ctx:  上下文对象（见上方）
  return 伤害数值; // 数字，可防御
}
```

### 示例

```javascript
// 固定伤害，按点数段
attackDamage(card) {
  const v = card.value;
  if (v >= 1 && v <= 3) return 3;
  if (v >= 4 && v <= 6) return 4;
  return 0;
}

// 动态伤害，参考玩家手牌数
attackDamage(card, ctx) {
  const v = card.value;
  if (v >= 1 && v <= 3) return v;
  if (v >= 4 && v <= 6) return ctx.playerHandSize || 0;
  return 0;
}

// 【流血】相关：【流血】越多越痛
attackDamage(card, ctx) {
  const v = card.value;
  const bleed = ctx.playerBleed || 0;
  if (v >= 1 && v <= 3) return 2 * bleed;
  if (v >= 4 && v <= 6) return 3;
  return 0;
}
```

### 结算流程

1. 桥接层调用 `attackDamage(card, ctx)` 得到基础伤害 `d`
2. 进入攻击修正阶段（正义之锤 +1 / 攻击修正道具 / 暴击）
3. 玩家进入 AI_DEFEND 阶段选择防御牌
4. 结算格挡：`defendBlock(card, incoming)` 返回格挡量
5. 结算反击：`defendCounter(card, incoming, defender, opponent, eng)` 返回反击量
6. 结算余下伤害

---

## 二、不可防御伤害

### 方法签名

```javascript
attackDamage(card, ctx) { /* 返回伤害数字 */ }
attackUnblockable(card) {
  // card: 出牌对象
  return true;  // 返回 true 则本次进攻完全不可防御
}
```

### 示例

```javascript
// 狐：1/2/3 牌不可防御
attackDamage(card) {
  const v = card.value;
  if (v >= 1 && v <= 3) return v;
  if (v >= 4 && v <= 6) return ctx ? (ctx.playerHandSize || 0) : 0;
  return 0;
},
attackUnblockable(card) {
  return card.value >= 1 && card.value <= 3;
}
```

### 结算流程

1. `attackDamage` 返回伤害
2. `attackUnblockable` 返回 true → `pendingAttack.unblock = true`
3. 跳过 AI_DEFEND 阶段，玩家直接受伤害
4. 攻击修正道具（攻击修正Ⅰ/Ⅱ/Ⅲ）仍可在此阶段使用加伤

---

## 三、对其他角色的 AOE 伤害

### 方法签名

```javascript
// 返回对每个"其他存活角色"的伤害数值（返回 0 表示不触发）
attackAoEOtherChars(card) {
  // card: 出牌对象
  return 伤害数值; // 非零则触发 AOE
}
```

### 示例

```javascript
// 冻洋蓝鲸：4/5/6 对场上所有其他角色造成 4🗡️（不可防御）
attackAoEOtherChars(card) {
  const v = card.value;
  return v >= 4 && v <= 6 ? 4 : 0;
},
attackUnblockable(card) {
  const v = card.value;
  return v >= 4 && v <= 6; // AOE 部分不可防御
}
```

### 结算流程

1. 进攻阶段主伤害结算（同普通/不可防御）
2. 主伤害结算完成后，`performAttack({ type: 'aoe', aoeTargets, aoeDamage })` 对所有"其他"存活角色造成伤害
3. AOE 伤害**不受防御牌影响**（除非有守护/飞翔）
4. 1v2 模式下：进攻方为玩家 → AOE 命中所有 NPC；进攻方为 NPC → AOE 命中玩家和另一个 NPC

> **注意**：当前系统仅支持"对其他角色"的 AOE，不支持"对包括主目标在内的全体角色" AOE。

---

## 四、吸血（不可防御）

### 方法签名

```javascript
attackDrain(card, ctx) {
  // 返回吸取量（数字）
  // 返回值 > 0 时自动：unblock=true + isDrain=true
  return 吸取量;
}
```

### 示例

```javascript
// 丛林水蛭：4/5/6 吸血 3❤️
attackDrain(card) {
  const v = card.value;
  if (v >= 4 && v <= 6) return 3;
  return 0;
}

// 丛林瓢虫：1/2/3 吸血 1 + 茂盛层数 ❤️
attackDrain(card, ctx) {
  const v = card.value;
  if (v >= 1 && v <= 3) return 1 + ((ctx && ctx.attackerLush) || 0);
  return 0;
}

// 城堡蝠：4/5/6 吸血 2 + 玩家【流血】层数 ❤️
attackDrain(card, ctx) {
  if (!card || !card.isNumberCard) return 0;
  if (card.value >= 4 && card.value <= 6) {
    return 2 + ((ctx && ctx.playerBleed) || 0);
  }
  return 0;
}
```

### 结算流程

1. `attackDrain` 返回吸取量 → `unblock=true` + `isDrain=true`
2. 跳过 AI_DEFEND 阶段
3. 结算时调用 `dealAttackHit(attacker, target, amount, isDrain=true)`：
   - 先对 target 造成 `amount🗡️`
   - 再将 target **实际损失**的❤️（上限为 amount）回写给 attacker 作为治疗
4. 吸血量与守护减免同步（守护减免后吸血量减少）

---

## 五、自伤（对自己造成伤害）

### 方法签名

```javascript
attackSelfHurt(card, ctx) {
  // card: 出牌对象
  // ctx:  上下文对象
  // 返回：自伤数字（正数）。bridge 内部自动调用 eng.hurt(attacker, n)
  return 自伤数值;
}
```

### 示例

```javascript
// Leon 0️⃣：每有 1 个对手存活，自伤 2 点
attackSelfHurt(card, ctx) {
  // 仅在 0 牌生效；1v2 时场上可能有 2 个对手
  if (card.value !== 0) return 0;
  const enemyCount = (ctx.playerHandSize !== undefined) ? 1 : 1; // 由 bridge 注入的 ctx 决定
  return enemyCount * 2;
}

// Otto 6️⃣：固定自伤 1 点
attackSelfHurt(card) {
  return card.value === 6 ? 1 : 0;
}
```

### 结算流程

1. bridge 在 `effect()` 中调用 `attackSelfHurt(card, ctx)` 得到自伤数字 `n`
2. 调用 `eng.hurt(attacker, n)` 对自己造成 `n🗡️`
3. 发出 `'desc'` 事件：`<角色名>自伤N点`
4. 自伤**不**经过防御系统，**不**享受守护/飞翔减免
5. 结算顺序：在主要 buff（守护/飞翔/【流血】/中毒/冷冻/冰封/buff清除/茂盛）之后、`attackDrain`/`attackHeal` 之前执行

> 自伤用 `helpers.hurt(自己, 数值)` 或 `eng.hurt(自己, 数值)` 直接扣血，`attackSelfHurt` 方法是怪物框架的统一接口。主角进攻阶段现已统一走 `helpers.hurt()`。

---

## 六、反击

### 方法签名

反击已由 `defendCounter` 方法承担，bridge 内自动调用 `hurt(opponent, counter)`：

```javascript
defendCounter(card, incoming, defender, opponent, eng) {
  // card:      出牌对象
  // incoming:  即将受到的伤害
  // defender:  防守方（怪物自己）
  // opponent:  进攻方（玩家）
  // eng:       战斗引擎
  // 返回：反击伤害数字
  return 反击数值;
}
```

### 示例

```javascript
// 丛林猴：3 牌反击 3 点
defendCounter(card) {
  const v = card.value;
  if (v === 3) return 3;
  return 0;
}

// 冻洋鲨：1/2/3 牌反击 2 点
defendCounter(card, incoming, defender, opponent) {
  const v = card.value;
  if (!(v >= 1 && v <= 3)) return 0;
  return 2;
}
```

### 结算流程

1. bridge 在 `defend()` 中调用 `defendCounter(card, incoming, defender, opponent, eng)` 得到反击数字 `n`
2. 调用 `hurt(opponent, n)` 直接对进攻方造成 `n🗡️`
3. 描述追加：`'反击' + n + '🗡️'`
4. 反击**不**经过玩家防御系统；可被守护/飞翔减免

---

## 七、持续伤害（DoT）

### 流血（Bleed）

```javascript
// 施加【流血】
attackBleed(card) {
  const v = card.value;
  return v >= 4 && v <= 6 ? 1 : 0; // 返回施加层数
}
// 防御时施加【流血】
defendBleed(card) {
  const v = card.value;
  return v >= 1 && v <= 3 ? 1 : 0;
}
```

- 结算：攻击方回合结束后，对目标造成 `层数 × 1🗡️`，然后层数 -1
- 上限：3 层
- 标签：`kind='bleed'`

### 中毒（Poison）

```javascript
attackPoison(card) {
  const v = card.value;
  return v >= 1 && v <= 3 ? 1 : 0;
}
```

- 结算：中毒角色**回合开始前**受 `层数 × 1🗡️`
- 上限：3 层；层数不自然衰减（需净化移除）
- 标签：`kind='poison'`

### 灼烧（Burn）

灼烧不由怪物方法直接施加，由配饰「火焰之拳」触发：

```javascript
// adventure/js/battle/battle_engine.js
_tryFlameFistOnDefend(skip) {
  // 玩家防御时，对攻击方施加灼烧
  this.burn(attacker, stacks); // stacks = 1
}
```

- 结算：攻击方（持有灼烧者）**回合结束后**受 `层数 × 1🗡️`，然后层数 -1
- 上限：5 层
- Leon 免疫灼烧

---

## 八、防御方法

### 格挡

```javascript
defendBlock(card, incoming) {
  // card:      出牌对象
  // incoming:  即将受到的伤害
  // 返回：格挡量（不超过 incoming）
  const v = card.value;
  if (v >= 1 && v <= 3) return Math.min(2, incoming);
  return 0;
}
```

- 格挡发生在反击之前
- 返还余下伤害：`remaining = Math.max(0, incoming - block)`

### 反击

```javascript
defendCounter(card, incoming, defender, opponent, eng) {
  // card:      出牌对象
  // incoming:  即将受到的伤害
  // defender:  防守方（怪物自己）
  // opponent:  进攻方（玩家）
  // eng:       战斗引擎
  // 返回：反击伤害数字
  const v = card.value;
  if (!(v >= 1 && v <= 3)) return 0;
  return 2;
}
```

- 反击**直接对玩家造成伤害**，不经过玩家的防御
- 返还描述：`descParts.push('反击' + counter + '🗡️')`

---

## 八、汇总对照表

| 伤害类型 | 方法 | 可防御 | 可被格挡 | 可被守护/飞翔减免 | 其他 |
|----------|------|--------|----------|-------------------|------|
| 普通伤害 | `attackDamage` | ✅ | ✅ | ✅ | — |
| 不可防御 | `attackDamage` + `attackUnblockable` | ❌ | ❌ | ✅ | — |
| AOE（其他角色） | `attackAoEOtherChars` | ❌（主目标跳过） | ❌ | ✅（守护/飞翔） | — |
| 吸血 | `attackDrain` | ❌ | ❌ | ✅（守护减免后同步减少） | 治疗量 = 实际造成伤害 |
| 自伤 | `attackSelfHurt` | ❌ | ❌ | ❌ | 不经过防御系统；bridge 调用 `hurt(attacker, n)` |
| 流血 DoT | `attackBleed` / `defendBleed` | ❌ | ❌ | ❌ | 攻击方回合结束结算 |
| 中毒 DoT | `attackPoison` | ❌ | ❌ | ❌ | 回合开始结算 |
| 灼烧 DoT | 火焰之拳配饰 | ❌ | ❌ | ❌ | 攻击方回合结束结算 |
| 反击 | `defendCounter` | ❌（直接命中） | — | ✅（守护减免） | 不经过玩家防御；bridge 调用 `hurt(opponent, n)` |

---

## 九、实现文件索引

| 内容 | 文件 |
|------|------|
| 怪物伤害桥接层 | `adventure/js/content/monster_registry.js` → `effect()` / `defend()` |
| 攻击结算引擎 | `adventure/js/battle/battle_engine.js` → `settleAIAttack()` |
| 通用战斗引擎 | `game/js/combat/engine.js` → `performAttack()` / `dealAttackHit()` / `hurt()` |
| 攻击修正（含吸血结算） | `game/js/combat/engine.js` → `gateAdventureAttackMod()` |
| DoT 结算（【流血】/中毒/灼烧） | `game/js/combat/engine.js` / `adventure/js/battle/battle_engine.js` |
| 防御结算 | `adventure/js/content/monster_registry.js` → `defend()` 分支 |

/**
 * 冒险图鉴文案 —— 与 adventure/guide/castle.md、forest.md、ocean.md 对齐。
 * AdventureStageGuide: Stage 强化
 * AdventureMonsterNotes: 出现条件 / 被动 / 特殊说明
 */
(function () {
  window.AdventureStageGuide = {
  "CastleGhost": [
    {
      "stage": "3",
      "text": "4/5/6 牌改为按剩余手牌点数的 **2 倍**造成伤害"
    },
    {
      "stage": "4",
      "text": "防御骰投出 1-6 即可触发免疫"
    }
  ],
  "CastleFirefly": [
    {
      "stage": "2",
      "text": "生命上限 +6（24）"
    },
    {
      "stage": "3",
      "text": "所有进攻伤害 +1"
    },
    {
      "stage": "4",
      "text": "防御格挡改为 `1 + 玩家当前一次性道具数量`"
    }
  ],
  "CastleWolf": [
    {
      "stage": "2",
      "text": "生命上限 +5（25）"
    },
    {
      "stage": "3",
      "text": "所有伤害 +1"
    },
    {
      "stage": "4",
      "text": "格挡 +1"
    }
  ],
  "CastleFox": [
    {
      "stage": "2",
      "text": "生命上限 +6（24）"
    },
    {
      "stage": "3",
      "text": "1/2/3 牌伤害 +1"
    },
    {
      "stage": "4",
      "text": "恢复生命改为 3 点"
    }
  ],
  "CastleBear": [
    {
      "stage": "2",
      "text": "生命上限 +3（28）"
    },
    {
      "stage": "3",
      "text": "1/2/3 牌伤害 +1，4/5/6 牌伤害 +2"
    },
    {
      "stage": "4",
      "text": "防御时增加 **反击 1 点** 伤害"
    }
  ],
  "CastleTiger": [
    {
      "stage": "2",
      "text": "生命上限 +4（24）"
    },
    {
      "stage": "3",
      "text": "1/2/3 牌伤害变为 **不可防御**"
    },
    {
      "stage": "4",
      "text": "反击伤害 +1"
    }
  ],
  "CastleCrow": [
    {
      "stage": "2",
      "text": "生命上限 +5（25）"
    },
    {
      "stage": "3",
      "text": "所有伤害 +1"
    },
    {
      "stage": "4",
      "text": "1/2 牌格挡 **伤害的½（向上取整）**"
    }
  ],
  "CastleBat": [
    {
      "stage": "2",
      "text": "生命上限 +5（20）"
    },
    {
      "stage": "3",
      "text": "吸血 +1（变为 3）"
    },
    {
      "stage": "4",
      "text": "格挡 +1（至多 3 点）"
    }
  ],
  "DungeonGoblin": [
    {
      "stage": "3",
      "text": "伤害 **+1**"
    },
    {
      "stage": "4",
      "text": "防御恢复生命 +1（出1→2，出2→3，出3→4）"
    }
  ],
  "CastleChameleon": [
    {
      "stage": "2",
      "text": "生命上限 +10（50）"
    },
    {
      "stage": "3",
      "text": "进攻 4/5/6/0 伤害 +1（变为 4/4/4/3）"
    },
    {
      "stage": "4",
      "text": "防御 1/2/3 恢复生命 +1（变为 3）"
    }
  ],
  "CastleEagle": [
    {
      "stage": "2",
      "text": "生命上限 +10（45）"
    },
    {
      "stage": "3",
      "text": "所有伤害 +1"
    },
    {
      "stage": "4",
      "text": "反击伤害 +1"
    }
  ],
  "CastleGargoyle": [
    {
      "stage": "3",
      "text": "所有伤害 +1"
    },
    {
      "stage": "4",
      "text": "防御 1/2/3 牌额外恢复 **1** 点生命"
    }
  ],
  "ForestMonkey": [
    {
      "stage": "2",
      "text": "生命上限 +6（24）"
    },
    {
      "stage": "3",
      "text": "所有伤害 +1"
    },
    {
      "stage": "4",
      "text": "防御恢复 +1"
    }
  ],
  "ForestDeer": [
    {
      "stage": "2",
      "text": "生命上限 +5（25）"
    },
    {
      "stage": "3",
      "text": "所有伤害 +1"
    },
    {
      "stage": "4",
      "text": "格挡 +1"
    }
  ],
  "ForestLeech": [
    {
      "stage": "2",
      "text": "生命上限 +5（23）"
    },
    {
      "stage": "3",
      "text": "进攻伤害 / 吸血 +1"
    },
    {
      "stage": "4",
      "text": "防御恢复 +1"
    }
  ],
  "ForestCrocodile": [
    {
      "stage": "2",
      "text": "生命上限 +5（25）"
    },
    {
      "stage": "3",
      "text": "所有伤害 +1"
    },
    {
      "stage": "4",
      "text": "防御额外施加 1 层【流血】"
    }
  ],
  "ForestDendrobatidFrog": [
    {
      "stage": "2",
      "text": "生命上限 +5（23）"
    },
    {
      "stage": "3",
      "text": "所有伤害 +1"
    },
    {
      "stage": "4",
      "text": "防御反击 +1"
    }
  ],
  "ForestLadybug": [
    {
      "stage": "2",
      "text": "生命上限 +5（23）"
    },
    {
      "stage": "3",
      "text": "所有伤害 +1"
    },
    {
      "stage": "4",
      "text": "格挡 +1"
    }
  ],
  "ForestCapybara": [
    {
      "stage": "2",
      "text": "生命上限 +5（25）"
    },
    {
      "stage": "3",
      "text": "所有伤害 +1"
    },
    {
      "stage": "4",
      "text": "将超过 1 点的伤害降低为 1 点"
    }
  ],
  "ForestRafflesia": [
    {
      "stage": "2",
      "text": "生命上限 +5（20）"
    },
    {
      "stage": "3",
      "text": "全体友方恢复 +1"
    },
    {
      "stage": "4",
      "text": "防御恢复 +1"
    }
  ],
  "ForestPiranha": [
    {
      "stage": "3",
      "text": "所有伤害 +1"
    },
    {
      "stage": "4",
      "text": "防御反击 +1"
    }
  ],
  "ForestPanda": [
    {
      "stage": "2",
      "text": "生命上限 +10（55）"
    },
    {
      "stage": "3",
      "text": "进攻伤害 +1"
    },
    {
      "stage": "4",
      "text": "格挡 +1"
    }
  ],
  "ForestPython": [
    {
      "stage": "2",
      "text": "生命上限 +10（45）"
    },
    {
      "stage": "3",
      "text": "进攻伤害 +1"
    },
    {
      "stage": "4",
      "text": "防御反击 +1"
    }
  ],
  "ForestDryad": [
    {
      "stage": "3",
      "text": "进攻伤害 +1"
    },
    {
      "stage": "4",
      "text": "格挡 +1"
    }
  ],
  "FrozenOceanLynx": [
    {
      "stage": "2",
      "text": "生命上限 +5（25）"
    },
    {
      "stage": "3",
      "text": "所有伤害 +1"
    },
    {
      "stage": "4",
      "text": "格挡与反击各 +1"
    }
  ]
};
  window.AdventureMonsterNotes = {
  "CastleGhost": [
    {
      "title": "出现条件",
      "lines": [
        "仅从 Stage 2 开始有几率出现"
      ]
    }
  ],
  "CastleFirefly": [],
  "CastleWolf": [],
  "CastleFox": [],
  "CastleBear": [],
  "CastleTiger": [
    {
      "title": "先手攻击",
      "lines": [
        "战斗开始时虎先手攻击"
      ]
    }
  ],
  "CastleCrow": [],
  "CastleBat": [],
  "DungeonGoblin": [
    {
      "title": "出现条件",
      "lines": [
        "仅在 **Stage 2/3/4** 刷出"
      ]
    },
    {
      "title": "被动",
      "lines": [
        "哥布林在进攻阶段打出数字 **1** 卡牌时触发：",
        "**Stage 2**：玩家损失 **1** 金币",
        "**Stage 3/4**：玩家损失 **1** 件随机道具"
      ]
    }
  ],
  "CastleChameleon": [
    {
      "title": "中毒（新负面）",
      "lines": [
        "堆叠上限 **3**",
        "持有中毒时，**进攻回合开始前**受到等同于中毒层数的伤害",
        "层数不随时间自然减少（持续），可用净化移除"
      ]
    },
    {
      "title": "击败奖励",
      "lines": [
        "战胜 Boss 后玩家额外恢复 **10** 点生命（普通战斗仍为 3 点）"
      ]
    }
  ],
  "CastleEagle": [
    {
      "title": "被动",
      "lines": [
        "Boss **进攻开始之前**，对玩家施加 **1** 层流血。"
      ]
    },
    {
      "title": "飞翔（正面 buff）",
      "lines": [
        "上限 **2** 层",
        "被攻击时花费 **1** 层尝试躲避伤害，成功率 **1/2**",
        "失败后可再花费 1 层继续尝试",
        "与守护用于同一次伤害时 **只能二选一**",
        "只能躲避伤害，**不能**躲避本次攻击附带的 buff（道具闪避可以）",
        "怪物持有飞翔时，受到攻击会优先尝试飞翔躲避，再考虑守护"
      ]
    }
  ],
  "CastleGargoyle": [
    {
      "title": "出现条件",
      "lines": [
        "仅在 **Stage 2/3/4** 刷出"
      ]
    }
  ],
  "ForestMonkey": [],
  "ForestDeer": [
    {
      "title": "先攻",
      "lines": [
        "是（同城堡虎，玩家不补起始手牌，对手先行进攻）"
      ]
    },
    {
      "title": "茂盛",
      "lines": [
        "【茂盛】：正面 buff，每有 1 层【茂盛】，进攻开始前恢复 1 点生命，上限 2 层"
      ]
    }
  ],
  "ForestLeech": [
    {
      "title": "寄生",
      "lines": [
        "【寄生】：正面 buff，上限 1。在自己进攻开始前，吸取对手 **1** 点生命（不可减免）"
      ]
    }
  ],
  "ForestCrocodile": [],
  "ForestDendrobatidFrog": [],
  "ForestLadybug": [
    {
      "title": "被动",
      "lines": [
        "开局获得1层【茂盛】"
      ]
    }
  ],
  "ForestCapybara": [
    {
      "title": "被动",
      "lines": [
        "手牌上限为 3 张"
      ]
    }
  ],
  "ForestRafflesia": [
    {
      "title": "被动",
      "lines": [
        "无进攻阶段，手牌上限为 3 张。每回合自动跳过进攻，跳过后玩家获得 1 层【中毒】。可用 4/5/6 牌防御。"
      ]
    }
  ],
  "ForestPiranha": [
    {
      "title": "出现条件",
      "lines": [
        "仅在 **Stage 2/3/4** 刷出"
      ]
    }
  ],
  "ForestPanda": [],
  "ForestPython": [],
  "ForestDryad": [
    {
      "title": "出现条件",
      "lines": [
        "仅在 **Stage 2/3/4** 刷出"
      ]
    }
  ],
  "FrozenOceanLynx": [
    {
      "title": "冰封",
      "lines": [
        "【冰封】：负面 buff，上限 1。下次补牌时少补 1 张，随后移除 1 层"
      ]
    }
  ]
};
})();

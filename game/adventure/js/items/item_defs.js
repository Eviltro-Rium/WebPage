/**
 * 冒险模式 · 道具定义
 *
 * 一次性道具（consumable）：放入6槽，使用后消耗
 * 战利白卡（trophyWhite）：不占道具槽，进入玩家牌库循环抽取
 * 配饰（accessory）：无数量限制，放入即自动生效
 */

(function () {
  const R = window.AdventureRegistry;
  if (!R) return;

  const ICON = '../icons/items_icons/';

  /* ===== 一次性道具 ===== */

  R.registerItem({
    name: 'PurifyWater1',
    displayName: '净化之水',
    kind: 'consumable',
    description: '清除自身至多1个负面状态；对战中也可清除对手buff（含正面）',
    icon: ICON + 'purify_water.png',
    useScene: 'both',
    price: 3,
    combatUse: 'purify',
    purifyCount: 1,
    needsChoice: true
  });

  R.registerItem({
    name: 'PurifyWater2',
    displayName: '净化之水II',
    kind: 'consumable',
    description: '清除自身至多3个负面状态；对战中也可清除对手buff（含正面）',
    icon: ICON + 'purify_water.png',
    useScene: 'both',
    price: 6,
    combatUse: 'purify',
    purifyCount: 3,
    needsChoice: true
  });

  R.registerItem({
    name: 'FirstAidKit',
    displayName: '急救箱',
    kind: 'consumable',
    description: '恢复7点生命',
    icon: ICON + 'first_aid_kit.png',
    useScene: 'both',
    price: 7,
    combatUse: 'heal',
    healAmount: 7
  });

  R.registerItem({
    name: 'GhostFire',
    displayName: '鬼火',
    kind: 'consumable',
    description: '对对手施加3层灼伤',
    icon: ICON + 'ghost_fire.png',
    useScene: 'combat',
    price: 4,
    combatUse: 'burn',
    burnAmount: 3
  });

  R.registerItem({
    name: 'BurnTrophy',
    displayName: '灼伤战利白卡',
    kind: 'trophyWhite',
    description: '白色战利卡：自动指定当前颜色，对手+1层灼伤，打出后抽1张牌，可搭桥',
    icon: ICON + 'ghost_fire.png',
    price: 5,
    combatUse: 'trophyBurn',
    trophyEffect: 'burn',
    beastTradeCost: ['huo', 'huo']
  });

  R.registerItem({
    name: 'PiercingTrophy',
    displayName: '刺伤战利白卡',
    kind: 'trophyWhite',
    description: '白色战利卡：自动指定当前颜色，对手+1层流血，打出后抽1张牌，可搭桥',
    icon: ICON + 'pierce.png',
    useScene: 'combat',
    price: 5,
    combatUse: 'trophyBleed',
    trophyEffect: 'bleed',
    beastTradeCost: ['ben', 'ben']
  });

  R.registerItem({
    name: 'FreezeTrophy',
    displayName: '冰冻战利白卡',
    kind: 'trophyWhite',
    description: '白色战利卡：自动指定当前颜色，对手获得冷冻，打出后抽1张牌，可搭桥',
    icon: ICON + 'freeze.png',
    useScene: 'combat',
    price: 5,
    combatUse: 'trophyFreeze',
    trophyEffect: 'freeze',
    beastTradeCost: ['shui', 'shui']
  });

  R.registerItem({
    name: 'AttackMod1',
    displayName: '攻击修正Ⅰ',
    kind: 'consumable',
    description: '本次进攻数值伤害 +1',
    icon: ICON + 'attack_mod.png',
    useScene: 'combat',
    price: 1,
    combatUse: 'attackMod',
    attackModBonus: 1
  });

  R.registerItem({
    name: 'AttackMod2',
    displayName: '攻击修正Ⅱ',
    kind: 'consumable',
    description: '本次进攻数值伤害 +2',
    icon: ICON + 'attack_mod.png',
    useScene: 'combat',
    price: 2,
    combatUse: 'attackMod',
    attackModBonus: 2
  });

  R.registerItem({
    name: 'AttackMod3',
    displayName: '攻击修正Ⅲ',
    kind: 'consumable',
    description: '本次进攻数值伤害 +3',
    icon: ICON + 'attack_mod.png',
    useScene: 'combat',
    price: 3,
    combatUse: 'attackMod',
    attackModBonus: 3
  });

  R.registerItem({
    name: 'Piercing',
    displayName: '刺伤',
    kind: 'consumable',
    description: '对对手施加2层流血',
    icon: ICON + 'pierce.png',
    useScene: 'combat',
    price: 4,
    combatUse: 'bleed',
    bleedAmount: 2
  });

  R.registerItem({
    name: 'FreezeItem',
    displayName: '冻结',
    kind: 'consumable',
    description: '对对手施加1层冷冻',
    icon: ICON + 'freeze.png',
    useScene: 'combat',
    price: 3,
    combatUse: 'freeze'
  });

  R.registerItem({
    name: 'Vampire',
    displayName: '吸血',
    kind: 'consumable',
    description: '对对手造成至多3点伤害，并将实际造成的伤害转为自身生命恢复',
    icon: ICON + 'vampire.png',
    useScene: 'combat',
    price: 5,
    combatUse: 'vampire',
    vampireAmount: 3
  });

  R.registerItem({
    name: 'CardMaster',
    displayName: '卡牌大师',
    kind: 'consumable',
    description: '抽2张，或弃光手牌后重抽同等数量',
    icon: ICON + 'card_master.png',
    useScene: 'both',
    price: 7,
    combatUse: 'cardMaster',
    needsChoice: true
  });

  R.registerItem({
    name: 'Dodge',
    displayName: '闪避',
    kind: 'consumable',
    description: '防御出牌阶段使用，闪避本次NPC攻击并使其作废（不结算伤害，并撤销本轮攻击附带的负面状态）',
    icon: ICON + 'dodge.png',
    useScene: 'combat',
    price: 5,
    combatUse: 'dodge',
    defendOnly: true
  });

  R.registerItem({
    name: 'NaturalShield',
    displayName: '自然之盾',
    kind: 'consumable',
    description: '仅防御出牌阶段使用：格挡本次攻击至多5点伤害，获得1层守护',
    icon: ICON + 'nature_shield.png',
    useScene: 'combat',
    price: 5,
    combatUse: 'naturalShield',
    defendOnly: true,
    shieldAmount: 5
  });

  R.registerItem({
    name: 'GuardTrophy',
    displayName: '守护战利白卡',
    kind: 'trophyWhite',
    description: '白色战利卡：获得1层守护；防御阶段改为格挡本次攻击至多5点，打出后抽1张牌，可搭桥',
    icon: ICON + 'nature_shield.png',
    useScene: 'combat',
    price: 5,
    combatUse: 'trophyGuard',
    trophyEffect: 'guard',
    beastTradeCost: ['ben', 'cao']
  });

  R.registerItem({
    name: 'DisarmTrophy',
    displayName: '缴械战利白卡',
    kind: 'trophyWhite',
    description: '白色战利卡：选择对手1张手牌弃掉，打出后抽1张牌，可搭桥',
    icon: ICON + 'disarm.png',
    useScene: 'combat',
    price: 5,
    combatUse: 'trophyDisarm',
    trophyEffect: 'disarm',
    beastTradeCost: ['shui', 'ben']
  });

  R.registerItem({
    name: 'MagicTransfer',
    displayName: '魔法转移',
    kind: 'consumable',
    description: '选择自己一层buff转移给对手',
    icon: ICON + 'magic_transfer.png',
    useScene: 'combat',
    price: 5,
    combatUse: 'buffTransfer',
    needsChoice: true
  });

  R.registerItem({
    name: 'ChameleonPaint',
    displayName: '变色龙颜料',
    kind: 'consumable',
    description: '进攻出牌阶段使用：选择对手1张牌暂借入手牌，可按规则打出并释放该怪物技能',
    icon: ICON + 'chameleon_pigment.png',
    useScene: 'combat',
    price: 8,
    combatUse: 'chameleonPaint',
    needsChoice: true
  });

  R.registerItem({
    name: 'ArmorBreakSpear',
    displayName: '破防之矛',
    kind: 'consumable',
    description: '可防御进攻变为不可防御（与攻击修正Ⅰ/Ⅱ/Ⅲ共用选择，同一技能只能选用一种）',
    icon: ICON + 'armor_piercing_spear.png',
    useScene: 'combat',
    price: 3,
    combatUse: 'attackMod',
    attackModUnblock: true
  });

  /* ===== 配饰 ===== */

  R.registerItem({
    name: 'WisdomNecklace',
    displayName: '智慧项链',
    kind: 'accessory',
    description: '战斗胜利后从牌库补2张牌',
    icon: ICON + 'wisdom_necklace.png',
    beastTradeCost: ['shui', 'shui', 'shui', 'ben', 'cao'],
    onCombatWinDraw: 2
  });

  R.registerItem({
    name: 'FlameFist',
    displayName: '火焰之拳',
    kind: 'accessory',
    description: '防御阶段发动技能时施加1层灼伤（可叠加，最多3个）',
    icon: ICON + 'fire_gloves.png',
    beastTradeCost: ['huo', 'huo', 'huo', 'huo', 'ben'],
    onDefendBurn: 1,
    maxStacks: 3
  });

  R.registerItem({
    name: 'BeastBag',
    displayName: '兽元袋',
    kind: 'accessory',
    description: '兽元上限+3（可叠加，最多2个）',
    icon: ICON + 'beast_core_sack.png',
    beastTradeCost: ['ben', 'ben', 'ben', 'cao', 'cao'],
    beastCapBonus: 3,
    maxStacks: 2
  });

  R.registerItem({
    name: 'LifeCore',
    displayName: '生命核心',
    kind: 'accessory',
    description: '战斗胜利后额外恢复3点生命（可叠加，最多3个）',
    icon: ICON + 'core_of_life.png',
    beastTradeCost: ['cao', 'cao', 'cao', 'shui', 'ben'],
    onCombatWinHeal: 3,
    maxStacks: 3
  });

  R.registerItem({
    name: 'FreezeLaser',
    displayName: '冷冻激光',
    kind: 'accessory',
    description: '进攻造成伤害时对对手施加冷冻（最多1个）',
    icon: ICON + 'freeze_laser.png',
    beastTradeCost: ['shui', 'shui', 'shui', 'wuneng'],
    onAttackDamageFreeze: 1,
    maxStacks: 1
  });

  R.registerItem({
    name: 'EnergyShield',
    displayName: '能量盾',
    kind: 'accessory',
    description: '进攻开始前获得1层守护（可叠加，最多2个）',
    icon: ICON + 'energy_shield.png',
    beastTradeCost: ['cao', 'cao', 'cao', 'ben', 'ben'],
    onAttackStartGuard: 1,
    maxStacks: 2
  });

  R.registerItem({
    name: 'JusticeHammer',
    displayName: '正义之锤',
    kind: 'accessory',
    description: '所有有伤害的技能伤害+1（最多1个）',
    icon: ICON + 'justice_hammer.png',
    beastTradeCost: ['huo', 'huo', 'shui', 'shui', 'ben'],
    onDamageBonus: 1,
    maxStacks: 1
  });

  R.registerItem({
    name: 'PurifyCrystal',
    displayName: '净化水晶',
    kind: 'accessory',
    description: '打出蓝牌时选择清除一个buff；叠加2个时绿牌也生效',
    icon: ICON + 'purify_crystal.png',
    beastTradeCost: ['cao', 'cao', 'shui', 'shui', 'ben'],
    onPlayPurify: 1,
    maxStacks: 2
  });

  R.registerItem({
    name: 'DemonPact',
    displayName: '恶魔契约',
    kind: 'accessory',
    description: '选牌阶段可自伤3点生命抽1张牌（每阶段限1次）',
    icon: ICON + "demon's_contrast.png",
    beastTradeCost: ['huo', 'shui', 'cao', 'wuneng'],
    maxStacks: 1
  });

  R.registerItem({
    name: 'Bind',
    displayName: '捆缚',
    kind: 'consumable',
    description: '进攻回合使用，回合结束后跳过对手进攻，再进行一次进攻',
    icon: ICON + 'binding.png',
    useScene: 'combat',
    price: 8,
    combatUse: 'bind'
  });

  R.registerItem({
    name: 'TimeBomb',
    displayName: '定时炸弹',
    kind: 'consumable',
    description: '对对手施加定时炸弹（倒计时5），对手每打出1张牌倒计时-1，归零时爆炸造成10点伤害。可被净化清除',
    icon: ICON + 'time_bomb.png',
    useScene: 'combat',
    price: 6,
    combatUse: 'bomb',
    bombTimer: 5
  });
})();

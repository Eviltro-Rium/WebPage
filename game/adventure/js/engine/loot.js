/**
 * Adventure trophy loot rules.
 *
 * This module is deliberately independent from the adventure engine and battle
 * engine.  It only owns scene/monster -> d12 -> trophy-card mapping; callers
 * decide when to roll and how to persist the resulting card.
 *
 * Cap: ordinary monsters ≤ 4/12 (1/3); Boss monsters ≤ 6/12 (1/2).
 */
(function () {
  const random = () => window.FurryGame && window.FurryGame.CombatRuntime
    ? window.FurryGame.CombatRuntime.random() : Math.random();

  const CASTLE_RULES = Object.freeze({
    CastleGhost: Object.freeze({ threshold: 4, drops: Object.freeze(['FlyTrophy']) }),
    CastleFirefly: Object.freeze({ threshold: 3, drops: Object.freeze(['FlyTrophy']) }),
    CastleWolf: Object.freeze({ threshold: 4, drops: Object.freeze(['GuardTrophy']) }),
    CastleFox: Object.freeze({ threshold: 4, drops: Object.freeze(['PiercingTrophy']) }),
    CastleBear: Object.freeze({ outcomes: Object.freeze([
      Object.freeze({ threshold: 2, drops: Object.freeze(['GuardTrophy']) }),
      Object.freeze({ threshold: 4, drops: Object.freeze(['PiercingTrophy']) })
    ]) }),
    CastleTiger: Object.freeze({ threshold: 4, drops: Object.freeze(['PiercingTrophy']) }),
    CastleCrow: Object.freeze({ outcomes: Object.freeze([
      Object.freeze({ threshold: 2, drops: Object.freeze(['DisarmTrophy']) }),
      Object.freeze({ threshold: 4, drops: Object.freeze(['SmallPotionTrophy']) })
    ]) }),
    CastleBat: Object.freeze({ threshold: 3, drops: Object.freeze(['PiercingTrophy']) }),
    DungeonGoblin: Object.freeze({ threshold: 4, drops: Object.freeze(['DisarmTrophy', 'DisarmTrophy']) }),
    CastleChameleon: Object.freeze({ outcomes: Object.freeze([
      Object.freeze({ threshold: 4, drops: Object.freeze(['PoisonTrophy']) }),
      Object.freeze({ threshold: 6, drops: Object.freeze(['GuardTrophy']) })
    ]) }),
    CastleEagle: Object.freeze({ outcomes: Object.freeze([
      Object.freeze({ threshold: 3, drops: Object.freeze(['RussianRouletteTrophy']) }),
      Object.freeze({ threshold: 6, drops: Object.freeze(['FlyTrophy']) })
    ]) }),
    CastleGargoyle: Object.freeze({ threshold: 6, drops: Object.freeze(['ZeroTrophy']) })
  });

  // Forest rules mirror docs/adventure_guide/forest.md. Most monsters use a
  // simple threshold (roll <= threshold), while Deer and Rafflesia have two
  // distinct successful outcomes, represented by ordered outcomes.
  const FOREST_RULES = Object.freeze({
    ForestMonkey: Object.freeze({ threshold: 4, drops: Object.freeze(['LushTrophy']) }),
    ForestDeer: Object.freeze({ outcomes: Object.freeze([
      Object.freeze({ threshold: 2, drops: Object.freeze(['LushTrophy']) }),
      Object.freeze({ threshold: 4, drops: Object.freeze(['GuardTrophy']) })
    ]) }),
    ForestLeech: Object.freeze({ outcomes: Object.freeze([
      Object.freeze({ threshold: 2, drops: Object.freeze(['ParasiteTrophy']) }),
      Object.freeze({ threshold: 4, drops: Object.freeze(['PiercingTrophy']) })
    ]) }),
    ForestCrocodile: Object.freeze({ threshold: 4, drops: Object.freeze(['PiercingTrophy']) }),
    ForestDendrobatidFrog: Object.freeze({ threshold: 3, drops: Object.freeze(['PoisonTrophy']) }),
    ForestLadybug: Object.freeze({ threshold: 3, drops: Object.freeze(['LushTrophy']) }),
    ForestCapybara: Object.freeze({ threshold: 4, drops: Object.freeze(['GuardTrophy']) }),
    ForestRafflesia: Object.freeze({ outcomes: Object.freeze([
      Object.freeze({ threshold: 2, drops: Object.freeze(['LushTrophy']) }),
      Object.freeze({ threshold: 4, drops: Object.freeze(['PoisonTrophy']) })
    ]) }),
    ForestPiranha: Object.freeze({ threshold: 3, drops: Object.freeze(['PiercingTrophy']) }),
    ForestPanda: Object.freeze({ outcomes: Object.freeze([
      Object.freeze({ threshold: 4, drops: Object.freeze(['LushTrophy']) }),
      Object.freeze({ threshold: 6, drops: Object.freeze(['GuardTrophy']) })
    ]) }),
    ForestPython: Object.freeze({ threshold: 6, drops: Object.freeze(['PoisonTrophy']) }),
    ForestDryad: Object.freeze({ threshold: 6, drops: Object.freeze(['ZeroTrophy']) })
  });

  // Ocean rules mirror docs/adventure_guide/ocean.md.
  const OCEAN_RULES = Object.freeze({
    FrozenOceanLynx: Object.freeze({ outcomes: Object.freeze([
      Object.freeze({ threshold: 2, drops: Object.freeze(['FreezeTrophy']) }),
      Object.freeze({ threshold: 4, drops: Object.freeze(['IceSealTrophy']) })
    ]) }),
    FrozenWhale: Object.freeze({ outcomes: Object.freeze([
      Object.freeze({ threshold: 2, drops: Object.freeze(['DivingTrophy']) }),
      Object.freeze({ threshold: 4, drops: Object.freeze(['HypothermiaTrophy']) })
    ]) }),
    FrozenOceanShark: Object.freeze({ threshold: 4, drops: Object.freeze(['PiercingTrophy']) }),
    FrozenOceanSeal: Object.freeze({ threshold: 3, drops: Object.freeze(['DisarmTrophy']) }),
    FrozenPolarBear: Object.freeze({ outcomes: Object.freeze([
      Object.freeze({ threshold: 2, drops: Object.freeze(['PiercingTrophy']) }),
      Object.freeze({ threshold: 4, drops: Object.freeze(['HypothermiaTrophy']) })
    ]) }),
    FrozenOrca: Object.freeze({ outcomes: Object.freeze([
      Object.freeze({ threshold: 3, drops: Object.freeze(['DivingTrophy']) }),
      Object.freeze({ threshold: 5, drops: Object.freeze(['PiercingTrophy']) }),
      Object.freeze({ threshold: 6, drops: Object.freeze(['HypothermiaTrophy']) })
    ]) }),
    FrozenOceanSnowyOwl: Object.freeze({ threshold: 4, drops: Object.freeze(['FlyTrophy']) }),
    FrozenOceanSamoyed: Object.freeze({ threshold: 4, drops: Object.freeze(['SmallPotionTrophy']) }),
    FrozenOceanTubeWorm: Object.freeze({ outcomes: Object.freeze([
      Object.freeze({ threshold: 2, drops: Object.freeze(['BurnTrophy']) }),
      Object.freeze({ threshold: 4, drops: Object.freeze(['DivingTrophy']) })
    ]) }),
    FrozenOceanOctopus: Object.freeze({ outcomes: Object.freeze([
      Object.freeze({ threshold: 2, drops: Object.freeze(['DivingTrophy']) }),
      Object.freeze({ threshold: 4, drops: Object.freeze(['SmallPotionTrophy']) })
    ]) }),
    FrozenMammoth: Object.freeze({ outcomes: Object.freeze([
      Object.freeze({ threshold: 3, drops: Object.freeze(['PiercingTrophy']) }),
      Object.freeze({ threshold: 5, drops: Object.freeze(['GuardTrophy']) }),
      Object.freeze({ threshold: 6, drops: Object.freeze(['HypothermiaTrophy']) })
    ]) }),
    FrozenKraken: Object.freeze({ threshold: 6, drops: Object.freeze(['ZeroTrophy']) })
  });

  // Desert rules mirror docs/adventure_guide/desert.md.
  const DESERT_RULES = Object.freeze({
    DesertBison: Object.freeze({ outcomes: Object.freeze([
      Object.freeze({ threshold: 3, drops: Object.freeze(['PiercingTrophy']) }),
      Object.freeze({ threshold: 4, drops: Object.freeze(['CritTrophy']) })
    ]) }),
    DesertCamel: Object.freeze({ outcomes: Object.freeze([
      Object.freeze({ threshold: 2, drops: Object.freeze(['SandblindTrophy']) }),
      Object.freeze({ threshold: 4, drops: Object.freeze(['ThornsTrophy']) })
    ]) }),
    DesertLizard: Object.freeze({ outcomes: Object.freeze([
      Object.freeze({ threshold: 2, drops: Object.freeze(['SandblindTrophy']) }),
      Object.freeze({ threshold: 4, drops: Object.freeze(['QuicksandTrophy']) })
    ]) }),
    DesertSandworm: Object.freeze({ outcomes: Object.freeze([
      Object.freeze({ threshold: 2, drops: Object.freeze(['SandblindTrophy']) }),
      Object.freeze({ threshold: 4, drops: Object.freeze(['ParasiteTrophy']) })
    ]) }),
    DesertScarab: Object.freeze({ outcomes: Object.freeze([
      Object.freeze({ threshold: 2, drops: Object.freeze(['RussianRouletteTrophy']) }),
      Object.freeze({ threshold: 4, drops: Object.freeze(['FlyTrophy']) })
    ]) }),
    DesertScorpion: Object.freeze({ outcomes: Object.freeze([
      Object.freeze({ threshold: 3, drops: Object.freeze(['PoisonTrophy']) }),
      Object.freeze({ threshold: 4, drops: Object.freeze(['ThornsTrophy']) })
    ]) }),
    DesertViper: Object.freeze({ threshold: 4, drops: Object.freeze(['PoisonTrophy']) }),
    DesertVulture: Object.freeze({ outcomes: Object.freeze([
      Object.freeze({ threshold: 2, drops: Object.freeze(['FlyTrophy']) }),
      Object.freeze({ threshold: 4, drops: Object.freeze(['SandblindTrophy']) })
    ]) })
  });

  const SCENE_RULES = Object.freeze({ castle: CASTLE_RULES, forest: FOREST_RULES, ocean: OCEAN_RULES, desert: DESERT_RULES });

  const TROPHY_TAGS = Object.freeze({
    BurnTrophy: "灼伤", PiercingTrophy: "流血", FreezeTrophy: "冰冻",
    IceSealTrophy: "冰封", HypothermiaTrophy: "失温",
    DivingTrophy: "潜水", ScorchTrophy: "炙热", LushTrophy: "茂盛",
    PoisonTrophy: "中毒", ParasiteTrophy: "寄生", ThornsTrophy: "荆棘", SandblindTrophy: "沙盲", QuicksandTrophy: "流沙", GuardTrophy: "守护",
    DisarmTrophy: "缴械", ZeroTrophy: "0技能", TimeBombTrophy: "定时炸弹",
    SmallPotionTrophy: "小药剂", CritTrophy: "暴击",
    FlyTrophy: "飞翔", RussianRouletteTrophy: "俄罗斯赌盘"
  });

  function formatDropSummary(rule) {
    if (!rule) return "";
    const outcomes = Array.isArray(rule.outcomes)
      ? rule.outcomes
      : [{ threshold: rule.threshold, drops: rule.drops }];
    const parts = [];
    let first = 1;
    for (const outcome of outcomes) {
      const last = Number(outcome && outcome.threshold) || 0;
      const drops = Array.isArray(outcome && outcome.drops) ? outcome.drops : [];
      if (last >= first && drops.length) {
        const counts = new Map();
        for (const item of drops) counts.set(item, (counts.get(item) || 0) + 1);
        const range = first === last ? String(first) : first + "-" + last;
        const cards = [...counts.entries()].map(([item, count]) =>
          "[" + (TROPHY_TAGS[item] || item) + "]战利白卡" + (count > 1 ? "×" + count : "")
        );
        parts.push(range + cards.join("、"));
      }
      first = Math.max(first, last + 1);
    }
    return parts.length ? "掉落，" + parts.join("；") : "";
  }

  function getDropRule(monsterName) {
    if (!monsterName) return null;
    for (const sceneKey of Object.keys(SCENE_RULES)) {
      const rule = SCENE_RULES[sceneKey][monsterName];
      if (rule) return Object.freeze({ scene: sceneKey, rule });
    }
    return null;
  }

  function describeMonsterDrop(monsterName) {
    const found = getDropRule(monsterName);
    if (!found) return "";
    const summary = formatDropSummary(found.rule);
    if (!summary) return "";
    return "击败后投掷12面骰。" + summary.replace(/^掉落，/, "");
  }

  function normalizeScene(scene) {
    const value = String(scene || '').trim().toLowerCase();
    if (value === 'castle' || value === '城堡' || value === 'castle_scene') return 'castle';
    if (value === 'forest' || value === '森林' || value === 'forest_scene') return 'forest';
    if (value === 'ocean' || value === '冻洋' || value === 'ocean_scene') return 'ocean';
    if (value === 'desert' || value === '沙漠' || value === 'desert_scene') return 'desert';
    return value;
  }

  function rollD12(randomFn) {
    const source = typeof randomFn === 'function' ? randomFn : random;
    return Math.floor(Math.max(0, Math.min(0.999999999, Number(source()) || 0)) * 12) + 1;
  }

  function rollMonsterDrop(scene, monsterName, randomFn, selectedRoll) {
    const sceneKey = normalizeScene(scene);
    const rule = SCENE_RULES[sceneKey] && SCENE_RULES[sceneKey][monsterName];
    if (!rule) {
      return Object.freeze({ scene: sceneKey, monsterName, roll: null, threshold: 0, drops: Object.freeze([]), summary: "" });
    }
    const roll = Number.isInteger(selectedRoll) && selectedRoll >= 1 && selectedRoll <= 12
      ? selectedRoll : rollD12(randomFn);
    const outcome = Array.isArray(rule.outcomes)
      ? rule.outcomes.find(item => roll <= item.threshold)
      : (roll <= rule.threshold ? rule : null);
    const drops = outcome ? outcome.drops.slice() : [];
    return Object.freeze({
      scene: sceneKey,
      monsterName,
      roll,
      threshold: outcome ? outcome.threshold : (rule.threshold || (Array.isArray(rule.outcomes) ? Math.max(...rule.outcomes.map(item => item.threshold)) : 0)),
      drops: Object.freeze(drops),
      summary: formatDropSummary(rule)
    });
  }

  window.AdventureLoot = Object.freeze({
    SCENE_RULES,
    TROPHY_TAGS,
    normalizeScene,
    rollD12,
    formatDropSummary,
    getDropRule,
    describeMonsterDrop,
    rollMonsterDrop
  });
})();

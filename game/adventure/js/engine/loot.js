/**
 * Adventure trophy loot rules.
 *
 * This module is deliberately independent from the adventure engine and battle
 * engine.  It only owns scene/monster -> d12 -> trophy-card mapping; callers
 * decide when to roll and how to persist the resulting card.
 */
(function () {
  const random = () => window.FurryGame && window.FurryGame.CombatRuntime
    ? window.FurryGame.CombatRuntime.random() : Math.random();

  const CASTLE_RULES = Object.freeze({
    CastleGhost: Object.freeze({ threshold: 3, drops: Object.freeze(['FlyTrophy']) }),
    CastleFirefly: Object.freeze({ threshold: 2, drops: Object.freeze(['FlyTrophy']) }),
    CastleWolf: Object.freeze({ threshold: 2, drops: Object.freeze(['GuardTrophy']) }),
    CastleFox: Object.freeze({ threshold: 2, drops: Object.freeze(['PiercingTrophy']) }),
    CastleBear: Object.freeze({ threshold: 3, drops: Object.freeze(['GuardTrophy']) }),
    CastleTiger: Object.freeze({ threshold: 3, drops: Object.freeze(['PiercingTrophy']) }),
    CastleCrow: Object.freeze({ threshold: 2, drops: Object.freeze(['DisarmTrophy']) }),
    CastleBat: Object.freeze({ threshold: 2, drops: Object.freeze(['PiercingTrophy']) }),
    DungeonGoblin: Object.freeze({ threshold: 1, drops: Object.freeze(['DisarmTrophy', 'DisarmTrophy']) }),
    CastleChameleon: Object.freeze({ threshold: 6, drops: Object.freeze(['PoisonTrophy']) }),
    CastleEagle: Object.freeze({ threshold: 6, drops: Object.freeze(['RussianRouletteTrophy']) }),
    CastleGargoyle: Object.freeze({ threshold: 4, drops: Object.freeze(['ZeroTrophy']) })
  });

  // Forest rules mirror docs/adventure_guide/forest.md. Most monsters use a
  // simple threshold (roll <= threshold), while Deer and Rafflesia have two
  // distinct successful outcomes, represented by ordered outcomes.
  const FOREST_RULES = Object.freeze({
    ForestMonkey: Object.freeze({ threshold: 2, drops: Object.freeze(['LushTrophy']) }),
    ForestDeer: Object.freeze({ outcomes: Object.freeze([
      Object.freeze({ threshold: 1, drops: Object.freeze(['LushTrophy']) }),
      Object.freeze({ threshold: 2, drops: Object.freeze(['GuardTrophy']) })
    ]) }),
    ForestLeech: Object.freeze({ threshold: 2, drops: Object.freeze(['ParasiteTrophy']) }),
    ForestCrocodile: Object.freeze({ threshold: 2, drops: Object.freeze(['PiercingTrophy']) }),
    ForestDendrobatidFrog: Object.freeze({ threshold: 2, drops: Object.freeze(['PoisonTrophy']) }),
    ForestLadybug: Object.freeze({ threshold: 2, drops: Object.freeze(['LushTrophy']) }),
    ForestCapybara: Object.freeze({ threshold: 2, drops: Object.freeze(['GuardTrophy']) }),
    ForestRafflesia: Object.freeze({ outcomes: Object.freeze([
      Object.freeze({ threshold: 1, drops: Object.freeze(['LushTrophy']) }),
      Object.freeze({ threshold: 2, drops: Object.freeze(['PoisonTrophy']) })
    ]) }),
    ForestPiranha: Object.freeze({ threshold: 3, drops: Object.freeze(['PiercingTrophy']) }),
    ForestPanda: Object.freeze({ threshold: 6, drops: Object.freeze(['LushTrophy']) }),
    ForestPython: Object.freeze({ threshold: 6, drops: Object.freeze(['PoisonTrophy']) }),
    ForestDryad: Object.freeze({ threshold: 4, drops: Object.freeze(['ZeroTrophy']) })
  });

  const SCENE_RULES = Object.freeze({ castle: CASTLE_RULES, forest: FOREST_RULES });

  function normalizeScene(scene) {
    const value = String(scene || '').trim().toLowerCase();
    if (value === 'castle' || value === '城堡' || value === 'castle_scene') return 'castle';
    if (value === 'forest' || value === '森林' || value === 'forest_scene') return 'forest';
    return value;
  }

  function rollD12(randomFn) {
    const source = typeof randomFn === 'function' ? randomFn : random;
    return Math.floor(Math.max(0, Math.min(0.999999999, Number(source()) || 0)) * 12) + 1;
  }

  function rollMonsterDrop(scene, monsterName, randomFn) {
    const sceneKey = normalizeScene(scene);
    const rule = SCENE_RULES[sceneKey] && SCENE_RULES[sceneKey][monsterName];
    if (!rule) {
      return Object.freeze({ scene: sceneKey, monsterName, roll: null, threshold: 0, drops: Object.freeze([]) });
    }
    const roll = rollD12(randomFn);
    const outcome = Array.isArray(rule.outcomes)
      ? rule.outcomes.find(item => roll <= item.threshold)
      : (roll <= rule.threshold ? rule : null);
    const drops = outcome ? outcome.drops.slice() : [];
    return Object.freeze({
      scene: sceneKey,
      monsterName,
      roll,
      threshold: outcome ? outcome.threshold : (rule.threshold || (Array.isArray(rule.outcomes) ? Math.max(...rule.outcomes.map(item => item.threshold)) : 0)),
      drops: Object.freeze(drops)
    });
  }

  window.AdventureLoot = Object.freeze({
    SCENE_RULES,
    normalizeScene,
    rollD12,
    rollMonsterDrop
  });
})();
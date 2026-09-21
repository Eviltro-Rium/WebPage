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

  const SCENE_RULES = Object.freeze({ castle: CASTLE_RULES });

  function normalizeScene(scene) {
    const value = String(scene || '').trim().toLowerCase();
    if (value === 'castle' || value === '城堡' || value === 'castle_scene') return 'castle';
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
    const drops = roll <= rule.threshold ? rule.drops.slice() : [];
    return Object.freeze({
      scene: sceneKey,
      monsterName,
      roll,
      threshold: rule.threshold,
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
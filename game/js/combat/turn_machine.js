/* TurnMachine: shared attack/defend settlement continuum.
 *
 * Mode-specific wrappers (1v2 / lord) still live on Engine.prototype and call
 * into these helpers for the base 1v1 path. New modes should prefer adapting
 * target selection via EngineModes rather than copying acknowledgeEvents.
 */
(function (global) {
  const root = global.FurryGame || (global.FurryGame = {});
  const modes = () => root.EngineModes;

  const resolvePlayerAttackTarget = (engine) => {
    const M = modes();
    if (M && typeof M.resolveAttackTarget === 'function') {
      return M.resolveAttackTarget(engine.s);
    }
    return (engine.s && engine.s.attackTarget) || 'ai';
  };

  const TurnMachine = {
    phases: Object.freeze({
      PLAYER_PLAY: 'PLAYER_PLAY',
      PLAYER_DEFEND: 'PLAYER_DEFEND',
      AI_TURN: 'AI_TURN',
      AI_DEFEND: 'AI_DEFEND',
      GUARD_CHOICE: 'GUARD_CHOICE',
      GAME_OVER: 'GAME_OVER'
    }),

    deferSettlement(engine, kind, damage, bleed = 0) {
      damage = Math.max(0, Number(damage) || 0);
      bleed = Math.max(0, Number(bleed) || 0);
      engine.s.pendingDefenseDamage = damage;
      engine.s.busy = true;
      const isDrain = !!(engine.s.pendingAttack && engine.s.pendingAttack.isDrain);
      engine.pendingSettlement = { kind, damage, bleed, isDrain, afterEventId: engine.ver };
      if (!engine.events.length) engine.acknowledgeEvents(engine.ver);
    },

    settlePlayerAttack(engine, pending) {
      const forceEnd = !!engine.s.forceEndPlayerTurn;
      engine.s.forceEndPlayerTurn = false;
      engine._restoreAttackBuffs();
      const target = resolvePlayerAttackTarget(engine);
      const targetChar = engine.s[target] || engine.s.ai;
      const isDrain = !!(pending.isDrain || (engine.s.pendingAttack && engine.s.pendingAttack.isDrain));
      let dmg = pending.damage;
      if (typeof engine.divingBlocksDamage === 'function' && engine.divingBlocksDamage(targetChar, engine.s.atkCard)) {
        engine.emit('desc', targetChar.name + '有[潜水]，免疫蓝色攻击伤害');
        dmg = 0;
      } else {
        dmg = engine.applyDefenderAvoidance(targetChar, dmg);
      }
      engine.dealAttackHit(engine.s.player, targetChar, dmg, isDrain);
      engine.settleBleed(targetChar, pending.bleed);
      // 冻洋蓝鲸：玩家攻击结算AOE伤害和失温（跳过主目标）
      const pa1 = engine.s.pendingAttack || {};
      engine.performAttack({type:'aoe',target,aoeTargets:pa1.aoeTargets,aoeDamage:pa1.aoeDamage,skipTarget:true,hypothermiaTarget:pa1.hypothermiaTarget,hypothermiaAmount:pa1.hypothermiaAmount});
      engine.resolveSerenityHalf();
      engine.afterAttack();
      if (forceEnd && !engine._allEnemiesDead()) engine.startAITurn();
      engine.check();
    },

    settleAIAttack(engine, pending) {
      const forceEnd = !!engine.s.forceEndAITurn;
      engine.s.forceEndAITurn = false;
      const bombOwner = engine.s.atkOwner || 'ai';
      engine._restoreAttackBuffs();
      const isDrain = !!(pending.isDrain || (engine.s.pendingAttack && engine.s.pendingAttack.isDrain));
      const attacker = engine.s[bombOwner] || engine.s.ai;
      let dmg = pending.damage;
      if (typeof engine.divingBlocksDamage === 'function' && engine.divingBlocksDamage(engine.s.player, engine.s.atkCard)) {
        engine.emit('desc', '你有[潜水]，免疫蓝色攻击伤害');
        dmg = 0;
      }
      engine.dealAttackHit(attacker, engine.s.player, dmg, isDrain);
      engine.settleBleed(engine.s.player, pending.bleed);
      engine._tickBomb(bombOwner);
      // 冻洋蓝鲸：防御结束后结算AOE伤害和失温（跳过主目标玩家）
      const pa2 = engine.s.pendingAttack || {};
      engine.performAttack({type:'aoe',target:'player',aoeTargets:pa2.aoeTargets,aoeDamage:pa2.aoeDamage,skipTarget:true,hypothermiaTarget:pa2.hypothermiaTarget,hypothermiaAmount:pa2.hypothermiaAmount});
      engine.resolveSerenityHalf();
      engine._grantChaosIfKnight('ai');
      if (forceEnd) engine.endAi();
      else engine.continueAIAttack();
    },

    acknowledgeEvents(engine, through) {
      engine.events = engine.events.filter(e => (e.id || 0) > through);
      const bridge = engine.s.pendingAIBridge;
      if (bridge && through >= bridge.afterEventId) {
        engine.s.pendingAIBridge = null;
        engine._tickBomb(bridge.owner || 'ai');
        if (bridge.mode === 'defense') {
          engine.later(() => engine.aiDefend(bridge.attackCard, bridge.damage), 220);
        } else {
          engine.later(() => engine.aiTurn(), 220);
        }
      }
      const continuation = engine.s.pendingAIContinue;
      if (continuation && through >= continuation.afterEventId) {
        engine.s.pendingAIContinue = null;
        engine._tickBomb(engine.s.atkOwner || 'ai');
        engine.continueAIAttack();
        return;
      }
      const pending = engine.pendingSettlement;
      if (!pending || through < pending.afterEventId) return;
      engine.pendingSettlement = null;
      engine.s.pendingDefenseDamage = 0;
      if (pending.kind === 'PLAYER_ATTACK') {
        this.settlePlayerAttack(engine, pending);
        return;
      }
      this.settleAIAttack(engine, pending);
    },

    continueAIAttack(engine) {
      if (!engine.s) return;
      if (!engine.s.player.alive || !engine.s.ai.alive) {
        engine.check();
        return;
      }
      engine.s.phase = 'AI_TURN';
      engine.s.busy = true;
      engine.s.pendingAttack = null;
      engine.s.pendingDefenseDamage = 0;
      engine.s.attackDebuffSnapshot = null;
      engine.s.atkCard = engine.s.defCard = null;
      engine.s.atkOwner = engine.s.defOwner = null;
      engine.s.revealCards = [];
      engine.later(() => engine.aiTurn(), 220);
      return engine.check();
    }
  };

  root.TurnMachine = Object.freeze(TurnMachine);
})(window);

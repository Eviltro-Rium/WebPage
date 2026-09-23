/* AI behavior facade.  Character-specific policy stays in AIRegistry while
 * this adapter owns the engine context and helper callbacks. */
(function (global) {
  const Combat = global.FurryGame || {};
  const Engine = global.Engine;
  if (!Engine) throw new Error('engine_ai.js requires engine.js');

  const clone = value => (global.FurryGame && global.FurryGame.Card && global.FurryGame.Card.clone)
    ? global.FurryGame.Card.clone(value)
    : value == null ? value : JSON.parse(JSON.stringify(value));

  const EngineAI = {
    aiTurn() {
      // Keep the legacy implementation private to the core while exposing a
      // stable AI entry point to turn adapters and future strategy modules.
      return this.legacyAiTurn();
    },

legacyAiTurn(){if(!this.s.aiTurnStarted){this.turnStart('ai');this.s.aiTurnStarted=true;this.s.aiHasPlayed=false;if(!this.s.ai.alive)return this.check()}let _noAtkMod=this._getAdventureMod(this.name(this.s.ai));if(_noAtkMod&&_noAtkMod.noAttack){this.emit('desc',this.s.ai.name+'无进攻阶段，跳过进攻');if(typeof _noAtkMod.attackSkipEffect==='function')_noAtkMod.attackSkipEffect(this,this.s.ai,this.s.player);return this.later(()=>this.endAi(),700)}let top=this.s.discardTop,chosen=this.chooseAIPlay(top);if(!chosen){if(!this.s.aiHasPlayed&&this.h.ai.length){let dropped=this.h.ai.splice(0,this.h.ai.length);for(let i=dropped.length-1;i>=0;i--)this.discardWithEvent(dropped[i],'ai',{handIndex:i,desc:`AI无牌可出，弃掉${this.cardText(dropped[i])}`});this.emit('desc',`AI无牌可出，弃掉全部${dropped.length}张手牌`)}return this.later(()=>this.endAi(),700)}let i=this.h.ai.indexOf(chosen),c=this.h.ai.splice(i,1)[0];this.setAIWildColor(c,top,false);this.s.aiHasPlayed=true;this.s.atkCard=clone(c);this.s.atkOwner='ai';this.setDiscardTop(c,'ai');this.rememberAttackDebuffs('player');let _buffBefore={bleed:this.s.player.bleed||0,burn:this.s.player.burn||0,poison:this.s.player.poison||0,blind:this.s.player.blind||0,iceSeal:this.s.player.iceSeal||0,frozen:!!this.s.player.frozen};this.applySaikiPassive(this.s.ai,this.s.player,c);this.emit('aiPlay',`AI ${this.name(this.s.ai)} 按角色策略出牌`,c);this.announceAIColor(c);if(window.CardEffects&&window.CardEffects.isItem(c)){let kind=this.itemKind(c);this.emit('itemEffect',this.itemEffectDesc(c,'ai'),c,{effect:kind,who:'ai'});this.useItem(c,this.s.ai,this.s.player,'ai');if(c.isBlack&&this.name(this.s.ai)==='Vixraps')this._beginVixrapsPassive('ai',c,'AI_TURN');this.s.pendingAIBridge={mode:'attack',afterEventId:this.ver,effect:kind,owner:'ai'};return this.check()}this._applyAttackSkillThorns(this.s.ai);this._deferAttackBuffs('player',_buffBefore);let r=this.aiSpecialEffect(this.name(this.s.ai),c.value,c)||this.effect(this.name(this.s.ai),c.value,c,this.s.ai,this.s.player);this._deferAttackBuffs('player',_buffBefore);if(r.immediateBuffs)this._restoreAttackBuffs();this.s.pendingAttack={damage:r.d,unblock:r.unblock,isDrain:!!(r.isDrain||r.drain),aoeTargets:r.aoeTargets,aoeDamage:r.aoeDamage};{let freezeBlock=this._freezeBlocksDefend(this.s.player,this.s.atkCard);if(r.d&&!r.skip&&!r.unblock&&!freezeBlock){if(this.s.player.sleep){this.emit('desc','你处于[沉睡]，无法打出防御牌');this.s.phase='AI_TURN';this.s.busy=true;this.deferSettlement('AI_ATTACK',r.d,0);return this.check()}if(this._beginPlayerDefendFlow(r.d,{unblock:false,freezeBlock:false}))return this.check();return}if(r.d&&(r.unblock||freezeBlock)){if(this._beginPlayerDefendFlow(r.d,{unblock:!!r.unblock,freezeBlock}))return this.check();return}}if(!r.d)this.emit('desc',`AI ${this.name(this.s.ai)} 本次技能分支未造成伤害，跳过防御`,c);if(r.d&&this.playerNeedsAvoidChoice()){this.askGuard(r.d);return}this._restoreAttackBuffs();this.dealAttackHit(this.s.ai,this.s.player,r.d,!!(r.isDrain||r.drain));this.s.phase='AI_TURN';this.s.busy=true;this.s.pendingAIContinue={afterEventId:this.ver};return this.check()},

    aiSpecialEffect(name, value, card) {
      const actor = this.s.ai;
      const target = this.s.player;
      const owner = this.s.atkOwner && this.s.atkOwner !== 'player' ? this.s.atkOwner : 'ai';
      const registry = global.AIRegistry;
      const character = registry && registry.get ? registry.get(name) : null;
      if (!character || typeof character.specialEffect !== 'function') return null;
      const silent = { silent: true };
      const helpers = {
        burnTarget: amount => this.burn(target, amount, silent),
        burnSelf: amount => this.burn(actor, amount, silent),
        bleedTarget: amount => this.bleed(target, amount, silent),
        gainGuard: amount => this.addGuard(actor, amount),
        healSelf: (amount, kind) => this.heal(actor, amount, kind),
        drawSelf: (amount, animate) => this.draw(owner, amount, animate),
        clearSelf: () => this.clearDebuffs(actor),
        selfHand: this.h[owner],
        targetHand: this.h.player,
        owner,
        target,
        self: actor,
        copy: clone
      };
      return character.specialEffect(this, name, value, card, actor, target, owner, helpers, this.aiContext());
    },

    chooseAttack(top, hand) {
      return this.chooseAIPlay(top || this.s.discardTop, hand || this.h.ai);
    },

    chooseDefense(top, damage, hand) {
      return this.chooseAIDefend(top || this.s.discardTop, damage, hand || this.h.ai);
    }
  };

  Combat.EngineAI = Object.freeze(EngineAI);
  Object.assign(Engine.prototype, EngineAI);
})(window);

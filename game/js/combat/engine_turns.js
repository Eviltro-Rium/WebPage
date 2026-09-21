/* Turn/phase state machine extracted from the legacy Engine class. */
(function (global) {
  const Combat = global.FurryGame || {};
  const Engine = global.Engine;
  if (!Engine) throw new Error('engine_turns.js requires engine.js');

  const EngineTurns = {
    fillHands(isPlayerPhase) {
      const adapter = this._adapter();
      const limit = adapter && adapter.handLimit
        ? owner => adapter.handLimit(this, owner)
        : owner => owner === 'player' ? (this.s.handLimit || 5) : 5;
      const playerLimit = limit('player');
      const aiLimit = limit('ai');
      this.draw('player', this._drawNeedWithIceSeal('player', Math.max(0, playerLimit - this.h.player.length)), true);
      this.draw('ai', this._drawNeedWithIceSeal('ai', Math.max(0, aiLimit - this.h.ai.length)), true);
      if (isPlayerPhase) this.emit('desc', '回合结束：双方手牌补至5张');
    },

    trimAI() {
      while (this.h.ai.length > 5) {
        const worst = this.chooseAIDiscard(this.h.ai);
        const card = this.h.ai.splice(worst, 1)[0];
        this.discardWithEvent(card, 'ai', { handIndex: worst, desc: `AI手牌超限，按角色策略弃掉${this.cardText(card)}` });
      }
    },

    startAITurn() {
      this.fillHands(true);
      this.s.phase = 'AI_TURN';
      this.s.busy = true;
      this.s.activeAttacker = 'ai';
      this.s.forceEndAITurn = false;
      this.s.pendingAIContinue = null;
      this.s.atkCard = this.s.defCard = null;
      this.s.atkOwner = this.s.defOwner = null;
      this.s.selectedCards = [];
      this.later(() => this.aiTurn());
      return this.check();
    },

    endTurn() {
      if (this.s.phase !== 'PLAYER_PLAY') throw Error('当前不能结束回合');
      if (this.h.player.length > this.s.handLimit) {
        this.s.forcedDiscard = true;
        this.s.phase = 'PLAYER_DISCARD';
        this.s.selectedCard = -1;
        this.s.selectedCards = [];
        this.emit('desc', `手牌超过${this.s.handLimit}张，请弃至不超过${this.s.handLimit}张`);
        return this.state();
      }
      this.settleBurn(this.s.player);
      return this.startAITurn();
    },

    enterDiscard() {
      if (this.s.hasPlayedThisTurn) throw Error('本回合已出牌，不能再弃牌');
      this.s.forcedDiscard = false;
      this.s.phase = 'PLAYER_DISCARD';
      this.s.selectedCard = -1;
      this.s.selectedCards = [];
      return this.state();
    },

    confirmDiscard() {
      const selected = this.s.selectedCards || [];
      if (!selected.length) throw Error('请选择要弃掉的牌');
      selected.sort((a, b) => b - a);
      for (const i of selected) {
        if (this.h.player[i]) {
          const card = this.h.player.splice(i, 1)[0];
          this.discardWithEvent(card, 'player', { handIndex: i, desc: `玩家弃掉${this.cardText(card)}` });
        }
      }
      this.s.selectedCard = -1;
      this.s.selectedCards = [];
      if (this.s.mayDiscardAfterSkill) {
        this.s.mayDiscardAfterSkill = false;
        this.s.phase = 'PLAYER_PLAY';
        this.emit('desc', 'Ryan 3牌：已完成可选弃牌');
        return this.state();
      }
      if (this.s.forcedDiscard && this.h.player.length > this.s.handLimit) {
        this.emit('desc', `仍需弃牌，手牌必须不超过${this.s.handLimit}张`);
        return this.state();
      }
      this.s.forcedDiscard = false;
      return this.startAITurn();
    },

    cancelDiscard() {
      if (this.s.forcedDiscard) throw Error(`手牌超过${this.s.handLimit}张，不能取消弃牌`);
      this.s.mayDiscardAfterSkill = false;
      this.s.phase = 'PLAYER_PLAY';
      this.s.selectedCard = -1;
      this.s.selectedCards = [];
      return this.state();
    },

    endAi() {
      this.trimAI();
      this.settleBurn(this.s.ai);
      this.s.turn++;
      this.s.phase = 'PLAYER_PLAY';
      this.s.busy = false;
      this.s.activeAttacker = 'player';
      this.s.pendingAttack = null;
      this.s.pendingAIBridge = null;
      this.s.pendingAIContinue = null;
      this.s.forceEndAITurn = false;
      this.s.attackDebuffSnapshot = null;
      this.s.atkCard = this.s.defCard = null;
      this.s.atkOwner = this.s.defOwner = null;
      this.s.revealCards = [];
      this.s.hasPlayedThisTurn = false;
      this.s.aiTurnStarted = false;
      this.s.aiHasPlayed = false;
      const hands = this.handCounts();
      this.silentDraws(function () {
        this.fillHands(false);
        this.turnStart('player');
      });
      this.emitDrawDiff(hands);
      this.check();
    },

    check() {
      for (const key of ['player', 'ai']) this.s[key].alive = this.s[key].hp > 0;
      if (!this.s.player.alive || !this.s.ai.alive) {
        this.s.phase = 'GAME_OVER';
        this.s.busy = false;
        clearTimeout(this.timer);
      }
      this._checkInvariants('check');
      return this.state();
    },

    _allEnemiesDead() {
      if (!this.s) return false;
      const adapter = this._adapter();
      const enemies = adapter && adapter.enemyKeys ? adapter.enemyKeys(this.s) : ['ai'];
      return enemies.every(key => !this.s[key] || !this.s[key].alive);
    },

    later(fn, ms = 550) {
      clearTimeout(this.timer);
      const runtime = global.FurryGame && global.FurryGame.CombatRuntime;
      const schedule = runtime ? runtime.schedule : (owner, callback, delay) => setTimeout(callback, delay);
      this.timer = runtime
        ? schedule(this, () => {
          try { fn(); } catch (error) { console.error(error); }
        }, ms, 'engine')
        : schedule(this, () => {
        try { fn(); } catch (error) { console.error(error); }
        }, ms);
    }
  };

  Combat.EngineTurns = Object.freeze(EngineTurns);
  Object.assign(Engine.prototype, EngineTurns);
})(window);

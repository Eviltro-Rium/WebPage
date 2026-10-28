/* Adventure combat encounter/result adapter.
 *
 * AdventureBattleEngine owns every combat rule and pile operation.  This
 * module only keeps the map engine's encounter metadata and applies the
 * completed battle back to the adventure run (healing, rewards and room
 * state).  It intentionally contains no card-play or NPC-turn logic.
 */
(function () {
  if (typeof AdventureEngine === 'undefined') return;
  const Phase = window.AdventurePhase || {};

  Object.assign(AdventureEngine.prototype, {
    _prepareCombatEncounter(enemy, kind, enemy2 = null) {
      if (!this.s) return null;
      this.s.combat = {
        enemy,
        enemy2,
        kind,
        is1v2: !!enemy2,
        round: 1
      };
      // The controller uses the ordinary player-play phase as the launch
      // signal; map state only keeps this encounter descriptor.
      this.s.phase = Phase.PLAYER_PLAY || 'ADVENTURE_PLAYER_PLAY';
      return this.s.combat;
    },

    onCombatEnd(result) {
      if (!this.s || !this.s.combat) return;
      const room = this.currentRoom();
      this.s.activeCombat = null;

      if (result === 'escape') {
        if (room) {
          room.cleared = true;
          room.visited = true;
          room.rewardClaimed = true;
          room.beastTokenClaimed = true;
          room.stashedLoot = null;
        }
        this.s.pendingMapReturnEffects = null;
        this.s.pendingCombatReward = null;
        this.s.beastReward = null;
        this.s.combat = null;
        this.s.phase = Phase.MAP;
        this._log('怪物脱离战斗：房间已探索，无奖励');
        this.emit('combatEnd', '怪物脱离战斗，无奖励', {result:'escape'});
        return;
      }

      if (result === 'win') {
        this._log('战斗胜利');
        const isBoss = room && room.type === window.RoomType.BOSS;
        const isChallenge = room && room.type === window.RoomType.CHALLENGE;
        const isGlitch = room && room.type === window.RoomType.GLITCH;
        if (isChallenge) {
          // 挑战房只在击败第一个敌人时（战斗内）恢复一次并照常补牌；
          // 击败第二个敌人结束战斗时不再有基础胜利恢复。
          this._log('挑战房：击败第二个敌人不再恢复生命');
        } else if (isBoss) {
          // Boss 胜利不回血；进入下一 stage 时恢复 10 点（见 continueTo）。
        }
        // 普通/精英/故障房胜利不另做「战斗恢复」。生命核心等配饰在返回地图时结算。

        if (room) {
          room.cleared = true;
          room.visited = true;
          // Accessories wait for the map; this serialized marker survives
          // reward/overflow dialogs and page refreshes.
          this.s.pendingMapReturnEffects = {
            lifeCore: this.hasAccessory('LifeCore'),
            wisdomNecklace: this.hasAccessory('WisdomNecklace')
          };
          this.emit('combatEnd', '战斗胜利', { result: 'win' });
          if (isGlitch) {
            room.glitchEvent.status = 'done';
            room.glitchEvent.message = '异常遭遇已结束，战利品已结算。';
            this.s.pendingCombatReward = null;
            this.s.phase = Phase.MAP;
          } else if (!isBoss || !this.completeAdventure()) this._prepareCombatSettlement(room);
        } else {
          this.s.pendingMapReturnEffects = null;
          this.emit('combatEnd', '战斗胜利', { result: 'win' });
          this.s.phase = Phase.MAP || 'ADVENTURE_MAP';
        }
      } else {
        this.s.pendingMapReturnEffects = null;
        this._log('战斗失败');
        this.emit('combatEnd', '战斗失败', { result: 'lose' });
        this.s.pendingCombatReward = null;
        this.s.phase = Phase.GAME_OVER || 'ADVENTURE_GAME_OVER';
        this.emit('gameOver', '冒险失败', { reason: 'combat' });
      }

      this.s.combat = null;
    },

    /** A final Boss victory is a terminal, refresh-safe checkpoint. */
    completeAdventure() {
      const room = this.s && this.currentRoom();
      if (!room || room.type !== window.RoomType.BOSS || !room.cleared || this.s.stage < 4) return false;
      if (this.s.phase === Phase.CLEAR) return true;
      this.s.pendingMapReturnEffects = null;
      this.s.activeCombat = null;
      this.s.combat = null;
      this.s.pendingCombatReward = null;
      this.s.pendingRoomReward = null;
      this.s.beastReward = null;
      this.s.beastSelection = [];
      this.s.pendingDiscard = 0;
      this.s.pendingItemDiscard = 0;
      this.s.itemDiscardReturn = null;
      this.s.phase = Phase.CLEAR;
      this._log('冒险胜利：已通关全部四层');
      this.emit('adventureVictory', '冒险胜利：已通关全部四层', { stage: this.s.stage, scene: this.s.scene });
      return true;
    },

    recoverLegacySerenityCards() {
      if (!this.s || !this.s.playerPile) return;
      if ((this.s.serenityDiscardRecoveryVersion || 0) >= 1) return;
      if (this.s.activeCombat) return;
      const AD = window.AdventureDeck;
      if (!AD || typeof AD.makePlayerDeck !== 'function') {
        this.s.serenityDiscardRecoveryVersion = 1;
        return;
      }
      if (this.s.player.name !== 'Serenity') {
        this.s.serenityDiscardRecoveryVersion = 1;
        return;
      }
      const pile = this.s.playerPile;
      const expected = AD.makePlayerDeck({ shuffle: false }).slice();
      for (const name of this.s.trophyWhiteCards || []) {
        const def = window.AdventureRegistry && window.AdventureRegistry.getItem(name);
        if (def && def.kind === 'trophyWhite' && typeof AD.trophyWhite === 'function') {
          expected.push(AD.trophyWhite(name));
        }
      }
      const keyOf = card => {
        if (!card) return '';
        if (card.trophyName) return 'trophy:' + card.trophyName;
        return [
          card.color, card.value, card.isItemCard ? 1 : 0,
          card.drawTwo ? 1 : 0, card.drawThree ? 1 : 0, card.potion ? 1 : 0,
          card.purify ? 1 : 0, card.superPurify ? 1 : 0, card.shuffleToDeck ? 1 : 0,
          card.magic || card.greenMagic ? (card.magicColor || 'magic') : '',
          card.isWhite ? 1 : 0
        ].join('|');
      };
      const remaining = [...pile.deck, ...pile.hand, ...pile.discard];
      const unmatched = remaining.slice();
      const missing = [];
      for (const card of expected) {
        const key = keyOf(card);
        const at = unmatched.findIndex(item => keyOf(item) === key);
        if (at >= 0) unmatched.splice(at, 1);
        else missing.push(card);
      }
      if (unmatched.length) {
        this.s.serenityDiscardRecoveryVersion = 1;
        return;
      }
      this.s.serenityDiscardRecoveryVersion = 1;
      if (!missing.length) return;
      const top = this.s.discardTop && typeof this.s.discardTop.get === 'function' ? this.s.discardTop.get() : null;
      const sameCard = (a, b) => a && b && a.uid && b.uid ? a.uid === b.uid : (a && b && a.color === b.color && a.value === b.value &&
        !!a.isItemCard === !!b.isItemCard && (a.trophyName || null) === (b.trophyName || null));
      if (top && pile.discard.length && sameCard(pile.discard[pile.discard.length - 1], top)) {
        pile.discard.splice(pile.discard.length - 1, 0, ...missing);
      } else {
        pile.discard.push(...missing);
      }
      this.emit('deckRecovered', '已补回缺失的基础牌', { count: missing.length });
    },

    settleRoomExitMarks() {
      const player = this.s && this.s.player;
      if (!player || player.name !== 'Serenity') return;
      if (player.hp > 25) player.bloodthirst = false;
    },

    /**
     * Resolve deferred accessory effects at the point the adventure is back
     * on the map.  This is deliberately separate from onCombatEnd so a
     * player can claim/defer rewards without silently drawing cards early.
     */
    onCombatReturnToMap() {
      if (!this.s || this.s.phase !== Phase.MAP) return null;
      this.recoverLegacySerenityCards();
      this.settleRoomExitMarks();
      const pending = this.s.pendingMapReturnEffects;
      if (!pending) return null;
      // Consume before emitting events; a second render or restored save cannot repeat it.
      this.s.pendingMapReturnEffects = null;
      if (pending.lifeCore && this.hasAccessory('LifeCore')) {
        const def = window.AdventureRegistry.getItem('LifeCore');
        const amount = ((def && def.onCombatWinHeal) || 3) * this.accessoryCount('LifeCore');
        const before = this.s.player.hp;
        this.s.player.hp = Math.min(this.s.player.maxHp, before + amount);
        const healed = this.s.player.hp - before;
        this.queueMapRecovery({ heal: healed, hpBefore: before, label: '生命核心', itemName: 'LifeCore' });
        this._log('生命核心：返回地图恢复' + healed + '点生命');
        this.emit('accessory', '生命核心回复', {
          itemName: 'LifeCore', amount: healed, target: 'player', timing: 'returnToMap',
          hpBefore: before, hpAfter: this.s.player.hp
        });
      }
      if (pending.stageHeal > 0) {
        const before = this.s.player.hp;
        this.s.player.hp = Math.min(this.s.player.maxHp, before + pending.stageHeal);
        const healed = this.s.player.hp - before;
        this.queueMapRecovery({ heal: healed, hpBefore: before, label: '进入新层' });
        this._log('进入第' + this.s.stage + '层：恢复' + healed + '点生命');
        this.emit('stageHeal', '进入新层恢复生命', {
          amount: healed, stage: this.s.stage, hpBefore: before, hpAfter: this.s.player.hp,
          target: 'player', timing: 'returnToMap'
        });
      }
      this.settleRoomExitMarks();
      if (!pending.wisdomNecklace || !this.hasAccessory('WisdomNecklace') || !this.s.playerPile) return null;
      const def = window.AdventureRegistry.getItem('WisdomNecklace');
      const count = (def && def.onCombatWinDraw) || 2;
      const drawn = this.s.playerPile.draw(count);
      this.queueMapRecovery({ drawn: drawn.length, label: '智慧项链', itemName: 'WisdomNecklace' });
      this._log('智慧项链：返回地图时抽取' + drawn.length + '张牌');
      this.emit('accessory', '智慧项链触发：返回地图时抽取' + drawn.length + '张牌', {
        itemName: 'WisdomNecklace', target: 'player', drawn: drawn.length, timing: 'returnToMap'
      });
      return { itemName: 'WisdomNecklace', drawn: drawn.length };
    }
  });
})();

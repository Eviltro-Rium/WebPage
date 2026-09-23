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

      if (result === 'win') {
        this._log('战斗胜利');
        const isBoss = room && room.type === window.RoomType.BOSS;
        const healAmount = isBoss ? 10 : 3;
        this.s.player.hp = Math.min(this.s.player.maxHp, this.s.player.hp + healAmount);
        this._log('恢复' + healAmount + '点生命（当前' + this.s.player.hp + '/' + this.s.player.maxHp + '）');

        if (this.hasAccessory('LifeCore')) {
          const def = window.AdventureRegistry.getItem('LifeCore');
          const perCore = (def && def.onCombatWinHeal) || 3;
          const count = this.accessoryCount('LifeCore');
          const before = this.s.player.hp;
          this.s.player.hp = Math.min(this.s.player.maxHp, this.s.player.hp + perCore * count);
          const healed = this.s.player.hp - before;
          if (healed > 0) {
            this._log('生命核心：额外恢复' + healed + '点生命');
            this.emit('accessory', '生命核心回复', { itemName: 'LifeCore', amount: healed });
          }
        }

        if (room) {
          room.cleared = true;
          room.visited = true;
          // Wisdom Necklace is intentionally deferred until the settlement
          // flow has actually returned to the map.  Keeping the pending flag
          // here means reward/overflow dialogs cannot consume the draw early.
          this._wisdomNecklacePending = this.hasAccessory('WisdomNecklace');
          this.emit('combatEnd', '战斗胜利', { result: 'win' });
          this._prepareCombatSettlement(room);
        } else {
          this._wisdomNecklacePending = false;
          this.emit('combatEnd', '战斗胜利', { result: 'win' });
          this.s.phase = Phase.MAP || 'ADVENTURE_MAP';
        }
      } else {
        this._wisdomNecklacePending = false;
        this._log('战斗失败');
        this.emit('combatEnd', '战斗失败', { result: 'lose' });
        this.s.pendingCombatReward = null;
        this.s.phase = Phase.GAME_OVER || 'ADVENTURE_GAME_OVER';
        this.emit('gameOver', '冒险失败', { reason: 'combat' });
      }

      this.s.combat = null;
    },

    /**
     * Resolve deferred accessory effects at the point the adventure is back
     * on the map.  This is deliberately separate from onCombatEnd so a
     * player can claim/defer rewards without silently drawing cards early.
     */
    onCombatReturnToMap() {
      if (!this._wisdomNecklacePending) return null;
      this._wisdomNecklacePending = false;
      if (!this.hasAccessory('WisdomNecklace') || !this.s.playerPile) return null;

      const def = window.AdventureRegistry.getItem('WisdomNecklace');
      const count = (def && def.onCombatWinDraw) || 2;
      const drawn = this.s.playerPile.draw(count);
      this._log('智慧项链：返回地图时抽取' + drawn.length + '张牌');
      this.emit('accessory', '智慧项链触发：返回地图时抽取' + drawn.length + '张牌', {
        itemName: 'WisdomNecklace',
        target: 'player',
        drawn: drawn.length,
        timing: 'returnToMap'
      });
      return { itemName: 'WisdomNecklace', drawn: drawn.length };
    }
  });
})();

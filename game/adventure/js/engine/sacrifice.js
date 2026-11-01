/* Sacrifices are committed synchronously before the UI saves or animates them. */
(function () {
  const Phase = window.AdventurePhase;
  const random = () => window.FurryGame.CombatRuntime.random();
  Object.assign(window.AdventureEngine.prototype, {
    _handleSacrifice(room) {
      room.visited = true;
      this.s.phase = Phase.SACRIFICE;
    },
    sacrificeUpgradesRemaining() {
      const used = this.s && this.s.sacrificeUpgradesByStage && this.s.sacrificeUpgradesByStage[this.s.stage || 1] || 0;
      return Math.max(0, 3 - used);
    },
    _canSacrifice() {
      const room = this.s && this.currentRoom();
      return !!(room && room.type === window.RoomType.SACRIFICE && this.s.phase === Phase.SACRIFICE &&
        !this.s.activeCombat && this.s.player.hp > 0 && !this.s.pendingHandDiscard && !this.s.pendingCrystalBall);
    },
    _paySacrifice(cost) {
      const player = this.s.player;
      player.hp = Math.max(0, player.hp - cost);
      if (player.hp === 0) {
        const cross = this.s.accessories.indexOf('RevivalCross');
        if (cross >= 0) {
          const def = window.AdventureRegistry.getItem('RevivalCross');
          this.s.accessories.splice(cross, 1);
          player.hp = Math.min(player.maxHp, Math.max(1, Number(def && def.onLethalHeal) || 10));
          player.alive = true;
          this.emit('accessory', '复活十字：恢复' + player.hp + '点生命，配饰损坏消失', { itemName: 'RevivalCross', heal: player.hp });
        } else {
          player.alive = false;
          this.s.phase = Phase.GAME_OVER;
          this.emit('gameOver', '献祭耗尽生命，冒险结束', { reason: 'sacrifice' });
        }
      }
      if (this.s.player.name === 'Serenity' && this.s.player.hp < 25) this.s.player.bloodthirst = true;
      this.emit('sacrifice', '献祭' + cost + '点生命', { amount: cost, hp: this.s.player.hp });
      return player.hp > 0;
    },
    _sacrificeDeathResult() {
      const result = { ok: true, kind: 'death', message: '献祭耗尽生命，冒险结束。' };
      this.currentRoom().sacrificeResult = result;
      this._log(result.message);
      return result;
    },
    sacrificeForItem() {
      if (!this._canSacrifice()) return { ok: false, message: '当前无法献祭，请先完成其他道具选择' };
      const pool = window.AdventureRegistry.itemsByKind('consumable').filter(def => this._canAddItem(def.name).ok);
      if (!pool.length) return { ok: false, message: '道具槽已满或没有可获得的道具' };
      if (!this._paySacrifice(1)) return this._sacrificeDeathResult();
      const won = random() < 1 / 6;
      const def = won ? pool[Math.floor(random() * pool.length)] : null;
      if (def) this.addItem(def.name);
      const result = { ok: true, kind: 'item', won, itemName: def ? def.name : null,
        message: def ? '献祭成功，获得：' + def.displayName : '本次未获得道具。' };
      this.currentRoom().sacrificeResult = result;
      this._log('献祭1点生命：' + result.message);
      return result;
    },
    sacrificeUpgradeTrophy(index) {
      const hand = this.s && this.s.playerPile && this.s.playerPile.hand;
      const card = hand && Number.isInteger(index) && hand[index];
      if (!card || !card.trophyWhite || !card.isWhite || card.isBlack || card.borrowedMonster) {
        return { ok: false, message: '请选择手牌中的一张战利白卡' };
      }
      if (!this._canSacrifice()) return { ok: false, message: '当前无法献祭，请先完成其他道具选择' };
      if (!this.sacrificeUpgradesRemaining()) return { ok: false, message: '本层3次升级机会已用完' };
      if (!this._paySacrifice(5)) return this._sacrificeDeathResult();
      if (!window.AdventureDeck.upgradeTrophy(card)) return { ok: false, message: '该牌无法升级' };
      const counts = this.s.sacrificeUpgradesByStage ||= {};
      const stage = this.s.stage || 1;
      counts[stage] = (counts[stage] || 0) + 1;
      const def = window.AdventureRegistry.getItem(card.trophyName);
      const name = (def ? def.displayName : '战利白卡').replace('白卡', '黑卡');
      const result = { ok: true, kind: 'upgrade',
        message: name + '升级完成。' };
      this.currentRoom().sacrificeResult = result;
      this._log('献祭5点生命：' + result.message);
      return result;
    },
    leaveSacrificeRoom() {
      if (!this.s || this.s.phase !== Phase.SACRIFICE) return false;
      this.settleRoomExitMarks();
      this.s.phase = Phase.MAP;
      return true;
    }
  });
})();

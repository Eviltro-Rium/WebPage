/* One-shot glitch-room events. The room owns every checkpoint, including the
 * unresolved die, so leaving/reloading never grants another roll. */
(function () {
  const Phase = window.AdventurePhase;
  const random = () => window.FurryGame && window.FurryGame.CombatRuntime
    ? window.FurryGame.CombatRuntime.random() : Math.random();
  Object.assign(window.AdventureEngine.prototype, {
    _handleGlitch(room) {
      room.visited = true;
      if (room.glitchEvent && room.glitchEvent.status === 'combat') return this._startGlitchCombat(room);
      this.s.phase = Phase.GLITCH;
    },
    _currentGlitchRoom() {
      const room = this.s && this.currentRoom();
      return room && room.type === window.RoomType.GLITCH ? room : null;
    },
    rollGlitchEvent() {
      const room = this._currentGlitchRoom();
      if (!room || this.s.phase !== Phase.GLITCH || room.glitchEvent) return false;
      const roll = 1 + Math.floor(random() * 12);
      room.glitchEvent = { status: 'rolled', roll, originalRoll: roll, adjusted: false };
      this._log('故障房：投出' + roll + '，等待确认事件');
      this.emit('glitchRoll', '故障事件骰', { value: roll, sides: 12 });
      return true;
    },
    canAdjustGlitchDice() {
      const room = this._currentGlitchRoom();
      const event = room && room.glitchEvent;
      return !!(this.s.phase === Phase.GLITCH && event && event.status === 'rolled' &&
        !event.adjusted && this.hasAccessory('Magician') && !this.s.player.blind && this.s.player.hp > 3);
    },
    adjustGlitchDice(delta) {
      if (!this.canAdjustGlitchDice() || ![-1, 1].includes(delta)) return false;
      const event = this.currentRoom().glitchEvent;
      const next = event.roll + delta;
      if (next < 1 || next > 12) return false;
      this.s.player.hp -= 3;
      event.roll = next;
      event.adjusted = true;
      this._log('魔术师：消耗3点生命，故障事件骰改为' + next);
      return true;
    },
    resolveGlitchEvent() {
      const room = this._currentGlitchRoom();
      const event = room && room.glitchEvent;
      if (this.s.phase !== Phase.GLITCH || !event || event.status !== 'rolled') return false;
      // Commit before applying any resources or launching combat.
      event.status = 'done';
      room.cleared = true;
      const group = Math.floor((event.roll - 1) / 2);
      if (group === 0) {
        const candidates = [];
        for (const [scene, pool] of Object.entries(window.AdventureMonsterPool || {})) {
          if (scene === this.s.scene) continue;
          const names = Array.isArray(pool) ? pool : pool[this.s.stage] || pool['*'] || Object.values(pool).flat();
          this._availableNames([...new Set(names)], this.s.stage, 'monster').forEach(name => candidates.push({ name, scene }));
        }
        const chosen = candidates[Math.floor(random() * candidates.length)];
        if (chosen) {
          event.monsterName = chosen.name;
          event.scene = chosen.scene;
          event.status = 'combat';
          room.cleared = false;
          return this._startGlitchCombat(room);
        }
        event.message = '没有可出现的异场景怪物，异常已平息。';
      } else if (group === 1) {
        event.status = this.s.consumables.length ? 'discard' : 'done';
        event.message = this.s.consumables.length ? '请选择一个一次性道具丢弃。' : '没有可丢弃的一次性道具，事件结束。';
      } else if (group === 2) {
        const status = window.FurryGame && window.FurryGame.StatusService;
        if (status && status.clearAll) status.clearAll(this.s.player);
        else Object.entries(this.playerBuffs()).forEach(([key, value]) => { this.s.player[key] = typeof value === 'boolean' ? false : 0; });
        this.s.player.buffs = {};
        event.message = '已清除自身所有状态（包含正面与负面）。';
      } else if (group === 3) {
        const pile = this.s.playerPile;
        while (pile.hand.length) pile.discardFromHand(0);
        const count = pile.draw(3).length;
        this.s.discardTop = new window.AdventureDeck.DiscardTop(null);
        this.s.discardTopOwner = null;
        event.message = '所有手牌已放入弃牌库，重新抽取' + count + '张牌。';
      } else if (group === 4) {
        const before = this.s.player.hp;
        this.s.player.hp = Math.min(this.s.player.maxHp, before + 10);
        const count = this.s.playerPile.drawToLimit().length;
        this.s.discardTop = new window.AdventureDeck.DiscardTop(null);
        this.s.discardTopOwner = null;
        event.message = '恢复' + (this.s.player.hp - before) + '点生命，手牌补至上限（抽取' + count + '张）。';
      } else {
        const pool = window.AdventureRegistry.itemsByKind('consumable').filter(def => {
          const check = this._canAddItem(def.name);
          return check.ok || check.reason === 'full';
        });
        const def = pool[Math.floor(random() * pool.length)];
        if (def && this.addItem(def.name, { allowConsumableOverflow: true })) {
          event.itemName = def.name;
          event.message = '获得一次性道具：' + def.displayName;
          if (this.s.consumables.length > window.AdventureEngineConstants.CONSUMABLE_SLOT_COUNT) {
            event.status = 'overflow';
            event.message += '。道具槽已满，请舍弃多余道具。';
          }
        } else event.message = '暂无可获得的一次性道具。';
      }
      this._log('故障房：' + event.message);
      this.emit('glitchResolved', event.message, { roll: event.roll });
      return true;
    },
    _startGlitchCombat(room) {
      const event = room.glitchEvent;
      const monster = window.Monster.fromRegistry(event.monsterName);
      if (!monster) return this._encounterUnavailable('异场景怪物');
      room.monsterName = monster.name;
      monster.init(this);
      if (!this.s.activeCombat) this._initializeDiscardTop();
      this._prepareCombatEncounter(monster, 'glitch');
      this.emit('combatStart', '故障遭遇：' + monster.name, { enemy: monster.name, scene: event.scene });
      return true;
    },
    discardGlitchItem(index) {
      const room = this._currentGlitchRoom();
      const event = room && room.glitchEvent;
      if (this.s.phase !== Phase.GLITCH || !event || !['discard', 'overflow'].includes(event.status) ||
          !Number.isInteger(index) || index < 0 || index >= this.s.consumables.length) return false;
      const name = this.s.consumables.splice(index, 1)[0];
      const def = window.AdventureRegistry.getItem(name);
      if (event.status === 'discard' || this.s.consumables.length <= window.AdventureEngineConstants.CONSUMABLE_SLOT_COUNT) {
        event.status = 'done';
        event.message = '已丢弃' + (def ? def.displayName : name) + '，事件结束。';
      }
      this._log('故障房：丢弃' + (def ? def.displayName : name));
      return true;
    },
    leaveGlitchRoom() {
      const room = this._currentGlitchRoom();
      if (this.s.phase !== Phase.GLITCH || !room || (room.glitchEvent && room.glitchEvent.status !== 'done')) return false;
      room.visited = true;
      this.s.phase = Phase.MAP;
      return true;
    }
  });
})();

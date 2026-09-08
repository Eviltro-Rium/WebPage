/* Adventure inventory / map consumables / accessories — mixed into AdventureEngine.prototype */
(function () {
  if (typeof AdventureEngine === 'undefined') return;
  const Phase = window.AdventurePhase || {};
  const C = window.AdventureEngineConstants || {};
  const SHOP_SLOT_COUNT = C.SHOP_SLOT_COUNT || 6;
  const SHOP_REFRESH_COST = C.SHOP_REFRESH_COST || 2;
  const SHOP_ACCESSORY_PRICE = C.SHOP_ACCESSORY_PRICE || 15;
  const CONSUMABLE_SLOT_COUNT = C.CONSUMABLE_SLOT_COUNT || 6;
  const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));
  Object.assign(AdventureEngine.prototype, {

    hasAccessory(name) {
      return !!(this.s && Array.isArray(this.s.accessories) && this.s.accessories.indexOf(name) >= 0);
    },
    accessoryCount(name) {
      const arr = this.s && Array.isArray(this.s.accessories) ? this.s.accessories : null;
      if (!arr) return 0;
      let count = 0;
      for (let i = 0; i < arr.length; i++) if (arr[i] === name) count++;
      return count;
    },
    burn(target, n) {
      if (n <= 0) return;
      if (target === this.s.player && this.s.player.name === 'Leon') return;
      const prev = target.burn || 0;
      target.burn = Math.min(5, prev + n);
      this._log((target === this.s.player ? '玩家' : '敌方') + '灼烧+' + n + '（当前' + target.burn + '层）');
      this.emit('buff', '+' + n + '[灼烧]', null, { who: target === this.s.player ? 'player' : 'enemy', kind: 'burn', stacks: target.burn });
    },
    bleed(target, n) {
      if (n <= 0) return;
      const prev = target.bleed || 0;
      target.bleed = Math.min(3, prev + n);
      this._log((target === this.s.player ? '玩家' : '敌方') + '流血+' + n + '（当前' + target.bleed + '层）');
      this.emit('buff', '+' + n + '[流血]', null, { who: target === this.s.player ? 'player' : 'enemy', kind: 'bleed', stacks: target.bleed });
    },
    poison(target, n) {
      if (n <= 0) return;
      const prev = target.poison || 0;
      target.poison = Math.min(3, prev + n);
      this._log((target === this.s.player ? '玩家' : '敌方') + '中毒+' + n + '（当前' + target.poison + '层）');
      this.emit('buff', '+' + n + '[中毒]', null, { who: target === this.s.player ? 'player' : 'enemy', kind: 'poison', stacks: target.poison });
    },
    freeze(target) {
      if (target === this.s.player && this.s.player.name === 'Serenity') return;
      target.frozen = true;
      this._log((target === this.s.player ? '玩家' : '敌方') + '被冷冻');
      this.emit('buff', '[冷冻]', null, { who: target === this.s.player ? 'player' : 'enemy', kind: 'freeze', stacks: 1 });
    },
    addGuard(target, n) {
      if (n <= 0) return;
      target.guard = Math.min(5, (target.guard || 0) + n);
      this._log((target === this.s.player ? '玩家' : '敌方') + '守护+' + n + '（当前' + target.guard + '层）');
      this.emit('buff', '+' + n + '[守护]', null, { who: target === this.s.player ? 'player' : 'enemy', kind: 'guard', stacks: target.guard });
    },
    addCrit(n) {
      if (n <= 0) return;
      this.s.player.crit = Math.min(3, (this.s.player.crit || 0) + n);
      this._log('玩家暴击+' + n + '（当前' + this.s.player.crit + '层）');
      this.emit('buff', '+' + n + '[暴击]', null, { who: 'player', kind: 'crit', stacks: this.s.player.crit });
    },
    setChaos(color, on) {
      const key = 'chaos_' + color;
      this.s.player[key] = !!on;
      this._log('玩家混沌' + color + (on ? '开启' : '关闭'));
      this.emit('buff', (on ? '+' : '-') + '[混沌' + color + ']', null, { who: 'player', kind: 'chaos_' + color, stacks: on ? 1 : 0 });
    },
    clearDebuffs(target) {
      target.burn = 0;
      target.bleed = 0;
      target.poison = 0;
      target.blind = 0;
      target.iceSeal = 0;
      target.frozen = false;
      this._log((target === this.s.player ? '玩家' : '敌方') + 'debuff已清除');
      this.emit('buff', '清除debuff', null, { who: target === this.s.player ? 'player' : 'enemy', kind: 'clearDebuffs' });
    },
    _clearPlayerPositiveBuffs() {
      const p = this.s.player;
      if (!p) return;
      p.guard = 0;
      p.fly = 0;
      p.crit = 0;
      p.lush = 0;
      p.parasite = 0;
      p.chaos_red = false;
      p.chaos_yellow = false;
      p.chaos_blue = false;
      p.chaos_green = false;
      this._log('玩家正面buff已清除');
    },
    tickBuffs(target) {
      const who = target === this.s.player ? '玩家' : '敌方';
      if (target.burn > 0) {
        const dmg = target.burn;
        target.burn--;
        target.hp = Math.max(0, target.hp - dmg);
        this._log(who + '灼烧结算：-' + dmg + '生命，灼烧层数-1');
        this.emit('buffSettle', '-' + dmg + '[灼烧]', null, { who: target === this.s.player ? 'player' : 'enemy', amount: dmg });
      }
      if (target.bleed > 0) {
        const dmg = target.bleed;
        target.bleed--;
        target.hp = Math.max(0, target.hp - dmg);
        this._log(who + '流血结算：-' + dmg + '生命，流血层数-1');
        this.emit('bleedSettle', '-' + dmg + '[流血]，-1[流血层数]', null, { who: target === this.s.player ? 'player' : 'enemy', amount: dmg });
      }
      if (target.frozen) {
        target.frozen = false;
        this._log(who + '冷冻解除');
        this.emit('buff', '-[冷冻]', null, { who: target === this.s.player ? 'player' : 'enemy', kind: 'freeze', stacks: 0 });
      }
    },
    isDebuffed(target) {
      return (target.burn || 0) > 0 || (target.bleed || 0) > 0 || (target.poison || 0) > 0 || (target.blind || 0) > 0 || (target.iceSeal || 0) > 0 || !!target.frozen;
    },
    playerBuffs() {
      const p = this.s.player;
      return {
        burn: p.burn || 0,
        bleed: p.bleed || 0,
        poison: p.poison || 0,
        blind: p.blind || 0,
        iceSeal: p.iceSeal || 0,
        frozen: !!p.frozen,
        guard: p.guard || 0,
        fly: p.fly || 0,
        crit: p.crit || 0,
        chaos_red: !!p.chaos_red,
        chaos_yellow: !!p.chaos_yellow,
        chaos_blue: !!p.chaos_blue,
        chaos_green: !!p.chaos_green,
        bloodthirst: !!p.bloodthirst
      };
    },
    _canAddItem(itemName) {
      const def = window.AdventureRegistry.getItem(itemName);
      if (!def) return { ok: false, reason: 'unknown', message: '未知道具' };
      if (def.kind === 'trophyWhite') return { ok: true };
      if (def.kind === 'consumable') {
        if (this.s.consumables.length >= CONSUMABLE_SLOT_COUNT) return { ok: false, reason: 'full', message: '道具槽已满' };
        return { ok: true };
      }
      if (def.maxStacks) {
        const current = this.s.accessories.filter(a => a === itemName).length;
        if (current >= def.maxStacks) return { ok: false, reason: 'accessoryFull', message: def.displayName + '已达堆叠上限(' + def.maxStacks + ')' };
      }
      return { ok: true };
    },
    addItem(itemName, opts = {}) {
      const def = window.AdventureRegistry.getItem(itemName);
      if (!def) {
        this._log('未知道具：' + itemName);
        return false;
      }
      if (def.kind === 'trophyWhite') {
        if (!Array.isArray(this.s.trophyWhiteCards)) this.s.trophyWhiteCards = [];
        this.s.trophyWhiteCards.push(itemName);
        if (this.s.playerPile) this.s.playerPile.hand.push(window.AdventureDeck.trophyWhite(itemName));
      } else if (def.kind === 'consumable') {
        if (this.s.consumables.length >= CONSUMABLE_SLOT_COUNT && !opts.allowConsumableOverflow) {
          this._log('一次性道具槽已满（' + CONSUMABLE_SLOT_COUNT + '/' + CONSUMABLE_SLOT_COUNT + '），无法获取 ' + def.displayName);
          this.emit('itemFail', '道具槽已满', { itemName, reason: 'full' });
          return false;
        }
        this.s.consumables.push(itemName);
      } else {
        if (def.maxStacks) {
          const current = this.s.accessories.filter(a => a === itemName).length;
          if (current >= def.maxStacks) {
            this._log(def.displayName + '已达堆叠上限(' + def.maxStacks + ')');
            this.emit('itemFail', '堆叠上限', { itemName, reason: 'maxStacks' });
            return false;
          }
        }
        this.s.accessories.push(itemName);
        this._applyAccessoryOnAdd(def);
      }
      const kindLabel = def.kind === 'trophyWhite' ? '战利白卡' : def.kind === 'consumable' ? '一次性道具' : '配饰';
      this._log('获得' + kindLabel + '：' + def.displayName);
      this.emit('itemAcquired', '获得道具', { itemName, kind: def.kind });
      return true;
    },
    discardConsumable(index) {
      if (!this.s || this.s.phase !== Phase.ITEM_DISCARD) return { ok: false, message: '当前无需舍弃道具' };
      if (index < 0 || index >= this.s.consumables.length) return { ok: false, message: '无效道具' };
      const itemName = this.s.consumables.splice(index, 1)[0];
      const def = window.AdventureRegistry.getItem(itemName);
      this.s.pendingItemDiscard = Math.max(0, this.s.pendingItemDiscard - 1);
      this._log('舍弃道具：' + (def ? def.displayName : itemName) + '（剩余需舍弃' + this.s.pendingItemDiscard + '个）');
      this.emit('itemDiscard', '舍弃道具', { itemName, index, remaining: this.s.pendingItemDiscard });
      if (this.s.pendingItemDiscard <= 0) {
        this._log('道具舍弃完成');
        this.emit('itemDiscardDone', '道具舍弃完成', {});
        this._resumeAfterItemDiscard();
      }
      return { ok: true };
    },
    discardTrophyWhiteCard(index) {
      if (!this.s || !Array.isArray(this.s.trophyWhiteCards)) return { ok: false, message: '没有战利白卡' };
      if (index < 0 || index >= this.s.trophyWhiteCards.length) return { ok: false, message: '无效卡牌' };
      const itemName = this.s.trophyWhiteCards[index];
      this.s.trophyWhiteCards.splice(index, 1);
      const pile = this.s.playerPile;
      if (pile) {
        const removeOne = list => {
          const at = list.findIndex(card => card && card.trophyWhite && card.trophyName === itemName);
          if (at < 0) return false;
          list.splice(at, 1);
          return true;
        };
        removeOne(pile.hand) || removeOne(pile.deck) || removeOne(pile.discard);
      }
      const def = window.AdventureRegistry.getItem(itemName);
      this._log('丢弃战利白卡：' + (def ? def.displayName : itemName));
      this.emit('trophyDiscard', '丢弃战利白卡', { itemName, index });
      return { ok: true };
    },
    _applyAccessoryOnAdd(def) {
      if (def.statBonus && def.statBonus.maxHp) {
        this.s.player.maxHp += def.statBonus.maxHp;
        this.s.player.hp += def.statBonus.maxHp;
      }
      this._syncBeastCap();
    },
    _syncBeastCap() {
      if (!this.s || !this.s.currency) return;
      const AC = window.AdventureCurrency;
      let max = AC.DEFAULT_MAX_BEAST_TOKENS;
      for (const name of this.s.accessories || []) {
        const def = window.AdventureRegistry.getItem(name);
        if (!def) continue;
        if (def.beastCapBonus) max += def.beastCapBonus;
        else if (def.beastCap && def.beastCap > max) max = def.beastCap;
      }
      this.s.currency.setMaxBeast(max);
    },
    useConsumable(index, ctx = {}) {
      if (index < 0 || index >= this.s.consumables.length) return { ok: false, message: '无效道具' };
      const itemName = this.s.consumables[index];
      const def = window.AdventureRegistry.getItem(itemName);
      if (!def || def.kind !== 'consumable') return { ok: false, message: '非一次性道具' };

      const inCombat = !!(this.s.combat || this._isCombatPhase(this.s.phase));
      const scene = def.useScene || 'combat';
      if (scene === 'combat' && !inCombat) {
        return { ok: false, message: def.displayName + '只能在对战中使用' };
      }
      if (scene === 'map' && inCombat) {
        return { ok: false, message: def.displayName + '只能在地图中使用' };
      }

      const useCtx = Object.assign({
        engine: this,
        player: this.s.player,
        combat: this.s.combat,
        inCombat
      }, ctx);

      let result;
      if (typeof def.use === 'function') {
        result = def.use(useCtx);
      } else {
        result = this._applyConsumableEffect(def, useCtx);
      }

      if (result && result.ok) {
        this.s.consumables.splice(index, 1);
        this._log('使用 ' + def.displayName + '：' + result.message);
        this.emit('itemUsed', '使用道具', { itemName, message: result.message });
      }
      return result;
    },
    _isCombatPhase(phase) {
      return phase === Phase.COMBAT || phase === Phase.PLAYER_PLAY ||
        phase === Phase.PLAYER_DEFEND || phase === Phase.NPC_TURN;
    },
    _listPurifyKinds(ch) {
      const kinds = [];
      if (!ch) return kinds;
      if ((ch.burn || 0) > 0) kinds.push('burn');
      if ((ch.bleed || 0) > 0) kinds.push('bleed');
      if ((ch.poison || 0) > 0) kinds.push('poison');
      if ((ch.blind || 0) > 0) kinds.push('blind');
      if ((ch.iceSeal || 0) > 0) kinds.push('iceSeal');
      if (ch.frozen) kinds.push('freeze');
      if ((ch.bomb || 0) > 0) kinds.push('bomb');
      if ((ch.guard || 0) > 0) kinds.push('guard');
      if ((ch.fly || 0) > 0) kinds.push('fly');
      if ((ch.crit || 0) > 0) kinds.push('crit');
      if ((ch.lush || 0) > 0) kinds.push('lush');
      if ((ch.parasite || 0) > 0) kinds.push('parasite');
      return kinds;
    },
    _hasPurifyableDebuff(player, opponent) {
      if (this._listPurifyKinds(player).length) return true;
      return this._listPurifyKinds(opponent).length > 0;
    },
    _applyPurifyKind(player, kind) {
      if (kind === 'burn' && (player.burn || 0) > 0) {
        player.burn = Math.max(0, player.burn - 1);
        return true;
      }
      if (kind === 'bleed' && (player.bleed || 0) > 0) {
        player.bleed = Math.max(0, player.bleed - 1);
        return true;
      }
      if (kind === 'poison' && (player.poison || 0) > 0) {
        player.poison = Math.max(0, player.poison - 1);
        return true;
      }
      if (kind === 'blind' && (player.blind || 0) > 0) {
        player.blind = 0;
        return true;
      }
      if (kind === 'iceSeal' && (player.iceSeal || 0) > 0) {
        player.iceSeal = 0;
        return true;
      }
      if (kind === 'freeze' && player.frozen) {
        player.frozen = false;
        return true;
      }
      if (kind === 'bomb' && (player.bomb || 0) > 0) {
        player.bomb = 0;
        return true;
      }
      if (kind === 'guard' && (player.guard || 0) > 0) {
        player.guard--;
        return true;
      }
      if (kind === 'fly' && (player.fly || 0) > 0) {
        player.fly--;
        return true;
      }
      if (kind === 'crit' && (player.crit || 0) > 0) {
        player.crit--;
        return true;
      }
      if (kind === 'lush' && (player.lush || 0) > 0) {
        player.lush--;
        return true;
      }
      if (kind === 'parasite' && (player.parasite || 0) > 0) {
        player.parasite--;
        return true;
      }
      return false;
    },
    _normalizePurifyChoice(choice) {
      if (!choice) return null;
      if (typeof choice === 'string') return { who: 'self', kind: choice };
      return { who: choice.who === 'opp' ? 'opp' : 'self', kind: choice.kind };
    },
    _applyPurifyChoices(player, kinds, opponent) {
      let removed = 0;
      for (const raw of kinds) {
        const choice = this._normalizePurifyChoice(raw);
        if (!choice) continue;
        const target = choice.who === 'opp' ? opponent : player;
        if (this._applyPurifyKind(target, choice.kind)) removed++;
      }
      return removed;
    },
    _applyConsumableEffect(def, ctx) {
      const effects = window.AdventureMapEffects;
      if (effects && typeof effects.apply === 'function') {
        return effects.apply(this, def, ctx);
      }
      return { ok: false, message: '该道具暂无可用效果' };
    },
    getAccessoryStatBonuses() {
      const bonus = { maxHp: 0, dropRateBonus: 0, handLimitBonus: 0 };
      for (const name of this.s.accessories) {
        const def = window.AdventureRegistry.getItem(name);
        if (def && def.statBonus) {
          if (def.statBonus.maxHp) bonus.maxHp += def.statBonus.maxHp;
          if (def.statBonus.dropRateBonus) bonus.dropRateBonus += def.statBonus.dropRateBonus;
          if (def.statBonus.handLimitBonus) bonus.handLimitBonus += def.statBonus.handLimitBonus;
        }
      }
      return bonus;
    },
    triggerAccessories(event, ctx = {}) {
      const results = [];
      for (const name of this.s.accessories) {
        const def = window.AdventureRegistry.getItem(name);
        if (def && def.kind === 'accessory' && typeof def.passive === 'function') {
          const r = def.passive(Object.assign({ event }, ctx));
          if (r) results.push({ itemName: name, result: r });
        }
      }
      return results;
    },
    _rollItemDrop() {
      const consumables = window.AdventureRegistry.itemsByKind('consumable');
      const trophyWhites = window.AdventureRegistry.itemsByKind('trophyWhite');
      const dropable = consumables.concat(trophyWhites);
      if (!dropable.length) return null;
      return dropable[Math.floor(Math.random() * dropable.length)].name;
    },
    _rollCombatDrop() {
      const bonus = this.getAccessoryStatBonuses();
      const baseRate = 0.25 + (bonus.dropRateBonus || 0);
      if (Math.random() >= baseRate) return null;
      return this._rollItemDrop();
    }
  });
})();

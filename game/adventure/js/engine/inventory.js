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
  const random = () => window.FurryGame && window.FurryGame.CombatRuntime
    ? window.FurryGame.CombatRuntime.random() : Math.random();
  const statusRegistry = window.FurryGame && (window.FurryGame.StatusService || window.FurryGame.StatusRegistry);
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
      if (statusRegistry && statusRegistry.add) statusRegistry.add(target, 'burn', n);
      else target.burn = Math.min(5, prev + n);
      this._log((target === this.s.player ? '玩家' : '敌方') + '灼伤+' + n + '（当前' + target.burn + '层）');
      this.emit('buff', '+' + n + '[灼伤]', null, { who: target === this.s.player ? 'player' : 'enemy', kind: 'burn', stacks: target.burn });
    },
    bleed(target, n) {
      if (n <= 0) return;
      const prev = target.bleed || 0;
      if (statusRegistry && statusRegistry.add) statusRegistry.add(target, 'bleed', n);
      else target.bleed = Math.min(3, prev + n);
      this._log((target === this.s.player ? '玩家' : '敌方') + '流血+' + n + '（当前' + target.bleed + '层）');
      this.emit('buff', '+' + n + '[流血]', null, { who: target === this.s.player ? 'player' : 'enemy', kind: 'bleed', stacks: target.bleed });
    },
    poison(target, n) {
      if (n <= 0) return;
      const prev = target.poison || 0;
      if (statusRegistry && statusRegistry.add) statusRegistry.add(target, 'poison', n);
      else target.poison = Math.min(2, prev + n);
      this._log((target === this.s.player ? '玩家' : '敌方') + '中毒+' + n + '（当前' + target.poison + '层）');
      this.emit('buff', '+' + n + '[中毒]', null, { who: target === this.s.player ? 'player' : 'enemy', kind: 'poison', stacks: target.poison });
    },
    freeze(target) {
      if (target === this.s.player && this.s.player.name === 'Serenity') return;
      if (statusRegistry && statusRegistry.set) statusRegistry.set(target, 'freeze', true);
      else target.frozen = true;
      this._log((target === this.s.player ? '玩家' : '敌方') + '被冷冻');
      this.emit('buff', '[冷冻]', null, { who: target === this.s.player ? 'player' : 'enemy', kind: 'freeze', stacks: 1 });
    },
    addGuard(target, n) {
      if (n <= 0) return;
      if (statusRegistry && statusRegistry.add) statusRegistry.add(target, 'guard', n);
      else target.guard = Math.min(5, (target.guard || 0) + n);
      this._log((target === this.s.player ? '玩家' : '敌方') + '守护+' + n + '（当前' + target.guard + '层）');
      this.emit('buff', '+' + n + '[守护]', null, { who: target === this.s.player ? 'player' : 'enemy', kind: 'guard', stacks: target.guard });
    },
    addCrit(n) {
      if (n <= 0) return;
      if (statusRegistry && statusRegistry.add) statusRegistry.add(this.s.player, 'crit', n);
      else this.s.player.crit = Math.min(3, (this.s.player.crit || 0) + n);
      this._log('玩家暴击+' + n + '（当前' + this.s.player.crit + '层）');
      this.emit('buff', '+' + n + '[暴击]', null, { who: 'player', kind: 'crit', stacks: this.s.player.crit });
    },
    setChaos(color, on) {
      const key = 'chaos_' + color;
      if (statusRegistry && statusRegistry.set) statusRegistry.set(this.s.player, key, !!on);
      else this.s.player[key] = !!on;
      this._log('玩家混沌' + color + (on ? '开启' : '关闭'));
      this.emit('buff', (on ? '+' : '-') + '[混沌' + color + ']', null, { who: 'player', kind: 'chaos_' + color, stacks: on ? 1 : 0 });
    },
    clearDebuffs(target) {
      if (statusRegistry) statusRegistry.clearGroup(target, 'debuff', 'all');
      else {
      target.burn = 0;
      target.bleed = 0;
      target.poison = 0;
      target.blind = 0;
      target.iceSeal = 0;
      target.frozen = false;
      }
      this._log((target === this.s.player ? '玩家' : '敌方') + 'debuff已清除');
      this.emit('buff', '清除debuff', null, { who: target === this.s.player ? 'player' : 'enemy', kind: 'clearDebuffs' });
    },
    _clearPlayerPositiveBuffs() {
      const p = this.s.player;
      if (!p) return;
      if (statusRegistry) statusRegistry.clearGroup(p, 'buff', 'all');
      else {
      p.guard = 0;
      p.fly = 0;
      p.harden = 0;
      p.crit = 0;
      p.lush = 0;
      p.parasite = 0;
      p.chaos_red = false;
      p.chaos_yellow = false;
      p.chaos_blue = false;
      p.chaos_green = false;
      }
      this._log('玩家正面buff已清除');
    },
    tickBuffs(target) {
      const who = target === this.s.player ? '玩家' : '敌方';
      if (target.burn > 0) {
        const dmg = target.burn;
        const keep = !!target.scorch;
        if (!keep) {
          if (statusRegistry && statusRegistry.remove) statusRegistry.remove(target, 'burn', 1);
          else target.burn--;
        }
        target.hp = Math.max(0, target.hp - dmg);
        this._log(who + '灼伤结算：-' + dmg + '生命' + (keep ? '（炙热不消退）' : '，灼伤层数-1'));
        this.emit('buffSettle', '[灼伤]🗡️' + dmg + (keep ? '（[炙热]不消退）' : '，层数-1'), null, { who: target === this.s.player ? 'player' : 'enemy', amount: dmg });
      }
      if (target.bleed > 0) {
        const dmg = target.bleed;
        if (statusRegistry && statusRegistry.remove) statusRegistry.remove(target, 'bleed', 1);
        else target.bleed--;
        target.hp = Math.max(0, target.hp - dmg);
        this._log(who + '流血结算：-' + dmg + '生命，流血层数-1');
        this.emit('bleedSettle', '[流血]🗡️' + dmg + '，层数-1', null, { who: target === this.s.player ? 'player' : 'enemy', amount: dmg });
      }
      if (target.frozen) {
        if (statusRegistry && statusRegistry.clear) statusRegistry.clear(target, 'freeze', 'all');
        else target.frozen = false;
        this._log(who + '冷冻解除');
        this.emit('buff', '-[冷冻]', null, { who: target === this.s.player ? 'player' : 'enemy', kind: 'freeze', stacks: 0 });
      }
    },
    isDebuffed(target) {
      if (statusRegistry) return statusRegistry.list(target, def => def.polarity === 'debuff').length > 0;
      return (target.burn || 0) > 0 || (target.bleed || 0) > 0 || (target.poison || 0) > 0 || (target.blind || 0) > 0 || (target.iceSeal || 0) > 0 || !!target.frozen || !!target.bindMark;
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
        harden: p.harden || 0,
        crit: p.crit || 0,
        magmaVein: p.magmaVein || 0,
        lush: p.lush || 0,
        parasite: p.parasite || 0,
        thorns: p.thorns || 0,
        sandblind: p.sandblind || 0,
        quicksand: p.quicksand || 0,
        diving: !!p.diving,
        scorch: !!p.scorch,
        hypothermia: p.hypothermia || 0,
        bindMark: !!p.bindMark,
        tauntMark: !!p.tauntMark,
        mockAttackColor: p.mockAttackColor || null,
        chaos_red: !!p.chaos_red,
        chaos_yellow: !!p.chaos_yellow,
        chaos_blue: !!p.chaos_blue,
        chaos_green: !!p.chaos_green,
        bloodthirst: !!p.bloodthirst
      };
    },
    _hasExclusiveConflict(def) {
      if (!def || !Array.isArray(def.exclusiveWith) || !def.exclusiveWith.length) return null;
      for (const other of def.exclusiveWith) {
        if (def.kind === 'accessory' && (this.s.consumables || []).includes(other)) {
          const o = window.AdventureRegistry.getItem(other);
          return (o && o.displayName) || other;
        }
        if (def.kind === 'consumable' && this.hasAccessory && this.hasAccessory(other)) {
          const o = window.AdventureRegistry.getItem(other);
          return (o && o.displayName) || other;
        }
        // Also: Magician exclusiveWith DiceController; DiceController should list Magician
        if (other === 'Magician' && this.hasAccessory && this.hasAccessory('Magician')) {
          return '魔术师';
        }
        if (other === 'DiceController' && (this.s.consumables || []).includes('DiceController')) {
          return '遥控骰子';
        }
      }
      return null;
    },
    _canAddItem(itemName) {
      const def = window.AdventureRegistry.getItem(itemName);
      if (!def) return { ok: false, reason: 'unknown', message: '未知道具' };
      if (def.kind === 'trophyWhite') return { ok: true };
      // Magician ↔ DiceController mutual exclusion (docs: cannot hold both)
      if (itemName === 'Magician' && (this.s.consumables || []).includes('DiceController')) {
        return { ok: false, reason: 'exclusive', message: '已持有遥控骰子，不能同时持有魔术师' };
      }
      if (itemName === 'DiceController' && this.hasAccessory && this.hasAccessory('Magician')) {
        return { ok: false, reason: 'exclusive', message: '已持有魔术师，不能同时持有遥控骰子' };
      }
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
        if (itemName === 'DiceController' && this.hasAccessory && this.hasAccessory('Magician')) {
          this._log('已持有魔术师，不能同时持有遥控骰子');
          this.emit('itemFail', '互斥', { itemName, reason: 'exclusive' });
          return false;
        }
        if (this.s.consumables.length >= CONSUMABLE_SLOT_COUNT && !opts.allowConsumableOverflow) {
          this._log('一次性道具槽已满（' + CONSUMABLE_SLOT_COUNT + '/' + CONSUMABLE_SLOT_COUNT + '），无法获取 ' + def.displayName);
          this.emit('itemFail', '道具槽已满', { itemName, reason: 'full' });
          return false;
        }
        this.s.consumables.push(itemName);
      } else {
        if (itemName === 'Magician' && (this.s.consumables || []).includes('DiceController')) {
          this._log('已持有遥控骰子，不能同时持有魔术师');
          this.emit('itemFail', '互斥', { itemName, reason: 'exclusive' });
          return false;
        }
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
        const before = this.s.player.hp;
        this.s.player.maxHp += def.statBonus.maxHp;
        this.s.player.hp += def.statBonus.maxHp;
        this.queueMapRecovery({ heal: this.s.player.hp - before, hpBefore: before, label: def.displayName, itemName: def.name });
      }
      this._syncBeastCap();
      this._syncHandLimit();
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
    _syncHandLimit() {
      if (!this.s || !this.s.playerPile) return;
      const base = 5;
      const bonus = this.getAccessoryStatBonuses();
      this.s.playerPile.handLimit = base + (bonus.handLimitBonus || 0);
    },
    useConsumable(index, ctx = {}) {
      if (this.s.phase === Phase.GLITCH) return { ok: false, message: '请先完成故障房事件' };
      ctx = ctx || {};
      // Crystal ball confirm/cancel after consumeNow: item already removed.
      if (this.s.pendingCrystalBall && (Array.isArray(ctx.reorderOrder) || ctx.cancel)) {
        const effects = window.AdventureMapEffects;
        const def = window.AdventureRegistry.getItem('CrystalBall') || { name: 'CrystalBall', displayName: '水晶球' };
        const result = effects && typeof effects.apply === 'function'
          ? effects.apply(this, def, Object.assign({}, ctx, { reorderOrder: ctx.reorderOrder, cancel: ctx.cancel }))
          : { ok: false, message: '水晶球效果不可用' };
        if (result && result.ok) {
          this._log('使用 水晶球：' + result.message);
          this.emit('itemUsed', '使用道具', { itemName: 'CrystalBall', message: result.message });
        }
        return result;
      }
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

      // Unified hand-discard pending (Vixraps-style). Confirm via confirmHandDiscard.
      const combatUse = def.combatUse || def.mapUse || null;
      const hasIndex = useCtx.discardIndex != null || (useCtx.choice && useCtx.choice.index != null);
      if ((combatUse === 'discardTalisman' || combatUse === 'furnace') && !hasIndex && !this.s.pendingHandDiscard) {
        return this.beginHandDiscard({
          kind: combatUse,
          itemIndex: index,
          itemName: def.name,
          count: 1,
          filter: combatUse === 'furnace' ? 'colorNumber' : null,
          cancelable: true,
          hint: combatUse === 'furnace'
            ? '熔炉：请选择1张红/黄/蓝/绿点数牌弃掉'
            : '弃牌符：请选择1张手牌弃掉（然后抽2张）'
        });
      }

      let result;
      if (typeof def.use === 'function') {
        result = def.use(useCtx);
      } else {
        result = this._applyConsumableEffect(def, useCtx);
      }

      if (result && (result.ok || result.consumeNow)) {
        this.s.consumables.splice(index, 1);
        if (result.ok) {
          this._log('使用 ' + def.displayName + '：' + result.message);
          this.emit('itemUsed', '使用道具', { itemName, message: result.message });
        } else if (result.consumeNow) {
          this._log('使用 ' + def.displayName + '（已消耗，等待确认）');
        }
        if (this.s.pendingHandDiscard && this.s.pendingHandDiscard.itemIndex === index) {
          this.s.pendingHandDiscard = null;
        }
      }
      return result;
    },

    beginHandDiscard(opts) {
      opts = opts || {};
      const pile = this.s.playerPile;
      const hand = (pile && pile.hand) || [];
      const count = Math.max(1, Number(opts.count) || 1);
      let legalIndices = null;
      if (opts.filter === 'colorNumber') {
        legalIndices = [];
        hand.forEach((c, i) => {
          if (c && c.isNumberCard && !c.isItemCard && !c.isBlack && !c.isWhite &&
              ['RED', 'YELLOW', 'BLUE', 'GREEN'].includes(c.color)) legalIndices.push(i);
        });
        if (legalIndices.length < count) {
          return { ok: false, message: opts.emptyMessage || '没有可弃的手牌' };
        }
      } else if (!hand.length) {
        return { ok: false, message: opts.emptyMessage || '手牌为空，无法弃牌' };
      }
      this.s.pendingHandDiscard = {
        kind: opts.kind || 'handDiscard',
        count: count,
        itemIndex: opts.itemIndex != null ? Number(opts.itemIndex) : null,
        itemName: opts.itemName || null,
        filter: opts.filter || null,
        legalIndices: legalIndices,
        cancelable: opts.cancelable !== false,
        selected: [],
        hint: opts.hint || ('请选择' + count + '张手牌弃掉')
      };
      this._log(this.s.pendingHandDiscard.hint);
      return {
        ok: false,
        pending: true,
        needsChoice: true,
        needsHandDiscard: true,
        pendingHandDiscard: this.s.pendingHandDiscard,
        message: this.s.pendingHandDiscard.hint
      };
    },

    selectHandDiscardIndex(index) {
      const pending = this.s.pendingHandDiscard;
      if (!pending) return { ok: false, message: '当前没有待选的弃牌' };
      const pile = this.s.playerPile;
      const hand = (pile && pile.hand) || [];
      const i = Number(index);
      if (!Number.isInteger(i) || i < 0 || i >= hand.length) {
        return { ok: false, message: '无效手牌' };
      }
      if (Array.isArray(pending.legalIndices) && pending.legalIndices.indexOf(i) < 0) {
        return { ok: false, message: pending.hint || '该牌不可选' };
      }
      // Single-pick (count===1) toggles like Vixraps.
      if (pending.count === 1) {
        pending.selected = pending.selected && pending.selected[0] === i ? [] : [i];
      } else {
        const pos = (pending.selected || []).indexOf(i);
        if (pos >= 0) pending.selected.splice(pos, 1);
        else if ((pending.selected || []).length < pending.count) pending.selected.push(i);
      }
      return { ok: true, pendingHandDiscard: pending };
    },

    confirmHandDiscard() {
      const pending = this.s.pendingHandDiscard;
      if (!pending) return { ok: false, message: '当前没有待确认的弃牌' };
      const selected = pending.selected || [];
      if (selected.length !== pending.count) {
        return { ok: false, message: pending.hint || ('请选择' + pending.count + '张手牌') };
      }
      const itemIndex = pending.itemIndex;
      const kind = pending.kind;
      this.s.pendingHandDiscard = null;
      if ((kind === 'discardTalisman' || kind === 'furnace') && itemIndex != null) {
        return this.useConsumable(itemIndex, { discardIndex: selected[0] });
      }
      return { ok: false, message: '未知弃牌类型' };
    },

    cancelHandDiscard() {
      const pending = this.s.pendingHandDiscard;
      if (!pending) return { ok: false, message: '当前没有待取消的弃牌' };
      if (!pending.cancelable) return { ok: false, message: pending.hint || '必须弃牌，不能取消' };
      this.s.pendingHandDiscard = null;
      return { ok: true, message: '已取消弃牌' };
    },
    _isCombatPhase(phase) {
      return phase === Phase.COMBAT || phase === Phase.PLAYER_PLAY ||
        phase === Phase.PLAYER_DEFEND || phase === Phase.NPC_TURN;
    },
    _listPurifyKinds(ch) {
      const kinds = [];
      if (!ch) return kinds;
      if (statusRegistry) return statusRegistry.list(ch, def => def.cleanse !== 'never').map(def => def.id);
      if ((ch.burn || 0) > 0) kinds.push('burn');
      if ((ch.bleed || 0) > 0) kinds.push('bleed');
      if ((ch.poison || 0) > 0) kinds.push('poison');
      if ((ch.blind || 0) > 0) kinds.push('blind');
      if ((ch.iceSeal || 0) > 0) kinds.push('iceSeal');
      if (ch.frozen) kinds.push('freeze');
      if ((ch.bomb || 0) > 0) kinds.push('bomb');
      if ((ch.thorns || 0) > 0) kinds.push('thorns');
      if ((ch.sandblind || 0) > 0) kinds.push('sandblind');
      if ((ch.guard || 0) > 0) kinds.push('guard');
      if ((ch.fly || 0) > 0) kinds.push('fly');
      if ((ch.crit || 0) > 0) kinds.push('crit');
      if ((ch.lush || 0) > 0) kinds.push('lush');
      if ((ch.parasite || 0) > 0) kinds.push('parasite');
      if (ch.diving) kinds.push('diving');
      if ((ch.hypothermia || 0) > 0) kinds.push('hypothermia');
      return kinds;
    },
    _hasPurifyableDebuff(player, opponent) {
      if (this._listPurifyKinds(player).length) return true;
      return this._listPurifyKinds(opponent).length > 0;
    },
    _applyPurifyKind(player, kind) {
      if (statusRegistry && statusRegistry.get(kind) && statusRegistry.get(kind).cleanse === 'never') return false;
      if (statusRegistry && statusRegistry.clear(player, kind)) return true;
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
      if (kind === 'thorns' && (player.thorns || 0) > 0) {
        player.thorns = 0;
        return true;
      }
      if (kind === 'sandblind' && (player.sandblind || 0) > 0) {
        player.sandblind = Math.max(0, player.sandblind - 1);
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
      if (kind === 'diving' && player.diving) {
        player.diving = false;
        return true;
      }
      if (kind === 'scorch' && player.scorch) {
        player.scorch = false;
        return true;
      }
      if (kind === 'hypothermia' && (player.hypothermia || 0) > 0) {
        player.hypothermia = 0;
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
      // 普通奖励/掉落池只包含一次性道具；战利白卡由 AdventureLoot
      // 在击败怪物时单独结算，避免混入商店和房间奖励。
      const consumables = window.AdventureRegistry.itemsByKind('consumable');
      if (!consumables.length) return null;
      return consumables[Math.floor(random() * consumables.length)].name;
    },
    _rollCombatDrop() {
      const bonus = this.getAccessoryStatBonuses();
      const baseRate = 0.25 + (bonus.dropRateBonus || 0);
      if (random() >= baseRate) return null;
      return this._rollItemDrop();
    }
  });
})();

/* Adventure battle item/accessory extension. */
(function (global) {
  const Engine = global.AdventureBattleEngine;
  if (!Engine) throw new Error('adventure_battle_items.js requires battle_engine.js');
  const extension = {
    useAdventureCombatItem(itemIndex, choice) {
      const advEngine = this._adventureEngine;
      if (!advEngine) return this.state();
      const snap = advEngine.snapshot();
      const item = snap.consumables[itemIndex];
      if (!item) return this.state();
      const def = window.AdventureRegistry.getItem(item.name);
      if (!def || def.kind !== 'consumable') return this.state();
      if (!this._canUseAdventureCombatItemNow(def)) {
        if (this.s.player && (this.s.player.blind || 0) > 0 && def.kind === 'consumable') {
          this.emit('desc', '玩家处于致盲状态，无法使用一次性道具');
          return this.state();
        }
        const dodgeOnly = def.combatUse === 'dodge';
        this.emit('desc', dodgeOnly
          ? '闪避只能在防御出牌阶段使用'
          : def.defendOnly ? def.displayName + '只能在防御出牌阶段使用'
          : '当前不能使用道具（仅可在选牌出牌/防御时使用）');
        return this.state();
      }
      if (def.combatUse === 'attackMod') return this.state();
      if ((def.combatUse === 'dodge' || def.defendOnly) && !this.s.pendingAttack) {
        this.emit('desc', '当前没有可闪避的攻击');
        return this.state();
      }

      const player = this.s.player;
      const purifyChoices = Array.isArray(choice) ? choice : null;
      let targetKey = this.s.attackTarget;
      if (!targetKey && this.s.is1v2) {
        targetKey = (this.s.activeAttacker === 'ai2') ? 'ai2' : 'ai';
      }
      if (!targetKey) targetKey = 'ai';
      const ai = this.s[targetKey] || this.s.ai;

      const effects = window.AdventureCombatEffects;
      const result = effects && typeof effects.apply === 'function'
        ? effects.apply(this, def, { choice, purifyChoices, player, ai, advEngine, targetKey })
        : { ok: true, message: '使用' + def.displayName };

      if (result && result.pending) return this.state();
      if (!result || !result.ok) {
        this.emit('desc', (result && result.message) || '无法使用该道具');
        return this.state();
      }

      this.emit('desc', '使用道具[' + def.displayName + ']：' + result.message);
      advEngine.s.consumables.splice(itemIndex, 1);
      if (window.AdventureSave && typeof window.AdventureSave.save === 'function') {
        window.AdventureSave.save(advEngine);
      }
      if (result.rewindRoom) {
        const controller = window.AdventureBattleController;
        if (controller && typeof controller.abortCombatRewind === 'function') {
          controller.abortCombatRewind();
        }
        return this.state();
      }
      if (result.dodgeResolved) {
        this.s.phase = 'AI_TURN';
        this.deferSettlement('AI_ATTACK', 0, 0);
        return this.check();
      }
      this.check();
      return this.state();
    },

    _canUseAdventureCombatItemNow(def) {
      if (!this.s || !this.s.isAdventure) return false;
      if (this.s.busy) return false;
      if (this.s.needColorChoice) return false;
      if (this.s.player && (this.s.player.blind || 0) > 0 && def && def.kind === 'consumable') return false;
      if (def && (def.combatUse === 'dodge' || def.defendOnly)) {
        return this.s.phase === 'PLAYER_DEFEND' && !!this.s.pendingAttack;
      }
      if (def && def.combatUse === 'bind') {
        return this.s.phase === 'PLAYER_PLAY' && !this.s.bindUsedThisTurn;
      }
      if (def && def.combatUse === 'chameleonPaint') {
        return this.s.phase === 'PLAYER_PLAY';
      }
      // 仅在玩家可选择出牌/防御牌时（含不可防御时的跳过窗口）
      return this.s.phase === 'PLAYER_PLAY' || this.s.phase === 'PLAYER_DEFEND';
    },

    _applyCardMaster(choice) {
      if (choice !== 'draw2' && choice !== 'mulligan') {
        return { ok: false, message: '请选择：抽两张，或弃牌重抽' };
      }
      if (choice === 'draw2') {
        const drawn = this.draw('player', 2, true);
        return { ok: true, message: '抽取' + drawn.length + '张牌' };
      }
      const n = this.h.player.length;
      const dropped = this.h.player.splice(0, n);
      for (let i = dropped.length - 1; i >= 0; i--) {
        this.discardWithEvent(dropped[i], 'player', {
          handIndex: i,
          desc: '卡牌大师：弃掉' + this.cardText(dropped[i])
        });
      }
      const redrawn = this.draw('player', n, true);
      return { ok: true, message: '弃掉' + n + '张并重抽' + redrawn.length + '张' };
    },

    _listTransferableBuffs(ch) {
      const kinds = [];
      if (!ch) return kinds;
      const registry = window.FurryGame && window.FurryGame.StatusRegistry;
      if (registry) return registry.list(ch, def => !!def.transferable).map(def => def.id);
      if (ch.burn > 0) kinds.push('burn');
      if (ch.bleed > 0) kinds.push('bleed');
      if ((ch.poison || 0) > 0) kinds.push('poison');
      if (ch.frozen) kinds.push('freeze');
      if ((ch.blind || 0) > 0) kinds.push('blind');
      if ((ch.bomb || 0) > 0) kinds.push('bomb');
      if ((ch.iceSeal || 0) > 0) kinds.push('iceSeal');
      if ((ch.hypothermia || 0) > 0) kinds.push('hypothermia');
      if (ch.hypnosis) kinds.push('hypnosis');
      if (ch.sleep) kinds.push('sleep');
      if ((ch.thorns || 0) > 0) kinds.push('thorns');
      if (ch.guard > 0) kinds.push('guard');
      if ((ch.fly || 0) > 0) kinds.push('fly');
      if ((ch.crit || 0) > 0) kinds.push('crit');
      if ((ch.lush || 0) > 0) kinds.push('lush');
      if ((ch.parasite || 0) > 0) kinds.push('parasite');
      if (ch.diving) kinds.push('diving');
      if (ch.chaos_red) kinds.push('chaos_red');
      if (ch.chaos_yellow) kinds.push('chaos_yellow');
      if (ch.chaos_blue) kinds.push('chaos_blue');
      if (ch.chaos_green) kinds.push('chaos_green');
      return kinds;
    },

    _moveBuffLayer(from, to, kind, wTo) {
      const registry = window.FurryGame && window.FurryGame.StatusRegistry;
      const status = window.FurryGame && window.FurryGame.StatusService;
      const def = registry && registry.get(kind);
      if (def && def.transferable && registry.has(from, kind) && status) {
        // Non-stack statuses (and hypnosis/sleep markers) must go through clear
        // so companion fields like hypnosisArmed are reset with the status.
        if (!def.stack) status.clear(from, kind, 'all');
        else status.remove(from, kind, 1);
        status.add(to, kind, 1);
        if (def.polarity === 'buff') {
          this.emit('buff', '+1[' + def.label + ']', null, {
            who: wTo, kind, stacks: registry.amount(to, kind)
          });
        }
        return def.label;
      }
      const labels = {
        burn: '灼烧', bleed: '流血', poison: '中毒', freeze: '冷冻', iceSeal: '冰封',
        blind: '致盲', bomb: '定时炸弹', hypothermia: '失温', hypnosis: '催眠', sleep: '沉睡',
        thorns: '荆棘', guard: '守护', fly: '飞翔', crit: '暴击', lush: '茂盛',
        parasite: '寄生', diving: '潜水',
        chaos_red: '混沌·红', chaos_yellow: '混沌·黄', chaos_blue: '混沌·蓝', chaos_green: '混沌·绿'
      };
      switch (kind) {
        case 'burn':
          from.burn--; this.burn(to, 1); break;
        case 'bleed':
          from.bleed--; this.bleed(to, 1); break;
        case 'poison':
          from.poison = Math.max(0, (from.poison || 0) - 1); this.poison(to, 1); break;
        case 'freeze':
          from.frozen = false; this.freeze(to); break;
        case 'iceSeal':
          from.iceSeal = 0; this.iceSeal(to); break;
        case 'blind':
          from.blind = 0; to.blind = 1; break;
        case 'bomb':
          from.bomb = Math.max(0, (from.bomb || 0) - 1); to.bomb = Math.min(5, (to.bomb || 0) + 1); break;
        case 'hypothermia':
          from.hypothermia = Math.max(0, (from.hypothermia || 0) - 1);
          to.hypothermia = Math.min(2, (to.hypothermia || 0) + 1); break;
        case 'hypnosis':
          from.hypnosis = false; from.hypnosisArmed = false; to.hypnosis = true; break;
        case 'sleep':
          from.sleep = false; to.sleep = true; break;
        case 'thorns':
          from.thorns = 0; to.thorns = 1; break;
        case 'guard':
          from.guard--; to.guard = Math.min(5, (to.guard || 0) + 1);
          this.emit('buff', '+1[守护]', null, { who: wTo, kind: 'guard', stacks: to.guard });
          break;
        case 'fly':
          from.fly--; to.fly = Math.min(2, (to.fly || 0) + 1);
          this.emit('buff', '+1[飞翔]', null, { who: wTo, kind: 'fly', stacks: to.fly });
          break;
        case 'crit':
          from.crit--; to.crit = Math.min(3, (to.crit || 0) + 1);
          this.emit('buff', '+1[暴击]', null, { who: wTo, kind: 'crit', stacks: to.crit });
          break;
        case 'lush':
          from.lush--; to.lush = Math.min(2, (to.lush || 0) + 1);
          this.emit('buff', '+1[茂盛]', null, { who: wTo, kind: 'lush', stacks: to.lush });
          break;
        case 'parasite':
          from.parasite--; to.parasite = Math.min(1, (to.parasite || 0) + 1);
          this.emit('buff', '+1[寄生]', null, { who: wTo, kind: 'parasite', stacks: to.parasite });
          break;
        case 'diving':
          from.diving = false; to.diving = true;
          this.emit('buff', '+1[潜水]', null, { who: wTo, kind: 'diving', stacks: 1 });
          break;
        case 'chaos_red':
        case 'chaos_yellow':
        case 'chaos_blue':
        case 'chaos_green':
          from[kind] = false; to[kind] = true;
          this.emit('buff', '+1[' + labels[kind] + ']', null, { who: wTo, kind, stacks: 1 });
          break;
        default:
          return null;
      }
      return labels[kind] || kind;
    },

    _applyBuffTransfer(choice, player, opponent) {
      const fromSelf = this._listTransferableBuffs(player);
      const fromOpp = this._listTransferableBuffs(opponent);
      if (!fromSelf.length && !fromOpp.length) {
        return { ok: false, message: '双方都没有可转移的buff' };
      }
      let kind = choice;
      let from = 'self';
      if (choice && typeof choice === 'object') {
        kind = choice.kind;
        const src = choice.from;
        if (src === 'opp' || src === 'opponent' || src === 'ai' || src === 'ai2') from = 'opp';
        else if (src === 'self' || src === 'player') from = 'self';
      }
      if (!kind) return { ok: false, message: '请选择要转移的一层buff' };
      if (from === 'opp') {
        if (!fromOpp.includes(kind)) return { ok: false, message: '无效的buff选择' };
        const label = this._moveBuffLayer(opponent, player, kind, 'player');
        if (!label) return { ok: false, message: '无效的buff选择' };
        return { ok: true, message: '将对手1层' + label + '转移到自己' };
      }
      if (!fromSelf.includes(kind)) return { ok: false, message: '无效的buff选择' };
      const wTo = opponent === this.s.ai2 ? 'ai2' : 'ai';
      const label = this._moveBuffLayer(player, opponent, kind, wTo);
      if (!label) return { ok: false, message: '无效的buff选择' };
      return { ok: true, message: '将1层' + label + '转移给对手' };
    },

    _hasAccessory(name) {
      const eng = this._adventureEngine;
      return !!(eng && typeof eng.hasAccessory === 'function' && eng.hasAccessory(name));
    },

    /** Emit accessory bar flash before applying the accessory effect / buff float. */
    _flashAccessory(itemName) {
      if (!itemName || !this._hasAccessory(itemName)) return;
      const def = window.AdventureRegistry && window.AdventureRegistry.getItem(itemName);
      this.emit('accessoryTrigger', (def && def.displayName) || itemName, null, {
        who: 'player',
        target: 'player',
        itemName
      });
    },

    _flameFistBurnAmount() {
      const def = window.AdventureRegistry && window.AdventureRegistry.getItem('FlameFist');
      const perFist = (def && def.onDefendBurn) || 1;
      const eng = this._adventureEngine;
      const count = eng && typeof eng.accessoryCount === 'function' ? eng.accessoryCount('FlameFist') : 1;
      return perFist * count;
    },

    _tryFlameFistOnDefend(skip) {
      if (!this.s || !this.s.isAdventure) return;
      if (skip) return;
      if (!this._hasAccessory('FlameFist')) return;
      const i = this.s.selectedCard;
      const c = this.h.player && this.h.player[i];
      if (!c || c.isItemCard || (c.isBlack && !c.chosenColor)) return;
      const attackerKey = (this.s.atkOwner && this.s.atkOwner !== 'player') ? this.s.atkOwner : 'ai';
      const attacker = this.s[attackerKey];
      if (!attacker || !attacker.alive) return;
      const stacks = this._flameFistBurnAmount();
      this._flashAccessory('FlameFist');
      this.burn(attacker, stacks);
    }

  };
  Object.assign(Engine.prototype, extension);
})(window);

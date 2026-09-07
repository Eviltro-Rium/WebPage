/* Adventure reward / beast-token settlement — mixed into AdventureEngine.prototype */
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

    _prepareCombatSettlement(room) {
      this.s.beastReward = null;
      this.s.beastSelection = [];
      if (room.type === window.RoomType.CHALLENGE) {
        return this._beginChallengeBonusReward(room);
      }
      if (room.type === window.RoomType.BOSS) {
        return this._beginBossReward(room);
      }
      const basic = this._rollBasicCombatReward();
      this.s.pendingCombatReward = {
        stage: 'basic',
        roomType: room.type,
        basic,
        beast: null,
        applied: false
      };
      this.s.phase = Phase.COMBAT_SETTLE;
      this._log('基础奖励：' + this._basicLootText(basic));
      this.emit('basicReward', '战斗基础奖励', { basic });
    },
    _rollBasicCombatReward() {
      // 无×1，5–10金币各×1，道具×1权重3，道具×2权重2 → 合计 12
      const total = 12;
      let r = Math.random() * total;
      if (r < 1) return { kind: 'none' };
      r -= 1;
      for (let gold = 5; gold <= 10; gold++) {
        if (r < 1) return { kind: 'gold', gold };
        r -= 1;
      }
      if (r < 3) {
        const item = this._rollItemDrop();
        return item ? { kind: 'item', item } : { kind: 'none' };
      }
      r -= 3;
      const a = this._rollItemDrop();
      const b = this._rollItemDrop();
      const items = [];
      if (a) items.push(a);
      if (b) items.push(b);
      return { kind: 'items', items };
    },
    _beginBossReward(room) {
      const accessory = this._rollAccessoryDrop();
      const basic = accessory
        ? { kind: 'accessory', accessory }
        : { kind: 'none' };
      this.s.pendingCombatReward = {
        stage: 'basic',
        roomType: window.RoomType.BOSS,
        basic,
        beast: null,
        applied: false
      };
      this.s.phase = Phase.COMBAT_SETTLE;
      this._log('Boss奖励：' + this._roomLootText(basic));
      this.emit('basicReward', 'Boss奖励', { basic });
      return true;
    },
    _finishBossRewardSettlement(room) {
      this.s.pendingRoomReward = null;
      this.s.pendingCombatReward = {
        stage: 'boss-exit',
        roomType: window.RoomType.BOSS,
        applied: true
      };
      this.s.beastReward = null;
      this.s.beastSelection = [];
      this.s.phase = Phase.COMBAT_SETTLE;
      return true;
    },
    _basicLootText(loot) {
      if (!loot || loot.kind === 'none') return '无奖励';
      if (loot.kind === 'gold') return loot.gold + ' 金币';
      if (loot.kind === 'items') {
        const list = Array.isArray(loot.items) ? loot.items : [];
        if (!list.length) return '道具：无';
        const names = list.map(n => {
          const def = window.AdventureRegistry.getItem(n);
          return def ? def.displayName : n;
        });
        return '道具：' + names.join('、');
      }
      if (loot.kind === 'item') {
        const def = window.AdventureRegistry.getItem(loot.item);
        return '道具：' + (def ? def.displayName : loot.item);
      }
      if (loot.kind === 'accessory') {
        const name = loot.accessory || loot.item;
        const def = window.AdventureRegistry.getItem(name);
        return '配饰：' + (def ? def.displayName : name);
      }
      if (loot.kind === 'beast') {
        return '兽元：' + (window.AdventureCurrency.BEAST_LABEL[loot.beastType] || loot.beastType) + ' ×1';
      }
      return '无奖励';
    },
    _applyBasicLoot(loot) {
      if (!loot || loot.kind === 'none') return { ok: true, empty: true };
      if (loot.kind === 'gold') {
        this.s.currency.addGold(loot.gold);
        return { ok: true };
      }
      if (loot.kind === 'items') {
        const list = Array.isArray(loot.items) ? loot.items : [];
        if (!list.length) return { ok: true, empty: true };
        for (let i = 0; i < list.length; i++) {
          if (!this.addItem(list[i], { allowConsumableOverflow: true })) return { ok: false, reason: 'full' };
        }
        return { ok: true, itemOverflow: Math.max(0, this.s.consumables.length - CONSUMABLE_SLOT_COUNT) };
      }
      if (loot.kind === 'accessory') {
        const name = loot.accessory || loot.item;
        if (!name) return { ok: true, empty: true };
        const check = this._canAddItem(name);
        if (!check.ok) return { ok: false, reason: check.reason, message: check.message };
        if (!this.addItem(name)) return { ok: false, reason: 'full' };
        return { ok: true };
      }
      if (loot.kind === 'item') {
        const check = this._canAddItem(loot.item);
        if (!check.ok) return { ok: false, reason: check.reason, message: check.message };
        if (!this.addItem(loot.item, { allowConsumableOverflow: true })) return { ok: false, reason: 'full' };
        return { ok: true, itemOverflow: Math.max(0, this.s.consumables.length - CONSUMABLE_SLOT_COUNT) };
      }
      if (loot.kind === 'beast') {
        const map = {};
        map[loot.beastType] = 1;
        this.s.currency.addTokens(map);
        return { ok: true, beastAdded: true };
      }
      return { ok: true, empty: true };
    },
    _stashBasicLoot(room, loot) {
      if (!room) return;
      if (!loot || loot.kind === 'none') {
        room.stashedLoot = null;
        room.rewardClaimed = true;
        return;
      }
      room.stashedLoot = this._cloneLoot(loot);
      room.rewardClaimed = false;
    },
    _clearStashedLoot(room) {
      if (!room) return;
      room.stashedLoot = null;
      room.rewardClaimed = true;
    },
    _beginItemDiscard(returnTo) {
      const overflow = Math.max(0, this.s.consumables.length - CONSUMABLE_SLOT_COUNT);
      if (!overflow) return false;
      this.s.pendingItemDiscard = overflow;
      this.s.itemDiscardReturn = returnTo || 'map';
      this.s.phase = Phase.ITEM_DISCARD;
      this._log('道具超过上限(' + CONSUMABLE_SLOT_COUNT + ')，需舍弃' + overflow + '个');
      this.emit('itemOverflow', '道具超上限，需舍弃' + overflow + '个', {
        overflow,
        total: this.s.consumables.length,
        max: CONSUMABLE_SLOT_COUNT,
        returnTo: this.s.itemDiscardReturn
      });
      return true;
    },
    _resumeAfterItemDiscard() {
      const returnTo = this.s.itemDiscardReturn;
      this.s.pendingItemDiscard = 0;
      this.s.itemDiscardReturn = null;
      if (returnTo === 'combat-basic') {
        const pending = this.s.pendingCombatReward;
        const room = this.currentRoom();
        if (room && room.type === window.RoomType.BOSS) return this._finishBossRewardSettlement(room);
        return this._beginDedicatedBeastSettlement(room);
      }
      if (returnTo === 'combat-bonus') return this._beginChallengeBeastSettlement(this.currentRoom());
      this.s.phase = Phase.MAP;
      return true;
    },
    claimRoomReward() {
      if (!this.s || this.s.phase !== Phase.REWARD) return false;
      const room = this.currentRoom();
      if (!room || room.type !== window.RoomType.ITEM) return false;
      const loot = this.s.pendingRoomReward || room.stashedLoot;
      if (!loot) return false;
      const result = this._applyBasicLoot(loot);
      if (!result.ok) {
        this._lastRewardError = { reason: result.reason || 'full', message: result.message || '道具槽已满，无法领取该奖励' };
        this._log(this._lastRewardError.message);
        return false;
      }
      this._lastRewardError = null;
      this._clearStashedLoot(room);
      this.s.pendingRoomReward = null;
      room.visited = true;
      this._log('领取奖励房奖励：' + this._roomLootText(loot));
      this.emit('reward', '领取奖励房奖励', { loot });
      if (result.itemOverflow) {
        this._beginItemDiscard('map');
        return true;
      }
      this.s.phase = Phase.MAP;
      return true;
    },
    deferRoomReward() {
      if (!this.s || this.s.phase !== Phase.REWARD) return false;
      const room = this.currentRoom();
      if (!room || room.type !== window.RoomType.ITEM) return false;
      const loot = this.s.pendingRoomReward;
      if (!loot) return false;
      this._stashBasicLoot(room, loot);
      this.s.pendingRoomReward = null;
      room.visited = true;
      this._log('奖励房奖励留在房间：' + this._roomLootText(loot));
      this.emit('rewardDefer', '奖励房奖励留在房间', { loot });
      this.s.phase = Phase.MAP;
      return true;
    }

    /** 领取基础奖励后进入兽元结算 */,
    claimCombatReward() {
      if (!this.s) return false;
      const pending = this.s.pendingCombatReward;
      const room = this.currentRoom();

      if (this.s.phase === Phase.BEAST_CHOICE) {
        return this.confirmBeastTokenChoice();
      }

      if (this.s.phase !== Phase.COMBAT_SETTLE || !pending) return false;

      if (pending.stage === 'basic' && !pending.applied) {
        const result = this._applyBasicLoot(pending.basic);
        if (!result.ok) {
          this._lastRewardError = { reason: result.reason || 'full', message: result.message || '道具槽已满，无法领取该道具' };
          this._log(this._lastRewardError.message);
          return false;
        }
        this._lastRewardError = null;
        this._clearStashedLoot(room);
        pending.applied = true;
        this._log('领取基础奖励：' + this._basicLootText(pending.basic));
        this.emit('reward', '领取战斗基础奖励', { basic: pending.basic });
        if (result.itemOverflow) {
          this._beginItemDiscard('combat-basic');
          return true;
        }
        if (result.beastAdded) {
          const overflow = this.s.currency.overflowAfter(0);
          if (overflow > 0) {
            this.s.pendingDiscard = overflow;
            this.s.phase = Phase.BEAST_DISCARD;
            this.s.pendingCombatReward = Object.assign({}, pending, { stage: 'beast-pending', basic: null });
            this._log('兽元超过上限，需先舍弃再继续结算');
            this.emit('beastOverflow', '兽元超上限，需舍弃' + overflow + '个', {
              overflow,
              total: this.s.currency.totalBeastTokens(),
              max: this.s.currency.maxBeast,
              resumeBeastSettle: true
            });
            return true;
          }
        }
        if (room && room.type === window.RoomType.BOSS) {
          return this._finishBossRewardSettlement(room);
        }
        return this._beginDedicatedBeastSettlement(room);
      }

      if (pending.stage === 'bonus' && !pending.applied) {
        const result = this._applyBasicLoot(pending.bonus);
        if (!result.ok) {
          this._lastRewardError = { reason: result.reason || 'full', message: result.message || '道具槽已满，无法领取该奖励' };
          this._log(this._lastRewardError.message);
          return false;
        }
        this._lastRewardError = null;
        pending.applied = true;
        this._log('领取挑战房奖励：' + this._roomLootText(pending.bonus));
        this.emit('reward', '领取挑战房奖励', { bonus: pending.bonus });
        if (result.itemOverflow) {
          this._beginItemDiscard('combat-bonus');
          return true;
        }
        return this._beginChallengeBeastSettlement(room);
      }

      if (pending.stage === 'beast' && pending.beast && pending.beast.auto) {
        this.s.currency.addTokens(pending.beast.offered);
        if (room) room.beastTokenClaimed = true;
        this._log('兽元奖励：直接获得' + this._tokenText(pending.beast.offered));
        this.emit('beastReward', '获得万能兽元', { scenario: pending.beast.scenario, auto: true, tokens: pending.beast.offered });
        this.s.pendingCombatReward = null;
        this._checkBeastOverflow(room);
        return true;
      }

      return false;
    }

    /** 基础奖励留在房间，随后进入兽元结算 */,
    deferCombatReward() {
      if (!this.s) return false;
      const pending = this.s.pendingCombatReward;
      if (this.s.phase !== Phase.COMBAT_SETTLE || !pending || pending.stage !== 'basic' || pending.applied) {
        return false;
      }
      const room = this.currentRoom();
      this._stashBasicLoot(room, pending.basic);
      pending.applied = true;
      this._log('基础奖励留在房间：' + this._basicLootText(pending.basic));
      this.emit('rewardDefer', '基础奖励留在房间', { basic: pending.basic });
      if (room && room.type === window.RoomType.BOSS) {
        return this._finishBossRewardSettlement(room);
      }
      return this._beginDedicatedBeastSettlement(room);
    },
    _beginChallengeBonusReward(room) {
      const bonus = this._rollChallengeBonusReward();
      this.s.pendingCombatReward = {
        stage: 'bonus',
        roomType: window.RoomType.CHALLENGE,
        bonus,
        applied: false
      };
      this.s.phase = Phase.COMBAT_SETTLE;
      this._log('挑战房奖励：' + this._roomLootText(bonus));
      this.emit('basicReward', '挑战房奖励', { basic: bonus });
      return true;
    },
    _beginChallengeBeastSettlement(room) {
      if (!room || room.beastTokenClaimed) {
        this.s.pendingCombatReward = null;
        this.s.beastReward = null;
        this.s.phase = Phase.MAP;
        return true;
      }
      const r = Math.floor(Math.random() * 8);
      let offered;
      let scenario;
      if (r === 7) {
        offered = { wuneng: 2 };
        scenario = 7;
      } else if (r === 0) {
        offered = { ben: 1, cao: 1, shui: 1, huo: 1 };
        scenario = 0;
      } else {
        const pair = window.AdventureCurrency.TYPE_PAIRS[r - 1];
        offered = {};
        offered[pair[0]] = 2;
        offered[pair[1]] = 2;
        scenario = r;
      }
      this.s.pendingCombatReward = {
        stage: 'beast',
        roomType: window.RoomType.CHALLENGE,
        beast: { auto: true, offered, scenario },
        applied: true
      };
      this.s.beastReward = null;
      this.s.beastSelection = [];
      this.s.phase = Phase.COMBAT_SETTLE;
      this._log('挑战房兽元：' + this._tokenText(offered) + '（请领取）');
      this.emit('beastReward', '挑战房兽元结算', { scenario, auto: true, tokens: offered });
      return true;
    }

    /** 兽元舍弃完成后，若还欠专属兽元结算则继续 */,
    _resumeAfterBeastDiscard() {
      const pending = this.s.pendingCombatReward;
      if (pending && pending.stage === 'beast-pending') {
        if (pending.roomType === window.RoomType.CHALLENGE) {
          return this._beginChallengeBeastSettlement(this.currentRoom());
        }
        return this._beginDedicatedBeastSettlement(this.currentRoom());
      }
      this.s.beastReward = null;
      this.s.pendingDiscard = 0;
      this.s.phase = this.s.beastDiscardReturnPhase || Phase.MAP;
      this.s.beastDiscardReturnPhase = null;
    },
    _beginDedicatedBeastSettlement(room) {
      if (!room || room.type !== window.RoomType.NORMAL || room.beastTokenClaimed) {
        this.s.pendingCombatReward = null;
        this.s.beastReward = null;
        this.s.phase = Phase.MAP;
        return true;
      }

      const beast = window.AdventureCurrency.rollBeastReward();
      if (beast.auto) {
        this.s.pendingCombatReward = { stage: 'beast', basic: null, beast, applied: true };
        this.s.beastReward = null;
        this.s.beastSelection = [];
        this.s.phase = Phase.COMBAT_SETTLE;
        this._log('兽元结算：直接获得万能兽元 ×1（请领取）');
        this.emit('beastReward', '兽元结算', { scenario: beast.scenario, auto: true, tokens: beast.offered });
        return true;
      }

      this.s.pendingCombatReward = { stage: 'beast', basic: null, beast, applied: true };
      this.s.beastReward = beast;
      this.s.beastSelection = [];
      this.s.phase = Phase.BEAST_CHOICE;
      const offeredText = beast.offeredTypes
        ? beast.offeredTypes.map(t => window.AdventureCurrency.BEAST_LABEL[t] + '×2').join('、')
        : this._tokenText(beast.offered);
      this._log('兽元结算（情况' + (beast.scenario + 1) + '）：可选 ' + offeredText + '，请选2个');
      this.emit('beastReward', '选择兽元', {
        scenario: beast.scenario,
        offered: beast.offered,
        offeredTypes: beast.offeredTypes,
        pickCount: 2
      });
      return true;
    },
    _collectGoldReward(room) {
      const reward = room.reward || this._defaultReward(room);
      if (reward) {
        if (reward.currency) this.s.currency.addGold(reward.currency);
        if (reward.items) reward.items.forEach(it => this.addItem(it));
        if (reward.heal) this.s.player.hp = Math.min(this.s.player.maxHp, this.s.player.hp + reward.heal);
      }
      room.rewardClaimed = true;
      this._log('获得金币奖励' + (reward && reward.currency ? '：' + reward.currency + '金币' : '：无'));
      this.emit('reward', '获得金币奖励', { reward });
    },
    applyBattleResult(result) {
      if (!this.s || !result) return false;
      const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));

      if (result.playerState) {
        const saved = clone(result.playerState);
        Object.assign(this.s.player, saved);
        this.s.player.name = this.s.charMod.name;
        this.s.player.maxHp = Number(saved.maxHp || this.s.charMod.hp);
        this.s.player.hp = Math.max(0, Math.min(this.s.player.maxHp, Number(saved.hp)));
      }

      if (result.playerPile) {
        const pile = result.playerPile;
        if (!this.s.playerPile) {
          this.s.playerPile = new window.AdventureDeck.AdventurePile('player', [], pile.handLimit || 5);
        }
        this.s.playerPile.deck = clone(pile.deck || []);
        this.s.playerPile.hand = clone(pile.hand || []);
        this.s.playerPile.discard = clone(pile.discard || []);
        this.s.playerPile.handLimit = Number(pile.handLimit || 5);
      }

      this.s.discardTop = new window.AdventureDeck.DiscardTop(clone(result.discardTop || null));
      this.s.discardTopOwner = result.discardTopOwner || null;
      this.emit('combatResourcesSaved', '玩家手牌、牌库与弃牌库状态已保存', {
        deck: this.s.playerPile ? this.s.playerPile.deck.length : 0,
        hand: this.s.playerPile ? this.s.playerPile.hand.length : 0,
        discard: this.s.playerPile ? this.s.playerPile.discard.length : 0,
        npcResetCount: result.npcResetCount || 0
      });
      return true;
    },
    _startBeastTokenReward(room) {
      const scenario = window.AdventureCurrency.rollBeastReward();
      this.s.beastReward = scenario;
      this.s.beastSelection = [];

      if (scenario.auto) {
        this.s.currency.addTokens(scenario.offered);
        room.beastTokenClaimed = true;
        this._log('兽元奖励：直接获得' + this._tokenText(scenario.offered));
        this.emit('beastReward', '获得万能兽元', { scenario: scenario.scenario, auto: true, tokens: scenario.offered });
        this._checkBeastOverflow(room);
      } else {
        this.s.phase = Phase.BEAST_CHOICE;
        const offeredText = scenario.offeredTypes
          ? scenario.offeredTypes.map(t => window.AdventureCurrency.BEAST_LABEL[t] + '×2').join('、')
          : this._tokenText(scenario.offered);
        this._log('兽元奖励（情况' + (scenario.scenario + 1) + '）：可选 ' + offeredText + '，请选2个');
        this.emit('beastReward', '选择兽元', { scenario: scenario.scenario, offered: scenario.offered, offeredTypes: scenario.offeredTypes, pickCount: 2 });
      }
    },
    _checkBeastOverflow(room) {
      const overflow = this.s.currency.overflowAfter(0);
      if (overflow > 0) {
        this.s.pendingDiscard = overflow;
        this.s.phase = Phase.BEAST_DISCARD;
        this._log('兽元超过上限(' + this.s.currency.maxBeast + ')，需舍弃' + overflow + '个');
        this.emit('beastOverflow', '兽元超上限，需舍弃' + overflow + '个', { overflow, total: this.s.currency.totalBeastTokens(), max: this.s.currency.maxBeast });
      } else {
        this.s.beastReward = null;
        this.s.phase = this.s.beastDiscardReturnPhase || Phase.MAP;
        this.s.beastDiscardReturnPhase = null;
      }
    },
    selectBeastToken(type) {
      if (this.s.phase !== Phase.BEAST_CHOICE) return false;
      const scenario = this.s.beastReward;
      if (!scenario) return false;
      const pickCount = scenario.pickCount || 2;
      if (this.s.beastSelection.length >= pickCount) return false;

      const slots = this._offeredSlotTypes(scenario);
      const slotIndex = slots.findIndex((t, i) => t === type && this.s.beastSelection.indexOf(i) < 0);
      if (slotIndex < 0) return false;

      this.s.beastSelection.push(slotIndex);
      this.emit('beastSelect', '选中' + window.AdventureCurrency.BEAST_LABEL[type], { type, slotIndex, selected: this._selectedBeastTypes() });
      return true;
    },
    confirmBeastTokenChoice() {
      if (this.s.phase !== Phase.BEAST_CHOICE) return false;
      const scenario = this.s.beastReward;
      if (!scenario) return false;
      if (this.s.beastSelection.length < scenario.pickCount) return false;
      this._confirmBeastTokenChoice();
      return true;
    },
    unselectBeastToken(idx) {
      if (this.s.phase !== Phase.BEAST_CHOICE) return false;
      if (idx < 0 || idx >= this.s.beastSelection.length) return false;
      const slotIndex = this.s.beastSelection.splice(idx, 1)[0];
      const type = this._offeredSlotTypes(this.s.beastReward)[slotIndex];
      this.emit('beastUnselect', '取消选中' + window.AdventureCurrency.BEAST_LABEL[type], { type, slotIndex, selected: this._selectedBeastTypes() });
      return true;
    },
    toggleBeastSlot(slotIndex) {
      if (this.s.phase !== Phase.BEAST_CHOICE) return false;
      const scenario = this.s.beastReward;
      if (!scenario) return false;
      const slots = this._offeredSlotTypes(scenario);
      if (slotIndex < 0 || slotIndex >= slots.length) return false;
      const pickCount = scenario.pickCount || 2;
      const selIdx = this.s.beastSelection.indexOf(slotIndex);
      if (selIdx >= 0) return this.unselectBeastToken(selIdx);
      if (this.s.beastSelection.length >= pickCount) return false;
      this.s.beastSelection.push(slotIndex);
      this.emit('beastSelect', '选中' + window.AdventureCurrency.BEAST_LABEL[slots[slotIndex]], {
        type: slots[slotIndex],
        slotIndex,
        selected: this._selectedBeastTypes()
      });
      return true;
    },
    _confirmBeastTokenChoice() {
      const room = this.currentRoom();
      const selected = this._selectedBeastTypes();
      const tokenMap = {};
      selected.forEach(t => { tokenMap[t] = (tokenMap[t] || 0) + 1; });

      this.s.currency.addTokens(tokenMap);
      room.beastTokenClaimed = true;
      this.s.pendingCombatReward = null;
      this._log('兽元奖励：领取' + this._tokenText(tokenMap));
      this.emit('beastClaim', '领取兽元', { tokens: tokenMap });

      this.s.beastSelection = [];
      this._checkBeastOverflow(room);
    },
    discardBeastToken(type) {
      if (this.s.phase !== Phase.BEAST_DISCARD) return false;
      if (!this.s.currency.removeOne(type)) return false;

      this.s.pendingDiscard--;
      this._log('舍弃1个' + window.AdventureCurrency.BEAST_LABEL[type] + '（剩余需舍弃' + this.s.pendingDiscard + '个）');
      this.emit('beastDiscard', '舍弃' + window.AdventureCurrency.BEAST_LABEL[type], { type, remaining: this.s.pendingDiscard });

      if (this.s.pendingDiscard <= 0) {
        this.s.pendingDiscard = 0;
        this._log('舍弃完成');
        this.emit('beastDiscardDone', '舍弃完成', {});
        this._resumeAfterBeastDiscard();
      }
      return true;
    },
    _selectedBeastTypes() {
      if (!this.s.beastReward) return [];
      const slots = this._offeredSlotTypes(this.s.beastReward);
      return this.s.beastSelection.map(i => slots[i]).filter(Boolean);
    },
    _offeredOriginal(scenario) {
      const orig = { ben: 0, cao: 0, shui: 0, huo: 0, wuneng: 0 };
      if (!scenario) return orig;
      if (scenario.offeredTypes) {
        scenario.offeredTypes.forEach(t => { orig[t] = 2; });
      } else if (scenario.offered) {
        for (const k in scenario.offered) orig[k] = scenario.offered[k];
      }
      return orig;
    },
    _offeredSlotTypes(scenario) {
      const orig = this._offeredOriginal(scenario);
      const slots = [];
      window.AdventureCurrency.ALL_BEAST_TYPES.forEach(type => {
        const count = orig[type] || 0;
        for (let i = 0; i < count; i++) slots.push(type);
      });
      return slots;
    },
    _offeredSlots(scenario) {
      const slots = this._offeredSlotTypes(scenario);
      const selected = new Set(this.s.beastSelection || []);
      return slots.map((type, index) => ({
        type,
        index,
        selected: selected.has(index)
      }));
    },
    _offeredAvailable(scenario) {
      const avail = this._offeredOriginal(scenario);
      this._selectedBeastTypes().forEach(t => { avail[t] = Math.max(0, avail[t] - 1); });
      return avail;
    },
    _tokenText(tokenMap) {
      const parts = [];
      for (const k in tokenMap) {
        if (tokenMap[k] > 0) parts.push(window.AdventureCurrency.BEAST_LABEL[k] + '×' + tokenMap[k]);
      }
      return parts.join('、') || '无';
    },
    collectReward() {
      const room = this.currentRoom();
      if (!room) return null;

      if (room.type === window.RoomType.ITEM && (this.s.pendingRoomReward || room.stashedLoot)) {
        const loot = this._cloneLoot(this.s.pendingRoomReward || room.stashedLoot);
        return this.claimRoomReward() ? loot : null;
      }

      if (room.stashedLoot) {
        const loot = room.stashedLoot;
        const result = this._applyBasicLoot(loot);
        if (!result.ok) {
          this._lastRewardError = { reason: result.reason || 'full', message: result.message || '道具槽已满，无法领取留在房间的道具' };
          this._log(this._lastRewardError.message);
          return null;
        }
        this._lastRewardError = null;
        this._clearStashedLoot(room);
        room.visited = true;
        this._log('领取房间内保留的奖励：' + this._basicLootText(loot));
        this.emit('reward', '领取保留奖励', { basic: loot });
        if (result.itemOverflow) {
          this._beginItemDiscard('map');
          return loot;
        }
        if (result.beastAdded) {
          this._checkBeastOverflow(room);
          if (this.s.phase === Phase.BEAST_DISCARD) return loot;
        }
        this.s.phase = Phase.MAP;
        return loot;
      }

      this._log('当前没有可领取的奖励');
      return null;
    },
    skipReward() {
      if (this.s.phase !== Phase.REWARD) return;
      const room = this.currentRoom();
      if (room && room.type === window.RoomType.ITEM && this.s.pendingRoomReward) {
        this.deferRoomReward();
        return;
      }
      if (room) room.visited = true;
      this._log(room && room.stashedLoot
        ? '暂不领取房间内奖励，返回地图'
        : '选择不领取奖励，返回地图');
      this.emit('skipReward', '跳过奖励', {
        roomType: room ? room.type : null,
        stashed: room ? room.stashedLoot : null
      });
      this.s.phase = Phase.MAP;
      this.s.pendingRoomReward = null;
    },
    enterNextStage() {
      const room = this.currentRoom();
      if (!room || room.type !== window.RoomType.BOSS || !room.cleared) return;
      this.s.pendingCombatReward = null;
      this.s.phase = Phase.CLEAR;
      this.emit('stageClear', '进入下一层', {});
      this._log('进入下一层');
    },
    returnToMap() {
      if (!this.s) return false;
      this.s.pendingCombatReward = null;
      this.s.beastReward = null;
      this.s.beastSelection = [];
      this.s.pendingDiscard = 0;
      this.s.pendingItemDiscard = 0;
      this.s.itemDiscardReturn = null;
      this.s.phase = Phase.MAP;
      this.emit('returnToMap', '返回地图', {});
      return true;
    },
    continueTo(map, opts = {}) {
      if (!this.s) return null;
      this.s.map = map;
      this.s.pos = map.start ? { r: map.start.r, c: map.start.c } : null;
      this.s.combat = null;
      this.s.beastReward = null;
      this.s.beastSelection = [];
      this.s.pendingDiscard = 0;
      this.s.pendingItemDiscard = 0;
      this.s.itemDiscardReturn = null;
      this.s.pendingCombatReward = null;
      this.s.pendingRoomReward = null;
      this.s.phase = Phase.MAP;
      if (opts.stage) this.s.stage = opts.stage;
      if (opts.scene) this.s.scene = opts.scene;
      if (this.s.pos) {
        const room = map.get(this.s.pos.r, this.s.pos.c);
        if (room) room.visited = true;
      }
      this._initItemDoorCosts(map);
      this._log('进入新地图：' + (opts.scene || this.s.scene) + ' 第' + (opts.stage || this.s.stage) + '层');
      this.emit('continue', '进入新地图', { stage: this.s.stage, scene: this.s.scene });
      return this.s;
    },
    _defaultReward(room) {
      return null;
    },
    _rewardText(reward) {
      const parts = [];
      if (reward.currency) parts.push(reward.currency + ' 金币');
      if (reward.items && reward.items.length) {
        const names = reward.items.map(n => {
          const def = window.AdventureRegistry.getItem(n);
          return def ? def.displayName : n;
        });
        parts.push(names.join('、'));
      }
      if (reward.heal) parts.push('恢复 ' + reward.heal + ' 生命');
      return '：' + (parts.length ? parts.join('，') : '无');
    }

    /* ===== 道具系统 ===== */
  });
})();

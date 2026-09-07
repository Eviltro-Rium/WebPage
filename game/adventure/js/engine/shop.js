/* Adventure shop / blacksmith — mixed into AdventureEngine.prototype */
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

    _handleShop(room) {
      this._ensureShopSlots(room, true);
      this.s.phase = Phase.SHOP;
      this.s.shopSelectedSlot = null;
      this.emit('shopEnter', '进入商店', { slots: room.shopSlots.slice(), currency: this.s.currency });
      this._log('进入商店');
    },
    _handleBlacksmith(room) {
      if (!room.doorUnlocked) {
        const need = this._blacksmithEntryGold();
        if (need > 0) {
          if (!this.s.currency.spendGold(need)) {
            this._log('金币不足，无法进入铁匠铺（需要' + need + '金币）');
            this.emit('doorLocked', '铁匠铺未开门', { costGold: need, gold: this.s.currency.gold });
            this.s.phase = Phase.MAP;
            return { ok: false, message: '金币不足，需要' + need + '金币' };
          }
          this._log('支付' + need + '金币进入铁匠铺');
          this.emit('doorUnlock', '打开铁匠铺', { costGold: need });
        }
        room.doorUnlocked = true;
      }
      this._ensureBlacksmithSlots(room);
      this.s.phase = Phase.BLACKSMITH;
      this.s.blacksmithSelectedSlot = null;
      this.emit('blacksmithEnter', '进入铁匠铺', {
        slots: room.blacksmithSlots.slice(),
        trophySlot: room.blacksmithTrophySlot,
        currency: this.s.currency
      });
      this._log('进入铁匠铺');
    },
    _ensureBlacksmithSlots(room) {
      if (!room) return;
      if (!Array.isArray(room.blacksmithSlots) || room.blacksmithSlots.length !== 3) {
        room.blacksmithSlots = [
          this._rollBlacksmithSlot(),
          this._rollBlacksmithSlot(),
          this._rollBlacksmithSlot()
        ];
      }
      if (room.blacksmithTrophySlot === undefined) {
        room.blacksmithTrophySlot = 'BurnTrophy';
      }
    },
    _rollTrophyWhiteSlot() {
      const trophies = window.AdventureRegistry.allItems().filter(item => item.kind === 'trophyWhite');
      if (!trophies.length) return null;
      return trophies[Math.floor(Math.random() * trophies.length)].name;
    },
    _rollBlacksmithSlot() {
      return this._rollAccessoryDrop();
    },
    _accessoryTradeCost(itemName) {
      const def = window.AdventureRegistry.getItem(itemName);
      return def && Array.isArray(def.beastTradeCost) ? def.beastTradeCost.slice() : [];
    },
    _blacksmithSlotDetail(itemName) {
      if (!itemName) return null;
      const def = window.AdventureRegistry.getItem(itemName);
      if (!def) return null;
      const beastCost = this._accessoryTradeCost(itemName);
      return {
        kind: 'accessory',
        name: itemName,
        displayName: def.displayName,
        description: def.description,
        icon: def.icon,
        beastCost,
        beastCostText: this._beastTradeCostText(beastCost),
        refreshable: true
      };
    },
    _blacksmithTrophyDetail(itemName) {
      if (!itemName) return null;
      const def = window.AdventureRegistry.getItem(itemName);
      if (!def || def.kind !== 'trophyWhite') return null;
      const beastCost = Array.isArray(def.beastTradeCost) ? def.beastTradeCost.slice() : [];
      return {
        kind: 'trophyWhite',
        name: itemName,
        displayName: def.displayName,
        description: def.description,
        icon: def.icon,
        beastCost,
        beastCostText: this._beastTradeCostText(beastCost),
        refreshable: true
      };
    },
    buyBlacksmithTrophy() {
      if (this.s.phase !== Phase.BLACKSMITH) return { ok: false, message: '不在铁匠铺' };
      const room = this.currentRoom();
      this._ensureBlacksmithSlots(room);
      const itemName = room && room.blacksmithTrophySlot;
      if (!itemName) return { ok: false, message: 'sold-out' };
      const def = window.AdventureRegistry.getItem(itemName);
      if (!def || def.kind !== 'trophyWhite') return { ok: false, message: '无效战利白卡' };
      const need = Array.isArray(def.beastTradeCost) ? def.beastTradeCost.slice() : [];
      if (!this.s.currency.canPayBeastCost(need)) {
        return { ok: false, message: '兽元不足，需要：' + this._beastTradeCostText(need) };
      }
      this.s.currency.payBeastCost(need);
      if (!this.addItem(itemName)) {
        this.s.currency.addTokens(this._countTokensFromCost(need));
        return { ok: false, message: '无法获得战利白卡' };
      }
      room.blacksmithTrophySlot = null;
      this.s.blacksmithSelectedSlot = 'trophy';
      this._log('锻造战利白卡：' + def.displayName + '（' + this._beastTradeCostText(need) + '）');
      this.emit('buy', '锻造战利白卡成功', { itemName, kind: 'trophyWhite', beastCost: need.slice() });
      return { ok: true };
    },
    refreshBlacksmithTrophy() {
      if (this.s.phase !== Phase.BLACKSMITH) return { ok: false, message: '不在铁匠铺' };
      const room = this.currentRoom();
      this._ensureBlacksmithSlots(room);
      const price = 2;
      if (!this.s.currency.spendGold(price)) return { ok: false, message: '金币不足（需要2）' };
      room.blacksmithTrophySlot = this._rollTrophyWhiteSlot();
      this.s.blacksmithSelectedSlot = 'trophy';
      this.emit('blacksmithRefresh', '刷新战利白卡摊位', { trophy: room.blacksmithTrophySlot, price, gold: this.s.currency.gold });
      return { ok: true, itemName: room.blacksmithTrophySlot };
    },
    selectBlacksmithSlot(index) {
      if (this.s.phase !== Phase.BLACKSMITH) return false;
      if (index < 0 || index > 2) return false;
      this.s.blacksmithSelectedSlot = index;
      this.emit('blacksmithSelect', '选中铁匠铺槽位', { index });
      return true;
    },
    buyBlacksmithSlot(index) {
      if (this.s.phase !== Phase.BLACKSMITH) return { ok: false, message: '不在铁匠铺' };
      const room = this.currentRoom();
      this._ensureBlacksmithSlots(room);
      if (index < 0 || index > 2) return { ok: false, message: '无效槽位' };
      const itemName = room.blacksmithSlots[index];
      if (!itemName) return { ok: false, message: 'sold-out' };
      const need = this._accessoryTradeCost(itemName);
      if (!need.length) return { ok: false, message: '无法交易' };
      const check = this._canAddItem(itemName);
      if (!check.ok) {
        this.emit('buyFail', check.message, { itemName, reason: check.reason });
        return { ok: false, reason: check.reason, message: check.message };
      }
      if (!this.s.currency.canPayBeastCost(need)) {
        this.emit('buyFail', '兽元不足', { itemName, reason: 'beast' });
        return { ok: false, message: '兽元不足，需要：' + this._beastTradeCostText(need) + '（万能可替代）' };
      }
      this.s.currency.payBeastCost(need);
      if (!this.addItem(itemName)) {
        const refund = this._countTokensFromCost(need);
        this.s.currency.addTokens(refund);
        return { ok: false, message: '无法获得配饰' };
      }
      const def = window.AdventureRegistry.getItem(itemName);
      room.blacksmithSlots[index] = null;
      this.s.blacksmithSelectedSlot = index;
      this._log('兑换配饰：' + (def ? def.displayName : itemName) + '（' + this._beastTradeCostText(need) + '）');
      this.emit('buy', '兑换成功', { itemName, kind: 'accessory', slot: index, beastCost: need.slice() });
      return { ok: true };
    },
    _countTokensFromCost(needed) {
      const map = {};
      if (!Array.isArray(needed)) return map;
      for (const t of needed) map[t] = (map[t] || 0) + 1;
      return map;
    },
    refreshBlacksmithSlot(index) {
      if (this.s.phase !== Phase.BLACKSMITH) return { ok: false, message: '不在铁匠铺' };
      const room = this.currentRoom();
      this._ensureBlacksmithSlots(room);
      if (index < 0 || index > 2) return { ok: false, message: '无效槽位' };
      const price = 2;
      if (!this.s.currency.spendGold(price)) {
        this.emit('buyFail', '金币不足', { reason: 'refresh', price });
        return { ok: false, message: '金币不足（需要' + price + '）' };
      }
      const itemName = this._rollBlacksmithSlot();
      room.blacksmithSlots[index] = itemName;
      this.s.blacksmithSelectedSlot = index;
      const def = itemName ? window.AdventureRegistry.getItem(itemName) : null;
      this._log('刷新铁匠铺槽位' + (index + 1) + '：' + (def ? def.displayName : '空'));
      this.emit('blacksmithRefresh', '刷新铁匠铺槽位', { slot: index, itemName, price, gold: this.s.currency.gold });
      return { ok: true, itemName };
    },
    recycleAccessory(index) {
      if (this.s.phase !== Phase.BLACKSMITH) return { ok: false, message: '不在铁匠铺' };
      if (index < 0 || index >= this.s.accessories.length) return { ok: false, message: '无效配饰' };
      const itemName = this.s.accessories[index];
      const def = window.AdventureRegistry.getItem(itemName);
      if (!def) return { ok: false, message: '未知配饰' };
      this.s.accessories.splice(index, 1);
      if (def.statBonus && def.statBonus.maxHp) {
        this.s.player.maxHp = Math.max(1, this.s.player.maxHp - def.statBonus.maxHp);
        this.s.player.hp = Math.min(this.s.player.hp, this.s.player.maxHp);
      }
      this._syncBeastCap();
      const refundGold = 10;
      this.s.currency.addGold(refundGold);
      this._log('回收配饰：' + def.displayName + '（获得' + refundGold + '金币）');
      this.emit('recycle', '回收配饰', { itemName, gold: refundGold, totalGold: this.s.currency.gold });
      return { ok: true };
    },
    leaveBlacksmith() {
      if (this.s.phase !== Phase.BLACKSMITH) return;
      const room = this.currentRoom();
      if (room) room.visited = true;
      this.s.blacksmithSelectedSlot = null;
      this.s.phase = Phase.MAP;
      this.emit('blacksmithLeave', '离开铁匠铺', {});
    },
    _isShopConsumableName(itemName) {
      if (!itemName || typeof itemName !== 'string') return false;
      const def = window.AdventureRegistry.getItem(itemName);
      return !!(def && (def.kind === 'consumable' || def.kind === 'trophyWhite'));
    },
    _isShopAccessoryName(itemName) {
      if (!itemName || typeof itemName !== 'string') return false;
      const def = window.AdventureRegistry.getItem(itemName);
      return !!(def && def.kind === 'accessory');
    },
    _sanitizeShopSlot(slot, index) {
      if (this._isShopBeastSlot(index)) {
        if (!slot) return null;
        if (slot.kind === 'beast' && slot.beastType) {
          return { kind: 'beast', beastType: slot.beastType };
        }
        return this._rollBeastShopOffer();
      }
      if (this._isShopAccessorySlot(index)) {
        if (!slot) return null;
        if (typeof slot === 'string' && this._isShopAccessoryName(slot)) return slot;
        return this._rollAccessoryDrop();
      }
      if (!slot) return null;
      if (typeof slot === 'string') {
        return this._isShopConsumableName(slot) ? slot : this._rollItemDrop();
      }
      return this._rollItemDrop();
    },
    _initShopSlots(room) {
      room.shopSlots = [
        this._rollItemDrop(),
        this._rollItemDrop(),
        this._rollItemDrop(),
        this._rollBeastShopOffer(),
        this._rollBeastShopOffer(),
        this._rollAccessoryDrop()
      ];
    },
    _migrateShopSlots(room) {
      const slots = room.shopSlots.slice(0, SHOP_SLOT_COUNT);
      while (slots.length < SHOP_SLOT_COUNT) slots.push(null);
      room.shopSlots = slots.map((slot, index) => this._sanitizeShopSlot(slot, index));
    },
    _ensureShopSlots(room, migrate) {
      if (!room) return;
      if (!Array.isArray(room.shopSlots) || !room.shopSlots.length) {
        this._initShopSlots(room);
        return;
      }
      if (migrate) this._migrateShopSlots(room);
    },
    _isShopBeastSlot(index) { return index === 3 || index === 4; },
    _isShopAccessorySlot(index) { return index === 5; },
    _isShopItemSlot(index) { return index >= 0 && index <= 2; },
    _shopBeastPrice(beastType) {
      return beastType === 'wuneng' ? 4 : 2;
    },
    _rollBeastShopOffer() {
      const types = window.AdventureCurrency.ALL_BEAST_TYPES;
      const beastType = types[Math.floor(Math.random() * types.length)];
      return { kind: 'beast', beastType };
    },
    _rollAccessoryDrop() {
      const accessories = window.AdventureRegistry.itemsByKind('accessory');
      if (!accessories.length) return null;
      const owned = this.s.accessories || [];
      const available = accessories.filter(it => {
        if (!it.maxStacks) return true;
        let count = 0;
        for (const a of owned) if (a === it.name) count++;
        return count < it.maxStacks;
      });
      if (!available.length) return null;
      return available[Math.floor(Math.random() * available.length)].name;
    },
    _shopSlotPrice(index, slot) {
      if (!slot) return 0;
      if (this._isShopBeastSlot(index) || (slot && slot.kind === 'beast')) {
        return this._shopBeastPrice(slot.beastType);
      }
      if (this._isShopAccessorySlot(index) || this._isShopAccessoryName(slot)) {
        return SHOP_ACCESSORY_PRICE;
      }
      const def = typeof slot === 'string' ? window.AdventureRegistry.getItem(slot) : null;
      return (def && def.price) || 0;
    },
    buy(itemName, price) {
      if (this.s.phase !== Phase.SHOP) return false;
      const room = this.currentRoom();
      this._ensureShopSlots(room);
      const slots = room.shopSlots || [];
      const idx = slots.indexOf(itemName);
      if (idx < 0) {
        this._log('商店中没有该商品');
        this.emit('buyFail', '无此商品', { itemName, reason: 'missing' });
        return false;
      }
      return this.buyShopSlot(idx).ok;
    },
    selectShopSlot(index) {
      if (this.s.phase !== Phase.SHOP) return false;
      if (index < 0 || index >= SHOP_SLOT_COUNT) return false;
      this.s.shopSelectedSlot = index;
      this.emit('shopSelect', '选中商店槽位', { index });
      return true;
    },
    buyShopSlot(index, opts) {
      const force = !!(opts && opts.force);
      if (this.s.phase !== Phase.SHOP) return { ok: false, message: '不在商店' };
      const room = this.currentRoom();
      this._ensureShopSlots(room);
      if (index < 0 || index >= SHOP_SLOT_COUNT) return { ok: false, message: '无效槽位' };
      const slot = room.shopSlots[index];
      if (!slot) return { ok: false, message: 'sold-out' };

      const price = this._shopSlotPrice(index, slot);

      if (slot.kind === 'beast') {
        const beastType = slot.beastType;
        const label = window.AdventureCurrency.BEAST_LABEL[beastType] || beastType;
        if (!this.s.currency.canAdd(1) && !force) {
          this.emit('buyFail', '兽元已满', { beastType, reason: 'full' });
          return { ok: false, reason: 'beastFull', message: '兽元栏已满' };
        }
        if (!this.s.currency.spendGold(price)) {
          this._log('金币不足，无法购买');
          this.emit('buyFail', '金币不足', { beastType, price, gold: this.s.currency.gold });
          return { ok: false, message: '金币不足（需要' + price + '）' };
        }
        const offered = {};
        offered[beastType] = 1;
        this.s.currency.addTokens(offered);
        room.shopSlots[index] = null;
        this.s.shopSelectedSlot = index;
        this._log('购买 ' + label + '，花费 ' + price + ' 金币');
        this.emit('buy', '购买成功', { kind: 'beast', beastType, price, slot: index, gold: this.s.currency.gold });
        if (this.s.currency.overflowAfter(0) > 0) {
          this.s.beastDiscardReturnPhase = Phase.SHOP;
          this._checkBeastOverflow(room);
        }
        return { ok: true };
      }

      const itemName = slot;
      const def = window.AdventureRegistry.getItem(itemName);
      if (!def) {
        return { ok: false, message: '无效商品' };
      }
      if (def.kind === 'accessory') {
        const check = this._canAddItem(itemName);
        if (!check.ok) {
          this.emit('buyFail', check.message, { itemName, reason: check.reason });
          return { ok: false, reason: check.reason, message: check.message };
        }
        if (!this.s.currency.spendGold(price)) {
          this._log('金币不足，无法购买');
          this.emit('buyFail', '金币不足', { itemName, price, gold: this.s.currency.gold });
          return { ok: false, message: '金币不足（需要' + price + '）' };
        }
        if (!this.addItem(itemName)) {
          this.s.currency.addGold(price);
          return { ok: false, message: '无法获得配饰' };
        }
        room.shopSlots[index] = null;
        this.s.shopSelectedSlot = index;
        this._log('购买配饰 ' + def.displayName + '，花费 ' + price + ' 金币');
        this.emit('buy', '购买成功', { itemName, kind: 'accessory', price, slot: index, gold: this.s.currency.gold });
        return { ok: true };
      }
      if (def.kind !== 'consumable' && def.kind !== 'trophyWhite') {
        if (this._isShopItemSlot(index)) room.shopSlots[index] = this._rollItemDrop();
        else if (this._isShopAccessorySlot(index)) room.shopSlots[index] = this._rollAccessoryDrop();
        this.emit('buyFail', '不可购买', { itemName, reason: 'invalid' });
        return { ok: false, message: '不可购买' };
      }
      if (!this.s.currency.spendGold(price)) {
        this._log('金币不足，无法购买');
        this.emit('buyFail', '金币不足', { itemName, price, gold: this.s.currency.gold });
        return { ok: false, message: '金币不足（需要' + price + '）' };
      }
      if (!this.addItem(itemName)) {
        this.s.currency.addGold(price);
        this.emit('buyFail', '道具槽已满', { itemName, reason: 'full' });
        return { ok: false, message: '道具槽已满' };
      }
      room.shopSlots[index] = null;
      this.s.shopSelectedSlot = index;
      this._log('购买 ' + (def ? def.displayName : itemName) + '，花费 ' + price + ' 金币');
      this.emit('buy', '购买成功', { itemName, price, slot: index, gold: this.s.currency.gold });
      return { ok: true };
    },
    refreshShopSlot(index) {
      if (this.s.phase !== Phase.SHOP) return { ok: false, message: '不在商店' };
      const room = this.currentRoom();
      this._ensureShopSlots(room);
      if (index < 0 || index >= SHOP_SLOT_COUNT) return { ok: false, message: '无效槽位' };
      if (this._isShopBeastSlot(index)) {
        return { ok: false, message: '兽元槽不可刷新' };
      }

      const price = SHOP_REFRESH_COST;
      if (!this.s.currency.spendGold(price)) {
        this._log('金币不足，无法刷新');
        this.emit('buyFail', '金币不足', { action: 'refresh', price, gold: this.s.currency.gold });
        return { ok: false, message: '金币不足（需要' + price + '）' };
      }
      const itemName = this._isShopAccessorySlot(index) ? this._rollAccessoryDrop() : this._rollItemDrop();
      room.shopSlots[index] = itemName;
      this.s.shopSelectedSlot = index;
      const def = itemName ? window.AdventureRegistry.getItem(itemName) : null;
      this._log('刷新商店槽位' + (index + 1) + '：' + (def ? def.displayName : '空') + '（-' + price + '金币）');
      this.emit('shopRefresh', '刷新商店槽位', { slot: index, itemName, price, gold: this.s.currency.gold });
      return { ok: true, itemName };
    },
    _applyWisdomNecklaceDraw() {
      if (!this.hasAccessory('WisdomNecklace') || !this.s.playerPile) return;
      const def = window.AdventureRegistry.getItem('WisdomNecklace');
      const n = (def && def.onCombatWinDraw) || 2;
      const drawn = this.s.playerPile.draw(n);
      this._log('智慧项链：补' + drawn.length + '张牌');
      this.emit('accessory', '智慧项链补牌', { itemName: 'WisdomNecklace', drawn: drawn.length });
    },
    leaveShop() {
      if (this.s.phase !== Phase.SHOP) return;
      const room = this.currentRoom();
      if (room) room.visited = true;
      this.s.shopSelectedSlot = null;
      this.s.phase = Phase.MAP;
      this.emit('shopLeave', '离开商店', {});
    }
  });
})();

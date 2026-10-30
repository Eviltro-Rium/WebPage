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
  const random = () => window.FurryGame && window.FurryGame.CombatRuntime
    ? window.FurryGame.CombatRuntime.random() : Math.random();
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
        trophySlots: room.blacksmithTrophySlots.slice(),
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
      // undefined means this room has never been stocked (or comes from an
      // older save); null is an intentionally sold-out slot and must persist.
      if (!Array.isArray(room.blacksmithTrophySlots)) {
        const legacy = room.blacksmithTrophySlot;
        room.blacksmithTrophySlots = [legacy];
      }
      for (let i = 0; i < 3; i++) {
        const offer = room.blacksmithTrophySlots[i];
        if (offer === undefined || offer !== null && !this._isForgeTrophy(offer)) {
          room.blacksmithTrophySlots[i] = this._rollTrophyWhiteSlot();
        }
      }
      room.blacksmithTrophySlots.length = 3;
    },
    _isForgeTrophy(itemName) {
      const def = window.AdventureRegistry.getItem(itemName);
      return !!(def && def.kind === 'trophyWhite' && (def.trophyKind === 'forge' || def.trophyKind === 'both'));
    },
    _forgeTrophyPool() {
      return window.AdventureRegistry.allItems().filter(item =>
        item.kind === 'trophyWhite' && (item.trophyKind === 'forge' || item.trophyKind === 'both')
      );
    },
    _rollTrophyWhiteSlot() {
      const trophies = this._forgeTrophyPool();
      if (!trophies.length) return null;
      return trophies[Math.floor(random() * trophies.length)].name;
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
        trophyKind: def.trophyKind || null,
        name: itemName,
        displayName: def.displayName,
        description: def.description,
        icon: def.icon,
        beastCost,
        beastCostText: this._beastTradeCostText(beastCost),
        refreshable: true
      };
    },
    buyBlacksmithTrophy(index = 0, opts) {
      if (index && typeof index === 'object') { opts = index; index = 0; }
      if (this.s.phase !== Phase.BLACKSMITH) return { ok: false, message: '不在铁匠铺' };
      if (!Number.isInteger(index) || index < 0 || index > 2) return { ok: false, message: '无效槽位' };
      const room = this.currentRoom();
      this._ensureBlacksmithSlots(room);
      const itemName = room && room.blacksmithTrophySlots[index];
      if (!itemName) return { ok: false, message: 'sold-out' };
      const def = window.AdventureRegistry.getItem(itemName);
      if (!def || def.kind !== 'trophyWhite' || (def.trophyKind !== 'forge' && def.trophyKind !== 'both')) {
        return { ok: false, message: '无效战利白卡' };
      }
      const need = Array.isArray(def.beastTradeCost) ? def.beastTradeCost.slice() : [];
      if (!this.s.currency.canPayBeastCost(need)) {
        return { ok: false, message: '兽元不足，需要：' + this._beastTradeCostText(need) };
      }
      const payment = opts && opts.beastPayment;
      const pay = this._applyBeastPayment(need, { kind: 'blacksmithTrophy', index, itemName }, payment || null);
      if (!pay.ok) {
        if (pay.needBeastChoice) return pay;
        return { ok: false, message: pay.message || ('兽元不足，需要：' + this._beastTradeCostText(need)) };
      }
      return this._completeBlacksmithTrophyBuy(itemName, need, pay.spend, index);
    },
    _completeBlacksmithTrophyBuy(itemName, need, spend, index = 0) {
      const room = this.currentRoom();
      const def = window.AdventureRegistry.getItem(itemName);
      if (!def || def.kind !== 'trophyWhite' || (def.trophyKind !== 'forge' && def.trophyKind !== 'both')) {
        if (spend) this.s.currency.addTokens(spend);
        return { ok: false, message: '无效战利白卡' };
      }
      if (!room || !room.blacksmithTrophySlots || room.blacksmithTrophySlots[index] !== itemName) {
        if (spend) this.s.currency.addTokens(spend);
        return { ok: false, message: 'sold-out' };
      }
      if (!this.addItem(itemName)) {
        if (spend) this.s.currency.addTokens(spend);
        else this.s.currency.addTokens(this._countTokensFromCost(need));
        return { ok: false, message: '无法获得战利白卡' };
      }
      room.blacksmithTrophySlots[index] = null;
      this.s.blacksmithSelectedSlot = index === 0 ? 'trophy' : 'trophy:' + index;
      this._log('锻造战利白卡：' + def.displayName + '（' + this._beastTradeCostText(need) + '）');
      this.emit('buy', '锻造战利白卡成功', { itemName, kind: 'trophyWhite', beastCost: need.slice(), payment: spend || null });
      return { ok: true };
    },
    refreshBlacksmithTrophy(index = 0) {
      if (this.s.phase !== Phase.BLACKSMITH) return { ok: false, message: '不在铁匠铺' };
      if (!Number.isInteger(index) || index < 0 || index > 2) return { ok: false, message: '无效槽位' };
      const room = this.currentRoom();
      this._ensureBlacksmithSlots(room);
      const price = 2;
      if (!this.s.currency.spendGold(price)) return { ok: false, message: '金币不足（需要2）' };
      room.blacksmithTrophySlots[index] = this._rollTrophyWhiteSlot();
      this.s.blacksmithSelectedSlot = index === 0 ? 'trophy' : 'trophy:' + index;
      this.emit('blacksmithRefresh', '刷新战利白卡摊位', { slot: index, trophy: room.blacksmithTrophySlots[index], price, gold: this.s.currency.gold });
      return { ok: true, itemName: room.blacksmithTrophySlots[index] };
    },
    selectBlacksmithSlot(index) {
      if (this.s.phase !== Phase.BLACKSMITH) return false;
      if (index < 0 || index > 2) return false;
      this.s.blacksmithSelectedSlot = index;
      this.emit('blacksmithSelect', '选中铁匠铺槽位', { index });
      return true;
    },
    buyBlacksmithSlot(index, opts) {
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
      const payment = opts && opts.beastPayment;
      const pay = this._applyBeastPayment(need, { kind: 'blacksmithSlot', index, itemName }, payment || null);
      if (!pay.ok) {
        if (pay.needBeastChoice) return pay;
        return { ok: false, message: pay.message || ('兽元不足，需要：' + this._beastTradeCostText(need) + '（万能可替代）') };
      }
      return this._completeBlacksmithSlotBuy(index, itemName, need, pay.spend);
    },
    _completeBlacksmithSlotBuy(index, itemName, need, spend) {
      const room = this.currentRoom();
      if (!room || !Array.isArray(room.blacksmithSlots) || room.blacksmithSlots[index] !== itemName) {
        if (spend) this.s.currency.addTokens(spend);
        return { ok: false, message: 'sold-out' };
      }
      const check = this._canAddItem(itemName);
      if (!check.ok) {
        if (spend) this.s.currency.addTokens(spend);
        this.emit('buyFail', check.message, { itemName, reason: check.reason });
        return { ok: false, reason: check.reason, message: check.message };
      }
      if (!this.addItem(itemName)) {
        if (spend) this.s.currency.addTokens(spend);
        else this.s.currency.addTokens(this._countTokensFromCost(need));
        return { ok: false, message: '无法获得配饰' };
      }
      const def = window.AdventureRegistry.getItem(itemName);
      room.blacksmithSlots[index] = null;
      this.s.blacksmithSelectedSlot = index;
      this._log('兑换配饰：' + (def ? def.displayName : itemName) + '（' + this._beastTradeCostText(need) + '）');
      this.emit('buy', '兑换成功', { itemName, kind: 'accessory', slot: index, beastCost: need.slice(), payment: spend || null });
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
      this._syncHandLimit();
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
      if (this.s.pendingBeastPayment) this.s.pendingBeastPayment = null;
      this.s.phase = Phase.MAP;
      this.emit('blacksmithLeave', '离开铁匠铺', {});
    },
    _isShopConsumableName(itemName) {
      if (!itemName || typeof itemName !== 'string') return false;
      const def = window.AdventureRegistry.getItem(itemName);
      return !!(def && def.kind === 'consumable');
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
        const def = window.AdventureRegistry.getItem(slot);
        return (def && def.kind === 'consumable') ? slot : this._rollConsumableDrop();
      }
      return this._rollConsumableDrop();
    },
    _initShopSlots(room) {
      // 商店固定为：3 道具 + 2 兽元 + 1 配饰。战利白卡只从怪物掉落或铁匠铺获得。
      room.shopSlots = [
        this._rollConsumableDrop(),
        this._rollConsumableDrop(),
        this._rollConsumableDrop(),
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
    _rollConsumableDrop() {
      const consumables = window.AdventureRegistry.itemsByKind('consumable');
      if (!consumables.length) return null;
      return consumables[Math.floor(random() * consumables.length)].name;
    },
    _shopBeastPrice(beastType) {
      const base = beastType === 'wuneng' ? 4 : 2;
      return this._applyShopDiscount(base);
    },
    _hasShopDiscount() {
      return typeof this.hasAccessory === 'function' && this.hasAccessory('Coupon');
    },
    _applyShopDiscount(price) {
      if (this._hasShopDiscount() && price > 0) return Math.ceil(price / 2);
      return price;
    },
    _rollBeastShopOffer() {
      const types = window.AdventureCurrency.ALL_BEAST_TYPES;
      const beastType = types[Math.floor(random() * types.length)];
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
      return available[Math.floor(random() * available.length)].name;
    },
    _shopSlotPrice(index, slot) {
      if (!slot) return 0;
      if (this._isShopBeastSlot(index) || (slot && slot.kind === 'beast')) {
        return this._shopBeastPrice(slot.beastType);
      }
      if (this._isShopAccessorySlot(index) || this._isShopAccessoryName(slot)) {
        return this._applyShopDiscount(SHOP_ACCESSORY_PRICE);
      }
      const def = typeof slot === 'string' ? window.AdventureRegistry.getItem(slot) : null;
      return this._applyShopDiscount((def && def.price) || 0);
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
      if (def.kind !== 'consumable') {
        if (this._isShopItemSlot(index)) room.shopSlots[index] = this._rollConsumableDrop();
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
      const itemName = this._isShopAccessorySlot(index)
        ? this._rollAccessoryDrop()
        : this._rollConsumableDrop();
      room.shopSlots[index] = itemName;
      this.s.shopSelectedSlot = index;
      const def = itemName ? window.AdventureRegistry.getItem(itemName) : null;
      this._log('刷新商店槽位' + (index + 1) + '：' + (def ? def.displayName : '空') + '（-' + price + '金币）');
      this.emit('shopRefresh', '刷新商店槽位', { slot: index, itemName, price, gold: this.s.currency.gold });
      return { ok: true, itemName };
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

(function (global) {
  const AC = global.AdventureCurrency;
  const BUFF_ICON_DIR = '../icons/buff_icons/';
  const runtime = global.FurryGame && global.FurryGame.CombatRuntime;
  const schedule = (fn, ms) => runtime ? runtime.schedule(null, fn, ms) : setTimeout(fn, ms);

  class AdventureUIPanelViewMethods {
    _stashedLootIconSrc(loot) {
      if (!loot) return null;
      if (loot.kind === 'gold') return AC.GOLD_ICON;
      if (loot.kind === 'beast') return AC.BEAST_ICON[loot.beastType] || null;
      if (loot.kind === 'accessory') {
        const def = window.AdventureRegistry && window.AdventureRegistry.getItem(loot.accessory || loot.item);
        return def && def.icon ? def.icon : null;
      }
      if (loot.kind === 'items') {
        const first = loot.items && loot.items[0];
        const def = first && window.AdventureRegistry && window.AdventureRegistry.getItem(first);
        return def && def.icon ? def.icon : null;
      }
      if (loot.kind === 'item') {
        const def = window.AdventureRegistry && window.AdventureRegistry.getItem(loot.item);
        return def && def.icon ? def.icon : null;
      }
      return null;
    }
    
    _stashedLootLabel(loot) {
      if (!loot) return '';
      if (loot.kind === 'gold') return loot.gold + ' 金币';
      if (loot.kind === 'beast') return (AC.BEAST_LABEL[loot.beastType] || loot.beastType) + ' ×1';
      if (loot.kind === 'accessory') {
        const def = window.AdventureRegistry && window.AdventureRegistry.getItem(loot.accessory || loot.item);
        return '配饰：' + (def ? def.displayName : (loot.accessory || loot.item));
      }
      if (loot.kind === 'items') {
        const list = loot.items || [];
        const names = list.map(n => {
          const def = window.AdventureRegistry && window.AdventureRegistry.getItem(n);
          return def ? def.displayName : n;
        });
        return names.length ? ('道具：' + names.join('、')) : '道具';
      }
      if (loot.kind === 'item') {
        const def = window.AdventureRegistry && window.AdventureRegistry.getItem(loot.item);
        return def ? def.displayName : loot.item;
      }
      return '无';
    }
    
    _trophyCardMarkup(name, width = 54, height = 78) {
      return '<span class="adv-scene-trophy-card" data-trophy-card="' + name + '" data-trophy-card-width="' + width + '" data-trophy-card-height="' + height + '"></span>';
    }
    
    _mountTrophyCards(root) {
      if (!root || !window.renderCard || !window.AdventureDeck) return;
      root.querySelectorAll('[data-trophy-card]').forEach(slot => {
        const card = window.AdventureDeck.trophyWhite(slot.getAttribute('data-trophy-card'));
        const width = Number(slot.getAttribute('data-trophy-card-width')) || 54;
        const height = Number(slot.getAttribute('data-trophy-card-height')) || 78;
        const canvas = window.renderCard(card, width, height, false);
        canvas.classList.add('adv-scene-trophy-card-canvas');
        slot.replaceWith(canvas);
      });
    }
    
    _roomRewardRowHtml(loot) {
      if (!loot) return '<div class="adv-settle-row">无奖励</div>';
      if (loot.kind === 'gold') {
        return '<div class="adv-settle-row"><img src="' + AC.GOLD_ICON + '" class="adv-settle-icon" alt="金币">金币 ×' + loot.gold + '</div>';
      }
      if (loot.kind === 'accessory') {
        const def = window.AdventureRegistry && window.AdventureRegistry.getItem(loot.accessory || loot.item);
        const icon = def && def.icon ? '<img src="' + def.icon + '" class="adv-settle-icon" alt="">' : '';
        return '<div class="adv-settle-row">' + icon + '配饰：' + (def ? def.displayName : loot.accessory) + '</div>';
      }
      if (loot.kind === 'items' || loot.kind === 'item') {
        const list = loot.items || (loot.item ? [loot.item] : []);
        if (!list.length) return '<div class="adv-settle-row">道具：无</div>';
        return list.map(n => {
          const def = window.AdventureRegistry && window.AdventureRegistry.getItem(n);
          const isTrophy = def && def.kind === 'trophyWhite';
          const icon = isTrophy ? this._trophyCardMarkup(n, 48, 70) : (def && def.icon ? '<img src="' + def.icon + '" class="adv-settle-icon" alt="">' : '');
          return '<div class="adv-settle-row' + (isTrophy ? ' adv-settle-trophy-row' : '') + '">' + icon + (isTrophy ? '战利白卡：' : '道具：') + (def ? def.displayName : n) + '</div>';
        }).join('');
      }
      return '<div class="adv-settle-row">' + this._stashedLootLabel(loot) + '</div>';
    }
    
    _buildRewardPage(snap) {
      const page = document.createElement('div');
      page.className = 'adv-reward-page';
      const loot = snap.pendingRoomReward;
      const isStashed = !!(snap.roomInfo && snap.roomInfo.stashedLoot);
      page.innerHTML =
        '<div class="adv-reward-page-title">奖励房间</div>' +
        '<div class="adv-settle-section-title">' + (isStashed ? '待领奖励' : '本次奖励') + '</div>' +
        '<div class="adv-settle-rewards">' + this._roomRewardRowHtml(loot) + '</div>' +
        '<div class="adv-shop-page-actions">' +
          '<button class="adv-btn adv-btn-primary" id="adv-room-claim">领取</button>' +
          '<button class="adv-btn" id="adv-room-defer">留在房间</button>' +
        '</div>';
      this._mountTrophyCards(page);
      return page;
    }
    
    _roomStatusMarkup(snap) {
      if (!snap || !snap.roomInfo) return '';
      const ri = snap.roomInfo;
      let roomStatus = '';
      if (ri.cleared) roomStatus += '已清除 ';
      if (ri.stashedLoot) roomStatus += '有待领奖励 ';
      else if (ri.rewardClaimed) roomStatus += '奖励已领 ';
      if (ri.beastTokenClaimed) roomStatus += '兽元已领';
      let html = '';
      if (roomStatus) html += '<div class="adv-room-status">' + roomStatus + '</div>';
      if (ri.stashedLoot && snap.phase === window.AdventurePhase.REWARD && !snap.pendingRoomReward) {
        html += '<div class="adv-stashed-loot">待领：' + this._stashedLootLabel(ri.stashedLoot) + '</div>';
      }
      return html;
    }

    _buildSidebar(snap) {
      const side = document.createElement('div');
      side.className = 'adventure-sidebar';
      const p = snap.player;
      const hpPct = Math.round(100 * p.hp / p.maxHp);
    
      let html = '<div class="adv-player-row"><div class="adv-card">' +
        '<div class="adv-char-name">' + p.name + '<span class="adv-char-type">' + p.type + '</span></div>' +
        '<div class="adv-hp-bar"><div class="adv-hp-fill" style="width:' + hpPct + '%"></div><span class="adv-hp-text">' + p.hp + '/' + p.maxHp + '</span></div>' +
        this._buildBuffBar(snap) +
        '<div class="adv-currency"><img src="' + AC.GOLD_ICON + '" class="adv-gold-icon" alt="金币"><b>' + snap.currency.gold + '</b></div>' +
        this._buildBeastTokenDisplay(snap) +
        this._buildItemPanel(snap) +
        this._buildTrophyBackpack(snap) +
        this._buildAccessoryPanel(snap);
    
      if (snap.playerPile) {
        const totalCount = Number(snap.playerPile.totalCount) ||
          snap.playerPile.deckCount + snap.playerPile.handCount + snap.playerPile.discardCount;
        html += '<div class="adv-deck-info" title="牌库、手牌与弃牌库合计为玩家当前全部牌张">' +
          '牌库' + snap.playerPile.deckCount +
          ' | 手牌' + snap.playerPile.handCount +
          ' | 弃牌' + snap.playerPile.discardCount +
          ' <span class="adv-deck-total">（合计' + totalCount + '）</span></div>';
        html += '<div class="adv-hand-zone" id="adv-hand-zone"></div>';
      }
      html += '</div></div>';
    
      html += this._roomStatusMarkup(snap);
    
    
      html += '<div class="adv-actions">' + this._buildActions(snap) + '</div>';
      side.innerHTML = html;
    
      const handZone = side.querySelector('#adv-hand-zone');
      if (handZone && snap.playerPile && snap.playerPile.hand) {
        const cw = window.CARD_W || 70, ch = window.CARD_H || 100;
        const paintHand = () => {
          handZone.innerHTML = '';
          for (const card of snap.playerPile.hand) {
            const cv = window.renderCard(card, cw, ch, false);
            cv.classList.add('disabled');
            handZone.appendChild(cv);
          }
        };
        const animatePendingEffect = () => {
          if (!this._pendingMapReturnEffect) return;
          const effect = this._pendingMapReturnEffect;
          this._pendingMapReturnEffect = null;
          // Let the map/sidebar finish mounting before applying transforms.
          schedule(() => this._animateMapReturnEffects(effect), 30);
        };
        paintHand();
        if (window.cardIconsReady) {
          window.cardIconsReady.then(() => {
            if (side.isConnected && side.querySelector('#adv-hand-zone') === handZone) {
              paintHand();
              animatePendingEffect();
            }
          });
        } else {
          animatePendingEffect();
        }
      }
    
      return side;
    }
    
    _buildBuffBar(snap) {
      const b = snap.player.buffs;
      if (!b) return '';
      const items = [];
      const icon = (kind, label) => '<img class="adv-buff-icon" src="' + BUFF_ICON_DIR + kind + '.webp" alt="' + label + '">';
      if (b.burn > 0)      items.push('<span class="adv-buff adv-buff-burn" title="灼烧">' + icon('burn', '灼烧') + '×' + b.burn + '</span>');
      if (b.bleed > 0)     items.push('<span class="adv-buff adv-buff-bleed" title="流血">' + icon('bleed', '流血') + '×' + b.bleed + '</span>');
      if (b.poison > 0)    items.push('<span class="adv-buff adv-buff-poison" title="中毒">' + icon('poison', '中毒') + '×' + b.poison + '</span>');
      if (b.thorns > 0)    items.push('<span class="adv-buff adv-buff-thorns" title="荆棘">' + icon('thorns', '荆棘') + '×' + b.thorns + '</span>');
      if (b.frozen)        items.push('<span class="adv-buff adv-buff-frozen" title="冷冻">' + icon('freeze', '冷冻') + '</span>');
      if (b.iceSeal > 0)   items.push('<span class="adv-buff" title="冰封">' + icon('ice_seal', '冰封') + '×' + b.iceSeal + '</span>');
      if (b.guard > 0)     items.push('<span class="adv-buff adv-buff-guard" title="守护">' + icon('guard', '守护') + '×' + b.guard + '</span>');
      if (b.fly > 0)       items.push('<span class="adv-buff adv-buff-fly" title="飞翔">' + icon('fly', '飞翔') + '×' + b.fly + '</span>');
      if (b.crit > 0)      items.push('<span class="adv-buff" title="暴击">' + icon('crit', '暴击') + '×' + b.crit + '</span>');
      if (b.chaos_red)     items.push('<span class="adv-buff adv-buff-chaos-red" title="混沌·红">' + icon('chaos_red', '混沌·红') + '</span>');
      if (b.chaos_yellow)  items.push('<span class="adv-buff adv-buff-chaos-yellow" title="混沌·黄">' + icon('chaos_yellow', '混沌·黄') + '</span>');
      if (b.chaos_blue)    items.push('<span class="adv-buff adv-buff-chaos-blue" title="混沌·蓝">' + icon('chaos_blue', '混沌·蓝') + '</span>');
      if (b.chaos_green)   items.push('<span class="adv-buff adv-buff-chaos-green" title="混沌·绿">' + icon('chaos_green', '混沌·绿') + '</span>');
      if (b.bloodthirst)   items.push('<span class="adv-buff adv-buff-bloodthirst" title="嗜血">嗜血</span>');
      if (!items.length) return '';
      return '<div class="adv-buff-bar">' + items.join('') + '</div>';
    }
    
    _buildBeastTokenDisplay(snap) {
      const t = snap.currency.tokens;
      const total = snap.currency.totalBeast;
      const max = snap.currency.maxBeast;
      const types = AC.ALL_BEAST_TYPES;
      const items = types.map(k =>
        '<span class="adv-beast-token adv-beast-' + k + '" title="' + AC.BEAST_LABEL[k] + '">' +
        '<img src="' + AC.BEAST_ICON[k] + '" class="adv-beast-icon" alt="' + AC.BEAST_LABEL[k] + '">' +
        '<span class="adv-beast-count">×' + t[k] + '</span></span>'
      );
      return '<div class="adv-beast-bar">' +
        '<span class="adv-beast-total">' + total + '/' + max + '</span>' +
        items.join('') +
      '</div>';
    }
    
    _buildItemPanel(snap) {
      let html = '';
    
      const consumables = snap.consumables || [];
      const slots = snap.consumableSlots || 6;
      const onMap = !this._isCombatPhase(snap.phase);
      const cells = [];
      for (let i = 0; i < slots; i++) {
        const item = consumables[i];
        if (item) {
          const scene = item.useScene || 'combat';
          const canUse = onMap
            ? (scene === 'map' || scene === 'both')
            : (scene === 'combat' || scene === 'both');
          const useBtn = canUse
            ? '<button class="adv-item-use-btn" data-use-index="' + i + '">使用</button>'
            : '<div class="adv-item-scene-hint">' + (scene === 'combat' ? '仅对战可用' : '仅地图可用') + '</div>';
          const tip = item.displayName + ' — ' + item.description;
          const icon = item.icon
            ? '<img class="adv-item-icon" src="' + item.icon + '" alt="' + item.displayName + '">'
            : '';
          cells.push('<div class="adv-item-slot filled" title="' + tip + '">' +
            icon +
            '<div class="adv-item-name">' + item.displayName + '</div>' +
            useBtn + '</div>');
        } else {
          cells.push('<div class="adv-item-slot empty"></div>');
        }
      }
      html += '<div class="adv-item-section"><div class="adv-item-title">道具 (' + consumables.length + '/' + slots + ')</div><div class="adv-item-grid">' + cells.join('') + '</div></div>';
    
      return html;
    }
    
    _buildItemDiscardPage(snap) {
      const page = document.createElement('div');
      page.className = 'adv-reward-page';
      const items = snap.consumables || [];
      let html = '<div class="adv-reward-page-title">道具槽超过上限</div>';
      html += '<div class="adv-settle-section-title">请舍弃 ' + snap.pendingItemDiscard + ' 个道具（保留 ' + (snap.consumableSlots || 6) + ' 个）</div>';
      html += '<div class="adv-item-grid adv-item-discard-grid">';
      items.forEach((item, index) => {
        const icon = item.icon ? '<img class="adv-item-icon" src="' + item.icon + '" alt="' + item.displayName + '">' : '';
        html += '<button type="button" class="adv-item-slot filled adv-item-discard-slot" data-item-discard="' + index + '" title="丢弃 ' + item.displayName + '">' + icon + '<div class="adv-item-name">' + item.displayName + '</div><span class="adv-item-discard-label">丢弃</span></button>';
      });
      html += '</div>';
      page.innerHTML = html;
      return page;
    }
    
    _buildBossRewardPage(snap) {
      const page = document.createElement('div');
      page.className = 'adv-reward-page adv-boss-reward-page';
      const pending = snap.pendingCombatReward;
      const loot = pending && pending.stage === 'basic' && !pending.applied
        ? pending.basic
        : (snap.roomInfo && snap.roomInfo.stashedLoot);
      const hasLoot = !!loot && loot.kind !== 'none';
      page.innerHTML =
        '<div class="adv-reward-page-title">Boss战结算</div>' +
        '<div class="adv-settle-section-title">' + (hasLoot ? 'Boss奖励' : 'Boss已战胜') + '</div>' +
        '<div class="adv-settle-rewards">' + (hasLoot ? this._roomRewardRowHtml(loot) : '<div class="adv-settle-row">奖励已领取，可前往下一层</div>') + '</div>' +
        '<div class="adv-shop-page-actions">' +
          (hasLoot ? '<button class="adv-btn adv-btn-primary" id="adv-boss-claim">领取奖励</button>' : '') +
          '<button class="adv-btn" id="adv-boss-return-map">返回地图</button>' +
          '<button class="adv-btn adv-btn-primary" id="adv-next-stage">进入下一层</button>' +
        '</div>';
      this._mountTrophyCards(page);
      return page;
    }
    
    _buildTrophyBackpack(snap) {
      const cards = snap.trophyWhiteCards || [];
      return '<div class="adv-trophy-backpack-section">' +
        '<button type="button" class="adv-trophy-backpack-btn" id="adv-trophy-pack" title="查看和丢弃已获得的战利白卡">' +
        '<span class="adv-trophy-backpack-icon">◇</span><span>战利白卡背包</span><b>' + cards.length + '</b></button></div>';
    }
    
    _buildAccessoryPanel(snap) {
      const accessories = snap.accessories || [];
      if (!accessories.length) return '';
      const grouped = {};
      const order = [];
      for (const item of accessories) {
        const key = item && item.name;
        if (!key) continue;
        if (!grouped[key]) { grouped[key] = { item, count: 0 }; order.push(key); }
        grouped[key].count++;
      }
      if (!order.length) return '';
      const icons = order.map(name => {
        const g = grouped[name];
        const item = g.item;
        const tip = item.displayName + (g.count > 1 ? ' ×' + g.count : '') + ' — ' + (item.description || '');
        const icon = item.icon
          ? '<img class="adv-acc-col-icon" src="' + item.icon + '" alt="' + item.displayName + '">'
          : '<span class="adv-acc-col-noicon">' + (item.displayName || '?').charAt(0) + '</span>';
        const badge = g.count > 1 ? '<span class="adv-acc-col-stack">×' + g.count + '</span>' : '';
        return '<div class="adv-acc-col-slot" data-accessory-name="' + name + '" title="' + tip.replace(/"/g, '&quot;') + '">' + icon + badge + '</div>';
      });
      return '<div class="adv-acc-panel">' +
        '<div class="adv-acc-panel-label">配饰</div>' +
        '<div class="adv-acc-row">' + icons.join('') + '</div>' +
        '</div>';
    }
    
    _isCombatPhase(phase) {
      const Phase = window.AdventurePhase;
      return phase === Phase.COMBAT || phase === Phase.PLAYER_PLAY ||
        phase === Phase.PLAYER_DEFEND || phase === Phase.NPC_TURN;
    }
    
    _buildShopPage(snap) {
      const page = document.createElement('div');
      page.className = 'adv-shop-page';
      const slots = (snap.roomInfo && snap.roomInfo.shopSlots) || [null, null, null, null, null, null];
      const selected = snap.shopSelectedSlot;
      const gold = snap.currency.gold;
    
      let slotsHtml = '';
      for (let i = 0; i < 6; i++) {
        const item = slots[i];
        const isSel = selected === i;
        const isBeastSlot = i === 3 || i === 4;
        const isAccessorySlot = i === 5;
        let slotCls = '';
        if (isBeastSlot) slotCls += ' adv-shop-slot-beast';
        if (isAccessorySlot) slotCls += ' adv-shop-slot-accessory';
        if (item) {
          const price = item.price || 0;
          const tag = isBeastSlot ? '兽元' : (isAccessorySlot ? '配饰' : '道具');
          const icon = item.icon ? '<img class="adv-shop-slot-icon" src="' + item.icon + '" alt="">' : '';
          slotsHtml += '<button type="button" class="adv-shop-slot filled' + slotCls + (isSel ? ' selected' : '') + '" data-shop-slot="' + i + '" title="' + (item.description || '') + '">' +
            (tag ? '<div class="adv-shop-slot-tag">' + tag + '</div>' : '') +
            icon +
            '<div class="adv-shop-slot-name">' + item.displayName + '</div>' +
            '<div class="adv-shop-slot-desc">' + (item.description || '') + '</div>' +
            '<div class="adv-shop-slot-price">' + price + ' 金币</div>' +
            '</button>';
        } else {
          const tag = isBeastSlot ? '兽元' : (isAccessorySlot ? '配饰' : '道具');
          slotsHtml += '<button type="button" class="adv-shop-slot empty' + slotCls + (isSel ? ' selected' : '') + '" data-shop-slot="' + i + '">' +
            (tag ? '<div class="adv-shop-slot-tag">' + tag + '</div>' : '') +
            '<div class="adv-shop-slot-empty-label">sold-out</div>' +
            (isAccessorySlot ? '<div class="adv-shop-slot-hint">刷新可补货</div>' : '') +
            '</button>';
        }
      }
    
      const canBuy = selected != null && slots[selected];
      const selectedPrice = canBuy ? (slots[selected].price || 0) : 0;
      const isBeastSelected = selected === 3 || selected === 4;
      const canRefresh = selected != null && !isBeastSelected;
      const refreshCost = 2;
      const buyLabel = canBuy ? ('购买 · ' + selectedPrice + '金币') : '购买';
    
      page.innerHTML =
        '<div class="adv-shop-page-title">商店</div>' +
        '<div class="adv-shop-page-gold"><img src="' + AC.GOLD_ICON + '" class="adv-gold-icon" alt="金币"><b>' + gold + '</b></div>' +
        '<div class="adv-shop-slots">' + slotsHtml + '</div>' +
        '<div class="adv-shop-page-hint">前3槽道具、第6槽配饰（刷新2金币，配饰15金币），第4–5槽兽元（普通2/万能4，不可刷新）。战利白卡不在商店出售，可从怪物掉落或铁匠铺获得。</div>' +
        '<div class="adv-shop-page-actions">' +
          '<button class="adv-btn adv-btn-primary" id="adv-shop-buy"' + (canBuy && gold >= selectedPrice ? '' : ' disabled') + '>' + buyLabel + '</button>' +
          '<button class="adv-btn" id="adv-shop-refresh"' + (canRefresh && gold >= refreshCost ? '' : ' disabled') + '>刷新 · ' + refreshCost + '金币</button>' +
          '<button class="adv-btn" id="adv-leave-shop">离开商店</button>' +
        '</div>';
      this._mountTrophyCards(page);
      return page;
    }
    
    _beastCostIconsHtml(beastCost) {
      if (!Array.isArray(beastCost) || !beastCost.length) return '';
      return beastCost.map(k =>
        '<img class="adv-trade-cost-icon" src="' + (AC.BEAST_ICON[k] || '') + '" alt="' + (AC.BEAST_LABEL[k] || k) + '" title="' + (AC.BEAST_LABEL[k] || k) + '">'
      ).join('');
    }
    
    _buildBlacksmithPage(snap) {
      const page = document.createElement('div');
      page.className = 'adv-shop-page adv-blacksmith-page';
      const slots = (snap.roomInfo && snap.roomInfo.blacksmithSlots) || [null, null, null];
      const selected = snap.blacksmithSelectedSlot;
      const gold = snap.currency.gold;
      const tokens = snap.currency.tokens || {};
    
      let slotsHtml = '';
      for (let i = 0; i < 3; i++) {
        const item = slots[i];
        const isSel = selected === i;
        if (item) {
          slotsHtml += '<button type="button" class="adv-shop-slot filled adv-shop-slot-accessory' + (isSel ? ' selected' : '') + '" data-blacksmith-slot="' + i + '" title="' + (item.description || '') + '">' +
            '<div class="adv-shop-slot-tag">配饰</div>' +
            (item.icon ? '<img class="adv-shop-slot-icon" src="' + item.icon + '" alt="">' : '') +
            '<div class="adv-shop-slot-name">' + item.displayName + '</div>' +
            '<div class="adv-shop-slot-desc">' + (item.description || '') + '</div>' +
            '<div class="adv-shop-slot-trade">' + this._beastCostIconsHtml(item.beastCost) +
            '<span class="adv-shop-slot-trade-text">' + (item.beastCostText || '') + '</span></div>' +
            '</button>';
        } else {
          slotsHtml += '<button type="button" class="adv-shop-slot empty adv-shop-slot-accessory' + (isSel ? ' selected' : '') + '" data-blacksmith-slot="' + i + '">' +
            '<div class="adv-shop-slot-tag">配饰</div>' +
            '<div class="adv-shop-slot-empty-label">sold-out</div>' +
            '<div class="adv-shop-slot-trade adv-shop-slot-trade-empty">刷新可补货</div>' +
            '</button>';
        }
      }
    
      const trophy = snap.roomInfo && snap.roomInfo.blacksmithTrophy;
      const trophySelected = selected === 'trophy';
      const trophyHtml = trophy
        ? '<button type="button" class="adv-shop-slot filled adv-shop-slot-trophy' + (trophySelected ? ' selected' : '') + '" data-blacksmith-trophy="1" title="' + (trophy.description || '') + '">' +
          '<div class="adv-shop-slot-tag">战利白卡</div>' +
          this._trophyCardMarkup(trophy.name, 54, 78) +
          '<div class="adv-shop-slot-name">' + trophy.displayName + '</div>' +
          '<div class="adv-shop-slot-desc">' + (trophy.description || '') + '</div>' +
          '<div class="adv-shop-slot-trade">' + this._beastCostIconsHtml(trophy.beastCost) + '<span class="adv-shop-slot-trade-text">' + (trophy.beastCostText || '') + '</span></div></button>'
        : '<button type="button" class="adv-shop-slot empty adv-shop-slot-trophy" data-blacksmith-trophy="1"><div class="adv-shop-slot-tag">战利白卡</div><div class="adv-shop-slot-empty-label">sold-out</div><div class="adv-shop-slot-trade adv-shop-slot-trade-empty">刷新可补货</div></button>';
    
      const canTrade = Number.isInteger(selected) && !!slots[selected];
      const canPayTrade = canTrade && !!(snap.blacksmithCanPay && snap.blacksmithCanPay.slots[selected]);
      const canRefresh = Number.isInteger(selected);
      const refreshCost = 2;
    
      const beastSummary = ['ben', 'cao', 'shui', 'huo', 'wuneng'].map(k =>
        '<span class="adv-bs-token" title="' + (AC.BEAST_LABEL[k] || k) + '">' +
        '<img src="' + (AC.BEAST_ICON[k] || '') + '" alt="">' + (tokens[k] || 0) + '</span>'
      ).join('');
    
      const accessories = snap.accessories || [];
      let recycleHtml = '<div class="adv-recycle-section"><div class="adv-recycle-title">回收配饰（+10金币/件）</div>';
      if (accessories.length) {
        recycleHtml += '<div class="adv-recycle-list">';
        const seen = {};
        for (let i = 0; i < accessories.length; i++) {
          const acc = accessories[i];
          if (seen[acc.name] !== undefined) continue;
          seen[acc.name] = i;
          let count = 0;
          for (let j = 0; j < accessories.length; j++) if (accessories[j].name === acc.name) count++;
          recycleHtml += '<button type="button" class="adv-recycle-slot" data-recycle-index="' + i + '" title="' + (acc.description || '') + '">' +
            (acc.icon ? '<img class="adv-shop-slot-icon" src="' + acc.icon + '" alt="">' : '') +
            '<div class="adv-shop-slot-name">' + acc.displayName + (count > 1 ? ' ×' + count : '') + '</div>' +
            '<div class="adv-recycle-price">+10金币</div>' +
            '</button>';
        }
        recycleHtml += '</div>';
      } else {
        recycleHtml += '<div class="adv-recycle-empty">无可回收配饰</div>';
      }
      recycleHtml += '</div>';
    
      const isTrophySelected = selected === 'trophy';
      const tradeLabel = isTrophySelected ? '锻造' : '兑换';
      const tradeEnabled = isTrophySelected
        ? (trophy && snap.blacksmithCanPay && snap.blacksmithCanPay.trophy)
        : canPayTrade;
    
      page.innerHTML =
        '<div class="adv-shop-page-title">铁匠铺</div>' +
        '<div class="adv-shop-page-gold"><img src="' + AC.GOLD_ICON + '" class="adv-gold-icon" alt="金币"><b>' + gold + '</b></div>' +
        '<div class="adv-blacksmith-tokens">兽元：' + beastSummary + ' <span class="adv-bs-hint">（万能可替代）</span></div>' +
        '<div class="adv-shop-slots adv-blacksmith-slots">' + slotsHtml + '</div>' +
        '<div class="adv-blacksmith-trophy-stall"><div class="adv-blacksmith-stall-title">战利白卡摊位</div>' + trophyHtml + '</div>' +
        recycleHtml +
        '<div class="adv-shop-page-actions">' +
          '<button class="adv-btn adv-btn-primary" id="adv-blacksmith-trade"' + (tradeEnabled ? '' : ' disabled') + '>' + tradeLabel + '</button>' +
          '<button class="adv-btn" id="adv-blacksmith-refresh"' + (canRefresh && gold >= refreshCost ? '' : ' disabled') + '>刷新 · ' + refreshCost + '金币</button>' +
          '<button class="adv-btn" id="adv-leave-blacksmith">离开铁匠铺</button>' +
        '</div>';
      this._mountTrophyCards(page);
      return page;
    }
    
    _buildActions(snap) {
      const Phase = window.AdventurePhase;
      const T = window.RoomType;
      let btns = '';
    
      if (snap.phase === Phase.MAP) {
        const ri = snap.roomInfo;
        const needItemDoor = ri && ri.type === T.ITEM && !ri.doorUnlocked;
        const itemClaimed = ri && ri.type === T.ITEM && ri.rewardClaimed && !ri.stashedLoot;
        const needBlacksmithDoor = ri && ri.type === T.BLACKSMITH && !ri.doorUnlocked && (ri.entryGold || 0) > 0;
        if (itemClaimed) {
          btns += '<button class="adv-btn" id="adv-enter" disabled>本层奖励已领</button>';
        } else {
          btns += '<button class="adv-btn adv-btn-primary" id="adv-enter">' +
            (needItemDoor ? '开启房门' : needBlacksmithDoor ? ('支付' + ri.entryGold + '金币进入') : '进入房间') + '</button>';
        }
        if (needItemDoor && ri.doorCost && ri.doorCost.length) {
          const icons = ri.doorCost.map(k =>
            '<img class="adv-door-hint-icon" src="' + (AC.BEAST_ICON[k] || '') + '" alt="' + (AC.BEAST_LABEL[k] || k) + '">'
          ).join('');
          btns += '<div class="adv-door-hint">需要兽元：' + icons + '（万能可替代）</div>';
        } else if (needBlacksmithDoor) {
          btns += '<div class="adv-door-hint">进入需 ' + ri.entryGold + ' 金币（第' + ['一', '二', '三', '四'][(snap.stage || 1) - 1] + '层）</div>';
        }
      } else if (snap.phase === Phase.REWARD) {
        const ri = snap.roomInfo;
        if (snap.pendingRoomReward) {
          btns += '<div class="adv-action-hint">请在奖励页操作</div>';
        } else if (ri && ri.stashedLoot && ri.type !== T.BOSS) {
          btns += '<button class="adv-btn adv-btn-primary" id="adv-reward">领取保留奖励</button>';
          btns += '<button class="adv-btn" id="adv-skip-reward">稍后再领</button>';
        }
      } else if (snap.phase === Phase.SHOP) {
        btns += '<div class="adv-action-hint">请在商店页操作</div>';
      } else if (snap.phase === Phase.BLACKSMITH) {
        btns += '<div class="adv-action-hint">请在铁匠铺页操作</div>';
      } else if (snap.phase === Phase.CLEAR) {
        btns += '<div class="adv-clear-hint">地牢通关！</div>';
        btns += '<button class="adv-btn adv-btn-primary" id="adv-next-stage">进入下一层</button>';
      } else if (snap.phase === Phase.GAME_OVER) {
        btns += '<div class="adv-gameover-hint">冒险失败</div>';
      }
    
      return btns;
    }
    
    _buildLog(logEntries = []) {
      const box = document.createElement('div');
      box.className = 'adventure-log';
      box.id = 'adventure-log-box';
      if (!this.logVisible) box.style.display = 'none';
      box.innerHTML = '<div class="adv-log-title">日志</div><div class="adv-log-list" id="adv-log-list"></div>';
      const list = box.querySelector('#adv-log-list');
      (logEntries || []).slice(-12).forEach(entry => {
        const line = document.createElement('div');
        line.className = 'adv-log-line';
        line.textContent = entry.msg;
        list.appendChild(line);
      });
      list.scrollTop = list.scrollHeight;
      return box;
    }
    _buildBeastDiscardPage(snap) {
      const page = document.createElement('div');
      page.className = 'adv-reward-page';
      const AC = window.AdventureCurrency;
      const t = snap.currency.tokens;
      const types = (AC.ALL_BEAST_TYPES || []).filter(k => t[k] > 0);
      let html = '<div class="adv-reward-page-title">兽元超过上限</div>';
      html += '<div class="adv-settle-section-title">请舍弃 ' + snap.pendingDiscard + ' 个兽元</div>';
      html += '<div class="adv-beast-offered">';
      types.forEach(k => {
        html += '<button class="adv-beast-pick adv-beast-' + k + '" data-beast-discard="' + k + '" title="' + AC.BEAST_LABEL[k] + '">' +
          '<img src="' + AC.BEAST_ICON[k] + '" class="adv-beast-pick-icon" alt="' + AC.BEAST_LABEL[k] + '">' +
          '<span class="adv-beast-pick-count">×' + t[k] + '</span></button>';
      });
      html += '</div>';
      page.innerHTML = html;
      return page;
    }
  }

  if (!global.AdventureUI) throw new Error('adventure_ui_panels.js requires AdventureUI');
  Object.getOwnPropertyNames(AdventureUIPanelViewMethods.prototype)
    .filter(name => name !== 'constructor')
    .forEach(name => Object.defineProperty(global.AdventureUI.prototype, name,
      Object.getOwnPropertyDescriptor(AdventureUIPanelViewMethods.prototype, name)));
})(window);

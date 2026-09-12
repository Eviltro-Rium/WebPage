/**
 * 冒险引擎 AdventureEngine
 * 串联一层地牢的完整流程：地图浏览 → 进入房间 → 战斗/拾取/购买 → 奖励 → 移动 → 通关。
 *
 *   - 玩家牌库与手牌跨战斗持久保持：首场战斗初始化，后续战斗沿用上场结束时的状态。
 *   - 玩家状态效果（灼烧/流血/冷冻/守护/飞翔/暴击/混沌）跨战斗持久保持，战斗结束时不清除。
 *   - 普通/Boss房：战斗胜利后先结算基础奖励，可领取或留在房间；
 *     随后再进行专门的兽元结算（普通房），领完再返回地图。
 *   - 奖励房：开门后本层只滚动一次奖励；可领取或留在房间，已领取后不能再刷。
 *   - 挑战房：无普通战斗基础奖励；胜利后仅结算挑战房奖励，再进入兽元全选。
 *   - 商店：6 槽（3 道具 + 2 兽元 + 1 配饰）；道具/配饰刷新 2 金币，配饰 15 金币购买；兽元 2/万能 4 金币。
 */
(function () {
  const SHOP_SLOT_COUNT = 6;
  const SHOP_REFRESH_COST = 2;
  const SHOP_ACCESSORY_PRICE = 15;
  const CONSUMABLE_SLOT_COUNT = 6;

  const Phase = {
    IDLE:        'ADVENTURE_IDLE',
    MAP:         'ADVENTURE_MAP',
    ROOM_ENTER:  'ADVENTURE_ROOM_ENTER',
    COMBAT:      'ADVENTURE_COMBAT',
    PLAYER_PLAY: 'ADVENTURE_PLAYER_PLAY',
    PLAYER_DEFEND:'ADVENTURE_PLAYER_DEFEND',
    NPC_TURN:    'ADVENTURE_NPC_TURN',
    BEAST_CHOICE:'ADVENTURE_BEAST_CHOICE',
    BEAST_DISCARD:'ADVENTURE_BEAST_DISCARD',
    ITEM_DISCARD: 'ADVENTURE_ITEM_DISCARD',
    COMBAT_SETTLE:'ADVENTURE_COMBAT_SETTLE',
    REWARD:      'ADVENTURE_REWARD',
    SHOP:        'ADVENTURE_SHOP',
    BLACKSMITH:  'ADVENTURE_BLACKSMITH',
    CLEAR:       'ADVENTURE_CLEAR',
    GAME_OVER:   'ADVENTURE_GAME_OVER'
  };

  const PHASE_LABEL = {
    ADVENTURE_IDLE:        '待机',
    ADVENTURE_MAP:         '地图',
    ADVENTURE_ROOM_ENTER:  '进入房间',
    ADVENTURE_COMBAT:      '战斗中',
    ADVENTURE_PLAYER_PLAY: '你的回合',
    ADVENTURE_PLAYER_DEFEND:'防御中',
    ADVENTURE_NPC_TURN:    '敌方回合',
    ADVENTURE_BEAST_CHOICE:'选择兽元',
    ADVENTURE_BEAST_DISCARD:'舍弃兽元',
    ADVENTURE_ITEM_DISCARD:'舍弃道具',
    ADVENTURE_COMBAT_SETTLE:'战斗结算',
    ADVENTURE_REWARD:      '领取奖励',
    ADVENTURE_SHOP:        '商店',
    ADVENTURE_BLACKSMITH:  '铁匠铺',
    ADVENTURE_CLEAR:       '通关',
    ADVENTURE_GAME_OVER:   '游戏结束'
  };

  class AdventureEngine {
    constructor() {
      this.s = null;
      this.events = [];
      this._listeners = {};
    }

    on(type, fn) { (this._listeners[type] ||= []).push(fn); }
    emit(type, desc, extra = {}) {
      const ev = { type, desc, extra, t: Date.now() };
      this.events.push(ev);
      (this._listeners[type] || []).forEach(fn => fn(ev));
      (this._listeners['*'] || []).forEach(fn => fn(ev));
    }

    start(map, characterName, opts = {}) {
      const charMod = window.CharacterRegistry.get(characterName);
      if (!charMod) throw new Error('未知角色: ' + characterName);

      const player = {
        name: charMod.name,
        hp: charMod.hp,
        maxHp: charMod.hp,
        type: charMod.type,
        passive: charMod.passive,
        buffs: {},
        burn: 0,
        bleed: 0,
        poison: 0,
        blind: 0,
        iceSeal: 0,
        frozen: false,
        guard: 0,
        fly: 0,
        crit: 0,
        chaos_red: false,
        chaos_yellow: false,
        chaos_blue: false,
        chaos_green: false,
        bloodthirst: false,
        extra: charMod.init ? charMod.init() : {}
      };

      this.s = {
        map: map,
        pos: map.start ? { r: map.start.r, c: map.start.c } : null,
        player: player,
        charMod: charMod,
        currency: new window.AdventureCurrency(),
        inventory: opts.inventory ? opts.inventory.slice() : [],
        consumables: opts.consumables ? opts.consumables.slice() : [],
        trophyWhiteCards: opts.trophyWhiteCards ? opts.trophyWhiteCards.slice() : [],
        accessories: opts.accessories ? opts.accessories.slice() : [],
        playerPile: null,
        discardTop: null,
        discardTopOwner: null,
        combat: null,
        beastReward: null,
        beastSelection: [],
        pendingDiscard: 0,
        pendingItemDiscard: 0,
        itemDiscardReturn: null,
        pendingCombatReward: null,
        pendingRoomReward: null,
        shopSelectedSlot: null,
        blacksmithSelectedSlot: null,
        phase: Phase.MAP,
        log: [],
        turn: 0,
        stage: opts.stage || 1,
        scene: opts.scene || 'castle'
      };

      if (opts.gold) this.s.currency.addGold(opts.gold);
      this._syncBeastCap();

      if (this.s.pos) {
        const startRoom = map.get(this.s.pos.r, this.s.pos.c);
        if (startRoom) startRoom.visited = true;
      }

      const AD = window.AdventureDeck;
      const playerDeck = AD.makePlayerDeck();
      this.s.playerPile = new AD.AdventurePile('player', playerDeck, 5);
      this.s.playerPile.draw(5);
      for (const name of this.s.trophyWhiteCards) {
        if (window.AdventureRegistry.getItem(name) && window.AdventureRegistry.getItem(name).kind === 'trophyWhite') {
          this.s.playerPile.hand.push(AD.trophyWhite(name));
        }
      }
      // The map view starts without a table card. A new top is revealed only
      // when the player actually enters a combat room.
      this.s.discardTop = new AD.DiscardTop(null);
      this.s.discardTopOwner = null;
      if (this.s.consumables.length > CONSUMABLE_SLOT_COUNT) this._beginItemDiscard('map');

      if (this.s.pos) {
        const room = map.get(this.s.pos.r, this.s.pos.c);
        if (room) room.visited = true;
      }

      this._initItemDoorCosts(map);

      this._log('进入地牢，主角：' + player.name + '（' + player.type + '）');
      this.emit('start', '冒险开始', { character: characterName });
      return this.s;
    }

    /** 导出可序列化的存档数据（委托给 AdventureSave） */
    exportSave() {
      return window.AdventureSave ? window.AdventureSave.serialize(this) : null;
    }

    /** 从存档恢复引擎状态；map 需由调用方先按存档的 mapName 加载 */
    restoreFromSave(save, map) {
      const charMod = window.CharacterRegistry.get(save.characterName);
      if (!charMod) throw new Error('未知角色: ' + save.characterName);
      const clone = v => v == null ? v : JSON.parse(JSON.stringify(v));
      const player = clone(save.player);

      this.s = {
        map: map,
        pos: clone(save.pos),
        player: player,
        charMod: charMod,
        currency: new window.AdventureCurrency(),
        inventory: (save.inventory || []).slice(),
        consumables: (save.consumables || []).slice(),
        trophyWhiteCards: (save.trophyWhiteCards || []).slice(),
        accessories: (save.accessories || []).slice(),
        playerPile: null,
        discardTop: null,
        discardTopOwner: save.discardTopOwner || null,
        combat: null,
        beastReward: clone(save.beastReward) || null,
        beastSelection: clone(save.beastSelection) || [],
        pendingDiscard: save.pendingDiscard || 0,
        pendingItemDiscard: save.pendingItemDiscard || 0,
        itemDiscardReturn: clone(save.itemDiscardReturn) || null,
        pendingCombatReward: clone(save.pendingCombatReward) || null,
        pendingRoomReward: clone(save.pendingRoomReward) || null,
        shopSelectedSlot: save.shopSelectedSlot == null ? null : save.shopSelectedSlot,
        blacksmithSelectedSlot: save.blacksmithSelectedSlot == null ? null : save.blacksmithSelectedSlot,
        phase: save.phase,
        log: (save.log || []).slice(),
        turn: save.turn || 0,
        stage: save.stage || 1,
        scene: save.scene || 'castle'
      };

      this.s.currency.gold = save.currency.gold || 0;
      if (save.currency.tokens) Object.assign(this.s.currency.tokens, save.currency.tokens);

      const AD = window.AdventureDeck;
      this.s.playerPile = new AD.AdventurePile('player', clone(save.playerPile.deck), save.playerPile.handLimit || 5);
      this.s.playerPile.hand = clone(save.playerPile.hand) || [];
      this.s.playerPile.discard = clone(save.playerPile.discard) || [];
      // Older saves stored the table top outside the discard pile. Migrate it
      // once so the card is counted exactly once under the new model.
      const savedTop = save.discardTop ? clone(save.discardTop) : null;
      const lastDiscard = this.s.playerPile.discard[this.s.playerPile.discard.length - 1];
      const topAlreadyStored = savedTop && lastDiscard &&
        lastDiscard.color === savedTop.color && lastDiscard.value === savedTop.value &&
        !!lastDiscard.isItemCard === !!savedTop.isItemCard &&
        (lastDiscard.trophyName || null) === (savedTop.trophyName || null);
      if (savedTop && !topAlreadyStored) this.s.playerPile.discard.push(savedTop);
      // Keep the DiscardTop wrapper even when the map has no revealed card;
      // callers can safely continue using .get() and receive null.
      this.s.discardTop = new AD.DiscardTop(savedTop);
      this._normalizePlayerPileCount();

      for (let r = 0; r < map.rows; r++) {
        for (let c = 0; c < map.cols; c++) {
          const room = map.get(r, c);
          const d = save.rooms && save.rooms[r + ',' + c];
          if (!room || !d) continue;
          room.visited = !!d.visited;
          room.cleared = !!d.cleared;
          room.rewardClaimed = !!d.rewardClaimed;
          room.beastTokenClaimed = !!d.beastTokenClaimed;
          room.locked = !!d.locked;
          room.stashedLoot = d.stashedLoot ? clone(d.stashedLoot) : null;
          if (d.monsterName != null) room.monsterName = d.monsterName;
          if (d.bossName != null) room.bossName = d.bossName;
          room.reward = d.reward ? clone(d.reward) : null;
          room.shopSlots = d.shopSlots ? clone(d.shopSlots) : null;
          if (Array.isArray(d.blacksmithSlots)) room.blacksmithSlots = clone(d.blacksmithSlots);
          if ('blacksmithTrophySlot' in d) room.blacksmithTrophySlot = d.blacksmithTrophySlot == null ? null : clone(d.blacksmithTrophySlot);
          room.shopItems = d.shopItems ? clone(d.shopItems) : null;
          room.shopSold = clone(d.shopSold) || {};
          if (Array.isArray(d.doorCost) && d.doorCost.length === 2) room.doorCost = d.doorCost.slice(0, 2);
          room.doorUnlocked = !!d.doorUnlocked;
        }
      }

      this._syncBeastCap();
      this._initItemDoorCosts(map);
      this.emit('restore', '已恢复冒险进度', { character: save.characterName });
      return this.s;
    }

    _initItemDoorCosts(map) {
      if (!map || !map.grid) return;
      const AC = window.AdventureCurrency;
      for (let r = 0; r < map.rows; r++) {
        for (let c = 0; c < map.cols; c++) {
          const room = map.get(r, c);
          if (!room || room.type !== window.RoomType.ITEM) continue;
          if (!Array.isArray(room.doorCost) || room.doorCost.length < 2) {
            room.doorCost = AC.rollDoorCost();
          }
          room.doorUnlocked = !!room.doorUnlocked;
        }
      }
    }

    _doorCostText(cost) {
      const AC = window.AdventureCurrency;
      if (!Array.isArray(cost) || !cost.length) return '';
      return cost.map(t => AC.BEAST_LABEL[t] || t).join(' + ');
    }

    _beastTradeCostText(cost) {
      const AC = window.AdventureCurrency;
      if (!Array.isArray(cost) || !cost.length) return '';
      const counts = {};
      for (const t of cost) counts[t] = (counts[t] || 0) + 1;
      return Object.keys(counts).map(t => counts[t] + (AC.BEAST_GLYPH[t] || t)).join(' ');
    }

    _blacksmithEntryGold() {
      const stage = this.s.stage || 1;
      return stage;
    }

    currentRoom() {
      if (!this.s || !this.s.pos) return null;
      return this.s.map.get(this.s.pos.r, this.s.pos.c);
    }

    canMoveTo(r, c) {
      if (!this.s || this.s.phase === Phase.PLAYER_PLAY || this.s.phase === Phase.PLAYER_DEFEND || this.s.phase === Phase.NPC_TURN || this.s.phase === Phase.BEAST_CHOICE || this.s.phase === Phase.BEAST_DISCARD || this.s.phase === Phase.ITEM_DISCARD || this.s.phase === Phase.COMBAT_SETTLE || this.s.phase === Phase.GAME_OVER) return false;
      const room = this.s.map.get(r, c);
      if (!room || !room.isEnterable()) return false;
      if (room.visited) return true;
      const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];
      for (const [dr, dc] of dirs) {
        const neighbor = this.s.map.get(r + dr, c + dc);
        if (neighbor && neighbor.visited) return true;
      }
      return false;
    }

    move(r, c) {
      if (!this.canMoveTo(r, c)) return false;
      this.s.pos = { r, c };
      const room = this.s.map.get(r, c);
      this._log('移动到 (' + (r + 1) + ',' + (c + 1) + ') ' + room.label() + '房间');
      this.emit('move', '移动', { r, c, roomType: room.type });
      return true;
    }

    enterCurrent() {
      const room = this.currentRoom();
      if (!room) return;
      this.s.phase = Phase.ROOM_ENTER;
      this.emit('enterRoom', '进入' + room.label() + '房间', { r: this.s.pos.r, c: this.s.pos.c, roomType: room.type });
      this._log('进入 ' + room.label() + ' 房间');

      switch (room.type) {
        case window.RoomType.START:  this.s.phase = Phase.MAP; return;
        case window.RoomType.NORMAL: return this._handleNormal(room);
        case window.RoomType.BOSS:   return this._handleBoss(room);
        case window.RoomType.ITEM:   return this._handleItem(room);
        case window.RoomType.SHOP:   return this._handleShop(room);
        case window.RoomType.BLACKSMITH: return this._handleBlacksmith(room);
        case window.RoomType.CHALLENGE: return this._handleChallenge(room);
        default:
          this.s.phase = Phase.MAP;
          return;
      }
    }

    _isAvailableAtStage(def, stage) {
      return !!def && (!Number.isFinite(Number(def.minStage)) || stage >= Number(def.minStage));
    }

    _availableNames(names, stage, kind) {
      const registry = window.AdventureRegistry;
      if (!registry) return (names || []).slice();
      const getter = kind === 'boss' ? 'getBoss' : 'getMonster';
      return (names || []).filter(name => this._isAvailableAtStage(registry[getter](name), stage));
    }

    _pickMonsterName(room) {
      const scene = this.s.scene || 'castle';
      const stage = this.s.stage || 1;
      const pool = window.AdventureMonsterPool || {};
      const registry = window.AdventureRegistry;
      if (room && room.monsterName) {
        const explicit = registry && registry.getMonster(room.monsterName);
        if (this._isAvailableAtStage(explicit, stage)) return room.monsterName;
      }
      const fallback = (registry && this._availableNames(registry.monsterNames(), stage, 'monster')) || ['CastleWolf'];
      const configured = (pool[scene] && (pool[scene][stage] || pool[scene]['*'])) || fallback;
      const list = this._availableNames(configured, stage, 'monster');
      if (!list.length) return fallback[0] || 'CastleWolf';
      return list[Math.floor(Math.random() * list.length)];
    }

    _pickBossName(room) {
      const scene = this.s.scene || 'castle';
      const stage = this.s.stage || 1;
      const pool = window.AdventureBossPool || {};
      const registry = window.AdventureRegistry;
      if (room && room.bossName) {
        const explicit = registry && registry.getBoss(room.bossName);
        if (this._isAvailableAtStage(explicit, stage)) return room.bossName;
      }
      const fallback = (registry && this._availableNames(registry.bossNames(), stage, 'boss')) || ['CastleChameleon'];
      const scenePool = pool[scene];
      const configured = Array.isArray(scenePool)
        ? scenePool
        : ((scenePool && (scenePool[stage] || scenePool['*'])) || fallback);
      const list = this._availableNames(configured, stage, 'boss');
      if (!list.length) return fallback[0] || 'CastleChameleon';
      return list[Math.floor(Math.random() * list.length)] || 'CastleChameleon';
    }

    /**
     * Flip a fresh number card into the player's discard pile and expose that
     * same physical card as the current table top. The top is deliberately not
     * counted separately; deck + hand + discard remains the complete total.
     */
    _initializeDiscardTop() {
      const AD = window.AdventureDeck;
      const pile = this.s && this.s.playerPile;
      if (!AD || !pile) return null;
      // A room may start after the previous fight exhausted the draw pile.
      // Recycle the player's own discard pile before revealing the next top.
      if (!pile.deck.length && typeof pile.refillIfNeeded === 'function') pile.refillIfNeeded();
      const card = AD.drawInitialTop(pile.deck);
      if (!card) {
        this.s.discardTop = new AD.DiscardTop(null);
        this.s.discardTopOwner = null;
        return null;
      }
      pile.discard.push(card);
      const top = pile.discard[pile.discard.length - 1];
      this.s.discardTop = new AD.DiscardTop(top);
      this.s.discardTopOwner = 'player';
      return top;
    }

    /**
     * Repair saves produced by the old virtual-table-top model. The player
     * owns one normal adventure deck plus one physical card per trophy white
     * card; the table top is already included in discard and must not increase
     * that total. Only excess cards are removed, preserving the active top.
     */
    _normalizePlayerPileCount() {
      const AD = window.AdventureDeck;
      const pile = this.s && this.s.playerPile;
      if (!AD || !pile) return 0;
      const template = AD.makePlayerDeck ? AD.makePlayerDeck() : null;
      const baseCount = Array.isArray(template) ? template.length : 99;
      const trophyCount = (this.s.trophyWhiteCards || []).filter(name => {
        const def = window.AdventureRegistry && window.AdventureRegistry.getItem(name);
        return def && def.kind === 'trophyWhite';
      }).length;
      let excess = pile.deck.length + pile.hand.length + pile.discard.length - baseCount - trophyCount;
      if (excess <= 0) return 0;

      const top = this.s.discardTop && typeof this.s.discardTop.get === 'function'
        ? this.s.discardTop.get() : null;
      // A map save without a table top may legitimately contain a caller's
      // custom pile contents (and has no duplicate-top evidence to migrate).
      if (!top) return 0;
      const sameCard = (a, b) => a && b && a.color === b.color && a.value === b.value &&
        !!a.isItemCard === !!b.isItemCard &&
        (!a.trophyName || !b.trophyName || a.trophyName === b.trophyName) &&
        (!a.magicColor || !b.magicColor || a.magicColor === b.magicColor);
      let removed = 0;
      while (excess > 0) {
        if (pile.discard.length) {
          const last = pile.discard.length - 1;
          // If the top is stored as the last discard, remove the entry before
          // it first so the active table card remains physically available.
          const index = top && sameCard(pile.discard[last], top) && last > 0 ? last - 1 : last;
          pile.discard.splice(index, 1);
        } else if (pile.deck.length) {
          pile.deck.pop();
        } else if (pile.hand.length) {
          pile.hand.pop();
        } else {
          break;
        }
        excess--;
        removed++;
      }
      if (removed) this._log('存档迁移：移除重复牌' + removed + '张，恢复玩家牌库总数');
      return removed;
    }

    _handleNormal(room) {
      if (room.cleared) {
        if (room.stashedLoot) {
          this._log('普通房间已清除，可领取留在房间的基础奖励');
          this.s.phase = Phase.REWARD;
          this.emit('rewardPending', '可领取保留的奖励', { roomType: room.type, stashed: room.stashedLoot });
        } else {
          this._log('普通房间已清除且无待领奖励');
          this.s.phase = Phase.MAP;
        }
        return;
      }
      const currentMonster = window.AdventureRegistry && window.AdventureRegistry.getMonster(room.monsterName);
      if (!this._isAvailableAtStage(currentMonster, this.s.stage || 1)) room.monsterName = this._pickMonsterName(room);
      const monster = window.Monster.fromRegistry(room.monsterName);
      if (!monster) {
        this._log('普通房间未配置怪物，直接通过');
        room.cleared = true;
        this.s.phase = Phase.REWARD;
        this.emit('roomCleared', '房间已清空', { roomType: room.type });
        return;
      }
      monster.init(this);
      this._initializeDiscardTop();
      this._initCombat(monster, 'monster');
      this.emit('combatStart', '遭遇 ' + monster.name, { enemy: monster.name });
    }

    _handleBoss(room) {
      if (room.cleared) {
        this._log(room.stashedLoot
          ? 'Boss已战胜，可领取留在房间的奖励或进入下一层'
          : 'Boss已战胜，可进入下一层');
        // Re-entering a cleared Boss room should open the settlement-style page
        // instead of exposing map-only action buttons.
        this.s.pendingRoomReward = room.stashedLoot ? this._cloneLoot(room.stashedLoot) : null;
        this.s.pendingCombatReward = room.stashedLoot ? {
          stage: 'basic', roomType: window.RoomType.BOSS,
          basic: this._cloneLoot(room.stashedLoot), beast: null, applied: false
        } : null;
        this.s.phase = Phase.REWARD;
        this.emit('rewardPending', 'Boss已战胜', {
          roomType: room.type,
          bossCleared: true,
          stashed: room.stashedLoot || null
        });
        return;
      }
      const currentBoss = window.AdventureRegistry && window.AdventureRegistry.getBoss(room.bossName);
      if (!this._isAvailableAtStage(currentBoss, this.s.stage || 1)) room.bossName = this._pickBossName(room);
      const boss = window.Boss.fromRegistry(room.bossName);
      if (!boss) {
        this._log('Boss 房间未配置 Boss，直接通过');
        room.cleared = true;
        this.s.phase = Phase.REWARD;
        this.emit('roomCleared', '房间已清空', { roomType: room.type });
        return;
      }
      boss.init(this);

      this._initializeDiscardTop();
      this._initCombat(boss, 'boss');
      this.emit('combatStart', 'Boss 出现：' + boss.name, { enemy: boss.name });
    }

    _handleChallenge(room) {
      if (room.cleared) {
        if (room.stashedLoot) {
          this._log('挑战房已清除，可领取留在房间的奖励');
          this.s.phase = Phase.REWARD;
          this.emit('rewardPending', '可领取保留的奖励', { roomType: room.type, stashed: room.stashedLoot });
        } else {
          this._log('挑战房已清除');
          this.s.phase = Phase.MAP;
        }
        return;
      }
      const monster1 = window.Monster.fromRegistry(this._pickMonsterName(room));
      const monster2 = window.Monster.fromRegistry(this._pickMonsterName(room));
      if (!monster1 || !monster2) {
        this._log('挑战房未配置怪物，直接通过');
        room.cleared = true;
        this.s.phase = Phase.REWARD;
        this.emit('roomCleared', '房间已清空', { roomType: room.type });
        return;
      }
      monster1.init(this);
      monster2.init(this);
      this._initializeDiscardTop();
      this._initCombat(monster1, 'challenge', monster2);
      this.emit('combatStart', '挑战房：' + monster1.name + ' + ' + monster2.name, { enemy: monster1.name, enemy2: monster2.name, is1v2: true });
    }

    _handleItem(room) {
      if (!room.doorUnlocked) {
        const cost = Array.isArray(room.doorCost) ? room.doorCost : [];
        if (!cost.length) {
          room.doorCost = window.AdventureCurrency.rollDoorCost();
        }
        const need = room.doorCost;
        if (!this.s.currency.canPayBeastCost(need)) {
          this._log('兽元不足，无法打开奖励房（需要：' + this._doorCostText(need) + '；可用万能兽元替代）');
          this.emit('doorLocked', '奖励房门未开', { cost: need.slice(), gold: this.s.currency.gold });
          this.s.phase = Phase.MAP;
          return { ok: false, message: '兽元不足，需要：' + this._doorCostText(need) };
        }
        this.s.currency.payBeastCost(need);
        room.doorUnlocked = true;
        this._log('消耗兽元打开奖励房门：' + this._doorCostText(need));
        this.emit('doorUnlock', '打开奖励房门', { cost: need.slice() });
      }

      if (room.stashedLoot) {
        this.s.pendingRoomReward = this._cloneLoot(room.stashedLoot);
        this._log('奖励房间：有待领奖励');
        this.emit('itemRoom', '奖励房间待领', { stashed: true, reward: this.s.pendingRoomReward });
        this.s.phase = Phase.REWARD;
        return { ok: true };
      }

      // 本层奖励已领取：不再重新滚动，避免反复进出刷奖
      if (room.rewardClaimed) {
        this.s.pendingRoomReward = null;
        this._log('奖励房间：本层奖励已领取，无法再次刷新');
        this.emit('itemRoomEmpty', '本层奖励已领取', { roomType: room.type });
        this.s.phase = Phase.MAP;
        return { ok: true, alreadyClaimed: true, message: '本层奖励已领取' };
      }

      // 本层首次进入：滚动一次并立刻写入房间，锁定本层内容
      const loot = this._rollBonusRoomReward();
      this._stashBasicLoot(room, loot);
      this.s.pendingRoomReward = this._cloneLoot(loot);
      this._log('奖励房间：' + this._roomLootText(this.s.pendingRoomReward));
      this.emit('itemRoom', '奖励房间', { stashed: false, reward: this.s.pendingRoomReward });
      this.s.phase = Phase.REWARD;
      return { ok: true };
    }

    _cloneLoot(loot) {
      if (!loot) return null;
      return {
        kind: loot.kind,
        gold: loot.gold || 0,
        item: loot.item || null,
        items: Array.isArray(loot.items) ? loot.items.slice() : null,
        accessory: loot.accessory || null,
        beastType: loot.beastType || null
      };
    }

    _snapshotLoot(loot) {
      if (!loot) return null;
      return {
        kind: loot.kind,
        gold: loot.gold || 0,
        item: loot.item || null,
        items: Array.isArray(loot.items) ? loot.items.slice() : null,
        accessory: loot.accessory || null,
        beastType: loot.beastType || null
      };
    }

    /**
     * 奖励房 / 挑战房额外奖励权重（合计12）：
     * 6金币×1，12金币×2，配饰×2，道具×2权重4，道具×3权重3
     */
    _rollBonusRoomReward() {
      return this._rollChallengeBonusReward();
    }

    _rollChallengeBonusReward() {
      const total = 12;
      let r = Math.random() * total;
      if (r < 1) return { kind: 'gold', gold: 6 };
      r -= 1;
      if (r < 2) return { kind: 'gold', gold: 12 };
      r -= 2;
      if (r < 2) {
        const accessory = this._rollAccessoryDrop();
        return accessory
          ? { kind: 'accessory', accessory }
          : { kind: 'gold', gold: 6 };
      }
      r -= 2;
      if (r < 4) {
        const a = this._rollItemDrop();
        const b = this._rollItemDrop();
        const items = [];
        if (a) items.push(a);
        if (b) items.push(b);
        return { kind: 'items', items };
      }
      r -= 4;
      const items = [];
      for (let i = 0; i < 3; i++) {
        const item = this._rollItemDrop();
        if (item) items.push(item);
      }
      return { kind: 'items', items };
    }

    _roomLootText(loot) {
      if (!loot) return '无奖励';
      if (loot.kind === 'gold') return loot.gold + ' 金币';
      if (loot.kind === 'items' || loot.kind === 'item') {
        const list = loot.items || (loot.item ? [loot.item] : []);
        if (!list.length) return '道具：无';
        const names = list.map(n => {
          const def = window.AdventureRegistry.getItem(n);
          return def ? def.displayName : n;
        });
        return '道具：' + names.join('、');
      }
      if (loot.kind === 'accessory') {
        const name = loot.accessory || loot.item;
        const def = window.AdventureRegistry.getItem(name);
        return '配饰：' + (def ? def.displayName : name);
      }
      return this._basicLootText(loot);
    }

    isStageClear() { return this.s && this.s.phase === Phase.CLEAR; }
    isGameOver()   { return this.s && this.s.phase === Phase.GAME_OVER; }

    _log(msg) {
      if (!this.s) return;
      this.s.log.push({ turn: this.s.turn, msg, t: Date.now() });
      if (this.s.log.length > 200) this.s.log.shift();
    }

    snapshot() {
      if (!this.s) return null;
      const room = this.currentRoom();
      const topCard = this.s.discardTop && typeof this.s.discardTop.get === 'function'
        ? this.s.discardTop.get()
        : null;
      const discardTop = topCard ? {
        color: topCard.color,
        value: topCard.value,
        isWhite: !!topCard.isWhite,
        isBlack: !!topCard.isBlack,
        isNumberCard: !!topCard.isNumberCard,
        isItemCard: !!topCard.isItemCard,
        chosenColor: topCard.chosenColor || null,
        magicColor: topCard.magicColor || null,
        trophyWhite: !!topCard.trophyWhite,
        trophyName: topCard.trophyName || null,
        trophyEffect: topCard.trophyEffect || null
      } : null;
      const playerPile = this.s.playerPile ? this.s.playerPile.summary() : null;
      if (playerPile) {
        playerPile.totalCount = playerPile.deckCount + playerPile.handCount +
          playerPile.discardCount;
      }
      const itemDetail = name => {
        const def = window.AdventureRegistry.getItem(name);
        return def ? { name, displayName: def.displayName, kind: def.kind, description: def.description, icon: def.icon, useScene: def.useScene || null, price: def.price || 0 } : { name, displayName: name, kind: 'unknown' };
      };
      return {
        pos: this.s.pos,
        player: { name: this.s.player.name, hp: this.s.player.hp, maxHp: this.s.player.maxHp, type: this.s.player.type, buffs: this.playerBuffs() },
        currency: this.s.currency.summary(),
        inventory: this.s.inventory.slice(),
        trophyWhiteCards: (this.s.trophyWhiteCards || []).map((name, index) => Object.assign(itemDetail(name), { index })),
        consumables: this.s.consumables.map(itemDetail),
        consumableSlots: CONSUMABLE_SLOT_COUNT,
        accessories: this.s.accessories.map(itemDetail),
        accessoryStatBonuses: this.getAccessoryStatBonuses(),
        phase: this.s.phase,
        phaseLabel: PHASE_LABEL[this.s.phase] || this.s.phase,
        map: this.s.map.summary(),
        playerPile,
        discardTop,
        discardTopOwner: this.s.discardTopOwner || null,
        combat: this.s.combat ? {
          enemy: this.s.combat.enemy.name,
          enemyHp: this.s.combat.enemy.hp,
          enemyMaxHp: this.s.combat.enemy.maxHp,
          enemyGuard: this.s.combat.enemy.guard || 0,
          enemy2: this.s.combat.enemy2 ? this.s.combat.enemy2.name : null,
          enemy2Hp: this.s.combat.enemy2 ? this.s.combat.enemy2.hp : null,
          enemy2MaxHp: this.s.combat.enemy2 ? this.s.combat.enemy2.maxHp : null,
          is1v2: !!this.s.combat.is1v2,
          kind: this.s.combat.kind,
          round: this.s.combat.round,
          selectedCard: this.s.combat.selectedCard,
          atkCard: this.s.combat.atkCard ? ((this.s.combat.atkCard.magic || this.s.combat.atkCard.magicColor === 'purple') ? '紫魔' : ((this.s.combat.atkCard.greenMagic || this.s.combat.atkCard.magicColor === 'green') ? '绿魔' : (this.s.combat.atkCard.potion ? '药' : this.s.combat.atkCard.value))) : null,
          defCard: this.s.combat.defCard ? ((this.s.combat.defCard.magic || this.s.combat.defCard.magicColor === 'purple') ? '紫魔' : ((this.s.combat.defCard.greenMagic || this.s.combat.defCard.magicColor === 'green') ? '绿魔' : (this.s.combat.defCard.potion ? '药' : this.s.combat.defCard.value))) : null,
          pendingDamage: this.s.combat.pendingDamage || 0,
          npcHand: this.s.combat.npcPile.hand.map(c => (c.magic || c.magicColor === 'purple') ? '紫魔' : ((c.greenMagic || c.magicColor === 'green') ? '绿魔' : (c.potion ? '药' : c.value))),
          npcHandCount: this.s.combat.npcPile.hand.length,
          npcDeckCount: this.s.combat.npcPile.deck.length,
          npcDiscardCount: this.s.combat.npcPile.discard.length,
          discardTop
        } : null,
        beastReward: this.s.beastReward ? {
          scenario: this.s.beastReward.scenario,
          auto: this.s.beastReward.auto,
          offered: this.s.beastReward.offered || null,
          offeredTypes: this.s.beastReward.offeredTypes || null,
          pickCount: this.s.beastReward.pickCount,
          selection: this._selectedBeastTypes(),
          selectedSlots: this.s.beastSelection.slice(),
          original: this._offeredOriginal(this.s.beastReward),
          available: this._offeredAvailable(this.s.beastReward),
          slots: this._offeredSlots(this.s.beastReward)
        } : null,
        pendingCombatReward: this.s.pendingCombatReward ? {
          stage: this.s.pendingCombatReward.stage || 'basic',
          roomType: this.s.pendingCombatReward.roomType || null,
          basic: this._snapshotLoot(this.s.pendingCombatReward.basic),
          bonus: this.s.pendingCombatReward.bonus
            ? this._snapshotLoot(this.s.pendingCombatReward.bonus)
            : null,
          beast: this.s.pendingCombatReward.beast || null,
          applied: !!this.s.pendingCombatReward.applied
        } : null,
        pendingRoomReward: this._snapshotLoot(this.s.pendingRoomReward),
        pendingDiscard: this.s.pendingDiscard,
        pendingItemDiscard: this.s.pendingItemDiscard,
        shopSelectedSlot: this.s.shopSelectedSlot == null ? null : this.s.shopSelectedSlot,
        blacksmithSelectedSlot: this.s.blacksmithSelectedSlot == null ? null : this.s.blacksmithSelectedSlot,
        blacksmithEntryGold: this._blacksmithEntryGold(),
        roomInfo: room ? {
          type: room.type,
          cleared: room.cleared,
          rewardClaimed: room.rewardClaimed,
          beastTokenClaimed: room.beastTokenClaimed,
          doorCost: Array.isArray(room.doorCost) ? room.doorCost.slice() : null,
          doorUnlocked: !!room.doorUnlocked,
          entryGold: room.type === window.RoomType.BLACKSMITH ? this._blacksmithEntryGold() : 0,
          stashedLoot: this._snapshotLoot(room.stashedLoot),
          blacksmithSlots: Array.isArray(room.blacksmithSlots)
            ? room.blacksmithSlots.map(name => this._blacksmithSlotDetail(name))
            : null,
          blacksmithTrophy: this._blacksmithTrophyDetail(room.blacksmithTrophySlot),
          shopSlots: Array.isArray(room.shopSlots)
            ? room.shopSlots.slice(0, SHOP_SLOT_COUNT).map((slot, index) => {
                if (!slot) return null;
                if (slot.kind === 'beast') {
                  if (!this._isShopBeastSlot(index)) return null;
                  const AC = window.AdventureCurrency;
                  const beastType = slot.beastType;
                  return {
                    kind: 'beast',
                    beastType,
                    name: 'Beast:' + beastType,
                    displayName: AC.BEAST_LABEL[beastType] || beastType,
                    description: '购买后加入兽元栏',
                    icon: AC.BEAST_ICON[beastType] || null,
                    price: this._shopBeastPrice(beastType),
                    refreshable: false
                  };
                }
                const name = slot;
                const def = window.AdventureRegistry.getItem(name);
                if (!def) return null;
                if (def.kind === 'accessory') {
                  if (!this._isShopAccessorySlot(index)) return null;
                  return {
                    kind: 'accessory',
                    name,
                    displayName: def.displayName,
                    description: def.description,
                    icon: def.icon,
                    price: this._applyShopDiscount ? this._applyShopDiscount(SHOP_ACCESSORY_PRICE) : SHOP_ACCESSORY_PRICE,
                    refreshable: true
                  };
                }
                if ((def.kind !== 'consumable' && def.kind !== 'trophyWhite') || !this._isShopItemSlot(index)) return null;
                return {
                  kind: def.kind,
                  name,
                  displayName: def.displayName,
                  description: def.description,
                  icon: def.icon,
                  price: this._applyShopDiscount ? this._applyShopDiscount(def.price || 0) : (def.price || 0),
                  refreshable: true
                };
              })
            : null
        } : null,
        stageClear: this.isStageClear(),
        gameOver: this.isGameOver(),
        stage: this.s.stage,
        scene: this.s.scene
      };
    }

    static Phase = Phase;
    static PHASE_LABEL = PHASE_LABEL;
  }

  window.AdventureEngine = AdventureEngine;
  window.AdventurePhase = Phase;
  window.AdventurePhaseLabel = PHASE_LABEL;
  window.AdventureEngineConstants = Object.freeze({
    SHOP_SLOT_COUNT,
    SHOP_REFRESH_COST,
    SHOP_ACCESSORY_PRICE,
    CONSUMABLE_SLOT_COUNT
  });
})();

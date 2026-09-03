/**
 * 冒险引擎 AdventureEngine
 * 串联一层地牢的完整流程：地图浏览 → 进入房间 → 战斗/拾取/购买 → 奖励 → 移动 → 通关。
 *
 *   - 玩家牌库与手牌跨战斗持久保持：首场战斗初始化，后续战斗沿用上场结束时的状态。
 *   - 玩家状态效果（灼烧/流血/冷冻/守护/飞翔/暴击/混沌）跨战斗持久保持，战斗结束时不清除。
 *   - 普通/Boss房：战斗胜利后先结算基础奖励，可领取或留在房间；
 *     随后再进行专门的兽元结算（普通房），领完再返回地图。
 *   - 奖励房：开门后可反复进入；每次进入滚动奖励（6/12 金币、道具、配饰）。
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
      const initialTop = AD.drawInitialTop(this.s.playerPile.deck);
      this.s.discardTop = new AD.DiscardTop(initialTop);
      this.s.discardTopOwner = initialTop ? 'player' : null;
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
      this.s.discardTop = save.discardTop ? new AD.DiscardTop(clone(save.discardTop)) : null;

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

    _pickMonsterName(room) {
      if (room.monsterName) return room.monsterName;
      const scene = this.s.scene || 'castle';
      const stage = this.s.stage || 1;
      const pool = window.AdventureMonsterPool || {};
      const fallback = (window.AdventureRegistry && window.AdventureRegistry.monsterNames()) || ['CastleWolf'];
      const list = (pool[scene] && pool[scene][stage]) || (pool[scene] && pool[scene]['*']) || fallback;
      const idx = Math.floor(Math.random() * list.length);
      return list[idx];
    }

    _pickBossName(room) {
      if (room && room.bossName) return room.bossName;
      const scene = this.s.scene || 'castle';
      const stage = this.s.stage || 1;
      const pool = window.AdventureBossPool || {};
      const fallback = ['CastleChameleon'];
      const scenePool = pool[scene];
      let list;
      if (Array.isArray(scenePool)) {
        list = scenePool;
      } else {
        list = (scenePool && scenePool[stage]) || (scenePool && scenePool['*']) || fallback;
      }
      const idx = Math.floor(Math.random() * list.length);
      return list[idx] || 'CastleChameleon';
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
      if (!room.monsterName) room.monsterName = this._pickMonsterName(room);
      const monster = window.Monster.fromRegistry(room.monsterName);
      if (!monster) {
        this._log('普通房间未配置怪物，直接通过');
        room.cleared = true;
        this.s.phase = Phase.REWARD;
        this.emit('roomCleared', '房间已清空', { roomType: room.type });
        return;
      }
      monster.init(this);
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
      if (!room.bossName) room.bossName = this._pickBossName(room);
      const boss = window.Boss.fromRegistry(room.bossName);
      if (!boss) {
        this._log('Boss 房间未配置 Boss，直接通过');
        room.cleared = true;
        this.s.phase = Phase.REWARD;
        this.emit('roomCleared', '房间已清空', { roomType: room.type });
        return;
      }
      boss.init(this);

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
      } else {
        this.s.pendingRoomReward = this._rollBonusRoomReward();
        this._log('奖励房间：' + this._roomLootText(this.s.pendingRoomReward));
        this.emit('itemRoom', '奖励房间', { stashed: false, reward: this.s.pendingRoomReward });
      }
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

    _handleShop(room) {
      this._ensureShopSlots(room, true);
      this.s.phase = Phase.SHOP;
      this.s.shopSelectedSlot = null;
      this.emit('shopEnter', '进入商店', { slots: room.shopSlots.slice(), currency: this.s.currency });
      this._log('进入商店');
    }

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
    }

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
    }

    _rollTrophyWhiteSlot() {
      const trophies = window.AdventureRegistry.allItems().filter(item => item.kind === 'trophyWhite');
      if (!trophies.length) return null;
      return trophies[Math.floor(Math.random() * trophies.length)].name;
    }

    _rollBlacksmithSlot() {
      return this._rollAccessoryDrop();
    }

    _accessoryTradeCost(itemName) {
      const def = window.AdventureRegistry.getItem(itemName);
      return def && Array.isArray(def.beastTradeCost) ? def.beastTradeCost.slice() : [];
    }

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
    }

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
    }

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
    }

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
    }

    selectBlacksmithSlot(index) {
      if (this.s.phase !== Phase.BLACKSMITH) return false;
      if (index < 0 || index > 2) return false;
      this.s.blacksmithSelectedSlot = index;
      this.emit('blacksmithSelect', '选中铁匠铺槽位', { index });
      return true;
    }

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
    }

    _countTokensFromCost(needed) {
      const map = {};
      if (!Array.isArray(needed)) return map;
      for (const t of needed) map[t] = (map[t] || 0) + 1;
      return map;
    }

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
    }

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
    }

    leaveBlacksmith() {
      if (this.s.phase !== Phase.BLACKSMITH) return;
      const room = this.currentRoom();
      if (room) room.visited = true;
      this.s.blacksmithSelectedSlot = null;
      this.s.phase = Phase.MAP;
      this.emit('blacksmithLeave', '离开铁匠铺', {});
    }

    _isShopConsumableName(itemName) {
      if (!itemName || typeof itemName !== 'string') return false;
      const def = window.AdventureRegistry.getItem(itemName);
      return !!(def && (def.kind === 'consumable' || def.kind === 'trophyWhite'));
    }

    _isShopAccessoryName(itemName) {
      if (!itemName || typeof itemName !== 'string') return false;
      const def = window.AdventureRegistry.getItem(itemName);
      return !!(def && def.kind === 'accessory');
    }

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
    }

    _initShopSlots(room) {
      room.shopSlots = [
        this._rollItemDrop(),
        this._rollItemDrop(),
        this._rollItemDrop(),
        this._rollBeastShopOffer(),
        this._rollBeastShopOffer(),
        this._rollAccessoryDrop()
      ];
    }

    _migrateShopSlots(room) {
      const slots = room.shopSlots.slice(0, SHOP_SLOT_COUNT);
      while (slots.length < SHOP_SLOT_COUNT) slots.push(null);
      room.shopSlots = slots.map((slot, index) => this._sanitizeShopSlot(slot, index));
    }

    _ensureShopSlots(room, migrate) {
      if (!room) return;
      if (!Array.isArray(room.shopSlots) || !room.shopSlots.length) {
        this._initShopSlots(room);
        return;
      }
      if (migrate) this._migrateShopSlots(room);
    }

    _isShopBeastSlot(index) { return index === 3 || index === 4; }

    _isShopAccessorySlot(index) { return index === 5; }

    _isShopItemSlot(index) { return index >= 0 && index <= 2; }

    _shopBeastPrice(beastType) {
      return beastType === 'wuneng' ? 4 : 2;
    }

    _rollBeastShopOffer() {
      const types = window.AdventureCurrency.ALL_BEAST_TYPES;
      const beastType = types[Math.floor(Math.random() * types.length)];
      return { kind: 'beast', beastType };
    }

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
    }

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
    }

    hasAccessory(name) {
      return !!(this.s && Array.isArray(this.s.accessories) && this.s.accessories.indexOf(name) >= 0);
    }

    accessoryCount(name) {
      const arr = this.s && Array.isArray(this.s.accessories) ? this.s.accessories : null;
      if (!arr) return 0;
      let count = 0;
      for (let i = 0; i < arr.length; i++) if (arr[i] === name) count++;
      return count;
    }

    _initCombat(enemy, kind, enemy2 = null) {
      const AD = window.AdventureDeck;

      if (!this.s.playerPile) {
        const playerDeck = AD.makePlayerDeck();
        this.s.playerPile = new AD.AdventurePile('player', playerDeck, 5);
        this.s.playerPile.draw(5);
        const initialTop = AD.drawInitialTop(this.s.playerPile.deck);
        this.s.discardTop = new AD.DiscardTop(initialTop);
      }

      const npcDeck = AD.makeNpcDeck();
      this.s.combat = {
        enemy: enemy,
        enemy2: enemy2,
        kind: kind,
        is1v2: !!enemy2,
        npcPile: new AD.AdventurePile('npc', npcDeck, 2),
        round: 1,
        selectedCard: null,
        atkCard: null,
        defCard: null,
        pendingDamage: 0,
        npcQueue: [],
        log: []
      };
      this.s.combat.npcPile.draw(2);
      this.s.phase = Phase.PLAYER_PLAY;

      this._log('战斗开始！敌方：' + enemy.name + '（HP ' + enemy.hp + '/' + enemy.maxHp + '）' + (enemy2 ? ' + ' + enemy2.name + '（HP ' + enemy2.hp + '/' + enemy2.maxHp + '）' : ''));
      this._log('牌库就绪：玩家' + this.s.playerPile.deck.length + '张库/' + this.s.playerPile.hand.length + '张手牌，NPC ' + this.s.combat.npcPile.deck.length + '张库/' + this.s.combat.npcPile.hand.length + '张明牌');
    }

    playerSelectCard(index) {
      if (this.s.phase !== Phase.PLAYER_PLAY && this.s.phase !== Phase.PLAYER_DEFEND) return false;
      if (index < 0 || index >= this.s.playerPile.hand.length) return false;
      this.s.combat.selectedCard = index;
      return true;
    }

    playerPlayCard(index) {
      if (this.s.phase !== Phase.PLAYER_PLAY) return { error: '不是你的回合' };
      const pile = this.s.playerPile;
      if (index < 0 || index >= pile.hand.length) return { error: '无效卡牌' };
      const card = pile.hand[index];
      const top = this.s.discardTop;
      if (!top.legal(card)) return { error: '这张牌不符合出牌规则' };

      pile.playFromHand(index);
      const oldTop = top.replace(card);
      pile.discardCard(oldTop);
      this.s.combat.selectedCard = null;
      this.s.combat.atkCard = card;

      if (card.potion) {
        const healAmt = 5;
        this.s.player.hp = Math.min(this.s.player.maxHp, this.s.player.hp + healAmt);
        this._log('你出药剂牌，恢复' + healAmt + '点生命');
        this.emit('playerPlay', '药剂牌：恢复' + healAmt + '生命', card, { kind: 'potion', heal: healAmt });
        this.s.combat.atkCard = null;
        this._checkCombatEnd();
        return { ok: true };
      }

      if (card.isItemCard) {
        this._log('你出' + (card.isBlack ? '黑' : '白') + '道具牌');
        this.emit('playerPlay', '道具牌', card, { kind: 'item' });
        this.s.combat.atkCard = null;
        this._checkCombatEnd();
        return { ok: true };
      }

      const dmg = this._calcPlayerDamage(card);
      this._log('你出' + (card.isWhite ? '白' : '') + card.value + '牌，造成' + dmg + '点伤害');
      this.emit('playerPlay', '出牌攻击：' + dmg + '点伤害', card, { kind: 'attack', damage: dmg });

      const defResult = this.npcDefendTurn(dmg);
      const actualDmg = this._applyEnemyDamage(defResult.remaining);
      this.emit('attackResolve', '攻击结算：造成' + actualDmg + '点伤害', null, { damage: actualDmg });

      this.s.combat.atkCard = null;
      pile.drawToLimit();
      this.s.combat.npcPile.drawToLimit();

      if (this._checkCombatEnd()) return { ok: true, combatEnd: true };
      return { ok: true };
    }

    _calcPlayerDamage(card) {
      if (!card || !card.isNumberCard) return 0;
      let dmg = card.value;
      if (this.s.player.crit > 0) {
        dmg = Math.ceil(dmg * 1.5);
        this.s.player.crit--;
        this._log('暴击！伤害×1.5=' + dmg);
      }
      return dmg;
    }

    playerEndTurn() {
      if (this.s.phase !== Phase.PLAYER_PLAY) return { error: '不是你的回合' };
      this.s.combat.selectedCard = null;
      this._log('你结束了回合');
      this.emit('playerEndTurn', '结束回合', null);
      this._startNpcTurn();
      return { ok: true };
    }

    _startNpcTurn() {
      const combat = this.s.combat;
      if (!combat) return;
      this.s.phase = Phase.NPC_TURN;
      for (const enemy of [combat.enemy, combat.enemy2]) {
        if (!enemy || enemy.hp <= 0) continue;
        if ((enemy.lush || 0) > 0) {
          const amount = Math.min(enemy.lush, 2);
          const before = enemy.hp;
          enemy.hp = Math.min(enemy.maxHp, enemy.hp + amount);
          this.emit('heal', '+' + (enemy.hp - before) + '[生命]', null, { who: 'enemy', target: 'enemy', amount: enemy.hp - before, kind: 'passive' });
        }
        if (typeof enemy.attackTurnStart === 'function') enemy.attackTurnStart(this, enemy, 'enemy');
      }
      combat.npcPile.drawToLimit();
      this._log('敌方回合开始');
      this.emit('npcTurnStart', '敌方回合', null);
      this._npcPlayNext();
    }

    _applyNpcAttackHooks(enemy, card) {
      if (!enemy || !card || card.isItemCard) return;
      const ownerLabel = enemy.name || '敌方';
      if (typeof enemy.attackLush === 'function') {
        const lush = Number(enemy.attackLush(card)) || 0;
        if (lush > 0) {
          enemy.lush = Math.min(2, (enemy.lush || 0) + lush);
            this.emit('buff', '+' + lush + '[茂盛]', null, { who: 'enemy', target: 'enemy', kind: 'lush', stacks: enemy.lush });
        }
      }
      if (typeof enemy.attackHeal === 'function') {
        const ctx = {
          playerHandSize: this.s.playerPile ? this.s.playerPile.hand.length : 0,
          playerBleed: (this.s.player.bleed || 0),
          playerPoison: (this.s.player.poison || 0),
          attackerLush: enemy.lush || 0
        };
        const amount = Number(enemy.attackHeal(card, ctx)) || 0;
        if (amount > 0) {
          const before = enemy.hp;
          enemy.hp = Math.min(enemy.maxHp, enemy.hp + amount);
          this.emit('heal', '+' + (enemy.hp - before) + '[生命]', null, { who: 'enemy', target: 'enemy', amount: enemy.hp - before, kind: 'skill' });
          this._log(ownerLabel + '恢复' + (enemy.hp - before) + '点生命');
        }
      }
    }

    _npcPlayNext() {
      const combat = this.s.combat;
      if (!combat) return;
      const pile = combat.npcPile;
      const strategy = window.AdventureNpcStrategy;

      if (pile.hand.length === 0) {
        this._endNpcTurn();
        return;
      }

      const idx = strategy.chooseAttack(pile.hand);
      if (idx < 0) {
        this._endNpcTurn();
        return;
      }

      const card = pile.playFromHand(idx);
      const oldTop = this.s.discardTop.replace(card);
      pile.discardCard(oldTop);
      combat.atkCard = card;

      if (card.magic || card.greenMagic || card.magicColor) {
        const _mHp = (window.AdventureRegistry && window.AdventureRegistry.getBoss(combat.enemy.name)) ? 5 : 3;
        combat.enemy.hp = Math.min(combat.enemy.maxHp, combat.enemy.hp + _mHp);
        if (card.greenMagic || card.magicColor === 'green') {
          combat.enemy.burn = 0; combat.enemy.bleed = 0; combat.enemy.poison = 0; combat.enemy.frozen = false; combat.enemy.bomb = 0;
          this._log('敌方出绿魔法牌，恢复' + _mHp + '点生命，清除自身负面状态');
          this.emit('npcPlay', '敌方绿魔法牌：恢复' + _mHp + '生命，清除自身负面状态', card, { kind: 'greenMagic' });
        } else {
          this._clearPlayerPositiveBuffs();
          this._log('敌方出紫魔法牌，恢复' + _mHp + '点生命，清除玩家正面buff');
          this.emit('npcPlay', '敌方紫魔法牌：恢复' + _mHp + '生命，清除玩家正面buff', card, { kind: 'magic' });
        }
        combat.atkCard = null;
        this._npcPlayNext();
        return;
      }

      const ctx = {
        playerHandSize: this.s.playerPile ? this.s.playerPile.hand.length : 0,
        playerBleed: this.s.player.bleed || 0,
        playerPoison: this.s.player.poison || 0,
        attackerLush: combat.enemy.lush || 0
      };
      this._applyNpcAttackHooks(combat.enemy, card);
      const dmg = (typeof combat.enemy.attackDamage === 'function')
        ? combat.enemy.attackDamage(card, ctx)
        : card.value;
      const drain = typeof combat.enemy.attackDrain === 'function'
        ? Math.max(0, Number(combat.enemy.attackDrain(card, ctx)) || 0)
        : 0;
      const unblockable = (typeof combat.enemy.attackUnblockable === 'function')
        ? combat.enemy.attackUnblockable(card)
        : false;

      this._log('敌方出白' + card.value + '牌，造成' + dmg + '点伤害' + (unblockable ? '（不可防御）' : ''));
      this.emit('npcPlay', '敌方攻击：' + dmg + '点伤害', card, { kind: 'attack', damage: dmg, unblockable });

      if (unblockable) {
        const actual = this._applyPlayerDamage(dmg);
        this._applyNpcDrain(combat.enemy, actual, drain);
        combat.atkCard = null;
        if (this._checkCombatEnd()) return;
        this._npcPlayNext();
        return;
      }

      combat.pendingDamage = dmg;
      combat.pendingDrain = drain;
      this.s.phase = Phase.PLAYER_DEFEND;
      this.emit('playerDefend', '请防御' + dmg + '点伤害', null, { damage: dmg });
    }

    playerDefendCard(index) {
      if (this.s.phase !== Phase.PLAYER_DEFEND) return { error: '不是防御阶段' };
      const pile = this.s.playerPile;
      if (index < 0 || index >= pile.hand.length) return { error: '无效卡牌' };
      const card = pile.hand[index];
      const top = this.s.discardTop;
      if (!top.legal(card, true)) return { error: '这张牌不能用于防御' };

      pile.playFromHand(index);
      const oldTop = top.replace(card);
      pile.discardCard(oldTop);
      this.s.combat.defCard = card;

      let block = 0;
      if (card.value === 1) block = Math.ceil(this.s.combat.pendingDamage / 2);
      else if (card.value === 3) block = Math.floor(this.s.combat.pendingDamage / 2);
      else if (card.value === 2) block = 1;

      const remaining = Math.max(0, this.s.combat.pendingDamage - block);
      this._log('你防御出白' + card.value + '牌，格挡' + block + '点，剩余' + remaining + '点');
      this.emit('playerDefend', '防御：格挡' + block + '点', card, { kind: 'defend', block, remaining });

      this._applyPlayerDamage(remaining);
      this._applyNpcDrain(this.s.combat.enemy, remaining, this.s.combat.pendingDrain || 0);
      this.s.combat.defCard = null;
      this.s.combat.atkCard = null;
      this.s.combat.pendingDamage = 0;
      this.s.combat.pendingDrain = 0;
      pile.drawToLimit();

      if (this._checkCombatEnd()) return { ok: true, combatEnd: true };
      this.s.phase = Phase.NPC_TURN;
      this._npcPlayNext();
      return { ok: true };
    }

    playerSkipDefend() {
      if (this.s.phase !== Phase.PLAYER_DEFEND) return { error: '不是防御阶段' };
      const dmg = this.s.combat.pendingDamage;
      this._log('你选择不防御，承受' + dmg + '点伤害');
      this.emit('playerDefend', '跳过防御', null, { kind: 'skip' });

      const actual = this._applyPlayerDamage(dmg);
      this._applyNpcDrain(this.s.combat.enemy, actual, this.s.combat.pendingDrain || 0);
      this.s.combat.atkCard = null;
      this.s.combat.pendingDamage = 0;
      this.s.combat.pendingDrain = 0;
      this.s.playerPile.drawToLimit();

      if (this._checkCombatEnd()) return { ok: true, combatEnd: true };
      this.s.phase = Phase.NPC_TURN;
      this._npcPlayNext();
      return { ok: true };
    }

    _applyPlayerDamage(damage) {
      if (damage <= 0) return 0;
      const p = this.s.player;
      let remaining = damage;
      while ((p.fly || 0) > 0 && remaining > 0) {
        p.fly--;
        this._log('你消耗1层飞翔尝试躲避');
        if (Math.random() < 0.5) {
          remaining = 0;
          this._log('飞翔躲避成功');
          break;
        }
        this._log('飞翔躲避失败');
      }
      if ((p.guard || 0) > 0 && remaining > 0) {
        const used = Math.min(p.guard, remaining);
        p.guard -= used;
        remaining -= used;
        this._log('你消耗' + used + '层守护，减免' + used + '点伤害');
        this.emit('playerGuard', '消耗守护', { used, guardLeft: p.guard });
      }
      p.hp = Math.max(0, p.hp - remaining);
      this._log('你受到' + remaining + '点伤害，剩余' + p.hp + '/' + p.maxHp + '生命');
      this.emit('playerHurt', '受到伤害', { damage: remaining, hp: p.hp });
      return remaining;
    }

    _applyNpcDrain(enemy, actualDamage, nominalDrain) {
      const amount = Math.min(Math.max(0, Number(actualDamage) || 0), Math.max(0, Number(nominalDrain) || 0));
      if (!enemy || amount <= 0) return 0;
      const before = enemy.hp;
      enemy.hp = Math.min(enemy.maxHp, enemy.hp + amount);
      const actual = enemy.hp - before;
      if (actual > 0) {
        this.emit('heal', '+' + actual + '[吸血]', null, { who: 'enemy', target: 'enemy', amount: actual, kind: 'drain' });
        this._log(enemy.name + '吸取' + actual + '点生命');
      }
      return actual;
    }

    _endNpcTurn() {
      const combat = this.s.combat;
      if (!combat) return;
      combat.round++;
      combat.npcPile.drawToLimit();
      this.s.playerPile.drawToLimit();
      this._log('敌方回合结束，第' + combat.round + '轮开始');
      this.emit('npcTurnEnd', '敌方回合结束', null);
      this.s.phase = Phase.PLAYER_PLAY;
    }

    _checkCombatEnd() {
      const combat = this.s.combat;
      if (!combat) return false;
      if (combat.enemy.hp <= 0) {
        this.onCombatEnd('win');
        return true;
      }
      if (this.s.player.hp <= 0) {
        this.onCombatEnd('lose');
        return true;
      }
      return false;
    }

    _runCombat(enemy, kind) {
    }

    npcAttackTurn() {
      const combat = this.s.combat;
      if (!combat) return null;
      const pile = combat.npcPile;
      const strategy = window.AdventureNpcStrategy;
      const played = [];

      while (pile.hand.length > 0) {
        const idx = strategy.chooseAttack(pile.hand);
        if (idx < 0) break;
        const card = pile.playFromHand(idx);
        const oldTop = this.s.discardTop.replace(card);
        pile.discardCard(oldTop);
        played.push(card);

        if (card.magic || card.greenMagic || card.magicColor) {
          const _mHp = (window.AdventureRegistry && window.AdventureRegistry.getBoss(combat.enemy.name)) ? 5 : 3;
          combat.enemy.hp = Math.min(combat.enemy.maxHp, combat.enemy.hp + _mHp);
          if (card.greenMagic || card.magicColor === 'green') {
            combat.enemy.burn = 0; combat.enemy.bleed = 0; combat.enemy.poison = 0; combat.enemy.frozen = false; combat.enemy.bomb = 0;
            this._log('NPC 出绿魔法牌，恢复' + _mHp + '点生命，清除自身负面状态，继续搭桥');
            this.emit('npcPlay', 'NPC 绿魔法牌：恢复' + _mHp + '点生命，清除自身负面状态', card, { kind: 'greenMagic' });
          } else {
            this._clearPlayerPositiveBuffs();
            this._log('NPC 出紫魔法牌，恢复' + _mHp + '点生命，清除玩家正面buff，继续搭桥');
            this.emit('npcPlay', 'NPC 紫魔法牌：恢复' + _mHp + '点生命，清除玩家正面buff', card, { kind: 'magic' });
          }
        } else {
          const ctx = {
            playerHandSize: this.s.playerPile ? this.s.playerPile.hand.length : 0,
            playerBleed: this.s.player.bleed || 0,
            playerPoison: this.s.player.poison || 0,
            attackerLush: combat.enemy.lush || 0
          };
          this._applyNpcAttackHooks(combat.enemy, card);
          const dmg = (typeof combat.enemy.attackDamage === 'function')
            ? combat.enemy.attackDamage(card, ctx)
            : card.value;
          const unblockable = (typeof combat.enemy.attackUnblockable === 'function')
            ? combat.enemy.attackUnblockable(card)
            : false;
          this._log('NPC 出白' + card.value + '牌，造成' + dmg + '点伤害' + (unblockable ? '（不可防御）' : ''));
          this.emit('npcPlay', 'NPC 白' + card.value + '：' + dmg + '点伤害', card, { kind: 'attack', damage: dmg, unblockable });
        }
      }

      this.emit('npcAttackEnd', 'NPC进攻结束：共出' + played.length + '张牌', null, { count: played.length });
      pile.drawToLimit();
      return played;
    }

    npcDefendTurn(incomingDamage) {
      const combat = this.s.combat;
      if (!combat) return { remaining: incomingDamage, defended: false };
      const pile = combat.npcPile;
      const strategy = window.AdventureNpcStrategy;
      const idx = strategy.chooseDefend(pile.hand);

      if (idx < 0) {
        this._log('NPC 无可防御牌，承受全部' + incomingDamage + '点伤害');
        return { remaining: incomingDamage, defended: false, card: null };
      }

      const card = pile.playFromHand(idx);
      const oldTop = this.s.discardTop.replace(card);
      pile.discardCard(oldTop);

      if (card.magic || card.greenMagic || card.magicColor) {
        const _mHp = (window.AdventureRegistry && window.AdventureRegistry.getBoss(combat.enemy.name)) ? 5 : 3;
        combat.enemy.hp = Math.min(combat.enemy.maxHp, combat.enemy.hp + _mHp);
        if (card.greenMagic || card.magicColor === 'green') {
          combat.enemy.burn = 0; combat.enemy.bleed = 0; combat.enemy.poison = 0; combat.enemy.frozen = false; combat.enemy.bomb = 0;
          this._log('NPC 防御出绿魔法牌，恢复' + _mHp + '点生命，清除自身负面状态');
          this.emit('npcDefend', 'NPC 绿魔法牌防御：恢复' + _mHp + '点生命，清除自身负面状态', card, { kind: 'greenMagic' });
        } else {
          this._clearPlayerPositiveBuffs();
          this._log('NPC 防御出紫魔法牌，恢复' + _mHp + '点生命，清除玩家正面buff');
          this.emit('npcDefend', 'NPC 紫魔法牌防御：恢复' + _mHp + '点生命，清除玩家正面buff', card, { kind: 'magic' });
        }
        return { remaining: incomingDamage, defended: true, card };
      }

      const healAmt = (typeof combat.enemy.defendHeal === 'function')
        ? combat.enemy.defendHeal(card)
        : 0;
      if (healAmt > 0) {
        combat.enemy.hp = Math.min(combat.enemy.maxHp, combat.enemy.hp + healAmt);
        this._log('NPC 防御出白' + card.value + '牌，恢复' + healAmt + '点生命');
        this.emit('npcDefend', 'NPC 白' + card.value + '防御：恢复' + healAmt + '点生命', card, { kind: 'defend-heal', heal: healAmt });
        return { remaining: incomingDamage, defended: true, card };
      }

      const block = (typeof combat.enemy.defendBlock === 'function')
        ? combat.enemy.defendBlock(card, incomingDamage)
        : (card.value === 1 ? Math.ceil(incomingDamage / 2)
         : card.value === 3 ? Math.floor(incomingDamage / 2)
         : 0);
      const remaining = Math.max(0, incomingDamage - block);
      this._log('NPC 防御出白' + card.value + '牌，格挡' + block + '点，剩余' + remaining + '点');
      this.emit('npcDefend', 'NPC 白' + card.value + '防御：格挡' + block + '点', card, { kind: 'defend', block, remaining });
      return { remaining, defended: true, card };
    }

    _applyEnemyDamage(damage) {
      if (!this.s || !this.s.combat || damage <= 0) return 0;
      const enemy = this.s.combat.enemy;
      let remaining = damage;
      if ((enemy.guard || 0) > 0 && remaining > 0) {
        const used = Math.min(enemy.guard, remaining);
        enemy.guard -= used;
        remaining -= used;
        this._log('敌方消耗' + used + '层守护，减免' + used + '点伤害（剩余守护' + enemy.guard + '层）');
        this.emit('enemyGuard', '敌方消耗守护', { used, guardLeft: enemy.guard });
      }
      enemy.hp = Math.max(0, enemy.hp - remaining);
      this._log('敌方受到' + remaining + '点伤害，剩余' + enemy.hp + '/' + enemy.maxHp + '生命');
      this.emit('enemyHurt', '敌方受到伤害', { damage: remaining, hp: enemy.hp });
      return remaining;
    }

    onCombatEnd(result) {
      if (!this.s || !this.s.combat) return;
      const room = this.currentRoom();
      if (result === 'win') {
        this._log('战斗胜利');
        const isBoss = room && room.type === window.RoomType.BOSS;
        const healAmt = isBoss ? 10 : 3;
        this.s.player.hp = Math.min(this.s.player.maxHp, this.s.player.hp + healAmt);
        this._log('恢复' + healAmt + '点生命（当前' + this.s.player.hp + '/' + this.s.player.maxHp + '）');
        if (this.hasAccessory('LifeCore')) {
          const lcDef = window.AdventureRegistry.getItem('LifeCore');
          const perCore = (lcDef && lcDef.onCombatWinHeal) || 3;
          const lcCount = this.accessoryCount('LifeCore');
          const lcN = perCore * lcCount;
          const lcBefore = this.s.player.hp;
          this.s.player.hp = Math.min(this.s.player.maxHp, this.s.player.hp + lcN);
          const lcHealed = this.s.player.hp - lcBefore;
          if (lcHealed > 0) {
            this._log('生命核心：额外恢复' + lcHealed + '点生命');
            this.emit('accessory', '生命核心回复', { itemName: 'LifeCore', amount: lcHealed });
          }
        }
        room.cleared = true;
        room.visited = true;
        this._applyWisdomNecklaceDraw();
        this.emit('combatEnd', '战斗胜利', { result: 'win' });
        this._prepareCombatSettlement(room);
      } else {
        this._log('战斗失败');
        this.emit('combatEnd', '战斗失败', { result: 'lose' });
        this.s.pendingCombatReward = null;
        this.s.phase = Phase.GAME_OVER;
        this.emit('gameOver', '冒险失败', { reason: 'combat' });
      }
      this.s.combat = null;
    }

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
    }

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
    }

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
    }

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
    }

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
    }

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
    }

    _stashBasicLoot(room, loot) {
      if (!room) return;
      if (!loot || loot.kind === 'none') {
        room.stashedLoot = null;
        room.rewardClaimed = true;
        return;
      }
      room.stashedLoot = this._cloneLoot(loot);
      room.rewardClaimed = false;
    }

    _clearStashedLoot(room) {
      if (!room) return;
      room.stashedLoot = null;
      room.rewardClaimed = true;
    }

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
    }

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
    }

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
    }

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

    /** 领取基础奖励后进入兽元结算 */
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

    /** 基础奖励留在房间，随后进入兽元结算 */
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
    }

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
    }

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

    /** 兽元舍弃完成后，若还欠专属兽元结算则继续 */
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
    }

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
    }

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
    }

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
    }

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
    }

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
    }

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
    }

    confirmBeastTokenChoice() {
      if (this.s.phase !== Phase.BEAST_CHOICE) return false;
      const scenario = this.s.beastReward;
      if (!scenario) return false;
      if (this.s.beastSelection.length < scenario.pickCount) return false;
      this._confirmBeastTokenChoice();
      return true;
    }

    unselectBeastToken(idx) {
      if (this.s.phase !== Phase.BEAST_CHOICE) return false;
      if (idx < 0 || idx >= this.s.beastSelection.length) return false;
      const slotIndex = this.s.beastSelection.splice(idx, 1)[0];
      const type = this._offeredSlotTypes(this.s.beastReward)[slotIndex];
      this.emit('beastUnselect', '取消选中' + window.AdventureCurrency.BEAST_LABEL[type], { type, slotIndex, selected: this._selectedBeastTypes() });
      return true;
    }

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
    }

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
    }

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
    }

    _selectedBeastTypes() {
      if (!this.s.beastReward) return [];
      const slots = this._offeredSlotTypes(this.s.beastReward);
      return this.s.beastSelection.map(i => slots[i]).filter(Boolean);
    }

    _offeredOriginal(scenario) {
      const orig = { ben: 0, cao: 0, shui: 0, huo: 0, wuneng: 0 };
      if (!scenario) return orig;
      if (scenario.offeredTypes) {
        scenario.offeredTypes.forEach(t => { orig[t] = 2; });
      } else if (scenario.offered) {
        for (const k in scenario.offered) orig[k] = scenario.offered[k];
      }
      return orig;
    }

    _offeredSlotTypes(scenario) {
      const orig = this._offeredOriginal(scenario);
      const slots = [];
      window.AdventureCurrency.ALL_BEAST_TYPES.forEach(type => {
        const count = orig[type] || 0;
        for (let i = 0; i < count; i++) slots.push(type);
      });
      return slots;
    }

    _offeredSlots(scenario) {
      const slots = this._offeredSlotTypes(scenario);
      const selected = new Set(this.s.beastSelection || []);
      return slots.map((type, index) => ({
        type,
        index,
        selected: selected.has(index)
      }));
    }

    _offeredAvailable(scenario) {
      const avail = this._offeredOriginal(scenario);
      this._selectedBeastTypes().forEach(t => { avail[t] = Math.max(0, avail[t] - 1); });
      return avail;
    }

    _tokenText(tokenMap) {
      const parts = [];
      for (const k in tokenMap) {
        if (tokenMap[k] > 0) parts.push(window.AdventureCurrency.BEAST_LABEL[k] + '×' + tokenMap[k]);
      }
      return parts.join('、') || '无';
    }

    burn(target, n) {
      if (n <= 0) return;
      if (target === this.s.player && this.s.player.name === 'Leon') return;
      const prev = target.burn || 0;
      target.burn = Math.min(4, prev + n);
      this._log((target === this.s.player ? '玩家' : '敌方') + '灼烧+' + n + '（当前' + target.burn + '层）');
      const targetKey = target === this.s.player ? 'player' : 'enemy';
      this.emit('buff', '+' + n + '[灼烧]', null, { who: targetKey, target: targetKey, kind: 'burn', stacks: target.burn });
    }

    bleed(target, n) {
      if (n <= 0) return;
      const prev = target.bleed || 0;
      target.bleed = Math.min(2, prev + n);
      this._log((target === this.s.player ? '玩家' : '敌方') + '流血+' + n + '（当前' + target.bleed + '层）');
      const targetKey = target === this.s.player ? 'player' : 'enemy';
      this.emit('buff', '+' + n + '[流血]', null, { who: targetKey, target: targetKey, kind: 'bleed', stacks: target.bleed });
    }

    poison(target, n) {
      if (n <= 0) return;
      const prev = target.poison || 0;
      target.poison = Math.min(3, prev + n);
      this._log((target === this.s.player ? '玩家' : '敌方') + '中毒+' + n + '（当前' + target.poison + '层）');
      const targetKey = target === this.s.player ? 'player' : 'enemy';
      this.emit('buff', '+' + n + '[中毒]', null, { who: targetKey, target: targetKey, kind: 'poison', stacks: target.poison });
    }

    freeze(target) {
      if (target === this.s.player && this.s.player.name === 'Serenity') return;
      target.frozen = true;
      this._log((target === this.s.player ? '玩家' : '敌方') + '被冷冻');
      const targetKey = target === this.s.player ? 'player' : 'enemy';
      this.emit('buff', '[冷冻]', null, { who: targetKey, target: targetKey, kind: 'freeze', stacks: 1 });
    }

    addGuard(target, n) {
      if (n <= 0) return;
      target.guard = Math.min(5, (target.guard || 0) + n);
      this._log((target === this.s.player ? '玩家' : '敌方') + '守护+' + n + '（当前' + target.guard + '层）');
      const targetKey = target === this.s.player ? 'player' : 'enemy';
      this.emit('buff', '+' + n + '[守护]', null, { who: targetKey, target: targetKey, kind: 'guard', stacks: target.guard });
    }

    addCrit(n) {
      if (n <= 0) return;
      this.s.player.crit = Math.min(2, (this.s.player.crit || 0) + n);
      this._log('玩家暴击+' + n + '（当前' + this.s.player.crit + '层）');
      this.emit('buff', '+' + n + '[暴击]', null, { who: 'player', kind: 'crit', stacks: this.s.player.crit });
    }

    setChaos(color, on) {
      const key = 'chaos_' + color;
      this.s.player[key] = !!on;
      this._log('玩家混沌' + color + (on ? '开启' : '关闭'));
      this.emit('buff', (on ? '+' : '-') + '[混沌' + color + ']', null, { who: 'player', kind: 'chaos_' + color, stacks: on ? 1 : 0 });
    }

    clearDebuffs(target) {
      target.burn = 0;
      target.bleed = 0;
      target.poison = 0;
      target.blind = 0;
      target.frozen = false;
      this._log((target === this.s.player ? '玩家' : '敌方') + 'debuff已清除');
      const targetKey = target === this.s.player ? 'player' : 'enemy';
      this.emit('buff', '清除debuff', null, { who: targetKey, target: targetKey, kind: 'clearDebuffs' });
    }

    _clearPlayerPositiveBuffs() {
      const p = this.s.player;
      if (!p) return;
      p.guard = 0;
      p.fly = 0;
      p.crit = 0;
      p.lush = 0;
      p.chaos_red = false;
      p.chaos_yellow = false;
      p.chaos_blue = false;
      p.chaos_green = false;
      this._log('玩家正面buff已清除');
    }

    tickBuffs(target) {
      const who = target === this.s.player ? '玩家' : '敌方';
      if (target.burn > 0) {
        const dmg = target.burn;
        target.burn--;
        target.hp = Math.max(0, target.hp - dmg);
        this._log(who + '灼烧结算：-' + dmg + '生命，灼烧层数-1');
        const targetKey = target === this.s.player ? 'player' : 'enemy';
        this.emit('buffSettle', '-' + dmg + '[灼烧]', null, { who: targetKey, target: targetKey, amount: dmg, kind: 'burn' });
      }
      if (target.bleed > 0) {
        const dmg = target.bleed;
        target.bleed--;
        target.hp = Math.max(0, target.hp - dmg);
        this._log(who + '流血结算：-' + dmg + '生命，流血层数-1');
        const targetKey = target === this.s.player ? 'player' : 'enemy';
        this.emit('bleedSettle', '-' + dmg + '[流血]，-1[流血层数]', null, { who: targetKey, target: targetKey, amount: dmg, kind: 'bleed' });
      }
      if (target.frozen) {
        target.frozen = false;
        this._log(who + '冷冻解除');
        const targetKey = target === this.s.player ? 'player' : 'enemy';
        this.emit('buff', '-[冷冻]', null, { who: targetKey, target: targetKey, kind: 'freeze', stacks: 0 });
      }
    }

    isDebuffed(target) {
      return (target.burn || 0) > 0 || (target.bleed || 0) > 0 || (target.poison || 0) > 0 || (target.blind || 0) > 0 || !!target.frozen;
    }

    playerBuffs() {
      const p = this.s.player;
      return {
        burn: p.burn || 0,
        bleed: p.bleed || 0,
        poison: p.poison || 0,
        blind: p.blind || 0,
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
    }

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
    }

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
    }

    enterNextStage() {
      const room = this.currentRoom();
      if (!room || room.type !== window.RoomType.BOSS || !room.cleared) return;
      this.s.pendingCombatReward = null;
      this.s.phase = Phase.CLEAR;
      this.emit('stageClear', '进入下一层', {});
      this._log('进入下一层');
    }

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
    }

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
    }

    _defaultReward(room) {
      return null;
    }

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
    }

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
    }

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
    }

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
    }

    _applyAccessoryOnAdd(def) {
      if (def.statBonus && def.statBonus.maxHp) {
        this.s.player.maxHp += def.statBonus.maxHp;
        this.s.player.hp += def.statBonus.maxHp;
      }
      this._syncBeastCap();
    }

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
    }

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
    }

    _isCombatPhase(phase) {
      return phase === Phase.COMBAT || phase === Phase.PLAYER_PLAY ||
        phase === Phase.PLAYER_DEFEND || phase === Phase.NPC_TURN;
    }

    _listPurifyKinds(ch) {
      const kinds = [];
      if (!ch) return kinds;
      if ((ch.burn || 0) > 0) kinds.push('burn');
      if ((ch.bleed || 0) > 0) kinds.push('bleed');
      if ((ch.poison || 0) > 0) kinds.push('poison');
      if ((ch.blind || 0) > 0) kinds.push('blind');
      if (ch.frozen) kinds.push('freeze');
      if ((ch.bomb || 0) > 0) kinds.push('bomb');
      if ((ch.guard || 0) > 0) kinds.push('guard');
      if ((ch.fly || 0) > 0) kinds.push('fly');
      if ((ch.crit || 0) > 0) kinds.push('crit');
      if ((ch.lush || 0) > 0) kinds.push('lush');
      return kinds;
    }

    _hasPurifyableDebuff(player, opponent) {
      if (this._listPurifyKinds(player).length) return true;
      return this._listPurifyKinds(opponent).length > 0;
    }

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
      return false;
    }

    _normalizePurifyChoice(choice) {
      if (!choice) return null;
      if (typeof choice === 'string') return { who: 'self', kind: choice };
      return { who: choice.who === 'opp' ? 'opp' : 'self', kind: choice.kind };
    }

    _applyPurifyChoices(player, kinds, opponent) {
      let removed = 0;
      for (const raw of kinds) {
        const choice = this._normalizePurifyChoice(raw);
        if (!choice) continue;
        const target = choice.who === 'opp' ? opponent : player;
        if (this._applyPurifyKind(target, choice.kind)) removed++;
      }
      return removed;
    }

    _applyConsumableEffect(def, ctx) {
      const player = ctx.player || this.s.player;
      const combat = ctx.combat || this.s.combat;
      const enemy = combat && combat.enemy ? combat.enemy : null;
      const kind = def.combatUse || '';

      switch (kind) {
        case 'heal': {
          const amount = def.healAmount || 5;
          const before = player.hp;
          player.hp = Math.min(player.maxHp, player.hp + amount);
          return { ok: true, message: '恢复' + (player.hp - before) + '点生命' };
        }
        case 'purify': {
          const count = def.purifyCount || 1;
          if (!this._hasPurifyableDebuff(player)) {
            return { ok: false, message: '当前没有可净化的负面状态' };
          }
          const choices = ctx.purifyChoices;
          if (!choices || !choices.length) {
            return { ok: false, needsPurifyChoice: true, purifyCount: count, message: '请选择要净化的负面状态' };
          }
          const removed = this._applyPurifyChoices(player, choices.slice(0, count));
          if (!removed) return { ok: false, message: '无效的选择' };
          return { ok: true, message: '净化' + removed + '个负面状态' };
        }
        case 'burn':
        case 'bleed':
        case 'freeze':
        case 'vampire':
        case 'buffTransfer':
        case 'attackMod':
        case 'dodge':
          if (!ctx.inCombat || !enemy) {
            return { ok: false, message: def.displayName + '只能在对战中使用' };
          }
          return { ok: false, message: '请在对战界面使用' + def.displayName };
        case 'cardMaster': {
          const choice = ctx.cardMasterChoice;
          if (choice !== 'draw2' && choice !== 'mulligan') {
            return { ok: false, needsChoice: true, message: '请选择效果' };
          }
          const pile = this.s.playerPile;
          if (!pile) return { ok: false, message: '牌库尚未初始化' };
          if (choice === 'draw2') {
            const drawn = pile.draw(2);
            return { ok: true, message: '抽取' + drawn.length + '张牌' };
          }
          const n = pile.hand.length;
          while (pile.hand.length) {
            const card = pile.hand.pop();
            pile.discardCard(card);
          }
          const redrawn = pile.draw(n);
          return { ok: true, message: '弃掉' + n + '张并重抽' + redrawn.length + '张' };
        }
        default:
          return { ok: false, message: '该道具暂无可用效果' };
      }
    }

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
    }

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
    }

    _rollItemDrop() {
      const consumables = window.AdventureRegistry.itemsByKind('consumable');
      const trophyWhites = window.AdventureRegistry.itemsByKind('trophyWhite');
      const dropable = consumables.concat(trophyWhites);
      if (!dropable.length) return null;
      return dropable[Math.floor(Math.random() * dropable.length)].name;
    }

    _rollCombatDrop() {
      const bonus = this.getAccessoryStatBonuses();
      const baseRate = 0.25 + (bonus.dropRateBonus || 0);
      if (Math.random() >= baseRate) return null;
      return this._rollItemDrop();
    }

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
    }

    selectShopSlot(index) {
      if (this.s.phase !== Phase.SHOP) return false;
      if (index < 0 || index >= SHOP_SLOT_COUNT) return false;
      this.s.shopSelectedSlot = index;
      this.emit('shopSelect', '选中商店槽位', { index });
      return true;
    }

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
    }

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
    }

    _applyWisdomNecklaceDraw() {
      if (!this.hasAccessory('WisdomNecklace') || !this.s.playerPile) return;
      const def = window.AdventureRegistry.getItem('WisdomNecklace');
      const n = (def && def.onCombatWinDraw) || 2;
      const drawn = this.s.playerPile.draw(n);
      this._log('智慧项链：补' + drawn.length + '张牌');
      this.emit('accessory', '智慧项链补牌', { itemName: 'WisdomNecklace', drawn: drawn.length });
    }

    leaveShop() {
      if (this.s.phase !== Phase.SHOP) return;
      const room = this.currentRoom();
      if (room) room.visited = true;
      this.s.shopSelectedSlot = null;
      this.s.phase = Phase.MAP;
      this.emit('shopLeave', '离开商店', {});
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
        playerPile: this.s.playerPile ? this.s.playerPile.summary() : null,
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
          discardTop: this.s.discardTop ? (this.s.discardTop.get() ? { color: this.s.discardTop.get().color, value: this.s.discardTop.get().value, isWhite: this.s.discardTop.get().isWhite, isItemCard: this.s.discardTop.get().isItemCard, chosenColor: this.s.discardTop.get().chosenColor || null } : null) : null
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
                    price: SHOP_ACCESSORY_PRICE,
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
                  price: def.price || 0,
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
})();

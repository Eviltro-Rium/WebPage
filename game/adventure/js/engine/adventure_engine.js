/**
 * 冒险引擎 AdventureEngine
 * 串联一层地牢的完整流程：地图浏览 → 进入房间 → 战斗/拾取/购买 → 奖励 → 移动 → 通关。
 *
 *   - 玩家牌库与手牌跨战斗持久保持：首场战斗初始化，后续战斗沿用上场结束时的状态。
 *   - 玩家状态效果（灼伤/流血/冷冻/守护/飞翔/暴击/混沌）跨战斗持久保持，战斗结束时不清除。
 *   - 普通/Boss房：战斗胜利后先结算基础奖励，可领取或留在房间；
 *     随后再进行专门的兽元结算（普通房），领完再返回地图。
 *   - 奖励房：开门后本层只滚动一次奖励；可领取或留在房间，已领取后不能再刷。
 *   - 挑战房：无普通战斗基础奖励；胜利后仅结算挑战房奖励，再进入兽元全选。
 *   - 商店：6 槽（3 道具 + 2 兽元 + 1 配饰）；道具/配饰刷新 2 金币，配饰 15 金币购买；兽元 2/万能 4 金币。
 */
(function () {
  const random = () => window.FurryGame && window.FurryGame.CombatRuntime
    ? window.FurryGame.CombatRuntime.random() : Math.random();
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
    GLITCH:      'ADVENTURE_GLITCH',
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
    ADVENTURE_GLITCH:      '故障房',
    ADVENTURE_CLEAR:       '通关',
    ADVENTURE_GAME_OVER:   '游戏结束'
  };

  function availableAtStage(def, stage) {
    return !!def && (!Number.isFinite(Number(def.minStage)) || stage >= Number(def.minStage));
  }

  function sceneEncounterNames(scene, stage, kind) {
    const pools = kind === 'boss' ? window.AdventureBossPool
      : kind === 'elite' ? window.AdventureElitePool
        : window.AdventureMonsterPool;
    const pool = pools && pools[scene];
    if (!pool) return [];
    if (Array.isArray(pool)) return pool;
    const configured = pool[stage] ?? pool['*'];
    if (Array.isArray(configured)) return configured;
    if (configured == null) return [];
    // Legacy pools may omit per-stage keys and rely on flattening every entry.
    return [...new Set(Object.values(pool).flat())];
  }

  class AdventureEngine {
    static availableScenes(stage) {
      const registry = window.AdventureRegistry;
      return ['castle', 'forest', 'ocean', 'desert', 'volcano'].filter(scene => registry &&
        sceneEncounterNames(scene, stage, 'boss').some(name => availableAtStage(registry.getBoss(name), stage)));
    }
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

    queueMapRecovery(effect) {
      if (!this.s || !effect) return;
      (this.s.pendingMapRecoveries ||= []).push({
        label: effect.label || '',
        itemName: effect.itemName || undefined,
        heal: Math.max(0, Number(effect.heal) || 0),
        drawn: Math.max(0, Number(effect.drawn) || 0),
        hpBefore: effect.hpBefore
      });
    }

    takeMapRecoveryFeedback() {
      if (!this.s) return [];
      const list = this.s.pendingMapRecoveries || [];
      this.s.pendingMapRecoveries = [];
      return list;
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
        thorns: 0,
        sandblind: 0,
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
      const status = window.FurryGame && window.FurryGame.StatusService;
      if (status && status.ensure) status.ensure(player);

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
        magazineReserve: [],
        playerPile: null,
        discardTop: null,
        discardTopOwner: null,
        combat: null,
        beastReward: null,
        beastSelection: [],
        pendingDiscard: 0,
        pendingHandDiscard: null,
        pendingItemDiscard: 0,
        itemDiscardReturn: null,
        pendingCombatReward: null,
        pendingRoomReward: null,
        activeCombat: null,
        shopSelectedSlot: null,
        blacksmithSelectedSlot: null,
        phase: Phase.MAP,
        log: [],
        turn: 0,
        stage: opts.stage || 1,
        finalEnemyAwakened: false,
        finalEnemyDefeated: false,
        scene: opts.scene || 'castle',
        usedScenes: [opts.scene || 'castle'],
        pendingMapReturnEffects: null,
        pendingMapRecoveries: [],
        serenityDiscardRecoveryVersion: 1,
        pendingBeastPayment: null
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
      // Accessories like MagicBook adjust handLimit; sync AFTER the pile exists.
      this._syncHandLimit();
      this.s.playerPile.draw(this.s.playerPile.handLimit);
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
      this.mapName = save.mapName;
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
        pendingHandDiscard: clone(save.pendingHandDiscard) || null,
        pendingItemDiscard: save.pendingItemDiscard || 0,
        itemDiscardReturn: clone(save.itemDiscardReturn) || null,
        pendingCombatReward: clone(save.pendingCombatReward) || null,
        pendingRoomReward: clone(save.pendingRoomReward) || null,
        activeCombat: clone(save.activeCombat) || null,
        shopSelectedSlot: save.shopSelectedSlot == null ? null : save.shopSelectedSlot,
        blacksmithSelectedSlot: save.blacksmithSelectedSlot == null ? null : save.blacksmithSelectedSlot,
        phase: save.phase,
        log: (save.log || []).slice(),
        turn: save.turn || 0,
        stage: save.stage || 1,
        finalEnemyAwakened: !!save.finalEnemyAwakened,
        finalEnemyDefeated: !!save.finalEnemyDefeated || (save.finalEnemyDefeated == null && save.phase === Phase.CLEAR && save.stage >= 4),
        scene: save.scene || 'castle',
        usedScenes: Array.from(new Set([...(save.usedScenes || []), save.scene || 'castle'])),
        pendingMapReturnEffects: clone(save.pendingMapReturnEffects) || null,
        pendingMapRecoveries: clone(save.pendingMapRecoveries) || [],
        serenityDiscardRecoveryVersion: save.serenityDiscardRecoveryVersion == null ? 0 : save.serenityDiscardRecoveryVersion,
        pendingBeastPayment: clone(save.pendingBeastPayment) || null,
        magazineReserve: clone(save.magazineReserve) || []
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
          room.glitchEvent = d.glitchEvent ? clone(d.glitchEvent) : null;
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
          if (!save.explorationVersion) {
            // Old builds marked a single click as visited. Retain evidence of
            // an actual entry/completion, but remove selection-only marks.
            room.visited = room.opensExploration() || room.cleared ||
              (room.isCombatRoom() && !!d.visited && !!(d.monsterName || d.bossName));
          }
        }
      }

      this._syncBeastCap();
      this._syncHandLimit();
      this._initItemDoorCosts(map);
      if (this.s.phase === Phase.MAP && !this.s.activeCombat &&
          (!this.s.pos || !map.explorablePositions().has(this.s.pos.r + ',' + this.s.pos.c))) {
        this.s.pos = map.start ? {r:map.start.r, c:map.start.c} : null;
      }
      if (!this.s.activeCombat) this.recoverLegacySerenityCards();
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

    explorableRooms() {
      if (!this.s || this.s.activeCombat) return new Set();
      const blocked = [Phase.PLAYER_PLAY, Phase.PLAYER_DEFEND, Phase.NPC_TURN,
        Phase.BEAST_CHOICE, Phase.BEAST_DISCARD, Phase.ITEM_DISCARD, Phase.COMBAT_SETTLE, Phase.GLITCH, Phase.GAME_OVER];
      if (blocked.includes(this.s.phase)) return new Set();
      return this.s.map.explorablePositions();
    }

    canMoveTo(r, c) {
      if (!Number.isInteger(r) || !Number.isInteger(c) || !this.s) return false;
      const room = this.s.map.get(r, c);
      return !!room && room.isEnterable() && this.explorableRooms().has(r + ',' + c);
    }

    move(r, c) {
      if (!this.canMoveTo(r, c)) return false;
      this.s.pos = { r, c };
      const room = this.s.map.get(r, c);
      this._log('移动到 (' + (r + 1) + ',' + (c + 1) + ') ' + room.label() + '房间');
      this.emit('move', '移动', { r, c, roomType: room.type });
      return true;
    }

    /**
     * Lock the current room encounter into the adventure save so a page
     * refresh cannot walk away from an unfinished fight and rematch the NPC.
     */
    markActiveCombat(meta = {}) {
      if (!this.s || !this.s.pos) return null;
      const room = this.currentRoom();
      if (room) room.visited = true;
      const enemy = meta.enemy || (this.s.combat && (typeof this.s.combat.enemy === 'string'
        ? this.s.combat.enemy
        : this.s.combat.enemy && this.s.combat.enemy.name)) || null;
      const enemy2 = meta.enemy2 || (this.s.combat && (typeof this.s.combat.enemy2 === 'string'
        ? this.s.combat.enemy2
        : this.s.combat.enemy2 && this.s.combat.enemy2.name)) || null;
      if (room) {
        if (enemy && (room.type === window.RoomType.NORMAL || room.type === window.RoomType.ELITE ||
          room.type === window.RoomType.CHALLENGE || room.type === window.RoomType.GLITCH)) {
          room.monsterName = enemy;
        }
        if (enemy && room.type === window.RoomType.BOSS) room.bossName = enemy;
      }
      this.s.activeCombat = {
        enemy: enemy || null,
        enemy2: enemy2 || null,
        kind: meta.kind || (this.s.combat && this.s.combat.kind) || null,
        is1v2: !!(meta.is1v2 || enemy2 || (this.s.combat && this.s.combat.is1v2)),
        pos: { r: this.s.pos.r, c: this.s.pos.c },
        mapName: this.mapName || null
      };
      // Keep the serialized adventure save on MAP so isSafePhase still accepts
      // the checkpoint; activeCombat is what blocks farming after refresh.
      if (this.s.phase === Phase.PLAYER_PLAY || this.s.phase === Phase.PLAYER_DEFEND ||
          this.s.phase === Phase.NPC_TURN || this.s.phase === Phase.ROOM_ENTER) {
        this.s.phase = Phase.MAP;
      }
      return this.s.activeCombat;
    }

    clearActiveCombat() {
      if (!this.s) return;
      this.s.activeCombat = null;
    }

    /**
     * 回溯沙漏：中止当前战斗并重置本房间遭遇（不清空房间、不发奖励）。
     * 同步战斗中的玩家状态与牌库，手牌补至上限，下次进入重新抽怪。
     */
    rewindCurrentRoomCombat(battleResult) {
      if (!this.s) return false;
      if (battleResult) this.applyBattleResult(battleResult);
      this.s.activeCombat = null;
      this.s.combat = null;
      this.s.pendingCombatReward = null;
      this.s.pendingMapReturnEffects = null;
      const room = this.currentRoom();
      if (room) {
        room.monsterName = null;
        room.bossName = null;
        room.cleared = false;
        if (room.type === window.RoomType.GLITCH && room.glitchEvent) {
          room.cleared = true;
          room.glitchEvent.status = 'done';
          room.glitchEvent.message = '已使用回溯沙漏逃离异常遭遇，本房事件已结束。';
        }
      }
      if (this.s.playerPile && typeof this.s.playerPile.drawToLimit === 'function') {
        const drawn = this.s.playerPile.drawToLimit();
        if (drawn && drawn.length) {
          this._log('回溯沙漏：手牌补至' + this.s.playerPile.hand.length + '张（+' + drawn.length + '）');
        }
      }
      if (window.AdventureDeck && window.AdventureDeck.DiscardTop) {
        this.s.discardTop = new window.AdventureDeck.DiscardTop(null);
      } else if (this.s.discardTop && typeof this.s.discardTop.clear === 'function') {
        this.s.discardTop.clear();
      } else {
        this.s.discardTop = null;
      }
      this.s.discardTopOwner = null;
      this.s.phase = Phase.MAP;
      this._log(room && room.type === window.RoomType.GLITCH
        ? '回溯沙漏：已逃离故障房，本房事件不能再次抽取'
        : '回溯沙漏：退出当前房间，下次进入重新抽取怪物');
      this.emit('roomRewind', '回溯沙漏：房间遭遇已重置', {
        r: this.s.pos && this.s.pos.r,
        c: this.s.pos && this.s.pos.c,
        roomType: room && room.type
      });
      return true;
    }

    enterCurrent(opts) {
      if (this.s.phase === Phase.GLITCH) return { ok: false, message: '请先完成故障房事件' };
      const room = this.currentRoom();
      if (!room || !room.isEnterable()) return {ok:false, message:'无法进入此房间'};
      if (this.s.phase === Phase.MAP && !this.s.activeCombat && !this.canMoveTo(this.s.pos.r, this.s.pos.c)) {
        return {ok:false, message:'请先探索相邻房间'};
      }
      this.s.phase = Phase.ROOM_ENTER;
      this.emit('enterRoom', '进入' + room.label() + '房间', {r:this.s.pos.r, c:this.s.pos.c, roomType:room.type});
      this._log('进入 ' + room.label() + ' 房间');
      const handlers = {
        [window.RoomType.NORMAL]:'_handleNormal', [window.RoomType.ELITE]:'_handleElite',
        [window.RoomType.BOSS]:'_handleBoss',
        [window.RoomType.ITEM]:'_handleItem', [window.RoomType.SHOP]:'_handleShop',
        [window.RoomType.BLACKSMITH]:'_handleBlacksmith', [window.RoomType.CHALLENGE]:'_handleChallenge',
        [window.RoomType.GLITCH]:'_handleGlitch'
      };
      const handler = handlers[room.type];
      let result;
      if (handler) result = this[handler](room, opts);
      else this.s.phase = Phase.MAP;
      if (!result || result.ok !== false) room.visited = true;
      return result;
    }

    _isAvailableAtStage(def, stage) {
      return availableAtStage(def, stage);
    }

    _availableNames(names, stage, kind) {
      const registry = window.AdventureRegistry;
      if (!registry) return (names || []).slice();
      const getter = kind === 'boss' ? 'getBoss' : 'getMonster';
      return (names || []).filter(name => this._isAvailableAtStage(registry[getter](name), stage));
    }

    _encounterNames(kind) {
      const scene = this.s.scene || 'castle', stage = this.s.stage || 1;
      return this._availableNames(sceneEncounterNames(scene, stage, kind), stage, kind);
    }

    _pickMonsterName(room, opts = {}) {
      const poolKind = room && room.type === window.RoomType.ELITE && !opts.ignoreRoom ? 'elite' : 'monster';
      const list = this._encounterNames(poolKind);
      if (room && !opts.ignoreRoom && list.includes(room.monsterName)) return room.monsterName;
      const distinct = opts.exclude ? list.filter(name => name !== opts.exclude) : list;
      const choices = distinct.length ? distinct : list;
      return choices.length ? choices[Math.floor(random() * choices.length)] : null;
    }

    _pickBossName(room) {
      if (this.s.stage === 4 && this.s.finalEnemyAwakened) return 'CorruptedRyan';
      const list = this._encounterNames('boss');
      if (room && list.includes(room.bossName)) return room.bossName;
      return list.length ? list[Math.floor(random() * list.length)] : null;
    }

    _encounterUnavailable(kind) {
      const message = '当前场景第' + (this.s.stage || 1) + '层暂无符合出现条件的' + kind + '，无法进入此房间';
      this.s.phase = Phase.MAP;
      this._log(message);
      this.emit('encounterUnavailable', message, { scene: this.s.scene, stage: this.s.stage, kind });
      return { ok: false, message };
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
      const template = AD.makePlayerDeck ? AD.makePlayerDeck({ shuffle: false }) : null;
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

    _handleElite(room) {
      if ((this.s.stage || 1) < 3) {
        return this._encounterUnavailable('精英');
      }
      return this._handleNormal(room);
    }

    _handleNormal(room) {
      if (room.cleared) {
        if (room.stashedLoot) {
          const merchant = room.stashedLoot.kind === 'merchant';
          this._log(merchant ? '流浪商人仍在房间等待交易' : room.label() + '房间已清除，可领取留在房间的基础奖励');
          this.s.phase = Phase.REWARD;
          this.emit('rewardPending', merchant ? '可与流浪商人交易' : '可领取保留的奖励', { roomType: room.type, stashed: room.stashedLoot });
        } else {
          this._log(room.label() + '房间已清除且无待领奖励');
          this.s.phase = Phase.MAP;
        }
        return;
      }
      room.monsterName = this._pickMonsterName(room);
      const monster = window.Monster.fromRegistry(room.monsterName);
      if (!monster) {
        return this._encounterUnavailable('怪物');
      }
      monster.init(this);
      this._initializeDiscardTop();
      this._prepareCombatEncounter(monster, 'monster');
      this.emit('combatStart', '遭遇 ' + monster.name, { enemy: monster.name });
    }

    _handleBoss(room) {
      if (room.cleared) {
        this._log(this.s.stage >= 4 ? '场景Boss已战胜，可唤醒堕落 Ryan' : room.stashedLoot
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
      room.bossName = this._pickBossName(room);
      const boss = window.Boss.fromRegistry(room.bossName);
      if (!boss) {
        return this._encounterUnavailable('Boss');
      }
      boss.init(this);

      this._initializeDiscardTop();
      this._prepareCombatEncounter(boss, 'boss');
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
      const lock = this.s.activeCombat;
      // Challenge rooms draw both monsters at random from the scene/stage pool,
      // ignoring the room's preset monster, and avoid a duplicate when possible.
      const name1 = (lock && lock.enemy) || this._pickMonsterName(room, { ignoreRoom: true });
      const name2 = (lock && lock.enemy2) || this._pickMonsterName(room, { ignoreRoom: true, exclude: name1 });
      const monster1 = window.Monster.fromRegistry(name1);
      const monster2 = window.Monster.fromRegistry(name2);
      if (!monster1 || !monster2) {
        return this._encounterUnavailable('怪物');
      }
      if (room) room.monsterName = name1;
      monster1.init(this);
      monster2.init(this);
      this._initializeDiscardTop();
      this._prepareCombatEncounter(monster1, 'challenge', monster2);
      this.emit('combatStart', '挑战房：' + monster1.name + ' + ' + monster2.name, { enemy: monster1.name, enemy2: monster2.name, is1v2: true });
    }

    _handleItem(room, opts) {
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
        const payment = opts && opts.beastPayment;
        const pay = this._applyBeastPayment(need, { kind: 'door' }, payment || null);
        if (!pay.ok) {
          this.s.phase = Phase.MAP;
          if (pay.needBeastChoice) return pay;
          return { ok: false, message: pay.message || ('兽元不足，需要：' + this._doorCostText(need)) };
        }
        room.doorUnlocked = true;
        this._log('消耗兽元打开奖励房门：' + this._doorCostText(need));
        this.emit('doorUnlock', '打开奖励房门', { cost: need.slice(), payment: pay.spend || payment || null });
      }

      return this._enterItemRoomContent(room);
    }

    _enterItemRoomContent(room) {
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
        beastType: loot.beastType || null,
        sold: !!loot.sold,
        price: loot.kind === 'merchant' ? this._merchantPrice() : null
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
        beastType: loot.beastType || null,
        ...(loot.kind === 'merchant' ? { sold: !!loot.sold, price: this._merchantPrice() } : {})
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
      let r = random() * total;
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


    _beastPaymentNeedsChoice(plans) {
      if (!plans || !plans.length) return false;
      return plans.length > 1 || plans.some(p => p.usesWild);
    }

    /**
     * Apply or pending a beast-cost payment.
     * - paymentOpt: exact spend map from UI / confirm → pay immediately
     * - else if multiple plans or any usesWild substitute → set pendingBeastPayment
     * - else auto-pay greedy (typed-first)
     */
    _applyBeastPayment(need, context, paymentOpt) {
      if (this.s.pendingBeastPayment) {
        return { ok: false, message: '请先完成当前的兽元支付选择' };
      }
      if (!this.s.currency.canPayBeastCost(need)) {
        return { ok: false, message: '兽元不足' };
      }
      const plans = this.s.currency.listBeastPaymentPlans(need);
      if (!plans.length) return { ok: false, message: '兽元不足' };

      if (paymentOpt) {
        if (!this.s.currency.payBeastCost(need, paymentOpt)) {
          return { ok: false, message: '兽元支付方案无效' };
        }
        return { ok: true, spend: paymentOpt };
      }

      if (this._beastPaymentNeedsChoice(plans)) {
        this.s.pendingBeastPayment = {
          kind: context && context.kind,
          needed: Array.isArray(need) ? need.slice() : [],
          cost: Array.isArray(need) ? need.slice() : [],
          plans: plans.map(p => ({
            ben: p.ben || 0,
            cao: p.cao || 0,
            shui: p.shui || 0,
            huo: p.huo || 0,
            wuneng: p.wuneng || 0,
            usesWild: !!p.usesWild
          })),
          context: context ? Object.assign({}, context) : {}
        };
        this.emit('beastPaymentChoice', '选择兽元支付方式', {
          kind: context && context.kind,
          plans: this.s.pendingBeastPayment.plans
        });
        return {
          ok: false,
          needBeastChoice: true,
          plans: this.s.pendingBeastPayment.plans
        };
      }

      if (!this.s.currency.payBeastCost(need)) {
        return { ok: false, message: '兽元不足' };
      }
      return { ok: true, spend: plans[0] };
    }

    confirmBeastPayment(planOrIndex) {
      const pending = this.s.pendingBeastPayment;
      if (!pending) return { ok: false, message: '没有待确认的兽元支付' };
      let plan = null;
      if (typeof planOrIndex === 'number') {
        plan = pending.plans[planOrIndex];
      } else if (planOrIndex && typeof planOrIndex === 'object') {
        if (planOrIndex.spend && typeof planOrIndex.spend === 'object') {
          plan = Object.assign({}, planOrIndex.spend, {
            usesWild: !!planOrIndex.usesWild
          });
        } else {
          plan = planOrIndex;
        }
      }
      if (!plan) return { ok: false, message: '无效支付方案' };
      const spend = {
        ben: plan.ben || 0,
        cao: plan.cao || 0,
        shui: plan.shui || 0,
        huo: plan.huo || 0,
        wuneng: plan.wuneng || 0
      };
      const need = pending.needed || pending.cost || [];
      const kind = pending.kind;
      const context = pending.context || {};
      this.s.pendingBeastPayment = null;
      if (!this.s.currency.payBeastCost(need, spend)) {
        return { ok: false, message: '兽元支付方案无效' };
      }
      if (kind === 'door') return this._completeDoorPay(spend);
      if (kind === 'blacksmithTrophy') {
        return this._completeBlacksmithTrophyBuy(context.itemName, need, spend);
      }
      if (kind === 'blacksmithSlot') {
        return this._completeBlacksmithSlotBuy(context.index, context.itemName, need, spend);
      }
      return { ok: true, spend };
    }

    cancelBeastPayment() {
      if (!this.s.pendingBeastPayment) return { ok: false, message: '没有待确认的兽元支付' };
      this.s.pendingBeastPayment = null;
      this.emit('beastPaymentCancel', '取消兽元支付', {});
      return { ok: true };
    }

    _completeDoorPay(spend) {
      const room = this.currentRoom();
      if (!room || room.type !== window.RoomType.ITEM) {
        return { ok: false, message: '不在奖励房' };
      }
      if (room.doorUnlocked) {
        return this._enterItemRoomContent(room);
      }
      const need = Array.isArray(room.doorCost) ? room.doorCost : [];
      room.doorUnlocked = true;
      this._log('消耗兽元打开奖励房门：' + this._doorCostText(need));
      this.emit('doorUnlock', '打开奖励房门', { cost: need.slice(), payment: spend || null });
      this.s.phase = Phase.ROOM_ENTER;
      const result = this._enterItemRoomContent(room);
      if (!result || result.ok !== false) room.visited = true;
      return result;
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
        combat: this.s.combat ? (() => {
          const combat = this.s.combat;
          const enemy = combat.enemy || null;
          const enemy2 = combat.enemy2 || null;
          const hand = combat.npcPile && Array.isArray(combat.npcPile.hand) ? combat.npcPile.hand : [];
          const deck = combat.npcPile && Array.isArray(combat.npcPile.deck) ? combat.npcPile.deck : [];
          const discard = combat.npcPile && Array.isArray(combat.npcPile.discard) ? combat.npcPile.discard : [];
          const cardLabel = c => !c ? null : ((c.magic || c.magicColor === 'purple') ? '紫魔' : ((c.greenMagic || c.magicColor === 'green') ? '绿魔' : (c.potion ? '药' : c.value)));
          const nameOf = value => typeof value === 'string' ? value : value && value.name;
          return {
            enemy: nameOf(enemy),
            enemyHp: enemy && typeof enemy === 'object' ? enemy.hp : null,
            enemyMaxHp: enemy && typeof enemy === 'object' ? enemy.maxHp : null,
            enemyGuard: enemy && typeof enemy === 'object' ? (enemy.guard || 0) : 0,
            enemy2: nameOf(enemy2),
            enemy2Hp: enemy2 && typeof enemy2 === 'object' ? enemy2.hp : null,
            enemy2MaxHp: enemy2 && typeof enemy2 === 'object' ? enemy2.maxHp : null,
            is1v2: !!combat.is1v2,
            kind: combat.kind,
            round: combat.round || 1,
            selectedCard: combat.selectedCard == null ? null : combat.selectedCard,
            atkCard: cardLabel(combat.atkCard),
            defCard: cardLabel(combat.defCard),
            pendingDamage: combat.pendingDamage || 0,
            npcHand: hand.map(cardLabel),
            npcHandCount: hand.length,
            npcDeckCount: deck.length,
            npcDiscardCount: discard.length,
            discardTop
          };
        })() : null,
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
          trophyRolls: JSON.parse(JSON.stringify(this.s.pendingCombatReward.trophyRolls || [])),
          applied: !!this.s.pendingCombatReward.applied
        } : null,
        pendingRoomReward: this._snapshotLoot(this.s.pendingRoomReward),
        pendingBeastPayment: this.s.pendingBeastPayment ? {
          kind: this.s.pendingBeastPayment.kind || null,
          needed: Array.isArray(this.s.pendingBeastPayment.needed)
            ? this.s.pendingBeastPayment.needed.slice()
            : (Array.isArray(this.s.pendingBeastPayment.cost)
              ? this.s.pendingBeastPayment.cost.slice() : []),
          cost: Array.isArray(this.s.pendingBeastPayment.cost)
            ? this.s.pendingBeastPayment.cost.slice()
            : (Array.isArray(this.s.pendingBeastPayment.needed)
              ? this.s.pendingBeastPayment.needed.slice() : []),
          plans: (this.s.pendingBeastPayment.plans || []).map(p => ({
            ben: p.ben || 0,
            cao: p.cao || 0,
            shui: p.shui || 0,
            huo: p.huo || 0,
            wuneng: p.wuneng || 0,
            usesWild: !!p.usesWild
          })),
          context: this.s.pendingBeastPayment.context
            ? JSON.parse(JSON.stringify(this.s.pendingBeastPayment.context))
            : null
        } : null,
        pendingDiscard: this.s.pendingDiscard,
        pendingHandDiscard: this.s.pendingHandDiscard ? {
          kind: this.s.pendingHandDiscard.kind || null,
          count: this.s.pendingHandDiscard.count || 1,
          itemIndex: this.s.pendingHandDiscard.itemIndex,
          itemName: this.s.pendingHandDiscard.itemName || null,
          filter: this.s.pendingHandDiscard.filter || null,
          legalIndices: Array.isArray(this.s.pendingHandDiscard.legalIndices)
            ? this.s.pendingHandDiscard.legalIndices.slice() : null,
          cancelable: this.s.pendingHandDiscard.cancelable !== false,
          selected: Array.isArray(this.s.pendingHandDiscard.selected)
            ? this.s.pendingHandDiscard.selected.slice() : [],
          hint: this.s.pendingHandDiscard.hint || null
        } : null,
        pendingItemDiscard: this.s.pendingItemDiscard,
        shopSelectedSlot: this.s.shopSelectedSlot == null ? null : this.s.shopSelectedSlot,
        blacksmithSelectedSlot: this.s.blacksmithSelectedSlot == null ? null : this.s.blacksmithSelectedSlot,
        blacksmithEntryGold: this._blacksmithEntryGold(),
        roomInfo: room ? {
          type: room.type,
          glitchEvent: room.glitchEvent ? JSON.parse(JSON.stringify(room.glitchEvent)) : null,
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
                if (!this._isShopItemSlot(index) || def.kind !== 'consumable') return null;
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
        finalEnemyAwakened: !!this.s.finalEnemyAwakened,
        finalEnemyDefeated: !!this.s.finalEnemyDefeated,
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

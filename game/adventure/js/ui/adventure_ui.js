/**
 * 冒险模式 UI AdventureUI
 * 渲染地牢地图网格、主角状态栏、房间交互、日志面板。
 * 遵循主游戏 UI 约定：DOM overlay 弹窗（非 alert/confirm）、紫色高亮、中文文案。
 */
(function () {
  const T = window.RoomType;
  const AC = window.AdventureCurrency;
  const runtime = window.FurryGame && window.FurryGame.CombatRuntime;
  const random = () => runtime ? runtime.random() : Math.random();
  const schedule = (fn, ms) => runtime ? runtime.schedule(null, fn, ms) : setTimeout(fn, ms);
  const GAME_TIPS = [
    '房间清理完后不会自动补牌，也不会清除身上的 Buff。',
    '挑战房击败第一个敌人后补牌一次，其他房间战斗结束不会自动补牌。',
    '有些怪物会清除道具，请及时使用手上的道具。',
    '怪物手牌全是白卡，优先使用魔法牌，其次按点数从大到小出牌。',
    '战利品白卡是一种特殊白卡，打出后可以再抽一张牌。',
    '玩家牌库和怪物牌库相互独立，因此部分角色技能在冒险模式下会被修正。',
    '不要舍不得弃牌！否则你可能会一直无法释放技能！',
    '游戏中的主角都来自作者的现实生活。'
  ];

  class AdventureUI {
    constructor(container) {
      this.container = typeof container === 'string' ? document.getElementById(container) : container;
      this.eng = new window.AdventureEngine();
      this._bridgeCombatStarting = false;
      this._bridgeCombatActive = false;
      this.logVisible = false;
      this._test = null;
      this._tipsTimer = null;
      this._tipsIndex = -1;
      this._mapClickTimer = null;
      this._lastEnterRoomAt = 0;
      this._pendingMapReturnEffect = null;
      this._bindEngine();
    }

    _clearMapClickTimer() {
      if (this._mapClickTimer) {
        clearTimeout(this._mapClickTimer);
        this._mapClickTimer = null;
      }
    }

    _stopTipsRotation() {
      if (this._tipsTimer) {
        clearInterval(this._tipsTimer);
        this._tipsTimer = null;
      }
    }

    _bindEngine() {
      this.eng.on('*', (ev) => this._appendLog(ev.desc));
    }

    async start(mapUrl, characterName) {
      this.container.innerHTML = '<div class="adv-loading">加载地图中…</div>';
      try {
        let map;
        const mapName = mapUrl.replace(/^maps\//, '').replace(/\.csv$/, '');
        if (window.AdventureMapData && window.AdventureMapData[mapName]) {
          map = window.AdventureMap.fromCsvText(window.AdventureMapData[mapName]);
        } else {
          map = await window.AdventureMap.fromCsvUrl(mapUrl);
        }
        const parts = mapName.split('_');
        let stage = 1, scene = 'castle';
        for (let i = 0; i < parts.length - 1; i++) {
          if (parts[i] === 'stage' && /^\d+$/.test(parts[i + 1])) stage = parseInt(parts[i + 1], 10);
          if (['castle', 'desert', 'forest', 'ocean', 'volcano'].includes(parts[i + 1])) scene = parts[i + 1];
        }
        this.eng.mapName = mapName;
        this.eng.start(map, characterName, { gold: 0, stage: stage, scene: scene });
        this.render();
        if (window.cardIconsReady) window.cardIconsReady.then(() => this.render());
      } catch (e) {
        this.container.innerHTML = '<div class="adv-loading">加载失败：' + (e.message || e) + '</div>';
      }
    }

    /** 优先恢复本地存档；无存档或角色不匹配时用默认地图开始新冒险 */
    async restoreOrStart(defaultMapFn, characterName) {
      const save = window.AdventureSave ? window.AdventureSave.load() : null;
      const combatSession = window.AdventureBattleController && typeof window.AdventureBattleController.loadCombatSession === 'function'
        ? window.AdventureBattleController.loadCombatSession() : null;
      if (save && save.characterName === characterName) {
        try {
          await this.restoreFromSave(save);
          // Reward settlement is a persistent checkpoint, not an in-combat
          // session.  Recreate its overlay after refresh so the cleared room
          // and pending loot remain actionable instead of silently returning
          // to the map.
          const settlementPhases = [
            window.AdventurePhase.COMBAT_SETTLE,
            window.AdventurePhase.BEAST_CHOICE,
            window.AdventurePhase.BEAST_DISCARD,
            window.AdventurePhase.ITEM_DISCARD
          ];
          if (settlementPhases.includes(this.eng.s.phase) &&
              window.AdventureBattleController &&
              typeof window.AdventureBattleController.resumeSettlement === 'function') {
            const resumedSettlement = window.AdventureBattleController.resumeSettlement(this.eng, () => this.render());
            if (resumedSettlement) return true;
          }
          // Mid-fight snapshots live in localStorage. Restore map first, then
          // re-enter the locked room and inject the exact battle state.
          const resumedCombat = await this._resumeLockedCombat(combatSession, characterName);
          if (resumedCombat) return true;
          if (combatSession && window.AdventureBattleController && typeof window.AdventureBattleController.clearCombatSession === 'function') {
            // Only drop a session that clearly belongs to another run.
          const sessionMatches = window.AdventureBattleSession && typeof window.AdventureBattleSession.matches === 'function'
            ? window.AdventureBattleSession.matches(combatSession, characterName, this.eng.mapName)
              : !!(combatSession && combatSession.characterName === characterName);
            if (!sessionMatches) window.AdventureBattleController.clearCombatSession();
          }
          if (window.cardIconsReady) window.cardIconsReady.then(() => this.render());
          return true;
        } catch (e) {
          if (window.AdventureSave) window.AdventureSave.clear();
          if (window.AdventureBattleController && typeof window.AdventureBattleController.clearCombatSession === 'function') {
            window.AdventureBattleController.clearCombatSession();
          }
        }
      }
      if (combatSession && window.AdventureBattleController && typeof window.AdventureBattleController.clearCombatSession === 'function') {
        window.AdventureBattleController.clearCombatSession();
      }
      await this.start(typeof defaultMapFn === 'function' ? defaultMapFn() : defaultMapFn, characterName);
      return false;
    }

    /**
     * After a refresh, put the player back into the unfinished fight.
     * Prefer the precise battle snapshot; if only the adventure lock remains,
     * restart that same locked encounter so the room cannot be farmed.
     */
    async _resumeLockedCombat(combatSession, characterName) {
      const sessionMatches = !!(combatSession && combatSession.battle && (
        window.AdventureBattleSession && typeof window.AdventureBattleSession.matches === 'function'
          ? window.AdventureBattleSession.matches(combatSession, characterName, this.eng.mapName)
          : combatSession.characterName === characterName
      ));
      const lock = (this.eng.s && this.eng.s.activeCombat) || null;
      if (!sessionMatches && !lock) return false;
      if (this.eng.s.phase !== window.AdventurePhase.MAP &&
          this.eng.s.phase !== window.AdventurePhase.PLAYER_PLAY &&
          this.eng.s.phase !== window.AdventurePhase.PLAYER_DEFEND &&
          this.eng.s.phase !== window.AdventurePhase.NPC_TURN) {
        return false;
      }

      const pos = (sessionMatches && combatSession.pos) || (lock && lock.pos) || null;
      if (pos && Number.isFinite(pos.r) && Number.isFinite(pos.c)) {
        this.eng.s.pos = { r: pos.r, c: pos.c };
      }
      const room = this.eng.currentRoom();
      if (!room) return false;

      const enemy = (sessionMatches && combatSession.enemy) || (lock && lock.enemy) || null;
      if (enemy) {
        if (room.type === window.RoomType.NORMAL || room.type === window.RoomType.CHALLENGE) room.monsterName = enemy;
        if (room.type === window.RoomType.BOSS) room.bossName = enemy;
      }

      // Re-enter without drawing a fresh discard top when we already have a
      // mid-fight snapshot — restoreSession owns piles/table top.
      const entered = this.eng.enterCurrent();
      const combatPhases = [window.AdventurePhase.PLAYER_PLAY, window.AdventurePhase.PLAYER_DEFEND, window.AdventurePhase.NPC_TURN];
      if (!combatPhases.includes(this.eng.s.phase) || entered === false) return false;

      const resumed = await this._startBridgeCombat(sessionMatches ? combatSession : null);
      return !!resumed;
    }

    async restoreFromSave(save) {
      this.container.innerHTML = '<div class="adv-loading">恢复冒险进度…</div>';
      const mapName = save.mapName;
      let map;
      if (window.AdventureMapData && window.AdventureMapData[mapName]) {
        map = window.AdventureMap.fromCsvText(window.AdventureMapData[mapName]);
      } else {
        map = await window.AdventureMap.fromCsvUrl('maps/' + mapName + '.csv');
      }
      this.eng.mapName = mapName;
      this.eng.restoreFromSave(save, map);
      this.render();
    }

    _createMapViewModel() {
      const map = this.eng && this.eng.s && this.eng.s.map;
      if (!map) return null;
      const pos = this.eng.s.pos;
      const cells = [];
      for (let r = 0; r < map.rows; r++) {
        for (let c = 0; c < map.cols; c++) {
          const room = map.get(r, c);
          if (!room) continue;
          const doorCost = Array.isArray(room.doorCost) ? room.doorCost.map(key => ({
            key,
            label: AC.BEAST_LABEL[key] || key,
            icon: AC.BEAST_ICON[key] || ''
          })) : [];
          const reachable = this.eng.canMoveTo(r, c);
          const hasLoot = !!room.stashedLoot;
          const isItemRoom = room.type === T.ITEM;
          const isBlacksmith = room.type === T.BLACKSMITH;
          const entryGold = isBlacksmith && typeof this.eng._blacksmithEntryGold === 'function'
            ? this.eng._blacksmithEntryGold()
            : 0;
          const doorLocked = (isItemRoom && !room.doorUnlocked && doorCost.length > 0) ||
            (isBlacksmith && !room.doorUnlocked && entryGold > 0);
          const doorUnlocked = (isItemRoom || isBlacksmith) && !!room.doorUnlocked;
          const title = '(' + (r + 1) + ',' + (c + 1) + ') ' + room.label() + '房间' +
            (hasLoot ? '（有待领奖励）' : '') +
            (isItemRoom && doorLocked ? '（开门：' + doorCost.map(item => item.label).join('+') + '）' : '') +
            (isBlacksmith && doorLocked ? '（进入：' + entryGold + '金币）' : '') +
            (doorUnlocked ? '（已开门）' : '') +
            (reachable ? '（单击移动，双击进入）' : '');
          cells.push({
            r, c, type: room.type, visited: !!room.visited, cleared: !!room.cleared,
            rewardClaimed: !!room.rewardClaimed, hasLoot, lootIcon: hasLoot ? this._stashedLootIconSrc(room.stashedLoot) : null,
            current: !!pos && pos.r === r && pos.c === c, reachable: !!reachable,
            doorCost, doorLocked, doorUnlocked, entryGold, title
          });
        }
      }
      return { rows: map.rows, cols: map.cols, cells };
    }

    render() {
      this._clearMapClickTimer();
      this._stopTipsRotation();
      const snap = this.eng.snapshot();
      if (!snap) return;

      this._updateBackground(snap.scene);

      this._persistAdventure(snap);

      const viewModel = Object.assign({}, snap, {
        mapViewModel: this._createMapViewModel(),
        logEntries: (this.eng.s.log || []).slice(-12).map(entry => ({ msg: entry.msg })),
        blacksmithCanPay: {
          slots: ((snap.roomInfo && snap.roomInfo.blacksmithSlots) || []).map(item => !!item && this.eng.s.currency.canPayBeastCost(item.beastCost || [])),
          trophy: !!(snap.roomInfo && snap.roomInfo.blacksmithTrophy && this.eng.s.currency.canPayBeastCost(snap.roomInfo.blacksmithTrophy.beastCost || []))
        }
      });
      if (window.AdventureUIViews && typeof window.AdventureUIViews.render === 'function') {
        window.AdventureUIViews.render(this, viewModel);
      }
    }

    _buildTipsBanner() {
      const banner = document.createElement('section');
      banner.className = 'adv-tips-banner';
      banner.innerHTML = '<div class="adv-tips-label">游戏 Tips</div><div class="adv-tips-text"></div>';
      const text = banner.querySelector('.adv-tips-text');
      const showNext = () => {
        if (!GAME_TIPS.length || !text) return;
        let next = Math.floor(random() * GAME_TIPS.length);
        if (GAME_TIPS.length > 1 && next === this._tipsIndex) next = (next + 1) % GAME_TIPS.length;
        this._tipsIndex = next;
        text.classList.remove('adv-tips-fade');
        void text.offsetWidth;
        text.textContent = GAME_TIPS[next];
        text.classList.add('adv-tips-fade');
      };
      showNext();
      this._tipsTimer = setInterval(showNext, 6000);
      return banner;
    }

    _updateBackground(scene) {
      const bg = document.getElementById('castle-bg');
      if (!bg) return;
      const map = { castle: 'Castle', desert: 'Desert', forest: 'Forest', ocean: 'Frozen_Ocean', volcano: 'Volcano' };
      const name = map[scene] || 'Castle';
      if (this._currentBg === name) return;
      this._currentBg = name;
      bg.style.background = `url('../backgrounds/${name}.webp') center/cover no-repeat`;
    }

    _appendLog(msg) {
      const list = document.getElementById('adv-log-list');
      if (!list) return;
      const line = document.createElement('div');
      line.className = 'adv-log-line';
      line.textContent = msg;
      list.appendChild(line);
      if (list.children.length > 50) list.removeChild(list.firstChild);
      list.scrollTop = list.scrollHeight;
    }

    _persistAdventure(snap) {
      if (!snap || !window.AdventureSave || this._test) return;
      if (snap.phase === window.AdventurePhase.GAME_OVER) {
        window.AdventureSave.clear();
        this._lastSaveKey = null;
        return;
      }
      if (window.AdventureSave.isSafePhase(snap.phase) && this.eng.mapName) {
        const names = arr => (arr || []).map(item => typeof item === 'string' ? item : (item && item.name) || '').join(',');
        const combatKey = this.eng.s && this.eng.s.activeCombat
          ? (this.eng.s.activeCombat.enemy || '') + '|' + (this.eng.s.activeCombat.enemy2 || '')
          : '';
        const invKey = names(snap.consumables) + '|' + names(snap.accessories) + '|' + names(snap.trophyWhiteCards);
        const k = snap.phase + '|' + (snap.pos ? snap.pos.r + ',' + snap.pos.c : '') + '|' + snap.player.hp + '|' + snap.currency.gold + '|' + (snap.playerPile ? snap.playerPile.deckCount + ',' + snap.playerPile.discardCount : '') + '|' + combatKey + '|' + invKey;
        if (k !== this._lastSaveKey) {
          this._lastSaveKey = k;
          window.AdventureSave.save(this.eng);
        }
      }
    }

    _forcePersistAdventure() {
      if (!window.AdventureSave || this._test || !this.eng || !this.eng.mapName) return;
      this._lastSaveKey = null;
      window.AdventureSave.save(this.eng);
    }

    _patchMapPosition() {
      const snap = this.eng.snapshot();
      const board = this.container && this.container.querySelector('.adventure-board');
      if (!snap || !board || snap.phase !== window.AdventurePhase.MAP) {
        this.render();
        return;
      }
      this._persistAdventure(snap);
      const mapViewModel = this._createMapViewModel();
      // 原地改 class，避免重建 DOM 导致黄/绿呼吸动画从头闪一下
      if (typeof this._syncMapCells !== 'function' || !this._syncMapCells(board, mapViewModel)) {
        board.replaceWith(this._buildMap(Object.assign({}, snap, { mapViewModel })));
      }
      const side = this.container.querySelector('.adventure-sidebar');
      if (!side) return;
      side.querySelectorAll('.adv-room-status, .adv-stashed-loot').forEach(el => el.remove());
      const actions = side.querySelector('.adv-actions');
      const status = this._roomStatusMarkup(snap);
      if (status && actions) actions.insertAdjacentHTML('beforebegin', status);
      else if (status) side.insertAdjacentHTML('beforeend', status);
      if (actions) actions.innerHTML = this._buildActions(snap);
    }

    _onCellClick(r, c) {
      if (this.eng.canMoveTo(r, c)) {
        this.eng.move(r, c);
        this._patchMapPosition();
        return;
      }
      const room = this.eng.s.map.get(r, c);
      if (room && room.type !== T.EMPTY) {
        this._toast('(' + (r + 1) + ',' + (c + 1) + ') ' + room.label() + '房间' + (room.cleared ? '（已清除）' : room.visited ? '（已访问）' : ''));
      }
    }

    _onCellDoubleClick(r, c) {
      if (this.eng.canMoveTo(r, c)) {
        if (this.eng.move(r, c)) {
          this._patchMapPosition();
          this._handleEnterRoom();
        }
        return;
      }
      const pos = this.eng.s && this.eng.s.pos;
      if (pos && pos.r === r && pos.c === c) {
        this._handleEnterRoom();
        return;
      }
      const room = this.eng.s && this.eng.s.map && this.eng.s.map.get(r, c);
      if (room && room.type !== T.EMPTY) {
        this._toast('请先移动到可达房间，再双击进入');
      }
    }

    bindActions() {
      this.container.addEventListener('dblclick', (event) => {
        const cell = event.target.closest && event.target.closest('[data-map-cell]');
        if (!cell) return;
        event.preventDefault();
        this._clearMapClickTimer();
        this._onCellDoubleClick(Number(cell.dataset.r), Number(cell.dataset.c));
      });
      this.container.addEventListener('click', (e) => {
        const mapCell = e.target.closest && e.target.closest('[data-map-cell]');
        if (mapCell) {
          if (e.detail > 1) return;
          const r = Number(mapCell.dataset.r), c = Number(mapCell.dataset.c);
          this._clearMapClickTimer();
          this._mapClickTimer = setTimeout(() => {
            this._mapClickTimer = null;
            this._onCellClick(r, c);
          }, 240);
          return;
        }
        const action = e.target.closest('button');
        const id = action ? action.id : e.target.id;

        const useBtn = e.target.closest('[data-use-index]');
        const useIndex = useBtn ? parseInt(useBtn.getAttribute('data-use-index'), 10) : -1;
        const buyBtn = e.target.closest('[data-buy-item]');
        const buyItem = buyBtn ? buyBtn.getAttribute('data-buy-item') : null;
        const buyPrice = buyBtn ? parseInt(buyBtn.getAttribute('data-buy-price'), 10) : 0;
        const shopSlotBtn = e.target.closest('[data-shop-slot]');
        const shopSlot = shopSlotBtn ? parseInt(shopSlotBtn.getAttribute('data-shop-slot'), 10) : -1;
        const bsSlotBtn = e.target.closest('[data-blacksmith-slot]');
        const bsSlot = bsSlotBtn ? parseInt(bsSlotBtn.getAttribute('data-blacksmith-slot'), 10) : -1;
        const recycleBtn = e.target.closest('[data-recycle-index]');
        const recycleIndex = recycleBtn ? parseInt(recycleBtn.getAttribute('data-recycle-index'), 10) : -1;
        const itemDiscardBtn = e.target.closest('[data-item-discard]');
        const itemDiscardIndex = itemDiscardBtn ? parseInt(itemDiscardBtn.getAttribute('data-item-discard'), 10) : -1;
        const beastDiscardBtn = e.target.closest('[data-beast-discard]');
        const testItemBtn = e.target.closest('[data-test-item]');
        const testTrophyBtn = e.target.closest('[data-test-trophy]');
        const testAccessoryBtn = e.target.closest('[data-test-accessory]');
        const testModeBtn = e.target.closest('[data-test-mode]');
        const testOpponentBtn = e.target.closest('[data-test-opponent]');
        const testStageBtn = e.target.closest('[data-test-stage]');
        if (id === 'adv-test-cancel' || id === 'adv-test-home') {
          window.location.href = '../index.html';
          return;
        }
        if (id === 'adv-trophy-pack') {
          this._showTrophyBackpack();
          return;
        }
        if (itemDiscardBtn) {
          this.eng.discardConsumable(itemDiscardIndex);
          this.render();
          return;
        }
        if (beastDiscardBtn) {
          this.eng.discardBeastToken(beastDiscardBtn.getAttribute('data-beast-discard'));
          this.render();
          return;
        }
        if (testItemBtn && this._test) {
          const name = testItemBtn.getAttribute('data-test-item');
          const at = this._test.items.indexOf(name);
          if (at >= 0) this._test.items.splice(at, 1);
          else if (this._test.items.length < 3) this._test.items.push(name);
          else { this._toast('道具最多选择 3 个'); return; }
          this._renderTestLoadout();
          return;
        }
        if (testTrophyBtn && this._test) {
          const name = testTrophyBtn.getAttribute('data-test-trophy');
          const at = this._test.trophyWhiteCards.indexOf(name);
          if (at >= 0) this._test.trophyWhiteCards.splice(at, 1);
          else this._test.trophyWhiteCards.push(name);
          this._renderTestLoadout();
          return;
        }
        if (testAccessoryBtn && this._test) {
          const name = testAccessoryBtn.getAttribute('data-test-accessory');
          const at = this._test.accessories.indexOf(name);
          if (at >= 0) this._test.accessories.splice(at, 1);
          else if (this._test.accessories.length < 2) this._test.accessories.push(name);
          else { this._toast('配饰最多选择 2 个'); return; }
          this._renderTestLoadout();
          return;
        }
        if (id === 'adv-test-loadout-confirm' && this._test) {
          this._test.mode = null;
          this._test.opponents = [];
          this._renderTestMode();
          return;
        }
        if (id === 'adv-test-back-loadout' && this._test) {
          this._renderTestLoadout();
          return;
        }
        if (testModeBtn && this._test) {
          this._test.mode = testModeBtn.getAttribute('data-test-mode');
          this._test.opponents = [];
          this._renderTestMode();
          return;
        }
        if (testStageBtn && this._test) {
          this._test.stage = Number(testStageBtn.getAttribute('data-test-stage'));
          this._renderTestMode();
          return;
        }
        if (testOpponentBtn && this._test && this._test.mode) {
          const name = testOpponentBtn.getAttribute('data-test-opponent');
          const max = this._test.mode === '1v2' ? 2 : 1;
          const at = this._test.opponents.indexOf(name);
          if (at >= 0) this._test.opponents.splice(at, 1);
          else if (this._test.opponents.length < max) this._test.opponents.push(name);
          else { this._toast('该测试房只能选择 ' + max + ' 个对手'); return; }
          this._renderTestMode();
          return;
        }
        if (id === 'adv-test-start' && this._test) {
          const need = this._test.mode === '1v2' ? 2 : 1;
          if (this._test.opponents.length === need) this._startTestBattle();
          return;
        }
        if (id === 'adv-test-again' && this._test) {
          this._test.mode = null;
          this._test.opponents = [];
          this._renderTestMode();
          return;
        }
        if (id === 'adv-enter') { this._handleEnterRoom(); }
        else if (id === 'adv-reward') {
          const loot = this.eng.collectReward();
          if (!loot && this.eng._lastRewardError) {
            const err = this.eng._lastRewardError;
            if (err.reason === 'accessoryFull') this._showAlertDialog('无法拾取', err.message);
            else this._toast(err.message || '领取失败');
          }
          this.render();
        }
        else if (id === 'adv-skip-reward') { this.eng.skipReward(); this.render(); }
        else if (id === 'adv-room-claim') {
          if (!this.eng.claimRoomReward()) {
            const err = this.eng._lastRewardError;
            if (err && err.reason === 'accessoryFull') this._showAlertDialog('无法拾取', err.message);
            else this._toast('领取失败');
          }
          this.render();
        }
        else if (id === 'adv-room-defer') {
          this.eng.deferRoomReward();
          this.render();
        }
        else if (id === 'adv-next-stage') { this._advanceStage(); }
        else if (id === 'adv-leave-shop') { this.eng.leaveShop(); this.render(); }
        else if (id === 'adv-leave-blacksmith') { this.eng.leaveBlacksmith(); this.render(); }
        else if (id === 'adv-shop-buy') {
          const sel = this.eng.s.shopSelectedSlot;
          if (sel == null) { this._toast('请先选择槽位'); return; }
          const result = this.eng.buyShopSlot(sel);
          if (!result.ok) {
            if (result.reason === 'beastFull') {
              this._showConfirmDialog('兽元已满', '兽元栏已满，继续购买后需舍弃多余兽元，是否继续？', () => {
                const r = this.eng.buyShopSlot(sel, { force: true });
                if (!r.ok) this._toast(r.message || '购买失败');
                this.render();
              });
            } else if (result.reason === 'accessoryFull') {
              this._showAlertDialog('无法拾取', result.message || '配饰已达上限');
            } else {
              this._toast(result.message || '购买失败');
            }
          }
          this.render();
        }
        else if (id === 'adv-shop-refresh') {
          const sel = this.eng.s.shopSelectedSlot;
          if (sel == null) { this._toast('请先选择槽位'); return; }
          const result = this.eng.refreshShopSlot(sel);
          if (!result.ok) this._toast(result.message || '刷新失败');
          this.render();
        }
        else if (shopSlot >= 0) {
          this.eng.selectShopSlot(shopSlot);
          this.render();
        }
        else if (id === 'adv-blacksmith-trade') {
          const sel = this.eng.s.blacksmithSelectedSlot;
          if (sel == null) { this._toast('请先选择槽位'); return; }
          if (sel === 'trophy') {
            const result = this.eng.buyBlacksmithTrophy();
            if (!result.ok) this._toast(result.message || '锻造失败');
          } else {
            const result = this.eng.buyBlacksmithSlot(sel);
            if (!result.ok) {
              if (result.reason === 'accessoryFull') this._showAlertDialog('无法拾取', result.message || '配饰已达上限');
              else this._toast(result.message || '兑换失败');
            }
          }
          this.render();
        }
        else if (id === 'adv-blacksmith-refresh') {
          const sel = this.eng.s.blacksmithSelectedSlot;
          if (sel == null) { this._toast('请先选择槽位'); return; }
          if (sel === 'trophy') {
            const result = this.eng.refreshBlacksmithTrophy();
            if (!result.ok) this._toast(result.message || '刷新失败');
          } else {
            const result = this.eng.refreshBlacksmithSlot(sel);
            if (!result.ok) this._toast(result.message || '刷新失败');
          }
          this.render();
        }
        else if (id === 'adv-boss-claim') {
          if (!this.eng.claimCombatReward()) {
            const err = this.eng._lastRewardError;
            if (err && err.reason === 'accessoryFull') this._showAlertDialog('无法拾取', err.message);
            else this._toast((err && err.message) || '领取失败');
          }
          this.render();
        }
        else if (id === 'adv-boss-return-map') {
          this.eng.returnToMap();
          this.render();
        }
        else if (e.target.closest('[data-blacksmith-trophy]')) {
          this.eng.s.blacksmithSelectedSlot = 'trophy';
          this.render();
        }

        else if (bsSlot >= 0) {
          this.eng.selectBlacksmithSlot(bsSlot);
          this.render();
        }
        else if (recycleIndex >= 0) {
          const result = this.eng.recycleAccessory(recycleIndex);
          if (!result.ok) this._toast(result.message || '回收失败');
          else this._toast('回收成功，获得10金币');
          this.render();
        }

        else if (useIndex >= 0) {
          const item = (this.eng.snapshot().consumables || [])[useIndex];
          const def = item && window.AdventureRegistry.getItem(item.name);
          if (def && def.combatUse === 'cardMaster') {
            this._showCardMasterChoice(choice => {
              const result = this.eng.useConsumable(useIndex, { cardMasterChoice: choice });
              if (result && result.message) this._toast(result.message);
              this.render();
            });
            return;
          }
          if (def && def.combatUse === 'discardTalisman') {
            const hand = (this.eng.s.playerPile && this.eng.s.playerPile.hand) || [];
            if (!hand.length) {
              this._toast('手牌为空，无法使用弃牌符');
              return;
            }
            this._getDialogs().showOpponentCardChoice(
              [{ key: 'player', label: '选择要弃掉的手牌', cards: hand.slice() }],
              choice => {
                const result = this.eng.useConsumable(useIndex, { discardIndex: choice.index });
                if (result && result.message) this._toast(result.message);
                this.render();
              },
              '弃牌符 · 弃1抽2'
            );
            return;
          }
          if (def && def.combatUse === 'crystalBall') {
            const preview = this.eng.useConsumable(useIndex);
            if (preview && preview.needsChoice && preview.crystalBallCards) {
              this._showCrystalBallChoice(preview.crystalBallCards, order => {
                const result = this.eng.useConsumable(useIndex, { reorderOrder: order });
                if (result && result.message) this._toast(result.message);
                this.render();
              });
            } else if (preview && preview.message) {
              this._toast(preview.message);
            }
            return;
          }
          if (def && def.combatUse === 'purify') {
            const player = this.eng.s.player;
            const hasBuff = (player.burn || 0) > 0 || (player.bleed || 0) > 0 ||
              (player.poison || 0) > 0 || (player.blind || 0) > 0 || (player.iceSeal || 0) > 0 || (player.bomb || 0) > 0 || player.frozen || (player.guard || 0) > 0 ||
              (player.fly || 0) > 0 || (player.crit || 0) > 0 || (player.lush || 0) > 0 || (player.parasite || 0) > 0;
            if (!hasBuff) {
              this._toast('当前没有可净化的状态');
              return;
            }
            this._getDialogs().collectPurifyChoices(player, def.purifyCount || 1, choices => {
              if (!choices.length) return;
              const result = this.eng.useConsumable(useIndex, { purifyChoices: choices });
              if (result && result.message) this._toast(result.message);
              this.render();
            });
            return;
          }
          const result = this.eng.useConsumable(useIndex);
          if (result && result.message) this._toast(result.message);
          this.render();
        }
        else if (buyItem) {
          const ok = this.eng.buy(buyItem, buyPrice);
          if (!ok) this._toast('购买失败');
          this.render();
        }
      });
    }


    _handleEnterRoom() {
      // A double-click on the action button produces two click events as
      // well.  Ignore the second one while the first room transition is
      // being processed, so combat/map initialization cannot run twice.
      const now = Date.now();
      if (now - this._lastEnterRoomAt < 450) return;
      this._lastEnterRoomAt = now;
      const result = this.eng.enterCurrent();
      if (result && result.ok === false) {
        this._toast(result.message || '无法进入');
        this.render();
        return;
      }
      const combatPhases = ['ADVENTURE_PLAYER_PLAY', 'ADVENTURE_PLAYER_DEFEND', 'ADVENTURE_NPC_TURN'];
      if (combatPhases.includes(this.eng.s.phase)) {
        if (!window.AdventureBattleController || !window.AdventureBattleController.isAvailable()) {
          this._showCombatLaunchError('1v1 战斗模块加载失败，请刷新页面后重试');
          return;
        }
        void this._startBridgeCombat();
        return;
      }
      this.render();
    }

    async _startBridgeCombat(resumeSession = null) {
      if (this._bridgeCombatStarting || this._bridgeCombatActive) return false;
      const snap = this.eng.snapshot();
      if (!snap || !snap.combat) {
        this._showCombatLaunchError('没有可启动的战斗数据');
        return false;
      }
      this._bridgeCombatStarting = true;
      const playerName = snap.player.name;
      const monsterName = snap.combat.enemy;
      const is1v2 = !!snap.combat.is1v2 && !!snap.combat.enemy2;
      const monsterName2 = is1v2 ? snap.combat.enemy2 : null;
      const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));

      // Lock the encounter into the adventure save before the battle UI takes
      // over, so a refresh cannot rewind to an uncleared free rematch.
      if (typeof this.eng.markActiveCombat === 'function') {
        this.eng.markActiveCombat({
          enemy: monsterName,
          enemy2: monsterName2,
          kind: snap.combat.kind,
          is1v2: is1v2
        });
        this._forcePersistAdventure();
      }

      const initialState = {
        playerState: clone(this.eng.s.player),
        playerPile: this.eng.s.playerPile ? {
          deck: clone(this.eng.s.playerPile.deck),
          hand: clone(this.eng.s.playerPile.hand),
          discard: clone(this.eng.s.playerPile.discard),
          handLimit: this.eng.s.playerPile.handLimit
        } : null,
        discardTop: this.eng.s.discardTop ? clone(this.eng.s.discardTop.get()) : null,
        discardTopOwner: this.eng.s.discardTopOwner || null,
        adventureCurrency: this.eng.s.currency,
        stage: snap.stage || 1,
        scene: this.eng.s.scene || 'castle',
        resumeBattle: resumeSession && resumeSession.battle ? resumeSession.battle : null,
        adventureEngine: this.eng
      };

      try {
        if (is1v2) {
          await window.AdventureBattleController.startCombat1v2(
            playerName, monsterName, monsterName2,
            (result, state, persistentState, meta) => this._onBridgeCombatEnd(result, state, persistentState, meta),
            initialState
          );
        } else {
          await window.AdventureBattleController.startCombat(
            playerName, monsterName,
            (result, state, persistentState, meta) => this._onBridgeCombatEnd(result, state, persistentState, meta),
            initialState
          );
        }
        this._bridgeCombatActive = true;
        return true;
      } catch (e) {
        // A brand-new launch failure should not leave the room permanently
        // locked; a resume attempt keeps the lock so refresh cannot farm.
        if (!resumeSession && this.eng && typeof this.eng.clearActiveCombat === 'function') {
          this.eng.clearActiveCombat();
          this._forcePersistAdventure();
        }
        this._showCombatLaunchError('战斗启动失败：' + (e.message || e));
        return false;
      } finally {
        this._bridgeCombatStarting = false;
      }
    }

    _onBridgeCombatEnd(result, state, persistentState, meta) {
      this._bridgeCombatActive = false;
      const tip = document.getElementById('card-tooltip');
      if (tip) tip.remove();
      const gc = document.getElementById('game-container');
      if (gc) gc.style.display = 'none';
      const gs = document.getElementById('game-screen');
      if (gs) gs.classList.remove('active');
      if (meta && meta.test) {
        if (this._test) {
          this._test.running = false;
          this._test.result = result === 'rewind' ? 'rewind' : (result === 'win' ? 'win' : 'lose');
          this._renderTestResult();
        }
        return;
      }
      if (result === 'rewind' || (meta && meta.rewind)) {
        // rewindCurrentRoomCombat already applied battle result + room reset.
        this._forcePersistAdventure();
        this.render();
        return;
      }
      if (result === 'lose' || this.eng.s.phase === window.AdventurePhase.GAME_OVER) {
        window.location.href = '../index.html';
        return;
      }
      if (!meta || !meta.settled) {
        if (persistentState) this.eng.applyBattleResult(persistentState);
        else if (state && state.player) this.eng.s.player.hp = Math.max(0, state.player.hp);
        this.eng.onCombatEnd(result);
      }
      let returnEffect = null;
      if (result === 'win' && (!meta || !meta.test) && this.eng.s.phase === window.AdventurePhase.MAP &&
          typeof this.eng.onCombatReturnToMap === 'function') {
        returnEffect = this.eng.onCombatReturnToMap();
      }
      if (returnEffect) this._pendingMapReturnEffect = returnEffect;
      this.render();
    }

    _animateMapReturnEffects(effect) {
      if (!effect || effect.itemName !== 'WisdomNecklace') return;
      const slot = this.container.querySelector('[data-accessory-name="WisdomNecklace"]');
      if (slot) {
        slot.classList.remove('adv-accessory-trigger');
        void slot.offsetWidth;
        slot.classList.add('adv-accessory-trigger');
        schedule(() => slot.classList.remove('adv-accessory-trigger'), 1000);
      }

      const zone = this.container.querySelector('#adv-hand-zone');
      if (!zone) return;
      const cards = Array.from(zone.children);
      const count = Math.min(Math.max(0, Number(effect.drawn) || 0), cards.length);
      cards.slice(cards.length - count).forEach((card, index) => {
        card.classList.add('adv-wisdom-draw-card');
        card.style.animationDelay = (420 + index * 120) + 'ms';
        schedule(() => {
          card.classList.remove('adv-wisdom-draw-card');
          card.style.animationDelay = '';
        }, 1800 + index * 120);
      });
    }

    startTest(characterName) {
      if (window.AdventureBattleController && typeof window.AdventureBattleController.clearCombatSession === 'function') {
        window.AdventureBattleController.clearCombatSession();
      }
      this._test = { characterName, items: [], trophyWhiteCards: [], accessories: [], mode: null, opponents: [], stage: 1, running: false, result: null };
      // The test loadout is part of the game home flow. Do not show the
      // adventure scene image behind it; game.css supplies the shared main
      // page gradient background.
      const bg = document.getElementById('castle-bg');
      if (bg) bg.style.display = 'none';
      this._renderTestLoadout();
    }

    _testItemDefs(kind) {
      return (window.AdventureRegistry && window.AdventureRegistry.allItems
        ? window.AdventureRegistry.allItems() : []).filter(item => item.kind === kind);
    }

    _testItemCard(def, selected, attr) {
      const icon = def.kind === 'trophyWhite'
        ? this._trophyCardMarkup(def.name, 46, 68)
        : (def.icon ? '<img src="' + def.icon + '" alt="" class="adv-test-item-icon">' : '<span class="adv-test-item-icon adv-test-item-fallback">◆</span>');
      return '<button type="button" class="adv-test-item' + (selected ? ' selected' : '') + '" ' + attr + '="' + def.name + '" title="' + (def.description || '') + '">' + icon + '<span>' + def.displayName + '</span></button>';
    }

    _renderTestLoadout() {
      if (!this._test) return;
      const items = this._testItemDefs('consumable');
      const trophies = this._testItemDefs('trophyWhite');
      const accessories = this._testItemDefs('accessory');
      let html = '<div class="adv-test-shell"><div class="adv-test-header"><div><div class="adv-test-kicker">COMBAT LAB</div><h2>冒险测试 · ' + this._test.characterName + '</h2><p>选择本次测试携带的资源，不会写入正式冒险存档。</p></div><button type="button" class="adv-test-link" id="adv-test-cancel">返回主页</button></div>';
      html += '<section class="adv-test-section"><div class="adv-test-section-head"><h3>道具</h3><span>' + this._test.items.length + ' / 3</span></div><div class="adv-test-item-grid">';
      items.forEach(def => { html += this._testItemCard(def, this._test.items.includes(def.name), 'data-test-item'); });
      html += '</div></section>';
      html += '<section class="adv-test-section adv-test-trophy-section"><div class="adv-test-section-head"><h3>战利白卡</h3><span>' + this._test.trophyWhiteCards.length + ' 张 · 不占道具槽</span></div><p class="adv-test-muted">开局额外加入手牌，可在战斗中反复抽取。</p><div class="adv-test-item-grid">';
      trophies.forEach(def => { html += this._testItemCard(def, this._test.trophyWhiteCards.includes(def.name), 'data-test-trophy'); });
      html += '</div></section>';
      html += '<section class="adv-test-section"><div class="adv-test-section-head"><h3>配饰</h3><span>' + this._test.accessories.length + ' / 2</span></div><div class="adv-test-item-grid">';
      accessories.forEach(def => { html += this._testItemCard(def, this._test.accessories.includes(def.name), 'data-test-accessory'); });
      html += '</div></section>';
      html += '<div class="adv-test-actions"><button type="button" class="adv-btn adv-btn-primary" id="adv-test-loadout-confirm">确认配置</button></div></div>';
      this.container.innerHTML = html;
      this._mountTrophyCards(this.container);
    }

    _renderTestMode() {
      if (!this._test) return;
      // 测试房是独立的实验入口，允许直接选择全部已注册怪物/Boss；
      // minStage 只限制正式冒险地图的随机遭遇，不限制测试对象选择。
      const normal = window.AdventureRegistry ? window.AdventureRegistry.allMonsters() : [];
      const bosses = window.AdventureRegistry ? window.AdventureRegistry.allBosses() : [];
      const mode = this._test.mode;
      const pool = mode === 'boss' ? bosses : normal;
      const needed = mode === '1v2' ? 2 : 1;
      let html = '<div class="adv-test-shell"><div class="adv-test-header"><div><div class="adv-test-kicker">COMBAT LAB</div><h2>选择测试房间</h2><p>击败全部对手后直接结束，不产生金币、道具或兽元奖励。</p></div><button type="button" class="adv-test-link" id="adv-test-back-loadout">返回配置</button></div>';
      html += '<div class="adv-test-mode-grid">' +
        '<button type="button" class="adv-test-mode' + (mode === '1v1' ? ' selected' : '') + '" data-test-mode="1v1"><strong>1v1</strong><span>普通房 · 选择 1 个普通怪物</span></button>' +
        '<button type="button" class="adv-test-mode' + (mode === '1v2' ? ' selected' : '') + '" data-test-mode="1v2"><strong>1v2</strong><span>挑战房 · 选择 2 个普通怪物</span></button>' +
        '<button type="button" class="adv-test-mode' + (mode === 'boss' ? ' selected' : '') + '" data-test-mode="boss"><strong>Boss</strong><span>Boss房 · 选择 1 个 Boss</span></button>' +
        '</div>';
      const curStage = this._test.stage || 1;
      html += '<div class="adv-test-stage-row"><span class="adv-test-stage-label">Stage 强化</span><div class="adv-test-stage-btns">';
      for (let s = 1; s <= 4; s++) {
        html += '<button type="button" class="adv-test-stage' + (curStage === s ? ' selected' : '') + '" data-test-stage="' + s + '">Stage ' + s + '</button>';
      }
      html += '</div></div>';
      if (mode) {
        html += '<section class="adv-test-section"><div class="adv-test-section-head"><h3>' + (mode === 'boss' ? 'Boss 列表' : '普通怪物列表') + '</h3><span>' + this._test.opponents.length + ' / ' + needed + '</span></div><div class="adv-test-opponent-grid">';
        pool.forEach(def => {
          const selected = this._test.opponents.includes(def.name);
          const icon = def.icon ? '<img src="' + def.icon + '" alt="" class="adv-test-opponent-icon">' : '';
          html += '<button type="button" class="adv-test-opponent' + (selected ? ' selected' : '') + '" data-test-opponent="' + def.name + '">' + icon + '<span class="adv-test-opponent-name">' + (def.kind || def.name) + '</span><span class="adv-test-opponent-meta">' + def.name + ' · HP ' + (def.hp || 0) + '</span></button>';
        });
        html += '</div></section><div class="adv-test-actions"><button type="button" class="adv-btn adv-btn-primary" id="adv-test-start"' + (this._test.opponents.length === needed ? '' : ' disabled') + '>开始测试</button></div>';
      }
      html += '</div>';
      this.container.innerHTML = html;
    }

    _startTestBattle() {
      if (!this._test || this._test.running) return;
      if (!window.AdventureBattleController || !window.AdventureBattleController.isAvailable()) {
        this._showCombatLaunchError('战斗模块加载失败，请刷新页面后重试');
        return;
      }
      const mode = this._test.mode;
      const opponents = this._test.opponents.slice();
      const userStage = this._test.stage || 1;
      const effStage = (name) => {
        const def = window.AdventureRegistry.getMonster(name) || window.AdventureRegistry.getBoss(name);
        const minS = def && Number.isFinite(Number(def.minStage)) ? Number(def.minStage) : 1;
        return Math.max(userStage, minS);
      };
      const map = window.AdventureMap.fromGrid([[0, 1, 2]]);
      this.eng.start(map, this._test.characterName, { consumables: this._test.items, trophyWhiteCards: this._test.trophyWhiteCards, accessories: this._test.accessories, stage: userStage, scene: 'castle' });
      // Test mode enters combat directly instead of going through a map room,
      // so reveal the room's initial table card here.
      if (!this.eng.s.discardTop || !this.eng.s.discardTop.get()) this.eng._initializeDiscardTop();
      const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));
      const initialState = {
        playerState: clone(this.eng.s.player),
        playerPile: { deck: clone(this.eng.s.playerPile.deck), hand: clone(this.eng.s.playerPile.hand), discard: clone(this.eng.s.playerPile.discard), handLimit: this.eng.s.playerPile.handLimit },
        discardTop: this.eng.s.discardTop ? clone(this.eng.s.discardTop.get()) : null,
        discardTopOwner: this.eng.s.discardTopOwner || null,
        adventureCurrency: this.eng.s.currency,
        adventureEngine: this.eng,
        stage: userStage,
        scene: 'castle',
        testMode: true
      };
      if (mode === '1v2') {
        initialState.opponent1Stage = effStage(opponents[0]);
        initialState.opponent2Stage = effStage(opponents[1]);
      } else {
        initialState.opponentStage = effStage(opponents[0]);
      }
      this._test.running = true;
      this._bridgeCombatStarting = true;
      const done = (result, state, persistentState, meta) => this._onTestBattleEnd(result, state, persistentState, meta);
      const promise = mode === '1v2'
        ? window.AdventureBattleController.startCombat1v2(this._test.characterName, opponents[0], opponents[1], done, initialState)
        : window.AdventureBattleController.startCombat(this._test.characterName, opponents[0], done, initialState);
      Promise.resolve(promise).catch(error => {
        this._test.running = false;
        this._bridgeCombatStarting = false;
        this._showCombatLaunchError('测试启动失败：' + (error.message || error));
      });
    }

    _onTestBattleEnd(result) {
      this._bridgeCombatStarting = false;
      this._bridgeCombatActive = false;
      if (!this._test) return;
      this._test.running = false;
      this._test.result = result;
      this._renderTestResult();
    }

    _renderTestResult() {
      if (!this._test) return;
      const won = this._test.result === 'win';
      const rewind = this._test.result === 'rewind';
      const label = this._test.mode === 'boss' ? 'Boss 测试' : (this._test.mode === '1v2' ? '1v2 挑战测试' : '1v1 普通测试');
      const mark = won ? '✓' : (rewind ? '↺' : '×');
      const title = won ? '测试完成' : (rewind ? '已回溯退出' : '测试结束');
      const detail = won ? '：已击败所有对手。' : (rewind ? '：使用回溯沙漏退出了战斗。' : '：本次未能击败对手。');
      this.container.innerHTML = '<div class="adv-test-shell adv-test-result"><div class="adv-test-kicker">TEST COMPLETE</div><div class="adv-test-result-mark ' + (won ? 'win' : 'lose') + '">' + mark + '</div><h2>' + title + '</h2><p>' + label + detail + '</p><p class="adv-test-muted">测试不会发放奖励，也不会改变正式冒险进度。</p><div class="adv-test-actions"><button type="button" class="adv-btn adv-btn-primary" id="adv-test-again">再次测试</button><button type="button" class="adv-btn" id="adv-test-home">返回主页</button></div></div>';
    }

    _getDialogs() {
      if (!this._dialogs) this._dialogs = new DialogManager(() => {});
      return this._dialogs;
    }

    _showCardMasterChoice(onChoose) {
      if (document.getElementById('card-master-choice-dialog')) return;
      const overlay = document.createElement('div');
      overlay.id = 'card-master-choice-dialog';
      overlay.className = 'dialog-overlay';
      overlay.innerHTML = '<div class="dialog-box" style="max-width:360px">' +
        '<div class="dialog-title">卡牌大师</div>' +
        '<div class="dialog-body" style="color:rgba(255,255,255,0.85);font-size:0.85rem;margin-bottom:12px">选择一项效果</div>' +
        '<div class="dialog-buttons" style="display:flex;flex-direction:column;gap:6px">' +
        '<button class="adv-btn adv-btn-primary" id="cm-draw2">抽取两张牌</button>' +
        '<button class="adv-btn" id="cm-mulligan">弃掉全部手牌并重抽同等数量</button>' +
        '<button class="adv-btn" id="cm-cancel">取消</button>' +
        '</div></div>';
      document.body.appendChild(overlay);
      const close = () => overlay.remove();
      overlay.querySelector('#cm-draw2').addEventListener('click', () => { close(); onChoose('draw2'); });
      overlay.querySelector('#cm-mulligan').addEventListener('click', () => { close(); onChoose('mulligan'); });
      overlay.querySelector('#cm-cancel').addEventListener('click', close);
      overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
    }

    _showCrystalBallChoice(cards, onChoose, onCancel) {
      if (document.getElementById('crystal-ball-choice-dialog')) return;
      const overlay = document.createElement('div'); overlay.id = 'crystal-ball-choice-dialog'; overlay.className = 'dialog-overlay';
      const box = document.createElement('div'); box.className = 'dialog-box'; box.style.maxWidth = '520px';
      box.innerHTML = '<div class="dialog-title">水晶球</div><div class="dialog-body" style="color:rgba(255,255,255,0.85);font-size:0.85rem;margin-bottom:12px">拖拽排序，最左侧为牌库顶</div>';
      const row = document.createElement('div'); row.className = 'chan-five-row crystal-ball-row';
      const order = cards.map((_, i) => i);
      const refresh = () => { const nodes = new Map([...row.children].map(node => [Number(node.dataset.sortIndex), node])); order.forEach(i => { if (nodes.get(i)) row.appendChild(nodes.get(i)); }); };
      cards.forEach((card, index) => {
        const node = renderCard(card, 70, 100, false); node.classList.add('crystal-ball-sort-card'); node.draggable = true; node.dataset.sortIndex = String(index);
        node.addEventListener('dragstart', event => { event.dataTransfer.setData('text/plain', String(index)); node.classList.add('dragging'); });
        node.addEventListener('dragend', () => node.classList.remove('dragging'));
        node.addEventListener('dragover', event => { event.preventDefault(); node.classList.add('drag-target'); });
        node.addEventListener('dragleave', () => node.classList.remove('drag-target'));
        node.addEventListener('drop', event => { event.preventDefault(); node.classList.remove('drag-target'); const from = Number(event.dataTransfer.getData('text/plain')); const fromPos = order.indexOf(from); const toPos = order.indexOf(index); if (fromPos >= 0 && toPos >= 0 && fromPos !== toPos) { order.splice(fromPos, 1); order.splice(toPos, 0, from); refresh(); } });
        row.appendChild(node);
      });
      box.appendChild(row);
      const actions = document.createElement('div'); actions.className = 'dialog-buttons';
      const reset = document.createElement('button'); reset.className = 'adv-btn'; reset.textContent = '重置'; reset.onclick = () => { order.splice(0, order.length, ...cards.map((_, i) => i)); refresh(); };
      const confirm = document.createElement('button'); confirm.className = 'adv-btn adv-btn-primary'; confirm.textContent = '确认放回'; confirm.onclick = () => { overlay.remove(); onChoose(order.slice()); };
      const cancel = document.createElement('button'); cancel.className = 'adv-btn'; cancel.textContent = '取消'; cancel.onclick = () => { overlay.remove(); if (onCancel) onCancel(); };
      actions.append(reset, confirm, cancel); box.appendChild(actions); overlay.appendChild(box); document.body.appendChild(overlay);
      overlay.addEventListener('click', event => { if (event.target === overlay) { overlay.remove(); if (onCancel) onCancel(); } });
    }

    _showCombatLaunchError(message) {
      this._bridgeCombatStarting = false;
      this._bridgeCombatActive = false;
      this.container.innerHTML = '';
      const box = document.createElement('div');
      box.className = 'adv-loading adv-combat-error';
      box.textContent = message;
      this.container.appendChild(box);
    }

    async _advanceStage() {
      this.eng.enterNextStage();
      if (this.eng.s.phase !== window.AdventurePhase.CLEAR) return;
      const scenes = ['castle', 'forest', 'ocean'];
      let stage = this.eng.s.stage || 1;
      let scene = this.eng.s.scene || 'castle';
      stage++;
      if (stage > 4) { stage = 1; scene = scenes[Math.floor(random() * scenes.length)]; }
      const variant = 1 + Math.floor(random() * 3);
      const mapName = 'stage_' + String(stage).padStart(2, '0') + '_' + scene + '_' + variant;
      const mapUrl = 'maps/' + mapName + '.csv';
      try {
        let map;
        if (window.AdventureMapData && window.AdventureMapData[mapName]) {
          map = window.AdventureMap.fromCsvText(window.AdventureMapData[mapName]);
        } else {
          map = await window.AdventureMap.fromCsvUrl(mapUrl);
        }
        this.eng.continueTo(map, { stage: stage, scene: scene });
        if (typeof this.eng.onCombatReturnToMap === 'function') {
          const returnEffect = this.eng.onCombatReturnToMap();
          if (returnEffect) this._pendingMapReturnEffect = returnEffect;
        }
        this.render();
      } catch (e) {
        this._toast('加载下一层失败：' + (e.message || e));
      }
    }

    _showTrophyBackpack() {
      if (document.getElementById('adv-trophy-backpack-dialog')) return;
      const cards = (this.eng.snapshot() && this.eng.snapshot().trophyWhiteCards) || [];
      const overlay = document.createElement('div');
      overlay.id = 'adv-trophy-backpack-dialog';
      overlay.className = 'dialog-overlay';
      const rows = cards.length ? cards.map((card, index) =>
        '<div class="adv-trophy-pack-row"><div class="adv-trophy-pack-card">' + this._trophyCardMarkup(card.name, 46, 68) + '<div><b>' + card.displayName + '</b><small>' + (card.description || '') + '</small></div></div><button class="adv-btn adv-trophy-pack-discard" data-trophy-discard="' + index + '">丢弃</button></div>'
      ).join('') : '<div class="adv-trophy-pack-empty">尚未获得战利白卡</div>';
      overlay.innerHTML = '<div class="dialog-box adv-trophy-pack-dialog"><div class="dialog-title">战利白卡背包</div><div class="dialog-body adv-trophy-pack-list">' + rows + '</div><div class="dialog-buttons"><button class="adv-btn adv-btn-primary" id="adv-trophy-pack-close">关闭</button></div></div>';
      document.body.appendChild(overlay);
      this._mountTrophyCards(overlay);
      const close = () => overlay.remove();
      overlay.querySelector('#adv-trophy-pack-close').addEventListener('click', close);
      overlay.querySelectorAll('[data-trophy-discard]').forEach(btn => btn.addEventListener('click', () => {
        const result = this.eng.discardTrophyWhiteCard(Number(btn.getAttribute('data-trophy-discard')));
        if (!result.ok) return;
        close();
        this.render();
        this._showTrophyBackpack();
      }));
      overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
    }

    _showConfirmDialog(title, body, onConfirm) {
      if (document.getElementById('adv-confirm-dialog')) return;
      const overlay = document.createElement('div');
      overlay.id = 'adv-confirm-dialog';
      overlay.className = 'dialog-overlay';
      overlay.innerHTML = '<div class="dialog-box" style="max-width:360px">' +
        '<div class="dialog-title">' + title + '</div>' +
        '<div class="dialog-body" style="color:rgba(255,255,255,0.85);font-size:0.85rem;margin-bottom:12px">' + body + '</div>' +
        '<div class="dialog-buttons" style="display:flex;gap:8px;justify-content:flex-end">' +
        '<button class="adv-btn" id="adv-confirm-cancel">取消</button>' +
        '<button class="adv-btn adv-btn-primary" id="adv-confirm-ok">确定</button>' +
        '</div></div>';
      document.body.appendChild(overlay);
      const close = () => overlay.remove();
      overlay.querySelector('#adv-confirm-ok').addEventListener('click', () => { close(); onConfirm(); });
      overlay.querySelector('#adv-confirm-cancel').addEventListener('click', close);
      overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
    }

    _showAlertDialog(title, body, onClose) {
      if (document.getElementById('adv-alert-dialog')) return;
      const overlay = document.createElement('div');
      overlay.id = 'adv-alert-dialog';
      overlay.className = 'dialog-overlay';
      overlay.innerHTML = '<div class="dialog-box" style="max-width:360px">' +
        '<div class="dialog-title">' + title + '</div>' +
        '<div class="dialog-body" style="color:rgba(255,255,255,0.85);font-size:0.85rem;margin-bottom:12px">' + body + '</div>' +
        '<div class="dialog-buttons" style="display:flex;gap:8px;justify-content:flex-end">' +
        '<button class="adv-btn adv-btn-primary" id="adv-alert-ok">确定</button>' +
        '</div></div>';
      document.body.appendChild(overlay);
      const close = () => { overlay.remove(); if (onClose) onClose(); };
      overlay.querySelector('#adv-alert-ok').addEventListener('click', close);
      overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
    }

    _toast(msg) {
      const t = document.createElement('div');
      t.className = 'adv-toast';
      t.textContent = msg;
      this.container.appendChild(t);
      schedule(() => t.remove(), 1500);
    }
  }

  window.AdventureUI = AdventureUI;
})();

/**
 * Adventure combat bridge
 *
 * The normal GameUI continues to call the ordinary Bridge API. During a room
 * battle, that API is temporarily backed by AdventureBattleEngine, which uses
 * the 1v1 state machine with adventure-specific independent piles.
 */
(function () {
  let gameUI = null;
  let battleEngine = null;
  let onComplete = null;
  let prevDisplay = null;
  let completing = false;
  // Explicit menu exit abandons the run.  Keep this separate from normal
  // navigation so pagehide/instrumented callbacks cannot save it again.
  let abandonRequested = false;
  const normalBattleApi = window.furryBattle;
  const GAME_HOME_URL = '../index.html';
  const COMBAT_SESSION_KEY = 'furryAdventureCombatSessionV1';
  const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));

  function saveCombatSession(engine) {
    if (abandonRequested || !engine || !engine.s || engine.testMode) return;
    if (engine.s.phase === 'GAME_OVER') {
      clearCombatSession();
      return;
    }
    try {
      const adv = engine._adventureEngine;
      sessionStorage.setItem(COMBAT_SESSION_KEY, JSON.stringify({
        version: 1,
        characterName: engine.s.player && engine.s.player.name,
        mapName: adv && adv.mapName,
        enemy: engine.s.ai && engine.s.ai.name,
        enemy2: engine.s.ai2 && engine.s.ai2.name,
        battle: {
          s: clone(engine.s), piles: clone(engine.piles), h: clone(engine.h),
          events: clone(engine.events), ver: engine.ver,
          pendingSettlement: clone(engine.pendingSettlement),
          tableTopOwner: engine.tableTopOwner,
          testMode: false
        }
      }));
    } catch (_) { /* session storage may be unavailable/private */ }
  }

  function loadCombatSession() {
    try {
      const raw = sessionStorage.getItem(COMBAT_SESSION_KEY);
      const data = raw ? JSON.parse(raw) : null;
      return data && data.version === 1 && data.battle ? data : null;
    } catch (_) { return null; }
  }

  function clearCombatSession() {
    try { sessionStorage.removeItem(COMBAT_SESSION_KEY); } catch (_) { /* ignore */ }
  }

  function abandonAdventure() {
    abandonRequested = true;
    clearCombatSession();
    try {
      if (window.AdventureSave && typeof window.AdventureSave.clear === 'function') {
        window.AdventureSave.clear();
      }
    } catch (_) { /* ignore storage errors while leaving */ }
    battleEngine = null;
    completing = false;
  }

  function instrumentBattlePersistence(engine) {
    if (!engine || typeof engine.later !== 'function') return;
    const originalLater = engine.later;
    engine.later = function (fn, ms) {
      return originalLater.call(this, () => {
        try { return fn(); }
        finally { saveCombatSession(this); }
      }, ms);
    };
  }

  function goToGameHome() {
    window.location.href = GAME_HOME_URL;
  }

  function localApi(engine) {
    return {
      dispatch(method, params) {
        try {
          const result = engine.dispatch(method, params || {});
          saveCombatSession(engine);
          return result;
        } catch (error) {
          saveCombatSession(engine);
          throw error;
        }
      },
      getState() { return engine.state(); }
    };
  }

  function restoreNormalBattleApi() {
    if (normalBattleApi) window.furryBattle = normalBattleApi;
    if (window.Bridge) Bridge._mode = 'local';
  }

  function leaveBattleToMap(finalState, persistentState, playerWon) {
    if (gameUI) {
      if (gameUI.gameScreen) gameUI.gameScreen.classList.remove('active');
      gameUI._is1v2 = false;
    }
    const gc = document.getElementById('game-container');
    if (gc) gc.style.display = 'none';
    const menuBtn = document.getElementById('menu-btn');
    if (menuBtn) menuBtn.style.display = '';
    restoreNormalBattleApi();

    const callback = onComplete;
    onComplete = null;
    clearCombatSession();
    battleEngine = null;
    completing = false;

    if (!playerWon) {
      goToGameHome();
      return;
    }

    const adventureContainer = document.getElementById('adventure-container');
    if (adventureContainer && prevDisplay !== null) adventureContainer.style.display = prevDisplay;
    if (callback) callback('win', finalState, persistentState, { settled: true });
  }

  function leaveTestBattle(finalState, persistentState, playerWon) {
    if (gameUI) {
      if (gameUI.gameScreen) gameUI.gameScreen.classList.remove('active');
      gameUI._is1v2 = false;
    }
    const gc = document.getElementById('game-container');
    if (gc) gc.style.display = 'none';
    const menuBtn = document.getElementById('menu-btn');
    if (menuBtn) menuBtn.style.display = '';
    restoreNormalBattleApi();
    const adventureContainer = document.getElementById('adventure-container');
    if (adventureContainer && prevDisplay !== null) adventureContainer.style.display = prevDisplay;
    const callback = onComplete;
    onComplete = null;
    clearCombatSession();
    battleEngine = null;
    completing = false;
    if (callback) callback(playerWon ? 'win' : 'lose', finalState, persistentState, { test: true, settled: true });
  }

  function itemLabel(name) {
    const def = window.AdventureRegistry && window.AdventureRegistry.getItem(name);
    if (!def) return name;
    if (def.icon) {
      return '<span class="adv-settle-item">' +
        '<img src="' + def.icon + '" class="adv-settle-icon" alt="">' +
        def.displayName + '</span>';
    }
    return def.displayName;
  }

  function showAccessoryFullDialog(message) {
    if (document.getElementById('adv-accessory-full-dialog')) return;
    const overlay = document.createElement('div');
    overlay.id = 'adv-accessory-full-dialog';
    overlay.className = 'dialog-overlay';
    overlay.innerHTML = '<div class="dialog-box" style="max-width:360px">' +
      '<div class="dialog-title">无法拾取</div>' +
      '<div class="dialog-body" style="color:rgba(255,255,255,0.85);font-size:0.85rem;margin-bottom:12px">' + (message || '配饰已达上限') + '</div>' +
      '<div class="dialog-buttons" style="display:flex;gap:8px;justify-content:flex-end">' +
      '<button class="adv-btn adv-btn-primary" id="adv-af-ok">确定</button>' +
      '</div></div>';
    document.body.appendChild(overlay);
    const close = () => overlay.remove();
    overlay.querySelector('#adv-af-ok').addEventListener('click', close);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  }

  function bindSettleEvents(overlay, eng, leave) {
    overlay.querySelectorAll('[data-beast-slot]').forEach(btn => {
      btn.addEventListener('click', () => {
        eng.toggleBeastSlot(parseInt(btn.getAttribute('data-beast-slot'), 10));
        renderSettlement(overlay, eng, leave);
      });
    });
    overlay.querySelectorAll('[data-beast-discard]').forEach(btn => {
      btn.addEventListener('click', () => {
        eng.discardBeastToken(btn.getAttribute('data-beast-discard'));
        if (eng.s.phase === window.AdventurePhase.MAP) leave();
        else renderSettlement(overlay, eng, leave);
      });
    });
    overlay.querySelectorAll('[data-item-discard]').forEach(btn => {
      btn.addEventListener('click', () => {
        eng.discardConsumable(parseInt(btn.getAttribute('data-item-discard'), 10));
        if (eng.s.phase === window.AdventurePhase.MAP) leave();
        else renderSettlement(overlay, eng, leave);
      });
    });
    const claimBtn = overlay.querySelector('#adv-settle-claim');
    if (claimBtn) {
      claimBtn.addEventListener('click', () => {
        if (!eng.claimCombatReward()) {
          if (eng._lastRewardError && eng._lastRewardError.reason === 'accessoryFull') {
            renderSettlement(overlay, eng, leave, eng._lastRewardError.message);
          }
          return;
        }
        if (eng.s.phase === window.AdventurePhase.MAP) leave();
        else renderSettlement(overlay, eng, leave);
      });
    }
    const deferBtn = overlay.querySelector('#adv-settle-defer');
    if (deferBtn) {
      deferBtn.addEventListener('click', () => {
        if (!eng.deferCombatReward()) return;
        if (eng.s.phase === window.AdventurePhase.MAP) leave();
        else renderSettlement(overlay, eng, leave);
      });
    }
    const nextBtn = overlay.querySelector('#adv-settle-next');
    if (nextBtn) {
      nextBtn.addEventListener('click', () => {
        const current = eng.snapshot();
        if (current.pendingCombatReward && current.pendingCombatReward.stage === 'basic' && !current.pendingCombatReward.applied && current.pendingCombatReward.roomType === 'boss') {
          if (!eng.deferCombatReward()) return;
        }
        eng.enterNextStage();
        leave();
      });
    }
    const mapBtn = overlay.querySelector('#adv-settle-map');
    if (mapBtn) mapBtn.addEventListener('click', () => {
      // Boss exits reopen the adventure settlement page on return; they no
      // longer drop the player onto the map with standalone action buttons.
      const room = eng.currentRoom && eng.currentRoom();
      if (room && room.type === window.RoomType.BOSS && room.cleared) {
        eng.returnToMap();
        eng.enterCurrent();
      } else {
        eng.returnToMap();
      }
      leave();
    });
    const returnBtn = overlay.querySelector('#adv-settle-return');
    if (returnBtn) returnBtn.addEventListener('click', () => goToGameHome());
  }

  function beastAutoRewardHtml(beast, AC) {
    if (!beast || !beast.offered) return '';
    const rows = [];
    for (const key in beast.offered) {
      if (!beast.offered[key]) continue;
      const label = AC.BEAST_LABEL[key] || key;
      const icon = AC.BEAST_ICON[key]
        ? '<img src="' + AC.BEAST_ICON[key] + '" class="adv-settle-icon" alt="' + label + '">'
        : '';
      rows.push('<div class="adv-settle-row">' + icon + label + ' ×' + beast.offered[key] + '</div>');
    }
    return rows.join('');
  }

  function basicRewardHtml(pending, AC) {
    const basic = pending && pending.basic;
    if (!basic) return '<div class="adv-settle-row">基础奖励：无</div>';
    if (basic.kind === 'none') {
      return '<div class="adv-settle-row">基础奖励：无奖励</div>';
    }
    if (basic.kind === 'gold') {
      const goldIcon = AC && AC.GOLD_ICON ? '<img src="' + AC.GOLD_ICON + '" class="adv-settle-icon" alt="金币">' : '';
      return '<div class="adv-settle-row">' + goldIcon + '金币 ×' + basic.gold + '</div>';
    }
    if (basic.kind === 'items') {
      const list = Array.isArray(basic.items) ? basic.items : [];
      if (!list.length) return '<div class="adv-settle-row">道具：无</div>';
      return list.map(n => '<div class="adv-settle-row">道具：' + itemLabel(n) + '</div>').join('');
    }
    if (basic.kind === 'item') {
      return '<div class="adv-settle-row">道具：' + itemLabel(basic.item) + '</div>';
    }
    if (basic.kind === 'accessory') {
      const name = basic.accessory || basic.item;
      const def = window.AdventureRegistry && window.AdventureRegistry.getItem(name);
      const icon = def && def.icon ? '<img src="' + def.icon + '" class="adv-settle-icon" alt="">' : '';
      return '<div class="adv-settle-row">' + icon + '配饰：' + (def ? def.displayName : name) + '</div>';
    }
    if (basic.kind === 'beast') {
      const label = AC.BEAST_LABEL[basic.beastType] || basic.beastType;
      const icon = AC.BEAST_ICON[basic.beastType]
        ? '<img src="' + AC.BEAST_ICON[basic.beastType] + '" class="adv-settle-icon" alt="' + label + '">'
        : '';
      return '<div class="adv-settle-row">' + icon + '兽元：' + label + ' ×1</div>';
    }
    return '<div class="adv-settle-row">基础奖励：无</div>';
  }

  function bonusRewardHtml(pending, AC) {
    const bonus = pending && pending.bonus;
    if (!bonus) return '<div class="adv-settle-row">无奖励</div>';
    if (bonus.kind === 'gold') {
      const goldIcon = AC && AC.GOLD_ICON ? '<img src="' + AC.GOLD_ICON + '" class="adv-settle-icon" alt="金币">' : '';
      return '<div class="adv-settle-row">' + goldIcon + '金币 ×' + bonus.gold + '</div>';
    }
    if (bonus.kind === 'items' || bonus.kind === 'item') {
      const list = bonus.items || (bonus.item ? [bonus.item] : []);
      if (!list.length) return '<div class="adv-settle-row">道具：无</div>';
      return list.map(n => '<div class="adv-settle-row">道具：' + itemLabel(n) + '</div>').join('');
    }
    if (bonus.kind === 'accessory') {
      const name = bonus.accessory || bonus.item;
      const def = window.AdventureRegistry && window.AdventureRegistry.getItem(name);
      const icon = def && def.icon ? '<img src="' + def.icon + '" class="adv-settle-icon" alt="">' : '';
      return '<div class="adv-settle-row">' + icon + '配饰：' + (def ? def.displayName : name) + '</div>';
    }
    return '<div class="adv-settle-row">无奖励</div>';
  }

  function sidebarItemHtml(item) {
    const icon = item.icon
      ? '<img src="' + item.icon + '" class="adv-sidebar-icon" alt="">'
      : '<span class="adv-sidebar-noicon"></span>';
    return '<div class="adv-sidebar-item" title="' + (item.description || '') + '">' +
      icon + '<span class="adv-sidebar-item-name">' + item.displayName + '</span></div>';
  }

  function buildSidebarHtml(snap) {
    const AC = window.AdventureCurrency;
    const cur = snap.currency || {};
    const tokens = cur.tokens || {};
    const goldIcon = AC && AC.GOLD_ICON ? '<img src="' + AC.GOLD_ICON + '" class="adv-sidebar-icon" alt="金币">' : '';
    let html = '<div class="adv-settle-sidebar">';
    html += '<div class="adv-sidebar-title">当前持有</div>';

    html += '<div class="adv-sidebar-section">';
    html += '<div class="adv-sidebar-subtitle">货币</div>';
    html += '<div class="adv-sidebar-row">' + goldIcon + '<span>金币 ×' + (cur.gold || 0) + '</span></div>';
    (AC.ALL_BEAST_TYPES || []).forEach(k => {
      const cnt = tokens[k] || 0;
      if (cnt <= 0) return;
      const icon = AC.BEAST_ICON[k] ? '<img src="' + AC.BEAST_ICON[k] + '" class="adv-sidebar-icon" alt="' + AC.BEAST_LABEL[k] + '">' : '';
      html += '<div class="adv-sidebar-row">' + icon + '<span>' + AC.BEAST_LABEL[k] + ' ×' + cnt + '</span></div>';
    });
    html += '</div>';

    const consumables = snap.consumables || [];
    if (consumables.length) {
      html += '<div class="adv-sidebar-section">';
      html += '<div class="adv-sidebar-subtitle">道具 (' + consumables.length + '/' + (snap.consumableSlots || 6) + ')</div>';
      consumables.forEach(it => { html += sidebarItemHtml(it); });
      html += '</div>';
    }

    const accessories = snap.accessories || [];
    if (accessories.length) {
      html += '<div class="adv-sidebar-section">';
      html += '<div class="adv-sidebar-subtitle">配饰 (' + accessories.length + ')</div>';
      accessories.forEach(it => { html += sidebarItemHtml(it); });
      html += '</div>';
    }

    html += '</div>';
    return html;
  }

  function renderSettlement(overlay, eng, leave, errorMsg) {
    const snap = eng.snapshot();
    const AC = window.AdventureCurrency;
    const Phase = window.AdventurePhase;
    const playerWon = snap.phase !== Phase.GAME_OVER;
    const pending = snap.pendingCombatReward;

    let html = '<div class="adv-settle-wrapper">';
    html += '<div class="game-over-box adv-settle-box">';
    if (!playerWon) {
      html += '<h2>败北...</h2>' +
        '<div class="winner-text">冒险失败</div>' +
        '<button id="adv-settle-return">返回主页</button>';
    } else {
      html += '<h2>胜利!</h2>';
      html += '<div class="adv-settle-rewards">';

      if (errorMsg) {
        html += '<div class="adv-settle-section-title">无法拾取</div>';
        html += '<div class="adv-settle-row" style="color:#fb7185">' + errorMsg + '</div>';
        html += '</div>';
        html += '<div class="adv-settle-actions">' +
          '<button id="adv-settle-defer" class="adv-settle-secondary">留在房间</button>' +
          '</div>';
      } else if (snap.phase === Phase.COMBAT_SETTLE && pending && pending.stage === 'basic') {
        const isBoss = pending.roomType === 'boss';
        html += '<div class="adv-settle-section-title">' + (isBoss ? 'Boss奖励' : '基础奖励') + '</div>';
        html += basicRewardHtml(pending, AC);
        html += '</div>';
        html += '<div class="adv-settle-actions">' +
          '<button id="adv-settle-claim">领取</button>' +
          (isBoss ? '<button id="adv-settle-next" class="adv-settle-secondary">直接进入下一层</button>' : '<button id="adv-settle-defer" class="adv-settle-secondary">留在房间</button>') +
          '</div>';
      } else if (snap.phase === Phase.COMBAT_SETTLE && pending && pending.stage === 'boss-exit') {
        html += '<div class="adv-settle-section-title">Boss已战胜</div>';
        html += '<div class="adv-settle-row">选择返回地图，或进入下一层。</div>';
        html += '</div>';
        html += '<div class="adv-settle-actions">' +
          '<button id="adv-settle-map">返回地图</button>' +
          '<button id="adv-settle-next" class="adv-settle-secondary">进入下一层</button>' +
          '</div>';
      } else if (snap.phase === Phase.COMBAT_SETTLE && pending && pending.stage === 'bonus') {
        html += '<div class="adv-settle-section-title">挑战房奖励</div>';
        html += bonusRewardHtml(pending, AC);
        html += '</div>';
        html += '<div class="adv-settle-actions">' +
          '<button id="adv-settle-claim">领取</button>' +
          '</div>';
      } else if (snap.phase === Phase.BEAST_CHOICE && snap.beastReward) {
        const br = snap.beastReward;
        const selection = br.selection || [];
        const pickCount = br.pickCount || 2;
        const slots = br.slots || [];
        const atPickLimit = selection.length >= pickCount;
        html += '<div class="adv-beast-panel-title">兽元结算（选' + pickCount + '个）</div>';
        html += '<div class="adv-beast-grid">';
        slots.forEach(slot => {
          const isSelected = !!slot.selected;
          const isMaxed = atPickLimit && !isSelected;
          html += '<button class="adv-beast-cell' + (isSelected ? ' selected' : '') + (isMaxed ? ' maxed' : '') + '" data-beast-slot="' + slot.index + '" title="' + AC.BEAST_LABEL[slot.type] + '">' +
            '<img src="' + AC.BEAST_ICON[slot.type] + '" class="adv-beast-cell-icon" alt="' + AC.BEAST_LABEL[slot.type] + '">' +
            '<span class="adv-beast-cell-label">' + AC.BEAST_LABEL[slot.type] + '</span>' +
          '</button>';
        });
        html += '</div>';
        const selText = selection.length
          ? selection.map(k => '<img src="' + AC.BEAST_ICON[k] + '" class="adv-beast-sel-icon" alt="' + AC.BEAST_LABEL[k] + '">').join(' ')
          : '（未选）';
        html += '<div class="adv-beast-selection">已选：' + selText + ' (' + selection.length + '/' + pickCount + ')</div>';
        html += '</div>';
        html += '<button id="adv-settle-claim"' + (selection.length >= pickCount ? '' : ' disabled') + '>领取并返回</button>';
      } else if (snap.phase === Phase.BEAST_DISCARD) {
        const t = snap.currency.tokens;
        const types = (AC.ALL_BEAST_TYPES || []).filter(k => t[k] > 0);
        html += '<div class="adv-beast-panel-title">兽元超过上限，请舍弃 ' + snap.pendingDiscard + ' 个</div>';
        html += '<div class="adv-beast-offered">';
        types.forEach(k => {
          html += '<button class="adv-beast-pick adv-beast-' + k + '" data-beast-discard="' + k + '" title="' + AC.BEAST_LABEL[k] + '">' +
            '<img src="' + AC.BEAST_ICON[k] + '" class="adv-beast-pick-icon" alt="' + AC.BEAST_LABEL[k] + '">' +
            '<span class="adv-beast-pick-count">×' + t[k] + '</span></button>';
        });
        html += '</div></div>';
      } else if (snap.phase === Phase.ITEM_DISCARD) {
        html += '<div class="adv-settle-section-title">道具槽超过上限</div>';
        html += '<div class="adv-settle-row">请舍弃 ' + snap.pendingItemDiscard + ' 个道具（保留 ' + (snap.consumableSlots || 6) + ' 个）</div>';
        html += '<div class="adv-item-discard-grid">';
        (snap.consumables || []).forEach((item, index) => {
          const icon = item.icon ? '<img src="' + item.icon + '" class="adv-sidebar-icon" alt="">' : '';
          html += '<button class="adv-beast-pick adv-item-discard-slot" data-item-discard="' + index + '" title="丢弃 ' + item.displayName + '">' + icon + '<span>' + item.displayName + '</span><small>丢弃</small></button>';
        });
        html += '</div></div>';
      } else if (snap.phase === Phase.COMBAT_SETTLE && pending && pending.stage === 'beast' && pending.beast && pending.beast.auto) {
        html += '<div class="adv-settle-section-title">兽元结算</div>';
        html += beastAutoRewardHtml(pending.beast, AC);
        html += '</div>';
        html += '<button id="adv-settle-claim">领取并返回</button>';
      } else {
        html += '</div>';
        html += '<button id="adv-settle-claim">领取并返回</button>';
      }
    }
    html += '</div>';
    html += buildSidebarHtml(snap);
    html += '</div>';
    overlay.innerHTML = html;
    bindSettleEvents(overlay, eng, leave);
  }


  function showAdventureSettlement(eng, finalState, persistentState, playerWon) {
    const existing = document.getElementById('adv-settle-overlay');
    if (existing) existing.remove();
    const overlay = document.createElement('div');
    overlay.id = 'adv-settle-overlay';
    overlay.className = 'game-over-overlay';
    document.body.appendChild(overlay);

    const leave = () => {
      overlay.remove();
      leaveBattleToMap(finalState, persistentState, playerWon);
    };
    renderSettlement(overlay, eng, leave);
  }

  function ensureGameUI() {
    if (gameUI) return gameUI;
    gameUI = new GameUI();
    gameUI.selectScreen = document.getElementById('select-screen');
    gameUI.gameScreen = document.getElementById('game-screen');
    gameUI._initParticles();
    gameUI._floatingTextLanes = { player: [], ai: [], ai2: [] };
    gameUI.anim = new AnimLayer();

    gameUI._showGameOver = function () {
      if (completing || !battleEngine) return;
      completing = true;
      const finalState = this.state;
      const playerWon = !!(finalState.player && finalState.player.alive);
      const persistentState = battleEngine.finishAdventureBattle();
      const advEng = battleEngine._adventureEngine;
      if (this._pollInterval) {
        clearInterval(this._pollInterval);
        this._pollInterval = null;
      }
      document.querySelectorAll('.dialog-overlay').forEach(node => node.remove());

      if (battleEngine.testMode) {
        setTimeout(() => leaveTestBattle(finalState, persistentState, playerWon), 420);
        return;
      }

      if (advEng) {
        advEng.applyBattleResult(persistentState);
        advEng.onCombatEnd(playerWon ? 'win' : 'lose');
        showAdventureSettlement(advEng, finalState, persistentState, playerWon);
        return;
      }

      setTimeout(() => {
        leaveBattleToMap(finalState, persistentState, playerWon);
      }, 420);
    };

    return gameUI;
  }

  async function startCombat(playerName, monsterName, callback, initialState = {}) {
    if (!window.AdventureBattleEngine) throw new Error('冒险战斗适配器未加载');
    abandonRequested = false;
    onComplete = callback;
    completing = false;

    const adventureContainer = document.getElementById('adventure-container');
    prevDisplay = adventureContainer.style.display;
    adventureContainer.style.display = 'none';
    document.getElementById('game-container').style.display = '';

    const ui = ensureGameUI();
    battleEngine = new window.AdventureBattleEngine();
    instrumentBattlePersistence(battleEngine);
    if (initialState.adventureEngine) battleEngine._adventureEngine = initialState.adventureEngine;
    if (initialState.adventureCurrency) battleEngine.adventureCurrency = initialState.adventureCurrency;
    window.furryBattle = localApi(battleEngine);
    if (window.Bridge) Bridge._mode = 'local';

    let result;
    try {
      result = initialState.resumeBattle
        ? battleEngine.restoreSession(initialState.resumeBattle, initialState.adventureEngine)
        : battleEngine.startAdventure({
          player: playerName,
          opponent: monsterName,
          stage: initialState.stage || 1,
          scene: initialState.scene || null,
          testMode: !!initialState.testMode,
          playerState: initialState.playerState || initialState,
          playerPile: initialState.playerPile || null,
          discardTop: initialState.discardTop || null,
          discardTopOwner: initialState.discardTopOwner || null
        });
    } catch (error) {
      restoreNormalBattleApi();
      battleEngine = null;
      document.getElementById('game-container').style.display = 'none';
      adventureContainer.style.display = prevDisplay;
      onComplete = null;
      throw error;
    }

    ui.state = result;
    ui._prevState = null;
    ui._lastAnimatedAIDefenseKey = null;
    ui._animatedPlayerDraws = 0;
    ui.gameScreen.classList.add('active');
    ui._buildGameScreen();

    const menuBtn = document.getElementById('menu-btn');
    if (menuBtn) menuBtn.style.display = 'none';

    battleEngine.s.revealAIHand = true;
    ui.state = battleEngine.state();
    saveCombatSession(battleEngine);
    ui.updateDisplay();
    if (typeof ui._playOpeningEvents === 'function') await ui._playOpeningEvents();
    ui._startPolling();
    return result;
  }

  async function startCombat1v2(playerName, monsterName1, monsterName2, callback, initialState = {}) {
    if (!window.AdventureBattleEngine) throw new Error('冒险战斗适配器未加载');
    abandonRequested = false;
    onComplete = callback;
    completing = false;

    const adventureContainer = document.getElementById('adventure-container');
    prevDisplay = adventureContainer.style.display;
    adventureContainer.style.display = 'none';
    document.getElementById('game-container').style.display = '';

    const ui = ensureGameUI();
    battleEngine = new window.AdventureBattleEngine();
    instrumentBattlePersistence(battleEngine);
    if (initialState.adventureEngine) battleEngine._adventureEngine = initialState.adventureEngine;
    if (initialState.adventureCurrency) battleEngine.adventureCurrency = initialState.adventureCurrency;
    window.furryBattle = localApi(battleEngine);
    if (window.Bridge) Bridge._mode = 'local';

    let result;
    try {
      result = initialState.resumeBattle
        ? battleEngine.restoreSession(initialState.resumeBattle, initialState.adventureEngine)
        : battleEngine.startAdventure1v2({
          player: playerName,
          opponent1: monsterName1,
          opponent2: monsterName2,
          stage: initialState.stage || 1,
          scene: initialState.scene || null,
          testMode: !!initialState.testMode,
          playerState: initialState.playerState || initialState,
          playerPile: initialState.playerPile || null,
          discardTop: initialState.discardTop || null,
          discardTopOwner: initialState.discardTopOwner || null
        });
    } catch (error) {
      restoreNormalBattleApi();
      battleEngine = null;
      document.getElementById('game-container').style.display = 'none';
      adventureContainer.style.display = prevDisplay;
      onComplete = null;
      throw error;
    }

    ui.state = result;
    ui._prevState = null;
    ui._lastAnimatedAIDefenseKey = null;
    ui._animatedPlayerDraws = 0;
    ui._is1v2 = true;
    ui.gameScreen.classList.add('active');
    ui._buildGameScreen1v2();

    const menuBtn = document.getElementById('menu-btn');
    if (menuBtn) menuBtn.style.display = 'none';

    battleEngine.s.revealAIHand = true;
    ui.state = battleEngine.state();
    saveCombatSession(battleEngine);
    ui.updateDisplay();
    if (typeof ui._playOpeningEvents === 'function') await ui._playOpeningEvents();
    ui._startPolling();
    return result;
  }

  function syncPlayerState() {
    if (!battleEngine || !battleEngine.s) return null;
    return battleEngine.finishAdventureBattle();
  }

  if (typeof window.addEventListener === 'function') {
    window.addEventListener('pagehide', () => saveCombatSession(battleEngine));
  }

  window.AdventureCombatBridge = {
    startCombat,
    startCombat1v2,
    syncPlayerState,
    isAvailable() {
      return !!window.GameUI && !!window.Bridge && !!window.AdventureBattleEngine;
    },
    activeEngine() { return battleEngine; },
    loadCombatSession,
    clearCombatSession,
    abandonAdventure
  };
})();

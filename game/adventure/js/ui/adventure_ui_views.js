/** Adventure map-page composition.
 *
 * AdventureUI owns state and actions; focused map/panel modules provide the
 * render methods. This module only composes pages from the projected snapshot.
 */
(function (global) {
  const AdventureUIViews = {
    render(ui, snap) {
      if (!ui || !snap) return;
      const Phase = global.AdventurePhase;
      const combatPhases = ['ADVENTURE_PLAYER_PLAY', 'ADVENTURE_PLAYER_DEFEND', 'ADVENTURE_NPC_TURN'];
      // Keep decoded image nodes alive until the new page has been composed.

      if (snap.phase === Phase.GAME_OVER) {
        global.location.href = '../index.html';
        return;
      }
      if (snap.combat && combatPhases.includes(snap.phase)) {
        if (!ui._bridgeCombatStarting && !ui._bridgeCombatActive) {
          ui._showCombatLaunchError('1v1 战斗界面未启动，请重新进入房间');
        }
        return;
      }

      const wrap = document.createElement('div');
      wrap.className = 'adventure-wrap';
      wrap.appendChild(ui._buildHeader(snap));
      if (snap.phase === Phase.SHOP) {
        wrap.appendChild(ui._buildShopPage(snap));
      } else if (snap.phase === Phase.BLACKSMITH) {
        wrap.appendChild(ui._buildBlacksmithPage(snap));
      } else if (snap.phase === Phase.REWARD && snap.roomInfo && snap.roomInfo.type === global.RoomType.BOSS && snap.roomInfo.cleared) {
        wrap.appendChild(ui._buildBossRewardPage(snap));
      } else if (snap.phase === Phase.REWARD && snap.pendingRoomReward) {
        wrap.appendChild(ui._buildRewardPage(snap));
      } else if (snap.phase === Phase.BEAST_DISCARD) {
        wrap.appendChild(ui._buildBeastDiscardPage(snap));
      } else if (snap.phase === Phase.ITEM_DISCARD) {
        wrap.appendChild(ui._buildItemDiscardPage(snap));
      } else {
        const mapPanel = document.createElement('div');
        mapPanel.className = 'adv-map-panel';
        mapPanel.appendChild(ui._buildMap(snap));
        if (snap.phase === Phase.MAP) mapPanel.appendChild(ui._buildTipsBanner());
        wrap.appendChild(mapPanel);
      }
      wrap.appendChild(ui._buildSidebar(snap));
      wrap.appendChild(ui._buildLog(snap.logEntries));
      const dom=global.FurryGame&&global.FurryGame.RenderDOM;
      if (dom && [Phase.SHOP, Phase.BLACKSMITH].includes(snap.phase)) {
        dom.patchTree(ui.container, [wrap]);
      } else {
        if(dom)dom.preserveImages(ui.container,wrap);
        ui.container.replaceChildren(wrap);
      }
      if (snap.phase === Phase.MAP && ui._pendingMapHeals && ui._pendingMapHeals.length) {
        const runtime = global.FurryGame && global.FurryGame.CombatRuntime;
        const playHeals = () => ui._playPendingMapHeals();
        if (runtime) runtime.schedule(null, playHeals, 60);
        else global.setTimeout(playHeals, 60);
      }
      if (snap.phase === Phase.MAP && ui._pendingMapReturnEffect) {
        const effect = ui._pendingMapReturnEffect;
        ui._pendingMapReturnEffect = null;
        const runtime = global.FurryGame && global.FurryGame.CombatRuntime;
        const play = () => ui._animateMapReturnEffects(effect);
        if (runtime) runtime.schedule(null, play, 30);
        else global.setTimeout(play, 30);
      }
    }
  };

  global.AdventureUIViews = Object.freeze(AdventureUIViews);
})(window);

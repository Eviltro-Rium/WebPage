(function (global) {
    const ROOM_ICON_DIR = '../icons/adventure_ui_icons/';
  const ROOM_STYLE = {
    empty:  { label: '', cls: 'room-empty', glyph: '', icon: null },
    start:  { label: '起点', cls: 'room-start', glyph: '', icon: ROOM_ICON_DIR + 'starting_room.webp' },
    normal: { label: '普通', cls: 'room-normal', glyph: '', icon: ROOM_ICON_DIR + 'common_room.webp' },
    boss:   { label: 'Boss', cls: 'room-boss', glyph: '', icon: ROOM_ICON_DIR + 'boss_room.webp' },
    item:   { label: '奖励', cls: 'room-item', glyph: '', icon: ROOM_ICON_DIR + 'bonus_room.webp' },
    shop:   { label: '商店', cls: 'room-shop', glyph: '', icon: ROOM_ICON_DIR + 'shopping_room.webp' },
    blacksmith: { label: '铁匠铺', cls: 'room-blacksmith', glyph: '', icon: ROOM_ICON_DIR + 'smith_room.webp' },
    challenge: { label: '挑战', cls: 'room-challenge', glyph: '', icon: ROOM_ICON_DIR + 'challenge_room.webp' }
  };

  class AdventureUIMapViewMethods {
    _buildHeader(snap) {
      const h = document.createElement('div');
      h.className = 'adventure-header';
      const sceneLabel = { castle: '城堡', desert: '沙漠', forest: '森林', ocean: '冻洋', volcano: '火山' }[snap.scene] || '未知';
      const stageLabel = '第' + ['一', '二', '三', '四'][((snap.stage || 1) - 1) % 4] + '层';
      h.innerHTML =
        '<div class="adv-title">地牢冒险 · ' + sceneLabel + ' · ' + stageLabel + '</div>' +
        '<div class="adv-phase">阶段：<span class="adv-phase-tag">' + (snap.phaseLabel || snap.phase) + '</span></div>';
      return h;
    }
    _buildMap(snap) {
      const model = snap && snap.mapViewModel;
      const board = document.createElement('div');
      board.className = 'adventure-board';
      if (!model) return board;
      board.style.gridTemplateColumns = 'repeat(' + model.cols + ', 1fr)';
    
      for (const cellModel of model.cells) {
        const cell = document.createElement('button');
        const style = ROOM_STYLE[cellModel.type] || ROOM_STYLE.empty;
        cell.className = 'adv-cell ' + style.cls;
        if (style.icon) {
          let html = '<img class="adv-room-icon" src="' + style.icon + '" alt="' + style.label + '">';
          if (cellModel.doorLocked && cellModel.doorCost && cellModel.doorCost.length) {
            html += '<div class="adv-door-cost" title="开门需要：' + cellModel.doorCost.map(item => item.label).join(' + ') + '">';
            cellModel.doorCost.forEach(item => {
              html += '<img class="adv-door-cost-icon" src="' + item.icon + '" alt="' + item.label + '">';
            });
            html += '</div>';
            cell.classList.add('has-door-cost');
          } else if (cellModel.doorLocked && cellModel.entryGold > 0) {
            const goldIcon = (global.AdventureCurrency && global.AdventureCurrency.GOLD_ICON) ||
              '../icons/adventure_ui_icons/coin.webp';
            html += '<div class="adv-door-cost" title="进入需要：' + cellModel.entryGold + '金币">';
            for (let i = 0; i < cellModel.entryGold; i++) {
              html += '<img class="adv-door-cost-icon" src="' + goldIcon + '" alt="金币">';
            }
            html += '</div>';
            cell.classList.add('has-door-cost');
          } else if (cellModel.doorUnlocked) {
            cell.classList.add('door-unlocked');
          }
          cell.innerHTML = html;
        } else {
          cell.textContent = style.glyph;
        }
        if (cellModel.lootIcon) {
          cell.insertAdjacentHTML('beforeend', '<img class="adv-cell-loot-icon" src="' + cellModel.lootIcon + '" alt="待领奖励">');
        }
        if (cellModel.visited) cell.classList.add('visited');
        if (cellModel.cleared) cell.classList.add('cleared');
        if (cellModel.rewardClaimed) cell.classList.add('reward-claimed');
        if (cellModel.hasLoot) cell.classList.add('has-loot');
        if (cellModel.current) cell.classList.add('current');
        if (cellModel.reachable) cell.classList.add('reachable');
        cell.title = cellModel.title;
        cell.dataset.mapCell = '1';
        cell.dataset.r = String(cellModel.r);
        cell.dataset.c = String(cellModel.c);
        board.appendChild(cell);
      }
      return board;
    }
    _syncMapCells(board, model) {
      if (!board || !model) return false;
      const byKey = new Map();
      model.cells.forEach(cell => byKey.set(cell.r + ',' + cell.c, cell));
      const nodes = board.querySelectorAll('.adv-cell[data-r][data-c]');
      if (!nodes.length || nodes.length !== model.cells.length) return false;
      nodes.forEach(cell => {
        const key = cell.dataset.r + ',' + cell.dataset.c;
        const cellModel = byKey.get(key);
        if (!cellModel) return;
        cell.classList.toggle('visited', !!cellModel.visited);
        cell.classList.toggle('cleared', !!cellModel.cleared);
        cell.classList.toggle('reward-claimed', !!cellModel.rewardClaimed);
        cell.classList.toggle('has-loot', !!cellModel.hasLoot);
        cell.classList.toggle('current', !!cellModel.current);
        cell.classList.toggle('reachable', !!cellModel.reachable);
        cell.classList.toggle('has-door-cost', !!(
          cellModel.doorLocked &&
          ((cellModel.doorCost && cellModel.doorCost.length) || (cellModel.entryGold > 0))
        ));
        cell.classList.toggle('door-unlocked', !!cellModel.doorUnlocked);
        cell.title = cellModel.title || '';
      });
      return true;
    }
  }

  if (!global.AdventureUI) throw new Error('adventure_ui_map_view.js requires AdventureUI');
  Object.getOwnPropertyNames(AdventureUIMapViewMethods.prototype)
    .filter(name => name !== 'constructor')
    .forEach(name => Object.defineProperty(global.AdventureUI.prototype, name,
      Object.getOwnPropertyDescriptor(AdventureUIMapViewMethods.prototype, name)));
})(window);

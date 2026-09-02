/**
 * 冒险模式 UI AdventureUI
 * 渲染地牢地图网格、主角状态栏、房间交互、日志面板。
 * 遵循主游戏 UI 约定：DOM overlay 弹窗（非 alert/confirm）、紫色高亮、中文文案。
 */
(function () {
  const PHASE_LABEL = window.AdventurePhaseLabel || {};
  const T = window.RoomType;
  const AC = window.AdventureCurrency;
  const GAME_TIPS = [
    '房间清理完后不会自动补牌，也不会清除身上的 Buff。',
    '进入挑战房后有一次补牌机会。',
    '有些怪物会清除道具，请及时使用手上的道具。',
    '怪物手牌全是白卡，优先使用魔法牌，其次按点数从大到小出牌。',
    '战利品白卡是一种特殊白卡，打出后可以再抽一张牌。',
    '玩家牌库和怪物牌库相互独立，因此部分角色技能在冒险模式下会被修正。',
    '不要舍不得弃牌！否则你可能会一直无法释放技能！',
    '游戏中的主角都来自作者的现实生活。'
  ];

  const ROOM_ICON_DIR = '../icons/adventure_ui_icons/';
  const ROOM_STYLE = {
    empty:  { label: '',   cls: 'room-empty',  glyph: '', icon: null },
    start:  { label: '起点', cls: 'room-start',  glyph: '', icon: ROOM_ICON_DIR + 'starting_room.png' },
    normal: { label: '普通', cls: 'room-normal', glyph: '', icon: ROOM_ICON_DIR + 'common_room.png' },
    boss:   { label: 'Boss', cls: 'room-boss',   glyph: '', icon: ROOM_ICON_DIR + 'boss_room.png' },
    item:   { label: '奖励', cls: 'room-item',   glyph: '', icon: ROOM_ICON_DIR + 'bonus_room.png' },
    shop:   { label: '商店', cls: 'room-shop',   glyph: '', icon: ROOM_ICON_DIR + 'shopping_room.png' },
    blacksmith: { label: '铁匠铺', cls: 'room-blacksmith', glyph: '', icon: ROOM_ICON_DIR + 'smith_room.png' },
    challenge: { label: '挑战', cls: 'room-challenge', glyph: '', icon: ROOM_ICON_DIR + 'challenge_room.png' }
  };

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
      this._bindEngine();
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
      if (save && save.characterName === characterName) {
        try {
          await this.restoreFromSave(save);
          if (window.cardIconsReady) window.cardIconsReady.then(() => this.render());
          return true;
        } catch (e) {
          if (window.AdventureSave) window.AdventureSave.clear();
        }
      }
      await this.start(typeof defaultMapFn === 'function' ? defaultMapFn() : defaultMapFn, characterName);
      return false;
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

    render() {
      this._stopTipsRotation();
      const snap = this.eng.snapshot();
      if (!snap) return;

      this._updateBackground(snap.scene);

      if (window.AdventureSave && !this._test) {
        if (snap.phase === window.AdventurePhase.GAME_OVER) {
          window.AdventureSave.clear();
          this._lastSaveKey = null;
        } else if (window.AdventureSave.isSafePhase(snap.phase) && this.eng.mapName) {
          const k = snap.phase + '|' + (snap.pos ? snap.pos.r + ',' + snap.pos.c : '') + '|' + snap.player.hp + '|' + snap.currency.gold + '|' + (snap.playerPile ? snap.playerPile.deckCount + ',' + snap.playerPile.discardCount : '');
          if (k !== this._lastSaveKey) {
            this._lastSaveKey = k;
            window.AdventureSave.save(this.eng);
          }
        }
      }

      if (snap.phase === window.AdventurePhase.GAME_OVER) {
        window.location.href = '../index.html';
        return;
      }

      this.container.innerHTML = '';

      const combatPhases = ['ADVENTURE_PLAYER_PLAY', 'ADVENTURE_PLAYER_DEFEND', 'ADVENTURE_NPC_TURN'];
      if (snap.combat && combatPhases.includes(snap.phase)) {
        if (!this._bridgeCombatStarting && !this._bridgeCombatActive) {
          this._showCombatLaunchError('1v1 战斗界面未启动，请重新进入房间');
        }
        return;
      }

      const wrap = document.createElement('div');
      wrap.className = 'adventure-wrap';

      wrap.appendChild(this._buildHeader(snap));
      if (snap.phase === window.AdventurePhase.SHOP) {
        wrap.appendChild(this._buildShopPage(snap));
      } else if (snap.phase === window.AdventurePhase.BLACKSMITH) {
        wrap.appendChild(this._buildBlacksmithPage(snap));
      } else if (snap.phase === window.AdventurePhase.REWARD && snap.roomInfo && snap.roomInfo.type === window.RoomType.BOSS && snap.roomInfo.cleared) {
        wrap.appendChild(this._buildBossRewardPage(snap));
      } else if (snap.phase === window.AdventurePhase.REWARD && snap.pendingRoomReward) {
        wrap.appendChild(this._buildRewardPage(snap));
      } else if (snap.phase === window.AdventurePhase.BEAST_DISCARD) {
        wrap.appendChild(this._buildBeastDiscardPage(snap));
      } else if (snap.phase === window.AdventurePhase.ITEM_DISCARD) {
        wrap.appendChild(this._buildItemDiscardPage(snap));
      } else {
        const mapPanel = document.createElement('div');
        mapPanel.className = 'adv-map-panel';
        mapPanel.appendChild(this._buildMap(snap));
        if (snap.phase === window.AdventurePhase.MAP) mapPanel.appendChild(this._buildTipsBanner());
        wrap.appendChild(mapPanel);
      }
      wrap.appendChild(this._buildSidebar(snap));
      wrap.appendChild(this._buildLog());

      this.container.appendChild(wrap);
    }

    _buildTipsBanner() {
      const banner = document.createElement('section');
      banner.className = 'adv-tips-banner';
      banner.innerHTML = '<div class="adv-tips-label">游戏 Tips</div><div class="adv-tips-text"></div>';
      const text = banner.querySelector('.adv-tips-text');
      const showNext = () => {
        if (!GAME_TIPS.length || !text) return;
        let next = Math.floor(Math.random() * GAME_TIPS.length);
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
      const map = { castle: 'Castle', desert: 'Desert', forest: 'Forest', ocean: 'FrozenOcean', volcano: 'Volcano' };
      const name = map[scene] || 'Castle';
      if (this._currentBg === name) return;
      this._currentBg = name;
      bg.style.background = `url('../backgrounds/${name}.png') center/cover no-repeat`;
    }

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
      const map = this.eng.s.map;
      const board = document.createElement('div');
      board.className = 'adventure-board';
      board.style.gridTemplateColumns = 'repeat(' + map.cols + ', 1fr)';

      for (let r = 0; r < map.rows; r++) {
        for (let c = 0; c < map.cols; c++) {
          const room = map.get(r, c);
          const cell = document.createElement('button');
          const style = ROOM_STYLE[room.type] || ROOM_STYLE.empty;
          cell.className = 'adv-cell ' + style.cls;
          if (style.icon) {
            let html = '<img class="adv-room-icon" src="' + style.icon + '" alt="' + style.label + '">';
            if (room.type === T.ITEM && Array.isArray(room.doorCost) && room.doorCost.length && !room.doorUnlocked) {
              html += '<div class="adv-door-cost" title="开门需要：' +
                room.doorCost.map(k => AC.BEAST_LABEL[k] || k).join(' + ') + '">';
              room.doorCost.forEach(k => {
                html += '<img class="adv-door-cost-icon" src="' + (AC.BEAST_ICON[k] || '') + '" alt="' + (AC.BEAST_LABEL[k] || k) + '">';
              });
              html += '</div>';
              cell.classList.add('has-door-cost');
            } else if (room.type === T.ITEM && room.doorUnlocked) {
              cell.classList.add('door-unlocked');
            }
            cell.innerHTML = html;
          } else {
            cell.textContent = style.glyph;
          }

          if (room.stashedLoot && room.stashedLoot.kind !== 'none') {
            const lootIcon = this._stashedLootIconSrc(room.stashedLoot);
            if (lootIcon) {
              cell.insertAdjacentHTML('beforeend',
                '<img class="adv-cell-loot-icon" src="' + lootIcon + '" alt="待领奖励">');
            }
          }

          if (room.visited) cell.classList.add('visited');
          if (room.cleared) cell.classList.add('cleared');
          if (room.rewardClaimed) cell.classList.add('reward-claimed');
          if (room.stashedLoot) cell.classList.add('has-loot');
          if (this.eng.s.pos && this.eng.s.pos.r === r && this.eng.s.pos.c === c) cell.classList.add('current');
          if (this.eng.canMoveTo(r, c) && !room.visited) cell.classList.add('reachable');

          cell.title = '(' + (r + 1) + ',' + (c + 1) + ') ' + room.label() + '房间' +
            (room.stashedLoot ? '（有待领奖励）' : '') +
            (room.type === T.ITEM && !room.doorUnlocked && room.doorCost
              ? '（开门：' + room.doorCost.map(k => AC.BEAST_LABEL[k] || k).join('+') + '）'
              : room.type === T.ITEM && room.doorUnlocked ? '（已开门）' : '');
          cell.addEventListener('click', () => this._onCellClick(r, c));
          board.appendChild(cell);
        }
      }
      return board;
    }

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

    _buildSidebar(snap) {
      const side = document.createElement('div');
      side.className = 'adventure-sidebar';
      const p = snap.player;
      const hpPct = Math.round(100 * p.hp / p.maxHp);

      let html = '<div class="adv-player-row"><div class="adv-card">' +
        '<div class="adv-char-name">' + p.name + '<span class="adv-char-type">' + p.type + '</span></div>' +
        '<div class="adv-hp-bar"><div class="adv-hp-fill" style="width:' + hpPct + '%"></div><span class="adv-hp-text">' + p.hp + '/' + p.maxHp + '</span></div>' +
        this._buildBuffBar(snap) +
        '<div class="adv-currency"><img src="' + AC.GOLD_ICON + '" class="adv-gold-icon" alt="金币">金币：<b>' + snap.currency.gold + '</b></div>' +
        this._buildBeastTokenDisplay(snap) +
        this._buildItemPanel(snap) +
        this._buildTrophyBackpack(snap);

      if (snap.playerPile) {
        html += '<div class="adv-deck-info">牌库' + snap.playerPile.deckCount + ' | 弃牌' + snap.playerPile.discardCount + '</div>';
        html += '<div class="adv-hand-zone" id="adv-hand-zone"></div>';
      }
      html += '</div>';

      html += this._buildAccessoryColumn(snap);
      html += '</div>';

      if (snap.roomInfo) {
        const ri = snap.roomInfo;
        let roomStatus = '';
        if (ri.cleared) roomStatus += '已清除 ';
        if (ri.stashedLoot) roomStatus += '有待领奖励 ';
        else if (ri.rewardClaimed && ri.type !== T.ITEM) roomStatus += '奖励已领 ';
        if (ri.beastTokenClaimed) roomStatus += '兽元已领';
        if (roomStatus) html += '<div class="adv-room-status">' + roomStatus + '</div>';
        if (ri.stashedLoot && snap.phase === window.AdventurePhase.REWARD && !snap.pendingRoomReward) {
          html += '<div class="adv-stashed-loot">待领：' + this._stashedLootLabel(ri.stashedLoot) + '</div>';
        }
      }


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
        paintHand();
        if (window.cardIconsReady) {
          window.cardIconsReady.then(() => {
            if (side.isConnected && side.querySelector('#adv-hand-zone') === handZone) paintHand();
          });
        }
      }

      return side;
    }

    _buildBuffBar(snap) {
      const b = snap.player.buffs;
      if (!b) return '';
      const items = [];
      if (b.burn > 0)      items.push('<span class="adv-buff adv-buff-burn" title="灼烧">灼烧×' + b.burn + '</span>');
      if (b.bleed > 0)     items.push('<span class="adv-buff adv-buff-bleed" title="流血">流血×' + b.bleed + '</span>');
      if (b.poison > 0)    items.push('<span class="adv-buff adv-buff-poison" title="中毒">中毒×' + b.poison + '</span>');
      if (b.frozen)        items.push('<span class="adv-buff adv-buff-frozen" title="冷冻">冷冻</span>');
      if (b.guard > 0)     items.push('<span class="adv-buff adv-buff-guard" title="守护">守护×' + b.guard + '</span>');
      if (b.fly > 0)       items.push('<span class="adv-buff adv-buff-fly" title="飞翔">飞翔×' + b.fly + '</span>');
      if (b.crit > 0)      items.push('<span class="adv-buff adv-buff-crit" title="暴击">暴击×' + b.crit + '</span>');
      if (b.chaos_red)     items.push('<span class="adv-buff adv-buff-chaos-red" title="混沌·红">混沌红</span>');
      if (b.chaos_yellow)  items.push('<span class="adv-buff adv-buff-chaos-yellow" title="混沌·黄">混沌黄</span>');
      if (b.chaos_blue)    items.push('<span class="adv-buff adv-buff-chaos-blue" title="混沌·蓝">混沌蓝</span>');
      if (b.chaos_green)   items.push('<span class="adv-buff adv-buff-chaos-green" title="混沌·绿">混沌绿</span>');
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

    _buildAccessoryColumn(snap) {
      const accessories = snap.accessories || [];
      if (!accessories.length) return '';
      const icons = accessories.map(item => {
        const tip = item.displayName + ' — ' + item.description;
        const icon = item.icon
          ? '<img class="adv-acc-col-icon" src="' + item.icon + '" alt="' + item.displayName + '">'
          : '<span class="adv-acc-col-noicon">' + (item.displayName || '?').charAt(0) + '</span>';
        return '<div class="adv-acc-col-slot" title="' + tip + '">' + icon + '</div>';
      });
      return '<div class="adv-acc-card">' +
        '<div class="adv-acc-card-title">配饰</div>' +
        '<div class="adv-acc-column">' + icons.join('') + '</div>' +
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
        if (item && item.kind === 'trophyWhite') slotCls += ' adv-shop-slot-trophy';
        if (item) {
          const price = item.price || 0;
          const tag = isBeastSlot ? '兽元' : (isAccessorySlot ? '配饰' : '');
          const icon = item.kind === 'trophyWhite'
            ? this._trophyCardMarkup(item.name, 54, 78)
            : (item.icon ? '<img class="adv-shop-slot-icon" src="' + item.icon + '" alt="">' : '');
          slotsHtml += '<button type="button" class="adv-shop-slot filled' + slotCls + (isSel ? ' selected' : '') + '" data-shop-slot="' + i + '" title="' + (item.description || '') + '">' +
            (tag ? '<div class="adv-shop-slot-tag">' + tag + '</div>' : '') +
            icon +
            '<div class="adv-shop-slot-name">' + item.displayName + '</div>' +
            '<div class="adv-shop-slot-desc">' + (item.description || '') + '</div>' +
            '<div class="adv-shop-slot-price">' + price + ' 金币</div>' +
            '</button>';
        } else {
          const tag = isBeastSlot ? '兽元' : (isAccessorySlot ? '配饰' : '');
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
        '<div class="adv-shop-page-gold"><img src="' + AC.GOLD_ICON + '" class="adv-gold-icon" alt="">持有金币：<b>' + gold + '</b></div>' +
        '<div class="adv-shop-slots">' + slotsHtml + '</div>' +
        '<div class="adv-shop-page-hint">前3槽道具、第6槽配饰（刷新2金币，配饰15金币），第4–5槽兽元（普通2/万能4，不可刷新）。铁匠铺仍可用兽元兑换配饰。</div>' +
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
      const canPayTrade = canTrade && this.eng.s.currency.canPayBeastCost((slots[selected] && slots[selected].beastCost) || []);
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
        for (let i = 0; i < accessories.length; i++) {
          const acc = accessories[i];
          recycleHtml += '<button type="button" class="adv-recycle-slot" data-recycle-index="' + i + '" title="' + (acc.description || '') + '">' +
            (acc.icon ? '<img class="adv-shop-slot-icon" src="' + acc.icon + '" alt="">' : '') +
            '<div class="adv-shop-slot-name">' + acc.displayName + '</div>' +
            '<div class="adv-recycle-price">+10金币</div>' +
            '</button>';
        }
        recycleHtml += '</div>';
      } else {
        recycleHtml += '<div class="adv-recycle-empty">无可回收配饰</div>';
      }
      recycleHtml += '</div>';

      page.innerHTML =
        '<div class="adv-shop-page-title">铁匠铺</div>' +
        '<div class="adv-shop-page-gold"><img src="' + AC.GOLD_ICON + '" class="adv-gold-icon" alt="">金币：<b>' + gold + '</b></div>' +
        '<div class="adv-blacksmith-tokens">兽元：' + beastSummary + ' <span class="adv-bs-hint">（万能可替代）</span></div>' +
        '<div class="adv-shop-slots adv-blacksmith-slots">' + slotsHtml + '</div>' +
        '<div class="adv-blacksmith-trophy-stall"><div class="adv-blacksmith-stall-title">战利白卡摊位</div>' + trophyHtml + '<div class="adv-shop-page-actions"><button class="adv-btn adv-btn-primary" id="adv-blacksmith-trophy-buy"' + (trophy && this.eng.s.currency.canPayBeastCost(trophy.beastCost || []) ? '' : ' disabled') + '>锻造</button><button class="adv-btn" id="adv-blacksmith-trophy-refresh"' + (gold >= refreshCost ? '' : ' disabled') + '>刷新 · 2金币</button></div></div>' +
        '<div class="adv-shop-page-hint">3个配饰槽，用兽元兑换；另设战利白卡摊位（灼伤2火、刺伤2本、冰冻2水、守护1本1草）。所有战利白卡商店售价均为5金币。每槽可花2金币刷新（含空槽）。智慧项链3水1本1草，火焰之拳4火1本，兽元袋3本2草，生命核心3草1水1本，冷冻激光3水1万能，能量盾3草2本，正义之锤2火2水1本，净化水晶2草2水1本，恶魔契约1火1水1草1万能。</div>' +
        recycleHtml +
        '<div class="adv-shop-page-actions">' +
          '<button class="adv-btn adv-btn-primary" id="adv-blacksmith-trade"' + (canPayTrade ? '' : ' disabled') + '>兑换</button>' +
          '<button class="adv-btn" id="adv-blacksmith-refresh"' + (canRefresh && gold >= refreshCost ? '' : ' disabled') + '>刷新 · ' + refreshCost + '金币</button>' +
          '<button class="adv-btn" id="adv-leave-blacksmith">离开铁匠铺</button>' +
        '</div>';
      this._mountTrophyCards(page);
      return page;
    }

    _isCombatPhase(phase) {
      const Phase = window.AdventurePhase;
      return phase === Phase.COMBAT || phase === Phase.PLAYER_PLAY ||
        phase === Phase.PLAYER_DEFEND || phase === Phase.NPC_TURN;
    }


    _buildActions(snap) {
      const Phase = window.AdventurePhase;
      const T = window.RoomType;
      let btns = '';

      if (snap.phase === Phase.MAP) {
        const ri = snap.roomInfo;
        const needItemDoor = ri && ri.type === T.ITEM && !ri.doorUnlocked;
        const needBlacksmithDoor = ri && ri.type === T.BLACKSMITH && !ri.doorUnlocked && (ri.entryGold || 0) > 0;
        btns += '<button class="adv-btn adv-btn-primary" id="adv-enter">' +
          (needItemDoor ? '开启房门' : needBlacksmithDoor ? ('支付' + ri.entryGold + '金币进入') : '进入房间') + '</button>';
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

    _buildLog() {
      const box = document.createElement('div');
      box.className = 'adventure-log';
      box.id = 'adventure-log-box';
      if (!this.logVisible) box.style.display = 'none';
      box.innerHTML = '<div class="adv-log-title">日志</div><div class="adv-log-list" id="adv-log-list"></div>';
      const list = box.querySelector('#adv-log-list');
      (this.eng.s.log || []).slice(-12).forEach(entry => {
        const line = document.createElement('div');
        line.className = 'adv-log-line';
        line.textContent = entry.msg;
        list.appendChild(line);
      });
      list.scrollTop = list.scrollHeight;
      return box;
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

    _onCellClick(r, c) {
      if (this.eng.canMoveTo(r, c)) {
        this.eng.move(r, c);
        this.render();
        return;
      }
      const room = this.eng.s.map.get(r, c);
      if (room && room.type !== T.EMPTY) {
        this._toast('(' + (r + 1) + ',' + (c + 1) + ') ' + room.label() + '房间' + (room.cleared ? '（已清除）' : room.visited ? '（已访问）' : ''));
      }
    }

    bindActions() {
      this.container.addEventListener('click', (e) => {
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
        const testItemBtn = e.target.closest('[data-test-item]');
        const testTrophyBtn = e.target.closest('[data-test-trophy]');
        const testAccessoryBtn = e.target.closest('[data-test-accessory]');
        const testModeBtn = e.target.closest('[data-test-mode]');
        const testOpponentBtn = e.target.closest('[data-test-opponent]');
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
          const result = this.eng.buyBlacksmithSlot(sel);
          if (!result.ok) {
            if (result.reason === 'accessoryFull') this._showAlertDialog('无法拾取', result.message || '配饰已达上限');
            else this._toast(result.message || '兑换失败');
          }
          this.render();
        }
        else if (id === 'adv-blacksmith-refresh') {
          const sel = this.eng.s.blacksmithSelectedSlot;
          if (sel == null) { this._toast('请先选择槽位'); return; }
          const result = this.eng.refreshBlacksmithSlot(sel);
          if (!result.ok) this._toast(result.message || '刷新失败');
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
        else if (e.target.closest('[data-blacksmith-trophy]')) {
          this.eng.s.blacksmithSelectedSlot = 'trophy';
          this.render();
        }
        else if (id === 'adv-blacksmith-trophy-buy') {
          const result = this.eng.buyBlacksmithTrophy();
          if (!result.ok) this._toast(result.message || '锻造失败');
          this.render();
        }
        else if (id === 'adv-blacksmith-trophy-refresh') {
          const result = this.eng.refreshBlacksmithTrophy();
          if (!result.ok) this._toast(result.message || '刷新失败');
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
          if (def && def.combatUse === 'purify') {
            const player = this.eng.s.player;
            const hasBuff = (player.burn || 0) > 0 || (player.bleed || 0) > 0 ||
              (player.poison || 0) > 0 || (player.bomb || 0) > 0 || player.frozen || (player.guard || 0) > 0 ||
              (player.fly || 0) > 0 || (player.crit || 0) > 0;
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
      const result = this.eng.enterCurrent();
      if (result && result.ok === false) {
        this._toast(result.message || '无法进入');
        this.render();
        return;
      }
      const combatPhases = ['ADVENTURE_PLAYER_PLAY', 'ADVENTURE_PLAYER_DEFEND', 'ADVENTURE_NPC_TURN'];
      if (combatPhases.includes(this.eng.s.phase)) {
        if (!window.AdventureCombatBridge || !window.AdventureCombatBridge.isAvailable()) {
          this._showCombatLaunchError('1v1 战斗模块加载失败，请刷新页面后重试');
          return;
        }
        void this._startBridgeCombat();
        return;
      }
      this.render();
    }

    async _startBridgeCombat() {
      if (this._bridgeCombatStarting || this._bridgeCombatActive) return;
      const snap = this.eng.snapshot();
      if (!snap || !snap.combat) {
        this._showCombatLaunchError('没有可启动的战斗数据');
        return;
      }
      this._bridgeCombatStarting = true;
      const playerName = snap.player.name;
      const monsterName = snap.combat.enemy;
      const is1v2 = !!snap.combat.is1v2 && !!snap.combat.enemy2;
      const monsterName2 = is1v2 ? snap.combat.enemy2 : null;
      const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));
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
        adventureEngine: this.eng
      };

      try {
        if (is1v2) {
          await window.AdventureCombatBridge.startCombat1v2(
            playerName, monsterName, monsterName2,
            (result, state, persistentState, meta) => this._onBridgeCombatEnd(result, state, persistentState, meta),
            initialState
          );
        } else {
          await window.AdventureCombatBridge.startCombat(
            playerName, monsterName,
            (result, state, persistentState, meta) => this._onBridgeCombatEnd(result, state, persistentState, meta),
            initialState
          );
        }
        this._bridgeCombatActive = true;
      } catch (e) {
        this._showCombatLaunchError('战斗启动失败：' + (e.message || e));
      } finally {
        this._bridgeCombatStarting = false;
      }
    }

    _onBridgeCombatEnd(result, state, persistentState, meta) {
      this._bridgeCombatActive = false;
      const gc = document.getElementById('game-container');
      if (gc) gc.style.display = 'none';
      const gs = document.getElementById('game-screen');
      if (gs) gs.classList.remove('active');
      if (result === 'lose' || this.eng.s.phase === window.AdventurePhase.GAME_OVER) {
        window.location.href = '../index.html';
        return;
      }
      if (!meta || !meta.settled) {
        if (persistentState) this.eng.applyBattleResult(persistentState);
        else if (state && state.player) this.eng.s.player.hp = Math.max(0, state.player.hp);
        this.eng.onCombatEnd(result);
      }
      this.render();
    }

    startTest(characterName) {
      this._test = { characterName, items: [], trophyWhiteCards: [], accessories: [], mode: null, opponents: [], running: false, result: null };
      const bg = document.getElementById('castle-bg');
      if (bg) bg.style.display = 'block';
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
      if (!window.AdventureCombatBridge || !window.AdventureCombatBridge.isAvailable()) {
        this._showCombatLaunchError('战斗模块加载失败，请刷新页面后重试');
        return;
      }
      const mode = this._test.mode;
      const opponents = this._test.opponents.slice();
      const map = window.AdventureMap.fromGrid([[0, 1, 2]]);
      this.eng.start(map, this._test.characterName, { consumables: this._test.items, trophyWhiteCards: this._test.trophyWhiteCards, accessories: this._test.accessories, stage: 1, scene: 'castle' });
      const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));
      const initialState = {
        playerState: clone(this.eng.s.player),
        playerPile: { deck: clone(this.eng.s.playerPile.deck), hand: clone(this.eng.s.playerPile.hand), discard: clone(this.eng.s.playerPile.discard), handLimit: this.eng.s.playerPile.handLimit },
        discardTop: this.eng.s.discardTop ? clone(this.eng.s.discardTop.get()) : null,
        discardTopOwner: this.eng.s.discardTopOwner || null,
        adventureCurrency: this.eng.s.currency,
        adventureEngine: this.eng,
        stage: 1,
        scene: 'castle',
        testMode: true
      };
      this._test.running = true;
      this._bridgeCombatStarting = true;
      const done = (result, state, persistentState, meta) => this._onTestBattleEnd(result, state, persistentState, meta);
      const promise = mode === '1v2'
        ? window.AdventureCombatBridge.startCombat1v2(this._test.characterName, opponents[0], opponents[1], done, initialState)
        : window.AdventureCombatBridge.startCombat(this._test.characterName, opponents[0], done, initialState);
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
      const label = this._test.mode === 'boss' ? 'Boss 测试' : (this._test.mode === '1v2' ? '1v2 挑战测试' : '1v1 普通测试');
      this.container.innerHTML = '<div class="adv-test-shell adv-test-result"><div class="adv-test-kicker">TEST COMPLETE</div><div class="adv-test-result-mark ' + (won ? 'win' : 'lose') + '">' + (won ? '✓' : '×') + '</div><h2>' + (won ? '测试完成' : '测试结束') + '</h2><p>' + label + (won ? '：已击败所有对手。' : '：本次未能击败对手。') + '</p><p class="adv-test-muted">测试不会发放奖励，也不会改变正式冒险进度。</p><div class="adv-test-actions"><button type="button" class="adv-btn adv-btn-primary" id="adv-test-again">再次测试</button><button type="button" class="adv-btn" id="adv-test-home">返回主页</button></div></div>';
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
      const scenes = ['castle', 'forest'];
      let stage = this.eng.s.stage || 1;
      let scene = this.eng.s.scene || 'castle';
      stage++;
      if (stage > 4) { stage = 1; scene = scenes[Math.floor(Math.random() * scenes.length)]; }
      const variant = 1 + Math.floor(Math.random() * 3);
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
        this.render();
      } catch (e) {
        this._toast('加载下一层失败：' + (e.message || e));
      }
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
      page.querySelectorAll('[data-beast-discard]').forEach(btn => {
        btn.addEventListener('click', () => {
          this.eng.discardBeastToken(btn.getAttribute('data-beast-discard'));
          this.render();
        });
      });
      return page;
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
      setTimeout(() => t.remove(), 1500);
    }
  }

  window.AdventureUI = AdventureUI;
})();

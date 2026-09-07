/* Adventure legacy map-combat helpers — mixed into AdventureEngine.prototype */
(function () {
  if (typeof AdventureEngine === 'undefined') return;
  const Phase = window.AdventurePhase || {};
  const C = window.AdventureEngineConstants || {};
  const SHOP_SLOT_COUNT = C.SHOP_SLOT_COUNT || 6;
  const SHOP_REFRESH_COST = C.SHOP_REFRESH_COST || 2;
  const SHOP_ACCESSORY_PRICE = C.SHOP_ACCESSORY_PRICE || 15;
  const CONSUMABLE_SLOT_COUNT = C.CONSUMABLE_SLOT_COUNT || 6;
  const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));
  Object.assign(AdventureEngine.prototype, {

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
    },
    playerSelectCard(index) {
      if (this.s.phase !== Phase.PLAYER_PLAY && this.s.phase !== Phase.PLAYER_DEFEND) return false;
      if (index < 0 || index >= this.s.playerPile.hand.length) return false;
      this.s.combat.selectedCard = index;
      return true;
    },
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
    },
    _calcPlayerDamage(card) {
      if (!card || !card.isNumberCard) return 0;
      let dmg = card.value;
      if (this.s.player.crit > 0) {
        dmg = Math.ceil(dmg * 1.5);
        this.s.player.crit--;
        this._log('暴击！伤害×1.5=' + dmg);
      }
      return dmg;
    },
    playerEndTurn() {
      if (this.s.phase !== Phase.PLAYER_PLAY) return { error: '不是你的回合' };
      this.s.combat.selectedCard = null;
      this._log('你结束了回合');
      this.emit('playerEndTurn', '结束回合', null);
      this._startNpcTurn();
      return { ok: true };
    },
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
          this.emit('heal', '+' + (enemy.hp - before) + '[生命]', null, { who: 'enemy', amount: enemy.hp - before, kind: 'passive' });
        }
        if (typeof enemy.attackTurnStart === 'function') enemy.attackTurnStart(this, enemy, 'enemy');
      }
      combat.npcPile.drawToLimit();
      this._log('敌方回合开始');
      this.emit('npcTurnStart', '敌方回合', null);
      this._npcPlayNext();
    },
    _applyNpcAttackHooks(enemy, card) {
      if (!enemy || !card || card.isItemCard) return;
      const ownerLabel = enemy.name || '敌方';
      if (typeof enemy.attackLush === 'function') {
        const lush = Number(enemy.attackLush(card)) || 0;
        if (lush > 0) {
          enemy.lush = Math.min(2, (enemy.lush || 0) + lush);
          this.emit('buff', '+' + lush + '[茂盛]', null, { who: 'enemy', kind: 'lush', stacks: enemy.lush });
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
          this.emit('heal', '+' + (enemy.hp - before) + '[生命]', null, { who: 'enemy', amount: enemy.hp - before, kind: 'skill' });
          this._log(ownerLabel + '恢复' + (enemy.hp - before) + '点生命');
        }
      }
    },
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
      const unblockable = (typeof combat.enemy.attackUnblockable === 'function')
        ? combat.enemy.attackUnblockable(card)
        : false;

      this._log('敌方出白' + card.value + '牌，造成' + dmg + '点伤害' + (unblockable ? '（不可防御）' : ''));
      this.emit('npcPlay', '敌方攻击：' + dmg + '点伤害', card, { kind: 'attack', damage: dmg, unblockable });

      if (unblockable) {
        this._applyPlayerDamage(dmg);
        combat.atkCard = null;
        if (this._checkCombatEnd()) return;
        this._npcPlayNext();
        return;
      }

      combat.pendingDamage = dmg;
      this.s.phase = Phase.PLAYER_DEFEND;
      this.emit('playerDefend', '请防御' + dmg + '点伤害', null, { damage: dmg });
    },
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
      this.s.combat.defCard = null;
      this.s.combat.atkCard = null;
      this.s.combat.pendingDamage = 0;
      pile.drawToLimit();

      if (this._checkCombatEnd()) return { ok: true, combatEnd: true };
      this.s.phase = Phase.NPC_TURN;
      this._npcPlayNext();
      return { ok: true };
    },
    playerSkipDefend() {
      if (this.s.phase !== Phase.PLAYER_DEFEND) return { error: '不是防御阶段' };
      const dmg = this.s.combat.pendingDamage;
      this._log('你选择不防御，承受' + dmg + '点伤害');
      this.emit('playerDefend', '跳过防御', null, { kind: 'skip' });

      this._applyPlayerDamage(dmg);
      this.s.combat.atkCard = null;
      this.s.combat.pendingDamage = 0;
      this.s.playerPile.drawToLimit();

      if (this._checkCombatEnd()) return { ok: true, combatEnd: true };
      this.s.phase = Phase.NPC_TURN;
      this._npcPlayNext();
      return { ok: true };
    },
    _applyPlayerDamage(damage) {
      if (damage <= 0) return;
      const p = this.s.player;
      let remaining = damage;
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
    },
    _endNpcTurn() {
      const combat = this.s.combat;
      if (!combat) return;
      combat.round++;
      combat.npcPile.drawToLimit();
      this.s.playerPile.drawToLimit();
      this._log('敌方回合结束，第' + combat.round + '轮开始');
      this.emit('npcTurnEnd', '敌方回合结束', null);
      this.s.phase = Phase.PLAYER_PLAY;
    },
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
    },
    _runCombat(enemy, kind) {
    },
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
    },
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
    },
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
    },
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
  });
})();

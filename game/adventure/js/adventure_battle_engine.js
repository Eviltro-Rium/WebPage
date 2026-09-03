/**
 * AdventureBattleEngine
 *
 * Reuses the normal 1v1 combat state machine while replacing its shared deck
 * storage with two independent piles. The table still has one shared top card;
 * when it is replaced, the previous card returns to its recorded owner's
 * discard pile.
 */
(function () {
  const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));

  function normalizePile(owner, source, fallbackDeck, handLimit) {
    const pile = source || {};
    return {
      owner,
      deck: clone(Array.isArray(pile.deck) ? pile.deck : fallbackDeck || []),
      hand: clone(Array.isArray(pile.hand) ? pile.hand : []),
      discard: clone(Array.isArray(pile.discard) ? pile.discard : []),
      handLimit: Number.isFinite(Number(pile.handLimit)) ? Number(pile.handLimit) : handLimit
    };
  }

  function resolveNpcPileSpec(name) {
    const raw = (window.AdventureRegistry &&
      (window.AdventureRegistry.getMonster(name) || window.AdventureRegistry.getBoss(name))) || null;
    return {
      handLimit: (raw && raw.handLimit) || 2,
      whiteZeros: (raw && raw.whiteZeros) || 0
    };
  }

  class AdventureBattleEngine extends window.Engine {
    constructor() {
      super();
      this.isAdventureBattle = true;
      this.testMode = false;
      this.piles = null;
      this.tableTopOwner = null;
    }

    restoreSession(snapshot, adventureEngine = null) {
      const data = snapshot && (snapshot.battle || snapshot);
      if (!data || !data.s || !data.piles) throw new Error('战斗快照无效');
      this._adventureEngine = adventureEngine || null;
      this.testMode = !!data.testMode;
      this.s = clone(data.s);
      this.piles = clone(data.piles);
      this.h = clone(data.h) || { player: [], ai: [] };
      this.events = clone(data.events) || [];
      this.ver = Number(data.ver) || 0;
      this.pendingSettlement = clone(data.pendingSettlement) || null;
      this.tableTopOwner = data.tableTopOwner || this.s.discardTopOwner || null;
      this.s.discardTopOwner = this.tableTopOwner;
      this.deck = this.piles.player.deck;
      this.discardBottom = this.piles.player.discard;
      // 1v2 NPCs intentionally share one deck/discard pile. JSON cloning
      // breaks that reference, so restore it explicitly.
      if (this.piles.ai2) {
        this.piles.ai2.deck = this.piles.ai.deck;
        this.piles.ai2.discard = this.piles.ai.discard;
        this.h.ai = this.piles.ai.hand;
        this.h.ai2 = this.piles.ai2.hand;
      }
      this.h.player = this.piles.player.hand;
      const register = name => {
        const raw = window.AdventureRegistry &&
          (window.AdventureRegistry.getMonster(name) || window.AdventureRegistry.getBoss(name));
        if (!raw || !window.AdventureMonsterBridge) return;
        const def = window.AdventureMonsterBridge.applyStageMods
          ? window.AdventureMonsterBridge.applyStageMods(raw, this.s.adventureStage || 1)
          : raw;
        window.AdventureMonsterBridge.registerMonsterChar(def);
        window.AdventureMonsterBridge.registerMonsterAI(def);
      };
      register(this.s.ai && this.s.ai.name);
      register(this.s.ai2 && this.s.ai2.name);
      return this.state();
    }

    character(n, ai = false) {
      // 冒险模式不给 NPC 加 "AI " 前缀
      const ch = super.character(n, false);
      return ch;
    }

    startAdventure(config = {}) {
      const playerName = config.player;
      const opponentName = config.opponent;
      const stage = config.stage || 1;
      this.testMode = !!config.testMode;
      if (!window.CharacterRegistry.get(playerName)) throw new Error('未知冒险角色：' + playerName);

      const rawDef = window.AdventureRegistry.getMonster(opponentName) ||
        window.AdventureRegistry.getBoss(opponentName);
      if (rawDef) {
        const moddedDef = (window.AdventureMonsterBridge && window.AdventureMonsterBridge.applyStageMods)
          ? window.AdventureMonsterBridge.applyStageMods(rawDef, stage)
          : rawDef;
        window.AdventureMonsterBridge.registerMonsterChar(moddedDef);
        window.AdventureMonsterBridge.registerMonsterAI(moddedDef);
      }
      if (!window.CharacterRegistry.get(opponentName)) throw new Error('未知冒险对手：' + opponentName);

      // Build the ordinary 1v1 state once, then replace only its resource layer.
      super.start(playerName, opponentName);
      clearTimeout(this.timer);
      this.pendingSettlement = null;
      this.events = [];
      this.ver = 0;

      const AD = window.AdventureDeck;
      const aiSpec = resolveNpcPileSpec(opponentName);
      this.piles = {
        player: normalizePile('player', config.playerPile, AD.makePlayerDeck(), 5),
        ai: normalizePile('ai', null, AD.makeNpcDeck({ whiteZeros: aiSpec.whiteZeros }), aiSpec.handLimit)
      };

      this.h = {
        player: this.piles.player.hand,
        ai: this.piles.ai.hand
      };
      // Compatibility aliases for character skills that intentionally inspect
      // or reorder the player's deck (for example Chan value 5).
      this.deck = this.piles.player.deck;
      this.discardBottom = this.piles.player.discard;

      this.s.player = this.character(playerName);
      if (config.playerState) {
        Object.assign(this.s.player, clone(config.playerState));
        this.s.player.name = playerName;
        this.s.player.maxHp = Number(config.playerState.maxHp || this.s.player.maxHp);
        this.s.player.hp = Math.max(0, Math.min(this.s.player.maxHp, Number(config.playerState.hp)));
        this.s.player.alive = this.s.player.hp > 0;
      }
      this.s.ai = this.character(opponentName, true);
      this.s.ai.name = opponentName;
      this.s.handLimit = this.piles.player.handLimit;
      this.s.isAdventure = true;
      this.s.adventureStage = stage;
      this.s.adventureScene = config.scene || null;
      this.s.is1v2 = false;
      this.s.isLord = false;
      this.s.phase = 'PLAYER_PLAY';
      this.s.turn = 1;
      this.s.busy = false;
      this.s.activeAttacker = 'player';
      this.s.atkCard = null;
      this.s.atkOwner = null;
      this.s.defCard = null;
      this.s.defOwner = null;
      this.s.revealCards = [];

      let top = clone(config.discardTop);
      let topOwner = config.discardTopOwner || null;
      if (!top) {
        top = this._drawInitialTableCard();
        topOwner = top ? 'player' : null;
      }
      this.s.discardTop = top;
      this.tableTopOwner = topOwner;
      this.s.discardTopOwner = topOwner;

      // NPC resources are recreated for every room and never borrow cards from
      // the player's pile.
      this.draw('ai', this.piles.ai.handLimit, false);
      const openingHands = this.handCounts();
      this.silentDraws(function () { this.turnStart('player'); });
      this.emitDrawDiff(openingHands);
      this._tryEnergyShieldOnAttack();

      const monsterDef = window.AdventureRegistry.getMonster(opponentName) ||
        window.AdventureRegistry.getBoss(opponentName);
      if (monsterDef && monsterDef.firstStrike) {
        this.s.phase = 'AI_TURN';
        this.s.activeAttacker = 'ai';
        this.s.busy = true;
        this.later(() => this.startAITurn());
      }
      return this.state();
    }

    startAdventure1v2(config = {}) {
      const playerName = config.player;
      let opponent1Name = config.opponent1;
      let opponent2Name = config.opponent2;
      const stage = config.stage || 1;
      this.testMode = !!config.testMode;
      if (!window.CharacterRegistry.get(playerName)) throw new Error('未知冒险角色：' + playerName);

      const _fsDef = (n) => {
        const d = window.AdventureRegistry.getMonster(n) || window.AdventureRegistry.getBoss(n);
        return !!(d && d.firstStrike);
      };
      const _fs1 = _fsDef(opponent1Name);
      const _fs2 = _fsDef(opponent2Name);
      const hasFirstStrike = _fs1 || _fs2;
      if (_fs2 && !_fs1) {
        const tmp = opponent1Name; opponent1Name = opponent2Name; opponent2Name = tmp;
      }

      for (const oppName of [opponent1Name, opponent2Name]) {
        const rawDef = window.AdventureRegistry.getMonster(oppName) ||
          window.AdventureRegistry.getBoss(oppName);
        if (rawDef) {
          const moddedDef = (window.AdventureMonsterBridge && window.AdventureMonsterBridge.applyStageMods)
            ? window.AdventureMonsterBridge.applyStageMods(rawDef, stage)
            : rawDef;
          window.AdventureMonsterBridge.registerMonsterChar(moddedDef);
          window.AdventureMonsterBridge.registerMonsterAI(moddedDef);
        }
        if (!window.CharacterRegistry.get(oppName)) throw new Error('未知冒险对手：' + oppName);
      }

      clearTimeout(this.timer);
      this.pendingSettlement = null;
      this.events = [];
      this.ver = 0;

      const AD = window.AdventureDeck;
      const aiSpec = resolveNpcPileSpec(opponent1Name);
      const ai2Spec = resolveNpcPileSpec(opponent2Name);
      const sharedNpcDeck = AD.makeNpcDeck({ whiteZeros: aiSpec.whiteZeros });
      const sharedNpcDiscard = [];
      this.piles = {
        player: normalizePile('player', config.playerPile, AD.makePlayerDeck(), 5),
        ai: { deck: sharedNpcDeck, hand: [], discard: sharedNpcDiscard, handLimit: aiSpec.handLimit },
        ai2: { deck: sharedNpcDeck, hand: [], discard: sharedNpcDiscard, handLimit: ai2Spec.handLimit }
      };

      this.h = {
        player: this.piles.player.hand,
        ai: this.piles.ai.hand,
        ai2: this.piles.ai2.hand
      };
      this.deck = this.piles.player.deck;
      this.discardBottom = this.piles.player.discard;

      let top = clone(config.discardTop);
      let topOwner = config.discardTopOwner || null;
      if (!top) {
        top = this._drawInitialTableCard();
        topOwner = top ? 'player' : null;
      }

      this.s = {
        phase: 'PLAYER_PLAY', turn: 1, busy: false,
        selectedCard: -1, selectedCards: [], selectedAICard: -1,
        handLimit: this.piles.player.handLimit,
        forcedDiscard: false, hasPlayedThisTurn: false, hasPlayedBlackDefend: false,
        defenseSkipped: false, unblockDefend: false, attackModBonus: 0,
        aiTurnStarted: false, aiHasPlayed: false, pendingAIBridge: null,
        pendingAIContinue: null, pendingDefenseDamage: 0, pendingFiveChoice: false, fiveChoiceCard: null,
        pendingNumberJudge: null, mayDiscardAfterSkill: false, serenityHalfTarget: null,
        forceEndAITurn: false, activeAttacker: 'player',
        is1v2: true, isLord: true, isAdventure: true, adventureStage: stage, adventureScene: config.scene || null, needColorChoice: false,
        pendingDialog: null, discardTop: top, discardTopOwner: topOwner,
        player: this.character(playerName),
        ai: this.character(opponent1Name, true),
        ai2: this.character(opponent2Name, true),
        currentAITarget: 0, attackTarget: 'ai', eliminatedHandled: { ai: false, ai2: false },
        atkCard: null, atkOwner: null, defCard: null, defOwner: null, revealCards: [],
        lordPlayerTargetIdx: 0,
        revealAIHand: true
      };

      this.s.ai.name = opponent1Name;
      this.s.ai2.name = opponent2Name;

      if (config.playerState) {
        Object.assign(this.s.player, clone(config.playerState));
        this.s.player.name = playerName;
        this.s.player.maxHp = Number(config.playerState.maxHp || this.s.player.maxHp);
        this.s.player.hp = Math.max(0, Math.min(this.s.player.maxHp, Number(config.playerState.hp)));
        this.s.player.alive = this.s.player.hp > 0;
      }

      this.tableTopOwner = topOwner;


      this.draw('ai', this.piles.ai.handLimit, false);
      this.draw('ai2', this.piles.ai2.handLimit, false);
      const openingHands = this.handCounts();
      this.silentDraws(function () { this.turnStart('player'); });
      this.emitDrawDiff(openingHands);
      this._tryEnergyShieldOnAttack();

      if (hasFirstStrike) {
        this.s.phase = 'AI_TURN';
        this.s.activeAttacker = 'ai';
        this.s.busy = true;
        this.later(() => this.startAITurn());
      }

      return this.state();
    }

    _pile(owner) {
      if (!this.piles) return null;
      if (owner === 'ai2') return this.piles.ai2 || this.piles.ai;
      if (owner === 'ai') return this.piles.ai;
      return this.piles.player;
    }

    _activeOwner(explicitOwner) {
      if (explicitOwner === 'player' || explicitOwner === 'ai' || explicitOwner === 'ai2') return explicitOwner;
      if (this.s) {
        for (const k of ['defOwner', 'atkOwner', 'activeAttacker']) {
          const v = this.s[k];
          if (v === 'player' || v === 'ai' || v === 'ai2') return v;
        }
      }
      return 'player';
    }

    _shuffle(array) {
      for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
      }
      return array;
    }

    _refillPile(owner) {
      const pile = this._pile(owner);
      if (!pile || pile.deck.length || !pile.discard.length) return false;
      for (const card of pile.discard) {
        if (card.isBlack || card.isWhite) delete card.chosenColor;
      }
      pile.deck.push(...pile.discard.splice(0, pile.discard.length));
      this._shuffle(pile.deck);
      this.emit('desc', (owner === 'player' ? '玩家' : 'NPC') + '牌库已空，各自弃牌库洗回牌堆');
      return true;
    }

    _drawInitialTableCard() {
      const pile = this._pile('player');
      if (!pile) return null;
      this._refillPile('player');
      const attempts = pile.deck.length;
      for (let i = 0; i < attempts; i++) {
        const card = pile.deck.pop();
        if (!card) return null;
        if (!card.isBlack && !card.isWhite) return card;
        pile.deck.unshift(card);
      }
      return pile.deck.pop() || null;
    }

    draw(owner, count, animated = false) {
      const key = owner;
      const pile = this._pile(key);
      if (!pile) return [];
      if ((key === 'ai' || key === 'ai2') && pile.deck.length <= 2 && pile.discard.length) {
        this._shuffleDiscardIntoDeck(key);
        this.emit('desc', (key === 'ai2' ? 'NPC2' : 'NPC') + '牌库不足2张，弃牌库洗入牌库');
      }
      const cards = [];
      while (count-- > 0) {
        this._refillPile(key);
        if (!pile.deck.length) break;
        const card = pile.deck.pop();
        pile.hand.push(card);
        cards.push(card);
      }
      if (animated && cards.length && !this._suppressDrawAnim) {
        this.emit('draw', `${key === 'player' ? '玩家' : 'NPC'}从自己的牌库抽${cards.length}张牌`, null, { who: key, count: cards.length });
      }
      return cards;
    }

    refillDeckIfNeeded(owner) {
      return this._refillPile(this._activeOwner(owner));
    }

    discardToBottom(card, owner) {
      if (!card) return;
      const targetOwner = card.borrowedFrom || this._activeOwner(owner);
      const pile = this._pile(targetOwner);
      if (!pile) return;
      const saved = clone(card);
      if (saved.isBlack || saved.isWhite) delete saved.chosenColor;
      pile.discard.push(saved);
    }

    setDiscardTop(card, owner) {
      if (this.s.discardTop) {
        this.discardToBottom(this.s.discardTop, this.tableTopOwner || 'player');
      }
      const nextOwner = card && card.borrowedFrom ? card.borrowedFrom : this._activeOwner(owner);
      this.s.discardTop = clone(card);
      this.tableTopOwner = nextOwner;
      this.s.discardTopOwner = nextOwner;
    }

    _shuffleDiscardIntoDeck(owner) {
      const key = this._activeOwner(owner);
      const pile = this._pile(key);
      if (!pile || !pile.discard.length) return;
      for (const card of pile.discard) {
        if (card.isBlack || card.isWhite) delete card.chosenColor;
      }
      pile.deck.push(...pile.discard.splice(0, pile.discard.length));
      this._shuffle(pile.deck);
    }

    reveal(desc) {
      const owner = this._activeOwner();
      const pile = this._pile(owner);
      if (!pile) return null;
      this._refillPile(owner);
      const card = pile.deck.pop();
      if (!card) return null;
      this.s.revealCards = [clone(card)];
      this.emit('reveal', desc, card, { who: owner, from: 'deck' });
      return card;
    }

    fillHands(isPlayerPhase) {
      this.draw('player', Math.max(0, this.piles.player.handLimit - this.h.player.length), true);
      this.draw('ai', Math.max(0, this.piles.ai.handLimit - this.h.ai.length), true);
      if (isPlayerPhase) this.emit('desc', '回合结束：玩家与NPC分别从自己的牌库补牌');
    }

    fillHands1v2(includePlayer = false) {
      if (this.s && this.s.isAdventure && this.piles) {
        if (includePlayer) {
          this.draw('player', Math.max(0, this.piles.player.handLimit - this.h.player.length), true);
        }
        for (const key of ['ai', 'ai2']) {
          if (!this.s[key] || !this.s[key].alive) continue;
          const pile = this._pile(key);
          if (!pile) continue;
          this.draw(key, Math.max(0, pile.handLimit - this.h[key].length), true);
        }
        this.emit('desc', '冒险模式：存活NPC从共享牌库补牌');
        return;
      }
      return super.fillHands1v2(includePlayer);
    }

    fillAIHands1v2() {
      if (this.s && this.s.isAdventure && this.piles) {
        for (const key of ['ai', 'ai2']) {
          if (!this.s[key] || !this.s[key].alive) continue;
          const pile = this._pile(key);
          if (!pile) continue;
          while (this.h[key].length > pile.handLimit) {
            let worst = 0;
            for (let i = 1; i < this.h[key].length; i++) {
              if (this.h[key][i].value < this.h[key][worst].value) worst = i;
            }
            const card = this.h[key].splice(worst, 1)[0];
            this.discardWithEvent(card, key, { handIndex: worst, desc: this.s[key].name + '手牌超限，弃掉' + this.cardText(card) });
          }
          this.draw(key, Math.max(0, pile.handLimit - this.h[key].length), true);
        }
        this.emit('desc', '冒险模式：存活NPC手牌保持5张');
        return;
      }
      return super.fillAIHands1v2();
    }

    trimAI() {
      while (this.h.ai.length > this.piles.ai.handLimit) {
        const index = this.chooseAIDiscard(this.h.ai);
        const card = this.h.ai.splice(index, 1)[0];
        this.discardWithEvent(card, 'ai', { handIndex: index, desc: `NPC手牌超限，弃掉${this.cardText(card)}` });
      }
    }

    state() {
      if (this.s && this.piles) {
        this.s.isAdventure = true;
        this.s.discardTopOwner = this.tableTopOwner;
        this.s.playerDeckCount = this.piles.player.deck.length;
        this.s.playerDiscardCount = this.piles.player.discard.length;
        this.s.aiDeckCount = this.piles.ai.deck.length;
        this.s.aiDiscardCount = this.piles.ai.discard.length;
        this.s.aiHandCount = this.piles.ai.hand.length;
        this.s.aiHand = this.piles.ai.hand;
        if (this.piles.ai2) {
          this.s.ai2DeckCount = this.piles.ai2.deck.length;
          this.s.ai2DiscardCount = this.piles.ai2.discard.length;
          this.s.ai2HandCount = this.piles.ai2.hand.length;
          this.s.ai2Hand = this.piles.ai2.hand;
        }
        if (this.adventureCurrency) {
          this.s.adventureGold = this.adventureCurrency.gold || 0;
          this.s.adventureBeastTokens = Object.assign({}, this.adventureCurrency.tokens);
          this.s.adventureBeastTotal = this.adventureCurrency.totalBeastTokens ? this.adventureCurrency.totalBeastTokens() : 0;
        }
        this.s.demonPactAvailable = !!(this._hasAccessory('DemonPact') &&
          this.s.player.hp > 3 &&
          (this.s.phase === 'PLAYER_PLAY' || this.s.phase === 'PLAYER_DEFEND') &&
          !this.s.busy && !this.s.needColorChoice &&
          (this.s.phase === 'PLAYER_PLAY'
            ? this._demonPactPlayTurn !== this.s.turn
            : this._demonPactDefendAttack !== this.s.pendingAttack));
      }
      return super.state();
    }

    _settleTableTop() {
      if (!this.s || !this.s.discardTop) return;
      this.discardToBottom(this.s.discardTop, this.tableTopOwner || 'player');
      this.s.discardTop = null;
      this.tableTopOwner = null;
      this.s.discardTopOwner = null;
    }

    finishAdventureBattle() {
      clearTimeout(this.timer);
      this._settleTableTop();

      // A borrowed monster card never becomes part of the player's persistent
      // collection. If it was still in the hand/deck when the room ended,
      // return it to the monster's discard pile before resetting NPC cards.
      for (const list of [this.piles.player.deck, this.piles.player.hand, this.piles.player.discard]) {
        for (let i = list.length - 1; i >= 0; i--) {
          const card = list[i];
          if (!card || !card.borrowedFrom) continue;
          list.splice(i, 1);
          const owner = this._pile(card.borrowedFrom);
          if (owner) owner.discard.push(clone(card));
        }
      }

      const is1v2 = !!this.piles.ai2;
      const allHands = is1v2
        ? [...this.piles.ai.hand, ...this.piles.ai2.hand]
        : [...this.piles.ai.hand];
      const npcCards = [
        ...this.piles.ai.deck,
        ...allHands,
        ...this.piles.ai.discard
      ].map(card => {
        const saved = clone(card);
        if (saved.isBlack || saved.isWhite) delete saved.chosenColor;
        return saved;
      });
      this._shuffle(npcCards);
      this.piles.ai.deck.splice(0, this.piles.ai.deck.length, ...npcCards);
      this.piles.ai.hand.splice(0, this.piles.ai.hand.length);
      if (is1v2) this.piles.ai2.hand.splice(0, this.piles.ai2.hand.length);
      this.piles.ai.discard.splice(0, this.piles.ai.discard.length);

      return {
        playerState: clone(this.s.player),
        playerPile: clone({
          deck: this.piles.player.deck,
          hand: this.piles.player.hand,
          discard: this.piles.player.discard,
          handLimit: this.piles.player.handLimit
        }),
        discardTop: null,
        discardTopOwner: null,
        npcResetCount: this.piles.ai.deck.length
      };
    }

    useAdventureCombatItem(itemIndex, choice) {
      const advEngine = this._adventureEngine;
      if (!advEngine) return this.state();
      const snap = advEngine.snapshot();
      const item = snap.consumables[itemIndex];
      if (!item) return this.state();
      const def = window.AdventureRegistry.getItem(item.name);
      if (!def || def.kind !== 'consumable') return this.state();
      if (!this._canUseAdventureCombatItemNow(def)) {
        if (this.s.player && (this.s.player.blind || 0) > 0 && def.kind === 'consumable') {
          this.emit('desc', '玩家处于致盲状态，无法使用一次性道具');
          return this.state();
        }
        const dodgeOnly = def.combatUse === 'dodge';
        this.emit('desc', dodgeOnly
          ? '闪避只能在防御出牌阶段使用'
          : def.defendOnly ? def.displayName + '只能在防御出牌阶段使用'
          : '当前不能使用道具（仅可在选牌出牌/防御时使用）');
        return this.state();
      }
      if (def.combatUse === 'attackMod') return this.state();
      if ((def.combatUse === 'dodge' || def.defendOnly) && !this.s.pendingAttack) {
        this.emit('desc', '当前没有可闪避的攻击');
        return this.state();
      }

      const player = this.s.player;
      const purifyChoices = Array.isArray(choice) ? choice : null;
      let targetKey = this.s.attackTarget;
      if (!targetKey && this.s.is1v2) {
        targetKey = (this.s.activeAttacker === 'ai2') ? 'ai2' : 'ai';
      }
      if (!targetKey) targetKey = 'ai';
      const ai = this.s[targetKey] || this.s.ai;
      let message = '';
      let dodgeResolved = false;

      switch (def.combatUse) {
        case 'chameleonPaint': {
          const target = choice && (choice.target || choice.owner);
          const index = Number(choice && choice.index);
          const targetKey = target || (this.s.is1v2 ? this.s.attackTarget : 'ai');
          const hand = this.h[targetKey];
          const targetChar = this.s[targetKey];
          if (!hand || !targetChar || !targetChar.alive || !Number.isInteger(index) || !hand[index]) {
            this.emit('desc', '请选择一张有效的对手手牌');
            return this.state();
          }
          const borrowed = hand.splice(index, 1)[0];
          borrowed.borrowedMonster = true;
          borrowed.borrowedFrom = targetKey;
          borrowed.borrowedMonsterName = this.name(targetChar);
          this.h.player.push(borrowed);
          message = '暂借' + borrowed.borrowedMonsterName + '的一张牌，加入玩家手牌';
          break;
        }
        case 'dodge': {
          this.cancelAttackDebuffs('player', false);
          this.s.pendingBuffRestore = null;
          this.s.serenityHalfTarget = null;
          this.s.hasPlayedBlackDefend = false;
          this.s.unblockDefend = false;
          this.s.selectedCard = -1;
          this.s.pendingAttack = { damage: 0, unblock: false };
          this.s.defenseSkipped = true;
          message = '闪避成功，本次攻击作废';
          dodgeResolved = true;
          break;
        }
        case 'naturalShield': {
          const damage = Math.max(0, Number(this.s.pendingAttack && this.s.pendingAttack.damage) || 0);
          const blocked = Math.min(def.shieldAmount || 5, damage);
          if (this.s.pendingAttack) this.s.pendingAttack.damage = damage - blocked;
          this.s.pendingDefenseDamage = Math.max(0, damage - blocked);
          message = '格挡本次攻击' + blocked + '点伤害';
          break;
        }
        case 'heal': {
          const before = player.hp;
          player.hp = Math.min(player.maxHp, player.hp + (def.healAmount || 5));
          message = '恢复' + (player.hp - before) + '点生命';
          break;
        }
        case 'purify': {
          const count = def.purifyCount || 1;
          if (!advEngine._hasPurifyableDebuff(player, ai)) {
            this.emit('desc', '当前没有可净化的状态');
            return this.state();
          }
          if (!purifyChoices || !purifyChoices.length) {
            this.emit('desc', '请选择要净化的buff');
            return this.state();
          }
          const removed = advEngine._applyPurifyChoices(player, purifyChoices.slice(0, count), ai);
          if (!removed) {
            this.emit('desc', '无效的选择');
            return this.state();
          }
          message = '净化' + removed + '个buff';
          break;
        }
        case 'burn': {
          ai.burn = (ai.burn || 0) + (def.burnAmount || 2);
          message = '对对手施加' + (def.burnAmount || 2) + '层灼伤';
          break;
        }
        case 'bleed': {
          ai.bleed = (ai.bleed || 0) + (def.bleedAmount || 1);
          message = '对对手施加' + (def.bleedAmount || 1) + '层流血';
          break;
        }
        case 'freeze': {
          ai.frozen = true;
          message = '对对手施加冷冻';
          break;
        }
        case 'vampire': {
          const amt = def.vampireAmount || 3;
          const before = ai.hp;
          this.hurt(ai, amt, 'drain');
          const drained = before - ai.hp;
          this.heal(player, drained, 'drain');
          message = '吸取对手' + drained + '点生命';
          break;
        }
        case 'cardMaster': {
          const applied = this._applyCardMaster(choice);
          if (!applied.ok) {
            this.emit('desc', applied.message || '卡牌大师需要选择效果');
            return this.state();
          }
          message = applied.message;
          break;
        }
        case 'buffTransfer': {
          const applied = this._applyBuffTransfer(choice, player, ai);
          if (!applied.ok) {
            this.emit('desc', applied.message || '魔法转移需要选择一层buff');
            return this.state();
          }
          message = applied.message;
          break;
        }
        case 'bind': {
          if (this.s.phase !== 'PLAYER_PLAY') {
            this.emit('desc', '捆缚只能在进攻回合使用');
            return this.state();
          }
          if (this.s.bindUsedThisTurn) {
            this.emit('desc', '本回合已使用过捆缚');
            return this.state();
          }
          this._bindSkipNextAITurn = true;
          this.s.bindUsedThisTurn = true;
          if (this.s.ai) this.s.ai.bindMark = true;
          if (this.s.ai2 && this.s.ai2.alive) this.s.ai2.bindMark = true;
          message = '本回合结束后将跳过对手进攻，再进行一次进攻';
          break;
        }
        case 'bomb': {
          ai.bomb = def.bombTimer || 5;
          this.emit('buff', '炸弹倒计时：' + ai.bomb, null, { who: 'ai', kind: 'bomb', stacks: ai.bomb });
          message = '对对手施加定时炸弹（倒计时' + ai.bomb + '）';
          break;
        }
        default:
          message = '使用' + def.displayName;
      }

      this.emit('desc', '使用道具[' + def.displayName + ']：' + message);
      advEngine.s.consumables.splice(itemIndex, 1);
      if (dodgeResolved) {
        this.s.phase = 'AI_TURN';
        this.deferSettlement('AI_ATTACK', 0, 0);
        return this.check();
      }
      this.check();
      return this.state();
    }

    _canUseAdventureCombatItemNow(def) {
      if (!this.s || !this.s.isAdventure) return false;
      if (this.s.busy) return false;
      if (this.s.needColorChoice) return false;
      if (this.s.player && (this.s.player.blind || 0) > 0 && def && def.kind === 'consumable') return false;
      if (def && (def.combatUse === 'dodge' || def.defendOnly)) {
        return this.s.phase === 'PLAYER_DEFEND' && !!this.s.pendingAttack;
      }
      if (def && def.combatUse === 'bind') {
        return this.s.phase === 'PLAYER_PLAY' && !this.s.bindUsedThisTurn;
      }
      if (def && def.combatUse === 'chameleonPaint') {
        return this.s.phase === 'PLAYER_PLAY';
      }
      // 仅在玩家可选择出牌/防御牌时（含不可防御时的跳过窗口）
      return this.s.phase === 'PLAYER_PLAY' || this.s.phase === 'PLAYER_DEFEND';
    }

    _applyCardMaster(choice) {
      if (choice !== 'draw2' && choice !== 'mulligan') {
        return { ok: false, message: '请选择：抽两张，或弃牌重抽' };
      }
      if (choice === 'draw2') {
        const drawn = this.draw('player', 2, true);
        return { ok: true, message: '抽取' + drawn.length + '张牌' };
      }
      const n = this.h.player.length;
      const dropped = this.h.player.splice(0, n);
      for (let i = dropped.length - 1; i >= 0; i--) {
        this.discardWithEvent(dropped[i], 'player', {
          handIndex: i,
          desc: '卡牌大师：弃掉' + this.cardText(dropped[i])
        });
      }
      const redrawn = this.draw('player', n, true);
      return { ok: true, message: '弃掉' + n + '张并重抽' + redrawn.length + '张' };
    }

    _listTransferableBuffs(ch) {
      const kinds = [];
      if (!ch) return kinds;
      if (ch.burn > 0) kinds.push('burn');
      if (ch.bleed > 0) kinds.push('bleed');
      if ((ch.poison || 0) > 0) kinds.push('poison');
      if (ch.frozen) kinds.push('freeze');
      if (ch.guard > 0) kinds.push('guard');
      if ((ch.fly || 0) > 0) kinds.push('fly');
      if ((ch.crit || 0) > 0) kinds.push('crit');
      return kinds;
    }

    _moveBuffLayer(from, to, kind, wTo) {
      const labels = { burn: '灼烧', bleed: '流血', poison: '中毒', freeze: '冷冻', guard: '守护', fly: '飞翔', crit: '暴击' };
      switch (kind) {
        case 'burn':
          from.burn--;
          this.burn(to, 1);
          break;
        case 'bleed':
          from.bleed--;
          this.bleed(to, 1);
          break;
        case 'poison':
          from.poison = Math.max(0, (from.poison || 0) - 1);
          this.poison(to, 1);
          break;
        case 'freeze':
          from.frozen = false;
          this.freeze(to);
          break;
        case 'guard':
          from.guard--;
          to.guard = Math.min(5, (to.guard || 0) + 1);
          this.emit('buff', '+1[守护]', null, { who: wTo, kind: 'guard', stacks: to.guard });
          break;
        case 'fly':
          from.fly--;
          to.fly = Math.min(2, (to.fly || 0) + 1);
          this.emit('buff', '+1[飞翔]', null, { who: wTo, kind: 'fly', stacks: to.fly });
          break;
        case 'crit':
          from.crit--;
          to.crit = (to.crit || 0) + 1;
          this.emit('buff', '+1[暴击]', null, { who: wTo, kind: 'crit', stacks: to.crit });
          break;
        default:
          return null;
      }
      return labels[kind] || kind;
    }

    _applyBuffTransfer(choice, player, opponent) {
      const fromSelf = this._listTransferableBuffs(player);
      if (!fromSelf.length) return { ok: false, message: '自己没有可转移的buff' };
      let kind = choice;
      if (choice && typeof choice === 'object') {
        kind = choice.kind;
      }
      if (!kind) return { ok: false, message: '请选择要转移的一层buff' };
      if (!fromSelf.includes(kind)) return { ok: false, message: '无效的buff选择' };
      const wTo = opponent === this.s.ai2 ? 'ai2' : 'ai';
      const label = this._moveBuffLayer(player, opponent, kind, wTo);
      if (!label) return { ok: false, message: '无效的buff选择' };
      return { ok: true, message: '将1层' + label + '转移给对手' };
    }

    _hasAccessory(name) {
      const eng = this._adventureEngine;
      return !!(eng && typeof eng.hasAccessory === 'function' && eng.hasAccessory(name));
    }

    _flameFistBurnAmount() {
      const def = window.AdventureRegistry && window.AdventureRegistry.getItem('FlameFist');
      const perFist = (def && def.onDefendBurn) || 1;
      const eng = this._adventureEngine;
      const count = eng && typeof eng.accessoryCount === 'function' ? eng.accessoryCount('FlameFist') : 1;
      return perFist * count;
    }

    _tryFlameFistOnDefend(skip) {
      if (!this.s || !this.s.isAdventure) return;
      if (skip) return;
      if (!this._hasAccessory('FlameFist')) return;
      const i = this.s.selectedCard;
      const c = this.h.player && this.h.player[i];
      if (!c || (c.isBlack && !c.chosenColor)) return;
      const attackerKey = (this.s.atkOwner && this.s.atkOwner !== 'player') ? this.s.atkOwner : 'ai';
      const attacker = this.s[attackerKey];
      if (!attacker || !attacker.alive) return;
      const stacks = this._flameFistBurnAmount();
      this.burn(attacker, stacks);
      this.emit('desc', '火焰之拳：施加' + stacks + '层灼伤');
    }

    defend(skip = false) {
      this._tryFlameFistOnDefend(skip);
      return super.defend(skip);
    }

    // 1v2 的 dispatch 会直接调用 defend1v2，绕过上面的 defend 包装。
    // 在这里补上同一条配饰触发链，确保 Moze 2 等反击型防御技能也能触发火焰之拳。
    defend1v2(skip = false) {
      this._tryFlameFistOnDefend(skip);
      return super.defend1v2(skip);
    }

    _accessoryCount(name) {
      const eng = this._adventureEngine;
      return eng && typeof eng.accessoryCount === 'function' ? eng.accessoryCount(name) : 1;
    }

    useDemonPact() {
      if (!this.s || !this.s.isAdventure) return this.state();
      if (!this._hasAccessory('DemonPact')) return this.state();
      const phase = this.s.phase;
      if (phase !== 'PLAYER_PLAY' && phase !== 'PLAYER_DEFEND') {
        this.emit('desc', '恶魔契约只能在选牌阶段使用');
        return this.state();
      }
      if (phase === 'PLAYER_PLAY') {
        if (this._demonPactPlayTurn === this.s.turn) {
          this.emit('desc', '本回合已使用过恶魔契约');
          return this.state();
        }
      } else {
        if (this._demonPactDefendAttack === this.s.pendingAttack) {
          this.emit('desc', '本阶段已使用过恶魔契约');
          return this.state();
        }
      }
      if (this.s.player.hp <= 3) {
        this.emit('desc', '生命值不足3点，无法使用恶魔契约');
        return this.state();
      }
      if (phase === 'PLAYER_PLAY') {
        this._demonPactPlayTurn = this.s.turn;
      } else {
        this._demonPactDefendAttack = this.s.pendingAttack;
      }
      this.hurt(this.s.player, 3);
      this.emit('desc', '恶魔契约：自伤3点生命');
      const drawn = this.draw('player', 1, true);
      if (drawn.length) this.emit('desc', '恶魔契约：抽取1张牌');
      else this.emit('desc', '恶魔契约：牌库已空，未能抽牌');
      this.check();
      return this.state();
    }

    _canUseBindNow() {
      if (!this.s || !this.s.isAdventure) return false;
      if (this.s.phase !== 'PLAYER_PLAY') return false;
      if (this.s.busy) return false;
      if (this.s.needColorChoice) return false;
      if (this.s.bindUsedThisTurn) return false;
      return true;
    }

    startAITurn() {
      if (this.s && this.s.isAdventure && this._bindSkipNextAITurn) {
        this._bindSkipNextAITurn = false;
        const hands = this.handCounts();
        this.silentDraws(function () {
          this.fillHands(true);
          this.turnStart('player');
          this._tryEnergyShieldOnAttack();
        });
        if (this.s.ai) this.s.ai.bindMark = true;
        if (this.s.ai2 && this.s.ai2.alive) this.s.ai2.bindMark = true;
        this.s.bindExtraTurn = true;
        this.s.bindUsedThisTurn = false;
        this.s.phase = 'PLAYER_PLAY';
        this.s.busy = false;
        this.s.activeAttacker = 'player';
        this.s.hasPlayedThisTurn = false;
        this.s.turn++;
        this._energyShieldAppliedThisTurn = false;
        this.emit('desc', '捆缚：跳过对手进攻，玩家再进行一次进攻');
        this.emitDrawDiff(hands);
        return this.check();
      }
      if (this.s && this.s.bindExtraTurn) {
        if (this.s.ai) this.s.ai.bindMark = false;
        if (this.s.ai2) this.s.ai2.bindMark = false;
        this.s.bindExtraTurn = false;
      }
      return super.startAITurn();
    }

    _tryFreezeLaserOnAttackDamage(target, amount, kind) {
      if (!this.s || !this.s.isAdventure) return;
      if (!(amount > 0) || kind) return;
      if (!target || target === this.s.player) return;
      if (this._freezeLaserAppliedThisAttack) return;
      if (!this._hasAccessory('FreezeLaser')) return;
      this._freezeLaserAppliedThisAttack = true;
      target.frozen = true;
      this.emit('desc', '冷冻激光：对手被冷冻');
    }

    _tryEnergyShieldOnAttack() {
      if (!this.s || !this.s.isAdventure) return;
      if (this.s.phase !== 'PLAYER_PLAY') return;
      if (this._energyShieldAppliedThisTurn) return;
      if (!this._hasAccessory('EnergyShield')) return;
      this._energyShieldAppliedThisTurn = true;
      const def = window.AdventureRegistry && window.AdventureRegistry.getItem('EnergyShield');
      const perShield = (def && def.onAttackStartGuard) || 2;
      const guard = perShield * this._accessoryCount('EnergyShield');
      this.s.player.guard = Math.min(5, (this.s.player.guard || 0) + guard);
      this.emit('desc', '能量盾：获得' + guard + '层守护');
    }

    play() {
      const result = super.play();
      this._tryGoblinPassive();
      return result;
    }

    _tryGoblinPassive() {
      if (!this.s || !this.s.isAdventure) return;
      const c = this.s.atkCard;
      if (!c || !c.isNumberCard || c.value !== 1) return;
      const aiName = this.name(this.s.ai);
      if (aiName !== 'DungeonGoblin') return;
      const stage = this.s.adventureStage || 1;
      const advEngine = this._adventureEngine;
      if (!advEngine) return;
      if (stage === 2) {
        if (advEngine.s.currency.gold > 0) {
          advEngine.s.currency.gold--;
          this.emit('desc', '城堡哥布林被动：玩家损失1金币');
        }
      } else if (stage >= 3) {
        if (advEngine.s.consumables && advEngine.s.consumables.length) {
          const idx = Math.floor(Math.random() * advEngine.s.consumables.length);
          const removed = advEngine.s.consumables.splice(idx, 1)[0];
          const def = window.AdventureRegistry.getItem(removed);
          this.emit('desc', '城堡哥布林被动：玩家损失道具[' + (def ? def.displayName : removed) + ']');
        }
      }
    }

    hurt(x, n, kind = false, opts = {}) {
      // 保留 silent 等选项，避免流血结算在合并飘字之外又产生一条重复伤害事件。
      super.hurt(x, n, kind, opts);
      this._tryFreezeLaserOnAttackDamage(x, n, kind);
    }

    afterAttack() {

      this._freezeLaserAppliedThisAttack = false;
      if (this.s) this.s.pendingPurifyCrystal = null;
      return super.afterAttack();
    }

    _returnBorrowedCardsFromHand() {
      if (!this.h || !Array.isArray(this.h.player)) return 0;
      let returned = 0;
      for (let i = this.h.player.length - 1; i >= 0; i--) {
        const card = this.h.player[i];
        if (!card || !card.borrowedFrom) continue;
        this.h.player.splice(i, 1);
        this.discardWithEvent(card, card.borrowedFrom, {
          from: 'hand', destination: 'npc-discard',
          desc: '进攻回合结束：借用的怪物牌归还' + (card.borrowedMonsterName || 'NPC') + '弃牌堆'
        });
        returned++;
      }
      return returned;
    }

    endTurn() {
      this._returnBorrowedCardsFromHand();
      return super.endTurn();
    }

    confirmDiscard() {
      const result = super.confirmDiscard();
      this._returnBorrowedCardsFromHand();
      return result;
    }

    playBorrowedMonsterCard(card) {
      const sourceKey = card.borrowedFrom || (this.s.is1v2 ? (this.s.attackTarget || 'ai') : 'ai');
      const monster = this.s[sourceKey];
      if (!monster || !monster.alive) return this.gateAdventureAttackMod(card, 0, true, false);
      const monsterName = card.borrowedMonsterName || this.name(monster);
      const mod = window.AdventureRegistry && (window.AdventureRegistry.getMonster(monsterName) || window.AdventureRegistry.getBoss(monsterName));
      this.s.attackTarget = sourceKey;
      this.s.borrowedMonsterSkill = true;
      this.rememberAttackDebuffs(sourceKey);
      const before = { bleed: monster.bleed || 0, burn: monster.burn || 0, poison: monster.poison || 0, frozen: !!monster.frozen };
      try {
        if (mod && typeof mod.attackSkipEffect === 'function') {
          mod.attackSkipEffect(this, this.s.player, monster);
          this.emit('desc', '玩家借用' + monsterName + '技能：跳过防御');
          return this.gateAdventureAttackMod(card, 0, true, false);
        }
        const result = this.effect(monsterName, card.value, card, this.s.player, monster) || { d: 0, skip: false, unblock: false };
        this._deferAttackBuffs(sourceKey, before);
        if (result.immediateBuffs) this._restoreAttackBuffs();
        const damage = Number(result.d) || 0;
        this.emit('desc', '玩家借用' + monsterName + '技能：' + damage + '点伤害' + ((result.skip || result.unblock || damage <= 0) ? '，跳过防御' : ''), card);
        return this.gateAdventureAttackMod(card, damage, !!result.skip, !!result.unblock);
      } finally {
        this.s.borrowedMonsterSkill = false;
      }
    }

    gateAdventureAttackMod(card, damage, skip = false, unblock = false, delay = 0) {
      if (this.s && this.s.isAdventure && damage > 0 && this._hasAccessory('JusticeHammer')) {
        const bonus = this._accessoryCount('JusticeHammer');
        damage += bonus;
        this.emit('desc', '正义之锤：伤害+' + bonus);
      }
      return super.gateAdventureAttackMod(card, damage, skip, unblock, delay);
    }

    continueAfterAttackMod() {
      let p = this.s.pendingAttackMod || {};
      let skip = !!p.skip, unblock = !!p.unblock, card = p.card || this.s.atkCard, delay = p.delay || 0;
      let d = (this.s.pendingAttack && this.s.pendingAttack.damage) || 0;
      if (this.s.attackModBonus && d > 0) {
        d += this.s.attackModBonus;
        this.s.pendingAttack.damage = d;
        this.emit('desc', '攻击修正+' + this.s.attackModBonus + '点伤害');
        this.s.attackModBonus = 0;
      }
      this.s.pendingAttackMod = null;
      const who = this.name(this.s.player);
      if (who === 'Otto' && d > 4 && !unblock && (this.s.player.crit || 0) > 0) {
        unblock = true;
        this.s.player.crit--;
        if (this.s.pendingAttack) this.s.pendingAttack.unblock = true;
        this.s.defenseSkipped = true;
        this.emit('buff', '-1[暴击]', null, { who: 'player', kind: 'crit', stacks: this.s.player.crit });
        this.emit('desc', `Otto 消耗1层暴击，${d}点伤害变为不可防御`);
      }
      if (this._shouldTriggerPurifyCrystal(card)) {
        this.s.pendingDialog = 'purifyCrystal';
        this.s.pendingPurifyCrystal = { damage: d, skip, unblock, card: card, delay };
        this.s.phase = 'PURIFY_CRYSTAL_CHOICE';
        this.s.busy = false;
        return this.check();
      }
      return this._proceedToDefend(d, skip, unblock, card, delay);
    }

    _proceedToDefend(d, skip, unblock, card, delay) {
      if (this.s.is1v2) {
        if (d && !skip && !unblock) { this.s.phase = 'AI_DEFEND'; this.s.busy = true; this.later(() => this.aiDefend1v2(card, d), delay); }
        else { this.s.phase = 'AI_DEFEND'; this.s.busy = true; this.deferSettlement('PLAYER_ATTACK', d, 0); }
        return this.check();
      }
      if (d && !skip && !unblock) { this.s.phase = 'AI_DEFEND'; this.s.busy = true; this.later(() => this.aiDefend(card, d), delay); }
      else {
        let targetKey = this.s.is1v2 ? (this.s.attackTarget || 'ai') : 'ai';
        if (d > 0) this.hurt(this.s[targetKey], d);
        this.s.phase = 'AI_DEFEND'; this.s.busy = true;
        this.later(() => { this._restoreAttackBuffs(); this.afterAttack(); this.check(); }, 1700);
      }
      return this.check();
    }

    _shouldTriggerPurifyCrystal(card) {
      if (!this.s || !this.s.isAdventure) return false;
      if (!this._hasAccessory('PurifyCrystal')) return false;
      if (!card) return false;
      const color = this.effective(card);
      if (color !== 'GREEN' && color !== 'BLUE') return false;
      const opponentKey = this.s.is1v2 ? (this.s.attackTarget || 'ai') : 'ai';
      const opponent = this.s[opponentKey];
      return this._hasPurifyableBuff(this.s.player) || this._hasPurifyableBuff(opponent);
    }

    _hasPurifyableBuff(ch) {
      if (!ch) return false;
      return (ch.burn > 0) || (ch.bleed > 0) || ((ch.poison || 0) > 0) || !!ch.frozen ||
             (ch.guard > 0) || ((ch.fly || 0) > 0) || ((ch.crit || 0) > 0);
    }

    choosePurifyCrystal(choice) {
      if (this.s.phase !== 'PURIFY_CRYSTAL_CHOICE' || !this.s.pendingPurifyCrystal) throw Error('当前没有待处理的净化水晶');
      const who = choice && choice.who;
      const kind = choice && choice.kind;
      const opponentKey = this.s.is1v2 ? (this.s.attackTarget || 'ai') : 'ai';
      const target = who === 'opp' ? this.s[opponentKey] : this.s.player;
      const targetLabel = who === 'opp' ? (this.s.is1v2 && opponentKey === 'ai2' ? 'AI2' : '对手') : '玩家';
      const kindLabel = { burn: '灼烧', freeze: '冷冻', bleed: '流血', poison: '中毒', guard: '守护', fly: '飞翔', crit: '暴击' }[kind] || 'buff';
      this.clean(target, false, kind);
      this.emit('desc', '净化水晶：清除' + targetLabel + '一层' + kindLabel);
      const pending = this.s.pendingPurifyCrystal;
      this.s.pendingDialog = null;
      this.s.pendingPurifyCrystal = null;
      return this._proceedToDefend(pending.damage, pending.skip, pending.unblock, pending.card, pending.delay);
    }

    endAi() {
      this.trimAI();
      if (this.s.ai.burn) {
        let dmg = this.s.ai.burn;
        this.s.ai.burn--;
        if (this.name(this.s.ai) !== 'Leon') {
          this.emit('burnSettle', `-${dmg}[灼烧]，-1[灼烧层数]`, null, { who: 'ai', target: 'ai', amount: dmg, kind: 'burn' });
          this.s.ai.hp = Math.max(0, this.s.ai.hp - dmg);
          this.s.ai.alive = this.s.ai.hp > 0;
        }
      }
      this.s.turn++;
      this.s.phase = 'PLAYER_PLAY';
      this.s.busy = false;
      this.s.activeAttacker = 'player';
      this.s.pendingAttack = null;
      this.s.pendingAIBridge = null;
      this.s.pendingAIContinue = null;
      this.s.forceEndAITurn = false;
      this.s.attackDebuffSnapshot = null;
      this.s.atkCard = this.s.defCard = null;
      this.s.atkOwner = this.s.defOwner = null;
      this.s.revealCards = [];
      this.s.hasPlayedThisTurn = false;
      this.s.aiTurnStarted = false;
      this.s.aiHasPlayed = false;
      this.s.bindUsedThisTurn = false;
      this._energyShieldAppliedThisTurn = false;
      const hands = this.handCounts();
      this.silentDraws(function () {
        this.fillHands(false);
        this.turnStart('player');
        this._tryEnergyShieldOnAttack();
      });
      this.emitDrawDiff(hands);
      this.check();
    }

    dispatch(method, params = {}) {
      if (method === 'selectAdventureBattle') return this.startAdventure(params);
      if (method === 'selectAdventureBattle1v2') return this.startAdventure1v2(params);
      if (method === 'finishAdventureBattle') return this.finishAdventureBattle();
      if (method === 'useAdventureCombatItem') {
        const choice = params.choices != null ? params.choices : (params.choice || null);
        return this.useAdventureCombatItem(params.itemIndex || 0, choice);
      }
      if (method === 'chooseTrophyDisarm') return this.chooseTrophyDisarm(params.target, params.index);
      if (method === 'doEndTurn' && this.s && this.s.is1v2) this._returnBorrowedCardsFromHand();
      if (method === 'setAttackModBonus') { this.s.attackModBonus = params.bonus || 0; return this.state(); }
      if (method === 'choosePurifyCrystal') return this.choosePurifyCrystal(params.choice || params);
      if (method === 'useDemonPact') return this.useDemonPact();
      return super.dispatch(method, params);
    }
  }

  window.AdventureBattleEngine = AdventureBattleEngine;
})();

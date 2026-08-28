/**
 * 冒险模式牌库系统
 *
 * 与主引擎的差异：
 *   - 玩家牌库去掉「交换手牌」道具牌（swapHand）。
 *   - NPC（怪物）拥有独立牌库：白色1~3各4张、白色4~6各2张，外加2张紫魔法和2张绿魔法；Boss 另加两张白色0。
 *   - 弃牌库拆分为不可见的玩家弃牌库与 NPC 弃牌库，互不混淆。
 *   - 虚拟弃牌库顶（DiscardTop）仅用于提示双方下一张可出之牌，不归属任何一方弃牌库。
 *   - 怪物手牌上限2张且明牌展示；Boss 手牌上限3张。
 */
(function () {
  const COLORS = ['RED', 'YELLOW', 'BLUE', 'GREEN'];

  const num = (color, value, white = false) => ({
    value, color, drawTwo: false, drawThree: false, potion: false,
    purify: false, superPurify: false, swapHand: false, shuffleToDeck: false,
    isBlack: false, isWhite: white, isNumberCard: true, isItemCard: false
  });

  const item = (color, k) => ({
    value: -1, color, drawTwo: k === 'drawTwo', drawThree: k === 'drawThree',
    potion: k === 'potion', magic: k === 'magic', greenMagic: k === 'greenMagic',
    magicColor: k === 'greenMagic' ? 'green' : (k === 'magic' ? 'purple' : null),
    purify: k === 'purify', superPurify: k === 'superPurify',
    swapHand: k === 'swap', shuffleToDeck: k === 'shuffle',
    isBlack: color === 'BLACK', isWhite: color === 'WHITE',
    isNumberCard: false, isItemCard: true
  });

  // 战利白卡：属于玩家牌库，不占用一次性道具槽；打出后进入弃牌库，
  // 因而可以在牌库洗回后反复抽到。它仍按白牌规则自动指定当前颜色。
  const trophyWhite = (name = 'BurnTrophy') => ({
    value: -1,
    color: 'WHITE',
    trophyWhite: true,
    trophyName: name,
    trophyEffect: ({ BurnTrophy: 'burn', PiercingTrophy: 'bleed', FreezeTrophy: 'freeze', GuardTrophy: 'guard' })[name] || null,
    chosenColor: null,
    isBlack: false,
    isWhite: true,
    isNumberCard: false,
    isItemCard: true
  });

  function shuffle(arr) {
    for (let i = arr.length - 1; i; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function clone(card) { return JSON.parse(JSON.stringify(card)); }

  function makePlayerDeck() {
    const d = [];
    for (const c of COLORS) {
      for (let v = 1; v <= 7; v++)
        for (let n = 0; n < (v <= 3 ? 3 : v <= 6 ? 2 : 1); n++) d.push(num(c, v));
      d.push(num(c, 0));
    }
    for (let v = 1; v <= 7; v++) d.push(num('WHITE', v, true));

    for (let i = 0; i < 2; i++) d.push(item('BLACK', 'black'), item('BLACK', 'drawTwo'), item('WHITE', 'drawThree'));
    for (let i = 0; i < 4; i++) d.push(item('BLACK', 'shuffle'), item('WHITE', 'potion'), item('WHITE', 'superPurify'));
    for (let i = 0; i < 6; i++) d.push(item('WHITE', 'purify'));
    return shuffle(d);
  }

  function makeNpcDeck(opts = {}) {
    const d = [];
    const whiteZeros = Math.max(0, Number(opts.whiteZeros) || 0);
    for (let i = 0; i < whiteZeros; i++) d.push(num('WHITE', 0, true));
    for (let v = 1; v <= 3; v++) for (let n = 0; n < 4; n++) d.push(num('WHITE', v, true));
    for (let v = 4; v <= 6; v++) for (let n = 0; n < 2; n++) d.push(num('WHITE', v, true));
    // Purple magic is the original magic card; green magic cleanses the caster.
    d.push(item('WHITE', 'magic'), item('WHITE', 'magic'));
    d.push(item('WHITE', 'greenMagic'), item('WHITE', 'greenMagic'));
    return shuffle(d);
  }

  class AdventurePile {
    constructor(owner, deck, handLimit) {
      this.owner = owner;
      this.deck = deck;
      this.hand = [];
      this.discard = [];
      this.handLimit = handLimit;
    }

    refillIfNeeded() {
      if (this.deck.length || !this.discard.length) return false;
      this.deck.push(...this.discard);
      this.discard = [];
      shuffle(this.deck);
      return true;
    }

    draw(n) {
      const cards = [];
      while (n-- > 0) {
        this.refillIfNeeded();
        if (!this.deck.length) break;
        const c = this.deck.pop();
        this.hand.push(c);
        cards.push(c);
      }
      return cards;
    }

    drawToLimit() {
      return this.draw(Math.max(0, this.handLimit - this.hand.length));
    }

    playFromHand(index) {
      if (index < 0 || index >= this.hand.length) return null;
      return this.hand.splice(index, 1)[0];
    }

    discardCard(card) {
      if (!card) return;
      if (card.isBlack || card.isWhite) delete card.chosenColor;
      this.discard.push(card);
    }

    discardFromHand(index) {
      const card = this.playFromHand(index);
      if (card) this.discardCard(card);
      return card;
    }

    isHandFull() { return this.hand.length >= this.handLimit; }

    summary() {
      return {
        owner: this.owner,
        deckCount: this.deck.length,
        handCount: this.hand.length,
        discardCount: this.discard.length,
        handLimit: this.handLimit,
        hand: this.hand.map(c => ({
          color: c.color,
          value: c.value,
          potion: c.potion,
          magic: c.magic,
          greenMagic: c.greenMagic,
          magicColor: c.magicColor || null,
          purify: c.purify,
          superPurify: c.superPurify,
          drawTwo: c.drawTwo,
          drawThree: c.drawThree,
          swapHand: c.swapHand,
          shuffleToDeck: c.shuffleToDeck,
          trophyWhite: !!c.trophyWhite,
          trophyName: c.trophyName || null,
          trophyEffect: c.trophyEffect || null,
          isBlack: c.isBlack,
          isWhite: c.isWhite,
          isNumberCard: c.isNumberCard,
          isItemCard: c.isItemCard,
          chosenColor: c.chosenColor || null
        }))
      };
    }
  }

  class DiscardTop {
    constructor(initialCard) {
      this.top = initialCard || null;
    }

    get() { return this.top; }

    replace(newCard) {
      const old = this.top;
      this.top = newCard;
      return old;
    }

    effectiveColor() {
      if (!this.top) return null;
      return this.top.chosenColor || this.top.color;
    }

    legal(card, def = false) {
      if (!this.top) return true;
      if (card.isItemCard) return true;
      if (def && card.isNumberCard && card.value > 3) return false;
      const tc = this.top.chosenColor || this.top.color;
      const cc = card.chosenColor || card.color;
      return card.isWhite || tc === cc || this.top.value === card.value;
    }
  }

  function drawInitialTop(deck) {
    let top = deck.pop();
    while (top && (top.isBlack || top.isWhite)) {
      deck.unshift(top);
      top = deck.pop();
    }
    return top;
  }

  window.AdventureDeck = {
    COLORS, num, item, trophyWhite, shuffle, clone,
    makePlayerDeck, makeNpcDeck,
    AdventurePile, DiscardTop,
    drawInitialTop
  };
})();

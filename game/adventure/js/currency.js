/**
 * 货币系统 AdventureCurrency
 * 金币：通用货币，无上限。
 * 兽元：5种——本兽元(ben)、草兽元(cao)、水兽元(shui)、火兽元(huo)、万能兽元(wuneng)。
 *   默认上限 8；持有「兽元袋」时上限 12。超过需舍弃（类似桌游璀璨宝石）。
 *
 * 兽元奖励8种等可能情况（普通房间完成后结算）：
 *   情况0：4种普通兽元各1个 → 玩家选2个
 *   情况1-6：2种普通兽元各2个 → 玩家选2个
 *   情况7：直接获得1个万能兽元
 */
(function () {
  const BEAST_TYPES = ['ben', 'cao', 'shui', 'huo'];
  const UNIVERSAL_TYPE = 'wuneng';
  const ALL_BEAST_TYPES = ['ben', 'cao', 'shui', 'huo', 'wuneng'];
  const DEFAULT_MAX_BEAST_TOKENS = 8;
  const BOOSTED_MAX_BEAST_TOKENS = 12;
  /** @deprecated 兼容旧引用：表示默认上限 */
  const MAX_BEAST_TOKENS = DEFAULT_MAX_BEAST_TOKENS;

  const BEAST_LABEL = {
    ben: '本兽元',
    cao: '草兽元',
    shui: '水兽元',
    huo: '火兽元',
    wuneng: '万能兽元'
  };

  const BEAST_GLYPH = {
    ben: '本',
    cao: '草',
    shui: '水',
    huo: '火',
    wuneng: '万'
  };

  const BEAST_ICON = {
    ben: '../icons/adventure_ui_icons/origin_beast_core.png',
    cao: '../icons/adventure_ui_icons/grass_beast_core.png',
    shui: '../icons/adventure_ui_icons/water_beast_core.png',
    huo: '../icons/adventure_ui_icons/fire_beast_core.png',
    wuneng: '../icons/adventure_ui_icons/versatile_beast_core.png'
  };

  const GOLD_ICON = '../icons/adventure_ui_icons/coin.png';

  const BEAST_COLOR = {
    ben: 'green',
    cao: 'lime',
    shui: 'blue',
    huo: 'red',
    wuneng: 'purple'
  };

  const TYPE_PAIRS = [
    ['ben', 'cao'], ['ben', 'shui'], ['ben', 'huo'],
    ['cao', 'shui'], ['cao', 'huo'], ['shui', 'huo']
  ];

  class AdventureCurrency {
    constructor() {
      this.gold = 0;
      this.tokens = { ben: 0, cao: 0, shui: 0, huo: 0, wuneng: 0 };
      this.maxBeast = DEFAULT_MAX_BEAST_TOKENS;
    }

    setMaxBeast(n) {
      const v = Number(n);
      if (Number.isFinite(v) && v > 0) this.maxBeast = v;
    }

    totalBeastTokens() {
      return this.tokens.ben + this.tokens.cao + this.tokens.shui + this.tokens.huo + this.tokens.wuneng;
    }

    addGold(n) {
      if (n > 0) this.gold += n;
    }

    spendGold(n) {
      if (this.gold < n) return false;
      this.gold -= n;
      return true;
    }

    addTokens(tokenMap) {
      for (const key in tokenMap) {
        if (ALL_BEAST_TYPES.indexOf(key) >= 0 && tokenMap[key] > 0) {
          this.tokens[key] += tokenMap[key];
        }
      }
    }

    removeTokens(tokenMap) {
      for (const key in tokenMap) {
        if (ALL_BEAST_TYPES.indexOf(key) >= 0 && tokenMap[key] > 0) {
          this.tokens[key] = Math.max(0, this.tokens[key] - tokenMap[key]);
        }
      }
    }

    removeOne(type) {
      if (ALL_BEAST_TYPES.indexOf(type) < 0) return false;
      if (this.tokens[type] <= 0) return false;
      this.tokens[type]--;
      return true;
    }

    /** needed: 普通兽元类型数组，如 ['ben','huo']；不足时可用万能兽元替代 */
    canPayBeastCost(needed) {
      const req = this._countBeastNeed(needed);
      if (!req) return false;
      let wild = this.tokens.wuneng || 0;
      for (let i = 0; i < BEAST_TYPES.length; i++) {
        const t = BEAST_TYPES[i];
        const need = req[t] || 0;
        const have = this.tokens[t] || 0;
        if (have >= need) continue;
        const short = need - have;
        if (wild < short) return false;
        wild -= short;
      }
      return true;
    }

    payBeastCost(needed) {
      if (!this.canPayBeastCost(needed)) return false;
      const req = this._countBeastNeed(needed);
      let wildUsed = 0;
      for (let i = 0; i < BEAST_TYPES.length; i++) {
        const t = BEAST_TYPES[i];
        const need = req[t] || 0;
        const use = Math.min(this.tokens[t] || 0, need);
        this.tokens[t] -= use;
        wildUsed += need - use;
      }
      this.tokens.wuneng -= wildUsed;
      return true;
    }

    _countBeastNeed(needed) {
      if (!Array.isArray(needed) || !needed.length) return null;
      const req = { ben: 0, cao: 0, shui: 0, huo: 0 };
      for (let i = 0; i < needed.length; i++) {
        const t = needed[i];
        if (BEAST_TYPES.indexOf(t) < 0) return null;
        req[t]++;
      }
      return req;
    }

    canAdd(count) {
      return this.totalBeastTokens() + count <= this.maxBeast;
    }

    overflowAfter(count) {
      return Math.max(0, this.totalBeastTokens() + count - this.maxBeast);
    }

    summary() {
      return {
        gold: this.gold,
        tokens: {
          ben: this.tokens.ben,
          cao: this.tokens.cao,
          shui: this.tokens.shui,
          huo: this.tokens.huo,
          wuneng: this.tokens.wuneng
        },
        totalBeast: this.totalBeastTokens(),
        maxBeast: this.maxBeast
      };
    }

    static rollBeastReward() {
      const r = Math.floor(Math.random() * 8);
      if (r === 7) {
        return { scenario: r, auto: true, offered: { wuneng: 1 }, pickCount: 0 };
      }
      if (r === 0) {
        return { scenario: r, auto: false, offered: { ben: 1, cao: 1, shui: 1, huo: 1 }, pickCount: 2 };
      }
      const pair = TYPE_PAIRS[r - 1];
      return {
        scenario: r, auto: false,
        offered: {}, pickCount: 2,
        offeredTypes: pair
      };
    }

    /** 奖励房开门：随机两个普通兽元（可相同，不含万能） */
    static rollDoorCost() {
      const a = BEAST_TYPES[Math.floor(Math.random() * BEAST_TYPES.length)];
      const b = BEAST_TYPES[Math.floor(Math.random() * BEAST_TYPES.length)];
      return [a, b];
    }

    static BEAST_TYPES = BEAST_TYPES;
    static UNIVERSAL_TYPE = UNIVERSAL_TYPE;
    static ALL_BEAST_TYPES = ALL_BEAST_TYPES;
    static DEFAULT_MAX_BEAST_TOKENS = DEFAULT_MAX_BEAST_TOKENS;
    static BOOSTED_MAX_BEAST_TOKENS = BOOSTED_MAX_BEAST_TOKENS;
    static MAX_BEAST_TOKENS = MAX_BEAST_TOKENS;
    static BEAST_LABEL = BEAST_LABEL;
    static BEAST_GLYPH = BEAST_GLYPH;
    static BEAST_COLOR = BEAST_COLOR;
    static BEAST_ICON = BEAST_ICON;
    static GOLD_ICON = GOLD_ICON;
    static TYPE_PAIRS = TYPE_PAIRS;
  }

  window.AdventureCurrency = AdventureCurrency;
})();
/**
 * 房间类 Room
 * 冒险模式地图上的一个单元格。房间类型：
 *   START      起点房间：玩家初始位置，安全无战斗
 *   NORMAL     普通房间：进入后先与怪物对战，胜利后获得奖励
 *   BOSS       Boss房间：需要战胜 Boss 才能通关
 *   ITEM       奖励房间：可直接获得奖励（无需战斗）
 *   SHOP       商店房间：通过货币购买物品
 *   BLACKSMITH 铁匠铺房间：支付金币开门后，用兽元交易配饰
 *   CHALLENGE  挑战房间：1v2对战，胜利后获得挑战房奖励+兽元全选
 * 另有 EMPTY 表示地图外空房间（不可进入）。
 *
 * CSV 编码：-1=地图外 0=起点 1=普通 2=boss 3=奖励 4=商店 5=铁匠铺 6=挑战
 * 奖励房（3）与铁匠铺（5）应放在支路，不在起点→Boss 最短路径上；
 * 奖励房进入需消耗两个随机普通兽元开门（万能可替代）。
 * 开门后可反复进入：每次无待领奖励时重新滚动，可领取或留在房间。
 */
(function () {
  const RoomType = {
    EMPTY:  'empty',
    START:  'start',
    NORMAL: 'normal',
    BOSS:   'boss',
    ITEM:   'item',
    SHOP:   'shop',
    BLACKSMITH: 'blacksmith',
    CHALLENGE: 'challenge'
  };

  const CODE_TO_TYPE = {
    '-1': RoomType.EMPTY,
    0: RoomType.START,
    1: RoomType.NORMAL,
    2: RoomType.BOSS,
    3: RoomType.ITEM,
    4: RoomType.SHOP,
    5: RoomType.BLACKSMITH,
    6: RoomType.CHALLENGE
  };

  const TYPE_TO_CODE = {};
  Object.keys(CODE_TO_TYPE).forEach(k => { TYPE_TO_CODE[CODE_TO_TYPE[k]] = Number(k); });

  const TYPE_LABEL = {
    empty:  '空',
    start:  '起点',
    normal: '普通',
    boss:   'Boss',
    item:   '奖励',
    shop:   '商店',
    blacksmith: '铁匠铺',
    challenge: '挑战'
  };

  class Room {
    constructor(row, col, type, opts = {}) {
      this.row = row;
      this.col = col;
      this.type = type || RoomType.EMPTY;
      this.visited = false;
      this.cleared = false;
      this.rewardClaimed = false;
      this.beastTokenClaimed = false;
      this.locked = !!opts.locked;
      /** 战斗基础奖励 / 奖励房奖励留在房间待领 */
      this.stashedLoot = null;

      this.monsterName = opts.monsterName || null;
      this.bossName = opts.bossName || null;
      this.reward = opts.reward || null;
      /** 商店 5 槽：itemName / beast 对象 / null（空槽） */
      this.shopSlots = opts.shopSlots || null;
      /** 铁匠铺 3 槽：配饰 itemName 或 null（空槽） */
      this.blacksmithSlots = opts.blacksmithSlots || null;
      /** 铁匠铺独立战利白卡摊位：战利白卡 itemName 或 null（空槽） */
      // Leave an omitted slot undefined so AdventureEngine can lazily stock the
      // default trophy offer; an explicit null means the stall is sold out.
      this.blacksmithTrophySlot = opts.blacksmithTrophySlot;
      this.shopItems = opts.shopItems || null;
      this.shopSold = {};

      /** 奖励房开门所需兽元（两个普通兽元类型，可相同；不含万能） */
      this.doorCost = Array.isArray(opts.doorCost) ? opts.doorCost.slice(0, 2) : null;
      this.doorUnlocked = !!opts.doorUnlocked;

      this._meta = opts.meta || {};
    }

    isEnterable() {
      return this.type !== RoomType.EMPTY && !this.locked;
    }

    isCombatRoom() {
      return this.type === RoomType.NORMAL || this.type === RoomType.BOSS || this.type === RoomType.CHALLENGE;
    }

    isClearable() {
      return this.type === RoomType.ITEM || this.type === RoomType.SHOP || this.type === RoomType.BLACKSMITH
        || (this.isCombatRoom() && this.cleared);
    }

    label() {
      return TYPE_LABEL[this.type] || '?';
    }

    code() {
      return TYPE_TO_CODE[this.type];
    }

    static fromCode(row, col, code, opts) {
      const type = CODE_TO_TYPE[code] || RoomType.EMPTY;
      return new Room(row, col, type, opts);
    }

    static RoomType = RoomType;
    static CODE_TO_TYPE = CODE_TO_TYPE;
    static TYPE_TO_CODE = TYPE_TO_CODE;
    static TYPE_LABEL = TYPE_LABEL;
  }

  window.Room = Room;
  window.RoomType = RoomType;
})();

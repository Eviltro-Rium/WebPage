/**
 * 地图类 AdventureMap
 * 冒险模式的一层地图，视为一个表格（二维网格），每个单元格是一个 Room。
 *
 *   - 支持从二维数字数组或 CSV 文本构建。
 *   - 编码：-1=地图外 0=起点 1=普通 2=boss 3=道具 4=商店（详见 room.js）。
 *   - 提供相邻房间查询、可进入判定、访问/清除标记。
 *   - 起点为 START 类型房间（编码 0），终点为 boss 房间（可显式指定）。
 *
 * 房间可选附加配置 roomOpts：{ "r,c": { monsterName, bossName, reward, shopItems, locked, meta } }
 */
(function () {
  const T = window.RoomType;

  class AdventureMap {
    constructor(grid, roomOpts = {}) {
      this.rows = 0;
      this.cols = 0;
      this.grid = [];
      this.start = null;
      this.exit = null;
      this._build(grid, roomOpts);
    }

    _build(grid, roomOpts) {
      this.rows = grid.length;
      this.cols = this.rows ? Math.max(...grid.map(r => r.length)) : 0;
      for (let r = 0; r < this.rows; r++) {
        const row = [];
        for (let c = 0; c < this.cols; c++) {
          const code = grid[r][c] != null ? grid[r][c] : 0;
          const key = r + ',' + c;
          const opts = roomOpts[key] || {};
          row.push(window.Room.fromCode(r, c, code, opts));
        }
        this.grid.push(row);
      }
      this._detectStart();
      this._detectExit();
    }

    _detectStart() {
      for (let r = 0; r < this.rows; r++) {
        for (let c = 0; c < this.cols; c++) {
          if (this.grid[r][c].type === T.START) { this.start = { r, c }; return; }
        }
      }
      for (let r = 0; r < this.rows; r++) {
        for (let c = 0; c < this.cols; c++) {
          if (this.grid[r][c].isEnterable()) { this.start = { r, c }; return; }
        }
      }
    }

    _detectExit() {
      for (let r = 0; r < this.rows; r++) {
        for (let c = 0; c < this.cols; c++) {
          if (this.grid[r][c].type === T.BOSS) { this.exit = { r, c }; return; }
        }
      }
    }

    get(r, c) {
      if (r < 0 || r >= this.rows || c < 0 || c >= this.cols) return null;
      return this.grid[r][c];
    }

    neighbors(r, c) {
      const list = [];
      const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];
      for (const [dr, dc] of dirs) {
        const room = this.get(r + dr, c + dc);
        if (room && room.isEnterable()) list.push({ r: r + dr, c: c + dc, room });
      }
      return list;
    }

    reachableFromStart() {
      if (!this.start) return [];
      const seen = new Set();
      const result = [];
      const queue = [this.start];
      seen.add(this.start.r + ',' + this.start.c);
      while (queue.length) {
        const { r, c } = queue.shift();
        result.push({ r, c, room: this.grid[r][c] });
        for (const n of this.neighbors(r, c)) {
          const k = n.r + ',' + n.c;
          if (!seen.has(k)) { seen.add(k); queue.push({ r: n.r, c: n.c }); }
        }
      }
      return result;
    }

    isCleared() {
      if (this.exit) return this.grid[this.exit.r][this.exit.c].cleared;
      return this.reachableFromStart().every(({ room }) => !room.isCombatRoom() || room.cleared);
    }

    summary() {
      const counts = { empty: 0, start: 0, normal: 0, boss: 0, item: 0, shop: 0 };
      for (let r = 0; r < this.rows; r++) {
        for (let c = 0; c < this.cols; c++) {
          counts[this.grid[r][c].type]++;
        }
      }
      return { rows: this.rows, cols: this.cols, start: this.start, exit: this.exit, counts: counts };
    }

    static fromGrid(grid, roomOpts) {
      return new AdventureMap(grid, roomOpts);
    }

    static fromCsvText(text, roomOpts) {
      const grid = window.CsvLoader.parse(text);
      return new AdventureMap(grid, roomOpts);
    }

    static async fromCsvUrl(url, roomOpts) {
      const grid = await window.CsvLoader.loadUrl(url);
      return new AdventureMap(grid, roomOpts);
    }
  }

  window.AdventureMap = AdventureMap;
})();
/**
 * CSV 加载器
 * 解析 CSV 文本为二维数字数组。支持逗号分隔，忽略空行与 # 开头的注释行。
 * 仅处理纯数字地图编码（-1~4），不处理引号/转义等复杂 CSV 场景。
 * 空单元格或非数字一律视为 -1（地图外）。
 */
(function () {
  const CsvLoader = {
    parse(text) {
      const rows = [];
      const lines = text.split(/\r?\n/);
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line || line.startsWith('#')) continue;
        const cells = line.split(',');
        const row = [];
        for (let j = 0; j < cells.length; j++) {
          const raw = cells[j].trim();
          if (raw === '') { row.push(-1); continue; }
          const n = Number(raw);
          row.push(Number.isFinite(n) ? n : -1);
        }
        if (row.length) rows.push(row);
      }
      return rows;
    },

    async loadUrl(url) {
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) throw new Error('CSV 加载失败: ' + url + ' (' + res.status + ')');
      const text = await res.text();
      return this.parse(text);
    },

    stringify(grid) {
      return grid.map(row => row.join(',')).join('\n');
    }
  };

  window.CsvLoader = CsvLoader;
})();
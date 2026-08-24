#!/usr/bin/env node
/**
 * 从 maps/*.csv 重新生成 map_data.js
 * 用法: node game/adventure/regen_maps.js
 */
const fs = require('fs');
const path = require('path');

const mapsDir = path.join(__dirname, 'maps');
const outFile = path.join(__dirname, 'js', 'map_data.js');

const files = fs.readdirSync(mapsDir).filter(f => f.endsWith('.csv')).sort();
const entries = [];

for (const file of files) {
  const name = file.replace(/\.csv$/, '');
  let content = fs.readFileSync(path.join(mapsDir, file), 'utf8');
  content = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const escaped = content.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n');
  entries.push(`  '${name}': '${escaped}'`);
}

const js = `/**
 * 内嵌地图数据（从 maps/*.csv 生成，支持 file:// 协议）。
 * 重新生成: node game/adventure/regen_maps.js
 */
window.AdventureMapData = {
${entries.join(',\n')}
};
`;

fs.writeFileSync(outFile, js);
console.log(`已生成 ${outFile}（${files.length} 个地图）`);
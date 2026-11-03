#!/usr/bin/env node
/* 离线生成地图；固定种子保证相同配置不会因重新生成而改变布局。 */
const fs = require('node:fs');
const path = require('node:path');

const scenes = ['castle', 'forest', 'ocean', 'desert', 'volcano'];
const directions = [[-1, 0], [1, 0], [0, -1], [0, 1]];
const key = (r, c) => r + ',' + c;

function seededRandom(seed) {
  let state = 2166136261;
  for (const char of seed) state = Math.imul(state ^ char.charCodeAt(0), 16777619);
  return () => {
    state ^= state << 13; state ^= state >>> 17; state ^= state << 5;
    return (state >>> 0) / 4294967296;
  };
}

function shuffle(values, random) {
  const result = values.slice();
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function generateMap(stage, scene, variant) {
  if (![1, 2, 3, 4].includes(stage) || !scenes.includes(scene) || ![1, 2, 3].includes(variant)) {
    throw new Error('无效地图配置');
  }
  const late = stage >= 3;
  const normalCount = (late ? 4 : 3) + (stage + scenes.indexOf(scene) + variant) % 3;
  const random = seededRandom('branch-layout-v2:' + stage + ':' + scene + ':' + variant);
  const sideNormals = Math.min(normalCount - 2, 1 + (stage + variant) % 2);
  const sideElites = late ? (variant === 2 ? 2 : 1) : 0;
  const routeRooms = [1, ...shuffle([
    ...Array(normalCount - sideNormals - 1).fill(1), ...Array(late ? 2 : 1).fill(7),
    ...Array(late ? 2 - sideElites : 0).fill(8)
  ], random)];
  const routeCodes = [0, ...routeRooms, 2, 10];
  const branches = shuffle([[3], [5], [4], [6]], random);
  // 将部分战斗房放到功能房前，形成值得探索、也可以放弃的战斗支路。
  shuffle([...Array(sideNormals).fill(1), ...Array(sideElites).fill(8)], random)
    .forEach((code, index) => branches[index].unshift(code));
  branches.sort((a, b) => b.length - a.length);

  for (let attempt = 0; attempt < 4096; attempt++) {
    const rows = (late ? 6 : 5) + Math.floor(random() * 2);
    const cols = (late ? 6 : 5) + Math.floor(random() * 3);
    const cells = new Map();
    const route = [[Math.floor(random() * rows), 0]];
    cells.set(key(...route[0]), 0);
    const neighbors = (r, c) => directions.map(([dr, dc]) => [r + dr, c + dc]);
    // 每个新格只能接触一个已用格，避免相邻格意外连通支路或绕过 Boss。
    const canAttach = (r, c) => r >= 0 && r < rows && c >= 0 && c < cols &&
      !cells.has(key(r, c)) && neighbors(r, c).filter(pos => cells.has(key(...pos))).length === 1;
    while (route.length < routeCodes.length) {
      const [r, c] = route[route.length - 1];
      const next = shuffle(neighbors(r, c).filter(pos => canAttach(...pos)), random)[0];
      if (!next) break;
      cells.set(key(...next), routeCodes[route.length]);
      route.push(next);
    }
    if (route.length !== routeCodes.length) continue;

    const attachBranch = (parent, codes, index = 0) => {
      if (index === codes.length) return true;
      for (const next of shuffle(neighbors(...parent), random)) {
        if (!canAttach(...next)) continue;
        cells.set(key(...next), codes[index]);
        if (attachBranch(next, codes, index + 1)) return true;
        cells.delete(key(...next));
      }
      return false;
    };
    let complete = true;
    for (const codes of branches) {
      // 优先从沿途房间分叉；不占用 Boss 与献祭房的相邻入口。
      const parents = [...shuffle(route.slice(1, -2), random), route[0]];
      if (!parents.some(parent => attachBranch(parent, codes))) { complete = false; break; }
    }
    if (!complete) continue;
    const points = [...cells.keys()].map(value => value.split(',').map(Number));
    const minR = Math.min(...points.map(pos => pos[0])), maxR = Math.max(...points.map(pos => pos[0]));
    const minC = Math.min(...points.map(pos => pos[1])), maxC = Math.max(...points.map(pos => pos[1]));
    return Array.from({ length: maxR - minR + 1 }, (_, r) =>
      Array.from({ length: maxC - minC + 1 }, (_, c) => cells.get(key(r + minR, c + minC)) ?? -1));
  }
  throw new Error('无法生成满足支路约束的地图：' + [stage, scene, variant].join('/'));
}

function generateAll() {
  const dir = path.join(__dirname, 'maps');
  const header = '# 编码：-1=地图外 0=起点 1=普通 2=boss 3=奖励 4=商店 5=铁匠铺 6=挑战 7=故障 8=精英 10=献祭\n';
  for (let stage = 1; stage <= 4; stage++) for (const scene of scenes) for (let variant = 1; variant <= 3; variant++) {
    const grid = generateMap(stage, scene, variant);
    const name = 'stage_' + String(stage).padStart(2, '0') + '_' + scene + '_' + variant + '.csv';
    fs.writeFileSync(path.join(dir, name), header + grid.map(row => row.join(',')).join('\n') + '\n');
  }
}

if (require.main === module) {
  generateAll();
  require('./regen_maps.js');
}
module.exports = { generateMap, generateAll };

#!/usr/bin/env node
/**
 * Move blacksmith rooms (5) off the start→boss shortest path, like reward rooms (3).
 * Usage: node game/adventure/fix_blacksmith_placement.js
 */
const fs = require('fs');
const path = require('path');

const mapsDir = path.join(__dirname, 'maps');
const DIRS = [[-1, 0], [1, 0], [0, -1], [0, 1]];

function parse(text) {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  const header = [];
  const grid = [];
  for (const line of lines) {
    if (!line.trim()) continue;
    if (line.trim().startsWith('#')) {
      header.push(line);
      continue;
    }
    grid.push(line.split(',').map(s => parseInt(s.trim(), 10)));
  }
  return { header, grid };
}

function serialize(header, grid) {
  return header.concat(grid.map(row => row.join(','))).join('\n') + '\n';
}

function bfsMainPath(grid) {
  let start = null;
  let boss = null;
  for (let r = 0; r < grid.length; r++) {
    for (let c = 0; c < grid[r].length; c++) {
      if (grid[r][c] === 0) start = { r, c };
      if (grid[r][c] === 2) boss = { r, c };
    }
  }
  if (!start || !boss) return null;

  const key = (r, c) => r + ',' + c;
  const q = [start];
  const prev = new Map();
  prev.set(key(start.r, start.c), null);

  while (q.length) {
    const cur = q.shift();
    if (cur.r === boss.r && cur.c === boss.c) {
      const path = [];
      let p = cur;
      while (p) {
        path.push(p);
        p = prev.get(key(p.r, p.c));
      }
      return path.reverse();
    }
    for (const [dr, dc] of DIRS) {
      const nr = cur.r + dr;
      const nc = cur.c + dc;
      if (nr < 0 || nc < 0 || nr >= grid.length || nc >= grid[0].length) continue;
      if (grid[nr][nc] === -1) continue;
      const k = key(nr, nc);
      if (prev.has(k)) continue;
      prev.set(k, cur);
      q.push({ r: nr, c: nc });
    }
  }
  return null;
}

function degree(grid, r, c) {
  let d = 0;
  for (const [dr, dc] of DIRS) {
    const nr = r + dr;
    const nc = c + dc;
    if (nr >= 0 && nc >= 0 && nr < grid.length && nc < grid[0].length && grid[nr][nc] !== -1) d++;
  }
  return d;
}

function relocateBlacksmith(grid, pathSet) {
  let moved = 0;
  for (let r = 0; r < grid.length; r++) {
    for (let c = 0; c < grid[r].length; c++) {
      if (grid[r][c] !== 5 || !pathSet.has(r + ',' + c)) continue;

      const candidates = [];
      for (let rr = 0; rr < grid.length; rr++) {
        for (let cc = 0; cc < grid[rr].length; cc++) {
          if (pathSet.has(rr + ',' + cc)) continue;
          const val = grid[rr][cc];
          if (val !== 1 && val !== 4) continue;
          const deg = degree(grid, rr, cc);
          const dist = Math.abs(rr - r) + Math.abs(cc - c);
          candidates.push({ r: rr, c: cc, val, deg, dist });
        }
      }

      candidates.sort((a, b) => {
        if (a.val !== b.val) return a.val - b.val;
        if (a.deg !== b.deg) return a.deg - b.deg;
        return a.dist - b.dist;
      });

      if (candidates.length) {
        const pick = candidates[0];
        grid[pick.r][pick.c] = 5;
        grid[r][c] = pick.val === 4 ? 4 : 1;
        moved++;
        continue;
      }

      const branch = [];
      for (let rr = 0; rr < grid.length; rr++) {
        for (let cc = 0; cc < grid[rr].length; cc++) {
          if (grid[rr][cc] !== -1) continue;
          let adjEnterable = 0;
          let adjOffPath = false;
          for (const [dr, dc] of DIRS) {
            const nr = rr + dr;
            const nc = cc + dc;
            if (nr < 0 || nc < 0 || nr >= grid.length || nc >= grid[0].length) continue;
            if (grid[nr][nc] === -1) continue;
            adjEnterable++;
            if (!pathSet.has(nr + ',' + nc)) adjOffPath = true;
          }
          if (adjEnterable === 1 && adjOffPath) {
            branch.push({ r: rr, c: cc, dist: Math.abs(rr - r) + Math.abs(cc - c) });
          }
        }
      }
      branch.sort((a, b) => a.dist - b.dist);
      if (!branch.length) {
        console.warn('Could not relocate blacksmith at', r + ',' + c);
        continue;
      }
      const pick = branch[0];
      grid[pick.r][pick.c] = 5;
      grid[r][c] = 1;
      moved++;
    }
  }
  return moved;
}

let totalMoved = 0;
for (const file of fs.readdirSync(mapsDir).filter(f => f.endsWith('.csv')).sort()) {
  const fp = path.join(mapsDir, file);
  const { header, grid } = parse(fs.readFileSync(fp, 'utf8'));
  const pathCells = bfsMainPath(grid);
  if (!pathCells) {
    console.warn('No path:', file);
    continue;
  }
  const pathSet = new Set(pathCells.map(p => p.r + ',' + p.c));
  const moved = relocateBlacksmith(grid, pathSet);
  if (moved > 0) {
    fs.writeFileSync(fp, serialize(header, grid));
    totalMoved += moved;
    console.log(file, 'relocated', moved);
  }
}

console.log('Total blacksmith relocations:', totalMoved);

'use strict';
const fs = require('node:fs');
const path = require('node:path');

const gameRoot = path.resolve(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(gameRoot, 'script_manifest.json'), 'utf8'));

function expand(groups) {
  const out = [];
  for (const key of groups) {
    const list = manifest[key];
    if (!list) throw new Error('Unknown manifest group: ' + key);
    out.push(...list);
  }
  return out;
}

function loadInto(context, groups) {
  const vm = require('node:vm');
  for (const relative of expand(groups)) {
    const file = path.join(gameRoot, relative);
    vm.runInContext(fs.readFileSync(file, 'utf8'), context, { filename: file });
  }
}

module.exports = { gameRoot, manifest, expand, loadInto };

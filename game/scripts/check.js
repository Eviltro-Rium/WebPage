#!/usr/bin/env node
'use strict';

/**
 * Unified browser-game verification entry point.
 *
 * Default:
 *   - verifies both HTML script graphs and the split UI composition;
 *   - parses every game JavaScript file with Node's syntax checker;
 *   - runs the stable protocol/event/adapter/UI/runtime test set, including
 *     the player/ai/ai2 × normal/bleed/poison/bomb event matrix and pile
 *     conservation/ownership checks.
 *
 * `node game/scripts/check.js --all` additionally runs every test file. The
 * latter is intentionally opt-in because some legacy adventure tests rely on
 * random loot and historical deck-size assertions.
 */
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const gameRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(gameRoot, '..');
const allTests = process.argv.includes('--all');

function walk(dir) {
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...walk(file));
    else if (entry.isFile() && file.endsWith('.js')) files.push(file);
  }
  return files.sort();
}

function run(label, args) {
  console.log(`\n== ${label} ==`);
  const result = spawnSync(process.execPath, args, {
    cwd: repoRoot,
    stdio: 'inherit'
  });
  if (result.error) {
    console.error(result.error.message);
    return 1;
  }
  return result.status === 0 ? 0 : (result.status || 1);
}

function checkSyntax(files) {
  for (const file of files) {
    const result = spawnSync(process.execPath, ['--check', file], {
      cwd: repoRoot,
      encoding: 'utf8'
    });
    if (result.status !== 0) {
      console.error(`\nFAIL syntax: ${path.relative(repoRoot, file)}`);
      if (result.stdout) process.stderr.write(result.stdout);
      if (result.stderr) process.stderr.write(result.stderr);
      return result.status || 1;
    }
  }
  console.log(`OK JavaScript syntax (${files.length} files)`);
  return 0;
}

let exitCode = 0;
const loadOrderStatus = run('HTML / UI module graph', [
  path.join(gameRoot, 'scripts', 'verify-load-order.js')
]);
if (loadOrderStatus !== 0) exitCode = loadOrderStatus;

const syntaxStatus = checkSyntax(walk(gameRoot));
if (syntaxStatus !== 0) exitCode = syntaxStatus;

const stableTests = [
  'combat-protocol.test.js',
  'combat-events.test.js',
  'turn-machine.test.js',
  'ai-strategy.test.js',
  'card-style.test.js',
  'ui-feedback.test.js',
  'fly-guard.test.js',
  'status-registry.test.js',
  'card-effects.test.js',
  'engine-modules.test.js',
  'runtime-invariants.test.js',
  'online-match.test.js',
  'signaling-room.test.js'
].map(file => path.join(gameRoot, 'tests', file));
const tests = allTests
  ? fs.readdirSync(path.join(gameRoot, 'tests'))
    .filter(file => file.endsWith('.test.js'))
    .sort()
    .map(file => path.join(gameRoot, 'tests', file))
  : stableTests;

const testLabel = allTests
  ? 'all test files'
  : 'stable protocol / event / adapter / UI tests';
const testStatus = run(testLabel, [
  '--test', '--test-concurrency=1', ...tests
]);
if (testStatus !== 0) exitCode = testStatus;

if (exitCode === 0) console.log(`\nCHECK OK${allTests ? ' (all tests)' : ''}`);
else console.error('\nCHECK FAILED');
process.exitCode = exitCode;

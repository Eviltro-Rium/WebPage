#!/usr/bin/env node
'use strict';
/**
 * Verify index.html / adventure.html script tags match script_manifest.json.
 * Run: node scripts/verify-load-order.js
 */
const fs = require('node:fs');
const path = require('node:path');

const gameRoot = path.resolve(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(gameRoot, 'script_manifest.json'), 'utf8'));

function scriptsFromHtml(htmlPath, rewrite) {
  const html = fs.readFileSync(htmlPath, 'utf8');
  const out = [];
  const re = /<script\s+src="([^"]+)"/g;
  let m;
  while ((m = re.exec(html))) out.push(rewrite(m[1]));
  return out;
}

function expand(keys) {
  return keys.flatMap(k => {
    if (!manifest[k]) throw new Error('missing group ' + k);
    return manifest[k];
  });
}

const indexExpected = expand(['characters', 'ai', 'combat']).concat([
  'js/ui/skills.js', 'js/ui/dialogs.js', 'js/ui/rules.js', 'js/ui/char_detail.js'
], manifest.index_extra_content, [
  'js/ui/adventure_codex.js', 'js/ui/card_style.js', 'js/ui/ui_core.js',
  'js/ui/render/particles.js', 'js/ui/render/home_screen.js', 'js/ui/render/combat_screen.js',
  'js/ui/render/status_render.js', 'js/ui/render/hand_render.js', 'js/ui/render/adventure_bar.js',
  'js/ui/render/zone_render.js',
  'js/ui/feedback.js', 'js/ui/renderer.js', 'js/ui/events.js', 'js/ui/controls.js',
  'js/ui/mode_1v2.js', 'js/ui/mode_lord.js'
]);

const adventureExpected = expand(['characters', 'ai', 'combat']).concat([
  'js/ui/skills.js', 'js/ui/dialogs.js', 'js/ui/card_style.js', 'js/ui/ui_core.js',
  'js/ui/render/particles.js', 'js/ui/render/home_screen.js', 'js/ui/render/combat_screen.js',
  'js/ui/render/status_render.js', 'js/ui/render/hand_render.js', 'js/ui/render/adventure_bar.js',
  'js/ui/render/zone_render.js',
  'js/ui/feedback.js', 'js/ui/renderer.js', 'js/ui/events.js', 'js/ui/controls.js',
  'js/ui/mode_1v2.js', 'js/ui/mode_lord.js'
], manifest.adventure_content, [
  'adventure/js/map/csv_loader.js',
  'adventure/js/map/map_data.js',
  'adventure/js/map/map.js',
  'adventure/js/deck/adventure_deck.js',
  'adventure/js/deck/npc_strategy.js',
  'adventure/js/engine/adventure_engine.js',
  'adventure/js/engine/shop.js',
  'adventure/js/engine/rewards.js',
  'adventure/js/engine/inventory.js',
  'adventure/js/engine/combat_legacy.js',
  'adventure/js/battle/battle_engine.js',
  'adventure/js/save/adventure_save.js',
  'adventure/js/ui/card_render.js',
  'adventure/js/battle/combat_bridge.js',
  'adventure/js/ui/adventure_ui.js'
]);

function diff(label, actual, expected) {
  const a = actual.join('\n');
  const e = expected.join('\n');
  if (a === e) {
    console.log('OK', label, `(${expected.length} scripts)`);
    return 0;
  }
  console.error('FAIL', label);
  for (let i = 0; i < Math.max(actual.length, expected.length); i++) {
    if (actual[i] !== expected[i]) {
      console.error(`  @${i}: actual=${actual[i]} expected=${expected[i]}`);
    }
  }
  return 1;
}

function verifyUiComposition(label, actual) {
  const required = [
    'js/ui/ui_core.js',
    'js/ui/render/particles.js',
    'js/ui/render/home_screen.js',
    'js/ui/render/combat_screen.js',
    'js/ui/render/status_render.js',
    'js/ui/render/hand_render.js',
    'js/ui/render/adventure_bar.js',
    'js/ui/render/zone_render.js',
    'js/ui/feedback.js',
    'js/ui/renderer.js',
    'js/ui/events.js',
    'js/ui/controls.js',
    'js/ui/mode_1v2.js',
    'js/ui/mode_lord.js'
  ];
  const stale = actual.includes('js/ui/ui.js');
  const positions = required.map(file => actual.indexOf(file));
  const missing = required.filter((file, index) => positions[index] < 0);
  const outOfOrder = positions.some((position, index) =>
    index > 0 && position <= positions[index - 1]
  );
  if (stale || missing.length || outOfOrder) {
    console.error('FAIL', label, 'UI composition');
    if (stale) console.error('  stale monolithic UI script is still loaded: js/ui/ui.js');
    if (missing.length) console.error('  missing UI modules:', missing.join(', '));
    if (outOfOrder) console.error('  ui_core.js must load before render/feedback/renderer/events/controls modules');
    return 1;
  }
  console.log('OK', label, 'UI composition (split core/render/feedback/events/controls/modes)');
  return 0;
}

let code = 0;
code |= diff(
  'index.html',
  scriptsFromHtml(path.join(gameRoot, 'index.html'), s => s),
  indexExpected
);
code |= diff(
  'adventure/adventure.html',
  scriptsFromHtml(path.join(gameRoot, 'adventure/adventure.html'), s => {
    if (s.startsWith('../')) return s.slice(3);
    if (s.startsWith('js/')) return 'adventure/' + s;
    return s;
  }),
  adventureExpected
);
code |= verifyUiComposition(
  'index.html',
  scriptsFromHtml(path.join(gameRoot, 'index.html'), s => s)
);
code |= verifyUiComposition(
  'adventure/adventure.html',
  scriptsFromHtml(path.join(gameRoot, 'adventure/adventure.html'), s => {
    if (s.startsWith('../')) return s.slice(3);
    if (s.startsWith('js/')) return 'adventure/' + s;
    return s;
  })
);
process.exit(code);

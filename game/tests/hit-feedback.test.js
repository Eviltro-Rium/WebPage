const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { JSDOM } = require('jsdom');
const root = path.resolve(__dirname, '..');

function setup(t) {
  const dom = new JSDOM('<body>' + ['player', 'ai', 'ai2'].map(side =>
    `<section id="${side}-hp-section"><img id="${side}-avatar"><div class="hp-bar-outer"><div id="${side}-hp-bar"></div></div></section>`).join('') + '</body>',
  { runScripts: 'outside-only', url: 'http://localhost/game/adventure/adventure.html' });
  t.after(() => dom.window.close());
  const w = dom.window, timers = [], images = [];
  w.setTimeout = fn => { timers.push(fn); return timers.length; };
  w.Image = class { constructor() { images.push(this); } };
  w.GameUI = function () {};
  w.gameAssetUrl = value => '/game/' + value;
  for (const file of ['adventure/js/content/registry.js',
    'adventure/js/content/stage_guide.js',
    ...['castle', 'forest', 'ocean', 'desert', 'volcano'].map(scene => `adventure/js/monsters/${scene}.js`),
    'js/ui/render/status_render.js', 'js/ui/feedback.js']) {
    w.eval(fs.readFileSync(path.join(root, file), 'utf8'));
  }
  const ui = new w.GameUI();
  ui.shakeScreen = () => {};
  ui.burstParticles = () => {};
  ui._updateAvatar('ai', 'ForestMonkey');
  ui._updateAvatar('ai2', 'CastleWolf');
  return { w, ui, timers, images, avatar: w.document.getElementById('ai-avatar') };
}

test('monster hit swaps the preloaded expression and restores it without disturbing another target', t => {
  const { w, ui, timers, images, avatar } = setup(t);
  const normal = avatar.src, other = w.document.getElementById('ai2-avatar');
  images[0].onload();
  ui._playHitFeedback('enemy', 4);
  assert.match(avatar.src, /forest_monkey_hit\.webp\?v=/);
  assert.ok(avatar.classList.contains('avatar-hit'));
  assert.ok(!other.classList.contains('avatar-hit'));
  ui._updateAvatar('ai', 'ForestMonkey');
  assert.match(avatar.src, /forest_monkey_hit\.webp/);
  timers.forEach(fn => fn());
  assert.equal(avatar.src, normal);
  assert.ok(!avatar.classList.contains('avatar-hit'));
  assert.ok(!w.document.getElementById('ai-hp-section').classList.contains('combatant-hit'));
});

test('an earlier hit timeout cannot end a later hit on the same avatar', t => {
  const { ui, timers, images, avatar } = setup(t);
  images[0].onload();
  ui._playAvatarHit('ai');
  ui._playAvatarHit('ai');
  timers[0]();
  assert.match(avatar.src, /forest_monkey_hit\.webp/);
  assert.ok(avatar.classList.contains('avatar-hit'));
  timers[1]();
  assert.match(avatar.src, /forest_monkey\.webp/);
  assert.ok(!avatar.classList.contains('avatar-hit'));
});

test('late texture loads never resurrect an expired expression', async t => {
  const { ui, timers, images, avatar } = setup(t);
  const normal = avatar.src;
  ui._playAvatarHit('ai');
  timers[0]();
  images[0].onload();
  await Promise.resolve();
  assert.equal(avatar.src, normal);
  assert.ok(!avatar.classList.contains('avatar-hit'));
});

test('changing a monster invalidates both a pending load and the old restore timer', async t => {
  const { ui, timers, images, avatar } = setup(t);
  ui._playAvatarHit('ai');
  ui._updateAvatar('ai', 'ForestDeer');
  const normal = avatar.src;
  images[0].onload();
  await Promise.resolve();
  timers[0]();
  assert.equal(avatar.src, normal);
  assert.match(normal, /forest_deer\.webp/);
  assert.ok(!avatar.classList.contains('avatar-hit'));
});

test('missing hit texture retains the normal portrait and zero damage has no hit effect', async t => {
  const { ui, timers, images, avatar } = setup(t);
  const normal = avatar.src;
  ui._playHitFeedback('ai', 0);
  assert.equal(timers.length, 0);
  assert.ok(!avatar.classList.contains('avatar-hit'));
  ui._playAvatarHit('ai');
  images[0].onerror();
  await Promise.resolve();
  assert.equal(avatar.src, normal);
  timers[0]();
  assert.equal(avatar.src, normal);
});

test('heroes use the same recoil without requesting a missing expression texture', t => {
  const { w, ui, timers, images } = setup(t);
  ui._updateAvatar('player', 'Ryan');
  const avatar = w.document.getElementById('player-avatar'), count = images.length;
  ui._playAvatarHit('player');
  assert.ok(avatar.classList.contains('avatar-hit'));
  assert.equal(images.length, count);
  timers[0]();
  assert.match(avatar.src, /avatars\/Ryan\.webp/);
});

test('every registered scene monster and boss has its hit texture', t => {
  const { w } = setup(t);
  const definitions = [...w.AdventureRegistry.allMonsters(), ...w.AdventureRegistry.allBosses()];
  assert.equal(definitions.length, 60);
  for (const def of definitions) {
    const texture = def.icon.replace(/^\.\.\//, '').replace(/\.webp(?:\?.*)?$/, '_hit.webp');
    assert.ok(fs.existsSync(path.join(root, texture)), def.name + ' hit texture');
  }
});

test('NPC passives sit below their own HP bar and survive repeated avatar updates', t => {
  const { w, ui } = setup(t);
  ui._updateAvatar('ai', 'ForestDeer');
  ui._updateAvatar('ai2', 'FrozenOceanSamoyed');
  const first = w.document.querySelector('#ai-hp-section .npc-passive');
  const second = w.document.querySelector('#ai2-hp-section .npc-passive');
  assert.match(first.textContent, /先手攻击/);
  assert.match(second.textContent, /免疫\[失温\]与\[冷冻\]/);
  assert.equal(first.previousElementSibling.className, 'hp-bar-outer');
  ui._updateAvatar('ai', 'ForestDeer');
  assert.equal(w.document.querySelector('#ai-hp-section .npc-passive'), first);
  assert.equal(w.document.querySelector('#ai2-hp-section .npc-passive'), second);
});

test('passive text follows the current stage and excludes loot and status encyclopedia notes', t => {
  const { w, ui } = setup(t);
  ui.state = { adventureStage: 2 };
  ui._updateAvatar('ai', 'DungeonGoblin');
  const passive = w.document.querySelector('#ai-hp-section .npc-passive');
  assert.match(passive.textContent, /金币/);
  assert.doesNotMatch(passive.textContent, /随机道具|\*\*/);
  ui.state.adventureStage = 3;
  ui._updateAvatar('ai', 'DungeonGoblin');
  assert.match(passive.textContent, /随机道具/);
  assert.doesNotMatch(passive.textContent, /金币/);
  ui._updateAvatar('ai', 'ForestMonkey');
  assert.equal(passive.hidden, true);
  ui._updateAvatar('ai', 'CastleChameleon');
  assert.equal(passive.hidden, true);
});

test('changing an NPC lane back to a hero removes its passive layout and keeps its health bar', t => {
  const { w, ui } = setup(t);
  ui._updateAvatar('ai', 'ForestDeer');
  const bar = w.document.getElementById('ai-hp-bar');
  ui._updateAvatar('ai', 'Ryan');
  const section = w.document.getElementById('ai-hp-section');
  assert.equal(w.document.getElementById('ai-hp-bar'), bar);
  assert.ok(!section.classList.contains('npc-hp-section'));
  assert.equal(section.querySelector('.npc-passive'), null);
});

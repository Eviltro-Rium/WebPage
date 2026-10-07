const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { JSDOM } = require('jsdom');
const root = path.resolve(__dirname, '..');

function setup() {
  const html = fs.readFileSync(path.join(__dirname, 'fixtures/settlement-preview.html'), 'utf8');
  const dom = new JSDOM(html, { runScripts: 'outside-only' });
  const w = dom.window;
  for (const file of ['js/ui/render/runtime.js', 'adventure/js/content/currency.js', 'adventure/js/battle/adventure_battle_controller.js']) {
    w.eval(fs.readFileSync(path.join(root, file), 'utf8'));
  }
  w.eval(w.document.getElementById('fixture-state').textContent);
  return { dom, w, document: w.document, engine: w.previewEngine };
}

function assertSingleCard(document) {
  const overlay = document.getElementById('adv-settle-overlay');
  assert.equal(overlay.querySelectorAll('.game-over-box').length, 1);
  const card = overlay.querySelector('.game-over-box');
  assert.ok(card.contains(overlay.querySelector('.adv-settle-box')));
  assert.ok(card.contains(overlay.querySelector('.adv-settle-sidebar')));
  assert.equal(card.querySelectorAll('h2').length, 1);
  assert.equal(card.querySelectorAll('.adv-sidebar-title').length, 1);
}

test('settlement rewards and inventory share a single card across all reward stages', () => {
  const { dom, w, document, engine } = setup();
  try {
    const P = w.AdventurePhase;
    const cases = [
      [P.BEAST_CHOICE, null],
      [P.COMBAT_SETTLE, { stage: 'basic', basic: { kind: 'gold', gold: 3 } }],
      [P.COMBAT_SETTLE, { stage: 'bonus', bonus: { kind: 'gold', gold: 2 } }],
      [P.COMBAT_SETTLE, { stage: 'boss-exit', roomType: 'boss' }],
      [P.COMBAT_SETTLE, { stage: 'beast', beast: { auto: true, offered: ['wuneng'] } }],
      [P.BEAST_DISCARD, null],
      [P.ITEM_DISCARD, null]
    ];
    for (const [phase, pendingCombatReward] of cases) {
      Object.assign(engine.s, { phase, pendingCombatReward, pendingDiscard: 1, pendingItemDiscard: 1 });
      assert.equal(w.AdventureBattleController.resumeSettlement(engine), true);
      assertSingleCard(document);
      assert.match(document.querySelector('.adv-settle-sidebar').textContent, /金币 ×12/);
      assert.match(document.querySelector('.adv-settle-sidebar').textContent, /闪避/);
    }
  } finally { dom.window.close(); }
});

test('beast selection rerenders one card and keeps claim enabled only at the pick limit', () => {
  const { dom, document } = setup();
  try {
    assert.equal(document.getElementById('adv-settle-claim').disabled, true);
    document.querySelector('[data-beast-slot="1"]').click();
    document.querySelector('[data-beast-slot="3"]').click();
    assertSingleCard(document);
    assert.equal(document.querySelectorAll('.adv-beast-cell.selected').length, 2);
    assert.equal(document.getElementById('adv-settle-claim').disabled, false);
    document.getElementById('adv-settle-claim').click();
    assert.equal(document.getElementById('preview-result').textContent, '领取完成');
  } finally { dom.window.close(); }
});

test('settlement uses shrinkable grid columns with a shared scroll surface and narrow-screen stacking', () => {
  const css = fs.readFileSync(path.join(root, 'adventure/css/adventure.css'), 'utf8');
  assert.ok(/\.game-over-box\.adv-settle-wrapper[\s\S]*?overflow-y: auto/.test(css));
  assert.ok(/grid-template-columns: minmax\(0, 1fr\) minmax\(180px, 240px\)/.test(css));
  assert.ok(/@media \(max-width: 700px\)[\s\S]*?\.adv-settle-content \{ grid-template-columns: minmax\(0, 1fr\)/.test(css));
  const sidebar = css.match(/\.adv-settle-sidebar \{([^}]+)\}/)[1];
  assert.doesNotMatch(sidebar, /background:|box-shadow:|border-radius:|backdrop-filter:|overflow-y:/);
});


test('final victory restores one settlement card with only a return-home action', () => {
 const {dom,w,document,engine}=setup();
 try {
  let clearedSessions=0;
  w.AdventureBattleSession={clear:()=>clearedSessions++};
  Object.assign(engine.s,{phase:w.AdventurePhase.CLEAR,stage:4});
  assert.equal(w.AdventureBattleController.resumeSettlement(engine),true);
  assertSingleCard(document);
  assert.equal(document.querySelector('.adv-settle-wrapper h2').textContent,'冒险胜利!');
  const buttons=[...document.querySelectorAll('.adv-settle-wrapper button')];
  assert.equal(buttons.length,1);assert.equal(buttons[0].textContent,'返回游戏主页');
  assert.equal(document.getElementById('adv-settle-next'),null);
  assert.equal(document.getElementById('adv-settle-map'),null);
  assert.equal(clearedSessions,1,'stale combat session is cleared during victory recovery');
  engine.s.stage=3;
  assert.equal(w.AdventureBattleController.resumeSettlement(engine),false,'intermediate clear is not a final victory');
 } finally {dom.window.close();}
});


test('adv-settle-next selects the next stage map instead of returning to the current map', async () => {
  const { dom, w, document, engine } = setup();
  try {
    const P = w.AdventurePhase;
    let chosen = null;
    w.AdventureSave = { save: () => true, isSafePhase: () => true };
    w.AdventureBattleSession = { clear: () => {} };
    w.AdventureUI = { selectStageMap: stage => ({ stage, scene: 'castle', mapName: 'stage_0' + stage + '_castle_1', mapUrl: 'maps/stage_0' + stage + '_castle_1.csv' }) };
    w.AdventureMapData = { 'stage_02_castle_1': 'r,c\n0,0' };
    w.AdventureMap = {
      fromCsvText: () => ({ start: { r: 0, c: 0 }, get: () => null }),
      fromCsvUrl: () => Promise.reject(new Error('inline map data should be used'))
    };
    Object.assign(engine.s, {
      phase: P.COMBAT_SETTLE,
      stage: 1,
      pendingCombatReward: { stage: 'basic', basic: { kind: 'gold', gold: 3 }, roomType: 'boss', applied: false }
    });
    engine.currentRoom = () => ({ type: 'boss', cleared: true });
    engine.deferCombatReward = () => true;
    engine.enterNextStage = () => { engine.s.phase = P.CLEAR; };
    engine.continueTo = (map, opts = {}) => {
      chosen = { stage: opts.stage, scene: opts.scene, mapName: opts.mapName };
      engine.s.stage = opts.stage;
      engine.s.phase = P.MAP;
      return engine.s;
    };
    assert.equal(w.AdventureBattleController.resumeSettlement(engine), true);
    const nextBtn = document.getElementById('adv-settle-next');
    assert.ok(nextBtn, 'boss basic settle shows the enter-next-stage button');
    nextBtn.click();
    await new Promise(r => setTimeout(r, 0));
    assert.ok(chosen, 'next stage map was selected via continueTo');
    assert.equal(chosen.stage, 2);
    assert.equal(engine.s.stage, 2, 'stage advanced to 2');
    assert.equal(engine.s.phase, P.MAP, 'phase becomes MAP instead of staying CLEAR');
    assert.equal(document.getElementById('adv-settle-overlay'), null, 'settlement overlay closed');
  } finally { dom.window.close(); }
});

test('repeated beast clicks retain live icons and do not multiply listeners', () => {
 const {dom,w,document,engine}=setup();
 try {
  const overlay=document.getElementById('adv-settle-overlay');
  const images=[...overlay.querySelectorAll('.adv-beast-cell img, .adv-settle-sidebar img')];
  const buttons=[...overlay.querySelectorAll('[data-beast-slot]')];
  const observer=new w.MutationObserver(()=>{});observer.observe(overlay,{subtree:true,childList:true,attributes:true,attributeFilter:['src']});
  let toggles=0;const original=engine.toggleBeastSlot;
  engine.toggleBeastSlot=function(index){toggles++;original.call(this,index);};
  for(let i=0;i<40;i++)buttons[i%4].click();
  assert.equal(toggles,40,'one click invokes exactly one selection');
  assert.deepEqual([...overlay.querySelectorAll('.adv-beast-cell img, .adv-settle-sidebar img')],images);
  assert.deepEqual([...overlay.querySelectorAll('[data-beast-slot]')],buttons);
  for(const record of observer.takeRecords()) {
   if(record.type==='attributes')assert.ok(!images.includes(record.target),'src must not be assigned again');
   for(const removed of record.removedNodes)for(const image of images) {
    assert.ok(removed!==image&&!(removed.contains&&removed.contains(image)),'existing icon stays connected during the whole update');
   }
  }
  observer.disconnect();
 } finally {dom.window.close();}
});

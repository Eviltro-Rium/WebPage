const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {JSDOM} = require('jsdom');
const root = path.resolve(__dirname, '..');

function setup(t, mode = 'remote') {
  const dom = new JSDOM('<body><div class="reveal-zone"><div id="reveal-cards">原判定内容</div></div></body>', {runScripts:'outside-only'});
  t.after(() => dom.window.close());
  const w = dom.window, tasks = [], calls = [];
  w.GameUI = function() {};
  let random = 0;
  w.FurryGame = {CombatRuntime:{wait:async()=>{},schedule:(_owner,fn)=>tasks.push(fn),random:()=>((random++ % 11) + .5) / 12}};
  w.AdventureLoot = {getDropTable:()=>[]};
  for (const file of ['js/ui/events.js','js/ui/feedback.js','js/ui/render/zone_render.js']) w.eval(fs.readFileSync(path.join(root,file),'utf8'));
  const ui = new w.GameUI();
  ui.state = {phase:'DICE_CHOICE', player:{hp:10}, events:[], pendingDiceControl:{
    purpose:'trophyDrop',mode,value:11,diceIndex:0,presentedThrough:5,
    presentation:{monsterName:'CastleWolf',rollIndex:2,rollCount:3,battleContinues:false}
  }};
  ui._apiAction = async (method,params) => {calls.push({method,params});return false;};
  return {ui,w,tasks,calls};
}

test('restored pending loot shows one settlement with its numeric result and remote controls, even without a judgment zone', async t => {
  const {ui,w,calls}=setup(t);
  w.document.querySelector('.reveal-zone').remove();
  ui._renderDiceControl();
  const overlay=w.document.getElementById('adv-settle-overlay');
  const control=w.document.getElementById('dice-control-dialog');
  assert.ok(overlay.contains(control));
  assert.equal(w.document.querySelectorAll('.dialog-overlay').length,0,'no second modal covers settlement');
  assert.equal(overlay.querySelector('.trophy-settle-die strong').textContent,'11');
  assert.match(overlay.querySelector('.trophy-settle-status').textContent,/第 2 \/ 3 次.*等待确认骰面/);
  assert.equal(overlay.querySelector('.trophy-settle-actions').hidden,true);
  assert.equal(control.querySelectorAll('[data-face]').length,12);
  assert.equal(control.querySelector('[data-face="11"]').disabled,true);
  ui._renderDiceControl();assert.equal(w.document.getElementById('dice-control-dialog'),control);
  control.querySelector('[data-face="7"]').click();
  control.querySelector('[data-face="8"]').click();
  await Promise.resolve();
  assert.equal(calls.length,1);assert.equal(calls[0].params.value,7);
});

test('magician adjustments stay in settlement, respect HP and face bounds, and permit retry after a rejected action', async t => {
  const {ui,w,calls}=setup(t,'magician');
  ui.state.pendingDiceControl.value=1;ui.state.player.hp=3;
  ui._renderDiceControl();
  let panel=w.document.getElementById('dice-control-dialog');
  assert.ok(panel.closest('.trophy-settle-sheet'));
  assert.equal(panel.querySelector('[data-adjust="-1"]').disabled,true);
  assert.equal(panel.querySelector('[data-adjust="1"]').disabled,true);
  panel.querySelector('[data-keep]').click();await Promise.resolve();
  assert.equal(calls[0].params.adjust,0);
  ui.state.player.hp=10;ui.state.pendingDiceControl.presentedThrough++;
  ui._renderDiceControl();panel=w.document.getElementById('dice-control-dialog');
  assert.equal(panel.querySelector('[data-adjust="-1"]').disabled,true);
  ui._isConsumingEvents=true;panel.querySelector('[data-adjust="1"]').click();
  assert.equal(calls.length,1,'early click during playback does not submit or latch the button');
  ui._isConsumingEvents=false;panel.querySelector('[data-adjust="1"]').click();await new Promise(resolve=>setImmediate(resolve));
  assert.equal(calls[1].params.adjust,1);
  assert.equal(panel.querySelector('[data-adjust="1"]').disabled,false);
});

test('D12 animation lands on the settlement surface without overwriting the judgment area', async t => {
  const {ui,w,tasks}=setup(t);
  ui._renderDiceControl();
  const target=w.document.querySelector('.trophy-settle-die');
  const animation=ui._playD12Animation(12,{target,fast:true});
  while(tasks.length)tasks.shift()();
  await animation;
  assert.equal(target.querySelector('.d12-die-face').textContent,'12');
  assert.equal(w.document.getElementById('reveal-cards').textContent,'原判定内容');
});

test('resolved loot replaces face editing with the final result and explicit reward confirmation', async t => {
  const {ui,w}=setup(t);
  ui._renderDiceControl();
  const overlay=w.document.getElementById('adv-settle-overlay');
  ui.state.pendingDiceControl=null;
  ui._showTrophySettlement({roll:7,drops:[]},true);
  ui._renderDiceControl();
  assert.equal(w.document.getElementById('adv-settle-overlay'),overlay);
  assert.equal(w.document.getElementById('dice-control-dialog'),null);
  assert.equal(overlay.querySelector('.trophy-settle-die strong').textContent,'7');
  const confirmation=ui._waitForTrophyConfirmation();
  overlay.querySelector('.trophy-settle-confirm').click();
  assert.equal(await confirmation,true);
});

test('changed dice faces update the result without replaying the tumble, including loot rolls',async t=>{
 for(const isLoot of [false,true]) {
  const {ui,w}=setup(t);let animations=0,landed;
  ui.state.pendingDiceControl=null;ui.state.phase='PLAYER_PLAY';
  ui._showZoneDesc=()=>{};ui._playD12Animation=async()=>{animations++;};
  ui._waitForTrophyConfirmation=async()=>true;
  ui._finishTrophySettlement=async()=>{landed=w.document.querySelector('.trophy-settle-die strong').textContent;};
  ui.showError=message=>assert.fail(message);
  await ui._playEvents([{type:'diceRoll',value:7,originalValue:11,controlled:true,...(isLoot?{purpose:'trophyDrop',drops:[]}:{} )}]);
  assert.equal(animations,0);
  assert.equal(isLoot?landed:w.document.querySelector('#reveal-cards strong').textContent,'7');
  await ui._playEvents([{type:'diceRoll',value:4}]);
  assert.equal(animations,1,'a genuine new roll still animates');
 }
});

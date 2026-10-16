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

test('defeat settlement clears the run before navigation and pagehide cannot save it again', async () => {
  const {dom,w,document,engine:adventure}=setup();
  dom.reconfigure({url:'https://example.test/game/adventure/'});
  let writes=0;
  try {
    document.getElementById('adv-settle-overlay')?.remove();
    for(const id of ['adventure-container','game-container','game-screen']){
      const node=document.createElement('div');node.id=id;document.body.appendChild(node);
    }
    w.localStorage.setItem('furryAdventureSave','old-map');
    w.localStorage.setItem('furryAdventureCombatSessionV1','old-battle');
    w.AdventureSave={save:()=>writes++,isSafePhase:()=>true,clear:()=>w.localStorage.removeItem('furryAdventureSave')};
    w.AdventureBattleSession={save:()=>writes++,load:()=>w.localStorage.getItem('furryAdventureCombatSessionV1'),clear:()=>w.localStorage.removeItem('furryAdventureCombatSessionV1')};
    w.Bridge={};w.AnimLayer=function(){};
    adventure.applyBattleResult=()=>{};
    adventure.onCombatEnd=()=>{
      adventure.s.phase=w.AdventurePhase.GAME_OVER;
      adventure.s.player={name:'Ryan',hp:0,alive:false};
    };
    w.AdventureBattleEngine=class {
      constructor(){this.s={phase:'GAME_OVER',player:{name:'Ryan',hp:0,alive:false}};this.events=[];this.later=()=>{};}
      state(){return {...this.s,events:this.events};}
      restoreSession(){return this.state();}
      finishAdventureBattle(){return {};}
      dispatch(){return this.state();}
    };
    w.GameUI=class {
      _initParticles(){}
      _buildGameScreen(){}
      _hideTooltip(){}
      _startPolling(){}
      updateDisplay(){this._showGameOver();}
    };
    await w.AdventureBattleController.startCombat('Ryan','CastleWolf',()=>{},{
      resumeBattle:{s:{}},adventureEngine:adventure
    });
    assert(document.getElementById('adv-settle-return'));
    assert.equal(w.localStorage.getItem('furryAdventureSave'),null);
    assert.equal(w.AdventureBattleController.loadCombatSession(),null);
    w.dispatchEvent(new w.Event('pagehide'));
    w.furryBattle.dispatch('noop');
    assert.equal(writes,0,'late persistence must not recreate the defeated checkpoint');
  } finally {dom.window.close();}
});

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


test('map return heal events flash LifeCore and the HP bar with separate floating labels', () => {
 const dom=new JSDOM('<div id="map"><div class="adv-hp-bar"></div><div class="adv-acc-col-slot" data-accessory-name="LifeCore"></div></div>',{runScripts:'outside-only'});
 const w=dom.window,tasks=[],listeners={};
 try {
  w.AdventurePhase={MAP:'ADVENTURE_MAP'};
  w.FurryGame={CombatRuntime:{random:()=>0,schedule:(owner,fn,ms)=>{tasks.push({fn,ms});}}};
  w.eval(fs.readFileSync(path.join(root,'adventure/js/ui/adventure_ui.js'),'utf8'));
  const ui=Object.create(w.AdventureUI.prototype);
  ui.container=w.document.getElementById('map');
  ui.eng={s:{phase:w.AdventurePhase.MAP},on:(type,fn)=>{listeners[type]=fn;}};
  ui._appendLog=()=>{};ui._bindEngine();
  listeners.accessory({type:'accessory',extra:{itemName:'LifeCore',amount:3}});
  listeners.stageHeal({type:'stageHeal',extra:{amount:10,stage:2}});
  assert.equal(ui._pendingMapHeals.length,2);
  ui._playPendingMapHeals();
  tasks.find(t=>t.ms===0).fn();
  assert.ok(ui.container.querySelector('[data-accessory-name="LifeCore"]').classList.contains('adv-accessory-trigger'));
  assert.ok(ui.container.querySelector('.adv-hp-bar').classList.contains('adv-hp-heal-flash'));
  assert.match(ui.container.querySelector('.adv-map-heal-float').textContent,/\+3/);
  const next=tasks.find(t=>t.ms===1600);assert.ok(next,'separate heals wait for the first float');
  next.fn();
  assert.equal(ui.container.querySelectorAll('.adv-map-heal-float').length,2);
  assert.match(ui.container.querySelectorAll('.adv-map-heal-float')[1].textContent,/\+10/);
  assert.equal(ui._pendingMapHeals.length,0);
 } finally {dom.window.close();}
});


test('map trophy acquisition reads the engine payload and plays a single short card animation', () => {
 const dom=new JSDOM('<div id="map"><button id="adv-trophy-pack"></button></div>',{runScripts:'outside-only'});
 const w=dom.window,tasks=[],listeners={};
 try {
  w.FurryGame={CombatRuntime:{random:()=>0,schedule:(owner,fn,ms)=>{tasks.push({fn,ms});}}};
  w.AdventureDeck={trophyWhite:name=>({trophyName:name})};
  w.renderCard=card=>{const node=w.document.createElement('div');node.dataset.trophy=card.trophyName;return node;};
  let animation;
  w.HTMLElement.prototype.animate=function(frames,options){animation={frames,options};return animation;};
  w.eval(fs.readFileSync(path.join(root,'adventure/js/ui/adventure_ui.js'),'utf8'));
  const ui=Object.create(w.AdventureUI.prototype);ui.container=w.document.getElementById('map');
  ui.eng={s:{},on:(type,fn)=>{listeners[type]=fn;}};ui._appendLog=()=>{};ui._bindEngine();
  listeners.itemAcquired({extra:{itemName:'GuardTrophy',kind:'trophyWhite'}});
  const pending=tasks.filter(t=>t.ms===60);assert.equal(pending.length,1);pending[0].fn();
  assert.equal(w.document.querySelectorAll('.adv-trophy-forge-fly').length,1);
  assert.equal(w.document.querySelector('.adv-trophy-forge-fly').dataset.trophy,'GuardTrophy');
  assert.ok(animation.options.duration<=700,'small animation');animation.onfinish();
  assert.equal(w.document.querySelector('.adv-trophy-forge-fly'),null);
  assert.ok(ui.container.querySelector('#adv-trophy-pack').classList.contains('adv-trophy-pack-bump'));
 } finally {dom.window.close();}
});
test('restored victory waits for pending or finish-generated loot before saving rewards', async () => {
 for (const queuedInitially of [true,false]) {
  const {dom,w,document,engine:adventure}=setup(),order=[];
  try {
   document.getElementById('adv-settle-overlay')?.remove();
   for(const id of ['adventure-container','game-container','game-screen']){
    const el=document.createElement('div');el.id=id;document.body.appendChild(el);
   }
   w.AnimLayer=function(){};
   w.Bridge={};
   w.AdventureBattleSession={save:active=>{if(active.events.length)order.push('checkpoint-loot');},clear:()=>{}};
   w.AdventureSave={save:()=>{},isSafePhase:()=>true};
   adventure.s.beastReward=null;adventure.s.pendingCombatReward={stage:'boss-exit',roomType:'boss',applied:true};
   adventure.applyBattleResult=()=>order.push('save-rewards');
   adventure.onCombatEnd=()=>{order.push('end');adventure.s.phase=w.AdventurePhase.COMBAT_SETTLE;};
   const loot=[{id:1,type:'diceRoll',purpose:'trophyDrop',value:1},{id:2,type:'trophyDrop',drops:['GuardTrophy']}];
   let finishCalls=0;
   w.AdventureBattleEngine=class {
    constructor(){this.s={phase:'GAME_OVER',player:{alive:true}};this.events=queuedInitially?loot.slice():[];this.later=()=>{};}
    state(){return {...this.s,events:this.events};}
    restoreSession(){return this.state();}
    finishAdventureBattle(){
     order.push('finish');finishCalls++;
     if(!queuedInitially&&finishCalls===1)this.events=loot.slice();
     return {playerPile:{hand:[]}};
    }
   };
   w.GameUI=class {
    _initParticles(){}
    _buildGameScreen(){}
    _hideTooltip(){}
    _startPolling(){}
    updateDisplay(){if(this.state.phase==='GAME_OVER')this._showGameOver();}
    async _consumeEvents(events){
     assert.equal(events.length,2);order.push('play-loot');
     const active=w.AdventureBattleController.activeEngine();active.events=[];
     // Acknowledged engine events can be empty while their visual playback
     // still runs; even a concurrent render must not settle at this point.
     this._eventPlaybackDepth=1;
     this._showGameOver();
     assert.equal(document.getElementById('adv-settle-overlay'),null);
     assert.ok(!order.includes('save-rewards'));
     await Promise.resolve();
     this._eventPlaybackDepth=0;
    }
   };
   await w.AdventureBattleController.startCombat('Ryan','CastleChameleon',()=>{},{
    resumeBattle:{s:{}},adventureEngine:adventure
   });
   assert.ok(order.indexOf('play-loot')<order.indexOf('save-rewards'));
   assert.ok(order.indexOf('checkpoint-loot')>=0 && order.indexOf('checkpoint-loot')<order.indexOf('play-loot'),
     'new loot is checkpointed before its animation so a refresh cannot reroll it');
   assert.equal(order.filter(x=>x==='save-rewards').length,1);
   assert.equal(order.filter(x=>x==='end').length,1);
   assert.ok(document.getElementById('adv-settle-overlay'),'settlement opens only after playback');
  } finally {dom.window.close();}
 }
});

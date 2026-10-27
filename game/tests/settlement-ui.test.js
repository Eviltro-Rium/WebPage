const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { JSDOM } = require('jsdom');
const root = path.resolve(__dirname, '..');

test('purify dialogs list cleanseable statuses and omit all permanent marks', () => {
  const dom=new JSDOM('<body></body>',{runScripts:'outside-only'}),w=dom.window;
  try {
    for(const file of ['js/combat/status_registry.js','js/combat/status_service.js','js/ui/dialogs.js'])
      w.eval(fs.readFileSync(path.join(root,file),'utf8')+(file.endsWith('dialogs.js')?'\nwindow.fixtureDialogs=new DialogManager();':''));
    const player={burn:2,magmaVein:2,bloodthirst:true,bindMark:true,tauntMark:true};
    w.fixtureDialogs.showSuperPurifyChoice([{key:'player',label:'自己',ch:player}],async()=>{});
    const body=w.document.getElementById('super-purify-choice-dialog').textContent;
    assert.match(body,/灼伤/);assert.match(body,/熔脉/);assert.doesNotMatch(body,/嗜血|捆缚|嘲弄/);
    w.fixtureDialogs.showPurifyChoice(player,async()=>{});
    const choice=w.document.getElementById('purify-choice-dialog').textContent;
    assert.match(choice,/灼伤/);assert.doesNotMatch(choice,/嗜血|捆缚|嘲弄/);
  } finally {w.close();}
});

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

test('loot sheet shows numeric conditions with card faces and becomes the reward sheet in place', () => {
  const {dom,w,document,engine}=setup();
  try {
    document.getElementById('adv-settle-overlay').remove();
    w.GameUI=class {};
    w.AdventureDeck={trophyWhite:name=>({trophyName:name})};
    w.renderCard=card=>{
      const face=document.createElement('canvas');face.dataset.trophy=card.trophyName;return face;
    };
    for(const file of ['adventure/js/engine/loot.js','js/ui/events.js']) w.eval(fs.readFileSync(path.join(root,file),'utf8'));
    const ui=new w.GameUI();
    const evt={monsterName:'FrozenMammoth',roll:4,drops:['GuardTrophy'],rollIndex:2,rollCount:3};
    const overlay=ui._showTrophySettlement(evt);
    assert.deepEqual([...overlay.querySelectorAll('.trophy-settle-condition')].map(el=>el.textContent),['1–3：','4–5：','6：','7–10：','11：','12：']);
    assert.equal(overlay.querySelectorAll('canvas').length,5);
    assert.equal(overlay.querySelectorAll('.trophy-loot-caption').length,0);
    assert.equal(overlay.querySelectorAll('.is-hit').length,0);
    assert.equal(ui._showTrophySettlement(evt,true),overlay);
    assert.match(overlay.querySelector('.trophy-settle-status').textContent,/第 2 \/ 3 次 · 投出 4 · 获得白卡/);
    assert.equal(overlay.querySelector('.is-hit canvas').dataset.trophy,'GuardTrophy');
    engine.s.phase=w.AdventurePhase.COMBAT_SETTLE;
    engine.s.pendingCombatReward={stage:'basic',basic:{kind:'gold',gold:3}};
    w.AdventureBattleController.resumeSettlement(engine);
    assert.equal(document.getElementById('adv-settle-overlay'),overlay);
    assert.equal(overlay.querySelector('.trophy-settle-rules'),null);
    assertSingleCard(document);
  } finally {dom.window.close();}
});

test('every monster table matches all actual rolls, including universal 11 and 12 drops', () => {
  const {dom,w}=setup();
  try {
    w.eval(fs.readFileSync(path.join(root,'adventure/js/engine/loot.js'),'utf8'));
    const loot=w.AdventureLoot;
    for(const [scene,monsters] of Object.entries(loot.SCENE_RULES)) {
      for(const name of Object.keys(monsters)) {
        const rows=loot.getDropTable(name);
        for(let face=1;face<=12;face++) {
          const matches=rows.filter(row=>face>=row.first&&face<=row.last);
          assert.equal(matches.length,1,name+' face '+face+' appears exactly once');
          assert.deepEqual([...matches[0].drops],[...loot.rollMonsterDrop(scene,name,null,face).drops]);
        }
        assert.deepEqual([...rows.find(row=>row.first===11).drops],['SmallPotionTrophy']);
        assert.deepEqual([...rows.find(row=>row.first===12).drops],['PurifyWaterTrophy']);
      }
    }
  } finally {dom.window.close();}
});

test('loot playback waits for an explicit click after every hit and miss before the next roll or victory', async () => {
  const {dom,w,document}=setup();
  try {
    document.getElementById('adv-settle-overlay').remove();
    w.GameUI=class {};
    w.AdventureDeck={trophyWhite:name=>({trophyName:name})};
    w.renderCard=card=>{const face=document.createElement('canvas');face.dataset.trophy=card.trophyName;return face;};
    w.FurryGame={CombatRuntime:{wait:async()=>{}}};
    for(const file of ['adventure/js/engine/loot.js','js/ui/events.js']) w.eval(fs.readFileSync(path.join(root,file),'utf8'));
    const ui=new w.GameUI(),sequence=[];
    ui.state={phase:'GAME_OVER'};
    ui._animationOrder=events=>events;
    ui._isDefenseJudgmentEvent=()=>false;
    ui._showZoneDesc=()=>{};
    ui._renderPlayerHand=()=>{};
    ui._playD12Animation=async value=>sequence.push('die:'+value);
    let finishFlight;
    ui._playTrophyDropAnimation=async names=>{
      sequence.push('gain:'+names[0]);
      if(names[0]==='SmallPotionTrophy') await new Promise(resolve=>{finishFlight=resolve;});
    };
    ui.playFloatingText=()=>sequence.push('victory');
    ui.showError=error=>assert.fail(error);
    const events=[];
    for(const [index,face,drops] of [[1,11,['SmallPotionTrophy']],[2,9,[]],[3,12,['PurifyWaterTrophy']]]) {
      const props={monsterName:'FrozenMammoth',rollIndex:index,rollCount:3,drops};
      events.push({id:index*2,type:'diceRoll',purpose:'trophyDrop',value:face,...props});
      events.push({id:index*2+1,type:'trophyDrop',roll:face,...props});
    }
    events.push({id:10,type:'gameOver'});
    const playback=ui._playEvents(events,true);
    const flush=()=>new Promise(resolve=>setImmediate(resolve));
    await flush();
    const firstButton=document.querySelector('.trophy-settle-confirm');
    assert.equal(firstButton.disabled,true,'confirmation is disabled during acquisition flight');
    firstButton.click();
    assert.deepEqual(sequence,['die:11','gain:SmallPotionTrophy']);
    finishFlight();await flush();
    assert.equal(firstButton.disabled,false);
    assert.equal(document.querySelector('.is-hit canvas').dataset.trophy,'SmallPotionTrophy');
    await flush();
    assert.deepEqual(sequence,['die:11','gain:SmallPotionTrophy'],'no timer automatically advances the result');
    firstButton.click();firstButton.click();await flush();
    assert.deepEqual(sequence,['die:11','gain:SmallPotionTrophy','die:9']);
    assert.match(document.querySelector('.trophy-settle-status').textContent,/无掉落/);
    await flush();
    assert.equal(sequence.length,3,'a miss also blocks the next roll');
    document.querySelector('.trophy-settle-confirm').click();await flush();
    assert.deepEqual(sequence,['die:11','gain:SmallPotionTrophy','die:9','die:12','gain:PurifyWaterTrophy']);
    assert.equal(document.querySelector('.is-hit canvas').dataset.trophy,'PurifyWaterTrophy');
    assert.equal(ui._eventPlaybackDepth,1,'settlement stays blocked while awaiting the last confirmation');
    document.querySelector('.trophy-settle-confirm').click();await playback;
    assert.equal(sequence.at(-1),'victory');
    assert.equal(ui._eventPlaybackDepth,0);
    assert.equal(ui._trophyConfirmation,null);
  } finally {dom.window.close();}
});

test('challenge loot closes and clears its die before subsequent battle feedback, for hits and misses', async () => {
  for(const drops of [[],['SmallPotionTrophy']]) {
    const {dom,w,document}=setup();
    try {
      document.getElementById('adv-settle-overlay').remove();
      const reveal=document.createElement('div');reveal.id='reveal-cards';document.body.appendChild(reveal);
      w.GameUI=class {};
      w.AdventureDeck={trophyWhite:name=>({trophyName:name})};
      w.renderCard=()=>document.createElement('canvas');
      w.FurryGame={CombatRuntime:{wait:async()=>{}}};
      for(const file of ['adventure/js/engine/loot.js','js/ui/events.js']) w.eval(fs.readFileSync(path.join(root,file),'utf8'));
      const ui=new w.GameUI();
      ui.state={phase:'AI_TURN',is1v2:true};
      ui._isDefenseJudgmentEvent=()=>false;ui._renderPlayerHand=()=>{};
      ui._playD12Animation=async()=>{reveal.textContent='D12';};
      ui._playTrophyDropAnimation=async()=>{};
      let resumed=false;
      ui._showZoneDesc=(id,text)=>{
        if(text==='继续战斗') {
          assert.equal(document.getElementById('adv-settle-overlay'),null,'sheet closes before normal feedback');
          assert.equal(reveal.textContent,'等待判定');resumed=true;
        }
      };
      ui.showError=error=>assert.fail(error);
      const props={monsterName:'FrozenOceanOctopus',battleContinues:true,drops};
      const playback=ui._playEvents([
        {id:1,type:'diceRoll',purpose:'trophyDrop',value:drops.length?11:9,...props},
        {id:2,type:'trophyDrop',roll:drops.length?11:9,...props},
        {id:3,type:'desc',desc:'继续战斗'}
      ],true);
      await new Promise(resolve=>setImmediate(resolve));
      assert.equal(resumed,false);
      assert.match(document.querySelector('h2').textContent,/击败敌人/);
      document.querySelector('.trophy-settle-confirm').click();await playback;
      assert.equal(resumed,true);assert.equal(ui.state.phase,'AI_TURN');
    } finally {dom.window.close();}
  }
});

test('controllable loot dice keep their result in settlement without a premature loot confirmation', async () => {
  const {dom,w,document}=setup();
  try {
    document.getElementById('adv-settle-overlay').remove();
    w.GameUI=class {};w.FurryGame={CombatRuntime:{wait:async()=>{}}};
    w.eval(fs.readFileSync(path.join(root,'js/ui/events.js'),'utf8'));
    const ui=new w.GameUI();ui.state={phase:'DICE_CHOICE',pendingDiceControl:{purpose:'trophyDrop'}};
    const previous=document.createElement('div');previous.id='adv-settle-overlay';previous.className='trophy-settle-overlay';document.body.appendChild(previous);
    ui._isDefenseJudgmentEvent=()=>false;ui._showZoneDesc=()=>{};
    ui._playD12Animation=async()=>{};
    let choices=0;ui._renderDiceControl=()=>choices++;
    ui._waitForTrophyConfirmation=()=>assert.fail('unresolved die must not ask for loot confirmation');
    await ui._playEvents([{id:1,type:'diceRoll',purpose:'trophyDrop',value:11,awaitControl:true}],true);
    assert.equal(choices,1);
    const overlay=document.getElementById('adv-settle-overlay');
    assert.equal(overlay.querySelector('.trophy-settle-die strong').textContent,'11');
    assert.equal(overlay.querySelector('.trophy-settle-actions').hidden,true);
  } finally {dom.window.close();}
});

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

test('settlement bounds the resource sidebar with independent scrolling and narrow-screen stacking', () => {
  const css = fs.readFileSync(path.join(root, 'adventure/css/adventure.css'), 'utf8');
  assert.ok(/\.game-over-box\.adv-settle-wrapper[\s\S]*?overflow-y: auto/.test(css));
  assert.ok(/grid-template-columns: minmax\(0, 1fr\) minmax\(180px, 240px\)/.test(css));
  assert.ok(/@media \(max-width: 700px\)[\s\S]*?\.adv-settle-content \{ grid-template-columns: minmax\(0, 1fr\)/.test(css));
  const sidebar = css.match(/\.adv-settle-sidebar \{([^}]+)\}/)[1];
  assert.match(sidebar, /height: 320px/);
  assert.match(sidebar, /overflow-y: auto/);
  assert.match(sidebar, /overscroll-behavior: contain/);
  assert.doesNotMatch(sidebar, /background:|box-shadow:|border-radius:|backdrop-filter:/);
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
  ui.eng={s:{phase:w.AdventurePhase.MAP,player:{hp:43,maxHp:70}},on:(type,fn)=>{listeners[type]=fn;}};
  ui._appendLog=()=>{};ui._bindEngine();
  ui._queueMapRecoveryFeedback([{itemName:'LifeCore',label:'生命核心',heal:3,hpBefore:30},
    {label:'进入新层',heal:10,hpBefore:33}]);
  assert.equal(ui._pendingMapHeals.length,2);
  ui._playPendingMapHeals();
  tasks.find(t=>t.ms===0).fn();
  assert.ok(ui.container.querySelector('[data-accessory-name="LifeCore"]').classList.contains('adv-accessory-trigger'));
  assert.ok(ui.container.querySelector('.adv-hp-bar').classList.contains('adv-hp-heal-flash'));
  assert.equal(ui.container.querySelector('.adv-map-heal-float').textContent,'[生命核心]❤️3');
  const next=tasks.find(t=>t.ms===140);assert.ok(next,'heal labels follow in a short shared transition');
  next.fn();
  assert.equal(ui.container.querySelectorAll('.adv-map-heal-float').length,2);
  assert.equal(ui.container.querySelectorAll('.adv-map-heal-float')[1].textContent,'[进入新层]❤️10');
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

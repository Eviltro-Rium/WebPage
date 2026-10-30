const assert=require('node:assert/strict'),test=require('node:test'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require('jsdom');
function setup(){const dom=new JSDOM('<body></body>',{runScripts:'outside-only'});dom.window.eval(fs.readFileSync(path.join(__dirname,'../js/ui/dialogs.js'),'utf8')+';window.testDialogs=new DialogManager();');return {dom,w:dom.window,dialogs:dom.window.testDialogs};}
test('rejected attack modifier restores the item and item cards cannot use GarbageRecycle',async()=>{
 const {dom,w}=setup();
 try{
  w.eval('window.GameUI=class {};');
  w.eval(fs.readFileSync(path.join(__dirname,'../js/ui/controls.js'),'utf8'));
  const inventory=[{name:'GarbageRecycle'}];
  const adv={s:{consumables:inventory},snapshot:()=>({consumables:inventory})};
  w.AdventureBattleController={activeEngine:()=>({_adventureEngine:adv})};
  w.AdventureRegistry={getItem:()=>({combatUse:'attackMod',attackModRecycle:true})};
  const ui=new w.GameUI();
  ui.state={phase:'ATTACK_MOD_CHOICE',pendingAttack:{damage:0},pendingAttackMod:{card:{isNumberCard:true,isItemCard:false}}};
  ui._attackModSelectedItem=0;ui._apiAction=async()=>false;ui.updateDisplay=()=>{};
  ui._confirmAttackMod();await new Promise(resolve=>setImmediate(resolve));
  assert.equal(inventory.length,1);assert.equal(inventory[0].name,'GarbageRecycle');
  ui.state.pendingAttackMod.card={isItemCard:true};
  assert.equal(ui._getAvailableAttackMods().length,0);
 }finally{dom.window.close();}
});

test('guard dialog uses bounded controls instead of one button per stack',async()=>{
 const {dom,w,dialogs}=setup();let payload;dialogs.showGuardOrFlyChoice({guard:100,fly:2},100,p=>{payload=p;});
 const box=w.document.querySelector('.dialog-box');assert.equal(box.querySelectorAll('button').length,3);const range=box.querySelector('input');assert.equal(range.max,'100');range.value='7';range.dispatchEvent(new w.Event('input'));assert.match(box.querySelector('.guard-damage-preview').textContent,/93/);
 box.querySelector('.choice-primary').click();await Promise.resolve();assert.equal(payload.action,'guard');assert.equal(payload.stacks,7);assert.equal(w.document.querySelector('.dialog-overlay'),null);dom.window.close();
});
test('fly retry retains guard and submit is idempotent',async()=>{
 const {dom,w,dialogs}=setup();let calls=0;dialogs.showFlyRetryChoice({guard:2,fly:0},4,()=>calls++);const button=w.document.querySelector('.choice-primary');button.click();button.click();await Promise.resolve();assert.equal(calls,1);dom.window.close();
});
test('no mitigation and flying choices keep the combat command shape',async()=>{
 for(const [ch,selector,action]of [[{},'.choice-secondary','none'],[{fly:1},'.choice-row','fly']]){
 const {dom,w,dialogs}=setup();let payload;dialogs.showGuardOrFlyChoice(ch,5,p=>{payload=p;});w.document.querySelector(selector).click();await Promise.resolve();assert.equal(payload.action,action);dom.window.close();}
});


test('offline game-over dialog removes replay and retains character selection', async () => {
 for (const is1v2 of [false, true]) {
  const {dom,w,dialogs}=setup();let calls=0;
  dialogs.showGameOver({player:{name:'Ryan',alive:true},ai:{name:'Leon',alive:false},ai2:{alive:false},is1v2},()=>calls++);
  const overlay=w.document.getElementById('game-over-overlay');
  assert.equal(overlay.querySelectorAll('button').length,1);
  assert.equal(overlay.querySelector('button').textContent,'重新选择');
  assert.doesNotMatch(overlay.textContent,/再来一局/);
  overlay.querySelector('button').click();await Promise.resolve();
  assert.equal(calls,1);assert.equal(w.document.getElementById('game-over-overlay'),null);
  dom.window.close();
 }
});

test('online game-over keeps return-to-room and home choices', async () => {
 for(const [id,expected] of [['btn-online-room-overlay','room'],['btn-back-select-overlay','home']]) {
  const {dom,w,dialogs}=setup();let action;
  dialogs.showGameOver({player:{name:'Ryan',alive:true},ai:{name:'Leon',alive:false},isOnline:true},value=>action=value);
  const overlay=w.document.getElementById('game-over-overlay');
  assert.equal(overlay.querySelectorAll('button').length,2);
  assert.doesNotMatch(overlay.textContent,/再来一局/);
  w.document.getElementById(id).click();await Promise.resolve();assert.equal(action,expected);
  dom.window.close();
 }
});

test('game-over control bar has no replay button and retains working exit choices', async () => {
 for(const isOnline of [false,true]) {
  const {dom,w}=setup();
  w.eval('window.GameUI=class {};');
  w.eval(fs.readFileSync(path.join(__dirname,'../js/ui/controls.js'),'utf8'));
  const controls=w.document.createElement('div');controls.id='controls';w.document.body.appendChild(controls);
  const ui=new w.GameUI();let exits=0,action;
  Object.assign(ui,{state:{phase:'GAME_OVER',isOnline,playerHand:[],selectedCard:-1},_updateUseItemButton(){},onBattleExit:()=>exits++,onGameOverClose:value=>action=value});
  ui._renderControls();
  assert.doesNotMatch(controls.textContent,/再来一局/);
  assert.equal(w.document.getElementById('btn-restart'),null);
  assert.equal(controls.querySelectorAll('button').length,isOnline?2:1);
  if(isOnline) { w.document.getElementById('btn-online-room').click();await Promise.resolve();assert.equal(action,'room'); }
  else { w.document.getElementById('btn-back-select').click();await Promise.resolve();assert.equal(exits,1); }
  dom.window.close();
 }
});

test('magma and crit share one dialog and submit one exclusive choice',async()=>{
 const {dom,w,dialogs}=setup();let calls=0,payload;
 const pending={damage:5,canMagma:true,canCrit:true,magmaPreviewDamage:8};
 dialogs.showAttackBuffChoice(pending,buff=>{calls++;payload=buff;return true;});dialogs.showAttackBuffChoice(pending,()=>{calls++;return true;});
 assert.equal(w.document.querySelectorAll('#attack-buff-choice-dialog').length,1);assert.equal(w.document.querySelectorAll('#attack-buff-choice-dialog button').length,3);
 const magma=w.document.querySelector('[data-attack-buff="magmaVein"]'),crit=w.document.querySelector('[data-attack-buff="crit"]');magma.click();crit.click();await Promise.resolve();assert.equal(calls,1);assert.equal(payload,'magmaVein');
 assert.equal(w.document.querySelector('#attack-buff-choice-dialog'),null);dom.window.close();
});

test('attack-buff dialog restores retry when choose early-returns false',async()=>{
 const {dom,w,dialogs}=setup();let calls=0;
 const pending={damage:5,canMagma:true,canCrit:false,magmaPreviewDamage:8};
 dialogs.showAttackBuffChoice(pending,()=>{calls++;return false;});
 const magma=w.document.querySelector('[data-attack-buff="magmaVein"]');
 magma.click();await Promise.resolve();
 assert.equal(calls,1);
 assert.ok(w.document.querySelector('#attack-buff-choice-dialog'),'overlay kept after blocked resolve');
 magma.click();await Promise.resolve();
 assert.equal(calls,2,'retry allowed after false');
 dialogs.syncCombatDialog('attackBuff',false,'ATTACK_BUFF_CHOICE');
 assert.equal(w.document.querySelector('#attack-buff-choice-dialog'),null);dom.window.close();
});

test('attack-buff dialog closes before async action finishes and cannot reopen in flight',async()=>{
 for(const kind of ['magmaVein','crit','none']) {
  const {dom,w,dialogs}=setup();let finish,calls=0;
  const pending={damage:5,canMagma:true,canCrit:true,magmaPreviewDamage:8};
  dialogs.showAttackBuffChoice(pending,()=>{calls++;return new Promise(resolve=>{finish=resolve;});});
  const buttons=[...w.document.querySelectorAll('#attack-buff-choice-dialog button')];
  buttons.find(button=>button.dataset.attackBuff===kind).click();
  assert.equal(w.document.getElementById('attack-buff-choice-dialog'),null,'closes synchronously');
  buttons.forEach(button=>button.click());
  dialogs.syncCombatDialog('attackBuff',true,'ATTACK_BUFF_CHOICE');
  dialogs.showAttackBuffChoice(pending,()=>{calls++;return true;});
  assert.equal(calls,1);
  assert.equal(w.document.getElementById('attack-buff-choice-dialog'),null,'stale snapshot cannot reopen');
  finish(true);await new Promise(resolve=>setImmediate(resolve));
  assert.equal(dialogs._attackBuffSubmission,null);
  dom.window.close();
 }
});

test('rejected async attack-buff choice restores only a still-owned decision',async()=>{
 for(const cancel of [null,'phase','owner']) {
  const {dom,w,dialogs}=setup();let reject,calls=0;
  const pending={damage:5,canMagma:true,canCrit:false,magmaPreviewDamage:8};
  dialogs.showAttackBuffChoice(pending,()=>{calls++;return calls===1?new Promise((_,fail)=>{reject=fail;}):true;});
  const button=w.document.querySelector('[data-attack-buff="magmaVein"]');button.click();
  if(cancel==='phase') dialogs.syncCombatDialog('guard',true,'GUARD_CHOICE');
  if(cancel==='owner') dialogs.syncCombatDialog('attackBuff',false,'ATTACK_BUFF_CHOICE');
  reject(new Error('command rejected'));await new Promise(resolve=>setImmediate(resolve));
  assert.equal(!!w.document.getElementById('attack-buff-choice-dialog'),!cancel);
  if(!cancel) {button.click();await Promise.resolve();assert.equal(calls,2);assert.equal(w.document.getElementById('attack-buff-choice-dialog'),null);}
  dom.window.close();
 }
});

test('deferred attack-buff flag blocks dialog until cleared after events',async()=>{
 const {dom,w}=setup();
 const fs=require('node:fs'),path=require('node:path');
 w.eval('window.GameUI=class {};window.PHASE_NAMES={};');
 w.eval(fs.readFileSync(path.join(__dirname,'../js/ui/controls.js'),'utf8'));
 const controls=w.document.createElement('div');controls.id='controls';w.document.body.appendChild(controls);
 const ui=new w.GameUI();
 let opened=0;
 Object.assign(ui,{
  state:{phase:'ATTACK_BUFF_CHOICE',onlineCanAct:true,playerHand:[],selectedCard:-1,pendingAttackBuffChoice:{damage:5,canMagma:true,canCrit:false,magmaPreviewDamage:8,magmaStacks:1,critStacks:0}},
  dialogs:{showAttackBuffChoice(){opened++;}},
  _updateUseItemButton(){},
  _isConsumingEvents:false,
  _deferAttackBuffDialog:false
 });
 ui._deferAttackBuffDialog=true;
 ui._renderControls();
 assert.equal(opened,0,'settling/defer holds dialog');
 ui._deferAttackBuffDialog=false;
 ui._renderControls();
 assert.equal(opened,1,'opens after defer cleared');
 // _showAcceptedControls(true) sets defer again
 ui._showAcceptedControls(true);
 assert.equal(opened,1,'settling path does not open again');
 assert.equal(ui._deferAttackBuffDialog,true);
 ui._deferAttackBuffDialog=false;
 ui._renderControls();
 assert.equal(opened,2);
 dom.window.close();
});

test('battle menu mounts a body overlay without adding combat-screen children', () => {
 const {dom,w}=setup();
 w.eval('window.GameUI=class {};');
 w.eval(fs.readFileSync(path.join(__dirname,'../js/ui/controls.js'),'utf8'));
 const screen=w.document.createElement('div');
 screen.id='game-screen';
 w.document.body.appendChild(screen);
 const before=screen.childElementCount;
 w.GameSideMenu.open({
  title:'菜单',
  items:[{id:'gm-cancel',className:'game-menu-cancel',label:'继续游戏'}]
 });
 const overlay=w.document.getElementById('game-menu-overlay');
 assert.ok(overlay);
 assert.equal(overlay.parentNode,w.document.body);
 assert.equal(screen.childElementCount,before);
 assert.ok(overlay.querySelector('.game-menu-box'));
 assert.equal(overlay.querySelectorAll('.game-menu-btn').length,1);
 w.GameSideMenu.close(overlay);
 dom.window.close();
});

test('skill book body is a dedicated scroll area in CSS', () => {
 const css=fs.readFileSync(path.join(__dirname,'../css/game.css'),'utf8');
 assert.match(css,/\.game-menu-body[\s\S]*?overflow-y:\s*auto/);
 assert.match(css,/\.game-menu-body\s+\.skill-grid\s*\{\s*overflow:\s*visible/);
});

test('skill book opens a full-height side card on a separate panel', () => {
 const {dom,w}=setup();
 w.eval('window.GameUI=class {};');
 w.eval(fs.readFileSync(path.join(__dirname,'../js/ui/controls.js'),'utf8'));
 w.GameSideMenu.open({
  panel:'skills',
  title:'角色技能',
  boxClass:'game-menu-box-book',
  html:'<div class="skill-grid"></div>'
 });
 const overlay=w.document.getElementById('game-menu-overlay');
 assert.equal(overlay.dataset.panel,'skills');
 assert.ok(overlay.querySelector('.game-menu-box-book'));
 assert.ok(overlay.querySelector('.game-menu-body'));
 w.GameSideMenu.open({
  panel:'menu',
  title:'菜单',
  items:[{id:'gm-cancel',className:'game-menu-cancel',label:'继续游戏'}]
 });
 const swapped=w.document.getElementById('game-menu-overlay');
 assert.equal(swapped.dataset.panel,'menu');
 assert.equal(w.document.querySelectorAll('#game-menu-overlay').length,1);
 dom.window.close();
});

test('avoidance submission blocks stale reopen and admits the next genuine fly retry only after completion',async()=>{
 for(const retry of [false,true]) {
  const {dom,w,dialogs}=setup();let finish,calls=0;
  const show=retry?'showFlyRetryChoice':'showGuardChoice';
  dialogs[show]({guard:2,fly:2},5,()=>{calls++;return new Promise(resolve=>finish=resolve);});
  const buttons=[...w.document.querySelectorAll('.avoidance-choice-box button')];
  buttons[0].click();buttons.forEach(button=>button.click());
  dialogs.syncCombatDialog(retry?'flyRetry':'guard',true,'GUARD_CHOICE');
  dialogs[show]({guard:2,fly:2},5,()=>{calls++;});
  assert.equal(w.document.querySelector('.avoidance-choice-box'),null,'old snapshot cannot reopen while command is pending');
  dialogs.syncCombatDialog(null,true,'DICE_CHOICE');
  dialogs.syncCombatDialog('flyRetry',true,'GUARD_CHOICE');
  dialogs.showFlyRetryChoice({guard:2,fly:1},5,()=>{calls++;});
  assert.equal(w.document.querySelector('.avoidance-choice-box'),null,'retry waits for current playback');
  finish(true);await new Promise(resolve=>setImmediate(resolve));
  assert.equal(calls,1);assert.equal(w.document.querySelectorAll('#fly-retry-choice-dialog').length,1);
  assert.equal(dialogs._avoidanceSubmission,null);dom.window.close();
 }
});

test('avoidance submission never restores an obsolete choice and permits rejected command retry',async()=>{
 for(const cancel of [false,true]) {
  const {dom,w,dialogs}=setup();let finish,calls=0;
  dialogs.showGuardChoice({guard:1},4,()=>{calls++;return new Promise(resolve=>finish=resolve);});
  w.document.querySelector('.choice-primary').click();
  if(cancel)dialogs.syncCombatDialog(null,true,'AI_TURN');
  finish(false);await new Promise(resolve=>setImmediate(resolve));
  assert.equal(!!w.document.getElementById('guard-choice-dialog'),!cancel);
  if(!cancel){w.document.querySelector('.choice-primary').click();assert.equal(calls,2);finish(true);await Promise.resolve();}
  dom.window.close();
 }
});

test('Leon AOE dialog selects across both opponent hands and submits exactly two cards once',async()=>{
 const {dom,w,dialogs}=setup();let finish,calls=0,payload;
 const pending={count:2,groups:[{key:'ai',label:'对手 I',cards:[{value:0},{value:2}]},{key:'ai2',label:'对手 II',cards:[{value:3},{value:4}]}]};
 const submit=p=>{calls++;payload=p;return new Promise(resolve=>finish=resolve);};
 dialogs.showLeonZeroDiscardChoice(pending,submit);const overlay=w.document.getElementById('leon-zero-discard-dialog');
 const buttons=[...overlay.querySelectorAll('.leon-zero-card')],confirm=overlay.querySelector('.start-btn');
 assert.equal(buttons.length,4);assert.equal(buttons[0].textContent,'0');assert.equal(confirm.disabled,true);
 buttons[0].click();buttons[3].click();assert.equal(confirm.disabled,false);assert.equal(buttons[1].disabled,true);
 buttons[3].click();assert.equal(confirm.disabled,true);buttons[2].click();confirm.click();confirm.click();
 dialogs.showLeonZeroDiscardChoice(pending,submit);assert.equal(w.document.querySelectorAll('#leon-zero-discard-dialog').length,1);assert.equal(calls,1);
 assert.equal(JSON.stringify(payload.cards),JSON.stringify([{target:'ai',index:0},{target:'ai2',index:0}]));
 finish(true);await new Promise(resolve=>setImmediate(resolve));assert.equal(w.document.getElementById('leon-zero-discard-dialog'),null);dom.window.close();
});

test('Leon AOE dialog preserves chosen cards after rejection and sync removes an obsolete dialog',async()=>{
 const {dom,w,dialogs}=setup();let calls=0;
 dialogs.showLeonZeroDiscardChoice({count:1,groups:[{key:'ai2',label:'对手 II',cards:[{value:4}]}]},async()=>{calls++;return false;});
 w.document.querySelector('.leon-zero-card').click();w.document.querySelector('.start-btn').click();await new Promise(resolve=>setImmediate(resolve));
 assert.equal(calls,1);assert.equal(w.document.querySelector('.leon-zero-card').getAttribute('aria-pressed'),'true');assert.equal(w.document.querySelector('.start-btn').disabled,false);
 dialogs.syncCombatDialog(null,true,'AI_DEFEND');assert.equal(w.document.getElementById('leon-zero-discard-dialog'),null);dom.window.close();
});

test('challenge PurifyCrystal opens a choice for self and the current opponent, including after reload',async()=>{
 for(const target of ['ai','ai2'])for(const done of [false,true]){
  const {dom,w,dialogs}=setup();
  try{
   w.eval('window.GameUI=class {}; window.PHASE_NAMES={PURIFY_CRYSTAL_CHOICE:"净化水晶"};');
   w.eval(fs.readFileSync(path.join(__dirname,'../js/ui/mode_1v2.js'),'utf8'));
   const ui=new w.GameUI();ui.dialogs=dialogs;ui.gameScreen=w.document.createElement('main');w.document.body.append(ui.gameScreen);
   for(const method of ['_drawDeckIcon','_updateHpBar','_updateBuffs','_updateAvatar','_updateAttackerIndicator','_renderPlayerHand','_renderAIHand1v2','_renderDiscardTop','_renderZones','_renderReveal','_renderDiceControl','_renderControls','_updateAdventureInfo','_renderAdventureItemBar'])ui[method]=()=>{};
   ui._handRenderingLocked=()=>false;
   ui.state=JSON.parse(JSON.stringify({is1v2:true,isAdventure:true,isLord:true,phase:'PURIFY_CRYSTAL_CHOICE',pendingDialog:'purifyCrystal',attackTarget:target,
    player:{name:'Saiki',burn:3},ai:{name:'VolcanoAshWolf',guard:1},ai2:{name:'VolcanoSalamander',bleed:2},turn:2}));
   let call;ui._apiAction=async(method,params)=>{call={method,params};return true;};
   ui._buildGameScreen1v2();ui.updateDisplay();
   const dialog=w.document.getElementById('purify-choice-dialog');assert.ok(dialog,'saved pending choice is visible');
   assert.match(dialog.textContent,/自己.*灼伤/);assert.match(dialog.textContent,target==='ai'?/对手.*守护/:/对手.*流血/);
   assert.doesNotMatch(dialog.textContent,target==='ai'?/流血/:/守护/,'only the current defender is included');
   const button=done?dialog.querySelector('.choice-done-btn'):[...dialog.querySelectorAll('button')].find(btn=>btn.textContent.includes('对手'));
   button.click();await Promise.resolve();
   assert.equal(call.method,'choosePurifyCrystal');
   assert.equal(done?call.params.choice.done:call.params.choice.who,done?true:'opp');
   assert.equal(w.document.getElementById('purify-choice-dialog'),null);
  }finally{dom.window.close();}
 }
});

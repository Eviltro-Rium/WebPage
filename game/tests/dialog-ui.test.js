const assert=require('node:assert/strict'),test=require('node:test'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require('jsdom');
function setup(){const dom=new JSDOM('<body></body>',{runScripts:'outside-only'});dom.window.eval(fs.readFileSync(path.join(__dirname,'../js/ui/dialogs.js'),'utf8')+';window.testDialogs=new DialogManager();');return {dom,w:dom.window,dialogs:dom.window.testDialogs};}
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

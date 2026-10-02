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

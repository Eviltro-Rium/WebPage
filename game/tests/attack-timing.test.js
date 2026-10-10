const assert=require('node:assert/strict'),test=require('node:test'),vm=require('node:vm');
const {loadInto}=require('./_load');
const ctx=vm.createContext({console,Math,JSON,Date,setTimeout:()=>1,clearTimeout:()=>{}});ctx.window=ctx;
loadInto(ctx,['characters','ai','combat','adventure_content']);
const card=(value,color='BLUE')=>({value,color,isNumberCard:true,isItemCard:false});
function setup(name='Vixraps',value=7,target='ai',color='BLUE'){
 const e=new ctx.Engine();e.start(name,'Ryan');e.later=()=>{};
 if(target==='ai2'){e.s.ai2=e.character('Ryan',true);e.s.is1v2=true;e.s.modeId='1v2';}
 e.s.atkOwner='player';e.s.atkCard=card(value,color);e.s.defCard=null;e.s.attackTarget=target;
 const r=e.effect(name,value,e.s.atkCard,e.s.player,e.s[target]);e.s.pendingAttack={damage:r.d};
 return {e,r,t:e.s[target]};
}
for(const key of ['ai','ai2'])test('diving preserves attack statuses and avoids guard/fly consumption for '+key,()=>{
 const {e,r,t}=setup('Vixraps',7,key);t.diving=true;t.guard=3;t.fly=2;const hp=t.hp;e.events=[];
 const amount=e.prepareAttackSettlement(r.d,key);assert.equal(amount,0);assert.equal(t.burn,2);assert.ok(t.hypnosis);
 e.prepareAttackSettlement(amount,key);e.settlePreparedHit(e.s.player,t,{damage:amount,bleed:0});
 assert.equal(t.hp,hp);assert.equal(t.guard,3);assert.equal(t.fly,2);
 assert.equal(e.events.filter(evt=>evt.kind==='diving').length,1,'one trigger only');
});
test('diving on player bypasses the manual guard choice after the damage formula',()=>{
 const {e}=setup();e.s.atkOwner='ai';e.s.pendingAttack={damage:6};e.s.pendingDamageFormula=null;e.s.pendingSkillStatuses=[];
 e.s.player.diving=true;e.s.player.guard=3;e.s.player.fly=1;e.events=[];
 e.askGuard(6);assert.notEqual(e.s.phase,'GUARD_CHOICE');assert.equal(e.s.player.guard,3);assert.equal(e.s.player.fly,1);
});
test('damage-first burn lands after HP loss and does not add the Blaze passive to this hit',()=>{
 const {e,r,t}=setup('Blaze',2,'ai','RED');const hp=t.hp;e.events=[];
 const amount=e.prepareAttackSettlement(r.d,'ai');assert.equal(amount,3);assert.equal(t.burn,0);assert.equal(e.s.player.burn,0);
 e.settlePreparedHit(e.s.player,t,{damage:amount,bleed:0});assert.equal(t.hp,hp-3);assert.equal(t.burn,1);
 const hit=e.events.findIndex(evt=>evt.type==='hit'),buff=e.events.findIndex(evt=>evt.type==='buff'&&evt.kind==='burn');assert.ok(hit>=0&&buff>hit);
 e.performAttack({type:'aoe',commitAttackEffects:true});assert.equal(e.s.player.burn,1);assert.equal(e.s.pendingSkillStatuses.length,0);
});
test('after-damage effects apply even when blue damage is immune',()=>{
 const {e,r,t}=setup('Vixraps',1);t.diving=true;t.guard=2;const hp=t.hp;
 const amount=e.prepareAttackSettlement(r.d,'ai');assert.equal(amount,0);assert.equal(t.burn,0);
 e.settlePreparedHit(e.s.player,t,{damage:amount,bleed:0});assert.equal(t.hp,hp);assert.equal(t.burn,2);assert.equal(t.guard,2);
 e.commitAttackStatuses('afterDamage');assert.equal(t.burn,2);
});
test('blue immunity runs after live formula evaluation, before avoidance',()=>{
 const {e,r,t}=setup('Blaze',5);t.diving=true;let observed=false;
 const original=e.divingBlocksDamage;e.divingBlocksDamage=function(entity,c){observed=this.s.player.burn===1;return original.call(this,entity,c);};
 assert.equal(e.prepareAttackSettlement(r.d,'ai'),0);assert.ok(observed);
});
test('after-damage queue and diving checkpoint survive snapshots',()=>{
 const {e,r,t}=setup('Vixraps',1);t.diving=true;e.prepareAttackSettlement(r.d,'ai');
 const restored=new ctx.Engine();restored.restoreCombatSnapshot(e.combatSnapshot());const hp=restored.s.ai.hp;
 restored.settlePreparedHit(restored.s.player,restored.s.ai,{damage:0,bleed:0});assert.equal(restored.s.ai.hp,hp);assert.equal(restored.s.ai.burn,2);assert.equal(restored.s.pendingSkillStatuses.length,0);
});
test('AOE target statuses commit after every target HP hit',()=>{
 const {e,r,t}=setup('Blaze',0,'ai2','RED');e.s.ai=e.character('Ryan',true);
 e.events=[];e.prepareAttackSettlement(r.d,'ai2');e.settlePreparedHit(e.s.player,t,{damage:r.d,bleed:0});
 e.performAttack({type:'aoe',commitAttackEffects:true,target:'ai2',aoeTargets:['ai','ai2'],aoeDamage:5,skipTarget:true});
 assert.equal(e.s.ai.burn,2);assert.equal(t.burn,2);const hit=e.events.findIndex(evt=>(evt.type==='hit'||evt.type==='hurt')&&evt.who==='ai'),buff=e.events.findIndex(evt=>evt.type==='buff'&&evt.kind==='burn'&&evt.who==='ai');assert.ok(hit>=0&&buff>hit);
});

test('incidental item AOE cannot prematurely flush a queued attack status',()=>{
 const {e,r,t}=setup('Vixraps',1,'ai','RED');e.prepareAttackSettlement(r.d,'ai');
 e.performAttack({type:'aoe',target:'ai',aoeTargets:['ai'],aoeDamage:1,skipTarget:false});assert.equal(t.burn,0);assert.ok(e.s.pendingSkillStatuses.length);
 e.settlePreparedHit(e.s.player,t,{damage:r.d,bleed:0});assert.equal(t.burn,2);
});
test('diving full block still settles bleed after a defense skill (card <=3)',()=>{
 const {e}=setup();e.s.atkOwner='ai';e.s.atkCard=card(5,'BLUE');e.s.pendingAttack={damage:5};e.s.pendingDamageFormula=null;e.s.pendingSkillStatuses=[];
 e.s.player.diving=true;e.s.player.guard=2;e.s.player.bleed=2;e.s.defCard=card(2,'BLUE');e.events=[];
 const hp=e.s.player.hp;
 e.askGuard(5,e.s.player.bleed);
 assert.equal(e.pendingSettlement&&e.pendingSettlement.bleed,2,'bleed carried into settlement');
 e.settlePreparedHit(e.s.ai,e.s.player,e.pendingSettlement);
 assert.equal(e.s.player.hp,hp-2);assert.equal(e.s.player.bleed,1);assert.equal(e.s.player.guard,2);
});

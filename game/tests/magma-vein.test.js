const assert=require('node:assert/strict'),test=require('node:test'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const {loadInto}=require('./_load');
const ctx=vm.createContext({console,Math,JSON,Date,setTimeout:()=>1,clearTimeout:()=>{},performance:{now:()=>0}});ctx.window=ctx;
loadInto(ctx,['characters','ai','combat','adventure_content']);
for(const file of ['adventure/js/deck/adventure_deck.js','adventure/js/engine/adventure_engine.js','adventure/js/engine/inventory.js','adventure/js/battle/battle_engine.js','online_game/online_match.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,'..',file),'utf8'),ctx,{filename:file});
const card=value=>ctx.FurryGame.Card.number('RED',value);
function setup(){const e=new ctx.Engine();e.start('Ryan','Blaze');e.later=()=>{};e.s.atkCard=card(3);e.s.atkOwner='player';e._finishAfterCritChoice=function(d,skip,unblock){this.finished={d,skip,unblock};this.s.phase='AI_DEFEND';return this.state();};return e;}
function gate(e,d=5,unblock=false,opts={}){return e.gateAdventureAttackMod(e.s.atkCard,d,false,unblock,0,opts);}
test('magma is capped at one, pure positive status and all cleanse methods remove it',()=>{
 const e=setup();e.magmaVein(e.s.player,2);e.magmaVein(e.s.player);assert.equal(e.s.player.magmaVein,1);assert.equal(e.events.filter(x=>x.kind==='magmaVein').length,1);
 e.clean(e.s.player,false,'magmaVein');assert.equal(e.s.player.magmaVein,0);e.magmaVein(e.s.player);e.clean(e.s.player,true);assert.equal(e.s.player.magmaVein,0);
 e.magmaVein(e.s.player);e.clearDebuffs(e.s.player);assert.equal(e.s.player.magmaVein,1);e.clearPositiveBuffs(e.s.player);assert.equal(e.s.player.magmaVein,0);
});
test('magma trophy gains self buff, bridges and draws; never targets the enemy',()=>{
 const e=setup(),c=ctx.AdventureDeck.trophyWhite('MagmaVeinTrophy'),n=e.h.player.length;
 assert.equal(c.trophyEffect,'magmaVein');e.useTrophyWhite(c,e.s.ai);assert.equal(e.s.player.magmaVein,1);assert.equal(e.s.ai.magmaVein,0);assert.equal(e.h.player.length,n+1);
 const def=ctx.AdventureRegistry.getItem('MagmaVeinTrophy');assert.equal(def.price,5);assert.deepEqual(Array.from(def.beastTradeCost),['huo','huo']);assert.match(def.icon,/magma_vein.webp$/);
});
test('magma and crit appear together; magma rounds up, consumes only one, skips items',()=>{
 const e=setup();e.s.isAdventure=true;e.magmaVein(e.s.player);e.s.player.crit=2;gate(e,5);
 assert.equal(e.s.phase,'ATTACK_BUFF_CHOICE');assert.equal(e.s.pendingDialog,'attackBuff');assert.equal(e.s.pendingAttackBuffChoice.canCrit,true);assert.equal(e.s.pendingAttackBuffChoice.magmaPreviewDamage,8);
 e.dispatch('resolveAttackBuffChoice',{buff:'magmaVein'});assert.equal(e.finished.d,8);assert.equal(e.s.player.crit,2);assert.equal(e.s.player.magmaVein,0);assert.equal(e.s.pendingDialog,null);
 assert.throws(()=>e.resolveAttackBuffChoice({buff:'crit'}),/当前没有/);assert.throws(()=>e.resolveAttackModChoice({bonus:2}),/当前没有/);
});
test('choosing crit preserves magma and does not multiply skill damage',()=>{const e=setup();e.magmaVein(e.s.player);e.s.player.crit=1;gate(e);e.resolveAttackBuffChoice({buff:'crit'});assert.equal(e.finished.d,5);assert.equal(e.finished.unblock,true);assert.equal(e.s.player.magmaVein,1);assert.equal(e.s.player.crit,0);});
test('skipping buffs permits items but never reopens a second buff choice',()=>{const e=setup();e.s.isAdventure=true;e.magmaVein(e.s.player);e.s.player.crit=1;gate(e);e.resolveAttackBuffChoice({buff:null});assert.equal(e.s.phase,'ATTACK_MOD_CHOICE');e.resolveAttackModChoice({bonus:2});assert.equal(e.finished.d,7);assert.equal(e.s.player.magmaVein,1);assert.equal(e.s.player.crit,1);});
test('invalid buff choices do not close the dialog or spend a buff',()=>{const e=setup();e.magmaVein(e.s.player);gate(e,3);assert.throws(()=>e.resolveAttackBuffChoice({buff:'crit'}),/不能使用/);assert.throws(()=>e.resolveAttackBuffChoice({buff:'guard'}),/无效/);assert.equal(e.s.phase,'ATTACK_BUFF_CHOICE');assert.equal(e.s.player.magmaVein,1);});
test('zero damage, item cards, defense and independent buff damage never consume magma',()=>{const e=setup();e.magmaVein(e.s.player);gate(e,0);assert.equal(e.s.player.magmaVein,1);e.s.atkCard=ctx.AdventureDeck.trophyWhite('BurnTrophy');gate(e,5);assert.equal(e.s.player.magmaVein,1);const hp=e.s.player.hp;e.hurt(e.s.player,2,'poison');assert.equal(e.s.player.hp,hp-2);assert.equal(e.s.player.magmaVein,1);});
test('magma can modify already-unblockable attacks but crit cannot',()=>{const e=setup();e.magmaVein(e.s.player);e.s.player.crit=1;gate(e,3,true);assert.equal(e.s.pendingAttackBuffChoice.canCrit,false);e.resolveAttackBuffChoice({buff:'magmaVein'});assert.equal(e.finished.d,5);assert.equal(e.finished.unblock,true);});
test('passive flat damage is not multiplied and AoE skill damage is',()=>{const e=setup();e.magmaVein(e.s.player);gate(e,4,false,{skillDamage:3,aoeDamage:3,aoeTargets:['ai2']});assert.equal(e.s.pendingAttackBuffChoice.magmaPreviewDamage,6);e.resolveAttackBuffChoice({buff:'magmaVein'});assert.equal(e.finished.d,6);assert.equal(e.s.pendingAttack.aoeDamage,5);});
test('live damage formulas are multiplied then rounded, not fractional preview deltas',()=>{const e=setup();ctx.CharacterRegistry.register({name:'MagmaFormulaTest',damageAtSettlement:()=>4});e.magmaVein(e.s.player);gate(e,3);e.resolveAttackBuffChoice({buff:'magmaVein'});e.s.pendingDamageFormula={name:'MagmaFormulaTest',value:3,preview:3};assert.equal(e.prepareAttackSettlement(5,'ai'),6);});
test('pending magma choice survives a JSON snapshot and cannot be spent twice',()=>{const e=setup();e.magmaVein(e.s.player);gate(e,3);const restored=setup();restored.restoreCombatSnapshot(JSON.parse(JSON.stringify(e.combatSnapshot())));restored.resolveAttackBuffChoice({buff:'magmaVein'});assert.equal(restored.finished.d,5);assert.equal(restored.s.player.magmaVein,0);assert.throws(()=>restored.resolveAttackBuffChoice({buff:'magmaVein'}),/当前没有/);});
for(const owner of ['ai','ai2'])test('NPC '+owner+' uses magma before crit on actual AI attack',()=>{
 const e=setup();if(owner==='ai2')e.start1v2('Ryan','Saiki','Blaze');e.later=()=>{};const actor=e.s[owner];e.magmaVein(actor);actor.crit=2;
 e.s.aiTurnStarted=true;e.s.currentAITarget=owner==='ai2'?1:0;e.s.phase=owner==='ai2'?'AI2_TURN':'AI_TURN';e.h[owner]=[card(3)];e._beginPlayerDefendFlow=(d)=>{e.incoming=d;return true;};
 e.chooseAIPlay=()=>e.h.ai[0];e._chooseAIPlay1v2=key=>e.h[key][0];if(owner==='ai2')e.aiTurn1v2();else e.legacyAiTurn();
 assert.equal(e.incoming,6);assert.equal(actor.magmaVein,0);assert.equal(actor.crit,2);assert.equal(e.s.player.magmaVein,0);
});
test('a magma buff gained during this skill is saved for the next attack',()=>{const e=setup();e.s.atkOwner='ai';e.s.atkCard=card(3);e._onAttackSkillRelease(e.s.ai);e.magmaVein(e.s.ai);const r={d:3,unblock:false};e.s.pendingAttack={damage:3};ctx.FurryGame.AttackBuffs.applyAI(e,r,'ai',e.s.atkCard);assert.equal(r.d,3);assert.equal(e.s.ai.magmaVein,1);});
for(const actor of ['host','guest'])test('online '+actor+' owns its modifier dialog and spends only its own magma',()=>{
 const match=new ctx.OnlineMatchHost('Ryan','Blaze',actor);match.started=true;const e=match.engine;const key=actor==='host'?'player':'ai';e.s[key].magmaVein=1;e.s[key].crit=1;e.h[key]=[card(3)];e.s.discardTop=card(3);
 const c=e.h[key][0];const id=ctx.FurryGame.Card ? [c.uid||'',c.color,c.value,!!c.isBlack,!!c.isWhite,!!c.potion,!!c.magic,!!c.greenMagic,c.magicColor||'',!!c.purify,!!c.superPurify,!!c.swapHand,!!c.shuffleToDeck,!!c.drawTwo,!!c.drawThree,!!c.trophyWhite,c.trophyName||''].join('_'):'';
 const out=match.dispatch(actor,'playCard',{index:0,cardId:id});assert.equal(out.ok,true,out.error);assert.equal(match.project(actor).phase,'ATTACK_BUFF_CHOICE');assert.equal(match.project(actor).onlineCanAct,true);
 const other=actor==='host'?'guest':'host';assert.equal(match.project(other).onlineCanAct,false);assert.equal(match.dispatch(other,'resolveAttackBuffChoice',{buff:'magmaVein'}).ok,false);
 const selected=match.dispatch(actor,'resolveAttackBuffChoice',{buff:'magmaVein'});assert.equal(selected.ok,true,selected.error);assert.equal(e.s[key].magmaVein,0);assert.equal(e.s[key==='player'?'ai':'player'].magmaVein,0);
});

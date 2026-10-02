'use strict';
const assert=require('node:assert/strict');
const test=require('node:test');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const {loadInto}=require('./_load');
const context=vm.createContext({console,Math,JSON,Date,setTimeout:()=>1,clearTimeout:()=>{}});
context.window=context;
loadInto(context,['characters','ai','combat','adventure_content']);
vm.runInContext(fs.readFileSync(path.join(__dirname,'../online_game/online_match.js'),'utf8'),context);
for(const file of ['adventure/js/deck/adventure_deck.js','adventure/js/battle/battle_engine.js','adventure/js/battle/adventure_battle_items.js'])
 vm.runInContext(fs.readFileSync(path.join(__dirname,'..',file),'utf8'),context);
const Card=context.FurryGame.Card;
function setup(mode='1v1'){
 const e=new context.Engine();
 if(mode==='lord')e.startLord('Ryan','Saiki','Saiki');
 else if(mode==='1v2')e.start1v2('Ryan','Saiki','Saiki');
 else e.start('Ryan','Saiki');
 e.events=[];e.later=()=>{};return e;
}
function reveal(e,owner='ai'){
 e.s.atkCard=Card.number('RED',6);e.s.atkOwner=owner;e.s.activeAttacker=owner;
 e.s.pendingAttack={damage:4};e.s.phase='PLAYER_DEFEND';e.s.busy=false;
 const c=e.deck.pop();
 e.emit('reveal','技能判定',c,{from:'deck',who:owner});
 e.discardWithEvent(c,owner,{from:'reveal',faceUp:true});
 return c;
}
for(const mode of ['1v1','1v2','lord'])test(mode+': judgment stays through defense and leaves only after damage',()=>{
 const e=setup(mode),owner=mode==='1v1'?'ai':'ai2';
 const before=e.discardBottom.length,c=reveal(e,owner);
 assert.equal(e.discardBottom.length,before+1,'physical card already discarded');
 assert.equal(e.s.revealCards[0].uid,c.uid);
 assert.equal(e.events.find(x=>x.type==='discard').deferRevealExit,true);
 e.acknowledgeEvents(e.ver);
 assert.equal(e.s.revealCards.length,1,'reading/acknowledging reveal is not defense completion');
 assert.equal(e.events.some(x=>x.type==='judgmentEnd'),false);
 e.emit('hint','等待防御结算');e.deferSettlement('AI_ATTACK',4,0);e.acknowledgeEvents(e.ver);
 const end=e.events.find(x=>x.type==='judgmentEnd');assert.ok(end);
 assert.equal(end.moves.length,1);assert.equal(end.moves[0].who,owner);
 const hit=e.events.find(x=>x.type==='hurt'||x.type==='hit');assert.ok(hit);assert.ok(hit.id<end.id);
 assert.equal(e.s.revealCards.length,0);assert.equal(e.s.pendingJudgmentMoves.length,0);
 const count=e.events.filter(x=>x.type==='judgmentEnd').length;e.finishJudgmentPresentation();
 assert.equal(e.events.filter(x=>x.type==='judgmentEnd').length,count,'no repeated exit');
 assert.equal(e.discardBottom.length,before+1,'presentation never discards twice');
});
for(const challenge of [false,true])for(const testMode of [false,true])test('adventure judgment lifecycle: challenge='+challenge+', test='+testMode,()=>{
 const e=new context.AdventureBattleEngine();e.later=()=>{};
 const config={player:'Ryan',opponent:'CastleWolf',opponent1:'CastleWolf',opponent2:'CastleWolf',testMode,
  playerPile:{deck:[Card.number('GREEN',4)],hand:[Card.number('RED',2)],discard:[],handLimit:5}};
 if(challenge)e.startAdventure1v2(config);else e.startAdventure(config);
 e.events=[];const owner=challenge?'ai2':'ai';e.s.player.guard=0;e.s.player.fly=0;
 e.s.atkCard=Card.number('RED',6);e.s.atkOwner=owner;e.s.activeAttacker=owner;e.s.pendingAttack={damage:4};
 e.s.phase='PLAYER_DEFEND';e.s.busy=false;
 const before=e.piles.ai.discard.length,playerDiscard=e.piles.player.discard.length,c=e.piles.ai.deck.pop();
 e.emit('reveal','怪物判定',c,{who:owner,from:'deck'});e.discardWithEvent(c,owner,{from:'reveal'});
 assert.equal(e.s.revealCards.length,1);assert.equal(e.piles.ai.discard.length,before+1);
 e.deferSettlement('AI_ATTACK',4,0);e.acknowledgeEvents(e.ver);
 assert.ok(e.events.find(x=>x.type==='judgmentEnd'));assert.equal(e.s.revealCards.length,0);
 assert.equal(e.piles.player.discard.length,playerDiscard,'NPC judgment never enters player discard');
 assert.equal(e.piles.ai.discard.length,before+1);
});
test('snapshot preserves deferred exit and judgment faces across refresh',()=>{
 const e=setup(),c=reveal(e),copy=new context.Engine();
 copy.restoreCombatSnapshot(e.combatSnapshot());copy.later=()=>{};
 assert.equal(copy.s.revealCards[0].uid,c.uid);assert.equal(copy.s.pendingJudgmentMoves.length,1);
 copy.finishJudgmentPresentation();assert.equal(copy.events.filter(x=>x.type==='judgmentEnd').length,1);
 assert.equal(copy.discardBottom.length,e.discardBottom.length);
});
test('hand discards still animate immediately and pure-effect branches release once',()=>{
 const e=setup();e.s.atkCard=Card.number('RED',4);e.s.atkOwner='player';
 e.discardWithEvent(e.h.player.pop(),'player');
 assert.equal(e.events.find(x=>x.type==='discard').deferRevealExit,undefined);
 reveal(e,'player');e.afterAttack();
 assert.equal(e.events.filter(x=>x.type==='judgmentEnd').length,1);
});
test('multi-card/deck-return judgment remains visible without changing pile ownership',()=>{
 const e=setup();e.s.atkCard=Card.number('RED',4);e.s.atkOwner='player';
 const cards=[e.deck[e.deck.length-1],e.deck[e.deck.length-2]],size=e.deck.length;
 e.emit('reveal','两张判定牌',cards[0],{cards});
 assert.equal(e.s.revealCards.length,2);assert.equal(e.deck.length,size);
 e.performAttack({type:'aoe',commitAttackEffects:true});
 assert.equal(e.events.at(-1).type,'judgmentEnd');assert.equal(e.events.at(-1).cards.length,2);
 assert.equal(e.deck.length,size);
});
for(const actor of ['host','guest'])test('online Saiki6 keeps judgment and maps delayed exit: '+actor,()=>{
 const match=new context.OnlineMatchHost(actor==='host'?'Saiki':'Ryan',actor==='guest'?'Saiki':'Ryan',actor);
 const e=match.engine,owner=actor==='host'?'player':'ai',other=actor==='host'?'guest':'host';
 e.h[owner]=[Card.number('RED',6),Card.number('RED',3)];e.s.discardTop=Card.number('RED',1);
 assert.ok(match.dispatch(actor,'selectCard',{index:0}).ok);
 assert.ok(match.dispatch(actor,'doPlay').ok);
 assert.ok(match.dispatch(actor,'selectCard',{index:0}).ok);
 const judged=match.dispatch(actor,'doSaikiSixConfirm');assert.ok(judged.ok,JSON.stringify(judged));
 assert.equal(e.s.revealCards.length,1);assert.equal(e.s.pendingJudgmentMoves.length,1);
 assert.equal(judged.events.some(x=>x.type==='judgmentEnd'),false);
 const defense=match.dispatch(other,'doSkipDefend');assert.ok(defense.ok,JSON.stringify(defense));
 const local=match.eventsForViewer(defense.events,actor,other).find(x=>x.type==='judgmentEnd');
 const remote=match.eventsForViewer(defense.events,other,other).find(x=>x.type==='judgmentEnd');
 assert.ok(local);assert.ok(remote);assert.equal(local.moves[0].who,'player');assert.equal(remote.moves[0].who,'ai');
 assert.equal(e.s.pendingJudgmentMoves.length,0);
});

function uiHarness(){
 const {JSDOM}=require('jsdom');const dom=new JSDOM('<body><div id="reveal-cards"></div><div id="reveal-desc"></div><div id="discard-top"></div><div id="player-hand"></div><div id="ai-hand"></div><div id="ai2-hand"></div></body>',{runScripts:'outside-only'});
 const w=dom.window;w.GameUI=function(){};w.FurryGame={CombatRuntime:{wait:async()=>{}}};
 w.cardId=c=>c.uid;w.renderCard=c=>{const el=w.document.createElement('canvas');el.className='card-canvas';el.dataset.cardId=c.uid;return el;};
 for(const f of ['renderer.js','events.js','render/zone_render.js'])w.eval(fs.readFileSync(path.join(__dirname,'../js/ui/'+f),'utf8'));
 const ui=new w.GameUI();ui.state={player:{hp:70},ai:{hp:70},revealCards:[]};ui._repaintOwnerHand=()=>{};
 ui._findHandCardElement=(box,c)=>Array.from(box.querySelectorAll('.card-canvas')).find(x=>x.dataset.cardId===c.uid);
 ui._eventTarget=evt=>evt.target||evt.who;ui._playHitFeedback=()=>{};
 ui._showZoneDesc=()=>{};ui._updateHpBar=()=>{};ui._updateBuffs=()=>{};ui.playFloatingText=()=>{};
 return {ui,w,dom};
}
test('UI leaves cards during defense, then hurt feedback precedes a single matching discard flight',async()=>{
 const {ui,w,dom}=uiHarness(),c=Card.number('RED',3),calls=[];
 ui._paintJudgmentCards([c]);ui.anim={discardCard:async(card,from)=>{calls.push('exit:'+from.dataset.cardId);from.remove();}};
 await ui._playEvents([{type:'discard',card:c,from:'reveal',who:'player',deferRevealExit:true}]);
 assert.equal(w.document.querySelectorAll('#reveal-cards canvas').length,1);assert.equal(calls.length,0);
 ui.state.revealCards=[];ui.state.events=[{type:'judgmentEnd'}];ui._renderReveal();
 assert.equal(w.document.querySelectorAll('#reveal-cards canvas').length,1,'final snapshot cannot clear ahead of playback');
 ui.playFloatingText=()=>calls.push('hurt');
 await ui._playEvents([{type:'hurt',target:'ai',who:'ai',amount:3,desc:'伤害',kind:'normal'},
  {type:'judgmentEnd',cards:[c],moves:[{type:'discard',card:c,from:'reveal',who:'player'}]}]);
 assert.deepEqual(calls,['hurt','exit:'+c.uid]);assert.equal(w.document.querySelectorAll('#reveal-cards canvas').length,0);
 dom.window.close();
});
test('UI multi-card exits match each card and never remove a hand card; refresh can restore faces',async()=>{
 const {ui,w,dom}=uiHarness(),a=Card.number('RED',2),b=Card.number('GREEN',4),hand=Card.number('BLUE',7),sources=[];
 w.document.getElementById('player-hand').appendChild(w.renderCard(hand));
 ui.anim={discardCard:async(card,source)=>{sources.push(source.dataset.cardId);source.remove();}};
 await ui._finishJudgmentAnimation({cards:[a,b],moves:[{type:'discardMany',cards:[b,a],from:'reveal',who:'player'}]});
 assert.deepEqual(sources,[b.uid,a.uid]);assert.equal(w.document.querySelectorAll('#player-hand canvas').length,1);
 assert.equal(w.document.querySelectorAll('#reveal-cards canvas').length,0);dom.window.close();
});
test('fly dice restore card reference before the next guard decision, including snapshot rendering',async()=>{
 const {ui,w,dom}=uiHarness(),c=Card.number('RED',5);
 ui.state.revealCards=[c];ui.state.diceRoll={value:2};ui._renderReveal();
 assert.equal(w.document.querySelectorAll('#reveal-cards canvas').length,1);
 ui._playD12Animation=async()=>{w.document.getElementById('reveal-cards').innerHTML='D12:2';};
 await ui._playEvents([{type:'diceRoll',value:2,desc:'飞翔失败'}]);
 assert.equal(w.document.querySelectorAll('#reveal-cards canvas').length,1);dom.window.close();
});

'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const {loadInto}=require('./_load');
function setup(mode){
 const c=vm.createContext({console,Math,JSON,Date,setTimeout:()=>1,clearTimeout(){},performance:{now:()=>0}});c.window=c;
 loadInto(c,['characters','ai','combat','adventure_content']);
 for(const file of ['deck/adventure_deck','battle/battle_engine','battle/adventure_battle_items'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../adventure/js',file+'.js'),'utf8'),c);
 const e=mode==='classic'?new c.Engine():new c.AdventureBattleEngine();e.later=()=>{};
 const num=(v,color='BLUE')=>c.FurryGame.Card.number(color,v);
 if(mode==='classic')e.start('Ryan','Saiki');else {
  const config={player:'Ryan',opponent:'CastleWolf',opponent1:'CastleWolf',opponent2:'CastleWolf',testMode:true,discardTop:num(1),playerPile:{hand:[],deck:[num(4),num(5)],discard:[],handLimit:5}};
  if(mode==='challenge')e.startAdventure1v2(config);else e.startAdventure(config);
 }
 const attack=num(4,'WHITE');attack.chosenColor='YELLOW';
 e.s.atkCard=attack;e.s.atkOwner=mode==='challenge'?'ai2':'ai';e.s.activeAttacker=e.s.atkOwner;e.s.attackTarget=e.s.atkOwner;
 e.s.discardTop=JSON.parse(JSON.stringify(attack));e.s.phase='PLAYER_DEFEND';e.s.busy=false;e.s.pendingAttack={damage:6};e.s.pendingDefenseDamage=6;e.s.player.frozen=true;
 e.h.player.splice(0,e.h.player.length,c.FurryGame.Card.item('BLACK','black'),num(2));e.s.selectedCard=0;e._invariantBaseline=null;e.events=[];
 return {c,e,num};
}
for(const mode of ['classic','adventure','challenge'])test(mode+': blue defense bridge does not recolor a yellow incoming attack or trigger freeze',()=>{
 const {e}=setup(mode);
 e.dispatch('doDefend');assert.equal(e.s.needColorChoice,true);
 e.dispatch('chooseColor',{color:'BLUE'});assert.equal(e.s.phase,'PLAYER_DEFEND');assert.equal(e.s.discardTop.chosenColor,'BLUE');assert.equal(e.s.atkCard.chosenColor,'YELLOW');
 e.s.selectedCard=0;assert.doesNotThrow(()=>e.dispatch('doDefend'));assert.ok(e.pendingSettlement);assert.equal(e.h.player.length,0);
 assert.ok(!e.events.some(event=>event.type==='buffTrigger'&&event.kind==='freeze'));
});
for(const mode of ['classic','adventure','challenge'])test(mode+': changing the table to red does not bypass freeze against a blue incoming attack',()=>{
 const {c,e}=setup(mode);e.s.atkCard.chosenColor='BLUE';e.s.discardTop=c.FurryGame.Card.item('BLACK','black',{chosenColor:'RED'});e.h.player.splice(0,e.h.player.length,c.FurryGame.Card.number('RED',2));e.s.selectedCard=0;
 assert.throws(()=>e.dispatch('doDefend'),/冷冻/);assert.equal(e.h.player.length,1);
});

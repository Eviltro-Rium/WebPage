const assert=require('node:assert/strict'),test=require('node:test'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const {expand}=require('./_load'),root=path.resolve(__dirname,'..');
const w=vm.createContext({console,Math,JSON,Date,Image:class {},setTimeout:()=>1,clearTimeout(){},performance:{now:()=>0}});
w.window=w;
for(const f of expand(['characters','ai','combat','adventure_content']).concat(['adventure/js/deck/adventure_deck.js','adventure/js/battle/battle_engine.js','adventure/js/battle/adventure_battle_items.js','adventure/js/engine/loot.js','adventure/js/engine/adventure_engine.js','adventure/js/content/stage_guide.js']))
 vm.runInContext(fs.readFileSync(path.join(root,f),'utf8'),w,{filename:f});
const C=v=>({value:v,color:'WHITE',isWhite:true,isNumberCard:true,isItemCard:false});
const names=['VolcanoSalamander','VolcanoCrab','VolcanoAshWolf','VolcanoObsidianBoar'];
const bosses=['VolcanoFlameLion','VolcanoMagmaRhino','VolcanoCinderPhoenix'];
const bridge=w.AdventureMonsterBridge;
function engine(name,stage=1){
 const e=new w.AdventureBattleEngine();
 e.startAdventure({player:'Ryan',opponent:name,scene:'volcano',stage,playerPile:{deck:[C(4)],hand:[C(2)],discard:[],handLimit:5}});
 e.later=()=>{};return e;
}
function defense(e,v=2,incoming=7){
 const ch=e.s.ai,enemy=e.s.player;
 return w.CharacterRegistry.get(ch.name).defend(e,ch.name,v,incoming,C(v),ch,enemy,'ai','RED',{
  heal:(x,n)=>e.heal(x,n),hurt:(x,n)=>e.hurt(x,n),burn:(x,n)=>e.burn(x,n),
  bleed:(x,n)=>e.bleed(x,n),poison:(x,n)=>e.poison(x,n),clearDebuffs:x=>e.clearDebuffs(x),draw:(...args)=>e.draw(...args)
 });
}
test('volcano first four monsters register with cumulative stages, WebP icons and no foreign Boss fallback',()=>{
 const hp=[18,20,18,20],hp2=[24,25,24,25];
 for(const name of names) assert.ok(w.AdventureMonsterPool.volcano[1].includes(name));
 assert.deepEqual(Array.from(w.AdventureBossPool.volcano[1]),['VolcanoFlameLion','VolcanoMagmaRhino']);
 assert.equal(w.AdventureBossPool.volcano[2].includes('VolcanoCinderPhoenix'),false);
 names.forEach((name,i)=>{
  const base=w.AdventureRegistry.getMonster(name);
  assert.equal(base.hp,hp[i]);assert.equal(base.minStage,1);
  assert.ok(fs.existsSync(path.join(root,'adventure',base.icon)));
  for(let stage=1;stage<=4;stage++){
   const mod=bridge.applyStageMods(base,stage),e=engine(name,stage);
   assert.equal(mod.hp,stage>=2?hp2[i]:hp[i]);
   assert.equal(e.s.ai.maxHp,mod.hp);
   for(let v=1;v<=6;v++){
    const dmg=mod.attackDamage(C(v),{playerBurn:2});
    const initial=base.attackDamage(C(v),{playerBurn:2});
    assert.equal(dmg,initial+(stage>=3&&i!==3?1:0));
    assert.match(bridge.getAdventureNpcSkillDesc(name,C(v),false,{stage}),/🗡️/);
   }
   for(let v=1;v<=3;v++)assert.equal(mod.defendBlock(C(v),9),i===2?0:stage===4?3:2);
   assert.equal(mod.attackDamage(C(7)),0);
  }
  assert.equal(w.AdventureStageGuide[name].length,3);
 });
});
test('fire defense buffs target the attacker, and AshWolf settles burn once without incidental block',()=>{
 for(const name of names)for(const stage of [1,4])for(const v of [1,2,3]){
  const e=engine(name,stage);e.s.player.burn=1;e.s.player.scorch=false;
  const before=e.s.player.hp,result=defense(e,v);
  if(name==='VolcanoAshWolf'){
   assert.equal(result.remaining,7);
   assert.equal(e.s.player.hp,before-2);
   assert.equal(e.s.player.burn,1);
   assert.equal(!!e.s.player.scorch,stage===4);
   assert.equal(e.events.filter(evt=>evt.type==='burnSettle').length,1);
  }else{
   assert.equal(result.remaining,stage===4?4:5);
   assert.equal(e.s.player.hp,before);
   assert.equal(e.s.player.burn,name==='VolcanoSalamander'?1:3);
   assert.equal(!!e.s.player.scorch,name==='VolcanoSalamander');
  }
  assert.equal(e.s.ai.burn,0);assert.equal(!!e.s.ai.scorch,false);
 }
});
test('volcano attacks defer status gains and Boar reads the actual target burn',()=>{
 const e=engine('VolcanoObsidianBoar',3);e.s.player.burn=2;
 let c=C(2);e.s.atkCard=c;e.s.atkOwner='ai';
 let r=e.effect('VolcanoObsidianBoar',2,c,e.s.ai,e.s.player);
 assert.equal(r.d,2);assert.equal(r.unblock,true);
 e.s.player.burn=3;r=e.effect('VolcanoObsidianBoar',2,c,e.s.ai,e.s.player);
 assert.equal(r.d,3);assert.equal(r.unblock,false);
 e.s.player.burn=4;
 assert.equal(w.CharacterRegistry.get('VolcanoObsidianBoar').damageAtSettlement(e,2,e.s.ai,e.s.player),4);
 for(const [name,v,status,value] of [['VolcanoSalamander',1,'burn',1],['VolcanoCrab',1,'guard',2],['VolcanoCrab',4,'magmaVein',1],['VolcanoAshWolf',4,'burn',2],['VolcanoObsidianBoar',4,'bleed',1]]){
  const a=engine(name),card=C(v);a.s.atkCard=card;a.s.atkOwner='ai';
  const who=['guard','magmaVein'].includes(status)?'ai':'player';
  const res=a.effect(name,v,card,a.s.ai,a.s.player);
  assert.ok(res.d>0);assert.equal(a.s[who][status]||0,0,'status is deferred until defense settles');
  a.commitAttackStatuses('afterDamage');assert.equal(a.s[who][status],value);
 }
});
test('all twelve loot faces match volcano.md and map names normalize correctly',()=>{
 const tables=[
  ['BurnTrophy','BurnTrophy','BurnTrophy','ScorchTrophy'],
  ['MagmaVeinTrophy','MagmaVeinTrophy','GuardTrophy','GuardTrophy'],
  ['BurnTrophy','BurnTrophy','BurnTrophy','BurnTrophy'],
  ['BurnTrophy','BurnTrophy','BurnTrophy','PiercingTrophy']
 ];
 const expectFace=(table,face)=>{
  if(face<=table.length) return [table[face-1]];
  if(face===11) return ['SmallPotionTrophy'];
  if(face===12) return ['PurifyWaterTrophy'];
  return [];
 };
 names.forEach((name,i)=>{for(let face=1;face<=12;face++){
  const loot=w.AdventureLoot.rollMonsterDrop('火山',name,null,face);
  assert.equal(loot.scene,'volcano');
  assert.deepEqual(Array.from(loot.drops),expectFace(tables[i],face));
 }});
 assert.match(w.AdventureLoot.describeMonsterDrop('VolcanoCrab'),/熔脉/);
 assert.equal(w.AdventureLoot.describeMonsterDrop('VolcanoCrab').includes('MagmaVeinTrophy'),false);
});
test('volcano bosses register with pools, loot, icons and stage gates',()=>{
 const pool=w.AdventureBossPool.volcano;
 for(const stage of [1,2,3,4]){
  assert.ok(w.AdventureEngine.availableScenes(stage).includes('volcano'));
  assert.ok(pool[stage].includes('VolcanoFlameLion'));
  assert.ok(pool[stage].includes('VolcanoMagmaRhino'));
  assert.equal(pool[stage].includes('VolcanoCinderPhoenix'),stage>=3);
 }
 const hp={VolcanoFlameLion:30,VolcanoMagmaRhino:35,VolcanoCinderPhoenix:40};
 bosses.forEach(name=>{
  const base=w.AdventureRegistry.getBoss(name);
  assert.ok(base);assert.equal(base.hp,hp[name]);assert.equal(base.handLimit,3);assert.equal(base.whiteZeros,1);
  assert.ok(fs.existsSync(path.join(root,'adventure',base.icon)));
  assert.equal(w.AdventureStageGuide[name].length,name==='VolcanoCinderPhoenix'?2:3);
  const s3=bridge.applyStageMods(base,3);
  assert.equal(s3.attackDamage(C(2)),base.attackDamage(C(2))+1);
  assert.equal(s3.attackDamage(C(5)),base.attackDamage(C(5))+1);
  assert.equal(s3.attackDamage(C(0)),name==='VolcanoFlameLion'?0:base.attackDamage(C(0))+1);
 });
 const faces={
  VolcanoFlameLion:['BurnTrophy','BurnTrophy','BurnTrophy','BurnTrophy','ScorchTrophy','ScorchTrophy'],
  VolcanoMagmaRhino:['MagmaVeinTrophy','MagmaVeinTrophy','MagmaVeinTrophy','GuardTrophy','GuardTrophy','GuardTrophy'],
  VolcanoCinderPhoenix:['FlyTrophy','FlyTrophy','FlyTrophy','ScorchTrophy','ScorchTrophy','BurnTrophy']
 };
 bosses.forEach(name=>{for(let face=1;face<=12;face++){
  const loot=w.AdventureLoot.rollMonsterDrop('volcano',name,null,face);
  const table=faces[name];
  let expected=[];
  if(face<=table.length) expected=[table[face-1]];
  else if(face===11) expected=['SmallPotionTrophy'];
  else if(face===12) expected=['PurifyWaterTrophy'];
  assert.deepEqual(Array.from(loot.drops),expected);
 }});
});
test('volcano boss attack and defend hooks follow volcano.md',()=>{
 const lion=w.AdventureRegistry.getBoss('VolcanoFlameLion');
 assert.equal(lion.attackDamage(C(2)),4);assert.equal(lion.attackBurn(C(2)),1);
 assert.equal(lion.attackUnblockable(C(5)),true);assert.equal(lion.attackScorch(C(5)),true);
 assert.equal(lion.attackDamage(C(0)),0);assert.equal(lion.attackBurn(C(0)),2);assert.equal(lion.attackBurnSettle(C(0)),true);
 assert.equal(lion.defendImmune(C(0)),true);assert.equal(lion.defendScorch(C(0)),true);
 const s4=bridge.applyStageMods(lion,4);
 assert.equal(s4.defendBlock(C(2),9),4);assert.equal(s4.defendBurn(C(0)),2);
 const rhino=w.AdventureRegistry.getBoss('VolcanoMagmaRhino');
 assert.equal(rhino.attackDamage(C(2)),3);assert.equal(rhino.attackGuard(C(2)),1);
 assert.equal(rhino.attackGainMagma(C(5)),1);
 assert.equal(rhino.attackUnblockableIfSelfBuff(C(0),{magmaVein:0}),false);
 assert.equal(rhino.attackUnblockableIfSelfBuff(C(0),{magmaVein:1}),true);
 assert.equal(rhino.defendBlock(C(0),7),0);assert.equal(rhino.defendCounter(C(0),7),7);
 const r4=bridge.applyStageMods(rhino,4);
 assert.equal(r4.defendBlock(C(2),7),Math.ceil(7/2));assert.equal(r4.defendGainMagma(C(2)),1);
 const phoenix=w.AdventureRegistry.getBoss('VolcanoCinderPhoenix');
 assert.equal(phoenix.minStage,3);
 assert.equal(phoenix.attackDamage(C(0)),5);assert.equal(phoenix.attackUnblockable(C(0)),true);assert.equal(phoenix.attackHeal(C(0)),3);
 assert.equal(phoenix.defendImmuneBuff(C(0)),true);assert.equal(phoenix.defendFly(C(0)),1);
 const p4=bridge.applyStageMods(phoenix,4);
 assert.equal(p4.defendCounter(C(2)),3);assert.equal(p4.defendHeal(C(0)),2);
 const e=engine('VolcanoFlameLion');e.s.player.burn=0;
 const atk=C(0);e.s.atkCard=atk;e.s.atkOwner='ai';
 const res=e.effect('VolcanoFlameLion',0,atk,e.s.ai,e.s.player);
 assert.equal(res.d,0);assert.equal(e.s.player.burn,1);
 const pe=engine('VolcanoCinderPhoenix',3);
 assert.equal(pe.s.ai.maxHp,40);
 pe.s.ai.fly=0;w.CharacterRegistry.get('VolcanoCinderPhoenix').turnStart(pe,pe.s.ai,'ai');
 assert.equal(pe.s.ai.fly,1);
 const lionDef=engine('VolcanoFlameLion');
 const d0=defense(lionDef,0,8);
 assert.equal(d0.remaining,0);assert.equal(!!lionDef.s.player.scorch,true);
});

const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),test=require('node:test');
let JSDOM;try{({JSDOM}=require('jsdom'));}catch(error){}
const root=path.resolve(__dirname,'..');
function setup(t,html=''){
  if(!JSDOM){t.skip('DOM regression tests require the local jsdom development dependency');return null;}
  const dom=new JSDOM('<body>'+html+'</body>',{runScripts:'outside-only',url:'http://localhost/game/index.html'});
  const w=dom.window,timers=new Map(),frames=new Map();let timerId=0,frameId=0;
  w.setTimeout=fn=>{timers.set(++timerId,fn);return timerId;};w.clearTimeout=id=>timers.delete(id);
  w.requestAnimationFrame=fn=>{frames.set(++frameId,fn);return frameId;};w.cancelAnimationFrame=id=>frames.delete(id);
  w.gameAssetUrl=p=>p;w.GameUI=function(){};
  const load=p=>w.eval(fs.readFileSync(path.join(root,p),'utf8'));
  load('js/ui/render/runtime.js');
  t.after(()=>dom.window.close());return {w,load,timers,frames};
}
test('status updates retain decoded image nodes and never restart entry animations',t=>{
  const env=setup(t,'<div id="player-buffs"></div>');if(!env)return;const {w,load}=env;
  load('js/combat/status_registry.js');load('js/ui/render/status_render.js');
  const ui=new w.GameUI(),ch={burn:1,guard:2};ui._updateBuffs('player',ch);
  const icon=w.document.querySelector('[data-buff-key="burn"]'),img=icon.querySelector('img');
  icon.dispatchEvent(new w.Event('animationend',{bubbles:true}));
  for(let i=0;i<30;i++)ui._updateBuffs('player',{burn:1,guard:2});
  ch.burn=2;ui._updateBuffs('player',ch);
  assert.equal(w.document.querySelector('[data-buff-key="burn"]'),icon);assert.equal(icon.querySelector('img'),img);
  assert.equal(icon.querySelector('.buff-count').textContent,'2');assert.ok(!icon.classList.contains('icon-appear'));
});
test('rapid removal and reapplication revives the same icon without a stale timer',t=>{
  const env=setup(t,'<div id="player-buffs"></div>');if(!env)return;const {w,load,timers}=env;
  load('js/combat/status_registry.js');load('js/ui/render/status_render.js');const ui=new w.GameUI();
  ui._updateBuffs('player',{burn:1});const icon=w.document.querySelector('.buff-icon-wrap');
  ui._updateBuffs('player',{});assert.ok(icon.classList.contains('icon-disappear'));
  ui._updateBuffs('player',{burn:2});assert.equal(w.document.querySelector('.buff-icon-wrap'),icon);
  assert.ok(!icon.classList.contains('icon-disappear'));for(const fn of [...timers.values()])fn();assert.ok(icon.isConnected);
});
test('currency changes patch text, not images, and duplicate item slots keep distinct keys',t=>{
  const env=setup(t,'<div id="host"></div>');if(!env)return;const {w}=env,host=w.document.getElementById('host'),dom=w.FurryGame.RenderDOM;
  dom.patchMarkup(host,'<span><img src="gold.webp">5</span><button data-render-key="x:0"><img src="x.webp"></button><button data-render-key="x:1"><img src="x.webp"></button>');
  const images=[...host.querySelectorAll('img')];
  dom.patchMarkup(host,'<span><img src="gold.webp">6</span><button data-render-key="x:0" disabled><img src="x.webp"></button><button data-render-key="x:1"><img src="x.webp"></button>');
  assert.deepEqual([...host.querySelectorAll('img')],images);assert.equal(host.querySelector('span').textContent,'6');assert.ok(host.querySelector('button').disabled);
});
test('full map/page composition preserves loaded image nodes',t=>{
  const env=setup(t,'<div id="host"><img src="room.webp"><img src="room.webp"></div>');if(!env)return;const {w}=env,host=w.document.getElementById('host');
  const images=[...host.querySelectorAll('img')];w.FurryGame.RenderDOM.replacePreservingImages(host,'<section><img src="room.webp"><span><img src="room.webp"></span></section>');
  assert.deepEqual([...host.querySelectorAll('img')],images);
});
test('all flights share one native animation frame and canceled callbacks stay canceled',t=>{
  const env=setup(t);if(!env)return;const {w,frames}=env,runtime=w.FurryGame.RenderFrames,called=[];
  const a=runtime.frame(()=>called.push('a'));runtime.frame(()=>{called.push('b');runtime.frame(()=>called.push('next'));});runtime.cancel(a);
  assert.equal(frames.size,1);const [id,fn]=[...frames][0];frames.delete(id);fn(10);
  assert.deepEqual(called,['b']);assert.equal(frames.size,1);[...frames.values()][0](20);assert.deepEqual(called,['b','next']);
});
test('item updates preserve click timers and do not accumulate event listeners',t=>{
  const env=setup(t,'<div id="adventure-item-bar"></div>');if(!env)return;const {w,load,timers}=env;
  const potion={name:'Potion',displayName:'药剂',description:'恢复',icon:'potion.webp'};
  w.AdventureRegistry={getItem:()=>({kind:'consumable',combatUse:'heal',useScene:'combat'})};
  load('js/ui/render/adventure_bar.js');const ui=new w.GameUI();ui._syncAdventureActionLayout=()=>{};ui._updateUseItemButton=()=>{};
  let s={isAdventure:true,phase:'PLAYER_PLAY',player:{},adventureConsumables:[potion],adventureAccessories:[]};ui.state=s;ui._renderAdventureItemBar(s);
  const button=w.document.querySelector('button'),img=button.querySelector('img');button.dispatchEvent(new w.MouseEvent('click',{detail:1}));
  for(let i=0;i<15;i++){s={...s};ui.state=s;ui._renderAdventureItemBar(s);}
  assert.equal(button.querySelector('img'),img);assert.equal(timers.size,1);const callback=[...timers.values()][0];timers.clear();callback();assert.equal(ui._selectedCombatItem,0);
  let used=0;ui._useSelectedCombatItem=async()=>used++;button.dispatchEvent(new w.MouseEvent('dblclick',{detail:2}));assert.equal(used,1);
});
test('card raster cache avoids path painting on hits but returns independent canvases',async t=>{
  const env=setup(t);if(!env)return;const {w,load}=env;let paths=0,blits=0;
  const context=new Proxy({drawImage(){blits++;},createLinearGradient:()=>({addColorStop(){}}),createRadialGradient:()=>({addColorStop(){}})},{get:(target,key)=>key in target?target[key]:(()=>{paths++;})});
  w.HTMLCanvasElement.prototype.getContext=()=>context;
  w.Image=class{set src(value){this.complete=true;this.naturalWidth=32;Promise.resolve().then(()=>this.onload&&this.onload());}};
  load('js/ui/card_style.js');await w.cardIconsReady;
  const card={color:'RED',value:2,isNumberCard:true},a=w.CardStyle.renderCard(card,70,100,false);paths=0;blits=0;
  const b=w.CardStyle.renderCard(card,70,100,true);assert.notEqual(a,b);assert.equal(paths,0);assert.equal(blits,1);assert.ok(b.classList.contains('selected'));
  paths=0;w.CardStyle.renderCard({...card,isWhite:true,color:'WHITE',npcCard:true},70,100,false);assert.ok(paths>0,'NPC border is a distinct cached face');
});
test('projection serializes once and still isolates nested hand and event data',t=>{
  const env=setup(t);if(!env)return;const {w,load}=env;load('js/combat/state.js');let count=0;const original=w.JSON.stringify;w.JSON.stringify=(...args)=>{count++;return original(...args);};
  const engine={s:{phase:'PLAYER_PLAY',turn:1,player:{hp:10},ai:{hp:20},revealAIHand:true},h:{player:[{uid:'a',value:2}],ai:[{uid:'b'}]},deck:[],discardBottom:[],events:[{data:{value:3}}]};
  const projected=w.FurryGame.CombatState.project(engine);assert.equal(count,1);projected.playerHand[0].value=9;projected.events[0].data.value=9;assert.equal(engine.h.player[0].value,2);assert.equal(engine.events[0].data.value,3);
});

test('real adventure inventory is projected without taking full map snapshots',t=>{
  const env=setup(t,'<div id="adventure-item-bar"></div><button id="btn-use-item"></button>');if(!env)return;const {w,load}=env;
  const defs={
    Potion:{name:'Potion',displayName:'药剂',description:'恢复',icon:'potion.webp',kind:'consumable',combatUse:'heal',useScene:'combat'},
    Shield:{name:'Shield',displayName:'能量盾',description:'守护',icon:'shield.webp',kind:'accessory'}
  };
  w.AdventureRegistry={getItem:name=>defs[name]};
  const engine={s:{consumables:['Potion'],accessories:['Shield']},snapshot(){throw Error('Full map snapshot must not run');}};
  w.AdventureBattleController={activeEngine:()=>({_adventureEngine:engine})};
  load('js/ui/render/adventure_bar.js');const ui=new w.GameUI();ui._syncAdventureActionLayout=()=>{};
  ui.state={isAdventure:true,phase:'PLAYER_PLAY',player:{}};ui._renderAdventureItemBar(ui.state);
  assert.equal(w.document.querySelector('.adv-combat-item img').getAttribute('src'),'potion.webp');
  assert.equal(w.document.querySelector('[data-acc-name="Shield"] img').getAttribute('src'),'shield.webp');
  ui._selectedCombatItem=0;ui._updateUseItemButton();assert.equal(w.document.getElementById('btn-use-item').textContent,'使用[药剂]');
});

test('consuming an earlier item retains later image nodes when their indices shift',t=>{
  const env=setup(t,'<div id="adventure-item-bar"></div>');if(!env)return;const {w,load}=env;
  const defs={A:{name:'A',displayName:'A',icon:'a.webp',kind:'consumable'},B:{name:'B',displayName:'B',icon:'b.webp',kind:'consumable'}};
  w.AdventureRegistry={getItem:n=>defs[n]};load('js/ui/render/adventure_bar.js');const ui=new w.GameUI();
  ui._syncAdventureActionLayout=()=>{};ui._canUseAdventureCombatItem=()=>true;
  ui.state={isAdventure:true,phase:'PLAYER_PLAY',adventureConsumables:[defs.A,defs.B],adventureAccessories:[]};
  ui._renderAdventureItemBar(ui.state);const image=w.document.querySelector('img[src="b.webp"]');
  ui.state.adventureConsumables=[defs.B];ui._renderAdventureItemBar(ui.state);
  assert.equal(w.document.querySelector('[data-item-index="0"] img'),image);assert.ok(!image.parentElement._renderRetirement);
});

function handGlobals(w){
  w.currentCardSize=()=>[70,100];w.cardVisualKey=c=>JSON.stringify(c);
  w.cardId=c=>c.uid;w.cardMatchKey=c=>c.uid;
  let painted=0;
  w.renderCard=(card,width,height,selected)=>{painted++;const c=w.document.createElement('canvas');c.className='card-canvas'+(selected?' selected':'');return c;};
  w.renderCardBack=()=>{painted++;return w.document.createElement('canvas');};
  return ()=>painted;
}

test('player selections update classes without repainting, and explicit invalidation still redraws',t=>{
  const env=setup(t,'<div id="player-hand"></div>');if(!env)return;const {w,load}=env,painted=handGlobals(w);
  load('js/ui/render/hand_render.js');const ui=new w.GameUI();ui._hideTrailingCount=()=>0;ui._hideTooltip=()=>{};
  ui.state={phase:'PLAYER_PLAY',selectedCard:-1,selectedCards:[],legalHand:[true,true],playerHand:[{uid:'a'},{uid:'b'}]};
  ui._renderPlayerHand();const host=w.document.getElementById('player-hand'),nodes=[...host.children];
  ui.state.selectedCard=1;ui._renderPlayerHand();
  assert.deepEqual([...host.children],nodes);assert.equal(painted(),2);assert.ok(nodes[1].classList.contains('selected'));
  host.dataset.handRenderKey='';ui._renderPlayerHand();assert.equal(painted(),4);
});

test('1v2 opponent hands reuse canvases while skill hover reads live buff data',t=>{
  const env=setup(t,'<div id="ai-hand"></div><div id="ai2-hand"></div>');if(!env)return;const {w,load}=env,painted=handGlobals(w);
  load('js/ui/mode_1v2.js');const ui=new w.GameUI();ui._hideTrailingCount=()=>0;ui._combatDisplayName=n=>n;
  ui.state={is1v2:true,isAdventure:true,phase:'PLAYER_PLAY',ai:{name:'Ladybug',alive:true,lush:1},ai2:{name:'Wolf',alive:true},aiHand:[{uid:'a'}],ai2Hand:[{uid:'b'}],aiHandSize:1,ai2HandSize:1};
  ui._adventureSkillDescOpts=()=>({attackerLush:ui.state.ai.lush});let shown;ui._showTooltip=(card,node,defend,opts)=>shown=opts;
  ui._renderAIHand1v2();const first=w.document.getElementById('ai-hand').firstChild;
  for(let i=0;i<25;i++)ui._renderAIHand1v2();
  assert.equal(painted(),2);assert.equal(w.document.getElementById('ai-hand').firstChild,first);
  ui.state.ai.lush=2;ui._renderAIHand1v2();first.dispatchEvent(new w.Event('mouseenter'));assert.equal(shown.adventureOpts.attackerLush,2);
});

test('particle trajectories depend on elapsed time, not display refresh rate',t=>{
  const env=setup(t);if(!env)return;const {w,load,frames}=env;
  w.FurryGame.CombatRuntime={random:()=>0.5};w.uiFrame=fn=>w.FurryGame.RenderFrames.frame(fn);w.uiCancelFrame=id=>w.FurryGame.RenderFrames.cancel(id);
  w.performance.now=()=>0;load('js/ui/feedback.js');const ui=new w.GameUI();
  const tick=now=>{const batch=[...frames];frames.clear();batch.forEach(([,fn])=>fn(now));};
  ui.burstParticles(10,20,'red',4);tick(300);
  const first=[...w.document.querySelectorAll('.burst-particle')].map(el=>el.style.transform);
  assert.equal(first.length,4);assert.equal(w.document.querySelector('.burst-particle').style.left,'10px');
  tick(600);assert.equal(w.document.querySelectorAll('.burst-particle').length,0);
  ui.burstParticles(10,20,'red',4);for(let now=10;now<=300;now+=10)tick(now);
  assert.deepEqual([...w.document.querySelectorAll('.burst-particle')].map(el=>el.style.transform),first);
});

test('homepage WebP gallery ignores height-only resizes and coalesces real width changes',async t=>{
  const env=setup(t,'<div class="gallery-cylinder-viewport"><div class="gallery-cylinder-layers"></div></div><div class="gallery-cylinder-seed"><img src="a.webp"><img src="b.webp"></div>');if(!env)return;
  const {w,load,frames}=env,viewport=w.document.querySelector('.gallery-cylinder-viewport'),layers=w.document.querySelector('.gallery-cylinder-layers');
  let width=500,decoded=0;Object.defineProperty(viewport,'clientWidth',{get:()=>width});
  w.Image=class{
    constructor(){this.naturalWidth=32;this.naturalHeight=40;}
    set src(value){Promise.resolve().then(()=>this.onload());}
    decode(){decoded++;return Promise.resolve();}
  };
  load('../js/gallery-cylinder.js');await new Promise(resolve=>setImmediate(resolve));
  assert.equal(decoded,2);assert.equal(w.__riumGalleryReady,true);
  const first=layers.firstChild;assert.ok(first);
  for(let i=0;i<30;i++)w.dispatchEvent(new w.Event('resize'));
  assert.equal(frames.size,1);
  const tick=()=>{const batch=[...frames];frames.clear();batch.forEach(([,fn])=>fn(10));};
  tick();assert.equal(layers.firstChild,first);
  width=800;for(let i=0;i<30;i++)w.dispatchEvent(new w.Event('resize'));assert.equal(frames.size,1);
  tick();assert.notEqual(layers.firstChild,first);
});


function adventurePanelHarness(t, phase) {
 const env=setup(t,'<div id="panels"></div>');if(!env)return null;
 const {w,load}=env;
 w.RoomType={BOSS:'boss',EMPTY:'empty'};
 w.AdventurePhase={MAP:'map',SHOP:'shop',BLACKSMITH:'blacksmith',REWARD:'reward',COMBAT:'combat',PLAYER_PLAY:'play',PLAYER_DEFEND:'defend',NPC_TURN:'npc',CLEAR:'clear',GAME_OVER:'over'};
 load('adventure/js/content/currency.js');load('adventure/js/ui/adventure_ui.js');
 load('adventure/js/ui/adventure_ui_map_view.js');load('adventure/js/ui/adventure_ui_panels.js');load('adventure/js/ui/adventure_ui_views.js');
 const item=(name,icon)=>({name,displayName:name,description:'效果',icon,price:5,beastCost:['ben','ben'],beastCostText:'2本'});
 const items=[item('Potion','potion.webp'),item('Shield','shield.webp'),item('Laser','laser.webp')];
 w.AdventureRegistry={getItem:name=>items.find(item=>item.name===name)};
 w.AdventureDeck={trophyWhite:name=>({trophyName:name,color:'WHITE'})};w.CardStyle={iconRevision:1};
 w.renderCard=(card,width,height)=>{const canvas=w.document.createElement('canvas');canvas.width=width;canvas.height=height;canvas._painted=JSON.stringify(card);return canvas;};
 const snap={phase,stage:2,scene:'forest',player:{name:'Ryan',type:'战士',hp:70,maxHp:70,buffs:{}},currency:{gold:20,tokens:{ben:3,cao:1,shui:1,huo:1,wuneng:0},totalBeast:6,maxBeast:8},roomInfo:{shopSlots:[...items,...items],blacksmithSlots:items,blacksmithTrophy:{name:'BurnTrophy',displayName:'灼伤',kind:'trophyWhite',beastCost:['ben','ben'],description:'灼伤'}},consumables:[items[0]],accessories:[items[1]],trophyWhiteCards:[],playerPile:{hand:[{value:3,color:'RED'}],handCount:1,deckCount:93,discardCount:0},blacksmithCanPay:{slots:[true,true,true],trophy:true},logEntries:[]};
 const ui=Object.create(w.AdventureUI.prototype);ui.container=w.document.getElementById('panels');ui._test=null;ui._toast=()=>{};
 let selections=0;
 ui.eng={s:snap,selectShopSlot(index){selections++;snap.shopSelectedSlot=index;},selectBlacksmithSlot(index){selections++;snap.blacksmithSelectedSlot=index;}};
 ui.render=()=>w.AdventureUIViews.render(ui,snap);ui.bindActions();ui.render();
 return {...env,ui,snap,selections:()=>selections};
}

test('shop and blacksmith clicks update in place without disconnecting icons or card faces',t=>{
 for(const phase of ['shop','blacksmith']) {
  const env=adventurePanelHarness(t,phase);if(!env)return;
  const {w,ui,snap}=env,host=ui.container;
  const images=[...host.querySelectorAll('img')],canvases=[...host.querySelectorAll('canvas')];
  const attr=phase==='shop'?'data-shop-slot':'data-blacksmith-slot';
  const buttons=[...host.querySelectorAll('['+attr+']')];
  const observer=new w.MutationObserver(()=>{});observer.observe(host,{subtree:true,childList:true,attributes:true,attributeFilter:['src','width','height']});
  for(let i=0;i<30;i++)buttons[i%3].click();
  assert.equal(env.selections(),30);
  assert.deepEqual([...host.querySelectorAll('img')],images);
  assert.deepEqual([...host.querySelectorAll('canvas')],canvases);
  assert.ok(canvases.every(canvas=>canvas._painted),'painted canvases are never replaced by blank clones');
  for(const record of observer.takeRecords()) {
   if(record.type==='attributes')assert.ok(!images.includes(record.target)&&!canvases.includes(record.target),'unchanged asset attributes are not rewritten');
   for(const removed of record.removedNodes)for(const asset of [...images,...canvases])assert.ok(removed!==asset&&!(removed.contains&&removed.contains(asset)),'assets remain in the live document');
  }
  observer.disconnect();
  if(phase==='shop') {
   const keep=buttons[1].querySelector('img');snap.roomInfo.shopSlots[0]={...snap.roomInfo.shopSlots[0],icon:'new.webp'};ui.render();
   assert.equal(host.querySelector('[data-shop-slot="1"] img'),keep,'refreshing one product does not recreate other icons');
   assert.equal(host.querySelector('[data-shop-slot="0"] img').getAttribute('src'),'new.webp');
  } else {
   const old=host.querySelector('.adv-scene-trophy-card-canvas');
   snap.roomInfo.blacksmithTrophy={...snap.roomInfo.blacksmithTrophy,name:'GuardTrophy'};ui.render();
   const next=host.querySelector('.adv-scene-trophy-card-canvas');assert.notEqual(next,old);assert.match(next._painted,/GuardTrophy/);
  }
 }
});

test('tree patching retains duplicate icons and adopts new canvas pixels',t=>{
 const env=setup(t,'<div id="tree"></div>');if(!env)return;const {w}=env,host=w.document.getElementById('tree'),dom=w.FurryGame.RenderDOM;
 const make=()=>{const box=w.document.createElement('div');box.innerHTML='<img src="same.webp"><img src="same.webp">';const canvas=w.document.createElement('canvas');canvas._pixels='painted';canvas.dataset.renderKey='face';box.appendChild(canvas);return box;};
 dom.patchTree(host,[make()]);const images=[...host.querySelectorAll('img')],canvas=host.querySelector('canvas');
 for(let i=0;i<20;i++)dom.patchTree(host,[make()]);
 assert.deepEqual([...host.querySelectorAll('img')],images);assert.equal(images.length,2);
 assert.equal(host.querySelector('canvas'),canvas);assert.equal(canvas._pixels,'painted');
});

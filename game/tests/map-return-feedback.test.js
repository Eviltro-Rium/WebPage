const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {JSDOM} = require('jsdom');

test('map return preserves accessory feedback through redraws and reveals cards only at arrival', () => {
  const dom = new JSDOM('<div id="map"><div class="adventure-sidebar"><div class="adv-hp-bar"></div><div data-accessory-name="LifeCore"></div><div data-accessory-name="WisdomNecklace"></div><div class="adv-deck-info"></div><div id="adv-hand-zone"><div></div><div></div></div></div></div>', {runScripts:'outside-only'});
  const w = dom.window, tasks = [], animations = [];
  try {
    w.AdventurePhase = {MAP:'MAP'};
    w.FurryGame = {CombatRuntime:{random:()=>0, schedule:(owner,fn,ms,channel)=>tasks.push({owner,fn,ms,channel})}};
    w.renderCard = () => w.document.createElement('div');
    w.HTMLElement.prototype.animate = function(frames,options) {
      const animation = {frames,options}; animations.push(animation); return animation;
    };
    w.eval(fs.readFileSync(path.join(__dirname,'../adventure/js/ui/adventure_ui.js'),'utf8'));
    const ui = Object.create(w.AdventureUI.prototype);
    ui.container = w.document.getElementById('map');
    let settlements = 0;
    ui.eng = {s:{phase:'MAP'}, snapshot:()=>({playerPile:{hand:[{value:1},{value:2}]}}), onCombatReturnToMap:()=>settlements++};
    ui._pendingMapReturnEffect = {itemName:'WisdomNecklace',drawn:2};
    ui._pendingMapHeals = [{itemName:'LifeCore',label:'生命核心',amount:3},{label:'进入新层',amount:10}];
    const hand = ui.container.querySelector('#adv-hand-zone'), original = hand.firstChild;
    ui._queueMapReturnFeedback();
    assert(ui.container.querySelector('[data-accessory-name="WisdomNecklace"]').classList.contains('adv-accessory-trigger'));
    assert.equal(original.style.visibility,'hidden');
    ui.render();
    assert.equal(settlements,0,'redraw must not re-run settlement or replace animated nodes');
    assert.equal(hand.firstChild,original);
    assert(tasks.some(task=>task.owner===ui && task.channel==='map-feedback-render'));
    tasks.find(task=>task.ms===0).fn();
    tasks.find(task=>task.ms===1600).fn();
    assert(ui.container.querySelector('[data-accessory-name="LifeCore"]').classList.contains('adv-accessory-trigger'));
    assert.deepEqual(Array.from(ui.container.querySelectorAll('.adv-map-heal-float'),node=>node.textContent),['[生命核心]❤️3','[进入新层]❤️10']);
    tasks.find(task=>task.ms===360).fn();
    assert(w.document.querySelector('.adv-wisdom-fly-card'));
    assert.equal(original.style.visibility,'hidden');
    animations[0].onfinish();
    assert.equal(original.style.visibility,'');
    assert(original.classList.contains('adv-wisdom-draw-card'));
    tasks.find(task=>task.ms===500).fn();
    animations[1].onfinish();
    assert.equal(hand.lastChild.style.visibility,'');
    assert.equal(w.document.querySelector('.adv-wisdom-fly-card'),null);
    assert.equal(ui._pendingMapReturnEffect,null);
    assert.equal(ui._pendingMapHeals.length,0);
  } finally { dom.window.close(); }
});

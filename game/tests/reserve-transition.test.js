const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { JSDOM } = require('jsdom');

function setup(reduced = false) {
  const dom = new JSDOM('<div class="player-hand-zone"><div class="player-hand-layout"><div id="player-hand"></div><div class="reserve-zone" id="player-reserve" hidden></div></div></div>', {runScripts:'outside-only'});
  const w=dom.window;
  w.matchMedia = () => ({matches:reduced});
  w.GameUI = class {};
  w.currentCardSize = () => [70,100];
  w.cardMatchKey = card => String(card.value);
  w.renderCard = () => { const node=w.document.createElement('canvas');node.className='card-canvas';return node; };
  w.eval(fs.readFileSync(path.resolve(__dirname,'../js/ui/render/hand_render.js'),'utf8'));
  const ui=new w.GameUI();ui._apiAction=()=>{};ui._showTooltip=()=>{};ui._hideTooltip=()=>{};
  const hand=w.document.getElementById('player-hand'),reserve=w.document.getElementById('player-reserve');
  const state={isAdventure:true,phase:'PLAYER_PLAY',reserveCards:[{value:2}],selectedReserveIndex:null};
  return {dom,ui,hand,reserve,state};
}

test('reserve opens once and closes smoothly after its last card is used', async () => {
  const {dom,ui,hand,reserve,state}=setup();
  try {
    ui._renderReserveCards(hand,state);
    assert.equal(reserve.hidden,false);
    assert.equal(reserve.classList.contains('is-open'),true);
    ui._renderReserveCards(hand,state);
    assert.equal(reserve.classList.contains('is-open'),true);
    state.reserveCards=[];
    ui._renderReserveCards(hand,state);
    assert.equal(reserve.hidden,false);
    assert.equal(reserve.classList.contains('is-closing'),true);
    assert.equal(reserve.getAttribute('aria-hidden'),'true');
    await new Promise(resolve=>setTimeout(resolve,330));
    assert.equal(reserve.hidden,true);
    assert.equal(reserve.children.length,0);
  } finally {dom.window.close();}
});

test('a new reserve card cancels an in-progress close', async () => {
  const {dom,ui,hand,reserve,state}=setup();
  try {
    ui._renderReserveCards(hand,state);
    state.reserveCards=[];ui._renderReserveCards(hand,state);
    state.reserveCards=[{value:3}];ui._renderReserveCards(hand,state);
    await new Promise(resolve=>setTimeout(resolve,330));
    assert.equal(reserve.hidden,false);
    assert.equal(reserve.classList.contains('is-open'),true);
    assert.equal(reserve.querySelectorAll('.card-canvas').length,1);
  } finally {dom.window.close();}
});

test('reduced motion closes the reserve immediately', () => {
  const {dom,ui,hand,reserve,state}=setup(true);
  try {
    ui._renderReserveCards(hand,state);
    state.reserveCards=[];ui._renderReserveCards(hand,state);
    assert.equal(reserve.hidden,true);
    assert.equal(reserve.children.length,0);
  } finally {dom.window.close();}
});

test('reserve card can be double-clicked across a rerender while selection is pending', async () => {
  const {dom,ui,hand,reserve,state}=setup();
  try {
    ui.state=state;let finishSelection;const actions=[];
    ui._apiAction=(method,params)=>{
      actions.push(method);
      if(method==='selectReserveCard'){
        state.selectedReserveIndex=params.index;
        ui._renderReserveCards(hand,state);
        return new Promise(resolve=>{finishSelection=()=>resolve(true);});
      }
      return Promise.resolve(true);
    };
    ui._renderReserveCards(hand,state);
    reserve.querySelector('canvas').click();
    reserve.querySelector('canvas').click();
    assert.deepEqual(actions,['selectReserveCard']);
    finishSelection();
    await new Promise(resolve=>setTimeout(resolve,0));
    assert.deepEqual(actions,['selectReserveCard','doPlay']);
  } finally {dom.window.close();}
});

test('stale unblockable flag does not disable reserve cards in attack phase', () => {
  const {dom,ui,hand,reserve,state}=setup();
  try {
    ui.state=state;state.unblockDefend=true;state.legalReserve=[true];
    ui._renderReserveCards(hand,state);
    assert.equal(reserve.querySelector('canvas').classList.contains('disabled'),false);
    state.phase='PLAYER_DEFEND';ui._renderReserveCards(hand,state);
    assert.equal(reserve.querySelector('canvas').classList.contains('disabled'),true);
  } finally {dom.window.close();}
});

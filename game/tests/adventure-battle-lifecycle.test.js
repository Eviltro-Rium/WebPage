const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {JSDOM} = require('jsdom');

test('rewind isolates old UI, timers, persistence and event acknowledgements from reentry', async () => {
  const dom = new JSDOM('<div id="adventure-container"></div><div id="game-container"><div id="game-screen"></div></div>', {runScripts:'outside-only'});
  const w = dom.window, instances = [], saves = [];
  try {
    w.Bridge = {};
    w.AnimLayer = class {};
    w.AdventureBattleSession = {save:e=>saves.push(e), clear(){}};
    w.GameUI = class {
      constructor(){instances.push(this);this._handAnimationDepth=0;this._drawAnimationRemaining=null;}
      _initParticles(){} _buildGameScreen(){} _buildGameScreen1v2(){} _startPolling(){} updateDisplay(){} _hideTooltip(){}
    };
    w.AdventureBattleEngine = class {
      constructor(){this.events=[];this.s={phase:'PLAYER_PLAY',player:{hp:10,alive:true}};this.later=()=>{};}
      startAdventure(){return this.state();}
      startAdventure1v2(){return this.state();}
      dispatch(method){if(method==='clearEvents')this.events=[];return this.state();}
      state(){return {...this.s,events:this.events};}
      finishAdventureBattle(){return {};}
    };
    w.eval(fs.readFileSync(path.join(__dirname,'../adventure/js/battle/adventure_battle_controller.js'),'utf8'));
    const c=w.AdventureBattleController;
    for(const dual of [false,true]) {
      const start=()=>dual ? c.startCombat1v2('Otto','ForestDeer','ForestDeer',()=>{},{testMode:true}) : c.startCombat('Otto','ForestDeer',()=>{},{testMode:true});
      await start();
      const oldUI=instances.at(-1), oldEngine=c.activeEngine(), oldSession=oldUI.session;
      oldUI._handAnimationDepth=1;oldUI._drawAnimationRemaining={player:6};oldUI._isPollingAI=true;
      let timerFired=false;oldEngine.timer=w.setTimeout(()=>timerFired=true,0);
      oldEngine.testMode=true;
      assert.equal(c.abortCombatRewind(),true);
      await start();
      const nextUI=instances.at(-1), nextEngine=c.activeEngine();
      assert.notEqual(nextUI,oldUI);
      assert.equal(oldUI._disposed,true);
      assert.equal(nextUI._handAnimationDepth,0);
      assert.equal(nextUI._drawAnimationRemaining,null);
      nextEngine.events=[{id:1,type:'aiPlay'}];
      const count=saves.length;
      oldSession.acknowledgeEvents(10000);
      assert.equal(oldSession.getState(),null);
      assert.equal(nextEngine.events.length,1);
      assert.equal(saves.length,count);
      nextUI.session.acknowledgeEvents(1);
      assert.equal(nextEngine.events.length,0);
      await new Promise(resolve=>w.setTimeout(resolve,5));
      assert.equal(timerFired,false);
      c.abandonAdventure();
    }
  } finally {dom.window.close();}
});

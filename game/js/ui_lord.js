(function(){
  GameUI.prototype._startGameLord=async function(){
    try {
      console.log('[Lord] _startGameLord starting');
      await Bridge.call('selectMode',{mode1v2:true,mode:'lord'});
      console.log('[Lord] selectMode done');
      const result=await Bridge.call('selectCharacters1v2',{player:this._selectedPlayerChar,ai:this._selectedAIChar,ai2:this._selectedAI2Char,mode:'lord'});
      console.log('[Lord] selectCharacters1v2 result:', result?.error || 'ok', 'isLord:', result?.isLord);
      if(result.error){this.showError(result.error);return}
      this.state=result;this.selectScreen.classList.remove('active');this.gameScreen.classList.add('active');
      this._buildGameScreen1v2();this.updateDisplay();this._startPolling()
    } catch(e) {
      console.error('[Lord] _startGameLord error:',e);
      this.showError('启动领主模式失败: '+e.message);
    }
  };

  const _origBuildGameScreen1v2=GameUI.prototype._buildGameScreen1v2;

  GameUI.prototype._buildGameScreen1v2=function(){
    if(!this.state||!this.state.isLord)return _origBuildGameScreen1v2.call(this);
    const s=this.state;
    let html=`
      <div class="game-title">Furry Battle 领主模式</div>
      <div class="top-bar">
        <div class="deck-area" id="deck-area"><canvas id="deck-icon" width="40" height="52"></canvas><span class="deck-info" id="deck-info">牌堆: 0</span></div>
        <span class="phase-info" id="phase-info">出牌阶段</span>
        <span class="turn-info" id="turn-info">回合 1</span>
        <button class="menu-btn" id="menu-btn">☰</button>
      </div>
      <div class="hp-section" id="ai-hp-section">
        <span class="attacker-indicator">进攻方</span>
        <img class="hp-avatar" id="ai-avatar" src="" alt="">
        <span class="hp-name" id="ai-name">AI</span>
        <div class="hp-bar-outer"><div class="hp-bar-inner" id="ai-hp-bar" style="width:100%"></div><span class="hp-text" id="ai-hp-text">100/100</span></div>
        <div class="buff-icons" id="ai-buffs"></div>
      </div>
      <div class="hp-section ai2-hp-section" id="ai2-hp-section">
        <span class="attacker-indicator">进攻方</span>
        <img class="hp-avatar" id="ai2-avatar" src="" alt="">
        <span class="hp-name" id="ai2-name">AI2</span>
        <div class="hp-bar-outer"><div class="hp-bar-inner" id="ai2-hp-bar" style="width:100%"></div><span class="hp-text" id="ai2-hp-text">100/100</span></div>
        <div class="buff-icons" id="ai2-buffs"></div>
      </div>
      <div class="ai-area">
        <div class="ai-hand-zone"><div class="zone-title">AI1 手牌</div><div class="ai-hand-row" id="ai-hand"></div></div>
        <div class="ai-hand-zone" style="border-color:#a855f7"><div class="zone-title" style="color:#c084fc">AI2 手牌</div><div class="ai-hand-row" id="ai2-hand"></div></div>
        <div class="play-zone"><div class="play-zone-row">
          <div class="attack-zone"><div class="zone-title">进攻</div><div class="zone-cards" id="atk-cards"><span style="color:rgba(255,255,255,0.5);font-size:0.7rem">等待出牌</span></div><div class="zone-desc" id="atk-desc"></div></div>
          <div class="defend-zone"><div class="zone-title">防御</div><div class="zone-cards" id="def-cards"><span style="color:rgba(255,255,255,0.5);font-size:0.7rem">等待防御</span></div><div class="zone-desc" id="def-desc"></div></div>
        </div></div>
        <div class="reveal-zone"><div class="zone-title">判定</div><div class="reveal-card-area" id="reveal-cards"><span class="reveal-empty">等待判定</span></div><div class="reveal-desc" id="reveal-desc"></div></div>
        <div class="discard-zone"><div class="zone-title">弃牌库顶</div><div class="discard-card-area" id="discard-top"></div></div>
      </div>
      <div class="hp-section" id="player-hp-section">
        <span class="attacker-indicator">进攻方</span>
        <img class="hp-avatar" id="player-avatar" src="" alt="">
        <span class="hp-name" id="player-name">你</span>
        <div class="hp-bar-outer"><div class="hp-bar-inner" id="player-hp-bar" style="width:100%"></div><span class="hp-text" id="player-hp-text">70/70</span></div>
        <div class="buff-icons" id="player-buffs"></div>
      </div>
      <div class="error-hint" id="error-hint"></div>
      <div class="player-hand-zone"><div class="zone-title">你的手牌</div><div class="hand-row" id="player-hand"></div></div>
      <div class="lord-dice-inline" id="lord-dice-inline" style="display:none">
        <div class="lord-dice-label">领主骰子</div>
        <div class="lord-dice" id="lord-dice-num">?</div>
        <div class="lord-dice-result" id="lord-dice-result"></div>
      </div>
      <div class="action-desc" id="action-desc"></div>
      <div class="controls" id="controls"></div>`;
    this.gameScreen.innerHTML=html
  };

  GameUI.prototype._playDiceAnimation=function(roll,target){
    return new Promise(resolve=>{
      const container=document.getElementById('lord-dice-inline');
      const dice=document.getElementById('lord-dice-num');
      const result=document.getElementById('lord-dice-result');
      if(!container||!dice||!result){resolve();return}

      container.style.display='flex';
      dice.textContent='?';
      dice.className='lord-dice';
      result.textContent='';

      let count=0;
      const maxCount=12;
      const interval=setInterval(()=>{
        dice.textContent=Math.floor(Math.random()*6)+1;
        dice.classList.add('lord-dice-spin');
        count++;
        if(count>=maxCount){
          clearInterval(interval);
          dice.textContent=roll;
          dice.className='lord-dice lord-dice-landed';
          const targetName=target==='ai2'?(this.state.ai2?this.state.ai2.name:'AI2'):(this.state.ai?this.state.ai.name:'AI1');
          result.textContent=roll+' → '+targetName;
          result.style.color=target==='ai2'?'#c084fc':'#f87171';
          setTimeout(()=>{container.style.display='none';resolve()},1200);
        }
      },80);
    });
  };
})();

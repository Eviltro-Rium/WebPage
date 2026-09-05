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
      this._buildGameScreen1v2();this.updateDisplay();await this._playOpeningEvents();this._startPolling()
    } catch(e) {
      console.error('[Lord] _startGameLord error:',e);
      this.showError('启动领主模式失败: '+e.message);
    }
  };

  const _origBuildGameScreen1v2=GameUI.prototype._buildGameScreen1v2;

  GameUI.prototype._buildGameScreen1v2=function(){
    if(!this.state||!this.state.isLord)return _origBuildGameScreen1v2.call(this);
    const s=this.state;
    const adv=!!s.isAdventure;
    const ai1Label=adv?'对手':'AI';
    const ai2Label=adv?'对手2':'AI2';
    const ai1HandTitle=adv?'对手手牌':'AI1 手牌';
    const ai2HandTitle=adv?'对手2手牌':'AI2 手牌';
    const gameTitle=adv?'Furry Trial 冒险':'Furry Battle 领主模式';
    let html=`
      <div class="game-title">${gameTitle}</div>
      <div class="top-bar">
        <div class="deck-area" id="deck-area"><canvas id="deck-icon" width="40" height="52"></canvas><span class="deck-info" id="deck-info">牌堆: 0</span></div>
        <div class="npc-deck-info" id="npc-deck-info" style="display:none"></div>
        <span class="phase-info" id="phase-info">出牌阶段</span>
        <span class="turn-info" id="turn-info">回合 1</span>
        <button class="menu-btn" id="menu-btn">☰</button>
      </div>
      <div class="hp-section" id="ai-hp-section">
        <span class="attacker-indicator">进攻方</span>
        <img class="hp-avatar" id="ai-avatar" src="" alt="">
        <span class="hp-name" id="ai-name">${ai1Label}</span>
        <div class="hp-bar-outer"><div class="hp-bar-inner" id="ai-hp-bar" style="width:100%"></div><span class="hp-text" id="ai-hp-text">100/100</span></div>
        <div class="buff-icons" id="ai-buffs"></div>
      </div>
      <div class="hp-section ai2-hp-section" id="ai2-hp-section">
        <span class="attacker-indicator">进攻方</span>
        <img class="hp-avatar" id="ai2-avatar" src="" alt="">
        <span class="hp-name" id="ai2-name">${ai2Label}</span>
        <div class="hp-bar-outer"><div class="hp-bar-inner" id="ai2-hp-bar" style="width:100%"></div><span class="hp-text" id="ai2-hp-text">100/100</span></div>
        <div class="buff-icons" id="ai2-buffs"></div>
      </div>
      <div class="ai-area">
        <div class="ai-hand-zone"><div class="zone-title">${ai1HandTitle}</div><div class="ai-hand-row" id="ai-hand"></div></div>
        <div class="ai-hand-zone" style="border-color:#a855f7"><div class="zone-title" style="color:#c084fc">${ai2HandTitle}</div><div class="ai-hand-row" id="ai2-hand"></div></div>
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
      <div class="adventure-info-bar" id="adventure-info-bar" style="display:none"></div>
      <div class="adventure-item-bar" id="adventure-item-bar" style="display:none"></div>
      <div class="player-hand-zone"><div class="zone-title">你的手牌</div><div class="hand-row" id="player-hand"></div></div>
      <div class="lord-turn-hint" id="lord-turn-hint" style="display:none"></div>

      <div class="action-desc" id="action-desc"></div>
      <div class="controls" id="controls"></div>`;
    this.gameScreen.innerHTML=html
  };
})();

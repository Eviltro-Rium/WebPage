(function(){
  const _origBuildSelect=GameUI.prototype._buildSelectScreen;
  const _origBuildGame=GameUI.prototype._buildGameScreen;
  const _origUpdate=GameUI.prototype.updateDisplay;
  const _origStart=GameUI.prototype._startGame;
  const _origRenderAI=GameUI.prototype._renderAIHand;
  const _origRenderControls=GameUI.prototype._renderControls;

  GameUI.prototype._buildSelectScreen=function(){
    if(!this._is1v2)return _origBuildSelect.call(this);
    _origBuildSelect.call(this);
  };

  GameUI.prototype._startGame1v2=async function(){
    try {
      await Bridge.call('selectMode',{mode1v2:true});
      const result=await Bridge.call('selectCharacters1v2',{player:this._selectedPlayerChar,ai:this._selectedAIChar,ai2:this._selectedAI2Char});
      if(result.error){this.showError(result.error);return}
      this.state=result;this.selectScreen.classList.remove('active');this.gameScreen.classList.add('active');
      this._buildGameScreen1v2();this.updateDisplay();this._startPolling()
    } catch(e) {
      console.error('[1v2] _startGame1v2 error:', e);
      this.showError('启动1v2失败: '+e.message);
    }
  };

  GameUI.prototype._buildGameScreen1v2=function(){
    let html=`
      <div class="game-title">Furry Battle 1v2</div>
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
      <div class="dual-dice-inline" id="dual-dice-inline" style="display:none">
        <div class="lord-dice-label">骰子索敌</div>
        <div class="lord-dice" id="dual-dice-num">?</div>
        <div class="lord-dice-result" id="dual-dice-result"></div>
      </div>
      <div class="action-desc" id="action-desc"></div>
      <div class="controls" id="controls"></div>`;
    this.gameScreen.innerHTML=html
  };

  GameUI.prototype.updateDisplay=function(){
    const s=this.state;
    if(!s||!s.player)return _origUpdate.call(this);
    if(!s.is1v2)return _origUpdate.call(this);
    const prev=this._prevState;
    document.getElementById('deck-info').textContent='牌堆: '+s.deck;
    this._drawDeckIcon(s.deck);
    document.getElementById('turn-info').textContent='回合 '+s.turn;
    document.getElementById('phase-info').textContent=s.phase==='AI_DEFEND'&&s.defenseSkipped?'跳过防御':(PHASE_NAMES[s.phase]||s.phase);
    this._updateHpBar('player',s.player);
    this._updateHpBar('ai',s.ai);
    if(s.ai2)this._updateHpBar('ai2',s.ai2);
    this._updateBuffs('player',s.player);
    this._updateBuffs('ai',s.ai);
    if(s.ai2)this._updateBuffs('ai2',s.ai2);
    document.getElementById('player-name').textContent=s.player.name;
    document.getElementById('ai-name').textContent=s.ai.name;
    if(s.ai2)document.getElementById('ai2-name').textContent=s.ai2.name;
    this._updateAvatar('player',s.player.name);
    this._updateAvatar('ai',s.ai.name);
    if(s.ai2)this._updateAvatar('ai2',s.ai2.name);
    let activeAttacker=s.activeAttacker||((s.phase==='AI_TURN'||s.phase==='PLAYER_DEFEND'||s.phase==='GUARD_CHOICE')?'ai':'player');
    document.getElementById('player-hp-section').classList.toggle('active-attacker',activeAttacker==='player');
    document.getElementById('ai-hp-section').classList.toggle('active-attacker',activeAttacker==='ai');
    if(document.getElementById('ai2-hp-section'))document.getElementById('ai2-hp-section').classList.toggle('active-attacker',activeAttacker==='ai2');
    document.getElementById('ai-hp-section').classList.toggle('selected-target',s.attackTarget==='ai'&&s.activeAttacker==='player');
    if(document.getElementById('ai2-hp-section'))document.getElementById('ai2-hp-section').classList.toggle('selected-target',s.attackTarget==='ai2'&&s.activeAttacker==='player');
    if(s.isLord){
      let hint=document.getElementById('lord-turn-hint');
      if(hint){
        if(s.phase==='PLAYER_PLAY'&&s.attackTarget){
          let targetName=s.attackTarget==='ai2'?(s.ai2?s.ai2.name:'AI2'):(s.ai?s.ai.name:'AI1');
          hint.textContent='本轮进攻目标：'+targetName;
          hint.style.display='block';
          hint.style.color=s.attackTarget==='ai2'?'#c084fc':'#f87171'
        }else{
          hint.style.display='none'
        }
      }
    }
    if(prev){
      this._detectAndPlayAnimations(prev,s);

      if(prev.ai2&&s.ai2){
        if(s.ai2.burn>prev.ai2.burn)this.playFloatingText(`+${s.ai2.burn-prev.ai2.burn}[灼烧]`,'#ff8800','ai2');
        if(s.ai2.bleed>prev.ai2.bleed)this.playFloatingText(`+${s.ai2.bleed-prev.ai2.bleed}[流血]`,'#cc2222','ai2');
        if(s.ai2.frozen&&!prev.ai2.frozen)this.playFloatingText('[冷冻]','#44aaff','ai2');
        if(s.ai2.guard>prev.ai2.guard)this.playFloatingText(`+${s.ai2.guard-prev.ai2.guard}[守护]`,'#00bcd4','ai2');
        if(s.ai2.bloodthirst&&!prev.ai2.bloodthirst)this.playFloatingText('[嗜血触发]','#ff315f','ai2');
        if(!s.ai2.bloodthirst&&prev.ai2.bloodthirst)this.playFloatingText('[退出嗜血]','#f5b6c5','ai2');
        if(s.ai2.chaos_red&&!prev.ai2.chaos_red)this.playFloatingText('[混沌-红]','#ff4444','ai2');
        if(s.ai2.chaos_yellow&&!prev.ai2.chaos_yellow)this.playFloatingText('[混沌-黄]','#ffcc00','ai2');
        if(s.ai2.chaos_blue&&!prev.ai2.chaos_blue)this.playFloatingText('[混沌-蓝]','#4488ff','ai2');
        if(s.ai2.chaos_green&&!prev.ai2.chaos_green)this.playFloatingText('[混沌-绿]','#44cc44','ai2');
        if(!s.ai2.chaos_red&&prev.ai2.chaos_red)this.playFloatingText('[清除混沌红]','#ff8888','ai2');
        if(!s.ai2.chaos_yellow&&prev.ai2.chaos_yellow)this.playFloatingText('[清除混沌黄]','#ffee88','ai2');
        if(!s.ai2.chaos_blue&&prev.ai2.chaos_blue)this.playFloatingText('[清除混沌蓝]','#88bbff','ai2');
        if(!s.ai2.chaos_green&&prev.ai2.chaos_green)this.playFloatingText('[清除混沌绿]','#88ee88','ai2')
      }
    }
    this._renderPlayerHand();
    this._renderAIHand1v2();
    this._renderDiscardTop();
    this._renderZones();
    this._renderReveal();
    this._renderControls1v2();
    if(s.pendingDialog==='purify')this.dialogs.showPurifyChoice(s.player,kind=>this._apiAction('choosePurify',{kind}));
    else if(s.pendingDialog==='superPurify'){const targets=[{key:'player',label:'自己',ch:s.player}];if(s.ai&&s.ai.alive)targets.push({key:'ai',label:s.ai.name+' (对手)',ch:s.ai});if(s.ai2&&s.ai2.alive)targets.push({key:'ai2',label:s.ai2.name+' (对手)',ch:s.ai2});this.dialogs.showSuperPurifyChoice(targets,target=>this._apiAction('chooseSuperPurifyTarget',{target}))}
    else if(s.pendingDialog==='guard')this.dialogs.showGuardChoice(s.player,s.pendingGuardDamage,stacks=>this._apiAction('chooseGuard',{stacks}));
    if(s.phase==='GAME_OVER')this._showGameOver();
    this._prevState=JSON.parse(JSON.stringify(s))
  };

  GameUI.prototype._renderAIHand1v2=function(){
    const s=this.state;if(!s)return;
    const canSelect=s.phase==='OPPONENT_CARD_CHOICE'||(s.phase==='PLAYER_SEVEN_CHOICE'&&!s.chanFourSwapMode&&!s.chanSevenKeepMode)||(s.phase==='SAIKI_THREE_CHOICE'&&!s.saikiThreeDrawn);
    const leonZeroDiscard=!!s.pendingLeonZeroDiscard;
    const selectedTarget=s.attackTarget||(s.ai.alive?'ai':'ai2');
    let leonZeroOffset=0;
    const decorateSelectable=(card,index,key)=>{
      if(!canSelect)return;
      if(!leonZeroDiscard&&selectedTarget!==key)return;
      let combinedIndex=leonZeroDiscard?(key==='ai'?index:leonZeroOffset+index):index;
      card.style.cursor='pointer';card.classList.add('selectable-ai-card');card.dataset.aiIndex=combinedIndex;
      if(combinedIndex===s.selectedAICard)card.style.border='3px solid #ffdc3c';
      card.addEventListener('click',async()=>{await this._apiAction('chooseAICard',{index:Number(card.dataset.aiIndex)})})
    };
    let aiEl=document.getElementById('ai-hand');
    if(aiEl){
      aiEl.innerHTML='';
      if(s.ai.alive){
        for(let i=0;i<(s.aiHandSize||0);i++){let cv=renderCardBack(40,58);decorateSelectable(cv,i,'ai');aiEl.appendChild(cv)}
        if(leonZeroDiscard)leonZeroOffset=s.aiHandSize||0;
      }else{
        aiEl.innerHTML='<div style="color:#ef4444;font-size:0.8rem;padding:8px">'+s.ai.name+' 已出局</div>';
      }
    }
    let ai2El=document.getElementById('ai2-hand');
    if(ai2El&&s.ai2){
      ai2El.innerHTML='';
      if(s.ai2.alive){
        for(let i=0;i<(s.ai2HandSize||0);i++){
          let cv=renderCardBack(40,58);
          cv.style.filter='hue-rotate(240deg)';
          decorateSelectable(cv,i,'ai2');
          ai2El.appendChild(cv);
        }
      }else{
        ai2El.innerHTML='<div style="color:#ef4444;font-size:0.8rem;padding:8px">'+s.ai2.name+' 已出局</div>';
      }
    }
  };

  GameUI.prototype._renderControls1v2=function(){
    return _origRenderControls.call(this)
  }

  GameUI.prototype._playDualDiceAnimation=function(roll,target){
    return new Promise(resolve=>{
      const container=document.getElementById('dual-dice-inline');
      const dice=document.getElementById('dual-dice-num');
      const result=document.getElementById('dual-dice-result');
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
  }
})();

(function(){
  const runtime=window.FurryGame&&window.FurryGame.CombatRuntime;
  const random=()=>runtime?runtime.random():Math.random();
  const schedule=(fn,ms)=>runtime?runtime.schedule(null,fn,ms):setTimeout(fn,ms);
  const _origUpdate=GameUI.prototype.updateDisplay;

  GameUI.prototype._startGame1v2=async function(){
    try {
      await Bridge.call('selectMode',{mode1v2:true});
      const result=await Bridge.call('selectCharacters1v2',{player:this._selectedPlayerChar,ai:this._selectedAIChar,ai2:this._selectedAI2Char});
      if(result.error){this.showError(result.error);return}
      this.state=result;this.selectScreen.classList.remove('active');this.gameScreen.classList.add('active');
      this._buildGameScreen1v2();this.updateDisplay();await this._playOpeningEvents();this._startPolling()
    } catch(e) {
      console.error('[1v2] _startGame1v2 error:', e);
      this.showError('启动1v2失败: '+e.message);
    }
  };

  GameUI.prototype._buildGameScreen1v2=function(){
    const adv=!!(this.state&&this.state.isAdventure);
    const ai1Label=adv?'对手I':'对手I';
    const ai2Label=adv?'对手II':'对手II';
    const ai1HandTitle='对手I';
    const ai2HandTitle='对手II';
    const gameTitle=adv?'Furry Trial 冒险':'Furry Battle 1v2';
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
        <span class="defender-indicator">防守方</span>
        <img class="hp-avatar" id="ai-avatar" src="" alt="">
        <span class="hp-name" id="ai-name">${ai1Label}</span>
        <div class="hp-bar-outer"><div class="hp-bar-inner" id="ai-hp-bar" style="width:100%"></div><span class="hp-text" id="ai-hp-text">100/100</span></div>
        <div class="buff-icons" id="ai-buffs"></div>
      </div>
      <div class="hp-section ai2-hp-section" id="ai2-hp-section">
        <span class="attacker-indicator">进攻方</span>
        <span class="defender-indicator">防守方</span>
        <img class="hp-avatar" id="ai2-avatar" src="" alt="">
        <span class="hp-name" id="ai2-name">${ai2Label}</span>
        <div class="hp-bar-outer"><div class="hp-bar-inner" id="ai2-hp-bar" style="width:100%"></div><span class="hp-text" id="ai2-hp-text">100/100</span></div>
        <div class="buff-icons" id="ai2-buffs"></div>
      </div>
      <div class="ai-area">
        <div class="ai-hands-stack">
        <div class="ai-hand-zone" data-owner="ai"><div class="zone-title">${ai1HandTitle}</div><div class="ai-hand-row" id="ai-hand"></div></div>
        <div class="ai-hand-zone" data-owner="ai2" style="border-color:#a855f7"><div class="zone-title" style="color:#c084fc">${ai2HandTitle}</div><div class="ai-hand-row" id="ai2-hand"></div></div>
        </div>
        <div class="play-zone"><div class="play-zone-row">
          <div class="attack-zone"><div class="zone-title">进攻</div><div class="zone-cards" id="atk-cards"><span style="color:rgba(255,255,255,0.5);font-size:0.7rem">等待出牌</span></div><div class="zone-desc" id="atk-desc"></div></div>
          <div class="defend-zone"><div class="zone-title">防御</div><div class="zone-cards" id="def-cards"><span style="color:rgba(255,255,255,0.5);font-size:0.7rem">等待防御</span></div><div class="zone-desc" id="def-desc"></div></div>
        </div></div>
        <div class="reveal-zone"><div class="zone-title">判定</div><div class="reveal-card-area" id="reveal-cards"><span class="reveal-empty">等待判定</span></div><div class="reveal-desc" id="reveal-desc"></div></div>
        <div class="discard-zone"><div class="zone-title">弃牌库顶</div><div class="discard-card-area" id="discard-top"></div></div>
      </div>
      <div class="hp-section" id="player-hp-section">
        <span class="attacker-indicator">进攻方</span>
        <span class="defender-indicator">防守方</span>
        <img class="hp-avatar" id="player-avatar" src="" alt="">
        <span class="hp-name" id="player-name">你</span>
        <div class="hp-bar-outer"><div class="hp-bar-inner" id="player-hp-bar" style="width:100%"></div><span class="hp-text" id="player-hp-text">70/70</span></div>
        <div class="buff-icons" id="player-buffs"></div>
      </div>
      <div class="error-hint" id="error-hint"></div>
      <div class="adventure-info-bar" id="adventure-info-bar" style="display:none"></div>
      <div class="adventure-item-bar" id="adventure-item-bar" style="display:none"></div>
      <div class="player-hand-zone"><div class="zone-title">你的</div><div class="hand-row" id="player-hand"></div></div>
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
    document.getElementById('deck-info').textContent=s.isAdventure
      ? '牌堆: '+s.deck+' | 弃牌库: '+(s.discard!=null?s.discard:0)
      : '牌堆: '+s.deck;
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
    this._updateAttackerIndicator(activeAttacker);
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
      const skipStateDiffAnimations=!!this._skipStateDiffAnimations;
      this._skipStateDiffAnimations=false;
      this._detectAndPlayAnimations(prev,s,{skipEventBacked:skipStateDiffAnimations});

      if(prev.ai2&&s.ai2){
        if(!skipStateDiffAnimations&&s.ai2.burn>prev.ai2.burn)this.playFloatingText(`+${s.ai2.burn-prev.ai2.burn}[灼烧]`,'#ff8800','ai2');
        if(!skipStateDiffAnimations&&s.ai2.bleed>prev.ai2.bleed)this.playFloatingText(`[流血]`,'#cc2222','ai2');
        if(!skipStateDiffAnimations&&s.ai2.frozen&&!prev.ai2.frozen)this.playFloatingText('[冷冻]','#44aaff','ai2');
        if(!skipStateDiffAnimations&&s.ai2.guard>prev.ai2.guard)this.playFloatingText(`+${s.ai2.guard-prev.ai2.guard}[守护]`,'#00bcd4','ai2');
        if(s.ai2.bloodthirst&&!prev.ai2.bloodthirst)this.playFloatingText('[嗜血触发]','#ff315f','ai2');
        if(!s.ai2.bloodthirst&&prev.ai2.bloodthirst)this.playFloatingText('[退出嗜血]','#f5b6c5','ai2');
        if(!skipStateDiffAnimations&&s.ai2.chaos_red&&!prev.ai2.chaos_red)this.playFloatingText('[混沌-红]','#ff4444','ai2');
        if(!skipStateDiffAnimations&&s.ai2.chaos_yellow&&!prev.ai2.chaos_yellow)this.playFloatingText('[混沌-黄]','#ffcc00','ai2');
        if(!skipStateDiffAnimations&&s.ai2.chaos_blue&&!prev.ai2.chaos_blue)this.playFloatingText('[混沌-蓝]','#4488ff','ai2');
        if(!skipStateDiffAnimations&&s.ai2.chaos_green&&!prev.ai2.chaos_green)this.playFloatingText('[混沌-绿]','#44cc44','ai2');
        const ai2ChaosReset=(prev.ai2.chaos_red&&!s.ai2.chaos_red)||(prev.ai2.chaos_yellow&&!s.ai2.chaos_yellow)||(prev.ai2.chaos_blue&&!s.ai2.chaos_blue)||(prev.ai2.chaos_green&&!s.ai2.chaos_green);
        if(!skipStateDiffAnimations&&ai2ChaosReset)this.playFloatingText('[混沌重制]','#c084fc','ai2')
      }
    }
    // Keep both hands stable while draw/swap event flights are playing.
    if(!this._handRenderingLocked()){
      this._renderPlayerHand();
      this._renderAIHand1v2();
    }
    this._renderDiscardTop();
    this._renderZones();
    this._renderReveal();
    this._renderControls();
    this._updateAdventureInfo(s);
    this._renderAdventureItemBar(s);
    const npcDeckEl=document.getElementById('npc-deck-info');
    if(npcDeckEl){
      const deckCount=s.aiDeckCount!=null?s.aiDeckCount:0;
      const discardCount=s.aiDiscardCount!=null?s.aiDiscardCount:0;
      npcDeckEl.style.display=s.isAdventure?'':'none';
      npcDeckEl.textContent='怪物共享牌库: '+deckCount+' | 怪物弃牌库: '+discardCount;
    }
    const canShowDecisionDialog=s.onlineCanAct!==false;
    if(this.dialogs&&typeof this.dialogs.syncCombatDialog==='function')this.dialogs.syncCombatDialog(s.pendingDialog,canShowDecisionDialog,s.phase);
    if(canShowDecisionDialog&&s.pendingDialog==='purify')this.dialogs.showPurifyChoice(s.player,picked=>{if(picked&&picked.done)return this._apiAction('choosePurify',{done:true});const kind=picked&&picked.kind?picked.kind:picked;if(typeof kind!=='string')return Promise.resolve();return this._apiAction('choosePurify',{kind})});
    else if(canShowDecisionDialog&&s.pendingDialog==='superPurify'){const targets=[{key:'player',label:'自己',ch:s.player}];if(s.ai&&s.ai.alive)targets.push({key:'ai',label:s.ai.name+' (对手)',ch:s.ai});if(s.ai2&&s.ai2.alive)targets.push({key:'ai2',label:s.ai2.name+' (对手)',ch:s.ai2});this.dialogs.showSuperPurifyChoice(targets,target=>this._apiAction('chooseSuperPurifyTarget',{target}))}
    else if(canShowDecisionDialog&&s.pendingDialog==='mozeSeven'){const targets=[{key:'player',label:'自己（清除负面）',ch:s.player}];if(s.ai&&s.ai.alive)targets.push({key:'ai',label:s.ai.name+'（清除正面）',ch:s.ai});if(s.ai2&&s.ai2.alive)targets.push({key:'ai2',label:s.ai2.name+'（清除正面）',ch:s.ai2});this.dialogs.showSuperPurifyChoice(targets,target=>this._apiAction('chooseMozeSeven',{choice:{target}}),'Moze 7牌 · 选择目标')}
    else if(canShowDecisionDialog&&s.pendingDialog==='guard')this.dialogs.showGuardChoice(s.player,s.pendingGuardDamage,choice=>{
      if(choice&&typeof choice==='object'){
        if(choice.action==='fly')return this._apiAction('chooseFly');
        if(choice.action==='guard')return this._apiAction('chooseGuard',{stacks:choice.stacks});
        return this._apiAction('chooseGuard',{stacks:0});
      }
      return this._apiAction('chooseGuard',{stacks:choice});
    });
    else if(canShowDecisionDialog&&s.pendingDialog==='flyRetry')this.dialogs.showFlyRetryChoice(s.player,s.pendingGuardDamage,choice=>{
      if(choice&&choice.action==='guard')return this._apiAction('chooseGuard',{stacks:choice.stacks});
      if(choice&&choice.action==='none')return this._apiAction('chooseFlyContinue',{again:false,skipGuard:true});
      return this._apiAction('chooseFlyContinue',{again:true});
    });
    else if(canShowDecisionDialog&&s.pendingDialog==='trophyDisarm'){const pending=s.pendingTrophyDisarm||{};this.dialogs.showOpponentCardChoice(this._opponentCardGroups(s,pending.targetKey),choice=>this._apiAction('chooseTrophyDisarm',choice),'缴械 · 选择要弃掉的手牌');}
    if(s.phase==='ATTACK_MOD_CHOICE')this._ensureAttackModChoicePrompt(s);
    else{this._attackModPromptOpen=false;this._attackModActive=false;}
    if(s.phase==='GAME_OVER')this._showGameOver();
    this._prevState=JSON.parse(JSON.stringify(s))
  };

  GameUI.prototype._renderAIHand1v2=function(options){
    options=options||{};
    const hideWho=options.who||null;
    const hideTrailing=this._hideTrailingCount(options, hideWho||'ai');
    const s=this.state;if(!s)return;
    const revealFace=!!(s.revealAIHand||s.isAdventure);
    const selectedTarget=s.opponentHandTarget||(s.attackTarget||'ai');
    const canSelectOpponent=!!(s.isAdventure&&s.onlineCanAct!==false&&s.phase==='OPPONENT_CARD_CHOICE'&&revealFace);
    const attachSkillHover=(card,opponent,ownerCard)=>{
      if(!revealFace||!ownerCard||!(s.phase==='PLAYER_PLAY'||s.phase==='PLAYER_DEFEND'||s.phase==='OPPONENT_CARD_CHOICE'))return;
      const charName=this._combatDisplayName(opponent&&opponent.name);
      const ownerKey=opponent===s.ai2?'ai2':'ai';
      const adventureOpts=typeof this._adventureSkillDescOpts==='function'
        ? this._adventureSkillDescOpts(ownerKey)
        : {stage:s.adventureStage||s.stage||1,playerHandSize:(s.playerHand&&s.playerHand.length)||0,incomingDamage:s.pendingDefenseDamage||0};
      card.addEventListener('mouseenter',()=>this._showTooltip(ownerCard,card,true,{charName,adventureOpts}));
      card.addEventListener('mouseleave',()=>this._hideTooltip());
    };
    let aiEl=document.getElementById('ai-hand');
    if(aiEl){
      aiEl.innerHTML='';
      if(s.ai.alive){
        const handCards=revealFace&&Array.isArray(s.aiHand)?s.aiHand:null;
        // During draw-event playback the hand array can update one poll
        // before its size field. Render the larger authoritative count so a
        // freshly drawn card is never removed by an intermediate snapshot.
        const size=Math.max(Number(s.aiHandSize)||0, handCards ? handCards.length : 0);
        for(let i=0;i<size;i++){
          let cv;
          if(handCards&&handCards[i]){
            cv=renderCard(handCards[i],40,58,false,{ isNpc: !!s.isAdventure });
            if(canSelectOpponent&&selectedTarget==='ai'){
              cv.style.cursor='pointer';cv.classList.add('selectable-ai-card');
              if(i===Number(s.selectedAICard))cv.classList.add('opponent-card-selected');
              cv.addEventListener('click',async()=>{
                if(this._isHandlingAction||this._isConsumingEvents)return;
                await this._apiAction('chooseAICard',{index:i});
              });
            }
            attachSkillHover(cv,s.ai,handCards[i]);
          }else{
            cv=renderCardBack(40,58);
          }
          // hideTrailing: skip rendering new (just-drawn) cards entirely so they
          // are added only after the fly-in animation lands.
          if(hideTrailing&&(!hideWho||hideWho==='ai')&&i>=size-hideTrailing)continue;
          aiEl.appendChild(cv);
        }
      }else{
        aiEl.innerHTML='<div style="color:#ef4444;font-size:0.8rem;padding:8px">'+s.ai.name+' 已出局</div>';
      }
    }
    let ai2Zone=document.querySelector('.ai-hands-stack > .ai-hand-zone[data-owner="ai2"]');
    let ai2El=document.getElementById('ai2-hand');
    if(ai2Zone) ai2Zone.hidden=!s.ai2;
    if(ai2El&&s.ai2){
      ai2El.innerHTML='';
      if(s.ai2.alive){
        const handCards2=revealFace&&Array.isArray(s.ai2Hand)?s.ai2Hand:null;
        const size2=Math.max(Number(s.ai2HandSize)||0, handCards2 ? handCards2.length : 0);
        for(let i=0;i<size2;i++){
          let cv;
          if(handCards2&&handCards2[i]){
            cv=renderCard(handCards2[i],40,58,false,{ isNpc: !!s.isAdventure });
            if(canSelectOpponent&&selectedTarget==='ai2'){
              cv.style.cursor='pointer';cv.classList.add('selectable-ai-card');
              if(i===Number(s.selectedAICard))cv.classList.add('opponent-card-selected');
              cv.addEventListener('click',async()=>{
                if(this._isHandlingAction||this._isConsumingEvents)return;
                await this._apiAction('chooseAICard',{index:i});
              });
            }
            attachSkillHover(cv,s.ai2,handCards2[i]);
          }else{
            cv=renderCardBack(40,58);
            cv.style.filter='hue-rotate(240deg)';
          }
          if(hideTrailing&&(!hideWho||hideWho==='ai2')&&i>=size2-hideTrailing)continue;
          ai2El.appendChild(cv);
        }
      }else{
        ai2El.innerHTML='<div style="color:#ef4444;font-size:0.8rem;padding:8px">'+s.ai2.name+' 已出局</div>';
      }
    }
  };

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
        dice.textContent=Math.floor(random()*6)+1;
        dice.classList.add('lord-dice-spin');
        count++;
        if(count>=maxCount){
          clearInterval(interval);
          dice.textContent=roll;
          dice.className='lord-dice lord-dice-landed';
          const targetName=target==='ai2'?(this.state.ai2?this.state.ai2.name:'AI2'):(this.state.ai?this.state.ai.name:'AI1');
          result.textContent=roll+' → '+targetName;
          result.style.color=target==='ai2'?'#c084fc':'#f87171';
          schedule(()=>{container.style.display='none';resolve()},1200);
        }
      },80);
    });
  }
})();

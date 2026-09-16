/* 1v2 engine module. All challenge topology methods live here, not in engine.js. */
(function () {
  const Engine = window.Engine;
  const Combat = window.FurryGame || {};
  const Card = Combat.Card;
  const CombatDeck = Combat.CombatDeck;
  const CombatState = Combat.CombatState;
  const cp = x => Card.clone(x);
  const C = ['RED', 'YELLOW', 'BLUE', 'GREEN'];
  const later = (fn, ms = 550) => Combat.CombatRuntime
    ? Combat.CombatRuntime.schedule(null, fn, ms)
    : setTimeout(fn, ms);
  if (!Engine || !Card || !CombatState) throw new Error('engine.js must load before engine_1v2.js');
  Engine.prototype.start1v2=function(p,a1,a2){
    clearTimeout(this.timer);this.pendingSettlement=null;this._invariantReady=false;this._invariantBaseline=null;
    const adapter=this._adapter('1v2');
    const initial=adapter&&adapter.createPiles?adapter.createPiles():CombatDeck.createStandard();
    this.deck=initial.deck;this.discardBottom=initial.discardBottom;
    this.h={player:[],ai:[],ai2:[]};this.events=[];
    let top=initial.discardTop;
    const stateFields={phase:'PLAYER_PLAY',turn:1,busy:false,selectedCard:-1,selectedCards:[],selectedAICard:-1,
      handLimit:10,forcedDiscard:false,hasPlayedThisTurn:false,hasPlayedBlackDefend:false,
      defenseSkipped:false,unblockDefend:false,attackModBonus:0,aiTurnStarted:false,aiHasPlayed:false,pendingAIBridge:null,
      pendingAIContinue:null,pendingDefenseDamage:0,pendingFiveChoice:false,fiveChoiceCard:null,
      pendingNumberJudge:null,mayDiscardAfterSkill:false,serenityHalfTarget:null,pendingSaikiBleed:null,
      forceEndAITurn:false,activeAttacker:'player',is1v2:true,needColorChoice:false,
      pendingDialog:null,discardTop:top,
      player:this.character(p),ai:this.character(a1,true),ai2:Object.assign(this.character(a2,true),{name:'AI2 '+a2}),
      currentAITarget:0,attackTarget:null,eliminatedHandled:{ai:false,ai2:false},
      atkCard:null,atkOwner:null,defCard:null,defOwner:null,revealCards:[],diceRoll:null};
    this.s=adapter&&adapter.createState?adapter.createState(stateFields):CombatState.create(stateFields);
    this.s.player.maxHp*=2;this.s.player.hp=this.s.player.maxHp;
    this.draw('player',10);this.draw('ai',5);this.draw('ai2',5);
    let _hands=this.handCounts();this.silentDraws(function(){this.turnStart('player')});this.emitDrawDiff(_hands);this._invariantReady=true;this._checkInvariants('start1v2');return this.state()
  };

  Engine.prototype._curAI=function(){return this.s.currentAITarget===1?'ai2':'ai'};
  Engine.prototype._curAIChar=function(){return this.s[this._curAI()]};
  Engine.prototype._curAIHand=function(){return this.h[this._curAI()]};
  Engine.prototype._aiFillTarget=function(){
    if(!this.s.is1v2)return 5;
    let dead1=!this.s.ai.alive,dead2=!this.s.ai2||!this.s.ai2.alive;
    return(dead1||dead2)?10:5
  };
  Engine.prototype._on1v2OpponentEliminated=function(defeatedKey){
    if(!this.s||!this.s.is1v2||!defeatedKey)return;
    if(!this.s.eliminatedHandled)this.s.eliminatedHandled={ai:false,ai2:false};
    if(this.s.eliminatedHandled[defeatedKey])return;
    this.s.eliminatedHandled[defeatedKey]=true;
    if(this.s.isAdventure&&this.s.player&&this.s.player.alive){
      this.heal(this.s.player,3,'passive');
      const name=(this.s[defeatedKey]&&this.s[defeatedKey].name)||defeatedKey;
      this.emit('desc','击败'+name+'，恢复3点生命');
    }
    const survivor=(this.s.ai&&this.s.ai.alive)?'ai':((this.s.ai2&&this.s.ai2.alive)?'ai2':null);
    if(this.s.attackTarget===defeatedKey)this.s.attackTarget=survivor;
    const curKey=this.s.currentAITarget===1?'ai2':'ai';
    if(this.s[curKey]&&!this.s[curKey].alive){
      this.s.currentAITarget=(this.s.ai&&this.s.ai.alive)?0:1;
    }
  };
  Engine.prototype._checkDeath1v2=function(){
    if(!this.s.player.alive){this.s.phase='GAME_OVER';this.s.busy=false;clearTimeout(this.timer);return true}
    let allDead=!this.s.ai.alive&&(!this.s.ai2||!this.s.ai2.alive);
    if(allDead){this.s.phase='GAME_OVER';this.s.busy=false;clearTimeout(this.timer);return true}
    let defeatedKey=!this.s.ai.alive?'ai':(!this.s.ai2||!this.s.ai2.alive?'ai2':null);
    if(defeatedKey&&!this.s.eliminatedHandled[defeatedKey]){
      this._on1v2OpponentEliminated(defeatedKey);
      if(!this.s.isLord&&!this.s.isAdventure){
        let aliveKey=defeatedKey==='ai'?'ai2':'ai',need=10-this.h[aliveKey].length;
        if(need>0){this.draw(aliveKey,need,true);this.emit('desc',this.s[defeatedKey].name+'出局，'+this.s[aliveKey].name+'补齐10张手牌')}
      }
    }
    return false
  };
  Engine.prototype._advanceAI=function(){
    if(!this.s.is1v2)return false;
    if(this.s.currentAITarget===0&&this.s.ai2&&this.s.ai2.alive){
      this.s.currentAITarget=1;
      this.s.aiTurnStarted=false;this.s.aiHasPlayed=false;
      this.s.phase='AI2_TURN';this.s.busy=true;this.s.activeAttacker='ai2';
      this.fillAIHands1v2();
      return true
    }
    return false
  };
  Engine.prototype.fillHands1v2=function(includePlayer=false){
    let limit=this._aiFillTarget();
    if(includePlayer)this.draw('player',this._drawNeedWithIceSeal('player',Math.max(0,this.s.handLimit-this.h.player.length)),true);
    if(this.s.ai.alive)this.draw('ai',this._drawNeedWithIceSeal('ai',Math.max(0,limit-this.h.ai.length)),true);
    if(this.s.ai2.alive)this.draw('ai2',this._drawNeedWithIceSeal('ai2',Math.max(0,limit-this.h.ai2.length)),true);
    this.emit('desc','双方按当前手牌上限完成补牌')
  };
  Engine.prototype.fillAIHands1v2=function(){
    let limit=this._aiFillTarget();
    if(this.s.ai.alive)this.draw('ai',Math.max(0,limit-this.h.ai.length),true);
    if(this.s.ai2.alive)this.draw('ai2',Math.max(0,limit-this.h.ai2.length),true);
    this.emit('desc','AI1与AI2补牌至'+limit+'张')
  };
  Engine.prototype.endAi1v2=function(){
    let key=this._curAI();
    this.trimAI1v2();
    let ch=this.s[key];
    if(ch.burn){let dmg=ch.burn;let S=window.FurryGame&&window.FurryGame.StatusService;if(S)S.remove(ch,'burn',1);else ch.burn--;if(this.name(ch)!=='Leon'){let w=this._who(ch);this.emit('burnSettle',`-${dmg}[灼烧]，-1[灼烧层数]`,null,{who:w,amount:dmg});ch.hp=Math.max(0,ch.hp-dmg);ch.alive=ch.hp>0}}
    this.check();if(this.s.phase==='GAME_OVER')return;
    if(this._advanceAI()){
      this.later(()=>this.aiTurn1v2());return this.check()
    }
    this.s.turn++;this.s.phase='PLAYER_PLAY';this.s.busy=false;this.s.activeAttacker='player';this.s.attackTarget=null;
    this.s.pendingAttack=null;this.s.pendingAIBridge=null;this.s.pendingAIContinue=null;
    this.s.forceEndAITurn=false;this.s.attackDebuffSnapshot=null;
    this.s.atkCard=this.s.defCard=null;this.s.atkOwner=this.s.defOwner=null;this.s.revealCards=[];
    this.s.hasPlayedThisTurn=false;this.s.aiTurnStarted=false;this.s.aiHasPlayed=false;
    this.s.currentAITarget=0;
    let _hands=this.handCounts();this.silentDraws(function(){this.fillHands1v2(true);this.turnStart('player')});this.emitDrawDiff(_hands);this.check()
  };
  Engine.prototype.trimAI1v2=function(){
    let key=this._curAI(),limit=this._aiFillTarget();
    while(this.h[key].length>limit){
      let worst=this._swapAIContext(key,()=>this.chooseAIDiscard(this.h.ai));
      let card=this.h[key].splice(worst,1)[0];
      this.discardWithEvent(card,key,{handIndex:worst,desc:this.s[key].name+'手牌超限，按角色策略弃掉'+this.cardText(card)})
    }
  };
  Engine.prototype._swapAIContext=function(key,fn){
    if(key==='ai')return fn();
    let origAI=this.s.ai,origHand=this.h.ai;
    this.s.ai=this.s.ai2;this.h.ai=this.h.ai2;
    try{let r=fn();return r}finally{this.s.ai2=this.s.ai;this.h.ai2=this.h.ai;this.s.ai=origAI;this.h.ai=origHand}
  };
  Engine.prototype._swapAITarget=function(targetKey,fn){
    if(targetKey==='ai')return fn();
    let origAI=this.s.ai,origHand=this.h.ai;
    this.s.ai=this.s.ai2;this.h.ai=this.h.ai2;
    try{let r=fn();return r}finally{this.s.ai2=this.s.ai;this.h.ai2=this.h.ai;this.s.ai=origAI;this.h.ai=origHand}
  };
  Engine.prototype._chooseAIPlay1v2=function(key,top){
    let hand=this.h[key];
    return this._swapAIContext(key,()=>{
      let best=null,score=-1;
      for(const c of hand){if(!this.legal(c))continue;let s=this.aiAttackScore(c,top);if(s>score){score=s;best=c}}
      return best
    })
  };
  Engine.prototype._chooseAIDefend1v2=function(key,top,incomingDamage=0){
    let hand=this.h[key];
    return this._swapAIContext(key,()=>{
      if(this.s.isAdventure){let r=this._chooseAIDefendAdventure(hand,top,incomingDamage);if(r!==null)return r}
      let x=this.aiContext({incomingDamage}),best=null,score=-Infinity;
      for(const c of hand){if(!this.aiDefendLegal(c,top,x))continue;let s=this.aiDefendScore(c,top,incomingDamage);if(s>score){score=s;best=c}}
      return best
    })
  };
  Engine.prototype._chooseAIColor1v2=function(key){
    return this._swapAIContext(key,()=>{
      let counts={RED:0,YELLOW:0,BLUE:0,GREEN:0};
      for(const card of this.h.ai){let color=this.effective(card);if(counts[color]!==undefined)counts[color]++}
      return['RED','YELLOW','BLUE','GREEN'].reduce((a,b)=>counts[b]>counts[a]?b:a)
    })
  };
  Engine.prototype.useItem1v2=function(c,owner,target,w){
    if(window.CardEffects)return window.CardEffects.apply(this,c,{owner,target,who:w});
    return null;
  };
  Engine.prototype.aiTurn1v2=function(){
    let key=this._curAI(),ch=this.s[key],hand=this.h[key];
    if(!ch.alive)return this.endAi1v2();
    if(!this.s.aiTurnStarted){this.turnStart(key==='ai2'?'ai2':'ai');this.s.aiTurnStarted=true;this.s.aiHasPlayed=false}
    let _noAtkMod=this._getAdventureMod(this.name(ch));if(_noAtkMod&&_noAtkMod.noAttack){this.emit('desc',ch.name+'无进攻阶段，跳过进攻',null,{who:key});if(typeof _noAtkMod.attackSkipEffect==='function')_noAtkMod.attackSkipEffect(this,ch,this.s.player);return this.later(()=>this.endAi1v2(),700)}
    let top=this.s.discardTop,chosen=this._chooseAIPlay1v2(key,top);
     if(!chosen){
       if(!this.s.aiHasPlayed&&hand.length){let dropped=hand.splice(0,hand.length);for(let i=dropped.length-1;i>=0;i--)this.discardWithEvent(dropped[i],key,{handIndex:i,desc:ch.name+'无牌可出，弃掉'+this.cardText(dropped[i])});this.emit('desc',ch.name+'无牌可出，弃掉全部'+dropped.length+'张手牌')}
       // Once an NPC has exhausted its hand, do not rely on the animation
       // timer to advance the 1v2 turn.  In challenge rooms the event poller
       // can replace that timer while the last AI2 card is being displayed,
       // leaving the UI stuck at AI2_TURN.  There is no decision left to show,
       // so ending synchronously is both safe and idempotent.
       if(!hand.length)return this.endAi1v2();
       return this.later(()=>this.endAi1v2(),700)
     }
    let i=hand.indexOf(chosen),c=hand.splice(i,1)[0];
    if(c.isBlack)c.chosenColor=this._chooseAIColor1v2(key);
    else if(c.isWhite)c.chosenColor=this.effective(top);
    this.s.aiHasPlayed=true;this.s.atkCard=cp(c);this.s.atkOwner=key;
    this.setDiscardTop(c,key);this.rememberAttackDebuffs('player');let _buffBefore={bleed:this.s.player.bleed||0,burn:this.s.player.burn||0,poison:this.s.player.poison||0,blind:this.s.player.blind||0,iceSeal:this.s.player.iceSeal||0,frozen:!!this.s.player.frozen};this.applySaikiPassive(ch,this.s.player,c);
    this.emit('aiPlay',ch.name+' 按角色策略出牌',c,{who:key});
    if(c.isBlack||c.isWhite)this.emit('colorChoice',ch.name+'指定'+this.colorName(c.chosenColor),c);
    if(window.CardEffects&&window.CardEffects.isItem(c)){
      let kind=this.itemKind(c);
      this.emit('itemEffect',this.itemEffectDesc(c,key),c,{effect:kind,who:key});
      this.useItem1v2(c,ch,this.s.player,key);
      this.s.pendingAIBridge={mode:'attack',afterEventId:this.ver,effect:kind,owner:key};
      return this.check()
    }
    this._deferAttackBuffs('player',_buffBefore);
    let r=this._swapAIContext(key,()=>this.aiSpecialEffect(this.name(ch),c.value,c))||this.effect(this.name(ch),c.value,c,ch,this.s.player);
    this._deferAttackBuffs('player',_buffBefore);
    if(r.immediateBuffs)this._restoreAttackBuffs();
    this.s.pendingAttack={damage:r.d,unblock:r.unblock,isDrain:!!(r.isDrain||r.drain),aoeTargets:r.aoeTargets,aoeDamage:r.aoeDamage};
    {let freezeBlock=this._freezeBlocksDefend(this.s.player,this.s.atkCard);
    if(r.d&&!r.skip&&!r.unblock&&!freezeBlock){this.s.phase='PLAYER_DEFEND';this.s.busy=false;this.s.unblockDefend=false;return}
     if(r.d&&(r.unblock||freezeBlock)&&!(r.isDrain||r.drain)){if(this._enterPlayerDefend(r.d,{unblock:!!r.unblock,freezeBlock}))return;return}}
    if(!r.d)this.emit('desc',ch.name+' 本次技能分支未造成伤害，跳过防御',c);
     if(r.d&&!r.isDrain&&!r.drain&&this.playerNeedsAvoidChoice()){this.askGuard(r.d);return}
    this._restoreAttackBuffs();this.dealAttackHit(ch,this.s.player,r.d,!!(r.isDrain||r.drain));this.s.phase=key.toUpperCase()+'_TURN';this.s.busy=true;
    this.s.pendingAIContinue={afterEventId:this.ver};return this.check()
  };

  Engine.prototype.play1v2=function(){
    let i=this.s.selectedCard,c=this.h.player[i];
    if(!c)throw Error('请选择要打出的牌');
    if(!this.legal(c))throw Error('该牌不能用于进攻');
    let who=this.name(this.s.player);
    const needsNumberFollowup = !c.borrowedMonster && ((who==='Ryan'&&c.value===5)||(who==='Saiki'&&c.value===6)||(who==='Moze'&&c.value===4)||(who==='Otto'&&c.value===5));
    if(needsNumberFollowup&&!this.h.player.some((x,j)=>j!==i&&x.isNumberCard)){
      this.emit('desc',who+' '+c.value+'牌：没有可用的追加数字牌，自动判定为0点',c);
      this.h.player.splice(i,1); this.s.selectedCard=-1; this.s.atkCard=cp(c); this.s.atkOwner='player';
      this.setDiscardTop(c,'player'); this.s.hasPlayedThisTurn=true; this._markBombPlay('player'); this._tickBomb('player');
      return this.gateAdventureAttackMod(c,0,true,false);
    }
    if(c.isBlack&&!c.chosenColor)return this._stagePendingBlackCard(i,c,'attack');
    if(c.isWhite)c.chosenColor=this.effective(this.s.discardTop);
    let target=this.s.attackTarget||(this.s.ai.alive?'ai':(this.s.ai2&&this.s.ai2.alive?'ai2':'ai')),targetChar=this.s[target];
    if(!targetChar||!targetChar.alive)throw Error('所选目标已经出局，请重新选择目标');
    this.h.player.splice(i,1);this.s.selectedCard=-1;
    this.s.atkCard=cp(c);this.s.atkOwner='player';this.s.hasPlayedThisTurn=true;
    // Keep the exact attack-card reference used by emit(). A cloned object makes
    // the automatic animation guard treat the same play as a second new card.
    this._animatedPlayerAttack=this.s.atkCard;
    this.setDiscardTop(c,'player');this._markBombPlay('player'); this._tickBomb('player');let _buffBefore={bleed:targetChar.bleed||0,burn:targetChar.burn||0,poison:targetChar.poison||0,blind:targetChar.blind||0,iceSeal:targetChar.iceSeal||0,frozen:!!targetChar.frozen};if(!c.borrowedMonster){this.rememberAttackDebuffs(target);this.applySaikiPassive(this.s.player,targetChar,c);}
    this.emit('playerPlay','玩家打出进攻牌',c);
    if(c.isBlack)this.emit('colorChoice','黑牌指定'+this.colorName(c.chosenColor),c);
    else if(c.isWhite)this.emit('colorChoice','白色牌自动指定'+this.colorName(c.chosenColor),c);
    if(c.borrowedMonster && typeof this.playBorrowedMonsterCard==='function') return this.playBorrowedMonsterCard(c);
    if(window.CardEffects&&window.CardEffects.isItem(c)){
      let kind=this.itemKind(c);
      this.emit('itemEffect',this.itemEffectDesc(c,'player'),c,{effect:kind,who:'player',target});
      if(window.CardEffects.isTrophyWhite(c))this.useTrophyWhite(c,targetChar,'player');else this.useItem1v2(c,this.s.player,targetChar,'player');
      if(!this.s.pendingDialog)this._tickBomb('player');
      if(!this.s.pendingDialog && this.s.phase==='PLAYER_PLAY'){this.s.busy=false;this.s.attackTarget=null;}
      return this.check()
    }
     this._deferAttackBuffs(target,_buffBefore);
     if(who==='Moze'&&c.value===7){this.s.pendingDialog='mozeSeven';this.s.pendingAttack=null;this.emit('desc','Moze 7牌：请选择自己或一名对手作为清除目标',c);return this.state()}
     if(who==='Leon'&&c.value===0)return this.leonZero1v2(c);
    if(who==='Ryan'&&c.value===5)return this.startRyanFive(c);
    if(who==='Saiki'&&c.value===6)return this.startNumberJudge('Saiki',c);
    if(who==='Moze'&&c.value===4)return this.startNumberJudge('Moze',c);
    if(who==='Chan'&&c.value===5)return this.startChanFive();
    if(who==='Otto'&&c.value===3)return this.startOttoThree(c);
    if(who==='Otto'&&c.value===4)return this.startOttoFour(c);
    if(who==='Otto'&&c.value===5)return this.startNumberJudge('Otto',c);
     if(this.opponentHandSkill(who,c.value)&&!(who==='Saiki'&&c.value===5&&this.s.player.hp<=40)){
      let p={name:who,value:c.value,owner:'player',attackCard:cp(c)};
      return this.resolveOpponentHandSkill(p)
    }
    let r=this.effect(who,c.value,c,this.s.player,targetChar);
    this._deferAttackBuffs(target,_buffBefore);
    if(r.immediateBuffs)this._restoreAttackBuffs();

     return this.gateAdventureAttackMod(c,r.d,r.skip,r.unblock,0,{isDrain:!!(r.isDrain||r.drain),aoeTargets:r.aoeTargets,aoeDamage:r.aoeDamage})
  };

  Engine.prototype.leonZero1v2=function(card){
    this._restoreAttackBuffs();
    let targets=['ai','ai2'].filter(key=>this.s[key]&&this.s[key].alive);
     for(const key of targets)this.burn(this.s[key],2);
    for(const key of targets)this.hurt(this.s[key],7);
    this.hurt(this.s.player,targets.length*2);
    // Leon 0 discards up to two cards from all living opponents.  The card
    // owner remains the source pile, while the specific cards are selected
    // by the shared runtime RNG so the skill never opens an opponent-hand
    // choice dialog.
    const runtime=Combat.CombatRuntime;
    const randomIndex=list=>runtime&&typeof runtime.randomInt==='function'
      ? runtime.randomInt(list.length)
      : Math.floor((runtime&&typeof runtime.random==='function'?runtime.random():Math.random())*list.length);
    const total=targets.reduce((sum,key)=>sum+(this.h[key]||[]).length,0);
    const discardCount=Math.min(2,total);
    for(let n=0;n<discardCount;n++){
      const candidates=[];
      for(const key of targets)for(let i=0;i<this.h[key].length;i++)candidates.push({key,index:i});
      if(!candidates.length)break;
      const entry=candidates[randomIndex(candidates)];
      const dropped=this.h[entry.key].splice(entry.index,1)[0];
      if(dropped){
        this.discardWithEvent(dropped,entry.key,{handIndex:entry.index,desc:'Leon 0牌随机弃掉'+this.cardText(dropped)});
        this.emit('reveal','Leon 0牌随机弃掉对手手牌',dropped,{who:entry.key,from:'hand'});
      }
    }
     this.emit('desc','Leon 0牌：对所有对手+2层灼烧、随机弃掉对手至多2张手牌、7点不可防御伤害；自身受到'+(targets.length*2)+'点伤害',card);
    this.s.pendingAttack=null;this.s.defenseSkipped=true;this.s.phase='AI_DEFEND';this.s.busy=true;
    this.later(()=>{this.afterAttack();this.check()},1700);return this.check()
  };

  Engine.prototype.aiDefend1v2=function(atk,d){
    let key=this.s.attackTarget||'ai';
    if(!this.s[key]||!this.s[key].alive)key=this.s.ai.alive?'ai':'ai2';
    // Keep the settlement target aligned with the defender chosen above. A
    // stale target can otherwise make a valid defense appear to hang in a
    // challenge room after the previous opponent was eliminated.
    this.s.attackTarget=key;
    let ch=this.s[key],hand=this.h[key];
    let frozen=this._freezeBlocksDefend(ch,atk),
        chosen=frozen?null:this._chooseAIDefend1v2(key,this.s.discardTop,d),
        i=chosen?hand.indexOf(chosen):-1;
    if(i>=0){
      let top=this.s.discardTop,c=hand.splice(i,1)[0];
      if(c.isBlack)c.chosenColor=hand.find(q=>!q.isBlack&&!q.isWhite&&q.value<=3)?.color||this._chooseAIColor1v2(key);
      else if(c.isWhite)c.chosenColor=this.effective(top);
      this.s.defCard=cp(c);this.s.defOwner=key;this.setDiscardTop(c,key);
      if(window.CardEffects&&window.CardEffects.isItem(c)){
        this.emit('aiDefend',ch.name+'打出搭桥牌并立即结算道具效果',c,{who:key});
        if(c.isBlack||c.isWhite)this.emit('colorChoice',ch.name+'指定'+this.colorName(c.chosenColor),c);
        let kind=this.itemKind(c);
        this.emit('itemEffect',this.itemEffectDesc(c,key),c,{effect:kind,who:key});
        this.useItem1v2(c,ch,this.s.player,key);
        this.s.pendingAIBridge={mode:'defense',afterEventId:this.ver,attackCard:cp(atk),damage:d,owner:key};
        return this.check()
      }
      let n=this.name(ch),v=c.value;
      this.emit('aiDefend',ch.name+'打出'+n+' '+v+'牌，触发防御技能',c,{who:key});
      if(c.isBlack||c.isWhite)this.emit('colorChoice',ch.name+'指定'+this.colorName(c.chosenColor),c);
      let judged=this.defenseJudge(key,c,d),b=0,remaining,desc='';
      if(judged){remaining=Math.max(0,judged.remaining);desc=ch.name+'完成防御判定'}
      else{let m=CharacterRegistry.get(n);if(m){let r=m.defend(this,n,v,d,c,ch,this.s.player,key,this.effective(atk),{hurt:(x,n,b)=>this.hurt(x,n,b),heal:(x,n,k)=>this.heal(x,n,k),draw:(w,n,an)=>this.draw(w,n,an),burn:(x,n)=>this.burn(x,n),bleed:(x,n)=>this.bleed(x,n),poison:(x,n)=>this.poison(x,n),counter:(x,n)=>this.counterAttack(ch,x,n),cancelAttackDebuffs:(o,r)=>this.cancelAttackDebuffs(o,r),clearDebuffs:x=>this.clearDebuffs(x),addGuard:(x,n)=>this.addGuard(x,n)});if(r){remaining=r.remaining;desc=r.desc}}if(desc===''){b=c.isNumberCard?(c.value===1?Math.ceil(d/2):c.value===3?Math.floor(d/2):0):0;remaining=Math.max(0,d-b);desc=ch.name+'抵消'+b+'点伤害，剩余'+remaining+'点待结算'}}
      if(!judged)this.emit('desc',desc);
      this.deferSettlement('PLAYER_ATTACK',remaining,c.isNumberCard&&c.value<=3?ch.bleed:0)
    }else{
      this.emit('desc',frozen?ch.name+'处于冷冻状态，无法防御蓝色攻击':ch.name+'根据防御策略选择跳过');
      this.deferSettlement('PLAYER_ATTACK',d,0)
    }
    return this.check()
  };

  // 防御阶段由 later() 异步触发。若某个冒险怪物的技能适配器抛出异常，
  // 旧路径只会在定时器里打印错误，战斗会永远停留在 AI_DEFEND。统一从
  // 这个安全入口进入，异常时按“跳过防御”继续结算，避免挑战房软锁。
  Engine.prototype.runAIDefend1v2=function(atk,d){
    try {
      return this.aiDefend1v2(atk,d);
    } catch (error) {
      console.error('[Combat] AI 1v2 防御处理失败，按跳过防御恢复', error);
      if (!this.s || this.s.phase !== 'AI_DEFEND') return this.check();
      this.s.pendingAIBridge = null;
      this.s.defCard = null;
      this.s.defOwner = null;
      this.emit('desc', 'NPC防御判定异常，跳过防御并继续结算');
      this.deferSettlement('PLAYER_ATTACK', Math.max(0, Number(d) || 0), 0);
      return this.check();
    }
  };

  Engine.prototype.defend1v2=function(skip=false){
    let d=this.s.pendingAttack.damage;
    let target=this._curAI();
    let targetChar=this.s[target];
    let triggeredDefense=!skip;
    if(skip){this.s.hasPlayedBlackDefend=false;this.emit('desc','玩家选择跳过防御，'+d+'点伤害待结算')}
    else{
      let i=this.s.selectedCard,c=this.h.player[i];
      if(!c)throw Error('请选择防御牌');
      if(!this.legal(c,true))throw Error('该牌不能用于防御');
      let inheritedColor=this.effective(this.s.discardTop||this.s.atkCard);
      if(this._freezeBlocksDefend(this.s.player,this.s.discardTop||this.s.atkCard))throw Error('冷冻状态无法防御蓝色攻击');
      if(c.isBlack&&!c.chosenColor)return this._stagePendingBlackCard(i,c,'defend');
      if(c.isWhite)c.chosenColor=inheritedColor;
      this.h.player.splice(i,1);this.s.selectedCard=-1;
      this.s.defCard=cp(c);this.s.defOwner='player';this.setDiscardTop(c,'player');this._markBombPlay('player'); this._tickBomb('player');
      this._animatedPlayerAttack=this.s.atkCard;
      let n=this.name(this.s.player),v=c.value,b=0,desc='';
      if(c.isBlack)this.emit('colorChoice','黑牌指定'+this.colorName(c.chosenColor),c);
      else if(c.isWhite)this.emit('colorChoice','白色牌自动指定'+this.colorName(c.chosenColor),c);
      if(c.trophyWhite&&(c.trophyEffect==='zero'||(window.AdventureRegistry&&c.trophyName&&(window.AdventureRegistry.getItem(c.trophyName)||{}).trophyEffect==='zero'))){
        this.emit('defend','白色牌指定'+this.colorName(c.chosenColor||c.color)+'，释放防御0技能',c);
        this.emit('itemEffect',this.itemEffectDesc(c,'player'),c,{effect:this.itemKind(c),who:'player',target});
        this.useTrophyWhite(c,targetChar,'player');
        d=Math.max(0,Number(this.s.pendingAttack&&this.s.pendingAttack.damage)||0);
        if(d&&this.playerNeedsAvoidChoice()){this.askGuard(d,this.s.player.bleed);return this.check()}
        let curAIKey2=this._curAI();
        this.s.phase=curAIKey2.toUpperCase()+'_TURN';
        this.deferSettlement('AI_ATTACK',d,0);
        return this.check()
      }
      if(window.CardEffects&&window.CardEffects.isItem(c)){
        let bridgeLabel=c.isBlack?'黑牌':c.isWhite?'白色':'道具';
        this.emit('defend',bridgeLabel+'牌指定'+this.colorName(c.chosenColor||c.color)+'并搭桥，请继续选择防御牌',c);
        this.emit('itemEffect',this.itemEffectDesc(c,'player'),c,{effect:this.itemKind(c),who:'player',target});
        if(window.CardEffects.isTrophyWhite(c))this.useTrophyWhite(c,targetChar,'player');else this.useItem1v2(c,this.s.player,targetChar,'player');
        if(!this.s.pendingDialog)this._tickBomb('player');
        this.s.phase='PLAYER_DEFEND';this.s.busy=false;
        return this.check()
      }
      this.emit('defend','玩家打出防御牌',c);
      let judged=this.defenseJudge('player',c,d);
      if(judged){d=Math.max(0,Number(judged.remaining)||0);desc='防御判定完成'}
        else{let m=CharacterRegistry.get(n);if(m){let r=m.defend(this,n,v,d,c,this.s.player,targetChar,'player',inheritedColor,{hurt:(x,n,b)=>this.hurt(x,n,b),heal:(x,n,k)=>this.heal(x,n,k),draw:(w,n,an)=>this.draw(w,n,an),burn:(x,n)=>this.burn(x,n),bleed:(x,n)=>this.bleed(x,n),poison:(x,n)=>this.poison(x,n),counter:(x,n)=>this.counterAttack(this.s.player,x,n),cancelAttackDebuffs:(o,r)=>this.cancelAttackDebuffs(o,r),clearDebuffs:x=>this.clearDebuffs(x),addGuard:(x,n)=>this.addGuard(x,n)});if(r){d=r.remaining;desc=r.desc}}if(desc===''){b=c.value===1?Math.ceil(d/2):c.value===3?Math.floor(d/2):0;d=Math.max(0,d-b);desc='抵消'+b+'点伤害，剩余'+d+'点待结算'}}
      if(!judged)this.emit('desc',desc)
    }
    if(d&&this.playerNeedsAvoidChoice()){this.askGuard(d,this.s.player.bleed);return this.check()}
    let curAIKey=this._curAI();
    this.s.phase=curAIKey.toUpperCase()+'_TURN';
    this.deferSettlement('AI_ATTACK',d,triggeredDefense&&this.s.defCard&&this.s.defCard.isNumberCard&&this.s.defCard.value<=3?this.s.player.bleed:0);
    return this.check()
  };

  // Route shared character-skill callbacks back into the active 1v2 context.
})();

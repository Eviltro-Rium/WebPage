(function(){
  const E=window.Engine;
  const clone=value=>JSON.parse(JSON.stringify(value));

  E.prototype.startLord=function(p,a1,a2){
    clearTimeout(this.timer);this.pendingSettlement=null;
    this.deck=this.makeDeck();this.discardBottom=[];
    this.h={player:[],ai:[],ai2:[]};this.events=[];
    let top=this.deck.pop();
    while(top.isBlack||top.isWhite){this.deck.unshift(top);top=this.deck.pop()}
    this.s={phase:'PLAYER_PLAY',turn:1,busy:false,selectedCard:-1,selectedCards:[],selectedAICard:-1,
      handLimit:7,forcedDiscard:false,hasPlayedThisTurn:false,hasPlayedBlackDefend:false,
      defenseSkipped:false,aiTurnStarted:false,aiHasPlayed:false,pendingAIBridge:null,
      pendingAIContinue:null,pendingDefenseDamage:0,pendingFiveChoice:false,fiveChoiceCard:null,
      pendingNumberJudge:null,mayDiscardAfterSkill:false,serenityHalfTarget:null,
      forceEndAITurn:false,activeAttacker:'player',is1v2:true,isLord:true,needColorChoice:false,
      pendingDialog:null,discardTop:top,
      player:this.character(p),ai:this.character(a1,true),ai2:Object.assign(this.character(a2,true),{name:'AI2 '+a2}),
      currentAITarget:0,attackTarget:null,eliminatedHandled:{ai:false,ai2:false},
      atkCard:null,atkOwner:null,defCard:null,defOwner:null,revealCards:[],
      lordPlayerTargetIdx:0};
    this.s.attackTarget='ai';
    this.draw('player',7);this.draw('ai',5);this.draw('ai2',5);
    let _hands=this.handCounts();this.silentDraws(function(){this.turnStart('player')});this.emitDrawDiff(_hands);return this.state()
  };

  E.prototype._lordNeedsTarget=function(c){
    if(c.isBlack)return false;
    if(c.isItemCard&&!c.swapHand)return false;
    let who=this.name(this.s.player);
    if(who==='Leon'&&c.value===0)return false;
    if(who==='Serenity'&&c.value===7)return false;
    return true
  };

  E.prototype._lordFixedTarget=function(){
    let idx=this.s.lordPlayerTargetIdx||0;
    let keys=['ai','ai2'];
    let key=keys[idx];
    if(!this.s[key]||!this.s[key].alive){
      key=keys[1-idx];
      this.s.lordPlayerTargetIdx=1-idx
    }
    this.s.attackTarget=key;
    let targetName=key==='ai2'?this.s.ai2.name:this.s.ai.name;
    this.emit('lordFixed','领主轮转 → '+targetName,null,{target:key})
  };

  const origAcknowledge=E.prototype.acknowledgeEvents;
  E.prototype.acknowledgeEvents=function(through){
    if(!this.s||!this.s.isLord)return origAcknowledge.call(this,through);
    this.events=this.events.filter(e=>(e.id||0)>through);
    let bridge=this.s.pendingAIBridge;
    if(bridge&&through>=bridge.afterEventId){
      this.s.pendingAIBridge=null;
      if(bridge.mode==='defense')this.later(()=>this.aiDefend1v2(bridge.attackCard,bridge.damage),220);
      else this.later(()=>this.aiTurn1v2(),220)
    }
    let continuation=this.s.pendingAIContinue;
    if(continuation&&through>=continuation.afterEventId){
      this.s.pendingAIContinue=null;
      this.continueAIAttack();return
    }
    let p=this.pendingSettlement;
    if(!p||through<p.afterEventId)return;
    this.pendingSettlement=null;this.s.pendingDefenseDamage=0;
    if(p.kind==='PLAYER_ATTACK'){
      let forceEnd=!!this.s.forceEndPlayerTurn;this.s.forceEndPlayerTurn=false;
      let targetKey=this.s.attackTarget||'ai';
      let target=this.s[targetKey];
      let dmg=this.applyDefenderAvoidance(target,p.damage);
      this.hurt(target,dmg);
      this.settleBleed(target,p.bleed);
      this._restoreAttackBuffs();
      this.resolveSerenityHalf();this.afterAttack();
      if(forceEnd)this._lordStartNextAI();
      this.check();return
    }
    let forceEnd=!!this.s.forceEndAITurn;this.s.forceEndAITurn=false;
    this.hurt(this.s.player,p.damage);
    this.settleBleed(this.s.player,p.bleed);
    this._restoreAttackBuffs();
    this.resolveSerenityHalf();this._grantChaosIfKnight('ai');
    if(forceEnd)this.endAi1v2();else this.continueAIAttack()
  };

  const origAfterAttack=E.prototype.afterAttack;
  E.prototype.afterAttack=function(){
    if(!this.s||!this.s.isLord)return origAfterAttack.call(this);
    let targetKey=this.s.attackTarget||'ai';
    let target=this.s[targetKey];
    origAfterAttack.call(this);
    if(target&&!target.alive){
      this._on1v2OpponentEliminated(targetKey);
      this.emit('desc',target.name+'被击败！玩家回合结束，另一方进攻');
      this.s.lordPlayerTargetIdx=1-(this.s.lordPlayerTargetIdx||0);
      this._lordStartNextAI()
    }
  };

  const origDispatch=E.prototype.dispatch;
  E.prototype.dispatch=function(m,p={}){
    if(m==='selectCharacters1v2'){
      if(p.mode==='lord')return this.startLord(p.player,p.ai,p.ai2);
      return this.start1v2(p.player,p.ai,p.ai2)
    }
    if(!this.s||!this.s.isLord)return origDispatch.call(this,m,p);
    if(m==='doPlay'){
      let c=this.h.player[this.s.selectedCard];
      if(!c||!this.legal(c))return this.state();
      this.s.attackTarget=null;
      if(this._lordNeedsTarget(c)){
        this._lordFixedTarget()
      }
      return this.play1v2()
    }
    if(m==='doEndTurn'){
      if(this.s.phase!=='PLAYER_PLAY')throw Error('当前不能结束回合');
      if(this.h.player.length>this.s.handLimit){this.s.forcedDiscard=true;this.s.phase='PLAYER_DISCARD';this.s.selectedCard=-1;this.s.selectedCards=[];this.emit('desc','手牌超过'+this.s.handLimit+'张，请弃至不超过'+this.s.handLimit+'张');return this.state()}
      return this._lordStartNextAI()
    }
    if(m==='doDefend'||m==='doSkipDefend'){
      let target=this.s.attackTarget||(this.s.ai.alive?'ai':(this.s.ai2&&this.s.ai2.alive?'ai2':'ai'));
      this.s.attackTarget=target;
      return this.defend1v2(m==='doSkipDefend')
    }
    if(m==='doOpponentCardConfirm'&&this.s.pendingLeonZeroDiscard)return this._finishLeonZeroDiscard();
    if(m==='chooseAICard')return this.chooseOpponentCard(Number(p.index));
    if(m==='chooseColor'){
      let card=this.h.player[this.s.selectedCard];if(!card)throw Error('请选择要指定颜色的牌');
      card.chosenColor=p.color;this.s.needColorChoice=false;this.s.pendingDialog=null;
      return this.s.phase==='PLAYER_DEFEND'?this.defend1v2():this.play1v2()
    }
    if(m==='chooseGuard')return this.chooseGuard(p.stacks);
    if(m==='chooseFly')return this.chooseFly();
    if(m==='chooseFlyContinue')return this.chooseFlyContinue(!!p.again);
    if(m==='choosePurify'){this.clean(this.s.player,false,p.kind);this.s.pendingDialog=null;this.emit('desc','净化移除一层'+({burn:'灼烧',freeze:'冷冻',bleed:'流血',poison:'中毒'}[p.kind]||'buff'));return this.state()}
    if(m==='selectCard')return this.select(p.index);
    if(m==='clearEvents'){let through=Number(p.throughId);if(Number.isFinite(through))this.acknowledgeEvents(through);else this.events=[];return{ok:true,remaining:this.events.length}}
    if(m==='restart'){clearTimeout(this.timer);this.pendingSettlement=null;this.s=null;this.h={player:[],ai:[]};this.events=[];return{ok:true}}
    if(m==='characters')return this.chars();
    if(m==='selectMode'){this.mode=!!p.mode1v2;return{status:'ok'}}
    return origDispatch.call(this,m,p)
  };

  E.prototype._lordStartNextAI=function(){
    this.fillHands1v2(true);
    if(this.s.player.burn){let dmg=this.s.player.burn;this.s.player.burn--;if(this.name(this.s.player)!=='Leon'){this.emit('burnSettle','-'+dmg+'[灼烧]',null,{who:'player',amount:dmg});this.hurt(this.s.player,dmg)}}
    this.check();if(this.s.phase==='GAME_OVER')return this.state();

    let idx=this.s.lordPlayerTargetIdx||0;
    let key=['ai','ai2'][idx];
    if(!this.s[key]||!this.s[key].alive){
      key=['ai','ai2'][1-idx];
      if(!this.s[key]||!this.s[key].alive)return this.endAi1v2()
    }

    this.s.currentAITarget=key==='ai2'?1:0;
    this.s.phase=key==='ai2'?'AI2_TURN':'AI_TURN';
    this.s.busy=true;this.s.activeAttacker=key;
    this.s.forceEndAITurn=false;this.s.pendingAIContinue=null;this.s.pendingAttack=null;
    this.s.atkCard=this.s.defCard=null;this.s.atkOwner=this.s.defOwner=null;this.s.selectedCards=[];
    this.s.aiTurnStarted=false;this.s.aiHasPlayed=false;this.s.attackTarget=null;
    this.later(()=>this.aiTurn1v2());return this.check()
  };

  const origEndAi1v2=E.prototype.endAi1v2;
  E.prototype.endAi1v2=function(){
    if(!this.s||!this.s.isLord)return origEndAi1v2.call(this);

    let key=this._curAI();
    let ch=this.s[key];
    if(ch.burn){let dmg=ch.burn;ch.burn--;if(this.name(ch)!=='Leon'){let w=this._who(ch);this.emit('burnSettle','-'+dmg+'[灼烧]，-1[灼烧层数]',null,{who:w,amount:dmg});ch.hp=Math.max(0,ch.hp-dmg);ch.alive=ch.hp>0}}
    this.check();if(this.s.phase==='GAME_OVER')return;

    this._handleEliminated1v2();

    this.s.lordPlayerTargetIdx=1-(this.s.lordPlayerTargetIdx||0);
    let nextIdx=this.s.lordPlayerTargetIdx;
    let nextKey=['ai','ai2'][nextIdx];
    if(!this.s[nextKey]||!this.s[nextKey].alive)nextKey=['ai','ai2'][1-nextIdx];
    this.s.attackTarget=nextKey;

    this.s.turn++;
    this.s.phase='PLAYER_PLAY';this.s.busy=false;this.s.activeAttacker='player';
    this.s.pendingAttack=null;this.s.pendingAIBridge=null;this.s.pendingAIContinue=null;
    this.s.forceEndAITurn=false;this.s.attackDebuffSnapshot=null;
    this.s.atkCard=this.s.defCard=null;this.s.atkOwner=this.s.defOwner=null;this.s.revealCards=[];
    this.s.hasPlayedThisTurn=false;this.s.aiTurnStarted=false;this.s.aiHasPlayed=false;
    this.s.currentAITarget=0;
    let _hands=this.handCounts();this.silentDraws(function(){this.fillHands1v2(true);this.turnStart('player')});this.emitDrawDiff(_hands);this.check()
  };

  E.prototype._lordAIFillTarget=function(){
    return 5
  };

  const origAiFillTarget=E.prototype._aiFillTarget;
  E.prototype._aiFillTarget=function(){
    if(this.s&&this.s.isLord)return 5;
    return origAiFillTarget.call(this)
  };

  E.prototype._refillLordPlayer=function(){
    if(!this.s||!this.s.isLord||!this.s.player.alive)return;
    const need=Math.max(0,7-this.h.player.length);
    if(need)this.draw('player',need,true)
  };

  E.prototype._normalizeLordAIHands=function(){
    for(const key of ['ai','ai2']){
      if(!this.s[key]||!this.s[key].alive)continue;
      while(this.h[key].length>5){
        let worst=0;
        for(let i=1;i<this.h[key].length;i++)if(this.h[key][i].value<this.h[key][worst].value)worst=i;
        const card=this.h[key].splice(worst,1)[0];
        this.discardWithEvent(card,key,{handIndex:worst,desc:this.s[key].name+'手牌超限，弃掉'+this.cardText(card)})
      }
      this.draw(key,Math.max(0,5-this.h[key].length),true)
    }
  };

  const origFillHands1v2=E.prototype.fillHands1v2;
  E.prototype.fillHands1v2=function(includePlayer=false){
    if(!this.s||!this.s.isLord)return origFillHands1v2.call(this,includePlayer);
    if(includePlayer)this._refillLordPlayer();
    this._normalizeLordAIHands();
    this.emit('desc','领主模式：玩家补至7张，存活AI各补至5张')
  };

  const origFillAIHands1v2=E.prototype.fillAIHands1v2;
  E.prototype.fillAIHands1v2=function(){
    if(!this.s||!this.s.isLord)return origFillAIHands1v2.call(this);
    this._normalizeLordAIHands();
    this.emit('desc','领主模式：存活AI手牌保持5张')
  };

  const origHandleElim=E.prototype._handleEliminated1v2;
  E.prototype._handleEliminated1v2=function(defeatedKey){
    if(!this.s||!this.s.isLord){
      if(typeof origHandleElim==='function')return origHandleElim.call(this,defeatedKey);
      return;
    }
    if(defeatedKey)this._on1v2OpponentEliminated(defeatedKey);
    else{
      for(const dk of ['ai','ai2']){
        if(this.s[dk]&&!this.s[dk].alive&&!this.s.eliminatedHandled[dk]){
          this._on1v2OpponentEliminated(dk);
        }
      }
    }
  };

  const origState=E.prototype.state;
  E.prototype.state=function(){
    if(!this.s||!this.s.isLord)return origState.call(this);
    Object.assign(this.s,{deck:this.deck.length,discard:1+this.discardBottom.length,discardBottomCount:this.discardBottom.length,playerHand:this.h.player,aiHandSize:this.h.ai.length,ai2HandSize:this.h.ai2?this.h.ai2.length:0,aiHand:this.s.revealAIHand?clone(this.h.ai):null,ai2Hand:this.s.revealAIHand&&this.h.ai2?clone(this.h.ai2):null,eventLogVersion:this.ver,events:clone(this.events)});
    return clone(this.s)
  };

  const origCheck=E.prototype.check;
  E.prototype.check=function(){
    if(!this.s||!this.s.isLord)return origCheck.call(this);
    for(const k of ['player','ai','ai2']){
      if(this.s[k])this.s[k].alive=this.s[k].hp>0
    }
    if(!this.s.player.alive||(!this.s.ai.alive&&(!this.s.ai2||!this.s.ai2.alive))){this.s.phase='GAME_OVER';this.s.busy=false;clearTimeout(this.timer)}
    return this.state()
  };

  const origStartAITurn=E.prototype.startAITurn;
  E.prototype.startAITurn=function(){
    if(this.s&&this.s.isLord)return this._lordStartNextAI();
    return origStartAITurn.call(this);
  };
})();

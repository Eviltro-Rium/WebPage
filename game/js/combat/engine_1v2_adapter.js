/* 1v2 adapter layer. Keeps topology-specific routing outside engine.js. */
(function () {
  const Engine = window.Engine;
  const Combat = window.FurryGame || {};
  const CombatState = Combat.CombatState;
  const Card = Combat.Card;
  const cp = x => Card.clone(x);
  if (!Engine || !CombatState || !Card) throw new Error('Combat protocol and engine must load before engine_1v2_adapter.js');
  const origAfterAttack1v2=Engine.prototype.afterAttack;
  Engine.prototype.afterAttack=function(){
    let result=origAfterAttack1v2.call(this);

    return result
  };

  const origAIDefendShared=Engine.prototype.aiDefend;
  Engine.prototype.aiDefend=function(atk,d){
    if(this.s&&this.s.is1v2)return this.runAIDefend1v2(atk,d);
    return origAIDefendShared.call(this,atk,d)
  };

  const origContinueAIShared=Engine.prototype.continueAIAttack;
  Engine.prototype.continueAIAttack=function(){
    if(!this.s||!this.s.is1v2)return origContinueAIShared.call(this);
    if(!this.s.player.alive||(!this.s.ai.alive&&!this.s.ai2.alive)){this.check();return}
    let key=this._curAI();
    if(!this.s[key].alive)return this.endAi1v2();
     if(typeof this.applyPendingVixrapsBurnSettle==='function')this.applyPendingVixrapsBurnSettle();
    this.s.phase=key==='ai2'?'AI2_TURN':'AI_TURN';this.s.busy=true;this.s.activeAttacker=key;
    this.s.pendingAttack=null;this.s.pendingDefenseDamage=0;this.s.attackDebuffSnapshot=null;
    this.s.atkCard=this.s.defCard=null;this.s.atkOwner=this.s.defOwner=null;this.s.revealCards=[];
    this.later(()=>this.aiTurn1v2(),220);return this.check()
  };

  Engine.prototype._startAISequence1v2=function(){
    this.fillHands1v2(true);
    this.settleBurn(this.s.player);
    this.check();if(this.s.phase==='GAME_OVER')return this.state();
    this.s.currentAITarget=this.s.ai.alive?0:1;let key=this._curAI();
    this.s.phase=key==='ai2'?'AI2_TURN':'AI_TURN';this.s.busy=true;this.s.activeAttacker=key;
    this.s.forceEndAITurn=false;this.s.pendingAIContinue=null;this.s.pendingAttack=null;
    this.s.atkCard=this.s.defCard=null;this.s.atkOwner=this.s.defOwner=null;this.s.selectedCards=[];
    this.s.aiTurnStarted=false;this.s.aiHasPlayed=false;this.s.attackTarget=null;
    this.later(()=>this.aiTurn1v2());return this.check()
  };

  const origStartAIShared=Engine.prototype.startAITurn;
  Engine.prototype.startAITurn=function(){
    if(this.s&&this.s.is1v2)return this._startAISequence1v2();
    return origStartAIShared.call(this)
  };

  const origChooseGuardShared=Engine.prototype.chooseGuard;
  Engine.prototype.chooseGuard=function(stacks){
    let result=origChooseGuardShared.call(this,stacks);
    if(this.s&&this.s.is1v2){let key=this._curAI();this.s.phase=key==='ai2'?'AI2_TURN':'AI_TURN';return this.check()}
    return result
  };

  // --- 1v2 state/check/acknowledgeEvents overrides ---
  const origState=Engine.prototype.state;
  Engine.prototype.state=function(){
    if(this.s&&this.s.is1v2)return this._state1v2();
    return origState.call(this)
  };
  Engine.prototype._state1v2=function(){
    // Keep 1v2 on the same state projection as 1v1 and adventure.  The
    // protocol already includes ai2 hand/count fields, so this adapter only
    // selects the combat topology and does not duplicate serialization.
    return CombatState.project(this,{legalHand:this._computeLegalHand()})
  };

  const origCheck=Engine.prototype.check;
  Engine.prototype.check=function(){
    if(this.s&&this.s.is1v2)return this._check1v2();
    return origCheck.call(this)
  };
  Engine.prototype._check1v2=function(){
    const adapter=this._adapter();
    const participants=adapter&&adapter.participants||['player','ai','ai2'];
    for(const k of participants){if(this.s[k])this.s[k].alive=this.s[k].hp>0}
    if(this._checkDeath1v2()){this.s.phase='GAME_OVER';this.s.busy=false;clearTimeout(this.timer)}
    const result=this._state1v2();
    this._checkInvariants('phase');
    return result
  };

  const origAck=Engine.prototype.acknowledgeEvents;
  Engine.prototype.acknowledgeEvents=function(through){
    if(this.s&&this.s.is1v2)return this._acknowledgeEvents1v2(through);
    return origAck.call(this,through)
  };
  Engine.prototype._acknowledgeEvents1v2=function(through){
    this.events=this.events.filter(e=>(e.id||0)>through);
    let bridge=this.s.pendingAIBridge;
    if(bridge&&through>=bridge.afterEventId){
      this.s.pendingAIBridge=null;
      this._tickBomb(bridge.owner || 'ai');
      if(bridge.mode==='defense')this.runAIDefend1v2(bridge.attackCard,bridge.damage);
      else this.later(()=>this.aiTurn1v2(),220)
    }
    let continuation=this.s.pendingAIContinue;
    if(continuation&&through>=continuation.afterEventId){this.s.pendingAIContinue=null;this._tickBomb(this.s.atkOwner || this._curAI() || 'ai');this.continueAIAttack();return}
    let p=this.pendingSettlement;
    if(!p||through<p.afterEventId)return;
    this.pendingSettlement=null;this.s.pendingDefenseDamage=0;
    if(p.kind==='PLAYER_ATTACK'){
      let forceEnd=!!this.s.forceEndPlayerTurn;this.s.forceEndPlayerTurn=false;
      let target=this.s.attackTarget||(this.s.ai.alive?'ai':(this.s.ai2&&this.s.ai2.alive?'ai2':'ai')),targetChar=this.s[target];
      let isDrain=!!(p.isDrain||(this.s.pendingAttack&&this.s.pendingAttack.isDrain));
      let dmg=p.damage;
      if(this.divingBlocksDamage(targetChar,this.s.atkCard)){this.emit('desc',targetChar.name+'有[潜水]，免疫蓝色攻击伤害');dmg=0;}
      else if(!isDrain)dmg=this.applyDefenderAvoidance(targetChar,dmg);
      this.dealAttackHit(this.s.player,targetChar,dmg,isDrain);
      this.settleBleed(targetChar,p.bleed);
      this._restoreAttackBuffs();
      // 冻洋蓝鲸：玩家攻击结算AOE伤害和失温（跳过主目标）
      const pa1=this.s.pendingAttack||{};
      this.performAttack({type:'aoe',target,aoeTargets:pa1.aoeTargets,aoeDamage:pa1.aoeDamage,skipTarget:true,hypothermiaTarget:pa1.hypothermiaTarget,hypothermiaAmount:pa1.hypothermiaAmount});
      this.resolveSerenityHalf();
       if(typeof this.applyPendingSaikiBleed==='function')this.applyPendingSaikiBleed();
       if(typeof this.applyPendingVixrapsBurnSettle==='function')this.applyPendingVixrapsBurnSettle();
       this.afterAttack();
      if(forceEnd)this.startAITurn();
      this.check();return
    }
    let forceEnd=!!this.s.forceEndAITurn;this.s.forceEndAITurn=false;let bombOwner=this.s.atkOwner || this._curAI() || 'ai';
    let isDrainAi=!!(p.isDrain||(this.s.pendingAttack&&this.s.pendingAttack.isDrain));
    let dmg2=p.damage;if(this.divingBlocksDamage(this.s.player,this.s.atkCard)){this.emit('desc','你有[潜水]，免疫蓝色攻击伤害');dmg2=0;}this.dealAttackHit(this.s[bombOwner]||this.s.ai,this.s.player,dmg2,isDrainAi);
    this.settleBleed(this.s.player,p.bleed);
    this._tickBomb(bombOwner);
    this._restoreAttackBuffs();
    // 冻洋蓝鲸：防御结束后结算AOE伤害和失温（跳过主目标玩家）
    const pa2=this.s.pendingAttack||{};
    this.performAttack({type:'aoe',target:'player',aoeTargets:pa2.aoeTargets,aoeDamage:pa2.aoeDamage,skipTarget:true,hypothermiaTarget:pa2.hypothermiaTarget,hypothermiaAmount:pa2.hypothermiaAmount});
    this.resolveSerenityHalf();
    if(typeof this.applyPendingSaikiBleed==='function')this.applyPendingSaikiBleed();
     if(typeof this.applyPendingVixrapsBurnSettle==='function')this.applyPendingVixrapsBurnSettle();
     this._grantChaosIfKnight('ai');
    if(forceEnd)this.endAi1v2();else this.continueAIAttack()
  };

  // --- 1v2 dispatch override ---
  const origEmit=Engine.prototype.emit;
  Engine.prototype.emit=function(type,desc,card,extra={}){
    const id=origEmit.call(this,type,desc,card,extra);
    if(type==='aiPlay')this._tickBomb(this.s&&this.s.atkOwner||'ai');
    else if(type==='aiDefend')this._tickBomb(this.s&&this.s.defOwner||'ai');
    return id;
  };
  const origDispatch=Engine.prototype.dispatch;
  Engine.prototype.dispatch=function(m,p={}){
    if(m==='selectCharacters1v2')return this.start1v2(p.player,p.ai,p.ai2);
    if(m==='chooseMozeSeven')return this.resolveMozeSevenChoice(p.choice);

    if(!this.s||!this.s.is1v2)return origDispatch.call(this,m,p);
    if(m==='chooseColor'){
      if(this.s.pendingBlackPlay){
        const mode=this._resumePendingBlackCard(p.color);
        return mode==='defend'?this.defend1v2():this.play1v2();
      }
      let card=this.h.player[this.s.selectedCard];if(!card)throw Error('请选择要指定颜色的牌');
      card.chosenColor=p.color;this.s.needColorChoice=false;this.s.pendingDialog=null;
      return this.s.phase==='PLAYER_DEFEND'?this.defend1v2():this.play1v2()
    }
    if(m==='doChanSevenKeep'||m==='doChanSevenDiscard'||m==='doSaikiThreeKeep'||m==='doSaikiThreeDiscard'||m==='doChanFourSwap'||m==='doChanFourDiscard'||m==='doFiveHeal'||m==='doFiveDamage'||m==='doSaikiSixConfirm'||m==='chanFiveReorder')return origDispatch.call(this,m,p);
    if(m==='doPlay'){
      let c=this.h.player[this.s.selectedCard];
      if(!c||!this.legal(c))return this.state();
      // `attackTarget` is a per-card value in 1v2. Adventure startup uses
      // NPC1 as a display/default target, so it must not suppress the target
      // roll for the first card (especially a targeted trophy white card).
      this.s.attackTarget = null;
      // In 1v2, trophy white cards are single-target effects too.  Include
      // them in target selection so burn/bleed/freeze/poison/bomb/disarm and
      // Russian roulette use the currently selected opponent instead of
      // silently falling back to opponent I.
      let needsTarget=(!c.isItemCard||c.swapHand||c.trophyWhite)&&!c.isBlack;
      if(needsTarget){
        let alive1=this.s.ai.alive,alive2=this.s.ai2&&this.s.ai2.alive;
        if (alive1&&alive2){
          const random=Combat.CombatRuntime?Combat.CombatRuntime.random:Math.random;
          let roll=Math.floor(random()*6)+1;
          this.s.attackTarget=roll<=3?'ai':'ai2';
          let targetName=this.s.attackTarget==='ai2'?this.s.ai2.name:this.s.ai.name;
          this.emit('dualDice','骰子：'+roll+' → '+targetName,c,{roll,target:this.s.attackTarget})
        }else{
          this.s.attackTarget=alive1?'ai':'ai2'
        }
      }
      return this.play1v2()
    }
    if(m==='doEndTurn'){
      if(this.s.phase!=='PLAYER_PLAY')throw Error('当前不能结束回合');
      if(this.h.player.length>this.s.handLimit){this.s.forcedDiscard=true;this.s.phase='PLAYER_DISCARD';this.s.selectedCard=-1;this.s.selectedCards=[];this.emit('desc','手牌超过'+this.s.handLimit+'张，请弃至不超过'+this.s.handLimit+'张');return this.state()}
      return this._startAISequence1v2()
    }
    if(m==='doDefend'||m==='doSkipDefend'){
      let target=this.s.attackTarget||(this.s.ai.alive?'ai':(this.s.ai2&&this.s.ai2.alive?'ai2':'ai'));
      this.s.attackTarget=target;
      return this.defend1v2(m==='doSkipDefend')
    }
    return origDispatch.call(this,m,p)
  };

  // Resume a black card that is still selected in the hand.  The engine keeps
  // the card out of the table zones until its color is confirmed, so the
  // normal play/defend path emits exactly one hand-to-zone animation.
  const dispatchBeforeBlackResume = Engine.prototype.dispatch;
  Engine.prototype.dispatch = function (m, p = {}) {
    if (m === 'chooseColor' && this.s && !this.s.is1v2 && this.s.pendingBlackPlay) {
      const mode = this._resumePendingBlackCard(p.color);
      return mode === 'defend' ? this.defend() : this.play();
    }
    return dispatchBeforeBlackResume.call(this, m, p);
  };

  window.furryBattle = window.furryBattle || {};
  const e = new Engine();
  window.furryBattle.dispatch = (m, p) => e.dispatch(m, p);
  window.furryBattle.getState = () => e.state();
})();

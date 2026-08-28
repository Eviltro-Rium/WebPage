/* Furry Battle browser engine — a standalone port of the Swing turn loop. */
(function () {
  const C=['RED','YELLOW','BLUE','GREEN'];
  const M=new Proxy({},{get(t,n){let m=CharacterRegistry.get(n);return m?[m.hp,m.type,m.passive]:undefined}});
  const cp=x=>JSON.parse(JSON.stringify(x));
  const num=(color,value,white=false)=>({value,color,drawTwo:false,drawThree:false,potion:false,purify:false,superPurify:false,swapHand:false,shuffleToDeck:false,isBlack:false,isWhite:white,isNumberCard:true,isItemCard:false});
  const item=(color,k)=>({value:-1,color,drawTwo:k==='drawTwo',drawThree:k==='drawThree',potion:k==='potion',purify:k==='purify',superPurify:k==='superPurify',swapHand:k==='swap',shuffleToDeck:k==='shuffle',isBlack:color==='BLACK',isWhite:color==='WHITE',isNumberCard:false,isItemCard:true});
  class Engine{
    constructor(){this.s=null;this.mode=false;this.deck=[];this.discardBottom=[];this.h={player:[],ai:[]};this.events=[];this.ver=0;this.timer=0;this.pendingSettlement=null}
    chars(){return CharacterRegistry.all().map(m=>({name:m.name,hp:m.hp,type:m.type,passive:m.passive}))}
    character(n,ai=false){let m=CharacterRegistry.get(n);return Object.assign({name:(ai?'AI ': '')+n,hp:m.hp,maxHp:m.hp,burn:0,frozen:false,bleed:0,poison:0,guard:0,fly:0,alive:true,bloodthirst:false,bomb:0},m.init())}
    name(x){return x.name.replace(/^AI\d*\s+/,'')}
    makeDeck(){let d=[];for(const c of C){for(let v=1;v<=7;v++)for(let n=0;n<(v<=3?3:v<=6?2:1);n++)d.push(num(c,v));d.push(num(c,0))}for(let v=1;v<=7;v++)d.push(num('WHITE',v,true));for(let i=0;i<2;i++)d.push(item('BLACK','black'),item('BLACK','drawTwo'),item('WHITE','drawThree'),item('WHITE','swap'));for(let i=0;i<4;i++)d.push(item('BLACK','shuffle'),item('WHITE','potion'),item('WHITE','superPurify'));for(let i=0;i<6;i++)d.push(item('WHITE','purify'));for(let i=d.length-1;i;i--){let j=Math.floor(Math.random()*(i+1));[d[i],d[j]]=[d[j],d[i]]}return d}
    start(p,a){clearTimeout(this.timer);this.pendingSettlement=null;this.deck=this.makeDeck();this.discardBottom=[];this.h={player:[],ai:[]};this.events=[];let top=this.deck.pop();while(top.isBlack||top.isWhite){this.deck.unshift(top);top=this.deck.pop()}this.s={phase:'PLAYER_PLAY',turn:1,busy:false,selectedCard:-1,selectedCards:[],selectedAICard:-1,handLimit:5,forcedDiscard:false,hasPlayedThisTurn:false,hasPlayedBlackDefend:false,defenseSkipped:false,unblockDefend:false,attackModBonus:0,aiTurnStarted:false,aiHasPlayed:false,pendingAIBridge:null,pendingAIContinue:null,pendingDefenseDamage:0,pendingFiveChoice:false,fiveChoiceCard:null,pendingNumberJudge:null,mayDiscardAfterSkill:false,serenityHalfTarget:null,forceEndAITurn:false,activeAttacker:'player',is1v2:false,revealAIHand:false,needColorChoice:false,pendingDialog:null,discardTop:top,player:this.character(p),ai:this.character(a,true),atkCard:null,atkOwner:null,defCard:null,defOwner:null,revealCards:[]};this.draw('player',5);this.draw('ai',5);let _hands=this.handCounts();this.silentDraws(function(){this.turnStart('player')});this.emitDrawDiff(_hands);return this.state()}
    state(){if(!this.s)return{phase:'SELECT_MODE',deck:0,turn:1};Object.assign(this.s,{deck:this.deck.length,discard:1+this.discardBottom.length,discardBottomCount:this.discardBottom.length,playerHand:this.h.player,aiHandSize:this.h.ai.length,aiHand:this.s.revealAIHand?cp(this.h.ai):null,eventLogVersion:this.ver,events:cp(this.events)});return cp(this.s)}
    _shuffleDiscardIntoDeck(){for(const x of this.discardBottom)if(x.isBlack||x.isWhite)delete x.chosenColor;this.deck.push(...this.discardBottom);this.discardBottom=[];for(let i=this.deck.length-1;i;i--){let j=Math.floor(Math.random()*(i+1));[this.deck[i],this.deck[j]]=[this.deck[j],this.deck[i]]}}
    refillDeckIfNeeded(){if(this.deck.length||!this.discardBottom.length)return;this._shuffleDiscardIntoDeck();this.emit('desc','牌库已空，弃牌库洗回牌堆')}
    draw(w,n,animated=false){let cards=[];while(n--){this.refillDeckIfNeeded();if(!this.deck.length)break;let c=this.deck.pop();this.h[w].push(c);cards.push(c)}if(animated&&cards.length&&!this._suppressDrawAnim)this.emit('draw',`${w==='player'?'玩家':w==='ai2'?'AI2':'AI'}抽${cards.length}张牌`,null,{who:w,count:cards.length});return cards}
    handCounts(){return{player:(this.h.player||[]).length,ai:(this.h.ai||[]).length,ai2:(this.h.ai2||[]).length}}
    emitDrawDiff(before){for(const w of['player','ai','ai2']){let n=(this.h[w]||[]).length-(before[w]||0);if(n>0)this.emit('draw',`${w==='player'?'玩家':w==='ai2'?'AI2':'AI'}抽${n}张牌`,null,{who:w,count:n})}}
    silentDraws(fn){this._suppressDrawAnim=true;try{fn.call(this)}finally{this._suppressDrawAnim=false}}
    discardToBottom(card){if(card){if(card.isBlack||card.isWhite)delete card.chosenColor;this.discardBottom.push(cp(card))}}
    discardWithEvent(card,who='player',extra={}){
      if(!card)return;
      this.discardToBottom(card,who);
      this.emit('discard',extra.desc||`${who==='player'?'玩家':who==='ai2'?'AI2':'AI'}弃掉${this.cardText(card)}`,card,Object.assign({who,from:'hand',destination:'bottom'},extra))
    }
    discardManyWithEvent(cards,who='player',extra={}){
      let batch=(cards||[]).filter(Boolean);
      if(!batch.length)return;
      for(const card of batch)this.discardToBottom(card,who);
      let label=who==='player'?'玩家':who==='ai2'?'AI2':'AI';
      this.emit('discardMany',extra.desc||`${label}弃掉${batch.length}张牌`,batch[0],Object.assign({who,from:'hand',destination:'bottom',cards:cp(batch)},extra))
    }
    setDiscardTop(card){if(this.s.discardTop)this.discardToBottom(this.s.discardTop);this.s.discardTop=cp(card)}
    emit(type,desc,card,extra={}){if(type!=='playerPlay'&&this.s&&this.s.atkOwner==='player'&&this.s.atkCard&&this._animatedPlayerAttack!==this.s.atkCard){this._animatedPlayerAttack=this.s.atkCard;let playId=++this.ver;this.events.push({id:playId,type:'playerPlay',desc:'玩家打出进攻牌',card:cp(this.s.atkCard)})}let id=++this.ver;this.events.push(Object.assign({id,type,desc,card:card&&cp(card)},extra));return id}
    reveal(desc){let c=this.deck.pop();if(!c)return null;this.s.revealCards=[cp(c)];this.emit('reveal',desc,c,{from:'deck'});return c}
    effective(c){return c.chosenColor||c.color}
    _who(x){if(x===this.s.player)return'player';if(this.s.is1v2&&x===this.s.ai2)return'ai2';return'ai'}
    cardText(c){if(c.isBlack)return '黑牌';if(c.isWhite)return c.isNumberCard?`白${c.value}`:'白色道具牌';return `${({RED:'红',YELLOW:'黄',BLUE:'蓝',GREEN:'绿'})[c.color]||''}${c.value}`}
    colorName(c){return({RED:'红色',YELLOW:'黄色',BLUE:'蓝色',GREEN:'绿色',BLACK:'黑色',WHITE:'白色'})[c]||'当前颜色'}
    chooseAIColor(){let counts=Object.fromEntries(C.map(x=>[x,0]));for(const card of this.h.ai){let color=this.effective(card);if(C.includes(color))counts[color]++}return C.reduce((a,b)=>counts[b]>counts[a]?b:a)}
    setAIWildColor(card,top,announce=true){if(card.isBlack)card.chosenColor=this.chooseAIColor();else if(card.isWhite)card.chosenColor=this.effective(top);if(announce)this.announceAIColor(card)}
    announceAIColor(card){if(card.isBlack||card.isWhite)this.emit('colorChoice',`AI指定${({RED:'红色',YELLOW:'黄色',BLUE:'蓝色',GREEN:'绿色'})[card.chosenColor]}`,card)}
    aiContext(extra={}){let a=this.s.ai,o=this.s.player,hand=this.h.ai||[],oppHand=this.h.player||[],debuffCount=(a.burn||0)+(a.bleed||0)+(a.poison||0)+(a.frozen?1:0),chaos=[a.chaos_red,a.chaos_yellow,a.chaos_blue,a.chaos_green].filter(Boolean).length,incoming=extra.incomingDamage||0;return Object.assign({name:this.name(a),self:a,opponent:o,hand,opponentHand:oppHand,mode:this.s.isLord?'lord':this.s.is1v2?'1v2':'1v1',turn:this.s.turn||1,debuff:debuffCount>0,debuffCount,full:a.hp>=a.maxHp,missingHp:Math.max(0,a.maxHp-a.hp),hpPct:Math.floor(a.hp*100/a.maxHp),oppHpPct:Math.floor(o.hp*100/o.maxHp),guard:a.guard||0,oppGuard:o.guard||0,burn:a.burn||0,bleed:a.bleed||0,poison:a.poison||0,frozen:!!a.frozen,oppBurn:o.burn||0,oppBleed:o.bleed||0,oppPoison:o.poison||0,oppFrozen:!!o.frozen,handSize:hand.length,oppHand:oppHand.length,numberSum:hand.filter(q=>q.isNumberCard).reduce((sum,q)=>sum+Math.max(0,q.value),0),maxNumber:hand.filter(q=>q.isNumberCard).reduce((max,q)=>Math.max(max,q.value),0),chaos:chaos>0,chaosCount:chaos,chaos_red:!!a.chaos_red,chaos_yellow:!!a.chaos_yellow,chaos_blue:!!a.chaos_blue,chaos_green:!!a.chaos_green,incomingDamage:incoming,lethal:incoming>=a.hp},extra)}
    aiSkip(name,c,x,phase='attack'){if(c.isItemCard)return false;let m=AIRegistry.get(name);return m?!!m.skip(this,c,x,phase):false}
    baseAttackScore(c,top,x){
      if(c.potion)return x.missingHp>=5?72:x.missingHp>0?48:4;
      if(c.superPurify){
        if(x.debuffCount>=3)return 76;
        if(x.oppGuard>=3)return 70;
        if(x.debuffCount)return 58;
        if(x.oppGuard)return 52;
        return 5
      }
      if(c.purify)return x.debuffCount>=2?64:x.debuffCount?54:5;
      if(c.drawThree)return x.handSize<=2?62:x.handSize<=4?46:24;
      if(c.drawTwo)return x.handSize<=3?56:36;
      if(c.swapHand){
        if(x.handSize<=2&&x.oppHand>=4)return 68;
        if(x.handSize<x.oppHand)return 54;
        return 6
      }
      if(c.shuffleToDeck)return this.discardBottom.length>=10?42:10;
      if(c.isBlack)return 14;
      if(c.isWhite)return 12;
      if(this.aiSkip(x.name,c,x,'attack'))return -100;
      let color=this.effective(c)===this.effective(top),number=c.value===top.value;
      if(!color&&!number)return -100;
      return(color?22:17)+c.value*2
    }
    aiAttackScore(c,top){let x=this.aiContext();if(c.isItemCard)return this.baseAttackScore(c,top,x);if(this.aiSkip(x.name,c,x,'attack'))return-100;let m=AIRegistry.get(x.name),role=m?m.attackScore(this,c.value,c,x):null;return role!=null?role:this.baseAttackScore(c,top,x)}
    chooseAIPlay(top){let best=null,score=-Infinity;for(const c of this.h.ai){if(!this.legal(c))continue;let s=this.aiAttackScore(c,top);if(s>score){score=s;best=c}}return score<=-100?null:best}
    aiDefendLegal(c,top,x){if(c.isBlack||c.drawThree||c.drawTwo||c.potion||c.swapHand||c.shuffleToDeck)return true;if(c.superPurify)return x.debuff||x.oppGuard>0;if(c.purify)return x.debuff;if(c.isWhite)return c.value<=3&&this.legal(c,true);return c.value<=3&&this.legal(c,true)}
    baseDefendScore(c,top,x){
      if(c.potion)return x.missingHp>=5||x.lethal?78:x.missingHp?52:4;
      if(c.superPurify){
        if(x.debuffCount>=2)return 72;
        if(x.oppGuard>=3)return 58;
        if(x.debuff||x.oppGuard)return 50;
        return 5
      }
      if(c.purify)return x.debuffCount>=2?66:x.debuff?55:5;
      if(c.drawThree)return x.handSize<=2?58:38;
      if(c.drawTwo)return x.handSize<=3?52:34;
      if(c.swapHand)return x.handSize<x.oppHand?48:6;
      if(c.shuffleToDeck)return this.discardBottom.length>=10?34:8;
      if(c.isBlack)return 18;
      if(c.isWhite)return 22;
      if(!this.aiDefendLegal(c,top,x))return -100;
      return(x.lethal?18:0)+28+(4-c.value)*6
    }
    aiDefendScore(c,top,incomingDamage=0){let x=this.aiContext({incomingDamage});if(c.isItemCard)return this.baseDefendScore(c,top,x);if(this.aiSkip(x.name,c,x,'defense'))return-100;let m=AIRegistry.get(x.name),role=m?m.defendScore(this,c.value,c,top,x):null;return role!=null?role+(x.lethal?12:0):this.baseDefendScore(c,top,x)}
    chooseAIDefend(top,incomingDamage=0){let x=this.aiContext({incomingDamage}),best=null,score=-Infinity;for(const c of this.h.ai){if(!this.aiDefendLegal(c,top,x))continue;let s=this.aiDefendScore(c,top,incomingDamage);if(s>score){score=s;best=c}}return score<=-100?null:best}
    aiKeepScore(c){
      let x=this.aiContext(),m=AIRegistry.get(x.name),role=m?m.keepScore(this,c,x):null;
      if(role!=null)return role;
      if(c.superPurify)return 72;
      if(c.potion)return 68;
      if(c.drawThree)return 62;
      if(c.drawTwo)return 58;
      if(c.purify)return 54;
      if(c.swapHand)return 48;
      if(c.shuffleToDeck)return 44;
      if(c.isBlack)return 42;
      if(c.isWhite)return 38+Math.max(0,c.value);
      return 24+Math.max(0,c.value)*4
    }
    chooseAIDiscard(hand=this.h.ai){let worst=-1,score=Infinity;for(let i=0;i<hand.length;i++){let value=this.aiKeepScore(hand[i]);if(value<score){score=value;worst=i}}return worst}
    defenseJudge(owner,card,incoming){let defender=this.s[owner],opponentKey=owner==='player'?(this.s.is1v2&&this.s.atkOwner&&this.s.atkOwner!=='player'?this.s.atkOwner:'ai'):'player',opponent=this.s[opponentKey],name=this.name(defender),v=card.value;if(!((name==='Chan'&&v===3)||(name==='Saiki'&&v===3)||(name==='Blaze'&&v===2)||(name==='Serenity'&&v===0)))return null;let r=this.reveal(`${name} ${v}牌防御判定`);if(!r)return{remaining:incoming};let remaining=incoming;
      if(name==='Chan'){let heal=r.isItemCard?0:Math.ceil(r.value/2);this.heal(defender,heal);this.h[owner].push(r);this.emit('desc',`Chan 3牌判定：${this.cardText(r)}，恢复${heal}点并加入手牌`)}
      if(name==='Saiki'){let success=r.isBlack||r.isWhite||this.effective(r)==='YELLOW';if(success){remaining=0;this.discardWithEvent(r,owner,{from:'reveal',faceUp:true,desc:`Saiki 3牌判定成功：${this.cardText(r)}置于弃牌库底，防御所有伤害`})}else{this.h[owner].push(r);this.emit('desc',`Saiki 3牌判定失败：${this.cardText(r)}加入手牌`)}}
      if(name==='Blaze'&&v===2){let counter=r.isItemCard?4:r.value;this.h[owner].push(r);this.hurt(opponent,counter);if(r.isItemCard)this.burn(opponent,1);this.emit('desc',`Blaze 2牌判定：反击${counter}点${r.isItemCard?'并施加1层灼烧':''}，判定牌加入手牌`)}
      if(name==='Serenity'){remaining=0;let yellow=this.effective(r)==='YELLOW';if(yellow){this.s.serenityHalfTarget=opponentKey;this.emit('desc','Serenity 0牌判定黄牌：防御伤害，攻防结束后进攻方生命减半')}else{this.cancelAttackDebuffs(owner,false);this.emit('desc','Serenity 0牌判定非黄牌：免疫所有伤害和debuff')}this.discardWithEvent(r,owner,{from:'reveal',faceUp:true,desc:`Serenity 0牌将${this.cardText(r)}置于弃牌库底`})}
      return{remaining}}
    opponentChoiceSkill(name,value){return (name==='Chan'&&(value===4||value===7))||(name==='Saiki'&&value===3)||(name==='Blaze'&&value===4)||(name==='Moze'&&value===5)}
    finishOpponentAttack(p,d,skip=false,unblock=false){this.s.pendingOpponentSkill=null;return this.gateAdventureAttackMod(p.attackCard,d,skip,unblock)}
    opponentEmpty(p){let d=0,skip=false;if(p.name==='Chan'&&p.value===4){d=2;skip=true}if(p.name==='Chan'&&p.value===7)d=6;if(p.name==='Saiki')d=2;if(p.name==='Blaze')d=2+(this.s.player.burn?1:0);if(p.name==='Moze')skip=true;this.emit('desc',`${p.name} ${p.value}牌：对手无手牌${d?`，造成${d}点伤害`:''}${skip?'并跳过防御':''}`,p.attackCard);return this.finishOpponentAttack(p,d,skip,false)}
    gateAdventureAttackMod(card,damage,skip=false,unblock=false,delay=0){
      damage=Number(damage)||0;skip=!!skip;unblock=!!unblock;
      this.s.pendingAttack={damage,unblock};
      this.s.defenseSkipped=!!(skip||unblock||damage<=0);
      this.s.pendingAttackMod={card:cp(card),skip,unblock,delay:delay||0};
      if(this.s.isAdventure&&damage>0){
        this.s.phase='ATTACK_MOD_CHOICE';
        this.s.busy=false;
        return this.check();
      }
      return this.continueAfterAttackMod();
    }
    continueAfterAttackMod(){
      let p=this.s.pendingAttackMod||{};
      let skip=!!p.skip,unblock=!!p.unblock,card=p.card||this.s.atkCard,delay=p.delay||0;
      let d=(this.s.pendingAttack&&this.s.pendingAttack.damage)||0;
      if(this.s.attackModBonus&&d>0){
        d+=this.s.attackModBonus;
        this.s.pendingAttack.damage=d;
        this.emit('desc','攻击修正+'+this.s.attackModBonus+'点伤害');
        this.s.attackModBonus=0;
      }
      this.s.pendingAttackMod=null;
      const who=this.name(this.s.player);
      if(who==='Otto'&&d>4&&!unblock&&(this.s.player.crit||0)>0){
        unblock=true;
        this.s.player.crit--;
        if(this.s.pendingAttack)this.s.pendingAttack.unblock=true;
        this.s.defenseSkipped=true;
        this.emit('buff','-1[暴击]',null,{who:'player',kind:'crit',stacks:this.s.player.crit});
        this.emit('desc',`Otto 消耗1层暴击，${d}点伤害变为不可防御`);
      }
      if(this.s.is1v2){
        if(d&&!skip&&!unblock){this.s.phase='AI_DEFEND';this.s.busy=true;this.later(()=>this.aiDefend1v2(card,d),delay)}
        else{this.s.phase='AI_DEFEND';this.s.busy=true;this.deferSettlement('PLAYER_ATTACK',d,0)}
        return this.check();
      }
      if(d&&!skip&&!unblock){this.s.phase='AI_DEFEND';this.s.busy=true;this.later(()=>this.aiDefend(card,d),delay)}
      else{let targetKey=this.s.is1v2?(this.s.attackTarget||'ai'):'ai';if(d>0)this.hurt(this.s[targetKey],d);this.s.phase='AI_DEFEND';this.s.busy=true;this.later(()=>{this._restoreAttackBuffs();this.afterAttack();this.check()},1700)}
      return this.check();
    }
    resolveAttackModChoice(params={}){
      if(this.s.phase!=='ATTACK_MOD_CHOICE'||!this.s.pendingAttackMod)throw Error('当前没有待处理的攻击修正');
      this.s.attackModBonus=params.bonus||0;
      if(params.unblock){
        this.s.pendingAttackMod.unblock=true;
        this.s.pendingAttackMod.skip=true;
        if(this.s.pendingAttack)this.s.pendingAttack.unblock=true;
        this.s.defenseSkipped=true;
      }
      return this.continueAfterAttackMod();
    }

    heal(x,n,kind='heal'){if(n<=0)return;let _before=x.hp;x.hp=Math.min(x.maxHp,x.hp+n);let _actual=x.hp-_before;if(this.name(x)==='Serenity')x.bloodthirst=x.hp<30;let w=x===this.s.player?'player':'ai';this.emit('heal',`+${_actual}[${kind==='drain'?'吸血':kind==='passive'?'被动':'生命'}]`,null,{who:w,amount:_actual,kind});if(kind!=='drain'&&this.name(x)==='Serenity'&&x.hp>=30){x.hp=Math.min(x.maxHp,x.hp+1);this.emit('heal','+1[被动]',null,{who:w,amount:1,kind:'passive'})}}
    freeze(x,opts){if(this.name(x)!=='Serenity'){x.frozen=true;if(!opts||opts.silent!==true){let w=x===this.s.player?'player':'ai';this.emit('buff','[冷冻]',null,{who:w,kind:'freeze',stacks:1})}}}
    burn(x,n,opts){if(n>0&&this.name(x)!=='Leon'){x.burn=Math.min(4,x.burn+n);if(!opts||opts.silent!==true){let w=x===this.s.player?'player':'ai';this.emit('buff',`+${n}[灼烧]`,null,{who:w,kind:'burn',stacks:x.burn})}}}
    bleed(x,n,opts){if(n>0){x.bleed=Math.min(2,x.bleed+n);if(!opts||opts.silent!==true){let w=x===this.s.player?'player':'ai';this.emit('buff',`${n>1?n:''}[流血]`,null,{who:w,kind:'bleed',stacks:x.bleed})}}}
    settleBleed(target,stacks){if((target.bleed||0)<=0||stacks<=0)return;this.hurt(target,stacks,true,{silent:true});target.bleed--;let w=target===this.s.player?'player':(target===this.s.ai2?'ai2':'ai');this.emit('bleedSettle',`-${stacks}[流血]，-1[流血层数]`,null,{who:w,amount:stacks})}
    poison(x,n,opts){if(n>0){x.poison=Math.min(3,(x.poison||0)+n);if(!opts||opts.silent!==true){let w=x===this.s.player?'player':(x===this.s.ai2?'ai2':'ai');this.emit('buff',`+${n}[中毒]`,null,{who:w,kind:'poison',stacks:x.poison})}}}
    applySaikiPassive(attacker,target,card){if(this.name(attacker)==='Saiki'&&this.effective(card)==='YELLOW')this.bleed(target,1,{silent:true})}
    clearDebuffs(x){x.burn=0;x.bleed=0;x.poison=0;x.frozen=false;x.bomb=0}
    rememberAttackDebuffs(owner){let old=this.s.attackDebuffSnapshot;if(old&&old.owner===owner)return;let x=this.s[owner];this.s.attackDebuffSnapshot={owner,burn:x.burn,bleed:x.bleed,poison:x.poison||0,frozen:x.frozen}}
    cancelAttackDebuffs(owner,reflect=false){let snap=this.s.attackDebuffSnapshot;if(!snap||snap.owner!==owner)return;let x=this.s[owner],attackerKey=owner==='player'?(this.s.is1v2&&this.s.atkOwner&&this.s.atkOwner!=='player'?this.s.atkOwner:'ai'):'player',attacker=this.s[attackerKey],burn=Math.max(0,x.burn-snap.burn),bleed=Math.max(0,x.bleed-snap.bleed),poison=Math.max(0,(x.poison||0)-(snap.poison||0)),froze=!snap.frozen&&x.frozen;let pending=this.s.pendingBuffRestore;if(pending&&pending.target===owner){bleed+=Math.max(0,pending.after.bleed-pending.before.bleed);burn+=Math.max(0,pending.after.burn-pending.before.burn);poison+=Math.max(0,pending.after.poison-pending.before.poison);if(pending.after.frozen&&!pending.before.frozen)froze=true;this.s.pendingBuffRestore=null}x.burn=snap.burn;x.bleed=snap.bleed;x.poison=snap.poison||0;x.frozen=snap.frozen;if(reflect){this.burn(attacker,burn);this.bleed(attacker,bleed);this.poison(attacker,poison);if(froze)this.freeze(attacker)}}
    hurt(x,n,kind=false,opts={}){n=Math.max(0,Number(n)||0);x.hp=Math.max(0,x.hp-n);x.alive=x.hp>0;if(this.name(x)==='Serenity')x.bloodthirst=x.hp<30;if(n>0&&!opts.silent){let w=x===this.s.player?'player':(x===this.s.ai2?'ai2':'ai');let tag=kind==='drain'?'吸血':kind==='bleed'||kind===true?'流血':kind==='poison'?'中毒':'伤害';this.emit('hurt',`-${n}[${tag}]`,null,{who:w,amount:n,bleed:kind==='bleed'||kind===true,drain:kind==='drain',poison:kind==='poison'})}}
    chooseMozeGuardUse(guard,damage,hp){if(damage>=hp)return Math.min(guard,damage);if(damage<=2)return 0;if(guard>=3&&damage>=5)return Math.min(guard,damage);if(guard>=2&&damage>=4)return Math.min(guard,damage);if(hp<=30)return Math.min(guard,damage);return 0}
    chooseDefenderGuardUse(defender,damage){let guard=defender.guard||0;if(damage<=0||guard<=0)return 0;if(this.s.isAdventure)return Math.min(guard,damage);return this.chooseMozeGuardUse(guard,damage,defender.hp)}
    applyDefenderGuard(defender,damage){if(!defender||damage<=0)return Math.max(0,damage);let use=this.chooseDefenderGuardUse(defender,damage);if(use<=0)return Math.max(0,damage);defender.guard-=use;let remaining=Math.max(0,damage-use);this.emit('desc',defender.name+'消耗'+use+'层[守护]，减免'+use+'点伤害');return remaining}
    applyDefenderFly(defender,damage){if(!defender||damage<=0)return Math.max(0,damage);while((defender.fly||0)>0&&damage>0){defender.fly--;this.emit('desc',defender.name+'消耗1层[飞翔]尝试躲避');if(Math.random()<0.5){this.emit('desc',defender.name+'飞翔躲避成功');return 0}this.emit('desc',defender.name+'飞翔躲避失败')}return Math.max(0,damage)}
    applyDefenderAvoidance(defender,damage){let remaining=this.applyDefenderFly(defender,damage);if(remaining>0)remaining=this.applyDefenderGuard(defender,remaining);return remaining}
    playerNeedsAvoidChoice(){return (this.s.player.guard||0)>0||(this.s.player.fly||0)>0}
    askGuard(d,bleed=0){this.s.pendingGuardDamage=Math.max(0,d);this.s.pendingGuardBleed=bleed;this.s.pendingDefenseDamage=Math.max(0,d);this.s.pendingDialog='guard';this.s.phase='GUARD_CHOICE';this.s.busy=false}
    _pendingBleedActive(){let defCard=this.s.defCard;return defCard&&defCard.isNumberCard&&defCard.value<=3?(this.s.pendingGuardBleed||this.s.player.bleed||0):0}
    _settleAvoidedAttack(remaining){this.s.pendingDialog=null;this.s.pendingGuardDamage=0;this.s.pendingGuardBleed=0;this.s.phase='AI_TURN';this.deferSettlement('AI_ATTACK',Math.max(0,remaining),remaining>0?this._pendingBleedActive():0);return this.check()}
    chooseFly(){let incoming=this.s.pendingGuardDamage||0,p=this.s.player;if((p.fly||0)<=0)return this._settleAvoidedAttack(incoming);p.fly--;this.emit('desc','消耗1层[飞翔]尝试躲避');if(Math.random()<0.5){this.emit('desc','飞翔躲避成功');return this._settleAvoidedAttack(0)}this.emit('desc','飞翔躲避失败');if((p.fly||0)>0){this.s.pendingDialog='flyRetry';this.s.phase='GUARD_CHOICE';this.s.busy=false;return this.state()}return this._settleAvoidedAttack(incoming)}
    chooseFlyContinue(again){if(again)return this.chooseFly();return this._settleAvoidedAttack(this.s.pendingGuardDamage||0)}
    clearPositiveBuffs(x){if(!x)return;x.guard=0;x.fly=0;x.crit=0;x.lush=0;x.chaos_red=false;x.chaos_yellow=false;x.chaos_blue=false;x.chaos_green=false}
    _tickBomb(){let ai=this.s.ai;if(!ai||!ai.alive||(ai.bomb||0)<=0)return;ai.bomb--;if(ai.bomb<=0){this.hurt(ai,10);this.emit('bombExplode','定时炸弹爆炸！造成10点伤害',null,{who:'ai',amount:10});this.emit('desc','定时炸弹爆炸！'+ai.name+'受到10点伤害')}else{this.emit('buff','炸弹倒计时：'+ai.bomb,null,{who:'ai',kind:'bomb',stacks:ai.bomb})}}
    deferSettlement(kind,damage,bleed=0){damage=Math.max(0,Number(damage)||0);bleed=Math.max(0,Number(bleed)||0);this.s.pendingDefenseDamage=damage;this.s.busy=true;this.pendingSettlement={kind,damage,bleed,afterEventId:this.ver};if(!this.events.length)this.acknowledgeEvents(this.ver)}
    _deferAttackBuffs(targetKey,before){let target=this.s[targetKey];if(!target)return;let now={bleed:target.bleed||0,burn:target.burn||0,poison:target.poison||0,frozen:!!target.frozen};let changed=now.bleed!==(before.bleed||0)||now.burn!==(before.burn||0)||now.poison!==(before.poison||0)||now.frozen!==!!before.frozen;if(!changed)return;this.s.pendingBuffRestore={target:targetKey,after:now,before:{bleed:before.bleed||0,burn:before.burn||0,poison:before.poison||0,frozen:!!before.frozen}};target.bleed=before.bleed||0;target.burn=before.burn||0;target.poison=before.poison||0;target.frozen=!!before.frozen}
    _restoreAttackBuffs(){if(!this.s.pendingBuffRestore)return;let r=this.s.pendingBuffRestore,target=this.s[r.target];if(target){let w=r.target==='player'?'player':'ai',add=r.after.bleed-r.before.bleed;if(add>0){target.bleed=Math.min(2,(target.bleed||0)+add);this.emit('buff',`${add>1?add:''}[流血]`,null,{who:w,kind:'bleed',stacks:target.bleed})}add=r.after.burn-r.before.burn;if(add>0){target.burn=Math.min(4,(target.burn||0)+add);this.emit('buff',`+${add}[灼烧]`,null,{who:w,kind:'burn',stacks:target.burn})}add=r.after.poison-r.before.poison;if(add>0){target.poison=Math.min(3,(target.poison||0)+add);this.emit('buff',`+${add}[中毒]`,null,{who:w,kind:'poison',stacks:target.poison})}if(r.after.frozen&&!r.before.frozen&&!target.frozen){target.frozen=true;this.emit('buff','[冷冻]',null,{who:w,kind:'freeze',stacks:1})}}this.s.pendingBuffRestore=null}
    acknowledgeEvents(through){this.events=this.events.filter(e=>(e.id||0)>through);let bridge=this.s.pendingAIBridge;if(bridge&&through>=bridge.afterEventId){this.s.pendingAIBridge=null;if(bridge.mode==='defense')this.later(()=>this.aiDefend(bridge.attackCard,bridge.damage),220);else this.later(()=>this.aiTurn(),220)}let continuation=this.s.pendingAIContinue;if(continuation&&through>=continuation.afterEventId){this.s.pendingAIContinue=null;this.continueAIAttack();return}let p=this.pendingSettlement;if(!p||through<p.afterEventId)return;this.pendingSettlement=null;this.s.pendingDefenseDamage=0;if(p.kind==='PLAYER_ATTACK'){let forceEnd=!!this.s.forceEndPlayerTurn;this.s.forceEndPlayerTurn=false;this._restoreAttackBuffs();let dmg=this.applyDefenderAvoidance(this.s.ai,p.damage);this.hurt(this.s.ai,dmg);this.settleBleed(this.s.ai,p.bleed);this.resolveSerenityHalf();this.afterAttack();if(forceEnd&&!this._allEnemiesDead())this.startAITurn();this.check();return}let forceEnd=!!this.s.forceEndAITurn;this.s.forceEndAITurn=false;this._restoreAttackBuffs();this.hurt(this.s.player,p.damage);this.settleBleed(this.s.player,p.bleed);this.resolveSerenityHalf();this._grantChaosIfKnight('ai');if(forceEnd)this.endAi();else this.continueAIAttack()}
    continueAIAttack(){if(!this.s)return;if(!this.s.player.alive||!this.s.ai.alive){this.check();return}this.s.phase='AI_TURN';this.s.busy=true;this.s.pendingAttack=null;this.s.pendingDefenseDamage=0;this.s.attackDebuffSnapshot=null;this.s.atkCard=this.s.defCard=null;this.s.atkOwner=this.s.defOwner=null;this.s.revealCards=[];this.later(()=>this.aiTurn(),220);return this.check()}
    resolveSerenityHalf(){let key=this.s.serenityHalfTarget;if(!key)return;let x=this.s[key],before=x.hp;x.hp=Math.ceil(x.hp/2);x.alive=x.hp>0;this.s.serenityHalfTarget=null;this.emit('desc',`Serenity 0牌：攻防结束，${key==='player'?'玩家':'AI'}生命减半（-${before-x.hp}）`)}
    chooseGuard(stacks){let incoming=this.s.pendingGuardDamage||0,use=Math.max(0,Math.min(stacks||0,this.s.player.guard,incoming)),remaining=Math.max(0,incoming-use),bleed=this.s.pendingGuardBleed||0,defCard=this.s.defCard,bleedActive=defCard&&defCard.isNumberCard&&defCard.value<=3?bleed:0;this.s.player.guard-=use;this.s.pendingDialog=null;this.s.pendingGuardDamage=0;this.s.pendingGuardBleed=0;this.s.phase='AI_TURN';this.emit('desc',`消耗${use}层[守护]，减免${use}点[伤害]，剩余${remaining}点待结算`);this.deferSettlement('AI_ATTACK',remaining,bleedActive);return this.check()}
    clean(x,all=false,kind=null){if(all){x.burn=0;x.bleed=0;x.poison=0;x.frozen=false;x.bomb=0;x.guard=0;x.fly=0;x.lush=0;x.crit=0;x.chaos_red=false;x.chaos_yellow=false;x.chaos_blue=false;x.chaos_green=false}else if(kind==='burn'&&x.burn)x.burn--;else if(kind==='bleed'&&x.bleed)x.bleed--;else if(kind==='poison'&&x.poison)x.poison--;else if(kind==='freeze')x.frozen=false;else if(kind==='bomb')x.bomb=0;else if(kind==='guard'&&x.guard)x.guard--;else if(kind==='fly'&&x.fly)x.fly--;else if(kind==='lush'&&x.lush)x.lush--;else if(kind==='crit'&&x.crit)x.crit--;else if(x.burn)x.burn--;else if(x.bleed)x.bleed--;else if(x.poison)x.poison--;else if(x.bomb)x.bomb=0;else x.frozen=false}
    chooseSuperPurifyTarget(target){this.s.pendingDialog=null;let ch=this.s[target];if(!ch||!ch.alive)throw Error('目标已出局');this.clean(ch,true);let label=target==='player'?'玩家':(this.s.is1v2&&target==='ai2'?'AI2':'AI');this.emit('desc','超级净化：清除'+label+'所有buff与debuff');return this.state()}
    turnStart(w){let x=this.s[w];if(!x||!x.alive)return;if((x.poison||0)>0){let dmg=x.poison,who=w==='player'?'player':(w==='ai2'?'ai2':'ai');this.emit('poisonSettle',`-${dmg}[中毒]`,null,{who,amount:dmg});x.hp=Math.max(0,x.hp-dmg);x.alive=x.hp>0;if(this.name(x)==='Serenity')x.bloodthirst=x.hp<30}let n=this.name(x),m=CharacterRegistry.get(n);if(m)m.turnStart(this,x,w)}
    legal(c,def=false){let t=this.s.discardTop,tc=t.chosenColor||t.color,cc=c.chosenColor||c.color;if(c.isItemCard)return true;if(def&&c.value>3)return false;return c.isWhite||tc===cc||t.value===c.value}
    select(i){if(!this.h.player[i])throw Error('无效卡牌');if(this.s.phase==='PLAYER_DISCARD'){let a=this.s.selectedCards||[],p=a.indexOf(i);if(this.s.mayDiscardAfterSkill)a=p>=0?[]:[i];else if(p>=0)a.splice(p,1);else a.push(i);this.s.selectedCards=a;this.s.selectedCard=a.length?a[0]:-1}else this.s.selectedCard=this.s.selectedCard===i?-1:i;return this.state()}
    itemKind(c){if(c.swapHand)return'swap';if(c.drawThree)return'drawThree';if(c.drawTwo)return'drawTwo';if(c.potion)return'potion';if(c.magic)return'magic';if(c.superPurify)return'superPurify';if(c.purify)return'purify';if(c.shuffleToDeck)return'shuffle';return'wild'}
    _isAdventureBoss(x){if(!this.s.isAdventure||!window.AdventureRegistry)return false;return!!window.AdventureRegistry.getBoss(this.name(x))}
    itemEffectDesc(c,who){let actor=who==='player'?'玩家':who==='ai2'?'AI2':'AI',kind=this.itemKind(c);if(kind==='swap')return`${actor}立即交换双方手牌，随后使用交换后的手牌继续搭桥`;if(kind==='drawThree')return`${actor}立即抽3张牌，然后继续搭桥`;if(kind==='drawTwo')return`${actor}立即抽2张牌，然后继续搭桥`;if(kind==='potion')return`${actor}立即恢复${this.s.isAdventure&&who!=='player'?3:5}点生命，然后继续搭桥`;if(kind==='magic'){let hp=who!=='player'&&this._isAdventureBoss(this.s[who==='ai2'?'ai2':'ai'])?5:3;return`${actor}立即恢复${hp}点生命，清除对手所有正面buff，然后继续搭桥`}if(kind==='superPurify')return`${actor}选择目标，清除其全部buff与debuff，然后继续搭桥`;if(kind==='purify')return`${actor}立即净化1层debuff，然后继续搭桥`;if(kind==='shuffle')return`${actor}立即洗回弃牌库，然后继续搭桥`;return`${actor}指定颜色后继续搭桥`}
    useItem(c,owner,target,w){if(c.potion)this.heal(owner,this.s.isAdventure&&w!=='player'?3:5);if(c.magic){this.heal(owner,w!=='player'&&this._isAdventureBoss(owner)?5:3);this.clearPositiveBuffs(target);}if(c.drawThree)this.draw(w,3,true);if(c.drawTwo)this.draw(w,2,true);if(c.purify&&w==='player'&&(owner.burn||owner.bleed||owner.frozen||owner.poison)){this.s.pendingDialog='purify'}else if(c.purify)this.clean(owner);if(c.superPurify&&w==='player'){this.s.pendingDialog='superPurify'}else if(c.superPurify){let ownerDeb=owner.burn+owner.bleed+(owner.poison||0)+(owner.frozen?1:0),targetGuard=target?target.guard:0;if(targetGuard>=2&&ownerDeb<2)this.clean(target,true);else this.clean(owner,true);}if(c.swapHand)[this.h.player,this.h.ai]=[this.h.ai,this.h.player];      if(c.shuffleToDeck){this._shuffleDiscardIntoDeck();this.emit('desc','弃牌库已洗回牌堆')}}
    effect(n,v,c,a,t){
      let d=0,skip=false,unblock=false,owner=a===this.s.player?'player':(this.s.is1v2&&a===this.s.ai2?'ai2':'ai'),target=owner==='player'?this._who(t):'player';
      const silent={silent:true},burn=q=>this.burn(t,q,silent),bleed=q=>this.bleed(t,q,silent),poison=q=>this.poison(t,q,silent),guard=q=>a.guard=Math.min(5,a.guard+q),fly=q=>a.fly=Math.min(2,(a.fly||0)+q),takeReveal=label=>{let r=this.reveal(label);if(r)this.h[owner].push(r);return r};
      let helpers={burn,bleed,poison,guard,fly,takeReveal,heal:(x,n,k)=>this.heal(x,n,k),draw:(w,n,an)=>this.draw(w,n,an),clearDebuffs:x=>this.clearDebuffs(x),clearPositiveBuffs:x=>this.clearPositiveBuffs(x)};
      let m=CharacterRegistry.get(n);
      if(m){let r=m.effect(this,v,c,a,t,owner,helpers);if(r)return r}
      return{d,skip,unblock}
    }
    play(){
      let i=this.s.selectedCard,c=this.h.player[i];
      if(!c)throw Error('请先选择卡牌');
      if(!this.legal(c))throw Error('颜色或数字不匹配');
      let who=this.name(this.s.player);
      if(((who==='Ryan'&&c.value===5)||(who==='Saiki'&&c.value===6)||(who==='Moze'&&c.value===4))&&!this.h.player.some((x,j)=>j!==i&&x.isNumberCard))throw Error(`${who} ${c.value}牌还需要一张数字牌，请保留至少一张数字牌再使用`);
      if(c.isBlack&&!c.chosenColor){this.s.needColorChoice=true;this.s.pendingDialog='color';return this.state()}
      if(c.isWhite)c.chosenColor=this.effective(this.s.discardTop);
      this.h.player.splice(i,1);
      this.s.selectedCard=-1;
      this.s.atkCard=cp(c);
      this.s.atkOwner='player';
      this.setDiscardTop(c);
      this.s.hasPlayedThisTurn=true;
      this.rememberAttackDebuffs('ai');
      let _buffBefore={bleed:this.s.ai.bleed||0,burn:this.s.ai.burn||0,poison:this.s.ai.poison||0,frozen:!!this.s.ai.frozen};
      this.applySaikiPassive(this.s.player,this.s.ai,c);
      if(c.isItemCard){this.emit('itemEffect',this.itemEffectDesc(c,'player'),c,{effect:this.itemKind(c),who:'player'});this.useItem(c,this.s.player,this.s.ai,'player');return this.check()}
      this._deferAttackBuffs('ai',_buffBefore);
      if(who==='Ryan'&&c.value===5)return this.startRyanFive(c);
      if(who==='Saiki'&&c.value===6)return this.startNumberJudge('Saiki',c);
      if(who==='Moze'&&c.value===4)return this.startNumberJudge('Moze',c);
      if(who==='Chan'&&c.value===5)return this.startChanFive();
      if(who==='Otto'&&c.value===3)return this.startOttoThree(c);
      if(who==='Otto'&&c.value===4)return this.startOttoFour(c);
      if(who==='Otto'&&c.value===5)return this.startNumberJudge('Otto',c);
      if(this.opponentChoiceSkill(who,c.value)){let p={name:who,value:c.value,attackCard:cp(c)};this.s.pendingOpponentSkill=p;this.s.selectedAICard=-1;if(!this.h.ai.length)return this.opponentEmpty(p);this.s.phase='OPPONENT_CARD_CHOICE';this.s.busy=false;let _advHint='';if(this.s.isAdventure){if(who==='Chan'&&c.value===4)_advHint='（冒险模式：直接弃掉，造成2点伤害并跳过防御，无需选择交换）';else if(who==='Chan'&&c.value===7)_advHint='（冒险模式：直接弃掉，造成6点伤害，无需选择保留）';else if(who==='Saiki'&&c.value===3)_advHint='（冒险模式：直接弃掉，造成2点伤害，无需选择保留）';else if(who==='Moze'&&c.value===5)_advHint='（冒险模式：判定牌直接弃掉，无需选择保留）'}this.emit('desc',`${who} ${c.value}牌：请选择对手一张手牌并确认${_advHint}`,c);return this.state()}
      let r=this.effect(who,c.value,c,this.s.player,this.s.ai);
      this._deferAttackBuffs('ai',_buffBefore);
      if(r.immediateBuffs)this._restoreAttackBuffs();

      this.emit('desc',`${this.s.player.name}：${r.d}点伤害${(r.skip||r.unblock||r.d<=0)?'，跳过防御':''}`,c);
      return this.gateAdventureAttackMod(c,r.d,r.skip,r.unblock)
    }
    startRyanFive(card){
      this.s.pendingFiveChoice=true;
      this.s.fiveChoiceCard=cp(card);
      this.s.pendingAttack=null;
      this.s.selectedCard=-1;
      this.s.phase='PLAYER_FIVE_CHOICE';
      this.s.busy=false;
      this.emit('desc','Ryan 5牌：请再选择一张数字牌，然后选择恢复或进攻',card);
      return this.check()
    }
    finishRyanFive(chooseDamage){
      if(this.s.phase!=='PLAYER_FIVE_CHOICE'||!this.s.pendingFiveChoice)throw Error('当前没有待处理的 Ryan 5牌');
      let i=this.s.selectedCard,second=this.h.player[i];
      if(!second)throw Error('请先选择一张数字牌');
      if(!second.isNumberCard)throw Error('Ryan 5牌的第二张牌必须是数字牌');
      if(second.isWhite)second.chosenColor=this.effective(this.s.discardTop);
      this.h.player.splice(i,1);
      this.s.selectedCard=-1;
      this.s.pendingFiveChoice=false;
      this.s.fiveChoiceCard=null;
      this.s.revealCards=[cp(second)];
      this.emit('reveal',`Ryan 5牌追加${this.cardText(second)}并置于弃牌库底`,second,{who:'player',from:'hand'});
      this.discardWithEvent(second,'player',{from:'reveal',faceUp:true,desc:`Ryan 5牌将${this.cardText(second)}置于弃牌库底`});
      let amount=chooseDamage?Math.ceil(second.value*1.5):second.value;
      if(chooseDamage&&amount>0){
        this.emit('desc',`Ryan 5牌选择进攻：造成${amount}点伤害（牌面值1.5倍，向上取整）`,second);
        return this.gateAdventureAttackMod(second,amount,false,false,1800);
      }
      if(!chooseDamage)this.heal(this.s.player,amount);
      this.s.pendingAttack=null;
      this.s.phase='AI_DEFEND';
      this.s.busy=true;
      this.emit('desc',chooseDamage?'Ryan 5牌追加0：本次进攻没有伤害':`Ryan 5牌选择恢复：恢复${amount}点生命`,second);
      this.later(()=>{this.afterAttack();this.check()},1700);
      return this.check()
    }
    startNumberJudge(type,card){
      this.s.pendingNumberJudge={type,attackCard:cp(card)};
      this.s.pendingAttack=null;
      this.s.selectedCard=-1;
      this.s.phase='SAIKI_SIX_JUDGE';
      this.s.busy=false;
      this.emit('desc',type==='Saiki'?'Saiki 6牌：请选择一张数字牌作为伤害判定':'Moze 4牌：请选择一张数字牌转化为对应层数守护',card);
      return this.check()
    }
    finishNumberJudge(){
      let pending=this.s.pendingNumberJudge,i=this.s.selectedCard,second=this.h.player[i];
      if(this.s.phase!=='SAIKI_SIX_JUDGE'||!pending)throw Error('当前没有待处理的数字判定');
      if(!second||!second.isNumberCard)throw Error('请选择一张数字牌');
      if(second.isWhite)second.chosenColor=this.effective(pending.attackCard);
      this.h.player.splice(i,1);
      this.s.selectedCard=-1;
      this.s.pendingNumberJudge=null;
      this.s.revealCards=[cp(second)];
      this.emit('reveal',`${pending.type} 数字判定：${this.cardText(second)}`,second,{who:'player',from:'hand'});
      if(pending.type==='Moze'){
        this.discardWithEvent(second,'player',{from:'reveal',faceUp:true,desc:`Moze 4牌将${this.cardText(second)}置于弃牌库底`});
        this.s.player.guard=Math.min(5,this.s.player.guard+second.value);
        this.emit('desc',`Moze 4牌：${this.cardText(second)}放入弃牌库底，获得${second.value}层守护并跳过防御`,second);
        this.s.phase='AI_DEFEND';this.s.busy=true;
        this.later(()=>{this.afterAttack();this.check()},1700);
        return this.check()
      }
      if(pending.type==='Otto'){
        this.discardWithEvent(second,'player',{from:'reveal',faceUp:true,desc:`Otto 5牌将${this.cardText(second)}置于弃牌库底`});
        let judgeTarget=this.s.is1v2?this.s[this.s.attackTarget||'ai']:this.s.ai;
        if(second.isWhite){
          this.heal(this.s.player,second.value);
          if(this.s.player.crit<2)this.s.player.crit++;
          this.emit('buff','+1[暴击]',null,{who:'player',kind:'crit',stacks:this.s.player.crit});
          this.emit('desc',`Otto 5牌：${this.cardText(second)}为白牌，恢复${second.value}点+1层暴击，跳过防御`);
          this.s.phase='AI_DEFEND';this.s.busy=true;
          this.later(()=>{this.afterAttack();this.check()},1700);
          return this.check()
        }
        let damage=second.value;
        this.emit('desc',`Otto 5牌：${this.cardText(second)}造成${damage}点伤害`,second);
        if(damage>0)return this.gateAdventureAttackMod(second,damage,false,false,1800);
        this.s.pendingAttack=null;this.s.phase='AI_DEFEND';this.s.busy=true;
        this.later(()=>{this.afterAttack();this.check()},1500);
        return this.check()
      }
      this.discardToBottom(second);
      this.emit('discard',`Saiki 6牌将${this.cardText(second)}置于弃牌库底`,second,{who:'player',from:'reveal',destination:'bottom'});
      let judgeTarget=this.s.is1v2?this.s[this.s.attackTarget||'ai']:this.s.ai;if(this.effective(second)==='YELLOW')this.bleed(judgeTarget,1);
      let damage=Math.ceil(second.value*1.5);
      this.emit('desc',`Saiki 6牌：${this.cardText(second)}造成${damage}点伤害${this.effective(second)==='YELLOW'?'并施加1层流血':''}`,second);
      if(damage>0)return this.gateAdventureAttackMod(second,damage,false,false,1800);
      this.s.pendingAttack=null;this.s.phase='AI_DEFEND';this.s.busy=true;
      this.later(()=>{this.afterAttack();this.check()},1500);
      return this.check()
    }
    startChanFive(){this.hurt(this.s.player,2);let cards=[];for(let i=0;i<5&&this.deck.length;i++)cards.push(this.deck.pop());this.s.chanFiveCards=cp(cards);this.s.phase='CHAN_FIVE_REORDER';this.s.busy=false;this.emit('desc',`Chan 5牌：消耗2点生命，查看牌库顶${cards.length}张并排序`);if(!cards.length){this.s.phase='AI_DEFEND';this.s.busy=true;this.later(()=>{this.afterAttack();this.check()},1200)}return this.check()}
    finishChanFive(order){let cards=this.s.chanFiveCards;if(!cards||!cards.length)throw Error('当前没有需要排序的牌');let ids=String(order||'').split(',').map(Number);if(ids.length!==cards.length||new Set(ids).size!==cards.length||ids.some(i=>i<0||i>=cards.length))ids=cards.map((_,i)=>i);let arranged=ids.map(i=>cards[i]);for(let i=arranged.length-1;i>=0;i--)this.deck.push(arranged[i]);this.s.chanFiveCards=null;this.draw('player',2,true);this.emit('desc','Chan 5牌：排序完成，抽取新的牌库顶2张牌并跳过防御');this.s.phase='AI_DEFEND';this.s.busy=true;this.later(()=>{this.afterAttack();this.check()},1700);return this.check()}
    startOttoThree(card){
      let r=this.reveal('Otto 3牌判定');
      if(!r){this.s.phase='AI_DEFEND';this.s.busy=true;this.later(()=>{this.afterAttack();this.check()},1200);return this.check()}
      let dmg=r.isItemCard?4:r.value;
      let skip=false,unblock=false;
      if(dmg>4){this.hurt(this.s.player,2);if(this.s.player.crit<2)this.s.player.crit++;this.emit('buff','+1[暴击]',null,{who:'player',kind:'crit',stacks:this.s.player.crit});this.emit('desc',`Otto 3牌：${this.cardText(r)}造成${dmg}点伤害，自伤2点+1层暴击`)}
      else{this.emit('desc',`Otto 3牌：${this.cardText(r)}造成${dmg}点伤害`)}
      this.discardWithEvent(r,'player',{from:'reveal',faceUp:true,desc:`Otto 3牌将${this.cardText(r)}置于弃牌库底`});
      return this.gateAdventureAttackMod(card,dmg,skip,unblock)
    }
    startOttoFour(card){
      let targetKey=this.s.is1v2?(this.s.attackTarget||'ai'):'ai';
      this.refillDeckIfNeeded();let c1=this.deck.length?this.deck.pop():null;
      this.refillDeckIfNeeded();let c2=this.deck.length?this.deck.pop():null;
      this.s.revealCards=[];if(c1)this.s.revealCards.push(cp(c1));if(c2)this.s.revealCards.push(cp(c2));
      this.emit('reveal',`Otto 4牌：翻开牌库顶${(c1?1:0)+(c2?1:0)}张牌判定`,c1||{},{who:'player',from:'deck'});
      let d=0,skip=false,unblock=false;
      if(c1&&c2){
        if(c1.isItemCard&&c2.isItemCard){this.heal(this.s.player,3,'drain');this.hurt(this.s[targetKey],3);skip=true;unblock=true;this.emit('desc','Otto 4牌：两张道具牌，吸取3点生命（不可防御）')}
        else if(c1.isItemCard||c2.isItemCard){let nc=c1.isItemCard?c2:c1;d=Math.ceil(nc.value/2);unblock=true;this.emit('desc',`Otto 4牌：1张道具牌，造成${d}点伤害（不可防御）`)}
        else{d=c1.value+c2.value;this.emit('desc',`Otto 4牌：两张数字牌，造成${d}点伤害`)}
      }else if(c1){
        if(c1.isItemCard){this.heal(this.s.player,3,'drain');this.hurt(this.s[targetKey],3);skip=true;unblock=true;this.emit('desc','Otto 4牌：仅1张道具牌，吸取3点生命（不可防御）')}
        else{d=c1.value;this.emit('desc',`Otto 4牌：仅1张数字牌，造成${d}点伤害`)}
      }
      if(c2)this.deck.push(c2);if(c1)this.deck.push(c1);
      this.emit('desc','Otto 4牌：判定完毕，两张牌放回牌库顶');
      return this.gateAdventureAttackMod(card,d,skip,unblock)
    }
    chooseOpponentCard(i){let targetKey=this.s.is1v2?(this.s.attackTarget||'ai'):'ai',hand=this.h[targetKey];if(this.s.phase!=='OPPONENT_CARD_CHOICE')throw Error('当前不能选择对手手牌');if(this.s.pendingLeonZeroDiscard){let combined=[];for(const key of ['ai','ai2'])if(this.s[key]&&this.s[key].alive)for(let j=0;j<this.h[key].length;j++)combined.push({key,index:j});if(i<0||i>=combined.length)throw Error('无效的对手手牌');this.s.selectedAICard=this.s.selectedAICard===i?-1:i;return this.state()}if(!this.s.pendingOpponentSkill)throw Error('当前不能选择对手手牌');if(i<0||!hand[i])throw Error('无效的对手手牌');this.s.selectedAICard=this.s.selectedAICard===i?-1:i;return this.state()}
    confirmOpponentCard(){let targetKey=this.s.is1v2?(this.s.attackTarget||'ai'):'ai',target=this.s[targetKey],hand=this.h[targetKey],i=this.s.selectedAICard,p=this.s.pendingOpponentSkill;if(!p||i<0||!hand[i])throw Error('请先选择一张对手手牌');let chosen=hand.splice(i,1)[0];this.s.selectedAICard=-1;this.s.revealCards=[cp(chosen)];this.emit('reveal',`${p.name} ${p.value}牌抽取对手手牌判定`,chosen,{who:targetKey,from:'hand'});let d=0,skip=false,unblock=false,keep=false;
      if(p.name==='Chan'&&p.value===4){if(this.s.isAdventure){this.discardWithEvent(chosen,targetKey,{from:'reveal',faceUp:true,desc:`Chan 4牌弃掉${this.cardText(chosen)}`});this.emit('desc',`Chan 4牌：弃掉${this.cardText(chosen)}，造成2点伤害并跳过防御`);return this.gateAdventureAttackMod(chosen,2,true,false)}this.s.pendingOpponentSkill=null;this.s.chanFourSwapMode=true;this.s.chanFourSwapDrawn=cp(chosen);this.s.phase='PLAYER_SEVEN_CHOICE';this.s.selectedCard=-1;this.emit('desc','Chan 4牌：选择自己一张手牌交换，或弃掉抽到的牌并造成2点伤害');return this.state()}
      if(p.name==='Chan'&&p.value===7){if(this.s.isAdventure){this.discardWithEvent(chosen,'player',{from:'reveal',faceUp:true,desc:`Chan 7牌弃掉${this.cardText(chosen)}`});this.emit('desc',`Chan 7牌：弃掉${this.cardText(chosen)}，造成6点伤害`);return this.finishOpponentAttack(p,6,false,false)}this.s.chanSevenKeepMode=true;this.s.chanSevenChosenCard=cp(chosen);this.s.phase='PLAYER_SEVEN_CHOICE';this.s.busy=false;this.emit('desc','Chan 7牌：选择将抽到的牌加入手牌或弃掉');return this.state()}
      if(p.name==='Saiki'){if(this.s.isAdventure){this.discardWithEvent(chosen,'player',{from:'reveal',faceUp:true,desc:`Saiki 3牌弃掉${this.cardText(chosen)}`});this.emit('desc',`Saiki 3牌：弃掉${this.cardText(chosen)}，造成2点伤害${this.effective(p.attackCard)==='YELLOW'?'并施加1层流血':''}`);return this.finishOpponentAttack(p,2,false,false)}this.s.saikiThreeDrawn=cp(chosen);this.s.phase='SAIKI_THREE_CHOICE';this.s.busy=false;this.emit('desc','Saiki 3牌：选择将抽到的牌加入手牌或弃掉');return this.state()}
      if(p.name==='Blaze'){if(chosen.isItemCard)d=4;else if(chosen.value===0){this.burn(this.s.player,1);this.burn(target,1);keep=true;skip=true}else d=chosen.value;if(d)d+=this.s.player.burn?1:0;this.emit('desc',`Blaze 4牌判定：${d}点伤害${skip?'，双方灼烧+1并跳过防御':''}`)}
      if(p.name==='Moze'){keep=!this.s.isAdventure;if(this.s.isAdventure)this.discardWithEvent(chosen,'player',{from:'reveal',faceUp:true,desc:`Moze 5牌弃掉${this.cardText(chosen)}`});if(chosen.isBlack||chosen.isWhite||this.effective(chosen)==='GREEN')d=4;else{this.heal(this.s.player,2);this.s.player.guard=Math.min(5,this.s.player.guard+1);skip=true}this.emit('desc',(d?'Moze 5牌判定：4点伤害':'Moze 5牌判定：恢复2点并获得1层守护')+(this.s.isAdventure?'（弃掉）':''))}
      if(p.name==='Otto'&&p.value===4){this.s.ottoFourOpponentCard=cp(chosen);return this.ottoFourConfirm()}
      if(keep)this.h.player.push(chosen);return this.finishOpponentAttack(p,d,skip,unblock)}
    chanSevenChoice(keep){let p=this.s.pendingOpponentSkill,c=this.s.chanSevenChosenCard;if(!p||!this.s.chanSevenKeepMode||!c)throw Error('当前没有待处理的 Chan 7牌');if(keep)this.h.player.push(c);else this.discardWithEvent(c,'player',{from:'reveal',faceUp:true,desc:`Chan 7牌弃掉${this.cardText(c)}`});this.s.chanSevenKeepMode=false;this.s.chanSevenChosenCard=null;this.emit('desc',`Chan 7牌：${keep?'加入手牌':'弃掉'}${this.cardText(c)}`);return this.finishOpponentAttack(p,6,false,false)}
    saikiThreeChoice(keep){let p=this.s.pendingOpponentSkill,c=this.s.saikiThreeDrawn;if(!p||!c)throw Error('当前没有待处理的 Saiki 3牌');if(keep)this.h.player.push(c);else this.discardWithEvent(c,'player',{from:'reveal',faceUp:true,desc:`Saiki 3牌弃掉${this.cardText(c)}`});this.s.saikiThreeDrawn=null;this.emit('desc',`Saiki 3牌：${keep?'加入手牌':'弃掉'}${this.cardText(c)}，造成2点伤害${this.effective(p.attackCard)==='YELLOW'?'并施加1层流血':''}`);return this.finishOpponentAttack(p,2,false,false)}
    chanFourSwap(){let targetKey=this.s.is1v2?(this.s.attackTarget||'ai'):'ai',i=this.s.selectedCard,drawn=this.s.chanFourSwapDrawn;if(!this.s.chanFourSwapMode||!drawn)throw Error('当前没有可交换的牌');if(i<0||!this.h.player[i])throw Error('请选择自己的一张手牌用于交换');let own=this.h.player.splice(i,1)[0];this.h[targetKey].push(own);this.h.player.push(drawn);this.s.selectedCard=-1;this.s.chanFourSwapMode=false;this.s.chanFourSwapDrawn=null;this.emit('desc',`Chan 4牌：${this.cardText(drawn)} 与 ${this.cardText(own)} 完成交换`);this.afterAttack();return this.check()}
    chanFourDiscard(){let drawn=this.s.chanFourSwapDrawn;if(!this.s.chanFourSwapMode||!drawn)throw Error('当前没有可弃掉的牌');let targetKey=this.s.is1v2?(this.s.attackTarget||'ai'):'ai';this.s.chanFourSwapMode=false;this.s.chanFourSwapDrawn=null;this.discardWithEvent(drawn,targetKey,{from:'reveal',faceUp:true,desc:`Chan 4牌弃掉${this.cardText(drawn)}`});this.emit('desc',`Chan 4牌：弃掉${this.cardText(drawn)}，造成2点伤害并跳过防御`);return this.gateAdventureAttackMod(drawn,2,true,false)}
    ottoFourConfirm(){
      let targetKey=this.s.is1v2?(this.s.attackTarget||'ai'):'ai';
      if(this.s.ottoFourPhase==='selectOwn'){
        let i=this.s.selectedCard,myCard=this.h.player[i];
        if(i<0||!myCard)throw Error('请选择自己的一张手牌');
        this.s.ottoFourMyCard=cp(myCard);
        this.s.ottoFourPhase='selectOpponent';
        this.s.selectedAICard=-1;
        this.s.phase='OPPONENT_CARD_CHOICE';this.s.busy=false;
        this.emit('desc','Otto 4牌：请选择对手一张手牌');
        return this.state()
      }
      let opponentCard=this.s.ottoFourOpponentCard,
          myCard=this.s.ottoFourMyCard;
      if(!opponentCard||!myCard)throw Error('缺少牌信息');
      this.s.revealCards=[cp(myCard),cp(opponentCard)];
      this.emit('reveal',`Otto 4牌：双方同时翻开`,myCard,{who:'player',from:'hand'});
      this.emit('reveal',`对手：${this.cardText(opponentCard)}`,opponentCard,{who:targetKey,from:'hand'});
      let d=0,skip=false,unblock=false;
      let bothNumber=myCard.isNumberCard&&opponentCard.isNumberCard;
      let oneItem=myCard.isItemCard||opponentCard.isItemCard;
      let bothItem=myCard.isItemCard&&opponentCard.isItemCard;
      if(bothItem){
        this.heal(this.s.player,3,'drain');
        this.hurt(this.s[targetKey],3);
        skip=true;unblock=true;
        this.emit('desc','Otto 4牌：双方道具牌，吸取3点生命（不可防御）');
      }else if(oneItem){
        let numberCard=myCard.isItemCard?opponentCard:myCard;
        d=Math.ceil(numberCard.value/2);
        unblock=true;
        this.emit('desc',`Otto 4牌：1张道具牌，造成${d}点伤害（不可防御）`);
      }else{
        d=myCard.value+opponentCard.value;
        this.emit('desc',`Otto 4牌：双方数字牌，造成${d}点伤害`);
      }
      this.s.ottoFourOpponentCard=null;this.s.ottoFourMyCard=null;this.s.ottoFourPhase=null;
      this.h[targetKey].push(opponentCard);
      return this.gateAdventureAttackMod(myCard,d,skip,unblock)
    }
    defend(skip=false){
      let d=this.s.pendingAttack.damage,triggeredDefense=!skip;
      if(skip){this.s.hasPlayedBlackDefend=false;this.emit('desc',`玩家选择跳过防御，${d}点伤害待结算`)}
      else{
        let i=this.s.selectedCard,c=this.h.player[i];
        if(!c)throw Error('请选择防御牌');
        if(!this.legal(c,true))throw Error('该牌不能用于防御');
        let incomingCard=this.s.discardTop||this.s.atkCard,inheritedColor=this.effective(incomingCard);
        if(this.s.player.frozen&&inheritedColor==='BLUE')throw Error('冷冻状态无法防御蓝色攻击');
        if(c.isBlack&&!c.chosenColor){this.s.needColorChoice=true;this.s.pendingDialog='color';return this.state()}
        if(c.isWhite)c.chosenColor=inheritedColor;
        this.h.player.splice(i,1);this.s.selectedCard=-1;
        this.s.defCard=cp(c);this.s.defOwner='player';this.setDiscardTop(c);
        this._animatedPlayerAttack=this.s.atkCard;
        if(c.isItemCard){
          this.s.hasPlayedBlackDefend=true;this.s.phase='PLAYER_DEFEND';this.s.busy=false;
          let bridgeLabel=c.isBlack?'黑牌':c.isWhite?'白色':'道具';
          this.emit('defend',`${bridgeLabel}牌指定${this.colorName(c.chosenColor||c.color)}并搭桥，请继续选择防御牌`,c);
          if(c.isBlack)this.emit('colorChoice',`黑牌指定${this.colorName(c.chosenColor)}`,c);
          if(c.isWhite)this.emit('colorChoice',`白色道具牌自动指定${this.colorName(c.chosenColor)}`,c);
          this.emit('itemEffect',this.itemEffectDesc(c,'player'),c,{effect:this.itemKind(c),who:'player'});
          this.useItem(c,this.s.player,this.s.ai,'player');
          return this.check()
        }
        this.s.hasPlayedBlackDefend=false;
        let n=this.name(this.s.player),v=c.value,b=0,desc='';
        this.emit('defend',`玩家打出${n} ${v}牌，触发防御技能`,c);
        let judged=this.defenseJudge('player',c,d);
        if(judged){d=Math.max(0,Number(judged.remaining)||0);desc='防御判定完成'}
        else{let m=CharacterRegistry.get(n);if(m){let r=m.defend(this,n,v,d,c,this.s.player,this.s.ai,'player',inheritedColor,{hurt:(x,n,b)=>this.hurt(x,n,b),heal:(x,n,k)=>this.heal(x,n,k),draw:(w,n,an)=>this.draw(w,n,an),burn:(x,n)=>this.burn(x,n),bleed:(x,n)=>this.bleed(x,n),poison:(x,n)=>this.poison(x,n),cancelAttackDebuffs:(o,r)=>this.cancelAttackDebuffs(o,r),clearDebuffs:x=>this.clearDebuffs(x)});if(r){d=r.remaining;desc=r.desc}}if(desc===''){b=c.value===1?Math.ceil(d/2):c.value===3?Math.floor(d/2):0;d=Math.max(0,d-b);desc=`抵消${b}点伤害，剩余${d}点待结算`}}
        if(!judged)this.emit('desc',desc)
      }
      if(d&&this.playerNeedsAvoidChoice()){this.askGuard(d,this.s.player.bleed);return this.check()}
      this.s.phase='AI_TURN';
      this.deferSettlement('AI_ATTACK',d,triggeredDefense&&this.s.defCard&&this.s.defCard.isNumberCard&&this.s.defCard.value<=3?this.s.player.bleed:0);
      return this.check()
    }
    afterAttack(){let optionalDiscard=!!this.s.mayDiscardAfterSkill;if(this.s.atkOwner)this._grantChaosIfKnight(this.s.atkOwner);this.s.pendingAttack=null;this.s.pendingFiveChoice=false;this.s.fiveChoiceCard=null;this.s.pendingNumberJudge=null;this.s.pendingAttackMod=null;this.s.attackDebuffSnapshot=null;this.s.defenseSkipped=false;this.s.unblockDefend=false;this.s.phase=optionalDiscard?'PLAYER_DISCARD':'PLAYER_PLAY';this.s.busy=false;this.s.atkCard=this.s.defCard=null;this.s.atkOwner=this.s.defOwner=null;this.s.revealCards=[];if(optionalDiscard){this.s.forcedDiscard=false;this.s.selectedCard=-1;this.s.selectedCards=[]}}
    _grantChaosForCard(ch,card){if(!ch||!ch.alive||this.name(ch)!=='Knight')return;if(!card||card.isBlack||card.isWhite||card.isItemCard)return;let color=this.effective(card);if(!C.includes(color))return;let key='chaos_'+color.toLowerCase();if(ch[key])return;ch[key]=true;this.emit('desc',ch.name+'获得[混沌-'+this.colorName(color)+']',card)}
    _grantChaosIfKnight(who){this._grantChaosForCard(this.s[who],this.s.atkCard);let defWho=this.s.defOwner;if(defWho&&defWho!==who)this._grantChaosForCard(this.s[defWho],this.s.defCard)}
    fillHands(isPlayerPhase){let limit=this.s.handLimit;this.draw('player',Math.max(0,limit-this.h.player.length),true);this.draw('ai',Math.max(0,5-this.h.ai.length),true);if(isPlayerPhase)this.emit('desc','回合结束：双方手牌补至5张')}
    trimAI(){while(this.h.ai.length>5){let worst=this.chooseAIDiscard(this.h.ai),card=this.h.ai.splice(worst,1)[0];this.discardWithEvent(card,'ai',{handIndex:worst,desc:`AI手牌超限，按角色策略弃掉${this.cardText(card)}`})}}
    startAITurn(){this.fillHands(true);this.s.phase='AI_TURN';this.s.busy=true;this.s.activeAttacker='ai';this.s.forceEndAITurn=false;this.s.pendingAIContinue=null;this.s.atkCard=this.s.defCard=null;this.s.atkOwner=this.s.defOwner=null;this.s.selectedCards=[];this.later(()=>this.aiTurn());return this.check()}
    endTurn(){if(this.s.phase!=='PLAYER_PLAY')throw Error('当前不能结束回合');if(this.h.player.length>this.s.handLimit){this.s.forcedDiscard=true;this.s.phase='PLAYER_DISCARD';this.s.selectedCard=-1;this.s.selectedCards=[];this.emit('desc',`手牌超过${this.s.handLimit}张，请弃至不超过${this.s.handLimit}张`);return this.state()}if(this.s.player.burn){let dmg=this.s.player.burn;this.s.player.burn--;if(this.name(this.s.player)!=='Leon'){this.emit('burnSettle',`-${dmg}[灼烧]，-1[灼烧层数]`,null,{who:'player',amount:dmg});this.s.player.hp=Math.max(0,this.s.player.hp-dmg);this.s.player.alive=this.s.player.hp>0}}return this.startAITurn()}
    enterDiscard(){if(this.s.hasPlayedThisTurn)throw Error('本回合已出牌，不能再弃牌');this.s.forcedDiscard=false;this.s.phase='PLAYER_DISCARD';this.s.selectedCard=-1;this.s.selectedCards=[];return this.state()}
    confirmDiscard(){let selected=this.s.selectedCards||[];if(!selected.length)throw Error('请选择要弃掉的牌');selected.sort((a,b)=>b-a);for(const i of selected)if(this.h.player[i]){let card=this.h.player.splice(i,1)[0];this.discardWithEvent(card,'player',{handIndex:i,desc:`玩家弃掉${this.cardText(card)}`})}this.s.selectedCard=-1;this.s.selectedCards=[];if(this.s.mayDiscardAfterSkill){this.s.mayDiscardAfterSkill=false;this.s.phase='PLAYER_PLAY';this.emit('desc','Ryan 3牌：已完成可选弃牌');return this.state()}if(this.s.forcedDiscard&&this.h.player.length>this.s.handLimit){this.emit('desc',`仍需弃牌，手牌必须不超过${this.s.handLimit}张`);return this.state()}this.s.forcedDiscard=false;return this.startAITurn()}
    cancelDiscard(){if(this.s.forcedDiscard)throw Error(`手牌超过${this.s.handLimit}张，不能取消弃牌`);this.s.mayDiscardAfterSkill=false;this.s.phase='PLAYER_PLAY';this.s.selectedCard=-1;this.s.selectedCards=[];return this.state()}
    aiSpecialEffect(n,v,c){let a=this.s.ai,t=this.s.player,owner=this.s.atkOwner&&this.s.atkOwner!=='player'?this.s.atkOwner:'ai',m=AIRegistry.get(n);if(!m)return null;let silent={silent:true},helpers={burnTarget:q=>this.burn(t,q,silent),burnSelf:q=>this.burn(a,q,silent),bleedTarget:q=>this.bleed(t,q,silent),gainGuard:q=>a.guard=Math.min(5,(a.guard||0)+q),healSelf:(q,k)=>this.heal(a,q,k),drawSelf:(q,an)=>this.draw(owner,q,an),clearSelf:()=>this.clearDebuffs(a),selfHand:this.h[owner],targetHand:this.h.player,owner,target:t,self:a,copy:cp};return m.specialEffect(this,n,v,c,a,t,owner,helpers,this.aiContext())}
    aiTurn(){if(!this.s.aiTurnStarted){this.turnStart('ai');this.s.aiTurnStarted=true;this.s.aiHasPlayed=false;if(!this.s.ai.alive)return this.check()}let top=this.s.discardTop,chosen=this.chooseAIPlay(top);if(!chosen){if(!this.s.aiHasPlayed&&this.h.ai.length){let dropped=this.h.ai.splice(0,this.h.ai.length);for(let i=dropped.length-1;i>=0;i--)this.discardWithEvent(dropped[i],'ai',{handIndex:i,desc:`AI无牌可出，弃掉${this.cardText(dropped[i])}`});this.emit('desc',`AI无牌可出，弃掉全部${dropped.length}张手牌`)}return this.later(()=>this.endAi(),700)}let i=this.h.ai.indexOf(chosen),c=this.h.ai.splice(i,1)[0];this._tickBomb();this.setAIWildColor(c,top,false);this.s.aiHasPlayed=true;this.s.atkCard=cp(c);this.s.atkOwner='ai';this.setDiscardTop(c);this.rememberAttackDebuffs('player');let _buffBefore={bleed:this.s.player.bleed||0,burn:this.s.player.burn||0,poison:this.s.player.poison||0,frozen:!!this.s.player.frozen};this.applySaikiPassive(this.s.ai,this.s.player,c);this.emit('aiPlay',`AI ${this.name(this.s.ai)} 按角色策略出牌`,c);this.announceAIColor(c);if(c.isItemCard){let kind=this.itemKind(c);this.emit('itemEffect',this.itemEffectDesc(c,'ai'),c,{effect:kind,who:'ai'});this.useItem(c,this.s.ai,this.s.player,'ai');this.s.pendingAIBridge={mode:'attack',afterEventId:this.ver,effect:kind};return this.check()}this._deferAttackBuffs('player',_buffBefore);let r=this.aiSpecialEffect(this.name(this.s.ai),c.value,c)||this.effect(this.name(this.s.ai),c.value,c,this.s.ai,this.s.player);this._deferAttackBuffs('player',_buffBefore);if(r.immediateBuffs)this._restoreAttackBuffs();this.s.pendingAttack={damage:r.d,unblock:r.unblock};if(r.d&&!r.skip&&!r.unblock){this.s.phase='PLAYER_DEFEND';this.s.busy=false;this.s.unblockDefend=false;return}if(r.d&&r.unblock){this.s.unblockDefend=true;if(this.playerNeedsAvoidChoice()){this.askGuard(r.d);return}this.s.phase='PLAYER_DEFEND';this.s.busy=false;return}if(!r.d)this.emit('desc',`AI ${this.name(this.s.ai)} 本次技能分支未造成伤害，跳过防御`,c);if(r.d&&this.playerNeedsAvoidChoice()){this.askGuard(r.d);return}this._restoreAttackBuffs();this.hurt(this.s.player,r.d);this.s.phase='AI_TURN';this.s.busy=true;this.s.pendingAIContinue={afterEventId:this.ver};return this.check()}
    endAi(){this.trimAI();if(this.s.ai.burn){let dmg=this.s.ai.burn;this.s.ai.burn--;if(this.name(this.s.ai)!=='Leon'){this.emit('burnSettle',`-${dmg}[灼烧]，-1[灼烧层数]`,null,{who:'ai',amount:dmg});this.s.ai.hp=Math.max(0,this.s.ai.hp-dmg);this.s.ai.alive=this.s.ai.hp>0}}this.s.turn++;this.s.phase='PLAYER_PLAY';this.s.busy=false;this.s.activeAttacker='player';this.s.pendingAttack=null;this.s.pendingAIBridge=null;this.s.pendingAIContinue=null;this.s.forceEndAITurn=false;this.s.attackDebuffSnapshot=null;this.s.atkCard=this.s.defCard=null;this.s.atkOwner=this.s.defOwner=null;this.s.revealCards=[];this.s.hasPlayedThisTurn=false;this.s.aiTurnStarted=false;this.s.aiHasPlayed=false;let _hands=this.handCounts();this.silentDraws(function(){this.fillHands(false);this.turnStart('player')});this.emitDrawDiff(_hands);this.check()}
    check(){for(const k of ['player','ai']){this.s[k].alive=this.s[k].hp>0}if(!this.s.player.alive||!this.s.ai.alive){this.s.phase='GAME_OVER';this.s.busy=false;clearTimeout(this.timer)}return this.state()}
    _allEnemiesDead(){if(!this.s)return false;if(!this.s.ai||!this.s.ai.alive){if(!this.s.is1v2)return true;if(!this.s.ai2||!this.s.ai2.alive)return true}return false}
    later(f,ms=550){clearTimeout(this.timer);this.timer=setTimeout(()=>{try{f()}catch(e){console.error(e)}},ms)}
    dispatch(m,p={}){if(m==='characters')return this.chars();if(m==='selectMode'){this.mode=!!p.mode1v2;return{status:'ok'}}if(m==='selectCharacters')return this.start(p.player,p.ai);if(m==='setRevealAI'){this.s.revealAIHand=!!p.reveal;return this.state()}if(m==='selectCard')return this.select(p.index);if(m==='doPlay')return this.play();if(m==='doFiveHeal')return this.finishRyanFive(false);if(m==='doFiveDamage')return this.finishRyanFive(true);if(m==='doSaikiSixConfirm')return this.finishNumberJudge();if(m==='resolveAttackModChoice')return this.resolveAttackModChoice(p);if(m==='doDefend')return this.defend();if(m==='doSkipDefend')return this.defend(true);if(m==='doEndTurn')return this.endTurn();if(m==='doEnterDiscard')return this.enterDiscard();if(m==='doCancelDiscard')return this.cancelDiscard();if(m==='doConfirmDiscard')return this.confirmDiscard();if(m==='chooseColor'){let card=this.h.player[this.s.selectedCard];if(!card)throw Error('请选择要指定颜色的牌');card.chosenColor=p.color;this.s.needColorChoice=false;this.s.pendingDialog=null;if(this.s.phase==='PLAYER_DEFEND')return this.defend();return this.play()}if(m==='choosePurify'){this.clean(this.s.player,false,p.kind);this.s.pendingDialog=null;this.emit('desc','净化移除一层'+({burn:'灼烧',freeze:'冷冻',bleed:'流血',poison:'中毒',bomb:'炸弹',lush:'茂盛'}[p.kind]||'buff'));return this.state()}if(m==='chooseSuperPurifyTarget')return this.chooseSuperPurifyTarget(p.target);if(m==='chooseGuard')return this.chooseGuard(p.stacks);if(m==='chooseFly')return this.chooseFly();if(m==='chooseFlyContinue')return this.chooseFlyContinue(!!p.again);if(m==='chooseAICard')return this.chooseOpponentCard(Number(p.index));if(m==='doOpponentCardConfirm'||m==='doSevenConfirm')return this.confirmOpponentCard();if(m==='doChanSevenKeep')return this.chanSevenChoice(true);if(m==='doChanSevenDiscard')return this.chanSevenChoice(false);if(m==='doSaikiThreeKeep')return this.saikiThreeChoice(true);if(m==='doSaikiThreeDiscard')return this.saikiThreeChoice(false);if(m==='doChanFourSwap')return this.chanFourSwap();if(m==='doChanFourDiscard')return this.chanFourDiscard();if(m==='doOttoFourConfirm')return this.ottoFourConfirm();if(m==='chanFiveReorder')return this.finishChanFive(p.order);if(m==='clearEvents'){let through=Number(p.throughId);if(Number.isFinite(through))this.acknowledgeEvents(through);else this.events=[];return{ok:true,remaining:this.events.length}}if(m==='restart'){clearTimeout(this.timer);this.pendingSettlement=null;this.s=null;return this.state()}throw Error('该操作尚不适用于当前状态')}
  }
  Engine.prototype.aiDefend=function(atk,d){let frozen=this.s.ai.frozen&&this.effective(atk)==='BLUE',chosen=frozen?null:this.chooseAIDefend(this.s.discardTop,d),i=chosen?this.h.ai.indexOf(chosen):-1;if(i>=0){let top=this.s.discardTop,c=this.h.ai.splice(i,1)[0];this._tickBomb();if(c.isBlack)c.chosenColor=this.h.ai.find(q=>!q.isBlack&&!q.isWhite&&q.value<=3)?.color||this.chooseAIColor();else this.setAIWildColor(c,top,false);this.s.defCard=cp(c);this.s.defOwner='ai';this.setDiscardTop(c);if(c.isItemCard){this.emit('aiDefend','AI打出搭桥牌并立即结算道具效果',c);this.announceAIColor(c);let kind=this.itemKind(c);this.emit('itemEffect',this.itemEffectDesc(c,'ai'),c,{effect:kind,who:'ai'});this.useItem(c,this.s.ai,this.s.player,'ai');this.s.pendingAIBridge={mode:'defense',afterEventId:this.ver,attackCard:cp(atk),damage:d};return this.check()}let n=this.name(this.s.ai),v=c.value;this.emit('aiDefend',`AI打出${n} ${v}牌，触发防御技能`,c);this.announceAIColor(c);let judged=this.defenseJudge('ai',c,d),b=0,remaining,desc='';
      if(judged){remaining=Math.max(0,judged.remaining);desc='AI完成防御判定'}
      else{let m=CharacterRegistry.get(n);if(m){let r=m.defend(this,n,v,d,c,this.s.ai,this.s.player,'ai',this.effective(atk),{hurt:(x,n,b)=>this.hurt(x,n,b),heal:(x,n,k)=>this.heal(x,n,k),draw:(w,n,an)=>this.draw(w,n,an),burn:(x,n)=>this.burn(x,n),bleed:(x,n)=>this.bleed(x,n),poison:(x,n)=>this.poison(x,n),cancelAttackDebuffs:(o,r)=>this.cancelAttackDebuffs(o,r),clearDebuffs:x=>this.clearDebuffs(x)});if(r){remaining=r.remaining;desc=r.desc}}if(desc===''){b=c.isNumberCard?(c.value===1?Math.ceil(d/2):c.value===3?Math.floor(d/2):0):0;remaining=Math.max(0,d-b);desc=this.s.ai.name+'抵消'+b+'点伤害，剩余'+remaining+'点待结算'}}
      if(!judged)this.emit('desc',desc);
      this.deferSettlement('PLAYER_ATTACK',remaining,c.isNumberCard&&c.value<=3?this.s.ai.bleed:0)
    }else{
      this.emit('desc',frozen?'AI处于冷冻状态，无法防御蓝色攻击':'AI根据防御策略选择跳过');
      this.deferSettlement('PLAYER_ATTACK',d,0)
    }
      return this.check()
    };

  Engine.prototype.start1v2=function(p,a1,a2){
    clearTimeout(this.timer);this.pendingSettlement=null;
    this.deck=this.makeDeck();this.discardBottom=[];
    this.h={player:[],ai:[],ai2:[]};this.events=[];
    let top=this.deck.pop();
    while(top.isBlack||top.isWhite){this.deck.unshift(top);top=this.deck.pop()}
    this.s={phase:'PLAYER_PLAY',turn:1,busy:false,selectedCard:-1,selectedCards:[],selectedAICard:-1,
      handLimit:10,forcedDiscard:false,hasPlayedThisTurn:false,hasPlayedBlackDefend:false,
      defenseSkipped:false,unblockDefend:false,attackModBonus:0,aiTurnStarted:false,aiHasPlayed:false,pendingAIBridge:null,
      pendingAIContinue:null,pendingDefenseDamage:0,pendingFiveChoice:false,fiveChoiceCard:null,
      pendingNumberJudge:null,mayDiscardAfterSkill:false,serenityHalfTarget:null,
      forceEndAITurn:false,activeAttacker:'player',is1v2:true,needColorChoice:false,
      pendingDialog:null,discardTop:top,
      player:this.character(p),ai:this.character(a1,true),ai2:Object.assign(this.character(a2,true),{name:'AI2 '+a2}),
      currentAITarget:0,attackTarget:null,eliminatedHandled:{ai:false,ai2:false},
      atkCard:null,atkOwner:null,defCard:null,defOwner:null,revealCards:[]};
    this.s.player.maxHp*=2;this.s.player.hp=this.s.player.maxHp;
    this.draw('player',10);this.draw('ai',5);this.draw('ai2',5);
    let _hands=this.handCounts();this.silentDraws(function(){this.turnStart('player')});this.emitDrawDiff(_hands);return this.state()
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
    if(includePlayer)this.draw('player',Math.max(0,this.s.handLimit-this.h.player.length),true);
    if(this.s.ai.alive)this.draw('ai',Math.max(0,limit-this.h.ai.length),true);
    if(this.s.ai2.alive)this.draw('ai2',Math.max(0,limit-this.h.ai2.length),true);
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
    if(ch.burn){let dmg=ch.burn;ch.burn--;if(this.name(ch)!=='Leon'){let w=this._who(ch);this.emit('burnSettle',`-${dmg}[灼烧]，-1[灼烧层数]`,null,{who:w,amount:dmg});ch.hp=Math.max(0,ch.hp-dmg);ch.alive=ch.hp>0}}
    this.check();if(this.s.phase==='GAME_OVER')return;
    if(this._advanceAI()){
      this.later(()=>this.aiTurn1v2());return this.check()
    }
    this.s.turn++;this.s.phase='PLAYER_PLAY';this.s.busy=false;this.s.activeAttacker='player';
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
    if(c.potion)this.heal(owner,this.s.isAdventure&&w!=='player'?3:5);
    if(c.magic){this.heal(owner,w!=='player'&&this._isAdventureBoss(owner)?5:3);this.clearPositiveBuffs(target);}
    if(c.drawThree)this.draw(w,3,true);
    if(c.drawTwo)this.draw(w,2,true);
    if(c.purify&&w==='player'&&(owner.burn||owner.bleed||owner.frozen||owner.poison)){this.s.pendingDialog='purify'}
    else if(c.purify)this.clean(owner);
    if(c.superPurify&&w==='player'){this.s.pendingDialog='superPurify'}
    else if(c.superPurify){
      let ownerDeb=owner.burn+owner.bleed+(owner.poison||0)+(owner.frozen?1:0),targetGuard=target?target.guard:0;
      if(targetGuard>=2&&ownerDeb<2)this.clean(target,true);
      else this.clean(owner,true);
    }
    if(c.swapHand){let targetKey=w==='player'?(this.s.atkOwner&&this.s.atkOwner!=='player'?this.s.atkOwner:(this.s.attackTarget||'ai')):'player';[this.h[w],this.h[targetKey]]=[this.h[targetKey],this.h[w]]}
    if(c.shuffleToDeck){this._shuffleDiscardIntoDeck();this.emit('desc','弃牌库已洗回牌堆')}
  };
  Engine.prototype.aiTurn1v2=function(){
    let key=this._curAI(),ch=this.s[key],hand=this.h[key];
    if(!ch.alive)return this.endAi1v2();
    if(!this.s.aiTurnStarted){this.turnStart(key==='ai2'?'ai2':'ai');this.s.aiTurnStarted=true;this.s.aiHasPlayed=false}
    let top=this.s.discardTop,chosen=this._chooseAIPlay1v2(key,top);
    if(!chosen){
      if(!this.s.aiHasPlayed&&hand.length){let dropped=hand.splice(0,hand.length);for(let i=dropped.length-1;i>=0;i--)this.discardWithEvent(dropped[i],key,{handIndex:i,desc:ch.name+'无牌可出，弃掉'+this.cardText(dropped[i])});this.emit('desc',ch.name+'无牌可出，弃掉全部'+dropped.length+'张手牌')}
      return this.later(()=>this.endAi1v2(),700)
    }
    let i=hand.indexOf(chosen),c=hand.splice(i,1)[0];
    if(c.isBlack)c.chosenColor=this._chooseAIColor1v2(key);
    else if(c.isWhite)c.chosenColor=this.effective(top);
    this.s.aiHasPlayed=true;this.s.atkCard=cp(c);this.s.atkOwner=key;
    this.setDiscardTop(c);this.rememberAttackDebuffs('player');let _buffBefore={bleed:this.s.player.bleed||0,burn:this.s.player.burn||0,poison:this.s.player.poison||0,frozen:!!this.s.player.frozen};this.applySaikiPassive(ch,this.s.player,c);
    this.emit('aiPlay',ch.name+' 按角色策略出牌',c,{who:key});
    if(c.isBlack||c.isWhite)this.emit('colorChoice',ch.name+'指定'+this.colorName(c.chosenColor),c);
    if(c.isItemCard){
      let kind=this.itemKind(c);
      this.emit('itemEffect',this.itemEffectDesc(c,key),c,{effect:kind,who:key});
      this.useItem1v2(c,ch,this.s.player,key);
      this.s.pendingAIBridge={mode:'attack',afterEventId:this.ver,effect:kind};
      return this.check()
    }
    this._deferAttackBuffs('player',_buffBefore);
    let r=this._swapAIContext(key,()=>this.aiSpecialEffect(this.name(ch),c.value,c))||this.effect(this.name(ch),c.value,c,ch,this.s.player);
    this._deferAttackBuffs('player',_buffBefore);
    if(r.immediateBuffs)this._restoreAttackBuffs();
    this.s.pendingAttack={damage:r.d,unblock:r.unblock};
    if(r.d&&!r.skip&&!r.unblock){this.s.phase='PLAYER_DEFEND';this.s.busy=false;return}
    if(!r.d)this.emit('desc',ch.name+' 本次技能分支未造成伤害，跳过防御',c);
    if(r.d&&this.playerNeedsAvoidChoice()){this.askGuard(r.d);return}
    this._restoreAttackBuffs();this.hurt(this.s.player,r.d);this.s.phase=key.toUpperCase()+'_TURN';this.s.busy=true;
    this.s.pendingAIContinue={afterEventId:this.ver};return this.check()
  };

  Engine.prototype.play1v2=function(){
    let i=this.s.selectedCard,c=this.h.player[i];
    if(!c)throw Error('请选择要打出的牌');
    if(!this.legal(c))throw Error('该牌不能用于进攻');
    let who=this.name(this.s.player);
    if(((who==='Ryan'&&c.value===5)||(who==='Saiki'&&c.value===6)||(who==='Moze'&&c.value===4))&&!this.h.player.some((x,j)=>j!==i&&x.isNumberCard))throw Error(who+' '+c.value+'牌还需要一张数字牌，请保留至少一张数字牌再使用');
    if(c.isBlack&&!c.chosenColor){this.s.needColorChoice=true;this.s.pendingDialog='color';return this.state()}
    if(c.isWhite)c.chosenColor=this.effective(this.s.discardTop);
    let target=this.s.attackTarget||(this.s.ai.alive?'ai':(this.s.ai2&&this.s.ai2.alive?'ai2':'ai')),targetChar=this.s[target];
    if(!targetChar||!targetChar.alive)throw Error('所选目标已经出局，请重新选择目标');
    this.h.player.splice(i,1);this.s.selectedCard=-1;
    this.s.atkCard=cp(c);this.s.atkOwner='player';this.s.hasPlayedThisTurn=true;
    // Keep the exact attack-card reference used by emit(). A cloned object makes
    // the automatic animation guard treat the same play as a second new card.
    this._animatedPlayerAttack=this.s.atkCard;
    this.setDiscardTop(c);this.rememberAttackDebuffs(target);let _buffBefore={bleed:targetChar.bleed||0,burn:targetChar.burn||0,poison:targetChar.poison||0,frozen:!!targetChar.frozen};this.applySaikiPassive(this.s.player,targetChar,c);
    this.emit('playerPlay','玩家打出进攻牌',c);
    if(c.isBlack)this.emit('colorChoice','黑牌指定'+this.colorName(c.chosenColor),c);
    else if(c.isWhite)this.emit('colorChoice','白色牌自动指定'+this.colorName(c.chosenColor),c);
    if(c.isItemCard){
      let kind=this.itemKind(c);
      this.emit('itemEffect',this.itemEffectDesc(c,'player'),c,{effect:kind,who:'player',target});
      this.useItem1v2(c,this.s.player,targetChar,'player');
      this.s.phase='PLAYER_PLAY';this.s.busy=false;this.s.attackTarget=null;
      return this.check()
    }
    this._deferAttackBuffs(target,_buffBefore);
    if(who==='Leon'&&c.value===0)return this.leonZero1v2(c);
    if(who==='Ryan'&&c.value===5)return this.startRyanFive(c);
    if(who==='Saiki'&&c.value===6)return this.startNumberJudge('Saiki',c);
    if(who==='Moze'&&c.value===4)return this.startNumberJudge('Moze',c);
    if(who==='Chan'&&c.value===5)return this.startChanFive();
    if(who==='Otto'&&c.value===3)return this.startOttoThree(c);
    if(who==='Otto'&&c.value===4)return this.startOttoFour(c);
    if(who==='Otto'&&c.value===5)return this.startNumberJudge('Otto',c);
    if(this.opponentChoiceSkill(who,c.value)){
      let p={name:who,value:c.value,attackCard:cp(c)};this.s.pendingOpponentSkill=p;this.s.selectedAICard=-1;
      if(!this.h[target].length)return this.opponentEmpty(p);
      this.s.phase='OPPONENT_CARD_CHOICE';this.s.busy=false;this.emit('desc',who+' '+c.value+'牌：请选择'+targetChar.name+'的一张手牌并确认',c);return this.state()
    }
    let r=this.effect(who,c.value,c,this.s.player,targetChar);
    this._deferAttackBuffs(target,_buffBefore);
    if(r.immediateBuffs)this._restoreAttackBuffs();

    return this.gateAdventureAttackMod(c,r.d,r.skip,r.unblock)
  };

  Engine.prototype.leonZero1v2=function(card){
    this._restoreAttackBuffs();
    let targets=['ai','ai2'].filter(key=>this.s[key]&&this.s[key].alive);
    for(const key of targets)this.burn(this.s[key],1);
    for(const key of targets)this.hurt(this.s[key],7);
    this.hurt(this.s.player,targets.length*2);
    let combined=[];
    for(const key of targets)for(let i=0;i<this.h[key].length;i++)combined.push({key,index:i});
    if(combined.length===0){
      this.s.pendingAttack=null;this.s.defenseSkipped=true;this.s.phase='AI_DEFEND';this.s.busy=true;
      this.emit('desc','Leon 0牌：对所有对手+1层灼烧、7点不可防御伤害；自身受到'+(targets.length*2)+'点伤害',card);
      this.later(()=>{this.afterAttack();this.check()},1700);return this.check()
    }
    this.s.pendingLeonZeroDiscard={remaining:2};
    this.s.phase='OPPONENT_CARD_CHOICE';
    this.s.selectedAICard=-1;
    this.s.busy=false;
    this.emit('desc','Leon 0牌：选择对手手牌弃掉（还需选2张）',card);
    return this.check()
  };

  Engine.prototype._finishLeonZeroDiscard=function(){
    let p=this.s.pendingLeonZeroDiscard;
    if(!p)return;
    let idx=this.s.selectedAICard;
    if(idx<0)return;
    let combined=[];
    for(const key of ['ai','ai2'])if(this.s[key]&&this.s[key].alive)for(let i=0;i<this.h[key].length;i++)combined.push({key,index:i});
    if(idx>=combined.length)return;
    let entry=combined[idx];
    let card=this.h[entry.key].splice(entry.index,1)[0];
    if(card)this.discardWithEvent(card,entry.key,{handIndex:entry.index,desc:'Leon 0牌弃掉'+this.cardText(card)});
    p.remaining--;
    this.s.selectedAICard=-1;
    if(p.remaining>0&&(this.h.ai.length||(this.s.ai2&&this.s.ai2.alive&&this.h.ai2.length))){
      this.s.phase='OPPONENT_CARD_CHOICE';
      this.s.busy=false;
      this.emit('desc','Leon 0牌：选择对手手牌弃掉（还需选'+p.remaining+'张）');
      return this.check()
    }
    delete this.s.pendingLeonZeroDiscard;
    this.s.pendingAttack=null;this.s.defenseSkipped=true;this.s.phase='AI_DEFEND';this.s.busy=true;
    this.later(()=>{this.afterAttack();this.check()},1700);return this.check()
  };

  Engine.prototype.aiDefend1v2=function(atk,d){
    let key=this.s.attackTarget||'ai';
    if(!this.s[key]||!this.s[key].alive)key=this.s.ai.alive?'ai':'ai2';
    let ch=this.s[key],hand=this.h[key];
    let frozen=ch.frozen&&this.effective(atk)==='BLUE',
        chosen=frozen?null:this._chooseAIDefend1v2(key,this.s.discardTop,d),
        i=chosen?hand.indexOf(chosen):-1;
    if(i>=0){
      let top=this.s.discardTop,c=hand.splice(i,1)[0];
      if(c.isBlack)c.chosenColor=hand.find(q=>!q.isBlack&&!q.isWhite&&q.value<=3)?.color||this._chooseAIColor1v2(key);
      else if(c.isWhite)c.chosenColor=this.effective(top);
      this.s.defCard=cp(c);this.s.defOwner=key;this.setDiscardTop(c);
      if(c.isItemCard){
        this.emit('aiDefend',ch.name+'打出搭桥牌并立即结算道具效果',c,{who:key});
        if(c.isBlack||c.isWhite)this.emit('colorChoice',ch.name+'指定'+this.colorName(c.chosenColor),c);
        let kind=this.itemKind(c);
        this.emit('itemEffect',this.itemEffectDesc(c,key),c,{effect:kind,who:key});
        this.useItem1v2(c,ch,this.s.player,key);
        this.s.pendingAIBridge={mode:'defense',afterEventId:this.ver,attackCard:cp(atk),damage:d};
        return this.check()
      }
      let n=this.name(ch),v=c.value;
      this.emit('aiDefend',ch.name+'打出'+n+' '+v+'牌，触发防御技能',c,{who:key});
      if(c.isBlack||c.isWhite)this.emit('colorChoice',ch.name+'指定'+this.colorName(c.chosenColor),c);
      let judged=this.defenseJudge(key,c,d),b=0,remaining,desc='';
      if(judged){remaining=Math.max(0,judged.remaining);desc=ch.name+'完成防御判定'}
      else{let m=CharacterRegistry.get(n);if(m){let r=m.defend(this,n,v,d,c,ch,this.s.player,key,this.effective(atk),{hurt:(x,n,b)=>this.hurt(x,n,b),heal:(x,n,k)=>this.heal(x,n,k),draw:(w,n,an)=>this.draw(w,n,an),burn:(x,n)=>this.burn(x,n),bleed:(x,n)=>this.bleed(x,n),poison:(x,n)=>this.poison(x,n),cancelAttackDebuffs:(o,r)=>this.cancelAttackDebuffs(o,r),clearDebuffs:x=>this.clearDebuffs(x)});if(r){remaining=r.remaining;desc=r.desc}}if(desc===''){b=c.isNumberCard?(c.value===1?Math.ceil(d/2):c.value===3?Math.floor(d/2):0):0;remaining=Math.max(0,d-b);desc=ch.name+'抵消'+b+'点伤害，剩余'+remaining+'点待结算'}}
      if(!judged)this.emit('desc',desc);
      this.deferSettlement('PLAYER_ATTACK',remaining,c.isNumberCard&&c.value<=3?ch.bleed:0)
    }else{
      this.emit('desc',frozen?ch.name+'处于冷冻状态，无法防御蓝色攻击':ch.name+'根据防御策略选择跳过');
      this.deferSettlement('PLAYER_ATTACK',d,0)
    }
    return this.check()
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
      if(c.isBlack&&!c.chosenColor){this.s.needColorChoice=true;this.s.pendingDialog='color';return this.state()}
      let inheritedColor=this.effective(this.s.discardTop||this.s.atkCard);
      if(c.isWhite)c.chosenColor=inheritedColor;
      this.h.player.splice(i,1);this.s.selectedCard=-1;
      this.s.defCard=cp(c);this.s.defOwner='player';this.setDiscardTop(c);
      this._animatedPlayerAttack=this.s.atkCard;
      let n=this.name(this.s.player),v=c.value,b=0,desc='';
      if(c.isBlack)this.emit('colorChoice','黑牌指定'+this.colorName(c.chosenColor),c);
      else if(c.isWhite)this.emit('colorChoice','白色牌自动指定'+this.colorName(c.chosenColor),c);
      if(c.isItemCard){
        let bridgeLabel=c.isBlack?'黑牌':c.isWhite?'白色':'道具';
        this.emit('defend',bridgeLabel+'牌指定'+this.colorName(c.chosenColor||c.color)+'并搭桥，请继续选择防御牌',c);
        this.emit('itemEffect',this.itemEffectDesc(c,'player'),c,{effect:this.itemKind(c),who:'player',target});
        this.useItem1v2(c,this.s.player,targetChar,'player');
        this.s.phase='PLAYER_DEFEND';this.s.busy=false;
        return this.check()
      }
      this.emit('defend','玩家打出防御牌',c);
      let judged=this.defenseJudge('player',c,d);
      if(judged){d=Math.max(0,Number(judged.remaining)||0);desc='防御判定完成'}
        else{let m=CharacterRegistry.get(n);if(m){let r=m.defend(this,n,v,d,c,this.s.player,targetChar,'player',inheritedColor,{hurt:(x,n,b)=>this.hurt(x,n,b),heal:(x,n,k)=>this.heal(x,n,k),draw:(w,n,an)=>this.draw(w,n,an),burn:(x,n)=>this.burn(x,n),bleed:(x,n)=>this.bleed(x,n),poison:(x,n)=>this.poison(x,n),cancelAttackDebuffs:(o,r)=>this.cancelAttackDebuffs(o,r),clearDebuffs:x=>this.clearDebuffs(x)});if(r){d=r.remaining;desc=r.desc}}if(desc===''){b=c.value===1?Math.ceil(d/2):c.value===3?Math.floor(d/2):0;d=Math.max(0,d-b);desc='抵消'+b+'点伤害，剩余'+d+'点待结算'}}
      if(!judged)this.emit('desc',desc)
    }
    if(d&&this.playerNeedsAvoidChoice()){this.askGuard(d,this.s.player.bleed);return this.check()}
    let curAIKey=this._curAI();
    this.s.phase=curAIKey.toUpperCase()+'_TURN';
    this.deferSettlement('AI_ATTACK',d,triggeredDefense&&this.s.defCard&&this.s.defCard.isNumberCard&&this.s.defCard.value<=3?this.s.player.bleed:0);
    return this.check()
  };

  // Route shared character-skill callbacks back into the active 1v2 context.
  const origAfterAttack1v2=Engine.prototype.afterAttack;
  Engine.prototype.afterAttack=function(){
    let result=origAfterAttack1v2.call(this);

    return result
  };

  const origAIDefendShared=Engine.prototype.aiDefend;
  Engine.prototype.aiDefend=function(atk,d){
    if(this.s&&this.s.is1v2)return this.aiDefend1v2(atk,d);
    return origAIDefendShared.call(this,atk,d)
  };

  const origContinueAIShared=Engine.prototype.continueAIAttack;
  Engine.prototype.continueAIAttack=function(){
    if(!this.s||!this.s.is1v2)return origContinueAIShared.call(this);
    if(!this.s.player.alive||(!this.s.ai.alive&&!this.s.ai2.alive)){this.check();return}
    let key=this._curAI();
    if(!this.s[key].alive)return this.endAi1v2();
    this.s.phase=key==='ai2'?'AI2_TURN':'AI_TURN';this.s.busy=true;this.s.activeAttacker=key;
    this.s.pendingAttack=null;this.s.pendingDefenseDamage=0;this.s.attackDebuffSnapshot=null;
    this.s.atkCard=this.s.defCard=null;this.s.atkOwner=this.s.defOwner=null;this.s.revealCards=[];
    this.later(()=>this.aiTurn1v2(),220);return this.check()
  };

  Engine.prototype._startAISequence1v2=function(){
    this.fillHands1v2(true);
    if(this.s.player.burn){let dmg=this.s.player.burn;this.s.player.burn--;if(this.name(this.s.player)!=='Leon'){this.emit('burnSettle','-'+dmg+'[灼烧]',null,{who:'player',amount:dmg});this.hurt(this.s.player,dmg)}}
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
    if(!this.s)return{phase:'SELECT_MODE',deck:0,turn:1};
    Object.assign(this.s,{deck:this.deck.length,discard:1+this.discardBottom.length,discardBottomCount:this.discardBottom.length,
      playerHand:this.h.player,aiHandSize:this.h.ai.length,ai2HandSize:this.h.ai2.length,
      eventLogVersion:this.ver,events:cp(this.events)});
    return cp(this.s)
  };

  const origCheck=Engine.prototype.check;
  Engine.prototype.check=function(){
    if(this.s&&this.s.is1v2)return this._check1v2();
    return origCheck.call(this)
  };
  Engine.prototype._check1v2=function(){
    for(const k of['player','ai','ai2']){if(this.s[k])this.s[k].alive=this.s[k].hp>0}
    if(this._checkDeath1v2()){this.s.phase='GAME_OVER';this.s.busy=false;clearTimeout(this.timer)}
    return this._state1v2()
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
      if(bridge.mode==='defense')this.later(()=>this.aiDefend1v2(bridge.attackCard,bridge.damage),220);
      else this.later(()=>this.aiTurn1v2(),220)
    }
    let continuation=this.s.pendingAIContinue;
    if(continuation&&through>=continuation.afterEventId){this.s.pendingAIContinue=null;this.continueAIAttack();return}
    let p=this.pendingSettlement;
    if(!p||through<p.afterEventId)return;
    this.pendingSettlement=null;this.s.pendingDefenseDamage=0;
    if(p.kind==='PLAYER_ATTACK'){
      let forceEnd=!!this.s.forceEndPlayerTurn;this.s.forceEndPlayerTurn=false;
      let target=this.s.attackTarget||(this.s.ai.alive?'ai':(this.s.ai2&&this.s.ai2.alive?'ai2':'ai')),targetChar=this.s[target];
      let dmg=this.applyDefenderAvoidance(targetChar,p.damage);
      this.hurt(targetChar,dmg);
      this.settleBleed(targetChar,p.bleed);
      this._restoreAttackBuffs();
      this.resolveSerenityHalf();this.afterAttack();
      if(forceEnd)this.startAITurn();
      this.check();return
    }
    let forceEnd=!!this.s.forceEndAITurn;this.s.forceEndAITurn=false;
    this.hurt(this.s.player,p.damage,false,true);
    this.settleBleed(this.s.player,p.bleed);
    this._restoreAttackBuffs();
    this.resolveSerenityHalf();
    this._grantChaosIfKnight('ai');
    if(forceEnd)this.endAi1v2();else this.continueAIAttack()
  };

  // --- 1v2 dispatch override ---
  const origDispatch=Engine.prototype.dispatch;
  Engine.prototype.dispatch=function(m,p={}){
    if(m==='selectCharacters1v2')return this.start1v2(p.player,p.ai,p.ai2);

    if(!this.s||!this.s.is1v2)return origDispatch.call(this,m,p);
    if(m==='chooseColor'){
      let card=this.h.player[this.s.selectedCard];if(!card)throw Error('请选择要指定颜色的牌');
      card.chosenColor=p.color;this.s.needColorChoice=false;this.s.pendingDialog=null;
      return this.s.phase==='PLAYER_DEFEND'?this.defend1v2():this.play1v2()
    }
    if(m==='doOpponentCardConfirm'&&this.s.pendingLeonZeroDiscard)return this._finishLeonZeroDiscard();
    if(m==='chooseAICard'||m==='doOpponentCardConfirm'||m==='doSevenConfirm'||m==='doChanSevenKeep'||m==='doChanSevenDiscard'||m==='doSaikiThreeKeep'||m==='doSaikiThreeDiscard'||m==='doChanFourSwap'||m==='doChanFourDiscard'||m==='doFiveHeal'||m==='doFiveDamage'||m==='doSaikiSixConfirm'||m==='chanFiveReorder')return origDispatch.call(this,m,p);
    if(m==='doPlay'){
      let c=this.h.player[this.s.selectedCard];
      if(!c||!this.legal(c))return this.state();
      this.s.attackTarget=null;
      let needsTarget=(!c.isItemCard||c.swapHand)&&!c.isBlack;
      if(needsTarget){
        let alive1=this.s.ai.alive,alive2=this.s.ai2&&this.s.ai2.alive;
        if(alive1&&alive2){
          let roll=Math.floor(Math.random()*6)+1;
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

  window.Engine=Engine;
  const e=new Engine();window.furryBattle={dispatch:(m,p)=>e.dispatch(m,p),getState:()=>e.state()};
})();

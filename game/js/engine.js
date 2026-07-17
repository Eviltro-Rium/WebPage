/* Furry Battle browser engine — a standalone port of the Swing turn loop. */
(function () {
  const C=['RED','YELLOW','BLUE','GREEN'];
  const M={Ryan:[70,'战士','进攻回合开始前恢复1点生命'],Leon:[90,'骑士','免疫灼烧'],Chan:[80,'谋士','进攻回合开始前抽1张牌'],Saiki:[80,'猎手','进攻时打出有效黄色牌会施加1层流血'],Blaze:[85,'狂战','自身有灼烧时，1至7牌的攻击伤害+1'],Serenity:[80,'暗影','免疫冷冻；低于30生命进入嗜血，正常态恢复额外+1'],Moze:[100,'守护','可消耗守护减免伤害，但不能减免流血伤害'],Knight:[80,'混沌','进攻前清除混沌；打出基础颜色数字牌获得对应混沌']};
  const cp=x=>JSON.parse(JSON.stringify(x));
  const num=(color,value,white=false)=>({value,color,drawTwo:false,drawThree:false,potion:false,purify:false,superPurify:false,swapHand:false,shuffleToDeck:false,isBlack:false,isWhite:white,isNumberCard:true,isItemCard:false});
  const item=(color,k)=>({value:-1,color,drawTwo:k==='drawTwo',drawThree:k==='drawThree',potion:k==='potion',purify:k==='purify',superPurify:k==='superPurify',swapHand:k==='swap',shuffleToDeck:k==='shuffle',isBlack:color==='BLACK',isWhite:color==='WHITE',isNumberCard:false,isItemCard:true});
  class Engine{
    constructor(){this.s=null;this.mode=false;this.deck=[];this.discardBottom=[];this.h={player:[],ai:[]};this.events=[];this.ver=0;this.timer=0;this.pendingSettlement=null}
    chars(){return Object.entries(M).map(([name,[hp,type,passive]])=>({name,hp,type,passive}))}
    character(n,ai=false){return{name:(ai?'AI ': '')+n,hp:M[n][0],maxHp:M[n][0],burn:0,frozen:false,bleed:0,guard:0,alive:true,bloodthirst:false,chaos_red:false,chaos_yellow:false,chaos_blue:false,chaos_green:false}}
    name(x){return x.name.replace(/^AI\d*\s+/,'')}
    makeDeck(){let d=[];for(const c of C){for(let v=1;v<=7;v++)for(let n=0;n<(v<=3?3:v<=6?2:1);n++)d.push(num(c,v));d.push(num(c,0))}for(let v=1;v<=7;v++)d.push(num('WHITE',v,true));for(let i=0;i<2;i++)d.push(item('BLACK','black'),item('BLACK','drawTwo'),item('WHITE','drawThree'),item('WHITE','swap'));for(let i=0;i<4;i++)d.push(item('BLACK','shuffle'),item('WHITE','potion'),item('WHITE','superPurify'));for(let i=0;i<6;i++)d.push(item('WHITE','purify'));for(let i=d.length-1;i;i--){let j=Math.floor(Math.random()*(i+1));[d[i],d[j]]=[d[j],d[i]]}return d}
    start(p,a){clearTimeout(this.timer);this.pendingSettlement=null;this.deck=this.makeDeck();this.discardBottom=[];this.h={player:[],ai:[]};this.events=[];let top=this.deck.pop();while(top.isBlack||top.isWhite){this.deck.unshift(top);top=this.deck.pop()}this.s={phase:'PLAYER_PLAY',turn:1,busy:false,selectedCard:-1,selectedCards:[],selectedAICard:-1,handLimit:5,forcedDiscard:false,hasPlayedThisTurn:false,hasPlayedBlackDefend:false,defenseSkipped:false,aiTurnStarted:false,aiHasPlayed:false,pendingAIBridge:null,pendingAIContinue:null,pendingDefenseDamage:0,pendingFiveChoice:false,fiveChoiceCard:null,pendingNumberJudge:null,mayDiscardAfterSkill:false,serenityHalfTarget:null,forceEndAITurn:false,activeAttacker:'player',is1v2:false,needColorChoice:false,pendingDialog:null,discardTop:top,player:this.character(p),ai:this.character(a,true),atkCard:null,atkOwner:null,defCard:null,defOwner:null,revealCards:[]};this.draw('player',5);this.draw('ai',5);this.turnStart('player');return this.state()}
    state(){if(!this.s)return{phase:'SELECT_MODE',deck:0,turn:1};Object.assign(this.s,{deck:this.deck.length,discard:1+this.discardBottom.length,discardBottomCount:this.discardBottom.length,playerHand:this.h.player,aiHandSize:this.h.ai.length,eventLogVersion:this.ver,events:cp(this.events)});return cp(this.s)}
    _shuffleDiscardIntoDeck(){for(const x of this.discardBottom)if(x.isBlack||x.isWhite)delete x.chosenColor;this.deck.push(...this.discardBottom);this.discardBottom=[];for(let i=this.deck.length-1;i;i--){let j=Math.floor(Math.random()*(i+1));[this.deck[i],this.deck[j]]=[this.deck[j],this.deck[i]]}}
    refillDeckIfNeeded(){if(this.deck.length||!this.discardBottom.length)return;this._shuffleDiscardIntoDeck();this.emit('desc','牌库已空，弃牌库洗回牌堆')}
    draw(w,n,animated=false){let cards=[];while(n--){this.refillDeckIfNeeded();if(!this.deck.length)break;let c=this.deck.pop();this.h[w].push(c);cards.push(c)}if(animated&&cards.length)this.emit('draw',`${w==='player'?'玩家':'AI'}抽${cards.length}张牌`,null,{who:w,count:cards.length});return cards}
    discardToBottom(card){if(card){if(card.isBlack||card.isWhite)delete card.chosenColor;this.discardBottom.push(cp(card))}}
    setDiscardTop(card){if(this.s.discardTop)this.discardToBottom(this.s.discardTop);this.s.discardTop=cp(card)}
    emit(type,desc,card,extra={}){if(type!=='playerPlay'&&this.s&&this.s.atkOwner==='player'&&this.s.atkCard&&this._animatedPlayerAttack!==this.s.atkCard){this._animatedPlayerAttack=this.s.atkCard;let playId=++this.ver;this.events.push({id:playId,type:'playerPlay',desc:'玩家打出进攻牌',card:cp(this.s.atkCard)})}let id=++this.ver;this.events.push(Object.assign({id,type,desc,card:card&&cp(card)},extra));return id}
    reveal(desc){let c=this.deck.pop();if(!c)return null;this.s.revealCards=[cp(c)];this.emit('reveal',desc,c);return c}
    effective(c){return c.chosenColor||c.color}
    cardText(c){if(c.isBlack)return '黑牌';if(c.isWhite)return c.isNumberCard?`白${c.value}`:'白色道具牌';return `${({RED:'红',YELLOW:'黄',BLUE:'蓝',GREEN:'绿'})[c.color]||''}${c.value}`}
    colorName(c){return({RED:'红色',YELLOW:'黄色',BLUE:'蓝色',GREEN:'绿色',BLACK:'黑色',WHITE:'白色'})[c]||'当前颜色'}
    chooseAIColor(){let counts=Object.fromEntries(C.map(x=>[x,0]));for(const card of this.h.ai){let color=this.effective(card);if(C.includes(color))counts[color]++}return C.reduce((a,b)=>counts[b]>counts[a]?b:a)}
    setAIWildColor(card,top,announce=true){if(card.isBlack)card.chosenColor=this.chooseAIColor();else if(card.isWhite)card.chosenColor=this.effective(top);if(announce)this.announceAIColor(card)}
    announceAIColor(card){if(card.isBlack||card.isWhite)this.emit('colorChoice',`AI指定${({RED:'红色',YELLOW:'黄色',BLUE:'蓝色',GREEN:'绿色'})[card.chosenColor]}`,card)}
    aiContext(){let a=this.s.ai,o=this.s.player;return{deb:a.burn+a.bleed+(a.frozen?1:0),full:a.hp>=a.maxHp,hp:Math.floor(a.hp*100/a.maxHp),ohp:Math.floor(o.hp*100/o.maxHp),guard:a.guard,og:o.guard,burn:a.burn,ob:o.burn,obl:o.bleed,oh:this.h.player.length,chaos:!!(a.chaos_red||a.chaos_yellow||a.chaos_blue||a.chaos_green),chaosCount:[a.chaos_red,a.chaos_yellow,a.chaos_blue,a.chaos_green].filter(Boolean).length}}
    aiSkip(name,c,x){if(c.isItemCard)return false;let v=c.value;if(name==='Ryan'&&(x.full&&(v===2||v===6)||x.hp<=25&&v===0))return true;if(name==='Leon'&&(x.full&&v===2||v===1&&x.ob>=4))return true;if(name==='Chan'&&(v===1&&x.hp>50||v===5&&x.hp<=30))return true;if(name==='Saiki'&&v===7&&!x.obl)return true;if(name==='Blaze'&&v===6&&!x.burn)return true;if(name==='Moze'&&v===6&&!x.guard)return true;if(name==='Knight'&&v===0&&!x.chaos)return true;return false}
    baseAttackScore(c,top,x){if(c.isBlack)return 1;if(c.superPurify){let selfDeb=x.deb||0,oppGuard=x.og||0;if(selfDeb>=3)return 55;if(oppGuard>=3)return 53;if(selfDeb>=1)return 50;if(oppGuard>=1)return 48;return 2}if(c.purify){let selfDeb=x.deb||0;if(selfDeb>=2)return 51;if(selfDeb>=1)return 49;return 2}if(c.potion)return x.full?3:60;if(c.swapHand){let myLen=this.h.ai.length,oppLen=x.oh;if(myLen<=2&&oppLen>=4)return 55;if(myLen<oppLen)return 50;if(myLen<=3)return 8;return 2}if(c.drawThree)return 4;if(c.isWhite)return 5;return (c.color===this.effective(top)?20:15)+c.value*2}
    aiAttackScore(c,top){let n=this.name(this.s.ai),x=this.aiContext();if(this.aiSkip(n,c,x))return 0;if(c.isItemCard)return this.baseAttackScore(c,top,x);if(c.isWhite)return 5;let v=c.value,s=null;
      if(n==='Ryan'){if(v===0&&x.hp<=33)s=85;else if(v===6){let sum=this.h.ai.filter(q=>q.isNumberCard).reduce((a,q)=>a+q.value,0);s=sum>=15?72:sum>=10?50:null}else if(v===1&&!x.full)s=55;else if(v===4&&!x.og)s=48}
      if(n==='Leon'){if(v===4&&x.ob)s=78;else if(v===7&&x.ob>=2)s=73;else if(v===0)s=x.hp>60?12:x.hp>40?25:40;else if(v===2&&!x.ob)s=45;else if(v===3&&!x.ob)s=42}
      if(n==='Chan'){s=v===0?72:v===4&&(x.obl||x.ob)?70:v===6?62:v===7&&this.h.ai.length>=3?60:v===5&&x.hp>30?55:v===2?40:v===3?38:v===1&&x.hp<=50?50:null}
      if(n==='Saiki'){s=v===0&&x.obl>=2?82:v===4&&x.obl?78:v===7&&x.obl>=2?75:v===5?(x.hp<=20?70:x.hp<=50?65:58):v===6&&this.h.ai.some(q=>q.isNumberCard&&q.value>0&&q.value>=5)?60:v===0&&x.obl===1?55:v===3&&x.oh?48:v===1?42:v===2?40:null}
      if(n==='Blaze'){s=v===5&&x.burn>=3?80:v===7&&x.burn+x.ob>=4?75:v===0?68:v===5&&x.burn>=2?65:v===2&&x.og?62:v===6&&x.burn>=3?58:v===3&&x.burn<4?50:v===1?45:v===4&&x.oh?48:v===2&&!x.burn?42:null}
      if(n==='Serenity'){let bt=x.hp<30;s=v===0?(bt?82:60):v===7?(bt?78:50):v===6?(bt?75:55):v===4?(bt?72:48):v===2?(bt?68:42):v===1?(bt?65:x.hp<60?52:null):v===5?45:v===3?40:null}
      if(n==='Moze'){s=v===0?82:v===6&&x.guard>=3?75:v===7&&x.deb>=2?70:v===2&&c.color==='GREEN'&&x.guard<3?68:v===4&&!x.guard?65:v===3&&x.guard<2?60:v===1?45:v===5?50:v===6&&x.guard?55:v===7?48:v===2?42:null}
      if(n==='Knight'){let cc=x.chaosCount||0;s=v===0?(cc>=4?85:78):v===7&&cc>=3?80:v===7&&cc>=2?72:v===5&&x.chaos_red?68:v===6&&x.chaos_green?65:v===1&&cc>=2?60:v===1&&cc>=1?52:v===4?55:v===2?42:v===3?40:null}
      return s==null?this.baseAttackScore(c,top,x):s}
    chooseAIPlay(top){let best=null,score=-1;for(const c of this.h.ai){if(!this.legal(c))continue;let s=this.aiAttackScore(c,top);if(s>score){score=s;best=c}}return best}
    aiDefendLegal(c,top,x){if(c.isBlack||c.drawThree||c.potion||c.swapHand)return true;if(c.superPurify)return x.deb>0||x.og>0;if(c.purify)return x.deb>0;if(c.isWhite)return c.value<=3;return c.value<=3&&(c.color===this.effective(top)||c.value===top.value)}
    baseDefendScore(c,top,x){if(c.potion)return x.full?2:60;if(c.superPurify){let selfDeb=x.deb||0,oppGuard=x.og||0;if(selfDeb>=3)return 57;if(oppGuard>=3)return 55;if(selfDeb>=1)return 53;if(oppGuard>=1)return 50;return 5}if(c.purify)return x.deb?(x.deb<=2?56:54):5;if(c.drawThree)return 50;if(c.swapHand){let myLen=this.h.ai.length,oppLen=x.oh;if(myLen<=2&&oppLen>=4)return 45;if(myLen<oppLen)return 40;return 3}if(c.isBlack)return 10;if(c.isWhite)return 15;return 20+(4-c.value)*5}
    aiDefendScore(c,top){let n=this.name(this.s.ai),x=this.aiContext();if(c.isItemCard)return this.baseDefendScore(c,top,x);let v=c.value,s=null;if(n==='Ryan')s=v===0&&x.hp<=33?85:v===3&&this.effective(top)==='RED'?72:null;if(n==='Leon')s=v===0&&x.hp<=33?85:v===1&&x.ob<4?55:null;if(n==='Chan')s=v===0?85:v===2?55:v===3?45:null;if(n==='Saiki')s=v===0?85:v===2&&x.obl?60:v===3?50:null;if(n==='Blaze')s=v===0&&x.burn>=3?80:v===3&&x.burn>=2?68:v===1&&x.burn?58:v===0&&x.burn<=1?55:v===2?45:null;if(n==='Serenity')s=v===0?80:v===2&&x.obl?62:v===3&&x.hp<30?58:v===1&&x.hp<30?55:null;      if(n==='Moze')s=v===0?85:v===3&&x.guard?68:v===2&&x.guard?62:v===1?50:null;if(n==='Knight'){let cc=x.chaosCount||0;s=v===0&&cc>=4?88:v===0?80:v===3&&x.chaos_red?65:v===2&&x.chaos_blue?62:v===1&&x.chaos_yellow?58:v===1?50:v===2?45:v===3?42:null}return s==null?this.baseDefendScore(c,top,x):s}
    chooseAIDefend(top){let x=this.aiContext(),best=null,score=-1;for(const c of this.h.ai){if(!this.aiDefendLegal(c,top,x))continue;let s=this.aiDefendScore(c,top);if(s>score){score=s;best=c}}return best}
    defenseJudge(owner,card,incoming){let defender=this.s[owner],opponentKey=owner==='player'?(this.s.is1v2&&this.s.atkOwner&&this.s.atkOwner!=='player'?this.s.atkOwner:'ai'):'player',opponent=this.s[opponentKey],name=this.name(defender),v=card.value;if(!((name==='Chan'&&v===3)||(name==='Saiki'&&v===3)||(name==='Blaze'&&v===2)||(name==='Serenity'&&v===0)))return null;let r=this.reveal(`${name} ${v}牌防御判定`);if(!r)return{remaining:incoming};let remaining=incoming;
      if(name==='Chan'){let heal=r.isItemCard?0:Math.ceil(r.value/2);this.heal(defender,heal);this.h[owner].push(r);this.emit('desc',`Chan 3牌判定：${this.cardText(r)}，恢复${heal}点并加入手牌`)}
      if(name==='Saiki'){let success=r.isBlack||r.isWhite||this.effective(r)==='YELLOW';if(success)remaining=0;else this.h[owner].push(r);this.emit('desc',success?'Saiki 3牌判定成功：防御所有伤害（不免疫debuff）':`Saiki 3牌判定失败：${this.cardText(r)}加入手牌`)}
      if(name==='Blaze'&&v===2){let counter=r.isItemCard?4:r.value;this.h[owner].push(r);this.hurt(opponent,counter);if(r.isItemCard)this.burn(opponent,1);this.emit('desc',`Blaze 2牌判定：反击${counter}点${r.isItemCard?'并施加1层灼烧':''}，判定牌加入手牌`)}
      if(name==='Serenity'){remaining=0;let yellow=this.effective(r)==='YELLOW';if(yellow){this.s.serenityHalfTarget=opponentKey;this.emit('desc','Serenity 0牌判定黄牌：防御伤害，攻防结束后进攻方生命减半')}else{this.cancelAttackDebuffs(owner,false);this.emit('desc','Serenity 0牌判定非黄牌：免疫所有伤害和debuff')}}
      return{remaining}}
    opponentChoiceSkill(name,value){return (name==='Chan'&&(value===4||value===7))||(name==='Saiki'&&value===3)||(name==='Blaze'&&value===4)||(name==='Moze'&&value===5)}
    finishOpponentAttack(p,d,skip=false,unblock=false){let targetKey=this.s.is1v2?(this.s.attackTarget||'ai'):'ai',target=this.s[targetKey];this.s.pendingOpponentSkill=null;this.s.pendingAttack={damage:d,unblock};if(d&&!skip&&!unblock){this.s.phase='AI_DEFEND';this.s.busy=true;this.later(()=>this.aiDefend(p.attackCard,d))}else{this.hurt(target,d);this.s.phase='AI_DEFEND';this.s.busy=true;this.later(()=>{this.afterAttack();this.check()},1700)}return this.check()}
    opponentEmpty(p){let d=0,skip=false;if(p.name==='Chan'&&p.value===4){d=2;skip=true}if(p.name==='Chan'&&p.value===7)d=6;if(p.name==='Saiki')d=2;if(p.name==='Blaze')d=2+(this.s.player.burn?1:0);if(p.name==='Moze')skip=true;this.emit('desc',`${p.name} ${p.value}牌：对手无手牌${d?`，造成${d}点伤害`:''}${skip?'并跳过防御':''}`,p.attackCard);return this.finishOpponentAttack(p,d,skip,false)}
    aiContextV2(){let a=this.s.ai,o=this.s.player;return{name:this.name(a),debuff:!!(a.burn||a.frozen||a.bleed),debuffCount:a.burn+a.bleed+(a.frozen?1:0),full:a.hp>=a.maxHp,hpPct:Math.floor(a.hp*100/a.maxHp),oppHpPct:Math.floor(o.hp*100/o.maxHp),guard:a.guard,oppGuard:o.guard,burn:a.burn,oppBurn:o.burn,oppBleed:o.bleed,oppHand:this.h.player.length,chaos:!!(a.chaos_red||a.chaos_yellow||a.chaos_blue||a.chaos_green),chaosCount:[a.chaos_red,a.chaos_yellow,a.chaos_blue,a.chaos_green].filter(Boolean).length,chaos_red:a.chaos_red,chaos_yellow:a.chaos_yellow,chaos_blue:a.chaos_blue,chaos_green:a.chaos_green}}
    aiSkipV2(c,x){if(c.isItemCard)return false;let v=c.value;if(x.name==='Ryan'&&((x.full&&(v===2||v===6))||(x.hpPct<=25&&v===0)))return true;if(x.name==='Leon'&&((x.full&&v===2)||(v===1&&x.oppBurn>=4)))return true;if(x.name==='Chan'&&((v===1&&x.hpPct>50)||(v===5&&x.hpPct<=30)))return true;if(x.name==='Saiki'&&v===7&&!x.oppBleed)return true;if(x.name==='Blaze'&&v===6&&!x.burn)return true;if(x.name==='Moze'&&v===6&&!x.guard)return true;if(x.name==='Knight'&&v===0&&!x.chaos)return true;return false}
    baseAIPriority(c,top,x){if(c.isBlack)return 1;if(c.superPurify){let selfDeb=x.debuffCount||0,oppGuard=x.oppGuard||0;if(selfDeb>=3)return 55;if(oppGuard>=3)return 53;if(selfDeb>=1)return 50;if(oppGuard>=1)return 48;return 2}if(c.purify){let selfDeb=x.debuffCount||0;if(selfDeb>=2)return 51;if(selfDeb>=1)return 49;return 2}if(c.potion)return x.full?3:60;if(c.swapHand){let myLen=this.h.ai.length,oppLen=x.oppHand;if(myLen<=2&&oppLen>=4)return 55;if(myLen<oppLen)return 50;if(myLen<=3)return 8;return 2}if(c.drawThree)return 4;if(c.isWhite)return 5;if(this.aiSkip(c,x))return 0;let color=this.effective(c)===this.effective(top),number=c.value===top.value;if(!color&&!number)return 0;return(color?20:15)+c.value*2}
    aiAttackPriority(c,top){let x=this.aiContext(),v=c.value;if(c.isItemCard)return this.baseAIPriority(c,top,x);let p=this.baseAIPriority(c,top,x);if(x.name==='Ryan'){if(v===0&&x.hpPct<=33)return 85;if(v===6){let sum=this.h.ai.filter(q=>q.isNumberCard).reduce((n,q)=>n+q.value,0);if(sum>=15)return 72;if(sum>=10)return 50}if(v===1&&!x.full)return 55;if(v===4&&!x.oppGuard)return 48}if(x.name==='Leon'){if(v===4&&x.oppBurn)return 78;if(v===7&&x.oppBurn>=2)return 73;if(v===0)return x.hpPct>60?12:x.hpPct>40?25:40;if(v===2&&!x.oppBurn)return 45;if(v===3&&!x.oppBurn)return 42}if(x.name==='Chan'){if(v===0)return 72;if(v===4&&(x.oppBleed||x.oppBurn))return 70;if(v===6)return 62;if(v===7&&this.h.ai.length>=3)return 60;if(v===5&&x.hpPct>30)return 55;if(v===2)return 40;if(v===3)return 38;if(v===1&&x.hpPct<=50)return 50}if(x.name==='Saiki'){if(v===0&&x.oppBleed>=2)return 82;if(v===4&&x.oppBleed)return 78;if(v===7&&x.oppBleed>=2)return 75;if(v===5)return x.hpPct<=20?70:x.hpPct<=50?65:58;if(v===6&&this.h.ai.some(q=>q.isNumberCard&&q.value>=5))return 60;if(v===0&&x.oppBleed===1)return 55;if(v===3&&x.oppHand)return 48;if(v===1)return 42;if(v===2)return 40}if(x.name==='Blaze'){if(v===5&&x.burn>=3)return 80;if(v===7&&x.burn+x.oppBurn>=4)return 75;if(v===0)return 68;if(v===5&&x.burn>=2)return 65;if(v===2&&x.oppGuard)return 62;if(v===6&&x.burn>=3)return 58;if(v===3&&x.burn<4)return 50;if(v===1)return 45;if(v===4&&x.oppHand)return 48;if(v===2&&!x.burn)return 42}if(x.name==='Serenity'){let bt=x.hpPct<30;if(v===0)return bt?82:60;if(v===7)return bt?78:50;if(v===6)return bt?75:55;if(v===4)return bt?72:48;if(v===2)return bt?68:42;if(v===1&&bt)return 65;if(v===1&&x.hpPct<60)return 52;if(v===5)return 45;if(v===3)return 40}if(x.name==='Moze'){if(v===0)return 82;if(v===6&&x.guard>=3)return 75;if(v===7&&x.debuff&&x.debuffCount>=2)return 70;if(v===2&&c.color==='GREEN'&&x.guard<3)return 68;if(v===4&&!x.guard)return 65;if(v===3&&x.guard<2)return 60;if(v===1)return 45;if(v===5)return 50;if(v===6&&x.guard)return 55;if(v===7)return 48;if(v===2)return 42}if(x.name==='Knight'){let cc=x.chaosCount||0;if(v===0)return cc>=4?85:78;if(v===7&&cc>=3)return 80;if(v===7&&cc>=2)return 72;if(v===5&&x.chaos_red)return 68;if(v===6&&x.chaos_green)return 65;if(v===1&&cc>=2)return 60;if(v===1&&cc>=1)return 52;if(v===4)return 55;if(v===2)return 42;if(v===3)return 40}return p}
    chooseAIPlayIndex(top){let best=-1,pri=-1;for(let i=0;i<this.h.ai.length;i++){let c=this.h.ai[i];if(!this.legal(c))continue;let p=this.aiAttackPriority(c,top);if(p>pri){pri=p;best=i}}return best}
    aiDefendEligible(c,top,x){if(c.isBlack||c.drawThree||c.potion||c.swapHand)return true;if(c.superPurify)return x.debuff||x.oppGuard>0;if(c.purify)return x.debuff;if(c.isWhite)return c.value<=3&&this.legal(c,true);return c.value<=3&&this.legal(c,true)}
    baseAIDefendPriority(c,top,x){if(c.potion)return x.full?2:60;if(c.superPurify){let selfDeb=x.debuffCount||0,oppGuard=x.oppGuard||0;if(selfDeb>=3)return 57;if(oppGuard>=3)return 55;if(selfDeb>=1)return 53;if(oppGuard>=1)return 50;return 5}if(c.purify)return x.debuff?(x.debuffCount<=2?56:54):5;if(c.drawThree)return 50;if(c.swapHand){let myLen=this.h.ai.length,oppLen=x.oppHand;if(myLen<=2&&oppLen>=4)return 45;if(myLen<oppLen)return 40;return 3}if(c.isBlack)return 10;if(c.isWhite)return 15;if(!this.aiDefendEligible(c,top,x))return 0;return 20+(4-c.value)*5}
    aiDefendPriority(c,top){let x=this.aiContext(),v=c.value;if(c.isItemCard)return this.baseAIDefendPriority(c,top,x);let p=this.baseAIDefendPriority(c,top,x);if(x.name==='Ryan'){if(v===0&&x.hpPct<=33)return 85;if(v===3&&this.effective(top)==='RED')return 72}if(x.name==='Leon'){if(v===0&&x.hpPct<=33)return 85;if(v===1&&x.oppBurn<4)return 55}if(x.name==='Chan'){if(v===0)return 85;if(v===2)return 55;if(v===3)return 45}if(x.name==='Saiki'){if(v===0)return 85;if(v===2&&x.oppBleed)return 60;if(v===3)return 50}if(x.name==='Blaze'){if(v===0&&x.burn>=3)return 80;if(v===3&&x.burn>=2)return 68;if(v===1&&x.burn>=1)return 58;if(v===0&&x.burn<=1)return 55;if(v===2)return 45}if(x.name==='Serenity'){let bt=x.hpPct<30;if(v===0)return 80;if(v===2&&x.oppBleed)return 62;if(v===3&&bt)return 58;if(v===1&&bt)return 55}if(x.name==='Moze'){if(v===0)return 85;if(v===3&&x.guard)return 68;if(v===2&&x.guard)return 62;if(v===1)return 50}if(x.name==='Knight'){let cc=x.chaosCount||0;if(v===0&&cc>=4)return 88;if(v===0)return 80;if(v===3&&x.chaos_red)return 65;if(v===2&&x.chaos_blue)return 62;if(v===1&&x.chaos_yellow)return 58;if(v===1)return 50;if(v===2)return 45;if(v===3)return 42}return p}
    chooseAIDefendIndex(top,atk){let x=this.aiContext(),best=-1,pri=-1;for(let i=0;i<this.h.ai.length;i++){let c=this.h.ai[i];if(!this.aiDefendEligible(c,top,x))continue;if(this.s.ai.frozen&&this.effective(atk)==='BLUE')continue;let p=this.aiDefendPriority(c,top);if(p>pri){pri=p;best=i}}return best}
    heal(x,n,kind='heal'){if(n<=0)return;x.hp=Math.min(x.maxHp,x.hp+n);if(this.name(x)==='Serenity')x.bloodthirst=x.hp<30;let w=x===this.s.player?'player':'ai';this.emit('heal',`+${n}[${kind==='drain'?'吸血':kind==='passive'?'被动':'生命'}]`,null,{who:w,amount:n,kind});if(kind!=='drain'&&this.name(x)==='Serenity'&&x.hp>=30){x.hp=Math.min(x.maxHp,x.hp+1);this.emit('heal','+1[被动]',null,{who:w,amount:1,kind:'passive'})}}
    freeze(x){if(this.name(x)!=='Serenity'){x.frozen=true;let w=x===this.s.player?'player':'ai';this.emit('buff','[冷冻]',null,{who:w,kind:'freeze',stacks:1})}}
    burn(x,n){if(n>0&&this.name(x)!=='Leon'){let prev=x.burn;x.burn=Math.min(4,x.burn+n);let w=x===this.s.player?'player':'ai';this.emit('buff',`+${n}[灼烧]`,null,{who:w,kind:'burn',stacks:x.burn})}}
    bleed(x,n){if(n>0){x.bleed=Math.min(2,x.bleed+n);let w=x===this.s.player?'player':'ai';this.emit('buff',`+${n}[流血]`,null,{who:w,kind:'bleed',stacks:x.bleed})}}
    applySaikiPassive(attacker,target,card){if(this.name(attacker)==='Saiki'&&this.effective(card)==='YELLOW')this.bleed(target,1)}
    clearDebuffs(x){x.burn=0;x.bleed=0;x.frozen=false}
    rememberAttackDebuffs(owner){let old=this.s.attackDebuffSnapshot;if(old&&old.owner===owner)return;let x=this.s[owner];this.s.attackDebuffSnapshot={owner,burn:x.burn,bleed:x.bleed,frozen:x.frozen}}
    cancelAttackDebuffs(owner,reflect=false){let snap=this.s.attackDebuffSnapshot;if(!snap||snap.owner!==owner)return;let x=this.s[owner],attackerKey=owner==='player'?(this.s.is1v2&&this.s.atkOwner&&this.s.atkOwner!=='player'?this.s.atkOwner:'ai'):'player',attacker=this.s[attackerKey],burn=Math.max(0,x.burn-snap.burn),bleed=Math.max(0,x.bleed-snap.bleed),froze=!snap.frozen&&x.frozen;x.burn=snap.burn;x.bleed=snap.bleed;x.frozen=snap.frozen;if(reflect){this.burn(attacker,burn);this.bleed(attacker,bleed);if(froze)this.freeze(attacker)}}
    hurt(x,n,bleed=false){x.hp=Math.max(0,x.hp-n);x.alive=x.hp>0;if(this.name(x)==='Serenity')x.bloodthirst=x.hp<30;if(n>0){let w=x===this.s.player?'player':'ai';this.emit('hurt',`-${n}[${bleed?'流血':'伤害'}]`,null,{who:w,amount:n,bleed})}}
    chooseMozeGuardUse(guard,damage,hp){if(damage>=hp)return Math.min(guard,damage);if(damage<=2)return 0;if(guard>=3&&damage>=5)return Math.min(guard,damage);if(guard>=2&&damage>=4)return Math.min(guard,damage);if(hp<=30)return Math.min(guard,damage);return 0}
    askGuard(d,bleed=0){this.s.pendingGuardDamage=Math.max(0,d);this.s.pendingGuardBleed=bleed;this.s.pendingDefenseDamage=Math.max(0,d);this.s.pendingDialog='guard';this.s.phase='GUARD_CHOICE';this.s.busy=false}
    deferSettlement(kind,damage,bleed=0){this.s.pendingDefenseDamage=Math.max(0,damage);this.s.busy=true;this.pendingSettlement={kind,damage:Math.max(0,damage),bleed:Math.max(0,bleed),afterEventId:this.ver}}
    acknowledgeEvents(through){this.events=this.events.filter(e=>(e.id||0)>through);let bridge=this.s.pendingAIBridge;if(bridge&&through>=bridge.afterEventId){this.s.pendingAIBridge=null;if(bridge.mode==='defense')this.later(()=>this.aiDefend(bridge.attackCard,bridge.damage),220);else this.later(()=>this.aiTurn(),220)}let continuation=this.s.pendingAIContinue;if(continuation&&through>=continuation.afterEventId){this.s.pendingAIContinue=null;this.continueAIAttack();return}let p=this.pendingSettlement;if(!p||through<p.afterEventId)return;this.pendingSettlement=null;this.s.pendingDefenseDamage=0;if(p.kind==='PLAYER_ATTACK'){let forceEnd=!!this.s.forceEndPlayerTurn;this.s.forceEndPlayerTurn=false;let dmg=p.damage;if(this.s.ai.guard>0&&dmg>0){let q=this.chooseMozeGuardUse(this.s.ai.guard,dmg,this.s.ai.hp);this.s.ai.guard-=q;dmg-=q;if(q)this.emit('desc',`${this.s.ai.name}消耗${q}层[守护]，减免${q}点伤害`)}this.hurt(this.s.ai,dmg);if(p.bleed>0)this.hurt(this.s.ai,p.bleed,true);this.resolveSerenityHalf();this.afterAttack();if(forceEnd)this.startAITurn();this.check();return}let forceEnd=!!this.s.forceEndAITurn;this.s.forceEndAITurn=false;this.hurt(this.s.player,p.damage);if(p.bleed>0)this.hurt(this.s.player,p.bleed,true);this.resolveSerenityHalf();this._grantChaosIfKnight('ai');if(forceEnd)this.endAi();else this.continueAIAttack()}
    continueAIAttack(){if(!this.s)return;if(!this.s.player.alive||!this.s.ai.alive){this.check();return}this.s.phase='AI_TURN';this.s.busy=true;this.s.pendingAttack=null;this.s.pendingDefenseDamage=0;this.s.attackDebuffSnapshot=null;this.s.atkCard=this.s.defCard=null;this.s.atkOwner=this.s.defOwner=null;this.s.revealCards=[];this.later(()=>this.aiTurn(),220);return this.check()}
    resolveSerenityHalf(){let key=this.s.serenityHalfTarget;if(!key)return;let x=this.s[key],before=x.hp;x.hp=Math.ceil(x.hp/2);x.alive=x.hp>0;this.s.serenityHalfTarget=null;this.emit('desc',`Serenity 0牌：攻防结束，${key==='player'?'玩家':'AI'}生命减半（-${before-x.hp}）`)}
    chooseGuard(stacks){let incoming=this.s.pendingGuardDamage||0,use=Math.max(0,Math.min(stacks||0,this.s.player.guard,incoming)),remaining=Math.max(0,incoming-use),bleed=this.s.pendingGuardBleed||0,defCard=this.s.defCard,bleedActive=defCard&&defCard.isNumberCard&&defCard.value<=3?bleed:0;this.s.player.guard-=use;this.s.pendingDialog=null;this.s.pendingGuardDamage=0;this.s.pendingGuardBleed=0;this.s.phase='AI_TURN';this.emit('desc',`消耗${use}层[守护]，减免${use}点[伤害]，剩余${remaining}点待结算`);this.deferSettlement('AI_ATTACK',remaining,bleedActive);return this.check()}
    clean(x,all=false,kind=null){if(all){x.burn=0;x.bleed=0;x.frozen=false;x.guard=0;x.chaos_red=false;x.chaos_yellow=false;x.chaos_blue=false;x.chaos_green=false}else if(kind==='burn'&&x.burn)x.burn--;else if(kind==='bleed'&&x.bleed)x.bleed--;else if(kind==='freeze')x.frozen=false;else if(x.burn)x.burn--;else if(x.bleed)x.bleed--;else x.frozen=false}
    chooseSuperPurifyTarget(target){this.s.pendingDialog=null;let ch=this.s[target];if(!ch||!ch.alive)throw Error('目标已出局');this.clean(ch,true);let label=target==='player'?'玩家':(this.s.is1v2&&target==='ai2'?'AI2':'AI');this.emit('desc','超级净化：清除'+label+'所有buff与debuff');return this.state()}
    turnStart(w){let x=this.s[w];if(this.name(x)==='Ryan')this.heal(x,1);if(this.name(x)==='Chan')this.draw(w,1);if(this.name(x)==='Serenity')x.bloodthirst=x.hp<30;if(this.name(x)==='Knight'){let had=[x.chaos_red?'红':'',x.chaos_yellow?'黄':'',x.chaos_blue?'蓝':'',x.chaos_green?'绿':''].filter(Boolean).join('');x.chaos_red=false;x.chaos_yellow=false;x.chaos_blue=false;x.chaos_green=false;if(had)this.emit('desc',x.name+'的混沌['+had+']已清除')}}
    legal(c,def=false){let t=this.s.discardTop,tc=t.chosenColor||t.color,cc=c.chosenColor||c.color;if(c.isItemCard)return true;if(def&&c.value>3)return false;return c.isWhite||tc===cc||t.value===c.value}
    select(i){if(!this.h.player[i])throw Error('无效卡牌');if(this.s.phase==='PLAYER_DISCARD'){let a=this.s.selectedCards||[],p=a.indexOf(i);if(this.s.mayDiscardAfterSkill)a=p>=0?[]:[i];else if(p>=0)a.splice(p,1);else a.push(i);this.s.selectedCards=a;this.s.selectedCard=a.length?a[0]:-1}else this.s.selectedCard=this.s.selectedCard===i?-1:i;return this.state()}
    itemKind(c){if(c.swapHand)return'swap';if(c.drawThree)return'drawThree';if(c.drawTwo)return'drawTwo';if(c.potion)return'potion';if(c.superPurify)return'superPurify';if(c.purify)return'purify';if(c.shuffleToDeck)return'shuffle';return'wild'}
    itemEffectDesc(c,who){let actor=who==='player'?'玩家':who==='ai2'?'AI2':'AI',kind=this.itemKind(c);if(kind==='swap')return`${actor}立即交换双方手牌，随后使用交换后的手牌继续搭桥`;if(kind==='drawThree')return`${actor}立即抽3张牌，然后继续搭桥`;if(kind==='drawTwo')return`${actor}立即抽2张牌，然后继续搭桥`;if(kind==='potion')return`${actor}立即恢复5点生命，然后继续搭桥`;if(kind==='superPurify')return`${actor}选择目标，清除其全部buff与debuff，然后继续搭桥`;if(kind==='purify')return`${actor}立即净化1层debuff，然后继续搭桥`;if(kind==='shuffle')return`${actor}立即洗回弃牌库，然后继续搭桥`;return`${actor}指定颜色后继续搭桥`}
    useItem(c,owner,target,w){if(c.potion)this.heal(owner,5);if(c.drawThree)this.draw(w,3,true);if(c.drawTwo)this.draw(w,2,true);if(c.purify&&w==='player'&&(owner.burn||owner.bleed||owner.frozen)){this.s.pendingDialog='purify'}else if(c.purify)this.clean(owner);if(c.superPurify&&w==='player'){this.s.pendingDialog='superPurify'}else if(c.superPurify){let ownerDeb=owner.burn+owner.bleed+(owner.frozen?1:0),targetGuard=target?target.guard:0;if(targetGuard>=2&&ownerDeb<2)this.clean(target,true);else this.clean(owner,true);}if(c.swapHand)[this.h.player,this.h.ai]=[this.h.ai,this.h.player];      if(c.shuffleToDeck){this._shuffleDiscardIntoDeck();this.emit('desc','弃牌库已洗回牌堆')}}
    effect(n,v,c,a,t){
      let d=0,skip=false,unblock=false,owner=a===this.s.player?'player':(this.s.is1v2&&a===this.s.ai2?'ai2':'ai'),target=owner==='player'?this._who(t):'player';
      const burn=q=>this.burn(t,q),bleed=q=>this.bleed(t,q),guard=q=>a.guard=Math.min(5,a.guard+q),takeReveal=label=>{let r=this.reveal(label);if(r)this.h[owner].push(r);return r};
      if(n==='Ryan'){
        if(v===1)d=4;
        if(v===2){d=3;this.heal(a,1)}
        if(v===3){this.heal(a,1);this.draw(owner,1,true);skip=true;if(owner==='player')this.s.mayDiscardAfterSkill=true}
        if(v===4){let r=takeReveal('Ryan 4牌判定');if(r&&(r.isBlack||r.isWhite||this.effective(r)==='GREEN')){this.heal(a,1);d=4}}
        if(v===5)skip=true;
        if(v===6){d=4;this.clearDebuffs(a);this.draw(owner,1,true)}
        if(v===7)d=Math.ceil(this.h[owner].filter(x=>x.isNumberCard).reduce((q,x)=>q+x.value,0)/2);
        if(v===0){this.heal(a,4);this.clearDebuffs(a);let cards=[];for(let i=0;i<2&&this.deck.length;i++){let r=this.deck.pop();cards.push(r);this.h[owner].push(r);this.emit('reveal',`Ryan 0牌公示第${i+1}张`,r)}this.s.revealCards=cp(cards);d=cards.reduce((sum,x)=>sum+(x.isNumberCard?x.value:4),0)}
      }
      if(n==='Leon'){
        if(v===1){burn(2);skip=true}if(v===2)d=4;if(v===3){d=3;burn(1)}if(v===4){d=5;skip=!!t.burn}if(v===5)d=4+(t.burn?2:0);
        if(v===6){let r=takeReveal('Leon 6牌判定');if(r&&r.isNumberCard&&r.value>=1&&r.value<=7)d=r.value;else{this.draw(owner,1,true);burn(2);skip=true}}
        if(v===7){d=6;burn(2);let oh=this.h[target];if(oh.length){let dropped=oh.splice(Math.floor(Math.random()*oh.length),1)[0];this.s.revealCards=[cp(dropped)];this.emit('reveal','Leon 7牌弃掉目标手牌',dropped,{who:target})}}
        if(v===0){d=7;burn(1);unblock=true;let oh=this.h[target],dc=Math.min(2,oh.length);for(let i=0;i<dc;i++)oh.splice(Math.floor(Math.random()*oh.length),1);this.hurt(a,2)}
      }
      if(n==='Chan'){
        if(v===1){d=1;this.freeze(t);skip=true}if(v===2)d=4;if(v===3){d=2;this.draw(owner,1,true)}if(v===4){d=2;skip=true}
        if(v===5){this.hurt(a,2);let cards=[];for(let i=0;i<5&&this.deck.length;i++)cards.push(this.deck.pop());cards.sort((x,y)=>{let rank=z=>z.isBlack?4:z.isItemCard?3:z.value===0?2:1;return rank(y)-rank(x)||(y.value||0)-(x.value||0)});for(let i=cards.length-1;i>=0;i--)this.deck.push(cards[i]);this.draw(owner,2,true);skip=true}
        if(v===6){let r=takeReveal('Chan 6牌判定');d=5;skip=!!r&&(r.isBlack||r.isWhite||this.effective(r)==='BLUE')}if(v===7)d=6;if(v===0){d=7;this.freeze(t);this.draw(owner,1,true)}
      }
      if(n==='Saiki'){
        if(v===1)d=4;if(v===2){d=3;this.heal(a,1)}if(v===3)d=2;if(v===4){d=5;unblock=!!t.bleed}
        if(v===5){if(a.hp<=20){this.heal(a,4);skip=true}else if(a.hp<=50){d=4;skip=true}else{d=4;let oh=this.h[target];if(oh.length){let drawn=oh.splice(Math.floor(Math.random()*oh.length),1)[0];this.h[owner].push(drawn);this.s.revealCards=[cp(drawn)];this.emit('reveal','Saiki 5牌抽取对手手牌',drawn,{who:target})}}}
        if(v===7){d=2+2*t.bleed;this.heal(a,d)}if(v===0){let totalBleed=this.s.is1v2?this.s.player.bleed+this.s.ai.bleed+this.s.ai2.bleed:a.bleed+t.bleed;let oldBleed=t.bleed;bleed(1);d=1+3*oldBleed;this.heal(a,totalBleed)}
      }
      if(n==='Blaze'){
        let hadBurn=a.burn>0;if(v===1)d=4;if(v===2){d=2;unblock=true;a.burn=Math.min(4,a.burn+2)}if(v===3){d=3;a.burn=Math.min(4,a.burn+1);burn(1)}if(v===4){d=0;skip=true}
        if(v===5){a.burn=Math.min(4,a.burn+1);d=2*a.burn;hadBurn=true}if(v===6){this.heal(a,Math.ceil(1.5*a.burn));a.burn=0;burn(1);skip=true}if(v===7){a.burn=Math.min(4,a.burn+2);burn(2);let fieldBurn=this.s.is1v2?this.s.player.burn+this.s.ai.burn+this.s.ai2.burn:a.burn+t.burn;d=Math.ceil(1.5*fieldBurn);hadBurn=true}if(v===0){d=6;unblock=true;burn(2)}if(d&&hadBurn&&v!==0)d++
      }
      if(n==='Serenity'){
        let bt=a.hp<30;if(v===1){d=3;skip=bt}if(v===2)d=bt?5:3;if(v===3){d=2;this.heal(a,2)}if(v===4){d=5;if(bt)bleed(1)}
        if(v===5){let r=this.reveal('Serenity 5牌判定');if(r&&['YELLOW','GREEN'].includes(this.effective(r))){this.heal(a,4);skip=true}else d=5}
        if(v===6){d=6;unblock=bt}if(v===7){d=5;unblock=true;if(!bt)this.hurt(a,2);if(this.s.is1v2){let aoeTarget=owner==='player'?(t===this.s.ai?'ai2':'ai'):(owner==='ai'?'ai2':'ai');if(this.s[aoeTarget]&&this.s[aoeTarget].alive)this.hurt(this.s[aoeTarget],5)}}
        if(v===0){let own=this.h[owner],bonus=Math.min(9,own.length*3);this.heal(a,1+bonus);own.splice(0,own.length);if(bt){let opp=this.h[target],count=opp.length;opp.splice(0,opp.length);this.draw(target,Math.max(0,count-1),true)}this.draw(owner,4,true);skip=true}
      }
      if(n==='Moze'){
        if(v===1)d=3;if(v===2){d=2;guard(this.effective(c)==='GREEN'?2:1)}if(v===3){d=1;this.heal(a,1);guard(1)}if(v===4)skip=true;if(v===5){d=4;guard(1)}if(v===6){d=2+a.guard;unblock=!a.guard}if(v===7){let q=a.burn+a.bleed+(a.frozen?1:0);this.clearDebuffs(a);d=3+q}if(v===0){guard(3);d=5;this.draw(owner,1,true)}
      }
      if(n==='Knight'){
        let cr=a.chaos_red,cy=a.chaos_yellow,cb=a.chaos_blue,cg=a.chaos_green,chaosCount=[cr,cy,cb,cg].filter(Boolean).length;
        if(v===1){d=1;unblock=true;if(cg){this.heal(a,1);guard(1)}if(cr)burn(2);if(cb)this.freeze(t);if(cy)bleed(1)}
        if(v===2)d=4;
        if(v===3){d=3;if(cg&&cy)this.heal(a,3)}
        if(v===4){let r=takeReveal('Knight 4牌判定');if(r){let num=r.isNumberCard&&r.value>=1&&r.value<=7;if(num&&r.value<4)d=4;else d=6;if(cb)this.h[owner].push(r);else this.discardToBottom(r)}}
        if(v===5){d=5;if(cr)unblock=true}
        if(v===6){d=2;guard(2);if(cg)guard(2)}
        if(v===7){d=4+chaosCount*2;a.chaos_red=false;a.chaos_yellow=false;a.chaos_blue=false;a.chaos_green=false}
        if(v===0){
          if(chaosCount>=4){d=8;unblock=true;if(this.s.is1v2){let keys=owner==='player'?['ai','ai2']:['player'];for(const k of keys)if(this.s[k]&&this.s[k].alive)this.hurt(this.s[k],8)}}
          else{a.chaos_red=true;a.chaos_yellow=true;a.chaos_blue=true;a.chaos_green=true;d=6}
        }
      }
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
      this.applySaikiPassive(this.s.player,this.s.ai,c);
      if(c.isItemCard){this.emit('itemEffect',this.itemEffectDesc(c,'player'),c,{effect:this.itemKind(c),who:'player'});this.useItem(c,this.s.player,this.s.ai,'player');return this.check()}
      if(who==='Ryan'&&c.value===5)return this.startRyanFive(c);
      if(who==='Saiki'&&c.value===6)return this.startNumberJudge('Saiki',c);
      if(who==='Moze'&&c.value===4)return this.startNumberJudge('Moze',c);
      if(who==='Chan'&&c.value===5)return this.startChanFive();
      if(this.opponentChoiceSkill(who,c.value)){let p={name:who,value:c.value,attackCard:cp(c)};this.s.pendingOpponentSkill=p;this.s.selectedAICard=-1;if(!this.h.ai.length)return this.opponentEmpty(p);this.s.phase='OPPONENT_CARD_CHOICE';this.s.busy=false;this.emit('desc',`${who} ${c.value}牌：请选择对手一张手牌并确认`,c);return this.state()}
      let r=this.effect(who,c.value,c,this.s.player,this.s.ai);
      this.s.pendingAttack={damage:r.d,unblock:r.unblock};
      this.s.defenseSkipped=!!(r.skip||r.unblock||r.d<=0);
      this.emit('desc',`${this.s.player.name}：${r.d}点伤害${this.s.defenseSkipped?'，跳过防御':''}`,c);
      if(r.d&&!r.skip&&!r.unblock){this.s.phase='AI_DEFEND';this.later(()=>this.aiDefend(c,r.d))}
      else{this.hurt(this.s.ai,r.d);this.s.phase='AI_DEFEND';this.s.busy=true;this.later(()=>{this.afterAttack();this.check()},1700)}
      return this.check()
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
      this.discardToBottom(second);
      this.s.revealCards=[cp(second)];
      this.emit('reveal',`Ryan 5牌追加${this.cardText(second)}并置于弃牌库底`,second,{who:'player'});
      let amount=chooseDamage?Math.ceil(second.value*1.5):second.value;
      if(chooseDamage&&amount>0){
        this.s.pendingAttack={damage:amount,unblock:false};
        this.s.phase='AI_DEFEND';
        this.s.busy=true;
        this.emit('desc',`Ryan 5牌选择进攻：造成${amount}点伤害（牌面值1.5倍，向上取整）`,second);
        this.later(()=>this.aiDefend(second,amount),1800);
      }else{
        if(!chooseDamage)this.heal(this.s.player,amount);
        this.s.pendingAttack=null;
        this.s.phase='AI_DEFEND';
        this.s.busy=true;
        this.emit('desc',chooseDamage?'Ryan 5牌追加0：本次进攻没有伤害':`Ryan 5牌选择恢复：恢复${amount}点生命`,second);
        this.later(()=>{this.afterAttack();this.check()},1700);
      }
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
      this.setDiscardTop(second);
      this.s.revealCards=[cp(second)];
      this.emit('reveal',`${pending.type} 数字判定：${this.cardText(second)}`,second,{who:'player'});
      if(pending.type==='Moze'){
        this.s.player.guard=Math.min(5,this.s.player.guard+second.value);
        this.emit('desc',`Moze 4牌：弃掉${this.cardText(second)}，获得${second.value}层守护并跳过防御`,second);
        this.s.phase='AI_DEFEND';this.s.busy=true;
        this.later(()=>{this.afterAttack();this.check()},1700);
        return this.check()
      }
      let judgeTarget=this.s.is1v2?this.s[this.s.attackTarget||'ai']:this.s.ai;if(this.effective(second)==='YELLOW')this.bleed(judgeTarget,1);
      let damage=Math.ceil(second.value*1.5);
      this.s.pendingAttack={damage,unblock:false};
      this.emit('desc',`Saiki 6牌：${this.cardText(second)}造成${damage}点伤害${this.effective(second)==='YELLOW'?'并施加1层流血':''}`,second);
      if(damage>0){this.s.phase='AI_DEFEND';this.s.busy=true;this.later(()=>this.aiDefend(second,damage),1800)}
      else{this.s.phase='AI_DEFEND';this.s.busy=true;this.later(()=>{this.afterAttack();this.check()},1500)}
      return this.check()
    }
    startChanFive(){this.hurt(this.s.player,2);let cards=[];for(let i=0;i<5&&this.deck.length;i++)cards.push(this.deck.pop());this.s.chanFiveCards=cp(cards);this.s.phase='CHAN_FIVE_REORDER';this.s.busy=false;this.emit('desc',`Chan 5牌：消耗2点生命，查看牌库顶${cards.length}张并排序`);if(!cards.length){this.s.phase='AI_DEFEND';this.s.busy=true;this.later(()=>{this.afterAttack();this.check()},1200)}return this.check()}
    finishChanFive(order){let cards=this.s.chanFiveCards;if(!cards||!cards.length)throw Error('当前没有需要排序的牌');let ids=String(order||'').split(',').map(Number);if(ids.length!==cards.length||new Set(ids).size!==cards.length||ids.some(i=>i<0||i>=cards.length))ids=cards.map((_,i)=>i);let arranged=ids.map(i=>cards[i]);for(let i=arranged.length-1;i>=0;i--)this.deck.push(arranged[i]);this.s.chanFiveCards=null;this.draw('player',2,true);this.emit('desc','Chan 5牌：排序完成，抽取新的牌库顶2张牌并跳过防御');this.s.phase='AI_DEFEND';this.s.busy=true;this.later(()=>{this.afterAttack();this.check()},1700);return this.check()}
    chooseOpponentCard(i){let targetKey=this.s.is1v2?(this.s.attackTarget||'ai'):'ai',hand=this.h[targetKey];if(this.s.phase!=='OPPONENT_CARD_CHOICE')throw Error('当前不能选择对手手牌');if(this.s.pendingLeonZeroDiscard){let combined=[];for(const key of ['ai','ai2'])if(this.s[key]&&this.s[key].alive)for(let j=0;j<this.h[key].length;j++)combined.push({key,index:j});if(i<0||i>=combined.length)throw Error('无效的对手手牌');this.s.selectedAICard=this.s.selectedAICard===i?-1:i;return this.state()}if(!this.s.pendingOpponentSkill)throw Error('当前不能选择对手手牌');if(i<0||!hand[i])throw Error('无效的对手手牌');this.s.selectedAICard=this.s.selectedAICard===i?-1:i;return this.state()}
    confirmOpponentCard(){let targetKey=this.s.is1v2?(this.s.attackTarget||'ai'):'ai',target=this.s[targetKey],hand=this.h[targetKey],i=this.s.selectedAICard,p=this.s.pendingOpponentSkill;if(!p||i<0||!hand[i])throw Error('请先选择一张对手手牌');let chosen=hand.splice(i,1)[0];this.s.selectedAICard=-1;this.s.revealCards=[cp(chosen)];this.emit('reveal',`${p.name} ${p.value}牌抽取对手手牌判定`,chosen,{who:targetKey});let d=0,skip=false,unblock=false,keep=false;
      if(p.name==='Chan'&&p.value===4){this.s.pendingOpponentSkill=null;this.s.chanFourSwapMode=true;this.s.chanFourSwapDrawn=cp(chosen);this.s.phase='PLAYER_SEVEN_CHOICE';this.s.selectedCard=-1;this.emit('desc','Chan 4牌：选择自己一张手牌交换，或弃掉抽到的牌并造成2点伤害');return this.state()}
      if(p.name==='Chan'&&p.value===7){this.s.chanSevenKeepMode=true;this.s.chanSevenChosenCard=cp(chosen);this.s.phase='PLAYER_SEVEN_CHOICE';this.s.busy=false;this.emit('desc','Chan 7牌：选择将抽到的牌加入手牌或弃掉');return this.state()}
      if(p.name==='Saiki'){this.s.saikiThreeDrawn=cp(chosen);this.s.phase='SAIKI_THREE_CHOICE';this.s.busy=false;this.emit('desc','Saiki 3牌：选择将抽到的牌加入手牌或弃掉');return this.state()}
      if(p.name==='Blaze'){if(chosen.isItemCard)d=4;else if(chosen.value===0){this.burn(this.s.player,1);this.burn(target,1);keep=true;skip=true}else d=chosen.value;if(d)d+=this.s.player.burn?1:0;this.emit('desc',`Blaze 4牌判定：${d}点伤害${skip?'，双方灼烧+1并跳过防御':''}`)}
      if(p.name==='Moze'){keep=true;if(chosen.isBlack||chosen.isWhite||this.effective(chosen)==='GREEN')d=4;else{this.heal(this.s.player,2);this.s.player.guard=Math.min(5,this.s.player.guard+1);skip=true}this.emit('desc',d?'Moze 5牌判定：4点伤害':'Moze 5牌判定：恢复2点并获得1层守护')}
      if(keep)this.h.player.push(chosen);return this.finishOpponentAttack(p,d,skip,unblock)}
    chanSevenChoice(keep){let p=this.s.pendingOpponentSkill,c=this.s.chanSevenChosenCard;if(!p||!this.s.chanSevenKeepMode||!c)throw Error('当前没有待处理的 Chan 7牌');if(keep)this.h.player.push(c);this.s.chanSevenKeepMode=false;this.s.chanSevenChosenCard=null;this.emit('desc',`Chan 7牌：${keep?'加入手牌':'弃掉'}${this.cardText(c)}`);return this.finishOpponentAttack(p,6,false,false)}
    saikiThreeChoice(keep){let p=this.s.pendingOpponentSkill,c=this.s.saikiThreeDrawn;if(!p||!c)throw Error('当前没有待处理的 Saiki 3牌');if(keep)this.h.player.push(c);this.s.saikiThreeDrawn=null;this.emit('desc',`Saiki 3牌：${keep?'加入手牌':'弃掉'}${this.cardText(c)}，造成2点伤害${this.effective(p.attackCard)==='YELLOW'?'并施加1层流血':''}`);return this.finishOpponentAttack(p,2,false,false)}
    chanFourSwap(){let targetKey=this.s.is1v2?(this.s.attackTarget||'ai'):'ai',i=this.s.selectedCard,drawn=this.s.chanFourSwapDrawn;if(!this.s.chanFourSwapMode||!drawn)throw Error('当前没有可交换的牌');if(i<0||!this.h.player[i])throw Error('请选择自己的一张手牌用于交换');let own=this.h.player.splice(i,1)[0];this.h[targetKey].push(own);this.h.player.push(drawn);this.s.selectedCard=-1;this.s.chanFourSwapMode=false;this.s.chanFourSwapDrawn=null;this.emit('desc',`Chan 4牌：${this.cardText(drawn)} 与 ${this.cardText(own)} 完成交换`);this.afterAttack();return this.check()}
    chanFourDiscard(){let targetKey=this.s.is1v2?(this.s.attackTarget||'ai'):'ai',drawn=this.s.chanFourSwapDrawn;if(!this.s.chanFourSwapMode||!drawn)throw Error('当前没有可弃掉的牌');this.s.chanFourSwapMode=false;this.s.chanFourSwapDrawn=null;this.hurt(this.s[targetKey],2);this.emit('desc',`Chan 4牌：弃掉${this.cardText(drawn)}，造成2点伤害并跳过防御`);this.s.phase='AI_DEFEND';this.s.busy=true;this.later(()=>{this.afterAttack();this.check()},1700);return this.check()}
    aiDefend(atk,d){let frozen=this.s.ai.frozen&&this.effective(atk)==='BLUE',chosen=frozen?null:this.chooseAIDefend(this.s.discardTop),i=chosen?this.h.ai.indexOf(chosen):-1;if(i>=0){let top=this.s.discardTop,c=this.h.ai.splice(i,1)[0];if(c.isBlack)c.chosenColor=this.h.ai.find(q=>!q.isBlack&&!q.isWhite&&q.value<=3)?.color||this.chooseAIColor();else this.setAIWildColor(c,top,false);this.s.defCard=cp(c);this.s.defOwner='ai';this.setDiscardTop(c);if(c.isItemCard){this.emit('aiDefend','AI打出搭桥牌并立即结算道具效果',c);this.announceAIColor(c);let kind=this.itemKind(c);this.emit('itemEffect',this.itemEffectDesc(c,'ai'),c,{effect:kind,who:'ai'});this.useItem(c,this.s.ai,this.s.player,'ai');this.s.pendingAIBridge={mode:'defense',afterEventId:this.ver,attackCard:cp(atk),damage:d};return this.check()}let n=this.name(this.s.ai),v=c.value;this.emit('aiDefend',`AI打出${n} ${v}牌，触发防御技能`,c);this.announceAIColor(c);let judged=this.defenseJudge('ai',c,d),b=0,remaining,desc='';
      if(judged){remaining=Math.max(0,judged.remaining);desc='AI完成防御判定'}
      else if(n==='Ryan'&&v===1){b=Math.ceil(d/2);remaining=Math.max(0,d-b);desc=`Ryan 1牌：格挡${b}点`}
      else if(n==='Ryan'&&v===2){this.hurt(this.s.player,2);this.heal(this.s.ai,2);remaining=d;desc='Ryan 2牌：反击2点并恢复2点生命'}
      else if(n==='Ryan'&&v===3){if(this.effective(atk)==='RED'){remaining=0;desc='Ryan 3牌：无视红色攻击'}else{this.heal(this.s.ai,3);remaining=d;desc='Ryan 3牌：恢复3点生命'}}
      else if(n==='Ryan'&&v===0){this.cancelAttackDebuffs('ai',false);this.clearDebuffs(this.s.ai);this.heal(this.s.ai,3);remaining=0;desc='Ryan 0牌：清除debuff、免疫伤害并恢复3点生命'}
      else if(n==='Leon'&&v===1){this.burn(this.s.player,1);this.heal(this.s.ai,2);remaining=d;desc='Leon 1牌：施加1层灼烧+恢复2点生命'}
      else if(n==='Leon'&&v===2){let cd=Math.ceil(d/2);this.hurt(this.s.player,cd);this.draw('ai',1,true);remaining=d;desc=`Leon 2牌：反击${cd}点+抽1张牌`}
      else if(n==='Leon'&&v===3){b=Math.ceil(d/2);this.draw('ai',1,true);remaining=Math.max(0,d-b);desc=`Leon 3牌：格挡${b}点+抽1张牌`}
      else if(n==='Leon'&&v===0){this.h.player.splice(0,this.h.player.length);this.hurt(this.s.player,d);this.hurt(this.s.ai,d);remaining=0;desc=`Leon 0牌：弃攻击方所有牌+双方各受${d}点伤害`}
      else if(n==='Chan'&&v===1){b=Math.ceil(d/2);remaining=Math.max(0,d-b);desc=`Chan 1牌：格挡${b}点`}
      else if(n==='Chan'&&v===2){this.hurt(this.s.player,2);this.freeze(this.s.player);remaining=d;desc='Chan 2牌：反击2点+施加冷冻'}
      else if(n==='Chan'&&v===0){let cd=Math.ceil(d/2);this.hurt(this.s.player,cd);remaining=0;this.s.forceEndPlayerTurn=true;desc=`Chan 0牌：防御所有伤害并反击${cd}点，进攻方回合结束`}
      else if(n==='Saiki'&&v===1){b=Math.min(3,d);remaining=Math.max(0,d-b);desc=`Saiki 1牌：防御至多3点`}
      else if(n==='Saiki'&&v===2){this.hurt(this.s.player,3);this.bleed(this.s.player,1);remaining=d;desc='Saiki 2牌：反击3点+1层流血'}
      else if(n==='Saiki'&&v===0){let shared=Math.ceil(d/2);this.hurt(this.s.player,shared);this.hurt(this.s.ai,shared);remaining=0;this.cancelAttackDebuffs('ai',true);desc=`Saiki 0牌：免疫debuff，双方均摊${shared}点伤害并反弹debuff`}
      else if(n==='Blaze'&&v===1){let bh=this.s.ai.burn;this.heal(this.s.ai,2+bh);this.burn(this.s.player,1);this.burn(this.s.ai,1);remaining=d;desc=`Blaze 1牌：恢复${2+bh}点+双方灼烧1`}
       else if(n==='Blaze'&&v===3){this.burn(this.s.player,2);let fb=this.s.ai.burn+this.s.player.burn+(this.s.ai2?this.s.ai2.burn:0);if(this.s.ai.burn)fb++;this.hurt(this.s.player,fb);remaining=d;desc=`Blaze 3牌：攻击方+2灼烧，反击场上灼烧${fb}点${this.s.ai.burn?'(含被动+1)':''}`}
      else if(n==='Blaze'&&v===0){this.burn(this.s.player,4);b=Math.ceil(d/2);let tb=this.s.player.burn+this.s.ai.burn+(this.s.ai2?this.s.ai2.burn:0);this.heal(this.s.ai,tb+3);remaining=Math.max(0,d-b);desc=`Blaze 0牌：进攻方+4灼烧+格挡${b}点+恢复${tb+3}点`}
      else if(n==='Serenity'&&v===1){b=Math.min(3,d);let bt=this.s.ai.hp<30;if(bt)this.heal(this.s.ai,b);remaining=Math.max(0,d-b);desc=bt?`Serenity 1牌：防御3点+恢复${b}点(嗜血)`:`Serenity 1牌：防御至多3点`}
       else if(n==='Serenity'&&v===2){this.bleed(this.s.player,1);let drain=this.s.player.bleed*2;this.heal(this.s.ai,drain,'drain');remaining=d;desc=`Serenity 2牌：1层流血+吸取${drain}点生命`}
      else if(n==='Serenity'&&v===3){b=Math.ceil(d/2);let bt=this.s.ai.hp<30;if(bt)b=Math.min(d,b+2);remaining=Math.max(0,d-b);desc=`Serenity 3牌：格挡${b}点`}
      else if(n==='Moze'&&v===1){b=Math.ceil(d/2);this.s.ai.guard=Math.min(5,this.s.ai.guard+1);remaining=Math.max(0,d-b);desc=`Moze 1牌：防御${b}点+1层守护`}
      else if(n==='Moze'&&v===2){let cd=1+Math.ceil(this.s.ai.guard/2);this.hurt(this.s.player,cd);remaining=d;desc=`Moze 2牌：反击${cd}点`}
      else if(n==='Moze'&&v===3){this.s.ai.guard=Math.min(5,this.s.ai.guard+1);this.heal(this.s.ai,Math.ceil(this.s.ai.guard/2));remaining=d;desc=`Moze 3牌：1层守护+恢复${Math.ceil(this.s.ai.guard/2)}点`}
      else if(n==='Moze'&&v===0){b=Math.ceil(d/2);this.s.ai.guard=Math.min(5,this.s.ai.guard+2);let cd=this.s.ai.guard*2;this.hurt(this.s.player,cd);remaining=Math.max(0,d-b);desc=`Moze 0牌：防御${b}点+2层守护+反击${cd}点`}
      else{b=c.isNumberCard?(c.value===1?Math.ceil(d/2):c.value===3?Math.floor(d/2):0):0;remaining=Math.max(0,d-b);desc=`AI抵消${b}点伤害，剩余${remaining}点待结算`}
      if(!judged)this.emit('desc',desc);this.deferSettlement('PLAYER_ATTACK',remaining,c.isNumberCard&&c.value<=3?this.s.ai.bleed:0)}else{this.emit('desc',frozen?'AI处于冷冻状态，无法防御蓝色攻击':'AI根据防御策略选择跳过');this.deferSettlement('PLAYER_ATTACK',d,0)}return this.check()}
    afterAttack(){let optionalDiscard=!!this.s.mayDiscardAfterSkill;if(this.s.atkOwner)this._grantChaosIfKnight(this.s.atkOwner);this.s.pendingAttack=null;this.s.pendingFiveChoice=false;this.s.fiveChoiceCard=null;this.s.pendingNumberJudge=null;this.s.attackDebuffSnapshot=null;this.s.defenseSkipped=false;this.s.phase=optionalDiscard?'PLAYER_DISCARD':'PLAYER_PLAY';this.s.busy=false;this.s.atkCard=this.s.defCard=null;this.s.atkOwner=this.s.defOwner=null;this.s.revealCards=[];if(optionalDiscard){this.s.forcedDiscard=false;this.s.selectedCard=-1;this.s.selectedCards=[]}}
    _grantChaosForCard(ch,card){if(!ch||!ch.alive||this.name(ch)!=='Knight')return;if(!card||card.isBlack||card.isWhite||card.isItemCard)return;let color=this.effective(card);if(!C.includes(color))return;let key='chaos_'+color.toLowerCase();if(ch[key])return;ch[key]=true;this.emit('desc',ch.name+'获得[混沌-'+this.colorName(color)+']',card)}_grantChaosIfKnight(who){this._grantChaosForCard(this.s[who],this.s.atkCard);let defWho=this.s.defOwner;if(defWho&&defWho!==who)this._grantChaosForCard(this.s[defWho],this.s.defCard)}
    fillHands(isPlayerPhase){let limit=this.s.handLimit;this.draw('player',Math.max(0,limit-this.h.player.length),true);this.draw('ai',Math.max(0,5-this.h.ai.length),true);if(isPlayerPhase)this.emit('desc','回合结束：双方手牌补至5张')}
    trimAI(){while(this.h.ai.length>5){let worst=0;for(let i=1;i<this.h.ai.length;i++)if(this.h.ai[i].value<this.h.ai[worst].value)worst=i;let card=this.h.ai.splice(worst,1)[0];this.emit('desc',`AI手牌超限，自动弃掉${this.cardText(card)}`)}}
    startAITurn(){this.fillHands(true);this.s.phase='AI_TURN';this.s.busy=true;this.s.activeAttacker='ai';this.s.forceEndAITurn=false;this.s.pendingAIContinue=null;this.s.atkCard=this.s.defCard=null;this.s.atkOwner=this.s.defOwner=null;this.s.selectedCards=[];this.later(()=>this.aiTurn());return this.check()}
    endTurn(){if(this.s.phase!=='PLAYER_PLAY')throw Error('当前不能结束回合');if(this.h.player.length>this.s.handLimit){this.s.forcedDiscard=true;this.s.phase='PLAYER_DISCARD';this.s.selectedCard=-1;this.s.selectedCards=[];this.emit('desc',`手牌超过${this.s.handLimit}张，请弃至不超过${this.s.handLimit}张`);return this.state()}if(this.s.player.burn){let dmg=this.s.player.burn;this.s.player.burn--;if(this.name(this.s.player)!=='Leon'){this.emit('burnSettle',`-${dmg}[灼烧]，-1[灼烧层数]`,null,{who:'player',amount:dmg});this.s.player.hp=Math.max(0,this.s.player.hp-dmg);this.s.player.alive=this.s.player.hp>0}}return this.startAITurn()}
    enterDiscard(){if(this.s.hasPlayedThisTurn)throw Error('本回合已出牌，不能再弃牌');this.s.forcedDiscard=false;this.s.phase='PLAYER_DISCARD';this.s.selectedCard=-1;this.s.selectedCards=[];return this.state()}
    confirmDiscard(){let selected=this.s.selectedCards||[];if(!selected.length)throw Error('请选择要弃掉的牌');selected.sort((a,b)=>b-a);for(const i of selected)if(this.h.player[i])this.h.player.splice(i,1);this.s.selectedCard=-1;this.s.selectedCards=[];if(this.s.mayDiscardAfterSkill){this.s.mayDiscardAfterSkill=false;this.s.phase='PLAYER_PLAY';this.emit('desc','Ryan 3牌：已完成可选弃牌');return this.state()}if(this.s.forcedDiscard&&this.h.player.length>this.s.handLimit){this.emit('desc',`仍需弃牌，手牌必须不超过${this.s.handLimit}张`);return this.state()}this.s.forcedDiscard=false;return this.startAITurn()}
    cancelDiscard(){if(this.s.forcedDiscard)throw Error(`手牌超过${this.s.handLimit}张，不能取消弃牌`);this.s.mayDiscardAfterSkill=false;this.s.phase='PLAYER_PLAY';this.s.selectedCard=-1;this.s.selectedCards=[];return this.state()}
    aiSpecialEffect(n,v,c){let a=this.s.ai,t=this.s.player,pull=label=>{if(!this.h.player.length)return null;let card=this.h.player.splice(Math.floor(Math.random()*this.h.player.length),1)[0];this.s.revealCards=[cp(card)];this.emit('reveal',label,card,{who:'player'});return card},discard=card=>{};
      if(n==='Ryan'&&v===5){let second=this.h.ai.find(x=>x.isNumberCard);if(!second){this.emit('desc','Ryan 5牌：没有可追加的数字牌');return{d:0,skip:true,unblock:false}}this.h.ai.splice(this.h.ai.indexOf(second),1);discard(second);if(second.isWhite)second.chosenColor=this.effective(c);this.discardToBottom(second);this.s.revealCards=[cp(second)];this.emit('reveal',`Ryan 5牌追加${this.cardText(second)}并置于弃牌库底`,second,{who:'ai'});let damage=a.hp>=a.maxHp||a.hp>=t.hp;if(damage){let d=Math.max(0,Math.ceil(second.value*1.5));this.emit('desc',`Ryan AI选择造成伤害：${d}点`);return{d,skip:false,unblock:false}}this.heal(a,Math.max(0,second.value));this.emit('desc',`Ryan AI选择恢复${Math.max(0,second.value)}点生命`);return{d:0,skip:true,unblock:false}}
      if(n==='Ryan'&&v===7){let sum=this.h.ai.filter(x=>x.isNumberCard).reduce((q,x)=>q+x.value,0),d=Math.ceil(sum/2);this.emit('desc',`Ryan 7牌按当前手牌数字总和的一半造成${d}点伤害`);return{d,skip:false,unblock:false}}
      if(n==='Leon'&&v===7){this.burn(t,2);let drawn=pull('Leon 7牌随机弃掉玩家手牌');if(drawn){discard(drawn);this.emit('desc',`Leon AI弃掉${this.cardText(drawn)}`)}return{d:6,skip:false,unblock:false}}
      if(n==='Chan'&&v===4){let drawn=pull('Chan 4牌抽取玩家手牌');if(!drawn)return{d:2,skip:true,unblock:false};let swap=null;if(drawn.isItemCard||drawn.value===0){for(const x of this.h.ai)if(!x.isItemCard&&x.value!==0&&(!swap||x.value<swap.value))swap=x}else for(const x of this.h.ai)if(!x.isItemCard&&x.value!==0&&x.color===drawn.color&&x.value<drawn.value&&(!swap||x.value<swap.value))swap=x;if(swap){this.h.ai.splice(this.h.ai.indexOf(swap),1);this.h.player.push(swap);this.h.ai.push(drawn);this.emit('desc',`Chan AI保留${this.cardText(drawn)}，用${this.cardText(swap)}交换`);return{d:0,skip:true,unblock:false}}discard(drawn);this.emit('desc',`Chan AI弃掉${this.cardText(drawn)}，造成2点伤害并跳过防御`);return{d:2,skip:true,unblock:false}}
      if(n==='Chan'&&v===7){let drawn=pull('Chan 7牌抽取玩家手牌');if(drawn){let keep=drawn.isItemCard||drawn.value===0||drawn.value>=4;if(keep)this.h.ai.push(drawn);else discard(drawn);this.emit('desc',`Chan AI${keep?'保留':'弃掉'}${this.cardText(drawn)}`)}return{d:6,skip:false,unblock:false}}
      if(n==='Saiki'&&v===3){let drawn=pull('Saiki 3牌抽取玩家手牌');if(drawn){let drop=drawn.isItemCard||(drawn.value!==0&&drawn.value<=2);if(drop)discard(drawn);else this.h.ai.push(drawn);this.emit('desc',`Saiki AI${drop?'弃掉':'保留'}${this.cardText(drawn)}`)}return{d:2,skip:false,unblock:false}}
      if(n==='Saiki'&&v===5){if(a.hp<=20){this.heal(a,4);return{d:0,skip:true,unblock:false}}if(a.hp<=50)return{d:4,skip:true,unblock:false};let drawn=pull('Saiki 5牌抽取玩家手牌');if(drawn)this.h.ai.push(drawn);return{d:4,skip:false,unblock:false}}
      if(n==='Saiki'&&v===6){let judge=null;for(const x of this.h.ai)if(x.isNumberCard&&(!judge||x.value>judge.value))judge=x;if(!judge){this.emit('desc','Saiki 6牌：没有数字牌可用于判定');return{d:0,skip:true,unblock:false}}this.h.ai.splice(this.h.ai.indexOf(judge),1);discard(judge);if(judge.isWhite)judge.chosenColor=this.effective(c);this.setDiscardTop(judge);this.s.revealCards=[cp(judge)];this.emit('reveal','Saiki 6牌数字判定',judge,{who:'ai'});if(this.effective(judge)==='YELLOW')this.bleed(t,1);let d=Math.ceil(judge.value*1.5);this.emit('desc',`Saiki AI选择最高点数${this.cardText(judge)}，造成${d}点伤害${this.effective(judge)==='YELLOW'?'并施加1层流血':''}`);return{d,skip:false,unblock:false}}
      if(n==='Blaze'&&v===4){let drawn=pull('Blaze 4牌抽取玩家手牌');if(!drawn)return{d:2+(a.burn?1:0),skip:false,unblock:false};if(!drawn.isItemCard&&drawn.value===0){this.h.ai.push(drawn);this.burn(a,1);this.burn(t,1);this.emit('desc',`Blaze AI保留${this.cardText(drawn)}，双方灼烧+1并跳过防御`);return{d:0,skip:true,unblock:false}}discard(drawn);let d=(drawn.isItemCard?4:drawn.value)+(a.burn?1:0);this.emit('desc',`Blaze AI弃掉${this.cardText(drawn)}，造成${d}点伤害`);return{d,skip:false,unblock:false}}
      if(n==='Moze'&&v===4){let best=null;for(const x of this.h.ai)if(x.isNumberCard&&(!best||x.value>best.value))best=x;if(!best){this.emit('desc','Moze 4牌：没有数字牌可用于获得守护');return{d:0,skip:true,unblock:false}}this.h.ai.splice(this.h.ai.indexOf(best),1);discard(best);a.guard=Math.min(5,a.guard+best.value);this.s.revealCards=[cp(best)];this.emit('reveal','Moze 4牌守护判定',best,{who:'ai'});this.emit('desc',`Moze AI弃掉${this.cardText(best)}，获得${best.value}层[守护]`);return{d:0,skip:true,unblock:false}}
      if(n==='Moze'&&v===5){let drawn=pull('Moze 5牌抽取玩家手牌');if(!drawn)return{d:0,skip:true,unblock:false};this.h.ai.push(drawn);let hit=drawn.isBlack||drawn.isWhite||this.effective(drawn)==='GREEN';if(hit){this.emit('desc',`Moze 5牌判定${this.cardText(drawn)}：造成4点伤害`);return{d:4,skip:false,unblock:false}}this.heal(a,2);a.guard=Math.min(5,a.guard+1);this.emit('desc',`Moze 5牌判定${this.cardText(drawn)}：恢复2点并获得1层[守护]`);return{d:0,skip:true,unblock:false}}
      if(n==='Moze'&&v===7){let bonus=a.burn+a.bleed+(a.frozen?1:0);a.burn=0;a.bleed=0;a.frozen=false;this.emit('desc',`Moze AI清除${bonus}层debuff，造成${3+bonus}点伤害`);return{d:3+bonus,skip:false,unblock:false}}
      return null}
    aiTurn(){if(!this.s.aiTurnStarted){this.turnStart('ai');this.s.aiTurnStarted=true;this.s.aiHasPlayed=false}let top=this.s.discardTop,chosen=this.chooseAIPlay(top);if(!chosen){if(!this.s.aiHasPlayed&&this.h.ai.length){let count=this.h.ai.length;this.h.ai=[];this.emit('desc',`AI无牌可出，弃掉全部${count}张手牌`)}return this.later(()=>this.endAi(),700)}let i=this.h.ai.indexOf(chosen),c=this.h.ai.splice(i,1)[0];this.setAIWildColor(c,top,false);this.s.aiHasPlayed=true;this.s.atkCard=cp(c);this.s.atkOwner='ai';this.setDiscardTop(c);this.rememberAttackDebuffs('player');this.applySaikiPassive(this.s.ai,this.s.player,c);this.emit('aiPlay',`AI ${this.name(this.s.ai)} 按角色策略出牌`,c);this.announceAIColor(c);if(c.isItemCard){let kind=this.itemKind(c);this.emit('itemEffect',this.itemEffectDesc(c,'ai'),c,{effect:kind,who:'ai'});this.useItem(c,this.s.ai,this.s.player,'ai');this.s.pendingAIBridge={mode:'attack',afterEventId:this.ver,effect:kind};return this.check()}let r=this.aiSpecialEffect(this.name(this.s.ai),c.value,c)||this.effect(this.name(this.s.ai),c.value,c,this.s.ai,this.s.player);this.s.pendingAttack={damage:r.d,unblock:r.unblock};if(r.d&&!r.skip&&!r.unblock){this.s.phase='PLAYER_DEFEND';this.s.busy=false;return}if(!r.d)this.emit('desc',`AI ${this.name(this.s.ai)} 本次技能分支未造成伤害，跳过防御`,c);if(r.d&&this.s.player.guard>0){this.askGuard(r.d);return}this.hurt(this.s.player,r.d);this.s.phase='AI_TURN';this.s.busy=true;this.s.pendingAIContinue={afterEventId:this.ver};return this.check()}
    defend(skip=false){
      let d=this.s.pendingAttack.damage;
      let triggeredDefense=!skip;
      if(skip){
        this.s.hasPlayedBlackDefend=false;
        this.emit('desc',`玩家选择跳过防御，${d}点伤害待结算`);
      }else{
        let i=this.s.selectedCard,c=this.h.player[i];
        if(!c)throw Error('请选择防御牌');
        if(!this.legal(c,true))throw Error('该牌不能用于防御');
        let incomingCard=this.s.discardTop||this.s.atkCard;
        let inheritedColor=this.effective(incomingCard);
        if(this.s.player.frozen&&inheritedColor==='BLUE')throw Error('冷冻状态无法防御蓝色攻击');

        if(c.isBlack&&!c.chosenColor){this.s.needColorChoice=true;this.s.pendingDialog='color';return this.state()}

        if(c.isWhite)c.chosenColor=inheritedColor;
        this.h.player.splice(i,1);
        this.s.selectedCard=-1;
        this.s.defCard=cp(c);
        this.s.defOwner='player';
        this.setDiscardTop(c);
        this._animatedPlayerAttack=this.s.atkCard;

        // 白色道具（以及其他道具搭桥牌）只发动道具效果，随后继续防御。
        if(c.isItemCard){
          this.s.hasPlayedBlackDefend=true;
          this.s.phase='PLAYER_DEFEND';
          this.s.busy=false;
          let bridgeLabel=c.isBlack?'黑牌':c.isWhite?'白色':'道具';
          this.emit('defend',`${bridgeLabel}牌指定${this.colorName(c.chosenColor||c.color)}并搭桥，请继续选择防御牌`,c);
          if(c.isBlack)this.emit('colorChoice',`黑牌指定${this.colorName(c.chosenColor)}`,c);
          if(c.isWhite)this.emit('colorChoice',`白色道具牌自动指定${this.colorName(c.chosenColor)}`,c);
          this.emit('itemEffect',this.itemEffectDesc(c,'player'),c,{effect:this.itemKind(c),who:'player'});
          this.useItem(c,this.s.player,this.s.ai,'player');
          return this.check();
        }

        // 白色数字牌走普通数字防御流程，因此会触发角色对应数字的防御技能。
        this.s.hasPlayedBlackDefend=false;
        let n=this.name(this.s.player),v=c.value;
        this.emit('defend',`玩家打出${n} ${v}牌，触发防御技能`,c);
        let judged=this.defenseJudge('player',c,d),b=0,desc='';
        if(judged){d=Math.max(0,judged.remaining);desc='防御判定完成'}
        else if(n==='Ryan'&&v===1){b=Math.ceil(d/2);d=Math.max(0,d-b);desc=`Ryan 1牌：格挡${b}点`}
        else if(n==='Ryan'&&v===2){this.hurt(this.s.ai,2);this.heal(this.s.player,2);desc='Ryan 2牌：反击2点并恢复2点生命'}
        else if(n==='Ryan'&&v===3){if(inheritedColor==='RED'){d=0;desc='Ryan 3牌：无视红色攻击'}else{this.heal(this.s.player,3);desc='Ryan 3牌：恢复3点生命'}}
        else if(n==='Ryan'&&v===0){this.cancelAttackDebuffs('player',false);this.clearDebuffs(this.s.player);this.heal(this.s.player,3);d=0;desc='Ryan 0牌：清除debuff、免疫伤害并恢复3点生命'}
        else if(n==='Leon'&&v===1){this.burn(this.s.ai,1);this.heal(this.s.player,2);desc='Leon 1牌：施加1层灼烧+恢复2点生命'}
        else if(n==='Leon'&&v===2){let cd=Math.ceil(d/2);this.hurt(this.s.ai,cd);this.draw('player',1,true);desc=`Leon 2牌：反击${cd}点+抽1张牌`}
        else if(n==='Leon'&&v===3){b=Math.ceil(d/2);this.draw('player',1,true);d=Math.max(0,d-b);desc=`Leon 3牌：格挡${b}点+抽1张牌`}
        else if(n==='Leon'&&v===0){this.h.ai.splice(0,this.h.ai.length);this.hurt(this.s.ai,d);this.hurt(this.s.player,d);d=0;desc=`Leon 0牌：弃AI所有牌+双方各受${d}点伤害`}
        else if(n==='Chan'&&v===1){b=Math.ceil(d/2);d=Math.max(0,d-b);desc=`Chan 1牌：格挡${b}点`}
        else if(n==='Chan'&&v===2){this.hurt(this.s.ai,2);this.freeze(this.s.ai);desc='Chan 2牌：反击2点+施加冷冻'}
        else if(n==='Chan'&&v===0){let cd=Math.ceil(d/2);this.hurt(this.s.ai,cd);d=0;this.s.forceEndAITurn=true;desc=`Chan 0牌：防御所有伤害并反击${cd}点，进攻方回合结束`}
        else if(n==='Saiki'&&v===1){b=Math.min(3,d);d=Math.max(0,d-b);desc=`Saiki 1牌：防御至多3点`}
        else if(n==='Saiki'&&v===2){this.hurt(this.s.ai,3);this.bleed(this.s.ai,1);desc='Saiki 2牌：反击3点+1层流血'}
        else if(n==='Saiki'&&v===0){let shared=Math.ceil(d/2);this.hurt(this.s.ai,shared);this.hurt(this.s.player,shared);this.cancelAttackDebuffs('player',true);d=0;desc=`Saiki 0牌：免疫debuff，双方均摊${shared}点伤害并反弹debuff`}
        else if(n==='Blaze'&&v===1){let bh=this.s.player.burn;this.heal(this.s.player,2+bh);this.burn(this.s.ai,1);this.burn(this.s.player,1);desc=`Blaze 1牌：恢复${2+bh}点+双方灼烧1`}
         else if(n==='Blaze'&&v===3){this.burn(this.s.ai,2);let fb=this.s.player.burn+this.s.ai.burn+(this.s.ai2?this.s.ai2.burn:0);if(this.s.player.burn)fb++;this.hurt(this.s.ai,fb);desc=`Blaze 3牌：攻击方+2灼烧，反击场上灼烧${fb}点${this.s.player.burn?'(含被动+1)':''}`}
        else if(n==='Blaze'&&v===0){this.burn(this.s.ai,4);b=Math.ceil(d/2);let tb=this.s.player.burn+this.s.ai.burn+(this.s.ai2?this.s.ai2.burn:0);this.heal(this.s.player,tb+3);d=Math.max(0,d-b);desc=`Blaze 0牌：进攻方+4灼烧+格挡${b}点+恢复${tb+3}点`}
        else if(n==='Serenity'&&v===1){b=Math.min(3,d);let bt=this.s.player.hp<30;if(bt)this.heal(this.s.player,b);d=Math.max(0,d-b);desc=bt?`Serenity 1牌：防御3点+恢复${b}点(嗜血)`:`Serenity 1牌：防御至多3点`}
         else if(n==='Serenity'&&v===2){this.bleed(this.s.ai,1);let drain=this.s.ai.bleed*2;this.heal(this.s.player,drain,'drain');desc=`Serenity 2牌：1层流血+吸取${drain}点生命`}
        else if(n==='Serenity'&&v===3){b=Math.ceil(d/2);let bt=this.s.player.hp<30;if(bt)b=Math.min(d,b+2);d=Math.max(0,d-b);desc=`Serenity 3牌：格挡${b}点`}
        else if(n==='Moze'&&v===1){b=Math.ceil(d/2);this.s.player.guard=Math.min(5,this.s.player.guard+1);d=Math.max(0,d-b);desc=`Moze 1牌：防御${b}点+1层守护`}
        else if(n==='Moze'&&v===2){let cd=1+Math.ceil(this.s.player.guard/2);this.hurt(this.s.ai,cd);desc=`Moze 2牌：反击${cd}点`}
        else if(n==='Moze'&&v===3){this.s.player.guard=Math.min(5,this.s.player.guard+1);this.heal(this.s.player,Math.ceil(this.s.player.guard/2));desc=`Moze 3牌：1层守护+恢复${Math.ceil(this.s.player.guard/2)}点`}
        else if(n==='Moze'&&v===0){b=Math.ceil(d/2);this.s.player.guard=Math.min(5,this.s.player.guard+2);let cd=this.s.player.guard*2;this.hurt(this.s.ai,cd);d=Math.max(0,d-b);desc=`Moze 0牌：防御${b}点+2层守护+反击${cd}点`}
        else if(n==='Knight'&&v===1){this.heal(this.s.player,2);if(this.s.player.chaos_yellow)this.hurt(this.s.ai,2);desc='Knight 1牌：恢复2点'+(this.s.player.chaos_yellow?'，混沌黄反击2点':'')}
        else if(n==='Knight'&&v===2){b=Math.ceil(d/2);if(this.s.player.chaos_blue)this.draw('player',1,true);d=Math.max(0,d-b);desc=`Knight 2牌：格挡${b}点`+(this.s.player.chaos_blue?'+抽1张牌':'')}
        else if(n==='Knight'&&v===3){b=Math.ceil(d/2);if(this.s.player.chaos_red)this.burn(this.s.ai,2);d=Math.max(0,d-b);desc=`Knight 3牌：格挡${b}点`+(this.s.player.chaos_red?'+施加2层灼烧':'')}
        else if(n==='Knight'&&v===0){let p=this.s.player,chaosCount=[p.chaos_red,p.chaos_yellow,p.chaos_blue,p.chaos_green].filter(Boolean).length;let drain=chaosCount*2;if(chaosCount>=4){d=0;this.heal(p,drain);desc=`Knight 0牌：4种混沌，免疫所有伤害+吸取${drain}点`;p.chaos_red=true;p.chaos_yellow=true;p.chaos_blue=true;p.chaos_green=true}else{this.heal(p,drain);desc=`Knight 0牌：${chaosCount}种混沌，吸取${drain}点+补齐4种混沌`;p.chaos_red=true;p.chaos_yellow=true;p.chaos_blue=true;p.chaos_green=true}}
        else{b=c.value===1?Math.ceil(d/2):c.value===3?Math.floor(d/2):0;d=Math.max(0,d-b);desc=`抵消${b}点伤害，剩余${d}点待结算`}
        if(!judged)this.emit('desc',desc);
      }
      if(d&&this.s.player.guard>0){this.askGuard(d,this.s.player.bleed);return this.check()}
      this.s.phase='AI_TURN';
      this.deferSettlement('AI_ATTACK',d,triggeredDefense&&this.s.defCard&&this.s.defCard.isNumberCard&&this.s.defCard.value<=3?this.s.player.bleed:0);
      return this.check();
    }
    endAi(){this.trimAI();if(this.s.ai.burn){let dmg=this.s.ai.burn;this.s.ai.burn--;if(this.name(this.s.ai)!=='Leon'){this.emit('burnSettle',`-${dmg}[灼烧]，-1[灼烧层数]`,null,{who:'ai',amount:dmg});this.s.ai.hp=Math.max(0,this.s.ai.hp-dmg);this.s.ai.alive=this.s.ai.hp>0}}this.s.turn++;this.s.phase='PLAYER_PLAY';this.s.busy=false;this.s.activeAttacker='player';this.s.pendingAttack=null;this.s.pendingAIBridge=null;this.s.pendingAIContinue=null;this.s.forceEndAITurn=false;this.s.attackDebuffSnapshot=null;this.s.atkCard=this.s.defCard=null;this.s.atkOwner=this.s.defOwner=null;this.s.revealCards=[];this.s.hasPlayedThisTurn=false;this.s.aiTurnStarted=false;this.s.aiHasPlayed=false;this.turnStart('player');this.fillHands(false);this.check()}
    check(){for(const k of ['player','ai']){this.s[k].alive=this.s[k].hp>0}if(!this.s.player.alive||!this.s.ai.alive){this.s.phase='GAME_OVER';this.s.busy=false;clearTimeout(this.timer)}return this.state()}
    later(f,ms=550){clearTimeout(this.timer);this.timer=setTimeout(()=>{try{f()}catch(e){console.error(e)}},ms)}
    dispatch(m,p={}){if(m==='characters')return this.chars();if(m==='selectMode'){this.mode=!!p.mode1v2;return{status:'ok'}}if(m==='selectCharacters')return this.start(p.player,p.ai);if(m==='selectCard')return this.select(p.index);if(m==='doPlay')return this.play();if(m==='doFiveHeal')return this.finishRyanFive(false);if(m==='doFiveDamage')return this.finishRyanFive(true);if(m==='doSaikiSixConfirm')return this.finishNumberJudge();if(m==='doDefend')return this.defend();if(m==='doSkipDefend')return this.defend(true);if(m==='doEndTurn')return this.endTurn();if(m==='doEnterDiscard')return this.enterDiscard();if(m==='doCancelDiscard')return this.cancelDiscard();if(m==='doConfirmDiscard')return this.confirmDiscard();if(m==='chooseColor'){this.h.player[this.s.selectedCard].chosenColor=p.color;this.s.needColorChoice=false;this.s.pendingDialog=null;if(this.s.phase==='PLAYER_DEFEND')return this.defend();return this.play()}if(m==='choosePurify'){this.clean(this.s.player,false,p.kind);this.s.pendingDialog=null;this.emit('desc','净化移除一层'+({burn:'灼烧',freeze:'冷冻',bleed:'流血'}[p.kind]||'buff'));return this.state()}if(m==='chooseSuperPurifyTarget')return this.chooseSuperPurifyTarget(p.target);if(m==='chooseGuard')return this.chooseGuard(p.stacks);if(m==='chooseAICard')return this.chooseOpponentCard(Number(p.index));if(m==='doOpponentCardConfirm'||m==='doSevenConfirm')return this.confirmOpponentCard();if(m==='doChanSevenKeep')return this.chanSevenChoice(true);if(m==='doChanSevenDiscard')return this.chanSevenChoice(false);if(m==='doSaikiThreeKeep')return this.saikiThreeChoice(true);if(m==='doSaikiThreeDiscard')return this.saikiThreeChoice(false);if(m==='doChanFourSwap')return this.chanFourSwap();if(m==='doChanFourDiscard')return this.chanFourDiscard();if(m==='chanFiveReorder')return this.finishChanFive(p.order);if(m==='clearEvents'){let through=Number(p.throughId);if(Number.isFinite(through))this.acknowledgeEvents(through);else this.events=[];return{ok:true,remaining:this.events.length}}if(m==='restart'){clearTimeout(this.timer);this.pendingSettlement=null;this.s=null;return this.state()}throw Error('该操作尚不适用于当前状态')}
  }

  // === 1v2 extension (merged from engine_1v2.js) ===
  const origDraw=Engine.prototype.draw;
  Engine.prototype.draw=function(w,n,animated=false){
    if(this.s&&this.s.is1v2){
      let cards=[];
      while(n--){this.refillDeckIfNeeded();if(!this.deck.length)break;let c=this.deck.pop();this.h[w].push(c);cards.push(c)}
      if(animated&&cards.length)this.emit('draw',`${w==='player'?'玩家':w==='ai2'?'AI2':'AI'}抽${cards.length}张牌`,null,{who:w,count:cards.length});
      return cards
    }
    return origDraw.call(this,w,n,animated)
  };

  Engine.prototype._who=function(x){
    if(x===this.s.player)return'player';
    if(this.s.is1v2&&x===this.s.ai2)return'ai2';
    return'ai'
  };

  const origHurt=Engine.prototype.hurt;
  Engine.prototype.hurt=function(x,n,bleed=false,bypassGuard=false){
    if(this.s&&this.s.is1v2){
      if(x.guard>0&&!bleed&&!bypassGuard&&n>0){
        let who=this._who(x),use=who==='player'?Math.min(x.guard,n):this.chooseMozeGuardUse(x.guard,n,x.hp);
        x.guard-=use;n-=use;
        if(use)this.emit('desc',x.name+'消耗'+use+'层[守护]，减免'+use+'点伤害')
      }
      x.hp=Math.max(0,x.hp-n);x.alive=x.hp>0;
      if(this.name(x)==='Serenity')x.bloodthirst=x.hp<30;
      if(n>0){let w=this._who(x);this.emit('hurt',`-${n}[${bleed?'流血':'伤害'}]`,null,{who:w,amount:n,bleed})}
      return
    }
    return origHurt.call(this,x,n,bleed)
  };

  const origHeal=Engine.prototype.heal;
  Engine.prototype.heal=function(x,n,kind='heal'){
    if(this.s&&this.s.is1v2){
      if(n<=0)return;let normalSerenity=this.name(x)==='Serenity'&&x.hp>=30,before=x.hp;x.hp=Math.min(x.maxHp,x.hp+n);
      if(this.name(x)==='Serenity')x.bloodthirst=x.hp<30;
      let w=this._who(x);
      let gained=x.hp-before;if(gained)this.emit('heal',`+${gained}[${kind==='drain'?'吸血':kind==='passive'?'被动':'生命'}]`,null,{who:w,amount:gained,kind});
      if(kind!=='drain'&&normalSerenity&&x.hp<x.maxHp){x.hp++;this.emit('heal','+1[被动]',null,{who:w,amount:1,kind:'passive'})}
      if(this.name(x)==='Serenity')x.bloodthirst=x.hp<30;
      return
    }
    return origHeal.call(this,x,n,kind)
  };

  const origBurn=Engine.prototype.burn;
  Engine.prototype.burn=function(x,n){
    if(this.s&&this.s.is1v2){
      if(n>0&&this.name(x)!=='Leon'){let prev=x.burn;x.burn=Math.min(4,x.burn+n);let w=this._who(x);this.emit('buff',`+${n}[灼烧]`,null,{who:w,kind:'burn',stacks:x.burn})}
      return
    }
    return origBurn.call(this,x,n)
  };

  const origBleed=Engine.prototype.bleed;
  Engine.prototype.bleed=function(x,n){
    if(this.s&&this.s.is1v2){
      if(n>0){x.bleed=Math.min(2,x.bleed+n);let w=this._who(x);this.emit('buff',`+${n}[流血]`,null,{who:w,kind:'bleed',stacks:x.bleed})}
      return
    }
    return origBleed.call(this,x,n)
  };

  const origFreeze=Engine.prototype.freeze;
  Engine.prototype.freeze=function(x){
    if(this.s&&this.s.is1v2){
      if(this.name(x)!=='Serenity'){x.frozen=true;let w=this._who(x);this.emit('buff','[冷冻]',null,{who:w,kind:'freeze',stacks:1})}
      return
    }
    return origFreeze.call(this,x)
  };

  // --- 1v2 core methods ---
  Engine.prototype.start1v2=function(p,a1,a2){
    clearTimeout(this.timer);this.pendingSettlement=null;
    this.deck=this.makeDeck();this.discardBottom=[];
    this.h={player:[],ai:[],ai2:[]};this.events=[];
    let top=this.deck.pop();
    while(top.isBlack||top.isWhite){this.deck.unshift(top);top=this.deck.pop()}
    this.s={phase:'PLAYER_PLAY',turn:1,busy:false,selectedCard:-1,selectedCards:[],selectedAICard:-1,
      handLimit:10,forcedDiscard:false,hasPlayedThisTurn:false,hasPlayedBlackDefend:false,
      defenseSkipped:false,aiTurnStarted:false,aiHasPlayed:false,pendingAIBridge:null,
      pendingAIContinue:null,pendingDefenseDamage:0,pendingFiveChoice:false,fiveChoiceCard:null,
      pendingNumberJudge:null,mayDiscardAfterSkill:false,serenityHalfTarget:null,
      forceEndAITurn:false,activeAttacker:'player',is1v2:true,needColorChoice:false,
      pendingDialog:null,discardTop:top,
      player:this.character(p),ai:this.character(a1,true),ai2:Object.assign(this.character(a2,true),{name:'AI2 '+a2}),
      currentAITarget:0,attackTarget:null,eliminatedHandled:{ai:false,ai2:false},
      atkCard:null,atkOwner:null,defCard:null,defOwner:null,revealCards:[]};
    this.s.player.maxHp*=2;this.s.player.hp=this.s.player.maxHp;
    this.draw('player',10);this.draw('ai',5);this.draw('ai2',5);
    this.turnStart('player');return this.state()
  };

  Engine.prototype._curAI=function(){return this.s.currentAITarget===1?'ai2':'ai'};
  Engine.prototype._curAIChar=function(){return this.s[this._curAI()]};
  Engine.prototype._curAIHand=function(){return this.h[this._curAI()]};
  Engine.prototype._aiFillTarget=function(){
    if(!this.s.is1v2)return 5;
    let dead1=!this.s.ai.alive,dead2=!this.s.ai2||!this.s.ai2.alive;
    return(dead1||dead2)?10:5
  };

  Engine.prototype._checkDeath1v2=function(){
    if(!this.s.player.alive){this.s.phase='GAME_OVER';this.s.busy=false;clearTimeout(this.timer);return true}
    let allDead=!this.s.ai.alive&&(!this.s.ai2||!this.s.ai2.alive);
    if(allDead){this.s.phase='GAME_OVER';this.s.busy=false;clearTimeout(this.timer);return true}
    let defeatedKey=!this.s.ai.alive?'ai':(!this.s.ai2.alive?'ai2':null);
    if(defeatedKey&&!this.s.eliminatedHandled[defeatedKey]){
      this.s.eliminatedHandled[defeatedKey]=true;
      let aliveKey=defeatedKey==='ai'?'ai2':'ai',need=10-this.h[aliveKey].length;
      if(need>0){this.draw(aliveKey,need,true);this.emit('desc',this.s[defeatedKey].name+'出局，'+this.s[aliveKey].name+'补齐10张手牌')}
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
    this.turnStart('player');this.fillHands1v2(true);this.check()
  };

  Engine.prototype.trimAI1v2=function(){
    let key=this._curAI(),limit=this._aiFillTarget();
    while(this.h[key].length>limit){
      let worst=0;
      for(let i=1;i<this.h[key].length;i++)if(this.h[key][i].value<this.h[key][worst].value)worst=i;
      let card=this.h[key].splice(worst,1)[0];this.discardToBottom(card);
      this.emit('desc',this.s[key].name+'手牌超限，自动弃掉'+this.cardText(card))
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

  Engine.prototype._chooseAIDefend1v2=function(key,top){
    let hand=this.h[key];
    return this._swapAIContext(key,()=>{
      let best=null,score=-1;
      for(const c of hand){if(!this.aiDefendLegal(c,top,this.aiContext()))continue;let s=this.aiDefendScore(c,top);if(s>score){score=s;best=c}}
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
    if(c.potion)this.heal(owner,5);
    if(c.drawThree)this.draw(w,3,true);
    if(c.drawTwo)this.draw(w,2,true);
    if(c.purify&&w==='player'&&(owner.burn||owner.bleed||owner.frozen)){this.s.pendingDialog='purify'}
    else if(c.purify)this.clean(owner);
    if(c.superPurify&&w==='player'){this.s.pendingDialog='superPurify'}
    else if(c.superPurify){
      let ownerDeb=owner.burn+owner.bleed+(owner.frozen?1:0),targetGuard=target?target.guard:0;
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
      if(!this.s.aiHasPlayed&&hand.length){let dropped=hand.splice(0,hand.length);for(const card of dropped)this.discardToBottom(card);this.emit('desc',ch.name+'无牌可出，弃掉全部'+dropped.length+'张手牌')}
      return this.later(()=>this.endAi1v2(),700)
    }
    let i=hand.indexOf(chosen),c=hand.splice(i,1)[0];
    if(c.isBlack)c.chosenColor=this._chooseAIColor1v2(key);
    else if(c.isWhite)c.chosenColor=this.effective(top);
    this.s.aiHasPlayed=true;this.s.atkCard=cp(c);this.s.atkOwner=key;
    this.setDiscardTop(c);this.rememberAttackDebuffs('player');this.applySaikiPassive(ch,this.s.player,c);
    this.emit('aiPlay',ch.name+' 按角色策略出牌',c,{who:key});
    if(c.isBlack||c.isWhite)this.emit('colorChoice',ch.name+'指定'+this.colorName(c.chosenColor),c);
    if(c.isItemCard){
      let kind=this.itemKind(c);
      this.emit('itemEffect',this.itemEffectDesc(c,key),c,{effect:kind,who:key});
      this.useItem1v2(c,ch,this.s.player,key);
      this.s.pendingAIBridge={mode:'attack',afterEventId:this.ver,effect:kind};
      return this.check()
    }
    let r=this._swapAIContext(key,()=>this.aiSpecialEffect(this.name(ch),c.value,c))||this.effect(this.name(ch),c.value,c,ch,this.s.player);
    this.s.pendingAttack={damage:r.d,unblock:r.unblock};
    if(r.d&&!r.skip&&!r.unblock){this.s.phase='PLAYER_DEFEND';this.s.busy=false;return}
    if(!r.d)this.emit('desc',ch.name+' 本次技能分支未造成伤害，跳过防御',c);
    if(r.d&&this.s.player.guard>0){this.askGuard(r.d);return}
    this.hurt(this.s.player,r.d);this.s.phase=key.toUpperCase()+'_TURN';this.s.busy=true;
    this.s.pendingAIContinue={afterEventId:this.ver};return this.check()
  };

  Engine.prototype.aiDefend1v2=function(atk,d){
    let key=this.s.attackTarget||'ai';
    if(!this.s[key]||!this.s[key].alive)key=this.s.ai.alive?'ai':'ai2';
    let ch=this.s[key],hand=this.h[key];
    let frozen=ch.frozen&&this.effective(atk)==='BLUE',
        chosen=frozen?null:this._chooseAIDefend1v2(key,this.s.discardTop),
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
      else if(n==='Ryan'&&v===1){b=Math.ceil(d/2);remaining=Math.max(0,d-b);desc='Ryan 1牌：格挡'+b+'点'}
      else if(n==='Ryan'&&v===2){this.hurt(this.s.player,2);this.heal(ch,2);remaining=d;desc='Ryan 2牌：反击2点并恢复2点生命'}
      else if(n==='Ryan'&&v===3){if(this.effective(atk)==='RED'){remaining=0;desc='Ryan 3牌：无视红色攻击'}else{this.heal(ch,3);remaining=d;desc='Ryan 3牌：恢复3点生命'}}
      else if(n==='Ryan'&&v===0){this.cancelAttackDebuffs(key,false);this.clearDebuffs(ch);this.heal(ch,3);remaining=0;desc='Ryan 0牌：清除debuff、免疫伤害并恢复3点生命'}
      else if(n==='Leon'&&v===1){this.burn(this.s.player,1);this.heal(ch,2);remaining=d;desc='Leon 1牌：施加1层灼烧+恢复2点生命'}
      else if(n==='Leon'&&v===2){let cd=Math.ceil(d/2);this.hurt(this.s.player,cd);this.draw(key,1,true);remaining=d;desc='Leon 2牌：反击'+cd+'点+抽1张牌'}
      else if(n==='Leon'&&v===3){b=Math.ceil(d/2);this.draw(key,1,true);remaining=Math.max(0,d-b);desc='Leon 3牌：格挡'+b+'点+抽1张牌'}
      else if(n==='Leon'&&v===0){this.h.player.splice(0,this.h.player.length);this.hurt(this.s.player,d);this.hurt(ch,d);remaining=0;desc='Leon 0牌：弃攻击方所有牌+双方各受'+d+'点伤害'}
      else if(n==='Chan'&&v===1){b=Math.ceil(d/2);remaining=Math.max(0,d-b);desc='Chan 1牌：格挡'+b+'点'}
      else if(n==='Chan'&&v===2){this.hurt(this.s.player,2);this.freeze(this.s.player);remaining=d;desc='Chan 2牌：反击2点+施加冷冻'}
      else if(n==='Chan'&&v===0){let cd=Math.ceil(d/2);this.hurt(this.s.player,cd);remaining=0;this.s.forceEndPlayerTurn=true;desc='Chan 0牌：防御所有伤害并反击'+cd+'点，进攻方回合结束'}
      else if(n==='Saiki'&&v===1){b=Math.min(3,d);remaining=Math.max(0,d-b);desc='Saiki 1牌：防御至多3点'}
      else if(n==='Saiki'&&v===2){this.hurt(this.s.player,3);this.bleed(this.s.player,1);remaining=d;desc='Saiki 2牌：反击3点+1层流血'}
      else if(n==='Saiki'&&v===0){let shared=Math.ceil(d/2);this.hurt(this.s.player,shared);this.hurt(ch,shared);remaining=0;this.cancelAttackDebuffs(key,true);desc='Saiki 0牌：免疫debuff，双方均摊'+shared+'点伤害并反弹debuff'}
      else if(n==='Blaze'&&v===1){let bh=ch.burn;this.heal(ch,2+bh);this.burn(this.s.player,1);this.burn(ch,1);remaining=d;desc='Blaze 1牌：恢复'+(2+bh)+'点+双方灼烧1'}
      else if(n==='Blaze'&&v===3){this.burn(this.s.player,2);let fb=this.s.player.burn+this.s.ai.burn+this.s.ai2.burn;this.hurt(this.s.player,fb);remaining=d;desc='Blaze 3牌：攻击方+2灼烧，反击场上灼烧'+fb+'点'}
      else if(n==='Blaze'&&v===0){this.burn(this.s.player,4);b=Math.ceil(d/2);let tb=this.s.player.burn+this.s.ai.burn+this.s.ai2.burn;this.heal(ch,tb+3);remaining=Math.max(0,d-b);desc='Blaze 0牌：进攻方+4灼烧+格挡'+b+'点+恢复'+(tb+3)+'点'}
      else if(n==='Serenity'&&v===1){b=Math.min(3,d);let bt=ch.hp<30;if(bt)this.heal(ch,b);remaining=Math.max(0,d-b);desc=bt?'Serenity 1牌：防御3点+恢复'+b+'点(嗜血)':'Serenity 1牌：防御至多3点'}
      else if(n==='Serenity'&&v===2){this.bleed(this.s.player,1);let drain=this.s.player.bleed*2;this.heal(ch,drain,'drain');remaining=d;desc='Serenity 2牌：1层流血+吸取'+drain+'点生命'}
      else if(n==='Serenity'&&v===3){b=Math.ceil(d/2);let bt=ch.hp<30;if(bt)b=Math.min(d,b+2);remaining=Math.max(0,d-b);desc='Serenity 3牌：格挡'+b+'点'}
      else if(n==='Moze'&&v===1){b=Math.ceil(d/2);ch.guard=Math.min(5,ch.guard+1);remaining=Math.max(0,d-b);desc='Moze 1牌：防御'+b+'点+1层守护'}
      else if(n==='Moze'&&v===2){let cd=1+Math.ceil(ch.guard/2);this.hurt(this.s.player,cd);remaining=d;desc='Moze 2牌：反击'+cd+'点'}
      else if(n==='Moze'&&v===3){ch.guard=Math.min(5,ch.guard+1);this.heal(ch,Math.ceil(ch.guard/2));remaining=d;desc='Moze 3牌：1层守护+恢复'+Math.ceil(ch.guard/2)+'点'}
      else if(n==='Moze'&&v===0){b=Math.ceil(d/2);ch.guard=Math.min(5,ch.guard+2);let cd=ch.guard*2;this.hurt(this.s.player,cd);remaining=Math.max(0,d-b);desc='Moze 0牌：防御'+b+'点+2层守护+反击'+cd+'点'}
      else{b=c.isNumberCard?(c.value===1?Math.ceil(d/2):c.value===3?Math.floor(d/2):0):0;remaining=Math.max(0,d-b);desc=ch.name+'抵消'+b+'点伤害，剩余'+remaining+'点待结算'}
      if(!judged)this.emit('desc',desc);
      this.deferSettlement('PLAYER_ATTACK',remaining,c.isNumberCard&&c.value<=3?ch.bleed:0)
    }else{
      this.emit('desc',frozen?ch.name+'处于冷冻状态，无法防御蓝色攻击':ch.name+'根据防御策略选择跳过');
      this.deferSettlement('PLAYER_ATTACK',d,0)
    }
    return this.check()
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
    this.setDiscardTop(c);this.rememberAttackDebuffs(target);this.applySaikiPassive(this.s.player,targetChar,c);
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
    if(who==='Leon'&&c.value===0)return this.leonZero1v2(c);
    if(who==='Ryan'&&c.value===5)return this.startRyanFive(c);
    if(who==='Saiki'&&c.value===6)return this.startNumberJudge('Saiki',c);
    if(who==='Moze'&&c.value===4)return this.startNumberJudge('Moze',c);
    if(who==='Chan'&&c.value===5)return this.startChanFive();
    if(this.opponentChoiceSkill(who,c.value)){
      let p={name:who,value:c.value,attackCard:cp(c)};this.s.pendingOpponentSkill=p;this.s.selectedAICard=-1;
      if(!this.h[target].length)return this.opponentEmpty(p);
      this.s.phase='OPPONENT_CARD_CHOICE';this.s.busy=false;this.emit('desc',who+' '+c.value+'牌：请选择'+targetChar.name+'的一张手牌并确认',c);return this.state()
    }
    let r=this.effect(who,c.value,c,this.s.player,targetChar);
    this.s.pendingAttack={damage:r.d,unblock:r.unblock};
    this.s.defenseSkipped=!!(r.skip||r.unblock||r.d<=0);
    if(r.d&&!r.skip&&!r.unblock){
      this.s.phase='AI_DEFEND';this.s.busy=true;
      this.later(()=>this.aiDefend1v2(c,r.d))
    }else{
      if(r.d)this.emit('desc',targetChar.name+'有'+r.d+'点伤害待结算');
      this.s.phase='AI_DEFEND';this.s.busy=true;
      this.deferSettlement('PLAYER_ATTACK',r.d,0)
    }
    return this.check()
  };

  Engine.prototype.leonZero1v2=function(card){
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
    if(card)this.discardToBottom(card);
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
      let n=this.name(this.s.player),v=c.value,judged=false,b=0,desc='';
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
      if(this.defenseJudge('player',c,d)){judged=true}
      else if(n==='Ryan'&&v===1){b=Math.ceil(d/2);d=Math.max(0,d-b);desc='Ryan 1牌：格挡'+b+'点'}
      else if(n==='Ryan'&&v===2){this.hurt(targetChar,2);this.heal(this.s.player,2);desc='Ryan 2牌：反击2点并恢复2点生命'}
      else if(n==='Ryan'&&v===3){if(inheritedColor==='RED'){d=0;desc='Ryan 3牌：无视红色攻击'}else{this.heal(this.s.player,3);desc='Ryan 3牌：恢复3点生命'}}
      else if(n==='Ryan'&&v===0){this.cancelAttackDebuffs('player',false);this.clearDebuffs(this.s.player);this.heal(this.s.player,3);d=0;desc='Ryan 0牌：清除debuff、免疫伤害并恢复3点生命'}
      else if(n==='Leon'&&v===1){this.burn(targetChar,1);this.heal(this.s.player,2);desc='Leon 1牌：施加1层灼烧+恢复2点生命'}
      else if(n==='Leon'&&v===2){let cd=Math.ceil(d/2);this.hurt(targetChar,cd);this.draw('player',1,true);desc='Leon 2牌：反击'+cd+'点+抽1张牌'}
      else if(n==='Leon'&&v===3){b=Math.ceil(d/2);this.draw('player',1,true);d=Math.max(0,d-b);desc='Leon 3牌：格挡'+b+'点+抽1张牌'}
      else if(n==='Leon'&&v===0){this.h[target].splice(0,this.h[target].length);this.hurt(targetChar,d);this.hurt(this.s.player,d);d=0;desc='Leon 0牌：弃攻击方所有牌+双方各受'+d+'点伤害'}
      else if(n==='Chan'&&v===1){b=Math.ceil(d/2);d=Math.max(0,d-b);desc='Chan 1牌：格挡'+b+'点'}
      else if(n==='Chan'&&v===2){this.hurt(targetChar,2);this.freeze(targetChar);desc='Chan 2牌：反击2点+施加冷冻'}
      else if(n==='Chan'&&v===0){let cd=Math.ceil(d/2);this.hurt(targetChar,cd);d=0;this.s.forceEndAITurn=true;desc='Chan 0牌：防御所有伤害并反击'+cd+'点，AI回合结束'}
      else if(n==='Saiki'&&v===1){b=Math.min(3,d);d=Math.max(0,d-b);desc='Saiki 1牌：防御至多3点'}
      else if(n==='Saiki'&&v===2){this.hurt(targetChar,3);this.bleed(targetChar,1);desc='Saiki 2牌：反击3点+1层流血'}
      else if(n==='Saiki'&&v===0){let shared=Math.ceil(d/2);this.hurt(targetChar,shared);this.hurt(this.s.player,shared);d=0;this.cancelAttackDebuffs('player',true);desc='Saiki 0牌：免疫debuff，双方均摊'+shared+'点伤害并反弹debuff'}
      else if(n==='Blaze'&&v===1){let bh=this.s.player.burn;this.heal(this.s.player,2+bh);this.burn(targetChar,1);this.burn(this.s.player,1);desc='Blaze 1牌：恢复'+(2+bh)+'点+双方灼烧1'}
      else if(n==='Blaze'&&v===3){this.burn(targetChar,2);let fb=this.s.player.burn+this.s.ai.burn+this.s.ai2.burn;this.hurt(targetChar,fb);desc='Blaze 3牌：攻击方+2灼烧，反击场上灼烧'+fb+'点'}
      else if(n==='Blaze'&&v===0){this.burn(targetChar,4);b=Math.ceil(d/2);let tb=this.s.player.burn+this.s.ai.burn+this.s.ai2.burn;this.heal(this.s.player,tb+3);d=Math.max(0,d-b);desc='Blaze 0牌：进攻方+4灼烧+格挡'+b+'点+恢复'+(tb+3)+'点'}
      else if(n==='Serenity'&&v===1){b=Math.min(3,d);let bt=this.s.player.hp<30;if(bt)this.heal(this.s.player,b);d=Math.max(0,d-b);desc=bt?'Serenity 1牌：防御3点+恢复'+b+'点(嗜血)':'Serenity 1牌：防御至多3点'}
      else if(n==='Serenity'&&v===2){this.bleed(targetChar,1);let drain=targetChar.bleed*2;this.heal(this.s.player,drain,'drain');desc='Serenity 2牌：1层流血+吸取'+drain+'点生命'}
      else if(n==='Serenity'&&v===3){b=Math.ceil(d/2);let bt=this.s.player.hp<30;if(bt)b=Math.min(d,b+2);d=Math.max(0,d-b);desc='Serenity 3牌：格挡'+b+'点'}
      else if(n==='Moze'&&v===1){b=Math.ceil(d/2);this.s.player.guard=Math.min(5,this.s.player.guard+1);d=Math.max(0,d-b);desc='Moze 1牌：防御'+b+'点+1层守护'}
      else if(n==='Moze'&&v===2){let cd=1+Math.ceil(this.s.player.guard/2);this.hurt(targetChar,cd);desc='Moze 2牌：反击'+cd+'点'}
      else if(n==='Moze'&&v===3){this.s.player.guard=Math.min(5,this.s.player.guard+1);this.heal(this.s.player,Math.ceil(this.s.player.guard/2));desc='Moze 3牌：1层守护+恢复'+Math.ceil(this.s.player.guard/2)+'点'}
      else if(n==='Moze'&&v===0){b=Math.ceil(d/2);this.s.player.guard=Math.min(5,this.s.player.guard+2);let cd=this.s.player.guard*2;this.hurt(targetChar,cd);d=Math.max(0,d-b);desc='Moze 0牌：防御'+b+'点+2层守护+反击'+cd+'点'}
      else if(n==='Knight'&&v===1){this.heal(this.s.player,2);if(this.s.player.chaosYellow){this.hurt(targetChar,2);desc='Knight 1牌：恢复2点+反击2点(混沌黄)'}else{desc='Knight 1牌：恢复2点'}}
      else if(n==='Knight'&&v===2){b=Math.ceil(d/2);if(this.s.player.chaosBlue){this.draw('player',1,true);desc='Knight 2牌：格挡'+b+'点+抽1张(混沌蓝)'}else{desc='Knight 2牌：格挡'+b+'点'}}
      else if(n==='Knight'&&v===3){b=Math.ceil(d/2);if(this.s.player.chaosRed){this.burn(targetChar,2);desc='Knight 3牌：格挡'+b+'点+2灼烧(混沌红)'}else{desc='Knight 3牌：格挡'+b+'点'}}
      else if(n==='Knight'&&v===0){let p=this.s.player,chaosCount=[p.chaos_red,p.chaos_yellow,p.chaos_blue,p.chaos_green].filter(Boolean).length;let drain=chaosCount*2;if(chaosCount>=4){d=0;this.heal(p,drain);desc='Knight 0牌：免疫所有伤害+吸取'+drain+'点(4种混沌)'}else{this.heal(p,drain);desc='Knight 0牌：吸取'+drain+'点+补齐4种混沌'}p.chaos_red=true;p.chaos_yellow=true;p.chaos_blue=true;p.chaos_green=true}
      else{b=c.value===1?Math.ceil(d/2):c.value===3?Math.floor(d/2):0;d=Math.max(0,d-b);desc='抵消'+b+'点伤害，剩余'+d+'点待结算'}
      if(!judged)this.emit('desc',desc)
    }
    if(d&&this.s.player.guard>0){this.askGuard(d,this.s.player.bleed);return this.check()}
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
      this.hurt(targetChar,p.damage);
      for(let i=0;i<p.bleed;i++)this.hurt(targetChar,1,true);
      this.resolveSerenityHalf();this.afterAttack();
      if(forceEnd)this.startAITurn();
      this.check();return
    }
    let forceEnd=!!this.s.forceEndAITurn;this.s.forceEndAITurn=false;
    this.hurt(this.s.player,p.damage,false,true);
    for(let i=0;i<p.bleed;i++)this.hurt(this.s.player,1,true);
    this.resolveSerenityHalf();
    this._grantChaosIfKnight('ai');
    if(forceEnd)this.endAi1v2();else this.continueAIAttack()
  };

  // --- 1v2 dispatch override ---
  const origDispatch=Engine.prototype.dispatch;
  Engine.prototype.dispatch=function(m,p={}){
    if(m==='selectCharacters1v2')return this.start1v2(p.player,p.ai,p.ai2);
    if(m==='chooseTarget'){
      if(!this.s||!this.s.is1v2||this.s.phase!=='TARGET_CHOICE')throw Error('当前不需要选择目标');
      let t=p.target;
      let key=(t===0||t==='ai')?'ai':(t===1||t==='ai2')?'ai2':null;
      if(!key||!this.s[key]||!this.s[key].alive)throw Error('该目标已经出局');
      this.s.attackTarget=key;this.s.phase='PLAYER_PLAY';
      return this.play1v2()
    }
    if(!this.s||!this.s.is1v2)return origDispatch.call(this,m,p);
    if(m==='chooseColor'){
      let card=this.h.player[this.s.selectedCard];if(!card)throw Error('请选择要指定颜色的牌');
      card.chosenColor=p.color;this.s.needColorChoice=false;this.s.pendingDialog=null;
      return this.s.phase==='PLAYER_DEFEND'?this.defend1v2():this.play1v2()
    }
    if(m==='doOpponentCardConfirm'&&this.s.pendingLeonZeroDiscard)return this._finishLeonZeroDiscard();
    if(m==='chooseAICard'||m==='doOpponentCardConfirm'||m==='doSevenConfirm'||m==='doChanSevenKeep'||m==='doChanSevenDiscard'||m==='doSaikiThreeKeep'||m==='doSaikiThreeDiscard'||m==='doChanFourSwap'||m==='doChanFourDiscard'||m==='doFiveHeal'||m==='doFiveDamage'||m==='doSaikiSixConfirm'||m==='chanFiveReorder')return origDispatch.call(this,m,p);
    if(m==='doPlay'){
      if(this.s.phase==='TARGET_CHOICE')return this.state();
      let c=this.h.player[this.s.selectedCard];
      if(!c||!this.legal(c))return this.state();
      this.s.attackTarget=null;
      let needsTarget=(!c.isItemCard||c.swapHand)&&!c.isBlack;
      if(needsTarget){
        let alive1=this.s.ai.alive,alive2=this.s.ai2&&this.s.ai2.alive;
        if(alive1&&alive2){this.s.phase='TARGET_CHOICE';this.s.busy=false;return this.state()}
        this.s.attackTarget=alive1?'ai':'ai2'
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

/* Shared, serializable attack-modifier choice policy. UI and modes do not
 * calculate damage or spend statuses themselves. */
(function(global){
  const root=global.FurryGame||(global.FurryGame={});
  function options(engine, owner, damage, unblock, card){
    const actor=engine.s[owner]||{};
    const numeric=(engine.s.atkCard||card||{}).isNumberCard;
    const atRelease=engine.s.attackBuffAtRelease;
    const magma=atRelease&&atRelease.owner===owner ? Math.min(actor.magmaVein||0,atRelease.magma||0) : actor.magmaVein||0;
    return {canMagma:!!(numeric&&damage>0&&magma>0),canCrit:!!(damage>4&&!unblock&&(actor.crit||0)>0),
      magmaStacks:actor.magmaVein||0,critStacks:actor.crit||0};
  }
  function consume(engine,owner,kind){
    const attack=engine.s.pendingAttack;
    if(!attack||attack.attackModifier)throw Error('同一次进攻不能叠加攻击修正');
    const actor=engine.s[owner],allowed=options(engine,owner,attack.damage,attack.unblock,engine.s.atkCard);
    if(!(kind==='magmaVein'?allowed.canMagma:kind==='crit'&&allowed.canCrit))throw Error('当前不能使用该攻击修正Buff');
    const service=root.StatusService;
    if(service)service.remove(actor,kind,1);else actor[kind]=Math.max(0,(actor[kind]||0)-1);
    attack.attackModifier=kind;
    if(kind==='magmaVein'){
      const base=attack.skillDamage==null?attack.damage:attack.skillDamage;
      attack.magmaFlatBonus=attack.damage-base;
      attack.damage=Math.ceil(base*1.5)+attack.magmaFlatBonus;
      attack.damageMultiplier=1.5;
      if(attack.aoeDamage>0)attack.aoeDamage=Math.ceil(attack.aoeDamage*1.5);
    }else{attack.unblock=true;}
    engine.emit('buff','-1['+(kind==='magmaVein'?'熔脉':'暴击')+']',null,{who:owner,target:owner,kind,stacks:actor[kind]||0});
    engine.emit('desc',kind==='magmaVein'?'消耗[熔脉]：本次技能伤害×1.5（向上取整）':'消耗[暴击]：本次攻击不可防御');
  }
  function next(engine){
    const pending=engine.s.pendingAttackMod,attack=engine.s.pendingAttack;
    if(!pending||!attack)throw Error('攻击修正上下文已失效');
    pending.buffChoiceDone=true;
    if(!attack.attackModifier&&engine.s.isAdventure&&attack.damage>0){engine.s.phase='ATTACK_MOD_CHOICE';engine.s.busy=false;return engine.check();}
    return engine.continueAfterAttackMod();
  }
  function begin(engine){
    const attack=engine.s.pendingAttack,pending=engine.s.pendingAttackMod;
    const allowed=options(engine,'player',attack.damage,attack.unblock,pending.card);
    if(!allowed.canMagma&&!allowed.canCrit)return next(engine);
    const base=attack.skillDamage==null?attack.damage:attack.skillDamage;
    engine.s.pendingAttackBuffChoice=Object.assign({damage:attack.damage,unblock:attack.unblock,
      magmaPreviewDamage:Math.ceil(base*1.5)+(attack.damage-base)},allowed);
    // Retain the legacy crit-only phase for old clients/saves; both phases use
    // one dialog and one resolver, not independent spend operations.
    engine.s.phase=allowed.canMagma?'ATTACK_BUFF_CHOICE':'CRIT_CHOICE';
    engine.s.pendingDialog='attackBuff';engine.s.busy=false;
    return engine.check();
  }
  function resolve(engine,params={}){
    if(!['ATTACK_BUFF_CHOICE','CRIT_CHOICE'].includes(engine.s.phase)||!engine.s.pendingAttackBuffChoice)throw Error('当前没有攻击修正Buff选择');
    const kind=params.buff==null?null:params.buff;
    if(kind!==null&&!['magmaVein','crit'].includes(kind))throw Error('无效的攻击修正Buff');
    if(kind)consume(engine,'player',kind);
    const attack=engine.s.pendingAttack,pending=engine.s.pendingAttackMod;
    if(kind==='crit'){pending.unblock=true;engine.s.defenseSkipped=true;}
    engine.s.pendingAttackBuffChoice=null;engine.s.pendingCritChoice=null;engine.s.pendingDialog=null;
    return next(engine);
  }
  function applyAI(engine,result,owner,card){
    const allowed=options(engine,owner,result.d,result.unblock,card);
    const kind=allowed.canMagma?'magmaVein':allowed.canCrit?'crit':null;
    if(kind){consume(engine,owner,kind);result.d=engine.s.pendingAttack.damage;result.unblock=engine.s.pendingAttack.unblock;result.aoeDamage=engine.s.pendingAttack.aoeDamage;}
    return result;
  }
  root.AttackBuffs=Object.freeze({options,consume,begin,resolve,applyAI});
})(window);

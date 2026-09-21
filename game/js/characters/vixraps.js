(function() {
  const C = CharacterRegistry;
  C.register({
    name: 'Vixraps',
    hp: 85,
    type: '灼热',
    passive: '打出黑牌后，在搭桥出牌之前，必须弃掉1张牌，然后恢复3点生命。如果打出黑牌后没有手牌，则不需要弃牌，还是可以恢复3点生命',
    init() { return {}; },
    turnStart(eng, ch) {},
    effect(eng, v, c, a, t, owner, helpers) {
      const { burn, heal, draw, hurt } = helpers;
      let d = 0, skip = false, unblock = false;

      if (v === 1) {
        d = 2;
        unblock = true;
        burn(2);
      }
      if (v === 2) {
        d = 3;
        if (typeof eng.clean === 'function') eng.clean(a, false);
      }
      if (v === 3) {
        d = 4;
      }
      if (v === 4) {
        const healAmount = Math.ceil((t.burn || 0) / 2);
        heal(a, healAmount);
        draw(owner, 1, true);
      }
      if (v === 5) {
        d = 5;
        const currentBurn = t.burn || 0;
        if (currentBurn > 0) {
          t.burn = Math.min(5, currentBurn * 2);
          eng.emit('buff', `灼烧翻倍至${t.burn}层`, null, { who: owner === 'player' ? 'ai' : 'player', kind: 'burn', stacks: t.burn });
        }
      }
      if (v === 6) {
        // 在 effect() 阶段只记录延后请求。真正结算对手灼烧（伤害+减层）
        // 与回血延后到 ack 流程之后，避免被 _deferAttackBuffs 把灼伤减层
        // 当成 buff 变化回滚。
        const layer = t.burn || 0;
        if (layer > 0 && eng && eng.s) {
          eng.s.pendingVixrapsBurnSettle = { owner, attacker: a, target: t, layer };
        }
      }
      if (v === 7) {
        if (typeof eng.applyHypnosis === 'function') eng.applyHypnosis(t);
        burn(2);
        d = (t.burn || 0) * 2;
      }
      if (v === 0) {
        // 对目标施加催眠，对所有对手施加2层灼烧，然后所有对手连续结算两次灼伤伤害
        if (typeof eng.applyHypnosis === 'function') eng.applyHypnosis(t);
        const targetKeys = typeof eng._enemyKeys === 'function'
          ? eng._enemyKeys(owner)
          : [t];
        const targets = (targetKeys.length ? targetKeys : [t])
          .map(key => typeof key === 'string' && eng.s ? eng.s[key] : key);
        targets.forEach(entity => {
          if (!entity) return;
          if (entity === t) burn(2);
          else if (typeof eng.burn === 'function') eng.burn(entity, 2);
        });
        targets.forEach(entity => {
          if (!entity) return;
          for (let i = 0; i < 2; i++) {
            if (typeof eng.settleBurn === 'function') eng.settleBurn(entity);
          }
        });
      }

      return { d, skip, unblock };
    },
    defend(eng, n, v, d, c, defender, opponent, owner, inheritedColor, helpers) {
      const { hurt, heal, burn } = helpers;
      const counter = helpers.counter || ((target, amount) => hurt(target, amount));
      let remaining = d, desc = '';

      if (v === 1) {
        counter(opponent, 2);
        burn(opponent, 2);
        remaining = d;
        desc = 'Vixraps 1牌：反击2点+施加2层灼伤';
      }
      if (v === 2) {
        const currentBurn = opponent.burn || 0;
        if (currentBurn > 0) {
          opponent.burn = Math.min(5, currentBurn * 2);
        }
        const healAmount = opponent.burn || 0;
        heal(defender, healAmount);
        remaining = d;
        desc = `Vixraps 2牌：对手灼伤翻倍至${opponent.burn}层，恢复${healAmount}点`;
      }
      if (v === 3) {
        const counterDmg = Math.ceil(d / 2);
        counter(opponent, counterDmg);
        heal(defender, 1);
        remaining = d;
        desc = `Vixraps 3牌：反击${counterDmg}点+恢复1点`;
      }
      if (v === 0) {
        if (typeof eng.applyHypnosis === 'function') eng.applyHypnosis(opponent);
        burn(opponent, 1);
        const block = Math.ceil(d / 2);
        remaining = Math.max(0, d - block);
        const healAmount = (opponent.burn || 0) * 2;
        heal(defender, healAmount);
        desc = `Vixraps 0牌：防御${block}点+对手灼伤${opponent.burn}层+恢复${healAmount}点`;
      }

      return { remaining, desc };
    }
  });
})();
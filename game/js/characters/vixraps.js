(function() {
  const C = CharacterRegistry;
  C.register({
    name: 'Vixraps',
    hp: 65,
    type: '法师',
    passive: '打出黑牌后须弃1张（无手牌可免），然后回复2生命并对对手施加1层灼伤',
    init() { return {}; },
    turnStart(eng, ch) {},
    damageAtSettlement(eng, v, a, t) {
      if (v === 4) return t.burn || 0;
      return v === 5 ? (t.burn || 0) * 2 : null;
    },
    attackHealBeforeDamage(eng, v, a, t) {
      return v === 4 ? t.burn || 0 : 0;
    },
    attackEffectTiming: { 1: 'afterDamage', 3: 'afterDamage', 4: 'beforeDamage' },
    effect(eng, v, c, a, t, owner, helpers) {
      const { burn } = helpers;
      let d = 0;
      let skip = false;
      let unblock = false;
      let immediateBuffs = false;

      if (v === 1) {
        d = 2;
        unblock = true;
        burn(2);
      } else if (v === 2) {
        d = 4;
      } else if (v === 3) {
        d = 5;
        const currentBurn = t.burn || 0;
        if (currentBurn > 0) {
          t.burn = Math.min(5, currentBurn * 2);
          const who = typeof eng._who === 'function' ? eng._who(t)
            : (owner === 'player' ? (t === (eng.s && eng.s.ai2) ? 'ai2' : 'ai') : 'player');
          eng.emit('buff', `灼伤翻倍至${t.burn}层`, null, { who, kind: 'burn', stacks: t.burn });
        }
      } else if (v === 4) {
        burn(1);
        d = t.burn || 0;
      } else if (v === 5) {
        burn(2);
        if (typeof eng.setScorch === 'function') eng.setScorch(t, true, { silent: true });
        else {
          const service = window.FurryGame && window.FurryGame.StatusService;
          if (service) service.set(t, 'scorch', 1);
          else t.scorch = true;
        }
        d = (t.burn || 0) * 2;
      } else if (v === 0) {
        immediateBuffs = true;
        if (typeof eng.applyHypnosis === 'function') eng.applyHypnosis(t);
        burn(2);
        const targetKeys = typeof eng._enemyKeys === 'function'
          ? eng._enemyKeys(owner)
          : [t];
        const targets = (targetKeys.length ? targetKeys : [t])
          .map(key => typeof key === 'string' && eng.s ? eng.s[key] : key);
        targets.forEach(entity => {
          if (!entity) return;
          for (let i = 0; i < 2; i++) {
            if (typeof eng.settleBurn === 'function') eng.settleBurn(entity);
          }
        });
      }

      return { d, skip, unblock, immediateBuffs };
    },
    damageAfterDefense(v, damage, defender) {
      return null;
    },
    defend(eng, n, v, d, c, defender, opponent, owner, inheritedColor, helpers) {
      const { hurt, heal, burn } = helpers;
      const counter = helpers.counter || ((target, amount) => hurt(target, amount));
      let remaining = d;
      let desc = '';

      if (v === 1) {
        counter(opponent, 2);
        burn(opponent, 2);
        remaining = d;
        desc = 'Vixraps 1牌：反击2点+施加2层灼伤';
      } else if (v === 2) {
        heal(defender, 2);
        const currentBurn = opponent.burn || 0;
        const service = window.FurryGame && window.FurryGame.StatusService;
        if (currentBurn > 0) {
          if (service) service.set(opponent, 'burn', Math.min(5, currentBurn * 2));
          else opponent.burn = Math.min(5, currentBurn * 2);
          if (opponent.burn !== currentBurn) {
            const target = typeof eng._who === 'function' ? eng._who(opponent) : (owner === 'player' ? 'ai' : 'player');
            eng.emit('buff', '[灼伤]翻倍至' + opponent.burn + '层', null,
              { who: target, target, kind: 'burn', stacksBefore: currentBurn, stacks: opponent.burn, operation: 'multiply' });
          }
        }
        remaining = d;
        desc = `Vixraps 2牌：恢复2点` + (opponent.burn > currentBurn ? `+对手灼伤翻倍至${opponent.burn}层` : '');
      } else if (v === 0) {
        if (typeof eng.applyHypnosis === 'function') eng.applyHypnosis(opponent);
        burn(opponent, 1);
        remaining = d;
        const healAmount = (opponent.burn || 0) * 2;
        heal(defender, healAmount);
        desc = `Vixraps 0牌：对手灼伤${opponent.burn}层+恢复${healAmount}点`;
      }

      return { remaining, desc };
    }
  });
})();

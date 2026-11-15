(function() {
  const C = CharacterRegistry;
  C.register({
    name: 'Serenity',
    hp: 50,
    type: '暗影',
    passive: '免疫冷冻；生命低于25获得嗜血印记（不可净化，冒险离房时生命高于25则清除）；无印记时恢复额外+1',
    init() { return {}; },
    turnStart(eng, ch) { if (ch.hp < 25) ch.bloodthirst = true; },
    attackEffectTiming: { 3: 'beforeDamage' },
    effect(eng, v, c, a, t, owner, helpers) {
      const { bleed, heal, draw, hurt } = helpers;
      let d = 0;
      let skip = false;
      let unblock = false;
      const bt = !!a.bloodthirst || a.hp < 25;
      if (a.hp < 25) a.bloodthirst = true;
      if (v === 1) {
        d = 2;
        if (bt) bleed(2);
        else heal(a, 2);
      } else if (v === 2) {
        d = bt ? 5 : 3;
      } else if (v === 3) {
        d = 5;
        if (bt) bleed(1);
      } else if (v === 4) {
        const r = eng.reveal('Serenity 4牌判定');
        if (r && ['YELLOW', 'GREEN'].includes(eng.effective(r))) {
          heal(a, 4);
          skip = true;
        } else {
          d = 5;
        }
        if (r) eng.discardWithEvent(r, owner, { from: 'reveal', faceUp: true, desc: `Serenity 4牌将${eng.cardText(r)}置于弃牌库底` });
      } else if (v === 5) {
        d = 5;
        unblock = true;
        if (!bt) hurt(a, 2);
        if (eng.s.is1v2) {
          const focus = typeof eng.s.attackTarget === 'string' ? eng.s.attackTarget : null;
          const aoeTarget = owner === 'player'
            ? (focus === 'ai2' ? 'ai2' : 'ai')
            : 'player';
          eng.performAttack({ type: 'unblockable', attacker: owner, target: aoeTarget, damage: 5, direct: true });
        }
      } else if (v === 0) {
        const own = eng.h[owner];
        const bonus = Math.min(9, own.length * 3);
        if (bonus > 0) heal(a, bonus);
        const dropped = own.splice(0, own.length);
        eng.discardManyWithEvent(dropped, owner, { desc: 'Serenity 0牌：弃掉所有手牌' });
        if (bt) {
          const targetKey = typeof eng._who === 'function' ? eng._who(t) : (owner === 'player' ? 'ai' : 'player');
          const opp = eng.h[targetKey] || [];
          const count = opp.length;
          const discarded = opp.splice(0, opp.length);
          eng.discardManyWithEvent(discarded, targetKey, { desc: 'Serenity 嗜血0牌：对手弃掉所有手牌' });
          draw(targetKey, Math.max(0, count - 1), true);
        }
        draw(owner, 4, true);
        skip = true;
      }
      return { d, skip, unblock };
    },
    damageAfterDefense(v, damage, defender) {
      if (v === 1) return Math.max(0, damage - 3);
      return null;
    },
    defend(eng, n, v, d, c, defender, opponent, owner, inheritedColor, helpers) {
      const { hurt, bleed, cancelAttackDebuffs } = helpers;
      const counter = helpers.counter || ((target, amount) => hurt(target, amount));
      let remaining = d;
      let desc = '';
      if (v === 1) {
        const b = Math.min(3, d);
        remaining = Math.max(0, d - b);
        desc = 'Serenity 1牌：防御至多3点';
      } else if (v === 2) {
        bleed(opponent, 1);
        const drain = opponent.bleed || 0;
        if (typeof eng.drainAttack === 'function') {
          eng.drainAttack(defender, opponent, drain, { forceDrainAvoidance: true });
        } else {
          const before = opponent.hp;
          hurt(opponent, drain, 'drain');
          const taken = Math.max(0, before - opponent.hp);
          if (taken > 0) helpers.heal(defender, taken, 'drain');
        }
        remaining = d;
        desc = `Serenity 2牌：1层流血+吸取${drain}点生命`;
      }
      return { remaining, desc };
    }
  });
})();
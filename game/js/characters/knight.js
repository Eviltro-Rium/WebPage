(function() {
  const C = CharacterRegistry;
  C.register({
    name: 'Knight',
    hp: 80,
    type: '混沌',
    passive: '进攻前清除混沌；打出基础颜色数字牌获得对应混沌',
    init() { return { chaos_red: false, chaos_yellow: false, chaos_blue: false, chaos_green: false }; },
    turnStart(eng, ch, w) {
      const had = !!(ch.chaos_red || ch.chaos_yellow || ch.chaos_blue || ch.chaos_green);
      ch.chaos_red = false; ch.chaos_yellow = false; ch.chaos_blue = false; ch.chaos_green = false;
      if (had) {
        eng.emit('buff', '[混沌重制]', null, { who: w, kind: 'chaos_reset', stacks: 0 });
      }
    },
    effect(eng, v, c, a, t, owner, helpers) {
      const { burn, bleed, guard, takeReveal, heal, draw, clearDebuffs } = helpers;
      let d = 0, skip = false, unblock = false;
      let cr = a.chaos_red, cy = a.chaos_yellow, cb = a.chaos_blue, cg = a.chaos_green, chaosCount = [cr, cy, cb, cg].filter(Boolean).length;
      if (v === 1) {
        d = 1; unblock = true;
        if (cg) { heal(a, 1); guard(1); }
        if (cr) burn(2);
        if (cb) eng.freeze(t);
        if (cy) bleed(1);
      } else if (v === 2) {
        d = 4;
      } else if (v === 3) {
        d = 3;
        if (cg && cy) heal(a, 3);
      } else if (v === 4) {
        let r = takeReveal('Knight 4牌判定');
        if (r) {
          if (r.isNumberCard) {
            d = r.value < 4 ? 4 : 6;
          } else if (r.isItemCard || r.isBlack || r.isWhite) {
            // All non-number item cards count as the high-damage branch,
            // including trophy white cards.
            d = 6;
          }
          if (!cb) {
            let idx = eng.h[owner].indexOf(r);
            if (idx >= 0) eng.h[owner].splice(idx, 1);
            eng.discardWithEvent(r, owner, { from: 'reveal', faceUp: true, desc: `Knight 4牌将${eng.cardText(r)}置于弃牌库底` });
          }
        }
      } else if (v === 5) {
        d = 5;
        if (cr) unblock = true;
      } else if (v === 6) {
        d = 2; guard(2);
        if (cg) guard(2);
      } else if (v === 7) {
        d = 4 + chaosCount * 2;
        a.chaos_red = false; a.chaos_yellow = false; a.chaos_blue = false; a.chaos_green = false;
      } else if (v === 0) {
          if (chaosCount >= 4) {
            d = 8; unblock = true;
            if (eng.s.is1v2) {
              eng.performAoeEnemies(owner, 8, {direct:true});
            }
        } else {
          const gained = [];
          for (const [key, label] of [['chaos_red', '红'], ['chaos_yellow', '黄'], ['chaos_blue', '蓝'], ['chaos_green', '绿']]) {
            if (!a[key]) gained.push([key, label]);
            a[key] = true;
          }
          for (const [key, label] of gained) {
            eng.emit('buff', '[混沌-' + label + ']', null, { who: owner, kind: key, stacks: 1 });
          }
          d = 6;
        }
      }
      return { d, skip, unblock };
    },
    defend(eng, n, v, d, c, defender, opponent, owner, inheritedColor, helpers) {
      const { hurt, heal, draw, burn, bleed, cancelAttackDebuffs, clearDebuffs } = helpers;
      let remaining = d, desc = '';
      if (v === 1) {
        heal(defender, 2);
        if (defender.chaos_yellow) hurt(opponent, 2);
        desc = 'Knight 1牌：恢复2点' + (defender.chaos_yellow ? '，混沌黄反击2点' : '');
      } else if (v === 2) {
        let b = Math.ceil(d / 2);
        if (defender.chaos_blue) draw(owner, 1, true);
        remaining = Math.max(0, d - b);
        desc = `Knight 2牌：格挡${b}点` + (defender.chaos_blue ? '+抽1张牌' : '');
      } else if (v === 3) {
        let b = Math.ceil(d / 2);
        if (defender.chaos_red) burn(opponent, 2);
        remaining = Math.max(0, d - b);
        desc = `Knight 3牌：格挡${b}点` + (defender.chaos_red ? '+施加2层灼烧' : '');
      } else if (v === 0) {
        let p = defender, chaosCount = [p.chaos_red, p.chaos_yellow, p.chaos_blue, p.chaos_green].filter(Boolean).length;
        let drain = chaosCount * 2;
        if (chaosCount >= 4) {
          remaining = 0;
          if (typeof eng.performAttack === 'function') eng.performAttack({type:'drain',attacker:owner,target:owner==='player'?'ai':'player',damage:drain,allowAvoidance:false,direct:true});
          else { hurt(opponent, drain, 'drain'); heal(defender, drain, 'drain'); }
          desc = `Knight 0牌：4种混沌，免疫所有伤害+吸取${drain}点`;
        } else {
          if (typeof eng.performAttack === 'function') eng.performAttack({type:'drain',attacker:owner,target:owner==='player'?'ai':'player',damage:drain,allowAvoidance:false,direct:true});
          else { hurt(opponent, drain, 'drain'); heal(defender, drain, 'drain'); }
          desc = `Knight 0牌：${chaosCount}种混沌，吸取${drain}点+补齐4种混沌`;
        }
        const gained = [];
        for (const [key, label] of [['chaos_red', '红'], ['chaos_yellow', '黄'], ['chaos_blue', '蓝'], ['chaos_green', '绿']]) {
          if (!p[key]) gained.push([key, label]);
          p[key] = true;
        }
        for (const [key, label] of gained) {
          eng.emit('buff', '[混沌-' + label + ']', null, { who: owner, kind: key, stacks: 1 });
        }
      }
      return { remaining, desc };
    }
  });
})();

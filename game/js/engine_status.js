/* Status and HP transitions shared by every battle mode. */
(function (global) {
    const root = global.FurryGame || (global.FurryGame = {});
    const kinds = root.CombatEvents && root.CombatEvents.DamageKinds || {
        NORMAL: 'normal', BLEED: 'bleed', POISON: 'poison', DRAIN: 'drain'
    };
    const eventTypes = root.CombatEvents && root.CombatEvents.Types || { HURT: 'hurt', HIT: 'hit', HEAL: 'heal', BUFF: 'buff', BLEED_SETTLE: 'bleedSettle' };

    const targetKey = (engine, entity) => {
        if (entity === engine.s.player) return 'player';
        if (engine.s.ai2 && entity === engine.s.ai2) return 'ai2';
        return 'ai';
    };

    const EngineStatus = {
        targetKey,

        hurt(engine, entity, amount, kind = false, opts = {}) {
            const damage = Math.max(0, Number(amount) || 0);
            entity.hp = Math.max(0, entity.hp - damage);
            entity.alive = entity.hp > 0;
            if (engine.name(entity) === 'Serenity') entity.bloodthirst = entity.hp < 30;
            if (damage <= 0 || opts.silent) return;

            const target = targetKey(engine, entity);
            const isBleed = kind === 'bleed' || kind === true;
            const isPoison = kind === 'poison';
            const isDrain = kind === 'drain';
            if (isBleed || isPoison || isDrain) {
                const damageKind = isDrain ? kinds.DRAIN : isBleed ? kinds.BLEED : kinds.POISON;
                const text = isDrain ? '吸血' : isBleed ? '流血' : '中毒';
                engine.emit(eventTypes.HURT || 'hurt', `-${damage}[${text}]`, null, {
                    who: target, target, amount: damage, kind: damageKind,
                    bleed: isBleed, drain: isDrain, poison: isPoison
                });
                return;
            }
            engine.emit(eventTypes.HIT || 'hit', `受到${damage}点伤害`, null, {
                who: target, target, amount: damage, kind: kinds.NORMAL
            });
        },

        settleBleed(engine, entity, stacks) {
            const count = Math.max(0, Number(stacks) || 0);
            if ((entity.bleed || 0) <= 0 || count <= 0) return;
            this.hurt(engine, entity, count, true, { silent: true });
            entity.bleed--;
            const target = targetKey(engine, entity);
            engine.emit(eventTypes.BLEED_SETTLE || 'bleedSettle', `-${count}[流血]，-1[流血层数]`, null, {
                who: target, target, amount: count, kind: kinds.BLEED
            });
        },

        heal(engine, entity, amount, kind = 'heal') {
            if (amount <= 0) return;
            const before = entity.hp;
            entity.hp = Math.min(entity.maxHp, entity.hp + amount);
            const actual = entity.hp - before;
            if (engine.name(entity) === 'Serenity') entity.bloodthirst = entity.hp < 30;
            const target = targetKey(engine, entity);
            const label = kind === 'drain' ? '吸血' : kind === 'passive' ? '被动' : '生命';
            engine.emit(eventTypes.HEAL || 'heal', `+${actual}[${label}]`, null, { who: target, target, amount: actual, kind });
            if (kind !== 'drain' && engine.name(entity) === 'Serenity' && entity.hp >= 30) {
                entity.hp = Math.min(entity.maxHp, entity.hp + 1);
                engine.emit(eventTypes.HEAL || 'heal', '+1[被动]', null, { who: target, target, amount: 1, kind: 'passive' });
            }
        },

        freeze(engine, entity, opts) {
            if (engine.name(entity) === 'Serenity') return;
            entity.frozen = true;
            if (!opts || opts.silent !== true) {
                const target = targetKey(engine, entity);
                engine.emit(eventTypes.BUFF || 'buff', '[冷冻]', null, { who: target, target, kind: 'freeze', stacks: 1 });
            }
        },

        blind(engine, entity, opts) {
            if (!entity) return;
            entity.blind = 1;
            if (!opts || opts.silent !== true) {
                const target = targetKey(engine, entity);
                engine.emit(eventTypes.BUFF || 'buff', '[致盲]', null, { who: target, target, kind: 'blind', stacks: 1 });
            }
        },

        burn(engine, entity, amount, opts) {
            if (amount <= 0 || engine.name(entity) === 'Leon') return;
            entity.burn = Math.min(4, entity.burn + amount);
            if (!opts || opts.silent !== true) {
                const target = targetKey(engine, entity);
                engine.emit(eventTypes.BUFF || 'buff', `+${amount}[灼烧]`, null, { who: target, target, kind: 'burn', stacks: entity.burn });
            }
        },

        bleed(engine, entity, amount, opts) {
            if (amount <= 0) return;
            entity.bleed = Math.min(2, entity.bleed + amount);
            if (!opts || opts.silent !== true) {
                const target = targetKey(engine, entity);
                engine.emit(eventTypes.BUFF || 'buff', `${amount > 1 ? amount : ''}[流血]`, null, { who: target, target, kind: 'bleed', stacks: entity.bleed });
            }
        },

        poison(engine, entity, amount, opts) {
            if (amount <= 0) return;
            entity.poison = Math.min(3, (entity.poison || 0) + amount);
            if (!opts || opts.silent !== true) {
                const target = targetKey(engine, entity);
                engine.emit(eventTypes.BUFF || 'buff', `+${amount}[中毒]`, null, { who: target, target, kind: 'poison', stacks: entity.poison });
            }
        },

        clearDebuffs(entity) {
            if (!entity) return;
            entity.burn = 0; entity.bleed = 0; entity.poison = 0;
            entity.frozen = false; entity.bomb = 0; entity.blind = 0;
        },

        clearPositiveBuffs(entity) {
            if (!entity) return;
            entity.guard = 0; entity.fly = 0; entity.crit = 0; entity.lush = 0;
            entity.chaos_red = false; entity.chaos_yellow = false;
            entity.chaos_blue = false; entity.chaos_green = false;
        },

        clean(entity, all = false, kind = null) {
            if (!entity) return;
            if (all) {
                entity.burn = 0; entity.bleed = 0; entity.poison = 0; entity.frozen = false;
                entity.bomb = 0; entity.blind = 0; entity.guard = 0; entity.fly = 0;
                entity.lush = 0; entity.crit = 0; entity.chaos_red = false;
                entity.chaos_yellow = false; entity.chaos_blue = false; entity.chaos_green = false;
                return;
            }
            if (kind === 'burn' && entity.burn) entity.burn--;
            else if (kind === 'bleed' && entity.bleed) entity.bleed--;
            else if (kind === 'poison' && entity.poison) entity.poison--;
            else if (kind === 'freeze') entity.frozen = false;
            else if (kind === 'bomb') entity.bomb = 0;
            else if (kind === 'blind') entity.blind = 0;
            else if (kind === 'guard' && entity.guard) entity.guard--;
            else if (kind === 'fly' && entity.fly) entity.fly--;
            else if (kind === 'lush' && entity.lush) entity.lush--;
            else if (kind === 'crit' && entity.crit) entity.crit--;
            else if (entity.burn) entity.burn--;
            else if (entity.bleed) entity.bleed--;
            else if (entity.poison) entity.poison--;
            else if (entity.bomb) entity.bomb = 0;
            else entity.frozen = false;
        }
    };

    root.EngineStatus = Object.freeze(EngineStatus);
})(window);

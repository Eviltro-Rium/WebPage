/* Status and HP transitions shared by every battle mode. */
(function (global) {
    const root = global.FurryGame || (global.FurryGame = {});
    const kinds = root.CombatEvents && root.CombatEvents.DamageKinds || {
        NORMAL: 'normal', BLEED: 'bleed', POISON: 'poison', DRAIN: 'drain'
    };
    const eventTypes = root.CombatEvents && root.CombatEvents.Types || { HURT: 'hurt', HIT: 'hit', HEAL: 'heal', BUFF: 'buff', BLEED_SETTLE: 'bleedSettle' };
    const registry = root.StatusRegistry;
    const service = root.StatusService;
    const setStatus = (entity, id, value) => service ? service.set(entity, id, value) : null;
    const addStatus = (entity, id, amount) => service ? service.add(entity, id, amount) : null;
    const removeStatus = (entity, id, amount) => service ? service.remove(entity, id, amount) : null;

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
            if (engine.name(entity) === 'Serenity') {
                if (entity.hp < 30) { if (service) setStatus(entity, 'bloodthirst', true); else entity.bloodthirst = true; }
            }
            if (damage <= 0 || opts.silent) return;

            const target = targetKey(engine, entity);
            const isBleed = kind === 'bleed' || kind === true;
            const isPoison = kind === 'poison';
            const isDrain = kind === 'drain';
            const isThorns = kind === 'thorns';
            if (isBleed || isPoison || isDrain || isThorns) {
                const damageKind = isDrain ? kinds.DRAIN : isBleed ? kinds.BLEED : isPoison ? kinds.POISON : (kinds.THORNS || 'thorns');
                const text = isDrain ? '吸血' : isBleed ? '流血' : isPoison ? '中毒' : '荆棘';
                engine.emit(eventTypes.HURT || 'hurt', `-${damage}[${text}]`, null, {
                    who: target, target, amount: damage, kind: damageKind,
                    bleed: isBleed, drain: isDrain, poison: isPoison, thorns: isThorns,
                    // Special attacks may keep their own consolidated feedback
                    // (for example, life steal shows one heal float only).
                    suppressFloat: !!(opts && opts.suppressFloat)
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
            if (service) removeStatus(entity, 'bleed', 1); else entity.bleed--;
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
            if (engine.name(entity) === 'Serenity') {
                if (before < 30 || entity.hp < 30) { if (service) setStatus(entity, 'bloodthirst', true); else entity.bloodthirst = true; }
            }
            const target = targetKey(engine, entity);
            const desc = kind === 'wake'
                ? `[苏醒]+${actual}❤️`
                : `+${actual}[${kind === 'drain' ? '吸血' : kind === 'passive' ? '被动' : '生命'}]`;
            engine.emit(eventTypes.HEAL || 'heal', desc, null, { who: target, target, amount: actual, kind });
            if (kind !== 'drain' && kind !== 'wake' && engine.name(entity) === 'Serenity' && !entity.bloodthirst && entity.hp >= 30) {
                entity.hp = Math.min(entity.maxHp, entity.hp + 1);
                engine.emit(eventTypes.HEAL || 'heal', '+1[被动]', null, { who: target, target, amount: 1, kind: 'passive' });
            }
        },

        freeze(engine, entity, opts) {
            if (engine.name(entity) === 'Serenity') return;
            if (service) setStatus(entity, 'freeze', true); else entity.frozen = true;
            if (!opts || opts.silent !== true) {
                const target = targetKey(engine, entity);
                engine.emit(eventTypes.BUFF || 'buff', '[冷冻]', null, { who: target, target, kind: 'freeze', stacks: 1 });
            }
        },

        blind(engine, entity, opts) {
            if (!entity) return;
            if (service) setStatus(entity, 'blind', 1); else entity.blind = 1;
            if (!opts || opts.silent !== true) {
                const target = targetKey(engine, entity);
                engine.emit(eventTypes.BUFF || 'buff', '[致盲]', null, { who: target, target, kind: 'blind', stacks: 1 });
            }
        },

        burn(engine, entity, amount, opts) {
            if (amount <= 0 || engine.name(entity) === 'Leon') return;
            if (service) addStatus(entity, 'burn', amount); else entity.burn = Math.min(5, entity.burn + amount);
            if (!opts || opts.silent !== true) {
                const target = targetKey(engine, entity);
                engine.emit(eventTypes.BUFF || 'buff', `+${amount}[灼烧]`, null, { who: target, target, kind: 'burn', stacks: entity.burn });
            }
        },

        bleed(engine, entity, amount, opts) {
            if (amount <= 0) return;
            if (service) addStatus(entity, 'bleed', amount); else entity.bleed = Math.min(3, entity.bleed + amount);
            if (!opts || opts.silent !== true) {
                const target = targetKey(engine, entity);
                engine.emit(eventTypes.BUFF || 'buff', `${amount > 1 ? amount : ''}[流血]`, null, { who: target, target, kind: 'bleed', stacks: entity.bleed });
            }
        },

        addGuard(engine, entity, amount, opts) {
            if (!entity || amount <= 0) return 0;
            const before = entity.guard || 0;
            if (service) addStatus(entity, 'guard', amount); else entity.guard = Math.min(5, before + amount);
            const added = (entity.guard || 0) - before;
            if (added > 0 && (!opts || opts.silent !== true)) {
                const target = targetKey(engine, entity);
                engine.emit(eventTypes.BUFF || 'buff', `+${added}[守护]`, null, {
                    who: target, target, kind: 'guard', stacks: entity.guard
                });
            }
            return added;
        },

        poison(engine, entity, amount, opts) {
            if (amount <= 0) return;
            if (service) addStatus(entity, 'poison', amount); else entity.poison = Math.min(2, (entity.poison || 0) + amount);
            if (!opts || opts.silent !== true) {
                const target = targetKey(engine, entity);
                engine.emit(eventTypes.BUFF || 'buff', `+${amount}[中毒]`, null, { who: target, target, kind: 'poison', stacks: entity.poison });
            }
        },

        thorns(engine, entity, amount, opts) {
            if (!entity || amount <= 0) return;
            const before = entity.thorns || 0;
            if (service) addStatus(entity, 'thorns', amount);
            else entity.thorns = Math.min(1, before + amount);
            const added = Math.max(0, (entity.thorns || 0) - before);
            if (added > 0 && (!opts || opts.silent !== true)) {
                const target = targetKey(engine, entity);
                engine.emit(eventTypes.BUFF || 'buff', `+${added}[荆棘]`, null, {
                    who: target, target, kind: 'thorns', stacks: entity.thorns || 0
                });
            }
        },
        applyAttackSkillThorns(engine, entity) {
            if (!entity || !entity.alive || !(entity.thorns > 0)) return false;
            engine.hurt(entity, 1, 'thorns');
            const who = targetKey(engine, entity);
            const label = who === 'player' ? '玩家' : (entity.name || 'AI');
            engine.emit(eventTypes.DESC || 'desc', label + '因[荆棘]受到1点独立伤害');
            return true;
        },
        parasite(engine, entity, amount, opts) {
            if (!entity || amount <= 0) return;
            const before = entity.parasite || 0;
            if (service) service.add(entity, 'parasite', amount);
            else entity.parasite = Math.min(1, before + amount);
            const added = Math.max(0, (entity.parasite || 0) - before);
            const target = targetKey(engine, entity);
            if (added > 0 && (!opts || opts.silent !== true)) {
                engine.emit(eventTypes.BUFF || 'buff', `+${added}[寄生]`, null, {
                    who: target, target, kind: 'parasite', stacks: entity.parasite || 0
                });
            }
        },
        clearDebuffs(entity) {
            if (!entity) return;
            if (service) {
                service.clearGroup(entity, 'debuff', 'all');
                return;
            }
            entity.burn = 0; entity.bleed = 0; entity.poison = 0;
            entity.frozen = false; entity.bomb = 0; entity.blind = 0; entity.iceSeal = 0;
            entity.hypothermia = 0; entity.thorns = 0;
        },
        clearPositiveBuffs(entity) {
            if (!entity) return;
            if (service) {
                service.clearGroup(entity, 'buff', 'all');
                return;
            }
            entity.guard = 0; entity.fly = 0; entity.crit = 0; entity.lush = 0;
            entity.parasite = 0;
            entity.diving = false;
            entity.chaos_red = false; entity.chaos_yellow = false;
            entity.chaos_blue = false; entity.chaos_green = false;
        },
        clean(entity, all = false, kind = null) {
            if (!entity) return;
            if (service) {
                if (all) {
                    service.clearAll(entity);
                    return;
                }
                if (kind && service.clear(entity, kind)) return;
            }
            if (all) {
                entity.burn = 0; entity.bleed = 0; entity.poison = 0; entity.frozen = false;
                entity.bomb = 0; entity.blind = 0; entity.iceSeal = 0; entity.hypothermia = 0;
                entity.thorns = 0;
                entity.guard = 0; entity.fly = 0; entity.lush = 0; entity.crit = 0; entity.parasite = 0;
                entity.diving = false;
                entity.chaos_red = false; entity.chaos_yellow = false;
                entity.chaos_blue = false; entity.chaos_green = false;
                return;
            }
            if (kind === 'burn' && entity.burn) entity.burn--;
            else if (kind === 'bleed' && entity.bleed) entity.bleed--;
            else if (kind === 'poison' && entity.poison) entity.poison--;
            else if (kind === 'thorns') entity.thorns = 0;
            else if (kind === 'freeze') entity.frozen = false;
            else if (kind === 'bomb') entity.bomb = 0;
            else if (kind === 'blind') entity.blind = 0;
            else if (kind === 'iceSeal') entity.iceSeal = 0;
            else if (kind === 'hypothermia' && entity.hypothermia) entity.hypothermia = 0;
            else if (kind === 'diving') entity.diving = false;
            else if (kind === 'bloodthirst') { /* permanent mark */ }
            else if (kind === 'bind') { /* expires through its gameplay rule */ }
            else if (kind === 'guard' && entity.guard) entity.guard--;
            else if (kind === 'fly' && entity.fly) entity.fly--;
            else if (kind === 'lush' && entity.lush) entity.lush--;
            else if (kind === 'crit' && entity.crit) entity.crit--;
            else if (kind === 'parasite' && entity.parasite) entity.parasite--;
            else if (entity.burn) entity.burn--;
            else if (entity.bleed) entity.bleed--;
            else if (entity.poison) entity.poison--;
            else if (entity.bomb) entity.bomb = 0;
            else entity.frozen = false;
        },

        /**
         * Shared life-steal hit: optional fly/guard reduction, then hurt(kind=drain)
         * and heal attacker for HP actually lost. Defense-phase prompts are
         * bypassed by callers, while guard/fly can still reduce the hit.
         */
        drainAttack(engine, attacker, target, amount, opts = {}) {
            if (!attacker || !target) return 0;
            let remaining = Math.max(0, Number(amount) || 0);
            if (remaining <= 0) return 0;
            if (opts.allowAvoidance !== false) {
                if (opts.forceDrainAvoidance && typeof engine.applyDrainAvoidance === 'function') {
                    remaining = engine.applyDrainAvoidance(target, remaining);
                } else if (typeof engine.applyDefenderAvoidance === 'function') {
                    remaining = engine.applyDefenderAvoidance(target, remaining);
                }
            }
            const before = target.hp;
            this.hurt(engine, target, remaining, 'drain', opts);
            const taken = Math.max(0, before - target.hp);
            if (taken > 0) this.heal(engine, attacker, taken, 'drain');
            return taken;
        }
    };

    root.EngineStatus = Object.freeze(EngineStatus);
})(window);

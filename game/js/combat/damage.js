/* Damage settlement facade.  It is deliberately mode-agnostic: adapters only
 * decide which entity is the target; this module owns the common transition. */
(function (global) {
    const root = global.FurryGame || (global.FurryGame = {});
    const eventTypes = root.CombatEvents && root.CombatEvents.Types || { BOMB_EXPLODE: 'bombExplode', BUFF: 'buff' };
    const buffDamageKinds = new Set(['burn', 'bleed', 'poison', 'bomb', 'thorns', 'parasite', 'buff']);
    const EngineDamage = {
        isBuffDamage(options = {}) {
            return options.damageSource === 'buff' ||
                buffDamageKinds.has(options.kind === true ? 'bleed' : options.kind);
        },
        canAvoid(options = {}) {
            return options.allowAvoidance !== false && !this.isBuffDamage(options);
        },
        isUnblockable(options = {}) {
            return !this.isBuffDamage(options) && (
                options.unblockable === true || options.unblock === true || options.isDrain === true ||
                options.type === 'unblockable' || options.type === 'drain' || options.damageSource === 'counter'
            );
        },
        reduceUnblockable(engine, target, amount, options = {}) {
            const damage = Math.max(0, Number(amount) || 0);
            if (damage <= 0 || options.hardenHandled || !target || !this.isUnblockable(options)) return damage;
            const registry = root.StatusRegistry;
            const definition = registry && registry.get('harden');
            const stacks = registry ? registry.amount(target, 'harden') : Math.max(0, Number(target.harden) || 0);
            if (stacks <= 0) return damage;
            const attack = options.pendingAttack;
            const key = root.EngineStatus && root.EngineStatus.targetKey
                ? root.EngineStatus.targetKey(engine, target)
                : engine && engine._who ? engine._who(target) : 'player';
            if (attack) {
                attack.hardenedTargets = attack.hardenedTargets || {};
                if (attack.hardenedTargets[key]) return damage;
                attack.hardenedTargets[key] = true;
            }
            const reductionPerStack = Number(definition && definition.unblockableReductionPerStack) || 1;
            const reduced = Math.min(damage, stacks * reductionPerStack);
            if (reduced > 0 && engine && typeof engine.emit === 'function') {
                engine.emit(eventTypes.BUFF_TRIGGER || 'buffTrigger', '硬化减免' + reduced + '点伤害', null, {
                    who: key, target: key, kind: 'harden', amount: reduced, stacks
                });
            }
            return Math.max(0, damage - reduced);
        },
        apply(engine, target, amount, kind = false, opts = {}) {
            if (!root.EngineStatus || typeof root.EngineStatus.hurt !== 'function') {
                throw new Error('EngineStatus must be loaded before EngineDamage');
            }
            return root.EngineStatus.hurt(engine, target, amount, kind, opts);
        },
        settle(engine, target, amount, kind, opts = {}) {
            return this.apply(engine, target, amount, kind, opts);
        },
        tickBomb(engine, owner = 'ai') {
            const entity = engine.s && engine.s[owner];
            const tokens = engine.s && engine.s.bombPlayTokens;
            if (!entity || !entity.alive || (entity.bomb || 0) <= 0 || !tokens || !tokens[owner]) return;
            if (--tokens[owner] <= 0) delete tokens[owner];
            const status = root.StatusService;
            if (status) status.remove(entity, 'bomb', 1); else entity.bomb--;
            const target = owner === 'player' ? 'player' : owner === 'ai2' ? 'ai2' : 'ai';
            if (entity.bomb <= 0) {
                const hpBefore = entity.hp;
                this.apply(engine, entity, 5, 'bomb', { silent: true, damageSource: 'buff' });
                engine.emit(eventTypes.BOMB_EXPLODE || 'bombExplode', '[定时炸弹]🗡️5', null, {
                    who: target, target, amount: 5, hpBefore, hpAfter: entity.hp, kind: 'bomb'
                });
            } else {
                engine.emit(eventTypes.BUFF || 'buff', '炸弹倒计时：' + entity.bomb, null, {
                    who: target, target, kind: 'bomb', stacks: entity.bomb
                });
            }
        }
    };
    root.EngineDamage = Object.freeze(EngineDamage);
})(window);

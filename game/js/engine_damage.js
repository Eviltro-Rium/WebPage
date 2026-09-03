/* Damage settlement facade.  It is deliberately mode-agnostic: adapters only
 * decide which entity is the target; this module owns the common transition. */
(function (global) {
    const root = global.FurryGame || (global.FurryGame = {});
    const eventTypes = root.CombatEvents && root.CombatEvents.Types || { BOMB_EXPLODE: 'bombExplode', BUFF: 'buff' };
    const EngineDamage = {
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
            entity.bomb--;
            const target = owner === 'player' ? 'player' : owner === 'ai2' ? 'ai2' : 'ai';
            if (entity.bomb <= 0) {
                this.apply(engine, entity, 10, false, { silent: true });
                engine.emit(eventTypes.BOMB_EXPLODE || 'bombExplode', '定时炸弹爆炸！造成10点伤害', null, {
                    who: target, target, amount: 10, kind: 'bomb'
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

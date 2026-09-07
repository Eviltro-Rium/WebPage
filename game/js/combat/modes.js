/* Mode adapters keep target/hand topology out of shared rules. */
(function (global) {
    const root = global.FurryGame || (global.FurryGame = {});
    const keysFor = state => state && state.is1v2 ? ['player', 'ai', 'ai2'] : ['player', 'ai'];
    const adapterFor = state => {
        if (state && state.isAdventure) return 'adventure';
        if (state && state.isLord) return 'lord';
        if (state && state.is1v2) return '1v2';
        return '1v1';
    };
    const targetFor = (state, value, fallback = 'ai') => {
        if (value === 'enemy' || value === 'npc' || value === 'NPC') return fallback;
        return keysFor(state).includes(value) ? value : fallback;
    };

    const resolveAttackTarget = (state, fallback = 'ai') => {
        if (!state) return fallback;
        if (state.attackTarget && keysFor(state).includes(state.attackTarget)) {
            return state.attackTarget;
        }
        if (state.is1v2 && state.activeAttacker === 'ai2') return 'ai2';
        return fallback;
    };

    const enemyKeys = state => keysFor(state).filter(key => key !== 'player');

    const handLimit = (engine, owner = 'player') => {
        if (engine && engine.piles && engine.piles[owner] && engine.piles[owner].handLimit != null) {
            return engine.piles[owner].handLimit;
        }
        if (owner === 'ai' || owner === 'ai2') return 5;
        return (engine && engine.s && engine.s.handLimit) || 5;
    };

    const adapters = Object.freeze({
        '1v1': Object.freeze({
            id: '1v1',
            sharedDeck: true,
            dualPile: false,
            participants: Object.freeze(['player', 'ai'])
        }),
        '1v2': Object.freeze({
            id: '1v2',
            sharedDeck: true,
            dualPile: false,
            participants: Object.freeze(['player', 'ai', 'ai2'])
        }),
        lord: Object.freeze({
            id: 'lord',
            sharedDeck: true,
            dualPile: false,
            participants: Object.freeze(['player', 'ai', 'ai2'])
        }),
        adventure: Object.freeze({
            id: 'adventure',
            sharedDeck: false,
            dualPile: true,
            participants: Object.freeze(['player', 'ai', 'ai2'])
        })
    });

    const current = state => adapters[adapterFor(state)] || adapters['1v1'];

    root.EngineModes = Object.freeze({
        keysFor,
        adapterFor,
        targetFor,
        resolveAttackTarget,
        enemyKeys,
        handLimit,
        current,
        adapters
    });
})(window);

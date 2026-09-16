/* Opponent-hand selection policy.
 *
 * Hand-inspection skills have two deliberately different interaction modes:
 * Adventure (including its test rooms) lets the local player choose a card
 * from the visible opponent hand; classic 1v1/1v2 and online matches keep
 * the system-random behaviour.  Keeping this decision in one small module
 * prevents mode checks from leaking into every character skill.
 */
(function (global) {
    const root = global.FurryGame || (global.FurryGame = {});
    const PLAYERS = Object.freeze(['player', 'ai', 'ai2']);
    // Keep the list of character cards that inspect an opponent hand next to
    // the mode policy.  The effect itself still lives in Engine, but callers
    // no longer need to duplicate a growing chain of character/value checks.
    const HAND_SKILLS = Object.freeze({
        Chan: Object.freeze([4, 7]),
        Saiki: Object.freeze([3, 5]),
        Blaze: Object.freeze([4]),
        Moze: Object.freeze([5]),
        Leon: Object.freeze([7])
    });

    const stateOf = value => value && value.s && typeof value.s === 'object'
        ? value.s
        : value || {};

    function targetKey(engine, pending = {}) {
        const state = stateOf(engine);
        const requested = pending.targetKey || state.opponentHandTarget;
        if (state.is1v2) {
            if ((requested === 'ai' || requested === 'ai2') && state[requested] && state[requested].alive !== false) return requested;
            if ((state.attackTarget === 'ai' || state.attackTarget === 'ai2') && state[state.attackTarget] && state[state.attackTarget].alive !== false) return state.attackTarget;
            if (state.ai && state.ai.alive) return 'ai';
            if (state.ai2 && state.ai2.alive) return 'ai2';
            return requested === 'ai2' ? 'ai2' : 'ai';
        }
        return 'ai';
    }

    function strategy(engine, pending = {}) {
        const state = stateOf(engine);
        // Only a player-owned skill may open the local selection phase.  NPC
        // callers always use random selection, even in an Adventure room.
        const owner = pending.owner || 'player';
        const adventure = !!(state.isAdventure || (engine && engine.isAdventureBattle));
        return adventure && owner === 'player' ? 'player' : 'random';
    }

    function isSkill(name, value) {
        const values = HAND_SKILLS[name];
        return !!values && values.includes(Number(value));
    }

    function randomIndex(engine, length) {
        length = Number(length) || 0;
        if (length <= 0) return -1;
        const runtime = root.CombatRuntime;
        if (runtime && typeof runtime.randomInt === 'function') return runtime.randomInt(length);
        const random = runtime && typeof runtime.random === 'function' ? runtime.random() : Math.random();
        return Math.max(0, Math.min(length - 1, Math.floor(random * length)));
    }

    root.OpponentHandPolicy = Object.freeze({
        PLAYERS,
        HAND_SKILLS,
        stateOf,
        targetKey,
        strategy,
        isSkill,
        randomIndex
    });
})(window);

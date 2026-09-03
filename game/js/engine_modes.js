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
    root.EngineModes = Object.freeze({ keysFor, adapterFor, targetFor });
})(window);

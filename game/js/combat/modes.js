/* Combat mode adapters.
 *
 * A mode is a topology/resource adapter, not another combat engine. Shared
 * rules stay on Engine; adapters provide the small differences that are safe
 * to vary: participants, initial state flags, pile ownership and target
 * normalization. This keeps 1v1, 1v2, lord and adventure on one protocol.
 */
(function (global) {
    const root = global.FurryGame || (global.FurryGame = {});
    const MODE_IDS = Object.freeze(['1v1', '1v2', 'lord', 'adventure']);

    // Public helpers accept either a projected state or an Engine instance.
    // This keeps callers from reaching into `engine.s` merely to resolve the
    // mode and makes the adapter boundary usable by UI/bridge code as well.
    const stateOf = value => value && value.s && typeof value.s === 'object'
        ? value.s
        : value;

    const participantsFor = value => {
        const state = stateOf(value);
        return state && state.is1v2
            ? ['player', 'ai', 'ai2']
            : ['player', 'ai'];
    };

    const adapterIdFor = value => {
        const state = stateOf(value);
        if (state && MODE_IDS.includes(state.modeId)) return state.modeId;
        if (state && state.isAdventure) return 'adventure';
        if (state && state.isLord) return 'lord';
        if (state && state.is1v2) return '1v2';
        return '1v1';
    };

    const targetFor = (value, target, fallback = 'ai') => {
        const state = stateOf(value);
        if (target === 'enemy' || target === 'npc' || target === 'NPC') return fallback;
        return participantsFor(state).includes(target) ? target : fallback;
    };

    const resolveAttackTarget = (value, fallback = 'ai') => {
        const state = stateOf(value);
        if (!state) return fallback;
        if (state.attackTarget && participantsFor(state).includes(state.attackTarget)) {
            return state.attackTarget;
        }
        if (state.is1v2 && state.activeAttacker === 'ai2') return 'ai2';
        return fallback;
    };

    const enemyKeys = value => participantsFor(value).filter(key => key !== 'player');

    const stateService = () => root.CombatState;
    const deckService = () => root.CombatDeck;

    function createState(defaults, overrides = {}) {
        const service = stateService();
        if (!service || typeof service.create !== 'function') {
            throw new Error('CombatState must load before mode adapters');
        }
        return service.create(Object.assign({}, defaults, overrides));
    }

    function createSharedPiles() {
        const service = deckService();
        if (!service || typeof service.createStandard !== 'function') {
            throw new Error('CombatDeck must load before mode adapters');
        }
        return service.createStandard();
    }

    function handLimit(engine, owner = 'player') {
        if (engine && engine.piles && engine.piles[owner] && engine.piles[owner].handLimit != null) {
            return Number(engine.piles[owner].handLimit);
        }
        if (owner === 'ai' || owner === 'ai2') return 5;
        return (engine && engine.s && engine.s.handLimit) || 5;
    }

    // The invariant checker must not infer pile topology from mode flags or
    // reach into every engine implementation.  Each adapter exposes the
    // physical card containers and the table-top ownership rules it owns.
    function invariantView(adapter, engine) {
        const state = stateOf(engine) || {};
        const hands = (engine && engine.h) || {};
        const piles = (engine && engine.piles) || null;
        const participants = adapter.participants.slice();
        if (adapter.dualPile) {
            const npcPiles = participants
                .filter(key => key !== 'player' && piles && piles[key])
                .map(key => ({ key, pile: piles[key] }));
            return {
                mode: adapter.id,
                topology: 'isolated',
                participants,
                playerPile: piles && piles.player || null,
                npcPiles,
                sharedNpcDeck: !!(piles && piles.ai && piles.ai2 && piles.ai.deck === piles.ai2.deck),
                sharedNpcDiscard: !!(piles && piles.ai && piles.ai2 && piles.ai.discard === piles.ai2.discard),
                tableTop: state.discardTop || null,
                tableTopOwner: state.discardTopOwner || (engine && engine.tableTopOwner) || null,
                roomEnded: state.phase === 'GAME_OVER' || state.phase === 'COMBAT_SETTLE'
            };
        }
        return {
            mode: adapter.id,
            topology: 'shared',
            participants,
            deck: engine && engine.deck || [],
            discard: engine && engine.discardBottom || [],
            hands: participants.reduce((out, key) => {
                out[key] = hands[key] || [];
                return out;
            }, {}),
            tableTop: state.discardTop || null,
            tableTopOwner: null,
            roomEnded: state.phase === 'GAME_OVER'
        };
    }

    function adapter(spec) {
        const defaults = Object.freeze(Object.assign({
            is1v2: false,
            isLord: false,
            isAdventure: false,
            revealAIHand: false,
            activeAttacker: 'player'
        }, spec.defaults || {}));
        return Object.freeze(Object.assign({}, spec, {
            defaults,
            participants: Object.freeze(spec.participants.slice()),
            createState(overrides = {}) {
                // The adapter owns its mode identity.  A restored snapshot may
                // contain an old/incorrect flag, so never let it overwrite the
                // canonical id selected by the caller.
                return createState(Object.assign({}, defaults, overrides, { modeId: spec.id }));
            },
            createPiles(options = {}) {
                if (typeof spec.createPiles === 'function') return spec.createPiles(options);
                return createSharedPiles();
            },
            handLimit,
            participantsFor,
            targets(state) {
                return participantsFor(state).filter(key => this.participants.includes(key));
            },
            enemyKeys(state) {
                return this.targets(state).filter(key => key !== 'player');
            },
            invariantView(engine) {
                return invariantView(this, engine);
            },
            targetFor(state, value, fallback = 'ai') {
                const normalizedFallback = this.participants.includes(fallback) ? fallback : 'ai';
                return targetFor(state, value, normalizedFallback);
            }
        }));
    }

    const adapters = Object.freeze({
        '1v1': adapter({
            id: '1v1',
            sharedDeck: true,
            dualPile: false,
            participants: ['player', 'ai'],
            defaults: { is1v2: false, isLord: false, isAdventure: false }
        }),
        '1v2': adapter({
            id: '1v2',
            sharedDeck: true,
            dualPile: false,
            participants: ['player', 'ai', 'ai2'],
            defaults: { is1v2: true, isLord: false, isAdventure: false }
        }),
        lord: adapter({
            id: 'lord',
            sharedDeck: true,
            dualPile: false,
            participants: ['player', 'ai', 'ai2'],
            defaults: { is1v2: true, isLord: true, isAdventure: false }
        }),
        adventure: adapter({
            id: 'adventure',
            sharedDeck: false,
            dualPile: true,
            participants: ['player', 'ai', 'ai2'],
            defaults: { is1v2: false, isLord: false, isAdventure: true },
            createPiles(options = {}) {
                // Adventure supplies independent piles from AdventureDeck.
                // This fallback is useful for tests and future adapters that
                // pass already-normalized pile objects.
                const hasPileInput = ['player', 'ai', 'ai2'].some(key =>
                    Object.prototype.hasOwnProperty.call(options, key)
                );
                if (hasPileInput) {
                    return { player: options.player || null, ai: options.ai || null, ai2: options.ai2 || null };
                }
                const shared = createSharedPiles();
                return {
                    player: {
                        owner: 'player',
                        deck: shared.deck,
                        hand: [],
                        discard: shared.discardBottom,
                        handLimit: 5
                    },
                    ai: null,
                    ai2: null,
                    discardTop: shared.discardTop
                };
            }
        })
    });

    const current = value => adapters[adapterIdFor(value)] || adapters['1v1'];
    const forEngine = engine => current(engine);

    root.EngineModes = Object.freeze({
        // Backward-compatible names used by existing AI/UI code.
        keysFor: participantsFor,
        stateOf,
        participantsFor,
        adapterFor: adapterIdFor,
        adapterIdFor,
        targetFor,
        resolveAttackTarget,
        enemyKeys,
        invariantView(value) {
            const adapter = current(value);
            return adapter.invariantView(value);
        },
        handLimit,
        current,
        forEngine,
        createState(id, overrides) {
            return (adapters[id] || adapters['1v1']).createState(overrides);
        },
        createPiles(id, options) {
            return (adapters[id] || adapters['1v1']).createPiles(options);
        },
        adapters
    });
})(window);

/* CombatState protocol and state projection.
 *
 * The engine still exposes `engine.s` for compatibility with character and
 * mode adapters.  Construction and serialization live here so new modes can
 * create the same state shape without copying the large initializer.
 */
(function (global) {
    const root = global.FurryGame || (global.FurryGame = {});
    const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));
    const PHASES = Object.freeze([
        'SELECT_MODE', 'PLAYER_PLAY', 'PLAYER_DEFEND', 'PLAYER_DISCARD',
        'PLAYER_FIVE_CHOICE', 'PLAYER_SEVEN_CHOICE', 'SAIKI_SIX_JUDGE',
        'SAIKI_THREE_CHOICE', 'ATTACK_MOD_CHOICE', 'CRIT_CHOICE',
        'CHAN_FIVE_REORDER', 'OPPONENT_CARD_CHOICE', 'GUARD_CHOICE',
        'AI_TURN', 'AI_DEFEND', 'AI2_TURN', 'GAME_OVER'
    ]);

    const DEFAULTS = Object.freeze({
        phase: 'PLAYER_PLAY',
        turn: 1,
        busy: false,
        selectedCard: -1,
        selectedCards: [],
        selectedAICard: -1,
        handLimit: 5,
        forcedDiscard: false,
        hasPlayedThisTurn: false,
        hasPlayedBlackDefend: false,
        defenseSkipped: false,
        unblockDefend: false,
        attackModBonus: 0,
        aiTurnStarted: false,
        aiHasPlayed: false,
        pendingAIBridge: null,
        pendingAIContinue: null,
        pendingDefenseDamage: 0,
        pendingFiveChoice: false,
        fiveChoiceCard: null,
        pendingNumberJudge: null,
        mayDiscardAfterSkill: false,
        serenityHalfTarget: null,
        forceEndAITurn: false,
        activeAttacker: 'player',
        modeId: null,
        is1v2: false,
        isLord: false,
        isAdventure: false,
        revealAIHand: false,
        needColorChoice: false,
        pendingDialog: null,
        discardTop: null,
        player: null,
        ai: null,
        ai2: null,
        atkCard: null,
        atkOwner: null,
        defCard: null,
        defOwner: null,
        revealCards: [],
        diceRoll: null
    });

    function create(overrides = {}) {
        const state = Object.assign({}, DEFAULTS);
        state.selectedCards = [];
        state.revealCards = [];
        return Object.assign(state, overrides, {
            selectedCards: Array.isArray(overrides.selectedCards) ? overrides.selectedCards : state.selectedCards,
            revealCards: Array.isArray(overrides.revealCards) ? overrides.revealCards : state.revealCards
        });
    }

    function project(engine) {
        if (!engine || !engine.s) return { phase: 'SELECT_MODE', deck: 0, turn: 1 };
        const state = engine.s;
        const hands = engine.h || {};
        const deck = engine.deck || [];
        const discard = engine.discardBottom || [];
        Object.assign(state, {
            deck: deck.length,
            discard: 1 + discard.length,
            discardBottomCount: discard.length,
            playerHand: hands.player || [],
            aiHandSize: (hands.ai || []).length,
            aiHand: state.revealAIHand ? clone(hands.ai || []) : null,
            ai2HandSize: (hands.ai2 || []).length,
            ai2Hand: state.revealAIHand ? clone(hands.ai2 || []) : null,
            eventLogVersion: engine.ver || 0,
            events: (engine.events || []).slice(),
            legalHand: typeof engine._computeLegalHand === 'function' ? engine._computeLegalHand() : null
        });
        return clone(state);
    }

    function validate(state) {
        if (!state || typeof state !== 'object') return false;
        if (!PHASES.includes(state.phase)) return false;
        if (!Number.isFinite(Number(state.turn))) return false;
        return !!state.player && !!state.ai;
    }

    root.CombatState = Object.freeze({ PHASES, DEFAULTS, create, project, clone, validate });
})(window);

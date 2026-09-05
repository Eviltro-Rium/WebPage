/* Shared combat event vocabulary.
 *
 * The game still uses classic scripts for offline/file:// support, so the
 * protocol lives in a small namespace instead of requiring a bundler. New
 * producers and consumers can use these constants while old event strings
 * remain compatible during the migration.
 */
(function (global) {
    const root = global.FurryGame || (global.FurryGame = {});
    const Targets = Object.freeze({ PLAYER: 'player', AI: 'ai', AI2: 'ai2' });
    const Types = Object.freeze({
        PLAYER_PLAY: 'playerPlay', AI_PLAY: 'aiPlay', PLAYER_DEFEND: 'defend', AI_DEFEND: 'aiDefend',
        DRAW: 'draw', REVEAL: 'reveal', DISCARD: 'discard', DISCARD_MANY: 'discardMany',
        HIT: 'hit', HURT: 'hurt', HEAL: 'heal', BUFF: 'buff', BUFF_SETTLE: 'buffSettle',
        BURN_SETTLE: 'burnSettle', BLEED_SETTLE: 'bleedSettle', POISON_SETTLE: 'poisonSettle',
        BOMB_EXPLODE: 'bombExplode', ITEM_EFFECT: 'itemEffect', COLOR_CHOICE: 'colorChoice',
        DESC: 'desc', FLOAT: 'float', CLEAR_ZONES: 'clearZones', GAME_OVER: 'gameOver',
        HINT: 'hint', DICE_ROLL: 'diceRoll', LORD_DICE: 'lordDice', DUAL_DICE: 'dualDice'
    });
    const DamageKinds = Object.freeze({ NORMAL: 'normal', BLEED: 'bleed', POISON: 'poison', DRAIN: 'drain' });
    const normalizeTarget = (value, fallback = Targets.AI) => {
        if (value === 'enemy' || value === 'NPC' || value === 'npc') return Targets.AI;
        if (value === Targets.PLAYER || value === Targets.AI || value === Targets.AI2) return value;
        return fallback;
    };
    const targetOf = (event, fallback = Targets.PLAYER) => normalizeTarget(
        event && (event.target || event.who), fallback
    );
    root.CombatEvents = Object.freeze({ Types, Targets, DamageKinds, normalizeTarget, targetOf });
})(window);

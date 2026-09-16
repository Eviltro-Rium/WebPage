/* Stable combat protocol.
 *
 * The project intentionally keeps this as a small browser script instead of
 * requiring a bundler.  Every mode can therefore share the same Card and
 * CombatEvent vocabulary while still working from file:// URLs.
 */
(function (global) {
    const root = global.FurryGame || (global.FurryGame = {});
    const COLORS = Object.freeze(['RED', 'YELLOW', 'BLUE', 'GREEN', 'BLACK', 'WHITE']);
    const COLOR_SET = new Set(COLORS);
    const CARD_DEFAULTS = Object.freeze({
        value: -1,
        color: '',
        drawTwo: false,
        drawThree: false,
        potion: false,
        magic: false,
        greenMagic: false,
        magicColor: null,
        purify: false,
        superPurify: false,
        swapHand: false,
        shuffleToDeck: false,
        trophyWhite: false,
        trophyName: null,
        trophyEffect: null,
        chosenColor: null,
        isBlack: false,
        isWhite: false,
        isNumberCard: false,
        isItemCard: true
    });

    const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));
    let nextCardUid = 0;
    const newCardUid = () => 'c' + (++nextCardUid).toString(36);

    const number = (color, value, white = false, extras = null) => {
        const normalizedColor = String(color || '').toUpperCase();
        const card = {
            uid: newCardUid(),
            value: Number(value) || 0,
            color: normalizedColor,
            drawTwo: false,
            drawThree: false,
            potion: false,
            magic: false,
            greenMagic: false,
            magicColor: null,
            purify: false,
            superPurify: false,
            swapHand: false,
            shuffleToDeck: false,
            trophyWhite: false,
            trophyName: null,
            trophyEffect: null,
            chosenColor: null,
            isBlack: normalizedColor === 'BLACK',
            isWhite: !!white || normalizedColor === 'WHITE',
            isNumberCard: true,
            isItemCard: false
        };
        return Object.assign(card, extras || {}, {
            color: normalizedColor,
            isNumberCard: true,
            isItemCard: false
        });
    };

    const item = (color, effect, extras = null) => {
        const normalizedColor = String(color || '').toUpperCase();
        const key = String(effect || 'item');
        const card = {
            uid: newCardUid(),
            value: -1,
            color: normalizedColor,
            drawTwo: key === 'drawTwo',
            drawThree: key === 'drawThree',
            potion: key === 'potion',
            magic: key === 'magic',
            greenMagic: key === 'greenMagic',
            magicColor: key === 'greenMagic' ? 'green' : key === 'magic' ? 'purple' : null,
            purify: key === 'purify',
            superPurify: key === 'superPurify',
            swapHand: key === 'swap',
            shuffleToDeck: key === 'shuffle',
            trophyWhite: false,
            trophyName: null,
            trophyEffect: null,
            chosenColor: null,
            isBlack: normalizedColor === 'BLACK',
            isWhite: normalizedColor === 'WHITE',
            isNumberCard: false,
            isItemCard: true
        };
        return Object.assign(card, extras || {}, {
            color: normalizedColor,
            isNumberCard: false,
            isItemCard: true
        });
    };

    const normalize = (card) => {
        if (!card || typeof card !== 'object') return null;
        // Fill the canonical flags before preserving extension fields.  This
        // lets cards restored from older saves participate in the same
        // protocol as cards created by Card.number()/Card.item().
        const copy = Object.assign({}, CARD_DEFAULTS, card);
        copy.color = String(copy.color || '').toUpperCase();
        copy.drawTwo = !!copy.drawTwo;
        copy.drawThree = !!copy.drawThree;
        copy.potion = !!copy.potion;
        copy.magic = !!copy.magic;
        copy.greenMagic = !!copy.greenMagic;
        copy.purify = !!copy.purify;
        copy.superPurify = !!copy.superPurify;
        copy.swapHand = !!copy.swapHand;
        copy.shuffleToDeck = !!copy.shuffleToDeck;
        copy.trophyWhite = !!copy.trophyWhite;
        copy.isBlack = !!(copy.isBlack || copy.color === 'BLACK');
        copy.isWhite = !!(copy.isWhite || copy.color === 'WHITE');
        copy.isNumberCard = !!copy.isNumberCard;
        copy.isItemCard = !!(copy.isItemCard || !copy.isNumberCard);
        if (copy.isNumberCard) {
            copy.value = Number(copy.value) || 0;
            copy.isItemCard = false;
        } else {
            copy.value = Number.isFinite(Number(copy.value)) ? Number(copy.value) : -1;
        }
        return copy;
    };

    const isValid = card => {
        const c = normalize(card);
        if (!c || !COLOR_SET.has(c.color)) return false;
        if (c.isNumberCard === c.isItemCard) return false;
        if (c.isNumberCard && (!Number.isInteger(c.value) || c.value < 0 || c.value > 7)) return false;
        return true;
    };

    const Card = Object.freeze({
        COLORS,
        number,
        item,
        clone,
        normalize,
        isValid,
        kind: card => card && card.isNumberCard ? 'number' : card && card.isItemCard ? 'item' : 'unknown'
    });

    /* Event payloads are intentionally plain JSON objects so they can cross
       the local bridge, HTTP bridge, and sessionStorage without conversion. */
    const CombatEvent = Object.freeze({
        clone,
        create({ id, type, desc = '', card = null, ...extra } = {}) {
            const event = Object.assign({}, extra, {
                id: Number.isFinite(Number(id)) ? Number(id) : 0,
                type: String(type || 'desc'),
                desc: desc == null ? '' : String(desc)
            });
            if (card != null) event.card = clone(normalize(card) || card);
            return event;
        },
        normalize(event) {
            if (!event || typeof event !== 'object') return null;
            return this.create(Object.assign({}, event, {
                card: event.card == null ? null : event.card
            }));
        },
        isValid(event) {
            const e = this.normalize(event);
            return !!e && Number.isFinite(e.id) && !!e.type;
        }
    });

    root.Card = Card;
    root.CombatEvent = CombatEvent;
})(window);

/* Core UI bootstrap: shared constants, card helpers, animations and the
 * GameUI class skeleton. Rendering mixins live in ui/render/*.js and are
 * assigned onto GameUI.prototype after this file loads. */
const CARD_W = 70, CARD_H = 100;
const uiSchedule = (fn, ms, owner = null, channel = 'ui') => {
    const runtime = window.FurryGame && window.FurryGame.CombatRuntime;
    return runtime ? runtime.schedule(owner, fn, ms, channel) : setTimeout(fn, ms);
};
const CARD_W_MOBILE = 52, CARD_H_MOBILE = 74;
const CARD_ZONE_W_MOBILE = 52, CARD_ZONE_H_MOBILE = 74;
function isMobileLayout() {
    return typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(max-width: 768px)').matches;
}
function currentCardSize() {
    return isMobileLayout() ? [CARD_W_MOBILE, CARD_H_MOBILE] : [CARD_W, CARD_H];
}
function currentZoneCardSize() {
    return isMobileLayout() ? [CARD_ZONE_W_MOBILE, CARD_ZONE_H_MOBILE] : [CARD_W, CARD_H];
}
const CARD_COLORS = window.CardStyle ? window.CardStyle.CARD_COLORS : {
    RED: { fill: '#E31837', dark: '#B51228', ink: '#E31837' },
    YELLOW: { fill: '#FFCD00', dark: '#D4A900', ink: '#1A1A1A' },
    BLUE: { fill: '#0072BB', dark: '#005A94', ink: '#0072BB' },
    GREEN: { fill: '#00A651', dark: '#008542', ink: '#00A651' },
    BLACK: { fill: '#1A1A1A', dark: '#000000', ink: '#FFFFFF' },
    WHITE: { fill: '#F0F0F0', dark: '#D0D0D0', ink: '#333333' }
};

const GAME_ASSET_ROOT = (() => {
    if (typeof document === 'undefined' || !document.currentScript || !document.currentScript.src) return '';
    return new URL('../../', document.currentScript.src).href;
})();
function gameAssetUrl(path) {
    return GAME_ASSET_ROOT ? new URL(path, GAME_ASSET_ROOT).href : path;
}
window.gameAssetUrl = gameAssetUrl;

const TAG_COLORS = {
    '[生命]': '#86efac', '[伤害]': '#fda4af', '[灼烧]': '#fdba74',
    '[冷冻]': '#93c5fd', '[流血]': '#fb7185', '[吸血]': '#86efac',
    '[战斗]': '#fcd34d', '[交换]': '#c4b5fd', '[洗入]': '#c4b5fd',
    '[净化]': '#ddd6fe', '[解冻]': '#bae6fd',
    '[红]': '#fda4af', '[黄]': '#fde047', '[蓝]': '#93c5fd',
    '[绿]': '#86efac', '[白]': '#f8fafc', '[黑]': '#cbd5e1',
    '[守护]': '#67e8f9', '[飞翔]': '#a5b4fc', '[致盲]': '#c4b5fd',
    '[中毒]': '#a3e635', '[中毒层数]': '#a3e635', '[茂盛]': '#4ade80', '[寄生]': '#86efac', '[暴击]': '#facc15',
    '[冰封]': '#7dd3fc',
    '[灼烧层数]': '#fdba74', '[流血层数]': '#fb7185',
    '[定时炸弹]': '#fb923c', '[炸弹]': '#fb923c', '[束缚]': '#22c55e',
    '[自然之盾]': '#86efac', '[战利白卡]': '#fbbf24', '[道具]': '#fbbf24',
    '[混沌]': '#c084fc', '[混沌·红]': '#f87171', '[混沌·黄]': '#fde047',
    '[混沌·蓝]': '#60a5fa', '[混沌·绿]': '#4ade80',
    '[混沌-红]': '#f87171', '[混沌-黄]': '#fde047', '[混沌-蓝]': '#60a5fa', '[混沌-绿]': '#4ade80',
    '[混沌红]': '#f87171', '[混沌黄]': '#fde047', '[混沌蓝]': '#60a5fa', '[混沌绿]': '#4ade80',
    '[清除混沌红]': '#fca5a5', '[清除混沌黄]': '#fef08a', '[清除混沌蓝]': '#93c5fd', '[清除混沌绿]': '#86efac',
    '[混沌重制]': '#c084fc'
};

const ICON_PATHS = {
    black: gameAssetUrl('icons/card_icons/color_palette.png'),
    potion: gameAssetUrl('icons/card_icons/potion.png'),
    magic: gameAssetUrl('icons/card_icons/purple_magic.png'),
    green_magic: gameAssetUrl('icons/card_icons/green_magic.png'),
    draw_three: gameAssetUrl('icons/card_icons/draw_cards.png'),
    purify: gameAssetUrl('icons/card_icons/purify.png'),
    super_purify: gameAssetUrl('icons/card_icons/super_purify.png'),
    swap: gameAssetUrl('icons/card_icons/swap_cards.png'),
    shuffle: gameAssetUrl('icons/card_icons/shuffle.png'),
    burn: gameAssetUrl('icons/buff_icons/burn.png'),
    freeze: gameAssetUrl('icons/buff_icons/freeze.png'),
    bleed: gameAssetUrl('icons/buff_icons/bleed.png'),
    guard: gameAssetUrl('icons/buff_icons/guard.png')
};
ICON_PATHS.blind = gameAssetUrl('icons/buff_icons/blind.png');
ICON_PATHS.iceSeal = gameAssetUrl('icons/buff_icons/ice_seal.png');

const PHASE_NAMES = {
    PLAYER_PLAY: '出牌阶段', PLAYER_DISCARD: '弃牌阶段',
    PLAYER_DEFEND: '防御阶段', ATTACK_MOD_CHOICE: '攻击修正', CRIT_CHOICE: '暴击选择', PLAYER_FIVE_CHOICE: '选择5效果',
    PLAYER_SEVEN_CHOICE: '选择对手牌', SAIKI_THREE_CHOICE: '选择对手牌',
    SAIKI_SIX_JUDGE: '判定选择', AI_TURN: 'AI回合', AI2_TURN: 'AI2回合',
    AI_DEFEND: 'AI防御中', CHAN_FIVE_REORDER: '排列牌库顶', OPPONENT_CARD_CHOICE: '选择对手手牌', GUARD_CHOICE: '选择守护', TARGET_CHOICE: '选择目标', PURIFY_CRYSTAL_CHOICE: '净化水晶', GAME_OVER: '游戏结束'
};

const iconCache = {};
function loadIcon(name) {
    if (iconCache[name]) return iconCache[name];
    const img = new Image(); img.src = ICON_PATHS[name];
    iconCache[name] = img; return img;
}
Object.keys(ICON_PATHS).forEach(k => loadIcon(k));

function cardLabel(card) {
    if (!card) return '';
    if (card.isItemCard) {
        if (card.isBlack) return '黑牌';
        if (card.isWhite) return '白牌';
        return '道具';
    }
    return card.value + '牌';
}

function renderCard(card, w, h, selected, opts) {
    return window.CardStyle && window.CardStyle.renderCard
        ? window.CardStyle.renderCard(card, w, h, selected, opts)
        : document.createElement('canvas');
}

// Kept for older call sites; NPC-white identity is painted by CardStyle now.
function markNpcWhiteCard(canvas, card, isNpc = false) {
    return canvas;
}
window.markNpcWhiteCard = markNpcWhiteCard;

function renderCardBack(w, h) {
    if (window.CardStyle && window.CardStyle.renderCardBack) return window.CardStyle.renderCardBack(w, h);
    return document.createElement('canvas');
}

function roundRect(ctx, x, y, w, h, r) {
    if (window.CardStyle && window.CardStyle.roundRect) return window.CardStyle.roundRect(ctx, x, y, w, h, r);
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r); ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h); ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r); ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath();
}

function descToEmoji(text) {
    if (text == null) return text;
    let s = String(text);
    s = s.replace(/(格挡(?:至多)?|抵消|减免)(\d+(?:\.\d+)?|½|¼)点?\[伤害\]/g, '$1$2🛡️');
    s = s.replace(/(格挡(?:至多)?|抵消|减免)(\d+(?:\.\d+)?|½|¼)点伤害/g, '$1$2🛡️');
    s = s.replace(/(\d+(?:\.\d+)?|½|¼)点?\[伤害\]/g, '$1🗡️');
    s = s.replace(/\[伤害\]/g, '🗡️');
    s = s.replace(/(\d+(?:\.\d+)?|½|¼)点?\[生命\]/g, '$1❤️');
    s = s.replace(/\[生命\]/g, '❤️');
    s = s.replace(/(\d+)点伤害/g, '$1🗡️');
    s = s.replace(/(\d+)点生命/g, '$1❤️');
    s = s.replace(/恢复(\d+)点(?!伤)/g, '恢复$1❤️');
    s = s.replace(/自伤(\d+)点/g, '自伤$1🗡️');
    return s;
}
window.descToEmoji = descToEmoji;

function parseSegments(text, defaultColor) {
    text = descToEmoji(text);
    const segs = []; let sb = '';
    for (let i = 0; i < text.length; i++) {
        if (text[i] === '[') {
            const end = text.indexOf(']', i);
            if (end >= 0) {
                const tag = text.substring(i, end + 1);
                if (sb) { segs.push({ text: sb, color: defaultColor }); sb = ''; }
                segs.push({ text: tag, color: TAG_COLORS[tag] || defaultColor });
                i = end; continue;
            }
        }
        sb += text[i];
    }
    if (sb) segs.push({ text: sb, color: defaultColor });
    return segs;
}

function cardId(card) {
    return `${card.color}_${card.value}_${card.isBlack}_${card.isWhite}_${card.potion}_${card.magic}_${card.greenMagic}_${card.magicColor || ''}_${card.purify}_${card.superPurify}_${card.swapHand}_${card.shuffleToDeck}_${card.drawThree}_${!!card.trophyWhite}_${card.trophyName || ''}`;
}

// Rendering cache key: unlike cardId/cardMatchKey, chosenColor is included
// because it changes the visible face of black/white cards.
function cardVisualKey(card) {
    return card ? `${cardId(card)}_${card.chosenColor || ''}_${!!card.npcCard}_${!!card.borrowedMonster}` : '';
}

/** 匹配用手牌身份（忽略 chosenColor，避免 AI 出牌染色后找不到源牌） */
function cardMatchKey(card) {
    if (!card) return '';
    return `${card.color}_${card.value}_${!!card.isBlack}_${!!card.isWhite}_${!!card.potion}_${!!card.magic}_${!!card.greenMagic}_${card.magicColor || ''}_${!!card.purify}_${!!card.superPurify}_${!!card.swapHand}_${!!card.shuffleToDeck}_${!!card.drawThree}_${!!card.trophyWhite}_${card.trophyName || ''}`;
}

function animEaseInOut(t) {
    return 0.5 - Math.cos(Math.PI * Math.max(0, Math.min(1, t))) / 2;
}

function animSmoothstep(t) {
    t = Math.max(0, Math.min(1, t));
    return t * t * (3 - 2 * t);
}

class AnimLayer {
    constructor() { this.animating = false; }

    flyCard(card, fromEl, toEl, duration, arcHeight, owner = 'player') {
        return new Promise(resolve => {
            const fromRect = fromEl.getBoundingClientRect();
            const toRect = toEl.getBoundingClientRect();
            const flyEl = document.createElement('div');
            flyEl.className = 'fly-card';
            const cv = renderCard(card, CARD_W, CARD_H, false, { isNpc: !!(owner && owner !== 'player') });
            cv.style.pointerEvents = 'none';
            flyEl.appendChild(cv);
            document.body.appendChild(flyEl);

            const sx = fromRect.left + fromRect.width / 2 - CARD_W / 2;
            const sy = fromRect.top + fromRect.height / 2 - CARD_H / 2;
            const ex = toRect.left + toRect.width / 2 - CARD_W / 2;
            const ey = toRect.top + toRect.height / 2 - CARD_H / 2;
            const dur = duration || 400;
            const arc = arcHeight || 60;
            const start = performance.now();

            const tick = (now) => {
                const t = Math.min(1, (now - start) / dur);
                const ease = animEaseInOut(t);
                const x = sx + (ex - sx) * ease;
                const y = sy + (ey - sy) * ease - Math.sin(ease * Math.PI) * arc;
                const scale = 1 + 0.15 * Math.sin(ease * Math.PI);
                const rot = (ex - sx) * 0.0003 * Math.sin(ease * Math.PI);
                flyEl.style.transform = `translate(${x}px, ${y}px) scale(${scale}) rotate(${rot}rad)`;
                flyEl.style.opacity = t < 0.1 ? t / 0.1 : 1;
                if (t < 1) requestAnimationFrame(tick);
                else { flyEl.remove(); resolve(); }
            };
            requestAnimationFrame(tick);
        });
    }

    flyCardBack(fromEl, toEl, duration, arcHeight, endOffsetX = 0, endOffsetY = 0) {
        return new Promise(resolve => {
            const fromRect = fromEl.getBoundingClientRect();
            const toRect = toEl.getBoundingClientRect();
            const flyEl = document.createElement('div');
            flyEl.className = 'fly-card';
            const cv = renderCardBack(CARD_W, CARD_H);
            cv.style.pointerEvents = 'none';
            flyEl.appendChild(cv);
            document.body.appendChild(flyEl);

            const sx = fromRect.left + fromRect.width / 2 - CARD_W / 2;
            const sy = fromRect.top + fromRect.height / 2 - CARD_H / 2;
            const ex = toRect.left + toRect.width / 2 - CARD_W / 2 + endOffsetX;
            const ey = toRect.top + toRect.height / 2 - CARD_H / 2 + endOffsetY;
            const dur = duration || 400;
            const arc = arcHeight || 60;
            const start = performance.now();

            const tick = (now) => {
                const t = Math.min(1, (now - start) / dur);
                const ease = animEaseInOut(t);
                const x = sx + (ex - sx) * ease;
                const y = sy + (ey - sy) * ease - Math.sin(ease * Math.PI) * arc;
                const scale = 1 + 0.15 * Math.sin(ease * Math.PI);
                flyEl.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;
                flyEl.style.opacity = t < 0.08 ? t / 0.08 : t > 0.94 ? (1 - t) / 0.06 : 1;
                if (t < 1) requestAnimationFrame(tick);
                else { flyEl.remove(); resolve(); }
            };
            requestAnimationFrame(tick);
        });
    }

    async drawCards(count, isPlayer, targetEl) {
        const srcEl = document.getElementById('deck-area') || document.querySelector('.top-bar') || document.body;
        const timerOwner = {};
        const promises = Array.from({ length: Math.max(0, count) }, (_, i) => new Promise(resolve => {
            const spread = Math.min(24, 72 / Math.max(1, count - 1));
            const offsetX = (i - (count - 1) / 2) * spread;
            uiSchedule(() => resolve(this.flyCardBack(srcEl, targetEl, 440, isPlayer ? 58 : 44, offsetX, isPlayer ? 2 : -2)), i * 82, timerOwner, `draw-card-${i}`);
        }));
        await Promise.all(promises);
    }

    popInCard(card, targetEl) {
        return new Promise(resolve => {
            const rect = targetEl.getBoundingClientRect();
            const el = document.createElement('div');
            el.className = 'fly-card';
            const cv = renderCard(card, CARD_W, CARD_H, false);
            cv.style.pointerEvents = 'none';
            el.appendChild(cv);
            document.body.appendChild(el);

            const cx = rect.left + rect.width / 2 - CARD_W / 2;
            const cy = rect.top + rect.height / 2 - CARD_H / 2;
            const dur = 300;
            const start = performance.now();
            const tick = (now) => {
                const t = Math.min(1, (now - start) / dur);
                const ease = animEaseInOut(t);
                const scale = 0.3 + 0.7 * ease;
                const opacity = ease;
                el.style.transform = `translate(${cx}px, ${cy}px) scale(${scale})`;
                el.style.opacity = opacity;
                if (t < 1) requestAnimationFrame(tick);
                else { el.remove(); resolve(); }
            };
            requestAnimationFrame(tick);
        });
    }

    discardCard(card, fromEl, toEl, faceUp = true, opts = {}) {
        return new Promise(resolve => {
            if (!fromEl || !toEl) { resolve(); return; }
            const landsOnTop = opts.landsOnTop === true;
            const reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
            const discardZone = toEl.closest('.discard-zone') || toEl;
            if (reducedMotion) {
                if (landsOnTop) {
                    discardZone.classList.add('discard-impact');
                    uiSchedule(() => discardZone.classList.remove('discard-impact'), 180, this, 'discard-impact');
                }
                if (fromEl.classList && fromEl.classList.contains('card-canvas')) fromEl.remove();
                resolve();
                return;
            }

            const fromRect = fromEl.getBoundingClientRect();
            const toRect = toEl.getBoundingClientRect();
            const width = CARD_W - 8;
            const height = CARD_H - 12;
            const flyEl = document.createElement('div');
            flyEl.className = 'fly-card discard-fly-card';
            flyEl.appendChild(faceUp ? renderCard(card, width, height, false) : renderCardBack(width, height));
            document.body.appendChild(flyEl);

            const sx = fromRect.left + fromRect.width / 2 - width / 2;
            const sy = fromRect.top + fromRect.height / 2 - height / 2;
            // Cards going to the discard-bottom must not look like they replace the shared top.
            const ex = toRect.left + toRect.width / 2 - width / 2 + (landsOnTop ? 0 : 18);
            const ey = toRect.top + toRect.height / 2 - height / 2 + (landsOnTop ? 6 : 28);
            const distance = Math.hypot(ex - sx, ey - sy);
            const arc = Math.max(40, Math.min(100, distance * 0.22));
            const turn = ex >= sx ? 1 : -1;
            const duration = landsOnTop ? 560 : 500;
            const start = performance.now();

            if (fromEl.classList && fromEl.classList.contains('card-canvas')) {
                fromEl.remove();
            }
            if (landsOnTop) discardZone.classList.add('discard-catching');

            const tick = now => {
                const t = Math.min(1, (now - start) / duration);
                const flightT = Math.min(1, t / 0.8);
                const ease = animEaseInOut(flightT);
                const x = sx + (ex - sx) * ease;
                const y = sy + (ey - sy) * ease - Math.sin(ease * Math.PI) * arc;
                const settle = animSmoothstep((t - 0.78) / 0.22);
                const scale = 1 + Math.sin(ease * Math.PI) * 0.08 - settle * (landsOnTop ? 0.2 : 0.28);
                const rotate = turn * (Math.sin(ease * Math.PI) * 5 + settle * 5);
                flyEl.style.transform = `translate(${x}px, ${y + settle * (landsOnTop ? 10 : 16)}px) scale(${scale}) rotate(${rotate}deg)`;
                flyEl.style.opacity = t < 0.08 ? t / 0.08 : (t > 0.96 ? (1 - t) / 0.04 : 1);
                if (t < 1) {
                    requestAnimationFrame(tick);
                    return;
                }
                flyEl.remove();
                if (landsOnTop) {
                    discardZone.classList.remove('discard-catching');
                    discardZone.classList.add('discard-impact');
                    uiSchedule(() => discardZone.classList.remove('discard-impact'), 260, this, 'discard-impact');
                }
                resolve();
            };
            requestAnimationFrame(tick);
        });
    }

    swapHands(playerEl, opponentEl, playerCards, opponentCount) {
        return new Promise(resolve => {
            if (!playerEl || !opponentEl) { resolve(); return; }
            const reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
            if (reducedMotion) { resolve(); return; }

            const playerRect = playerEl.getBoundingClientRect();
            const opponentRect = opponentEl.getBoundingClientRect();
            const playerSet = (playerCards || []).slice(0, 7);
            const opponentTotal = Math.min(7, Math.max(0, opponentCount || 0));
            const ghosts = [];
            const width = Math.max(36, Math.min(48, CARD_W - 10));
            const height = Math.round(width * 1.43);

            const pointFor = (rect, index, total) => {
                const spacing = Math.min(30, Math.max(12, (rect.width - width) / Math.max(1, total - 1)));
                const totalWidth = width + spacing * Math.max(0, total - 1);
                return {
                    x: rect.left + rect.width / 2 - totalWidth / 2 + index * spacing,
                    y: rect.top + rect.height / 2 - height / 2
                };
            };

            const addGhost = (card, faceUp, fromRect, toRect, index, total, direction) => {
                const el = document.createElement('div');
                el.className = 'fly-card swap-fly-card';
                el.appendChild(faceUp ? renderCard(card, width, height, false) : renderCardBack(width, height));
                document.body.appendChild(el);
                ghosts.push({
                    el,
                    start: pointFor(fromRect, index, total),
                    end: pointFor(toRect, index, total),
                    direction,
                    delay: index * 34
                });
            };

            playerSet.forEach((card, index) => addGhost(card, true, playerRect, opponentRect, index, playerSet.length, -1));
            for (let i = 0; i < opponentTotal; i++) {
                addGhost(null, false, opponentRect, playerRect, i, opponentTotal, 1);
            }
            if (!ghosts.length) { resolve(); return; }

            playerEl.classList.add('hand-swap-active');
            opponentEl.classList.add('hand-swap-active');
            const dx = opponentRect.left - playerRect.left;
            const dy = opponentRect.top - playerRect.top;
            const distance = Math.max(1, Math.hypot(dx, dy));
            const normalX = -dy / distance;
            const normalY = dx / distance;
            const arc = Math.max(42, Math.min(104, distance * 0.18));
            const duration = 650 + Math.max(...ghosts.map(ghost => ghost.delay));
            const start = performance.now();

            const tick = now => {
                let done = true;
                for (const ghost of ghosts) {
                    const t = Math.max(0, Math.min(1, (now - start - ghost.delay) / 650));
                    if (t < 1) done = false;
                    const ease = 0.5 - Math.cos(t * Math.PI) / 2;
                    const curve = Math.sin(ease * Math.PI) * arc * ghost.direction;
                    const x = ghost.start.x + (ghost.end.x - ghost.start.x) * ease + normalX * curve;
                    const y = ghost.start.y + (ghost.end.y - ghost.start.y) * ease + normalY * curve;
                    const scale = 0.9 + Math.sin(ease * Math.PI) * 0.16;
                    const rotate = ghost.direction * Math.sin(ease * Math.PI) * 10;
                    ghost.el.style.transform = `translate(${x}px, ${y}px) scale(${scale}) rotate(${rotate}deg)`;
                    ghost.el.style.opacity = t < 0.08 ? t / 0.08 : t > 0.9 ? (1 - t) / 0.1 : 1;
                }
                if (!done && now - start < duration + 80) {
                    requestAnimationFrame(tick);
                    return;
                }
                ghosts.forEach(ghost => ghost.el.remove());
                playerEl.classList.remove('hand-swap-active');
                opponentEl.classList.remove('hand-swap-active');
                resolve();
            };
            requestAnimationFrame(tick);
        });
    }
}

class GameUI {
    // Screen builders and render mixins live in ui/render/*.js; event
    // playback, controls and feedback live in events.js / controls.js /
    // renderer.js / feedback.js (loaded after this file). Keep GameUI here as
    // the shared state/bootstrap layer.

    constructor(options = {}) {
        this._shakeTimer = null;
        this.state = null;
        this._prevState = null;
        this.session = options.session || null;
        this.root = options.root || document;
        this.characters = null;
        this._pollInterval = null;
        this._selectedPlayerChar = null;
        this._selectedAIChar = null;
        this._selectedAI2Char = null;
        this._is1v2 = false;
        this._isLord = false;
        this._isAdventure = false;
        this._modeChosen = false;
        this._isPollingAI = false;
        this._isHandlingAction = false;
        this._isConsumingEvents = false;
        this._consumedEventIds = new Set();
        this._lastAnimatedAIDefenseKey = null;
        this._animatedPlayerDraws = 0;
        this._npcHandFocusIndex = -1;
        this._selectedCombatItem = null;
        this._floatingTextLanes = { player: [], ai: [], ai2: [] };
        this.anim = new AnimLayer();
        this.dialogs = new DialogManager((method, params) => this._apiAction(method, params));
    }

    setSession(session) {
        this.session = session || null;
        return this;
    }

    async _sessionDispatch(method, params = {}) {
        if (this.session && typeof this.session.dispatch === 'function') {
            return this.session.dispatch(method, params || {});
        }
        return Bridge.call(method, params || {});
    }

    async _sessionGetState() {
        if (this.session && typeof this.session.getState === 'function') return this.session.getState();
        return Bridge.getState();
    }

    async _sessionAcknowledgeEvents(throughId) {
        if (this.session && typeof this.session.acknowledgeEvents === 'function') {
            return this.session.acknowledgeEvents(throughId);
        }
        return Bridge.call('clearEvents', { throughId });
    }

    mountBattle(session, state, gameScreen) {
        this.setSession(session);
        window._gameUI = this;
        this.state = state || null;
        this._prevState = null;
        this._consumedEventIds = new Set();
        this.gameScreen = gameScreen || document.getElementById('game-screen');
        if (!this.gameScreen) throw new Error('战斗界面容器不存在');
        this._buildGameScreen();
        this.gameScreen.classList.add('active');
        this.updateDisplay();
        return this;
    }

    async init() {
        window._gameUI = this;
        this.selectScreen = document.getElementById('select-screen');
        this.gameScreen = document.getElementById('game-screen');
        this._initParticles();
        try {
            this.characters = await Bridge.call('characters');
        } catch (e) {
            this.characters = [
                { name: 'Ryan', hp: 70, type: '战士', passive: '进攻回合开始前恢复1点生命' },
                { name: 'Leon', hp: 90, type: '骑士', passive: '免疫灼烧' },
                { name: 'Chan', hp: 80, type: '谋士', passive: '进攻回合开始前抽1张牌' },
                { name: 'Saiki', hp: 80, type: '猎手', passive: '有效黄色牌施加1层流血' },
                { name: 'Blaze', hp: 85, type: '狂战', passive: '有灼烧时1至7牌攻击伤害+1' },
                { name: 'Serenity', hp: 80, type: '暗影', passive: '免疫冷冻；低于30生命嗜血，正常态恢复+1' },
                { name: 'Moze', hp: 100, type: '守护', passive: '守护可减免非流血伤害' },
                { name: 'Knight', hp: 80, type: '混沌', passive: '进攻前清除混沌；打出基础颜色数字牌获得对应混沌' },
                { name: 'Otto', hp: 100, type: '战士', passive: '进攻时伤害>4可选择消耗1层【暴击】使攻击不可防御' },
            ];
        }
        this._buildSelectScreen();
    }

    async _startGame() {
        await this._sessionDispatch('selectMode', { mode1v2: this._is1v2 });
        const result = await this._sessionDispatch('selectCharacters', { player: this._selectedPlayerChar, ai: this._selectedAIChar });
        if (result.error) { this.showError(result.error); return; }
        this.state = result;
        this.selectScreen.classList.remove('active');
        this.gameScreen.classList.add('active');
        this._buildGameScreen();
        this.updateDisplay();
        await this._playOpeningEvents();
        this._startPolling();
    }

    _pendingDrawCount(who) {
        const events = (this.state && this.state.events) || [];
        return events
            .filter(evt => evt && evt.type === 'draw' && evt.who === who)
            .reduce((sum, evt) => sum + (Number(evt.count) || 1), 0);
    }

    _hideTrailingCount(options, who) {
        if (options && Object.prototype.hasOwnProperty.call(options, 'hideTrailing')) {
            return Math.max(0, Number(options.hideTrailing) || 0);
        }
        return 0;
    }

    _hidePendingDraws() {
        const playerDraws = this._pendingDrawCount('player');
        const aiDraws = this._pendingDrawCount('ai');
        const ai2Draws = this._pendingDrawCount('ai2');
        if (playerDraws) this._renderPlayerHand({ hideTrailing: playerDraws });
        if (this.state && this.state.is1v2 && this._renderAIHand1v2) {
            if (aiDraws) this._renderAIHand1v2({ hideTrailing: aiDraws, who: 'ai' });
            if (ai2Draws) this._renderAIHand1v2({ hideTrailing: ai2Draws, who: 'ai2' });
        } else if (aiDraws) {
            this._renderAIHand({ hideTrailing: aiDraws });
        }
    }

    async _playOpeningEvents() {
        const events = (this.state && this.state.events) || [];
        if (!events.length) return;
        this._hidePendingDraws();
        await this._consumeEvents(events);
        const fresh = await this._sessionGetState();
        if (fresh && !fresh.error) this.state = fresh;
        this.updateDisplay();
    }

    _startPolling() {
        if (this._pollInterval) clearInterval(this._pollInterval);
        this._pollInterval = setInterval(() => {
            // While a player action or event batch is in flight, never let the
            // poller re-enter _consumeEvents — that double-plays floats like
            // Mag Transfer's [流血] during the long desc wait.
            if (this._isPollingAI || this._isHandlingAction || this._isConsumingEvents) return;
            if (this.state && (this.state.phase === 'AI_TURN' || this.state.phase === 'AI_DEFEND' || this.state.phase === 'AI2_TURN' || this.state.busy || (this.state.events && this.state.events.length))) {
                // All AI state changes must pass through the event-aware poller.
                // A plain state refresh can consume a newer event version without
                // playing/acknowledging that event, leaving settlement waiting forever.
                this._pollAI();
            }
        }, 500);
    }
}

// Classic-script class declarations live in the global lexical scope, but are
// not exposed as properties on window. Adventure mode performs an explicit
// capability check before handing combat to the shared 1v1 UI, so export both
// classes deliberately.
window.AnimLayer = AnimLayer;
window.GameUI = GameUI;

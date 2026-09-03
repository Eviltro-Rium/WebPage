/* Core UI entry point: bootstrapping, state snapshots and shared view data.
 * Rendering, event playback, feedback and controls are composed by the
 * ui_renderer/ui_events/ui_feedback/ui_controls mixins loaded by each page. */
const CARD_W = 70, CARD_H = 100;
const UI_COMBAT_EVENTS = (window.FurryGame && window.FurryGame.CombatEvents) || {};
const UI_EVENT_TYPES = UI_COMBAT_EVENTS.Types || { HIT: 'hit' };
const UI_DAMAGE_KINDS = UI_COMBAT_EVENTS.DamageKinds || { NORMAL: 'normal', BLEED: 'bleed', POISON: 'poison', DRAIN: 'drain' };
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
    return new URL('../', document.currentScript.src).href;
})();
function gameAssetUrl(path) {
    return GAME_ASSET_ROOT ? new URL(path, GAME_ASSET_ROOT).href : path;
}
window.gameAssetUrl = gameAssetUrl;

const TAG_COLORS = {
    '[生命]': '#86efac', '[伤害]': '#fda4af', '[灼烧]': '#fdba74',
    '[冷冻]': '#93c5fd', '[流血]': '#fb7185', '[吸血]': '#86efac', '[牌]': '#c4b5fd',
    '[战斗]': '#fcd34d', '[交换]': '#c4b5fd', '[洗入]': '#c4b5fd',
    '[净化]': '#ddd6fe', '[解冻]': '#bae6fd',
    '[红]': '#fda4af', '[黄]': '#fde047', '[蓝]': '#93c5fd',
    '[绿]': '#86efac', '[白]': '#f8fafc', '[黑]': '#cbd5e1',
    '[守护]': '#67e8f9', '[飞翔]': '#a5b4fc', '[致盲]': '#c4b5fd'
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
    guard: gameAssetUrl('icons/buff_icons/guard.png'),
    sparkling: gameAssetUrl('icons/ui_icons/sparkling.png')
};
ICON_PATHS.blind = gameAssetUrl('icons/buff_icons/blind.png');

const PHASE_NAMES = {
    PLAYER_PLAY: '出牌阶段', PLAYER_DISCARD: '弃牌阶段',
    PLAYER_DEFEND: '防御阶段', ATTACK_MOD_CHOICE: '攻击修正', PLAYER_FIVE_CHOICE: '选择5效果',
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

function renderCard(card, w, h, selected) {
    if (window.CardStyle && window.CardStyle.renderCard) return window.CardStyle.renderCard(card, w, h, selected);
    return document.createElement('canvas');
}

// NPC hands are face-up in adventure mode. Mark their white cards so they
// remain visually distinct from the player's white cards without changing
// the shared card renderer or any card rules.
function markNpcWhiteCard(canvas, card) {
    if (canvas && card && card.isWhite && canvas.classList) canvas.classList.add('npc-white-card');
    return canvas;
}

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

function lighten(hex, amt) {
    let r = parseInt(hex.slice(1, 3), 16) + amt;
    let g = parseInt(hex.slice(3, 5), 16) + amt;
    let b = parseInt(hex.slice(5, 7), 16) + amt;
    r = Math.min(255, Math.max(0, r)); g = Math.min(255, Math.max(0, g)); b = Math.min(255, Math.max(0, b));
    return `#${r.toString(16).padStart(2,'0')}${g.toString(16).padStart(2,'0')}${b.toString(16).padStart(2,'0')}`;
}

function parseSegments(text, defaultColor) {
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
    return card ? `${cardId(card)}_${card.chosenColor || ''}` : '';
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
            const cv = renderCard(card, CARD_W, CARD_H, false);
            if (owner && owner !== 'player') markNpcWhiteCard(cv, card);
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
        const promises = Array.from({ length: Math.max(0, count) }, (_, i) => new Promise(resolve => {
            const spread = Math.min(24, 72 / Math.max(1, count - 1));
            const offsetX = (i - (count - 1) / 2) * spread;
            setTimeout(() => resolve(this.flyCardBack(srcEl, targetEl, 440, isPlayer ? 58 : 44, offsetX, isPlayer ? 2 : -2)), i * 82);
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
                    setTimeout(() => discardZone.classList.remove('discard-impact'), 180);
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
                    setTimeout(() => discardZone.classList.remove('discard-impact'), 260);
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
    constructor() {
        this._shakeTimer = null;
        this.state = null;
        this._prevState = null;
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
        this._lastAnimatedAIDefenseKey = null;
        this._animatedPlayerDraws = 0;
        this._npcHandFocusIndex = -1;
        this._selectedCombatItem = null;
        this._floatingTextLanes = { player: [], ai: [], ai2: [] };
        this.anim = new AnimLayer();
        this.dialogs = new DialogManager((method, params) => this._apiAction(method, params));
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
                { name: 'Otto', hp: 100, type: '战士', passive: '进攻时伤害>4可消耗1层【暴击】使攻击不可防御' }
            ];
        }
        this._buildSelectScreen();
    }

    _initParticles() {
        const canvas = document.createElement('canvas');
        canvas.id = 'particles-canvas';
        document.body.prepend(canvas);
        const ctx = canvas.getContext('2d');
        const particles = [];
        for (let i = 0; i < 15; i++) {
            particles.push({ x: Math.random() * 1200, y: Math.random() * 800,
                size: 2 + Math.random() * 3, phase: Math.random() * 360, speed: 0.5 + Math.random() * 1.5 });
        }
        function animate() {
            canvas.width = window.innerWidth; canvas.height = window.innerHeight;
            const now = Date.now(); ctx.clearRect(0, 0, canvas.width, canvas.height);
            for (const p of particles) {
                const px = (p.x + now / 40 * p.speed) % (canvas.width + 40) - 20;
                const py = (p.y + Math.sin(now / 2000 + p.phase) * 15) % canvas.height;
                const alpha = 0.06 + 0.04 * Math.sin(now / 1500 + p.phase);
                ctx.fillStyle = `rgba(255,255,255,${alpha})`;
                ctx.beginPath(); ctx.arc(px, py, p.size, 0, Math.PI * 2); ctx.fill();
            }
            requestAnimationFrame(animate);
        }
        animate();
    }

    _buildSelectScreen() {
        const chars = this.characters;
        const charColors = { Ryan: '#e74c3c', Leon: '#3498db', Chan: '#2ecc71',
            Saiki: '#9b59b6', Blaze: '#e67e22', Serenity: '#1abc9c', Moze: '#7f8c8d', Knight: '#8e44ad' };
        const charAvatar = { Ryan: 'avatars/Ryan.jpg', Leon: 'avatars/Leon.png', Chan: 'avatars/Chan.png', Saiki: 'avatars/Saiki.png', Blaze: 'avatars/Blaze.png', Serenity: 'avatars/Serenity.jpg', Moze: 'avatars/Moze.jpg', Knight: 'avatars/Knight.png', Otto: 'avatars/Otto.png' };

        let html = `<div class="home-shell${this._modeChosen ? ' home-shell-select' : ''}">`;
        html += `<header class="home-hero"><div class="game-title">Furry Trial</div>`;
        html += `<p class="home-tagline">${this._modeChosen ? (this._isAdventure ? '选择你的冒险主角' : '分配角色并开始对战') : '回合制卡牌对战 · 冒险启程'}</p></header>`;

        if (!this._modeChosen) {
            html += `<div class="home-panel home-panel-menu">`;
            html += `<button class="home-cta home-cta-adventure${this._isAdventure?' active':''}" id="adventure-start-btn" type="button">`;
            html += `<span class="home-cta-glow" aria-hidden="true"></span><span class="home-cta-icon" aria-hidden="true">⚔</span>`;
            html += `<span class="home-cta-copy"><span class="home-cta-label">开始冒险</span><span class="home-cta-hint">Roguelike 地牢探索</span></span></button>`;
            html += `<div class="home-section-label">对战模式</div>`;
            html += `<div class="mode-toggle home-mode-grid"><button class="mode-btn home-mode-btn${!this._is1v2&&!this._isLord&&!this._isAdventure?' active':''}" id="mode-1v1" type="button"><span class="home-mode-name">1v1</span><span class="home-mode-desc">单挑</span></button>`;
            html += `<button class="mode-btn home-mode-btn${this._is1v2&&!this._isLord?' active':''}" id="mode-1v2" type="button"><span class="home-mode-name">1v2</span><span class="home-mode-desc">双雄</span></button>`;
            html += `<button class="mode-btn home-mode-btn${this._isLord?' active':''}" id="mode-lord" type="button"><span class="home-mode-name">领主</span><span class="home-mode-desc">模式</span></button></div>`;
            html += `<div class="home-section-label">资料库</div>`;
            html += `<div class="home-secondary-row">`;
            html += `<button class="home-secondary-btn rules-entry-btn" id="rules-entry-btn" type="button"><span class="home-secondary-icon" aria-hidden="true">📖</span><span>规则介绍</span></button>`;
            html += `<button class="home-secondary-btn char-entry-btn" id="char-entry-btn" type="button"><span class="home-secondary-icon" aria-hidden="true">🎭</span><span>角色详情</span></button>`;
            html += `<button class="home-secondary-btn codex-entry-btn" id="codex-entry-btn" type="button"><span class="home-secondary-icon" aria-hidden="true">🗺</span><span>冒险图鉴</span></button>`;
            html += `</div></div></div>`;
            this.selectScreen.innerHTML = html;
            const m1 = document.getElementById('mode-1v1');
            const m2 = document.getElementById('mode-1v2');
            const mL = document.getElementById('mode-lord');
            if (m1) m1.addEventListener('click', () => { this._is1v2 = false; this._isLord = false; this._isAdventure = false; this._modeChosen = true; this._resetSelection(); this._buildSelectScreen(); });
            if (m2) m2.addEventListener('click', () => { this._is1v2 = true; this._isLord = false; this._isAdventure = false; this._modeChosen = true; this._resetSelection(); this._buildSelectScreen(); });
            if (mL) mL.addEventListener('click', () => { this._is1v2 = false; this._isLord = true; this._isAdventure = false; this._modeChosen = true; this._resetSelection(); this._buildSelectScreen(); });
            const advBtn = document.getElementById('adventure-start-btn');
            if (advBtn) advBtn.addEventListener('click', () => { this._is1v2 = false; this._isLord = false; this._isAdventure = true; this._modeChosen = true; this._resetSelection(); this._buildSelectScreen(); });
            const rulesBtn0 = document.getElementById('rules-entry-btn');
            if (rulesBtn0) rulesBtn0.addEventListener('click', () => {
                if (window.RulesPage) { window.RulesPage.build(); this.selectScreen.classList.remove('active'); document.getElementById('rules-screen').classList.add('active'); }
            });
            const charBtn0 = document.getElementById('char-entry-btn');
            if (charBtn0) charBtn0.addEventListener('click', () => {
                if (window.CharDetailPage) { window.CharDetailPage.show(document.getElementById('char-detail-screen')); this.selectScreen.classList.remove('active'); }
            });
            const codexBtn0 = document.getElementById('codex-entry-btn');
            if (codexBtn0) codexBtn0.addEventListener('click', () => {
                if (window.AdventureCodex) { window.AdventureCodex.show(document.getElementById('char-detail-screen')); this.selectScreen.classList.remove('active'); }
            });
            return;
        }

        html += `<div class="home-panel home-panel-select">`;
        html += `<button class="back-to-mode-btn" id="back-to-mode" type="button"><span aria-hidden="true">←</span> 返回模式选择</button>`;
        if (this._isAdventure) {
            html += `<div class="game-subtitle home-assign-status" id="assign-status">选择主角</div>`;
        } else {
            html += `<div class="assign-bar home-assign-bar"><button class="assign-btn active" id="assign-player" style="--ac:#3b82f6" type="button">玩家</button><button class="assign-btn" id="assign-bot1" style="--ac:#ef4444" type="button">Bot1</button>${(this._is1v2||this._isLord)?'<button class="assign-btn" id="assign-bot2" style="--ac:#a855f7" type="button">Bot2</button>':''}</div>`;
            html += `<div class="game-subtitle home-assign-status" id="assign-status">点击角色分配给 玩家</div>`;
        }
        html += `<div class="select-section"><div class="char-grid" id="char-grid">`;
        for (const ch of chars) {
            const avatar = charAvatar[ch.name];
            const iconHtml = avatar ? `<img class="char-avatar" src="${gameAssetUrl(avatar)}" alt="${ch.name}">` : `<div class="char-icon" style="background:${charColors[ch.name] || '#888'}">${ch.name[0]}</div>`;
            html += `<div class="char-card" data-name="${ch.name}">${iconHtml}<div class="char-name">${ch.name}</div><div class="char-type">${ch.type}</div><div class="char-hp">HP: ${ch.hp}</div><div class="char-passive">${ch.passive}</div><div class="char-role-label"></div></div>`;
        }
        html += `</div></div>`;
        html += `<button class="start-btn home-start-btn" id="start-btn" type="button" disabled><span class="home-start-shine" aria-hidden="true"></span>开始游戏</button>`;
        if (this._isAdventure) {
            html += `<button class="start-btn home-test-btn" id="adventure-test-btn" type="button" disabled>进入测试</button>`;
        }
        html += `</div></div>`;

        this.selectScreen.innerHTML = html;

        const updateAssignBtns = () => {
            const ap = document.getElementById('assign-player');
            if (ap) ap.classList.toggle('active', this._assignMode === 1);
            const b1 = document.getElementById('assign-bot1');
            if (b1) b1.classList.toggle('active', this._assignMode === 2);
            const b2 = document.getElementById('assign-bot2');
            if (b2) b2.classList.toggle('active', this._assignMode === 3);
            const labels = { 1: '玩家', 2: 'Bot1', 3: 'Bot2' };
            const status = document.getElementById('assign-status');
            if (status && !this._isAdventure) status.textContent = '点击角色分配给 ' + labels[this._assignMode];
        };

        const updateCardStyles = () => {
            this.selectScreen.querySelectorAll('.char-card').forEach(el => {
                const name = el.dataset.name;
                const isPlayer = this._selectedPlayerChar === name;
                const isBot = this._selectedAIChar === name;
                const isBot2 = this._selectedAI2Char === name;
                el.classList.remove('role-player', 'role-bot', 'role-bot2');
                if (isPlayer) el.classList.add('role-player');
                if (isBot) el.classList.add('role-bot');
                if (isBot2) el.classList.add('role-bot2');
                const label = el.querySelector('.char-role-label');
                const parts = [];
                if (isPlayer) parts.push('玩家');
                if (isBot) parts.push('Bot1');
                if (isBot2) parts.push('Bot2');
                label.textContent = parts.join(' & ');
            });
        };

        const checkReady = () => {
            const ready = this._isAdventure ? !!this._selectedPlayerChar : (this._selectedPlayerChar && this._selectedAIChar && (!(this._is1v2||this._isLord) || this._selectedAI2Char));
            document.getElementById('start-btn').disabled = !ready;
            const testBtn = document.getElementById('adventure-test-btn');
            if (testBtn) testBtn.disabled = !ready;
            if (ready && !this._isAdventure) {
                const s = this._selectedPlayerChar + ' (玩家)  vs  ' + this._selectedAIChar + ' (Bot1)';
                document.getElementById('assign-status').textContent = (this._is1v2||this._isLord) ? s + ' & ' + this._selectedAI2Char + ' (Bot2)' : s;
            }
        };

        const apBtn = document.getElementById('assign-player');
        if (apBtn) apBtn.addEventListener('click', () => { this._assignMode = 1; updateAssignBtns(); });
        const b1Btn = document.getElementById('assign-bot1');
        if (b1Btn) b1Btn.addEventListener('click', () => { this._assignMode = 2; updateAssignBtns(); });
        const b2Btn = document.getElementById('assign-bot2');
        if (b2Btn) b2Btn.addEventListener('click', () => { this._assignMode = 3; updateAssignBtns(); });

        this.selectScreen.querySelectorAll('.char-card').forEach(el => {
            el.addEventListener('click', () => {
                const name = el.dataset.name;
                if (this._isAdventure) {
                    this._selectedPlayerChar = name;
                } else if (this._assignMode === 1) this._selectedPlayerChar = name;
                else if (this._assignMode === 2) this._selectedAIChar = name;
                else if (this._assignMode === 3) this._selectedAI2Char = name;
                updateCardStyles();
                checkReady();
            });
        });

        document.getElementById('start-btn').addEventListener('click', () => {
            if (this._isAdventure) {
                if (this._selectedPlayerChar) window.location.href = 'adventure/adventure.html?char=' + encodeURIComponent(this._selectedPlayerChar);
                return;
            }
            console.log('[Start] isLord:', this._isLord, 'is1v2:', this._is1v2, 'player:', this._selectedPlayerChar, 'ai:', this._selectedAIChar, 'ai2:', this._selectedAI2Char);
            if (this._isLord) {
                if (this._selectedPlayerChar && this._selectedAIChar && this._selectedAI2Char) { console.log('[Start] calling _startGameLord, exists:', !!this._startGameLord); this._startGameLord ? this._startGameLord() : this._startGame1v2(); }
            } else if (this._is1v2) {
                if (this._selectedPlayerChar && this._selectedAIChar && this._selectedAI2Char) this._startGame1v2 ? this._startGame1v2() : this._startGame();
            } else {
                if (this._selectedPlayerChar && this._selectedAIChar) this._startGame();
            }
        });
        const testBtn = document.getElementById('adventure-test-btn');
        if (testBtn) testBtn.addEventListener('click', () => {
            if (this._isAdventure && this._selectedPlayerChar) {
                window.location.href = 'adventure/adventure.html?char=' + encodeURIComponent(this._selectedPlayerChar) + '&test=1';
            }
        });
        const mode1v1Btn = document.getElementById('mode-1v1');
        const mode1v2Btn = document.getElementById('mode-1v2');
        if (mode1v1Btn) mode1v1Btn.addEventListener('click', () => { this._is1v2 = false; this._isLord = false; this._isAdventure = false; this._resetSelection(); this._buildSelectScreen(); });
        if (mode1v2Btn) mode1v2Btn.addEventListener('click', () => { this._is1v2 = true; this._isLord = false; this._isAdventure = false; this._resetSelection(); this._buildSelectScreen(); });
        const modeLordBtn = document.getElementById('mode-lord');
        if (modeLordBtn) modeLordBtn.addEventListener('click', () => { this._is1v2 = false; this._isLord = true; this._isAdventure = false; this._resetSelection(); this._buildSelectScreen(); });
        const backBtn = document.getElementById('back-to-mode');
        if (backBtn) backBtn.addEventListener('click', () => { this._modeChosen = false; this._isAdventure = false; this._buildSelectScreen(); });

        const adventureBtn = document.getElementById('adventure-start-btn');
        if (adventureBtn) adventureBtn.addEventListener('click', () => {
            this._is1v2 = false; this._isLord = false; this._isAdventure = true; this._resetSelection(); this._buildSelectScreen();
        });
    }

    _resetSelection() {
        this._assignMode = 1;
        this._selectedPlayerChar = null;
        this._selectedAIChar = null;
        this._selectedAI2Char = null;
    }

    async _startGame() {
        await Bridge.call('selectMode', { mode1v2: this._is1v2 });
        const result = await Bridge.call('selectCharacters', { player: this._selectedPlayerChar, ai: this._selectedAIChar });
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
            .filter(evt => evt && evt.type === 'draw' && (evt.target || evt.who) === who)
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
        const fresh = await Bridge.getState();
        if (fresh && !fresh.error) this.state = fresh;
        this.updateDisplay();
    }

    _startPolling() {
        if (this._pollInterval) clearInterval(this._pollInterval);
        this._pollInterval = setInterval(() => {
            if (this._isPollingAI || this._isHandlingAction) return;
            if (this.state && (this.state.phase === 'AI_TURN' || this.state.phase === 'AI_DEFEND' || this.state.phase === 'AI2_TURN' || this.state.busy || (this.state.events && this.state.events.length))) {
                // All AI state changes must pass through the event-aware poller.
                // A plain state refresh can consume a newer event version without
                // playing/acknowledging that event, leaving settlement waiting forever.
                this._pollAI();
            }
        }, 500);
    }

    _buildGameScreen() {
        const s = this.state || {};
        const sceneLabels = { castle: '城堡', desert: '沙漠', forest: '森林', ocean: '冻洋', volcano: '火山' };
        const sceneName = sceneLabels[s.adventureScene] || '';
        const stageNum = s.adventureStage || s.stage || 1;
        const titleText = (s.isAdventure && sceneName) ? (sceneName + ' · 第' + stageNum + '层') : 'Furry Battle';
        let html = `
            <div class="game-title">${titleText}</div>
            <div class="top-bar">
                <div class="deck-area" id="deck-area">
                    <canvas id="deck-icon" width="40" height="52"></canvas>
                    <span class="deck-info" id="deck-info">牌堆: 0</span>
                </div>
                <span class="phase-info" id="phase-info">出牌阶段</span>
                <span class="turn-info" id="turn-info">回合 1</span>
                <button class="menu-btn" id="menu-btn">☰</button>
            </div>
            <div class="hp-section" id="ai-hp-section">
                <span class="attacker-indicator">进攻方</span>
                <img class="hp-avatar" id="ai-avatar" src="" alt="">
                <span class="hp-name" id="ai-name">AI</span>
                <div class="hp-bar-outer"><div class="hp-bar-inner" id="ai-hp-bar" style="width:100%"></div>
                <span class="hp-text" id="ai-hp-text">100/100</span></div>
                <div class="buff-icons" id="ai-buffs"></div>
                <div class="ai-deck-info" id="ai-deck-info" style="display:none"></div>
            </div>
            <div class="ai-area">
                <div class="ai-hand-zone"><div class="zone-title">AI 手牌</div>
                    <div class="ai-hand-row" id="ai-hand"></div></div>
                <div class="play-zone"><div class="play-zone-row">
                    <div class="attack-zone"><div class="zone-title">进攻</div>
                        <div class="zone-cards" id="atk-cards"><span style="color:rgba(255,255,255,0.5);font-size:0.7rem">等待出牌</span></div>
                        <div class="zone-desc" id="atk-desc"></div></div>
                    <div class="defend-zone"><div class="zone-title">防御</div>
                        <div class="zone-cards" id="def-cards"><span style="color:rgba(255,255,255,0.5);font-size:0.7rem">等待防御</span></div>
                        <div class="zone-desc" id="def-desc"></div></div>
                </div></div>
                <div class="reveal-zone"><div class="zone-title">判定</div>
                    <div class="reveal-card-area" id="reveal-cards"><span class="reveal-empty">等待判定</span></div>
                    <div class="reveal-desc" id="reveal-desc"></div></div>
                <div class="discard-zone"><div class="zone-title">弃牌库顶</div>
                    <div class="discard-card-area" id="discard-top"></div></div>
            </div>
            <div class="hp-section" id="player-hp-section">
                <span class="attacker-indicator">进攻方</span>
                <img class="hp-avatar" id="player-avatar" src="" alt="">
                <span class="hp-name" id="player-name">你</span>
                <div class="hp-bar-outer"><div class="hp-bar-inner" id="player-hp-bar" style="width:100%"></div>
                <span class="hp-text" id="player-hp-text">70/70</span></div>
                <div class="buff-icons" id="player-buffs"></div>
            </div>
            <div class="error-hint" id="error-hint"></div>
            <div class="adventure-info-bar" id="adventure-info-bar" style="display:none"></div>
            <div class="player-hand-zone"><div class="zone-title">你的手牌</div>
                <div class="hand-row" id="player-hand"></div></div>
            <div class="adventure-item-bar" id="adventure-item-bar" style="display:none"></div>
            <div class="action-desc" id="action-desc"></div>
            <div class="controls" id="controls"></div>`;
        this.gameScreen.innerHTML = html;
    }

    updateDisplay() {
        const s = this.state;
        if (!s || !s.player) return;
        const prev = this._prevState;
        if (prev && prev.phase !== s.phase) this._selectedCombatItem = null;

        document.getElementById('deck-info').textContent = `牌堆: ${s.deck}`;
        this._drawDeckIcon(s.deck);
        document.getElementById('turn-info').textContent = `回合 ${s.turn}`;
        let phaseText = s.phase === 'AI_DEFEND' && s.defenseSkipped ? '跳过防御' : (PHASE_NAMES[s.phase] || s.phase);
        if (s.isAdventure) phaseText = String(phaseText).replace(/AI2/g, '对手2').replace(/AI/g, '对手');
        document.getElementById('phase-info').textContent = phaseText;

        this._updateHpBar('player', s.player);
        this._updateHpBar('ai', s.ai);
        this._updateBuffs('player', s.player);
        this._updateBuffs('ai', s.ai);
        document.getElementById('player-name').textContent = this._combatDisplayName(s.player.name);
        document.getElementById('ai-name').textContent = this._combatDisplayName(s.ai.name);
        this._updateAvatar('player', s.player.name);
        this._updateAvatar('ai', s.ai.name);
        const activeAttacker = s.activeAttacker || (['AI_TURN', 'PLAYER_DEFEND', 'GUARD_CHOICE'].includes(s.phase) ? 'ai' : 'player');
        document.getElementById('player-hp-section').classList.toggle('active-attacker', activeAttacker === 'player');
        document.getElementById('ai-hp-section').classList.toggle('active-attacker', activeAttacker === 'ai');


        if (prev) this._detectAndPlayAnimations(prev, s);

        this._renderPlayerHand();
        this._renderAIHand();
        this._renderDiscardTop();
        this._renderZones();
        this._renderReveal();
        this._renderControls();
        this._updateAdventureInfo(s);
        this._renderAdventureItemBar(s);
        this._syncHandSkillTooltip();
        this._updateAdventureNpcLabels(s);

        if (s.pendingDialog === 'purify') {
            this.dialogs.showPurifyChoice(s.player, picked => {
                const kind = picked && picked.kind ? picked.kind : picked;
                this._apiAction('choosePurify', { kind });
            });
        } else if (s.pendingDialog === 'superPurify') {
            const targets = [{ key: 'player', label: '自己', ch: s.player }];
            if (s.ai && s.ai.alive) targets.push({ key: 'ai', label: s.ai.name + ' (对手)', ch: s.ai });
            if (s.is1v2 && s.ai2 && s.ai2.alive) targets.push({ key: 'ai2', label: s.ai2.name + ' (对手)', ch: s.ai2 });
            this.dialogs.showSuperPurifyChoice(targets, target => this._apiAction('chooseSuperPurifyTarget', { target }));
        } else if (s.pendingDialog === 'guard') {
            this.dialogs.showGuardChoice(s.player, s.pendingGuardDamage, choice => {
                if (choice && typeof choice === 'object') {
                    if (choice.action === 'fly') return this._apiAction('chooseFly');
                    if (choice.action === 'guard') return this._apiAction('chooseGuard', { stacks: choice.stacks });
                    return this._apiAction('chooseGuard', { stacks: 0 });
                }
                return this._apiAction('chooseGuard', { stacks: choice });
            });
        } else if (s.pendingDialog === 'flyRetry') {
            this.dialogs.showFlyRetryChoice(s.player, s.pendingGuardDamage, again => this._apiAction('chooseFlyContinue', { again }));
        } else if (s.pendingDialog === 'purifyCrystal') {
            const oppKey = s.is1v2 ? (s.attackTarget || 'ai') : 'ai';
            const opponent = s[oppKey];
            this.dialogs.showPurifyChoice(s.player, picked => {
                this._apiAction('choosePurifyCrystal', { choice: picked });
         }, { opponent, allowOpponent: true });
        } else if (s.pendingDialog === 'mozeSeven') {
            this.dialogs.showMozeSevenChoice(choice => this._apiAction('chooseMozeSeven', { choice }));
        } else if (s.pendingDialog === 'trophyDisarm') {
            const pending = s.pendingTrophyDisarm || {};
            this.dialogs.showOpponentCardChoice(this._opponentCardGroups(s, pending.targetKey), choice => this._apiAction('chooseTrophyDisarm', choice), '缴械 · 选择要弃掉的手牌');
        }

        if (s.phase === 'ATTACK_MOD_CHOICE') this._ensureAttackModChoicePrompt(s);
        else { this._attackModPromptOpen = false; this._attackModActive = false; }

        if (s.phase === 'GAME_OVER') this._showGameOver();
        this._prevState = s;
    }

    _detectAndPlayAnimations(prev, curr) {
        // Draw fly-ins are owned exclusively by 'draw' events. Speculative
        // detection here raced with hand re-render and caused duplicate cards.
        this._animatedPlayerDraws = 0;

        if (curr.player && prev.player) {
            if (!curr.isAdventure && curr.player.guard > prev.player.guard) this.playFloatingText(`+${curr.player.guard - prev.player.guard}[守护]`, '#00bcd4', 'player');
            if (curr.player.bloodthirst && !prev.player.bloodthirst) this.playFloatingText('[嗜血触发]', '#ff315f', 'player');
            if (!curr.player.bloodthirst && prev.player.bloodthirst) this.playFloatingText('[退出嗜血]', '#f5b6c5', 'player');
            if (curr.player.chaos_red && !prev.player.chaos_red) this.playFloatingText('[混沌-红]', '#ff4444', 'player');
            if (curr.player.chaos_yellow && !prev.player.chaos_yellow) this.playFloatingText('[混沌-黄]', '#ffcc00', 'player');
            if (curr.player.chaos_blue && !prev.player.chaos_blue) this.playFloatingText('[混沌-蓝]', '#4488ff', 'player');
            if (curr.player.chaos_green && !prev.player.chaos_green) this.playFloatingText('[混沌-绿]', '#44cc44', 'player');
            if (!curr.player.chaos_red && prev.player.chaos_red) this.playFloatingText('[清除混沌红]', '#ff8888', 'player');
            if (!curr.player.chaos_yellow && prev.player.chaos_yellow) this.playFloatingText('[清除混沌黄]', '#ffee88', 'player');
            if (!curr.player.chaos_blue && prev.player.chaos_blue) this.playFloatingText('[清除混沌蓝]', '#88bbff', 'player');
            if (!curr.player.chaos_green && prev.player.chaos_green) this.playFloatingText('[清除混沌绿]', '#88ee88', 'player');
        }
        if (curr.ai && prev.ai) {
            if (!curr.isAdventure && curr.ai.guard > prev.ai.guard) this.playFloatingText(`+${curr.ai.guard - prev.ai.guard}[守护]`, '#00bcd4', 'ai');
            if (curr.ai.bloodthirst && !prev.ai.bloodthirst) this.playFloatingText('[嗜血触发]', '#ff315f', 'ai');
            if (!curr.ai.bloodthirst && prev.ai.bloodthirst) this.playFloatingText('[退出嗜血]', '#f5b6c5', 'ai');
            if (curr.ai.chaos_red && !prev.ai.chaos_red) this.playFloatingText('[混沌-红]', '#ff4444', 'ai');
            if (curr.ai.chaos_yellow && !prev.ai.chaos_yellow) this.playFloatingText('[混沌-黄]', '#ffcc00', 'ai');
            if (curr.ai.chaos_blue && !prev.ai.chaos_blue) this.playFloatingText('[混沌-蓝]', '#4488ff', 'ai');
            if (curr.ai.chaos_green && !prev.ai.chaos_green) this.playFloatingText('[混沌-绿]', '#44cc44', 'ai');
            if (!curr.ai.chaos_red && prev.ai.chaos_red) this.playFloatingText('[清除混沌红]', '#ff8888', 'ai');
            if (!curr.ai.chaos_yellow && prev.ai.chaos_yellow) this.playFloatingText('[清除混沌黄]', '#ffee88', 'ai');
            if (!curr.ai.chaos_blue && prev.ai.chaos_blue) this.playFloatingText('[清除混沌蓝]', '#88bbff', 'ai');
            if (!curr.ai.chaos_green && prev.ai.chaos_green) this.playFloatingText('[清除混沌绿]', '#88ee88', 'ai');
        }
    }

    _updateAttackerIndicator(who) {
        const is1v2 = this.state && this.state.is1v2;
        document.getElementById('player-hp-section')?.classList.toggle('active-attacker', who === 'player');
        document.getElementById('ai-hp-section')?.classList.toggle('active-attacker', who === 'ai');
        if (is1v2) {
            document.getElementById('ai2-hp-section')?.classList.toggle('active-attacker', who === 'ai2');
            document.getElementById('ai-hp-section')?.classList.toggle('selected-target', this.state?.attackTarget === 'ai' && who === 'player');
            document.getElementById('ai2-hp-section')?.classList.toggle('selected-target', this.state?.attackTarget === 'ai2' && who === 'player');
        }
    }

    _updateAvatar(prefix, name) {
        const el = document.getElementById(`${prefix}-avatar`);
        if (!el) return;
        const charName = (name || '').replace(/^AI\d*\s+/, '');
        if (charName && charName !== el.dataset.char) {
            el.dataset.char = charName;
            const monsterDef = window.AdventureRegistry && window.AdventureRegistry.getMonster(charName);
            const bossDef = window.AdventureRegistry && window.AdventureRegistry.getBoss(charName);
            const advDef = monsterDef || bossDef;
            if (advDef && advDef.icon) {
                el.src = gameAssetUrl(advDef.icon.replace(/^\.\.\//, ''));
                el.onerror = () => { el.src = gameAssetUrl(`avatars/${charName}.png`); el.onerror = () => { el.src = gameAssetUrl(`avatars/${charName}.jpg`); el.onerror = null; }; };
            } else {
                el.src = gameAssetUrl(`avatars/${charName}.png`);
                el.onerror = () => { el.src = gameAssetUrl(`avatars/${charName}.jpg`); el.onerror = null; };
            }
        }
    }

    _updateHpBar(prefix, ch) {
        if (!ch) return;
        const key = `${ch.hp}/${ch.maxHp}`;
        const bar = document.getElementById(`${prefix}-hp-bar`);
        const text = document.getElementById(`${prefix}-hp-text`);
        if (!bar || !text || bar.dataset.hpKey === key) return;
        bar.dataset.hpKey = key;
        const pct = Math.max(0, (ch.hp / ch.maxHp) * 100);
        bar.style.width = pct + '%';
        bar.className = 'hp-bar-inner' + (pct <= 25 ? ' critical' : pct <= 50 ? ' low' : '');
        text.textContent = key;
    }

    _updateBuffs(prefix, ch) {
        const container = document.getElementById(`${prefix}-buffs`);
        if (!container) return;
        const prevKeys = this._prevBuffKeys || (this._prevBuffKeys = {});
        const prevSet = new Set(prevKeys[prefix] || []);
        const currentKeys = [];
        const currentStacks = {};
        let html = '';
        const buffs = [
            { key: 'burn', stacks: ch.burn, icon: 'burn', colorClass: 'burn-buff' },
            { key: 'freeze', stacks: ch.frozen ? 1 : 0, icon: 'freeze', colorClass: 'freeze-buff' },
            { key: 'bleed', stacks: ch.bleed, icon: 'bleed', colorClass: 'bleed-buff' },
            { key: 'poison', stacks: ch.poison || 0, icon: 'poison', colorClass: 'poison-buff' },
            { key: 'blind', stacks: ch.blind || 0, icon: 'blind', colorClass: 'blind-buff', hideCount: true },
            { key: 'bomb', stacks: ch.bomb || 0, path: gameAssetUrl('icons/items_icons/time_bomb.png'), label: '炸弹', hideCount: false },
            { key: 'guard', stacks: ch.guard, icon: 'guard', colorClass: 'guard-buff' },
            { key: 'fly', stacks: ch.fly || 0, icon: 'fly', colorClass: 'fly-buff' },
            { key: 'lush', stacks: ch.lush || 0, icon: 'lush', colorClass: 'lush-buff' },
            { key: 'crit', stacks: ch.crit || 0, label: '暴击', colorClass: 'crit-buff' },
            { key: 'chaos_red', stacks: ch.chaos_red ? 1 : 0, icon: 'chaos_red', hideCount: true, colorClass: 'chaos-red-buff' },
            { key: 'chaos_yellow', stacks: ch.chaos_yellow ? 1 : 0, icon: 'chaos_yellow', hideCount: true, colorClass: 'chaos-yellow-buff' },
            { key: 'chaos_blue', stacks: ch.chaos_blue ? 1 : 0, icon: 'chaos_blue', hideCount: true, colorClass: 'chaos-blue-buff' },
            { key: 'chaos_green', stacks: ch.chaos_green ? 1 : 0, icon: 'chaos_green', hideCount: true, colorClass: 'chaos-green-buff' }
        ];
        if (ch.bloodthirst) buffs.push({ key: 'bloodthirst', stacks: 1, path: gameAssetUrl('icons/ui_icons/blood_thirsty.png'), label: '嗜血', hideCount: true });
        if (ch.bindMark) buffs.push({ key: 'bind', stacks: 1, path: gameAssetUrl('icons/items_icons/binding.png'), label: '捆缚', hideCount: true });
        for (const b of buffs) {
            if (b.stacks > 0) {
                currentKeys.push(b.key);
                currentStacks[b.key] = b.stacks;
                const path = b.path || gameAssetUrl(`icons/buff_icons/${b.icon}.png`);
                const title = b.label || ({ burn: '灼烧', freeze: '冷冻', bleed: '流血', poison: '中毒', blind: '致盲', guard: '守护', fly: '飞翔', lush: '茂盛', crit: '暴击', chaos_red: '混沌红', chaos_yellow: '混沌黄', chaos_blue: '混沌蓝', chaos_green: '混沌绿' }[b.key] || b.key);
                const animCls = !prevSet.has(b.key) ? ' icon-appear' : '';
                const specialClass = b.key === 'bloodthirst' ? 'bloodthirst-buff' : b.key === 'bind' ? 'bind-mark' : b.key === 'bomb' ? 'bomb-mark' : b.colorClass || '';
                html += `<div class="buff-icon-wrap ${specialClass}${animCls}" title="${title}" aria-label="${title}"><img src="${path}" alt="${title}">${b.hideCount ? '' : `<span class="buff-count">${b.stacks}</span>`}${b.label ? `<span class="buff-name">${b.label}</span>` : ''}</div>`;
            }
        }
        const currentSet = new Set(currentKeys);
        const removed = [...prevSet].filter(k => !currentSet.has(k));
        const prevStacks = (this._prevBuffStacks || (this._prevBuffStacks = {}))[prefix] || {};
        let stacksChanged = currentKeys.length !== prevSet.size;
        if (!stacksChanged) {
            for (const k of currentKeys) {
                if (!prevSet.has(k) || prevStacks[k] !== currentStacks[k]) { stacksChanged = true; break; }
            }
        }
        prevKeys[prefix] = currentKeys;
        (this._prevBuffStacks || (this._prevBuffStacks = {}))[prefix] = currentStacks;
        if (!stacksChanged && !removed.length) return;
        if (removed.length) {
            container.querySelectorAll('.buff-icon-wrap').forEach(el => {
                const title = el.getAttribute('title');
                const keyMap = { '灼烧': 'burn', '冷冻': 'freeze', '流血': 'bleed', '中毒': 'poison', '致盲': 'blind', '炸弹': 'bomb', '守护': 'guard', '飞翔': 'fly', '暴击': 'crit', '嗜血': 'bloodthirst', '捆缚': 'bind' };
                const key = Object.keys(keyMap).find(k => title === k);
                if (key && removed.includes(keyMap[key])) el.classList.add('icon-disappear');
            });
            setTimeout(() => { container.innerHTML = html; }, 160);
        } else {
            container.innerHTML = html;
        }
    }

    async _playCardByDoubleClick(index) {
        const state = this.state;
        if (!state || !Array.isArray(state.playerHand)) return;
        const phase = state.phase;
        if (phase !== 'PLAYER_PLAY' && phase !== 'PLAYER_DEFEND') return;
        if (state.needColorChoice || (phase === 'PLAYER_DEFEND' && state.unblockDefend)) return;
        if (this._isHandlingAction) return;
        const card = state.playerHand[index];
        if (!card || (state.legalHand && state.legalHand[index] === false)) return;
        this._npcHandFocusIndex = -1;
        if (state.selectedCard !== index) {
            const selected = await Bridge.call('selectCard', { index });
            if (!selected || selected.error) return;
            this.state = selected;
            this.updateDisplay();
        }
        const action = phase === 'PLAYER_DEFEND' ? 'doDefend' : 'doPlay';
        if (typeof this._apiAction === 'function') await this._apiAction(action);
        else {
            const result = await Bridge.call(action);
            if (result && !result.error) { this.state = result; this.updateDisplay(); }
        }
    }

    _renderPlayerHand(options = {}) {
        const s = this.state;
        const container = document.getElementById('player-hand');
        if (!container || !s || !s.playerHand) return;
        const hideTrailing = this._hideTrailingCount(options, 'player');
        const canInteract = ['PLAYER_PLAY', 'PLAYER_DEFEND', 'PLAYER_FIVE_CHOICE',
            'PLAYER_SEVEN_CHOICE', 'SAIKI_THREE_CHOICE', 'SAIKI_SIX_JUDGE', 'PLAYER_DISCARD'].includes(s.phase);
        const isDefend = s.phase === 'PLAYER_DEFEND';
        const handKey = JSON.stringify([
            s.phase,
            s.selectedCard,
            s.selectedCards || [],
            s.needColorChoice,
            s.unblockDefend,
            s.legalHand || null,
            hideTrailing,
            (s.playerHand || []).map(cardVisualKey),
            (s.chanFiveCards || []).map(cardVisualKey)
        ]);
        if (container.dataset.handRenderKey === handKey && container.children.length === s.playerHand.length) return;
        container.dataset.handRenderKey = handKey;
        container.innerHTML = '';
        container.ondblclick = null;
        for (let i = 0; i < s.playerHand.length; i++) {
            const card = s.playerHand[i];
            const sel = i === s.selectedCard || ((s.selectedCards || []).includes(i));
            const cv = renderCard(card, CARD_W, CARD_H, sel);
            if (!canInteract) cv.classList.add('disabled');
            else if (s.legalHand && s.legalHand[i]) cv.classList.add('card-playable');
            else if (s.legalHand && !s.legalHand[i]) cv.classList.add('card-unplayable');
            if (hideTrailing && i >= s.playerHand.length - hideTrailing) cv.classList.add('card-draw-pending');
            cv.dataset.index = i;
            cv.dataset.cardId = cardId(card);
            cv.addEventListener('click', async (event) => {
                if (cv.classList.contains('disabled')) return;
                const idx = parseInt(cv.dataset.index);
                if (!Number.isInteger(idx)) return;
                this._npcHandFocusIndex = -1;
                const now = Date.now();
                const previous = this._lastPlayerHandClick;
                const isDoubleClick = previous && previous.index === idx && now - previous.time < 600;
                if (isDoubleClick) {
                    // The browser dispatches two click events before dblclick.
                    // Do not let the second click toggle the selected card off.
                    this._lastPlayerHandClick = null;
                    event.preventDefault();
                    if (previous.promise) await previous.promise;
                    await this._playCardByDoubleClick(idx);
                    return;
                }
                this._lastPlayerHandClick = { index: idx, time: now, promise: null };
                const selection = (async () => {
                    const result = await Bridge.call('selectCard', { index: idx });
                    if (result && !result.error) { this.state = result; this.updateDisplay(); }
                })();
                this._lastPlayerHandClick.promise = selection;
                await selection;
            });

            if (sel && canInteract) {
                cv.addEventListener('mouseenter', () => {
                    if (this._npcHandFocusIndex >= 0) return;
                    this._showTooltip(card, cv, isDefend);
                });
                cv.addEventListener('mouseleave', () => this._syncHandSkillTooltip());
            }
            container.appendChild(cv);
        }
        if (s.chanFiveCards && s.chanFiveCards.length > 0) {
            this.dialogs.showChanFiveDialog(s);
        }
    }

    _resolveHandSkillDesc(charName, card, isDefend, adventureOpts) {
        let desc = '';
        if (adventureOpts) {
            const bridge = window.AdventureMonsterBridge;
            if (bridge && typeof bridge.getAdventureNpcSkillDesc === 'function') {
                desc = bridge.getAdventureNpcSkillDesc(charName, card, isDefend, adventureOpts) || '';
            }
        }
        if (!desc && typeof getSkillDesc === 'function') {
            desc = getSkillDesc(charName, card, isDefend) || '';
        }
        return desc;
    }

    _showTooltip(card, anchorEl, isDefend, opts = {}) {
        this._hideTooltip();
        const s = this.state;
        if (!s || !card) return;
        const charName = opts.charName || card.borrowedMonsterName || (s.player ? s.player.name.replace(/^AI\d*\s+/, '') : '');
        if (!charName) return;
        let desc = this._resolveHandSkillDesc(charName, card, isDefend, opts.adventureOpts);
        if (!desc && opts.adventureOpts) desc = isDefend ? '无防御效果' : '无进攻效果';
        if (!desc) return;

        const tip = document.createElement('div');
        tip.id = 'card-tooltip';
        tip.className = 'card-tooltip';

        const title = document.createElement('div');
        title.className = 'tooltip-title';
        title.textContent = charName + ' ' + (card.isItemCard ? (card.isBlack ? '黑牌' : card.isWhite ? '白牌' : '道具') : card.value + '牌');
        tip.appendChild(title);

        const body = document.createElement('div');
        body.className = 'tooltip-body';
        const segs = parseSegments(desc, '#e6e6f0');
        for (const seg of segs) {
            const span = document.createElement('span');
            span.textContent = seg.text;
            span.style.color = seg.color;
            body.appendChild(span);
        }
        tip.appendChild(body);
        document.body.appendChild(tip);

        if (anchorEl) {
            const r = anchorEl.getBoundingClientRect();
            tip.style.left = Math.min(r.left, window.innerWidth - tip.offsetWidth - 10) + 'px';
            tip.style.top = Math.max(10, r.top - tip.offsetHeight - 8) + 'px';
        } else {
            tip.style.left = (window.innerWidth / 2 - tip.offsetWidth / 2) + 'px';
            tip.style.top = '80px';
        }
    }

    _hideTooltip() {
        const el = document.getElementById('card-tooltip');
        if (el) el.remove();
    }

    /** 玩家/NPC 手牌技能说明共用 card-tooltip，二者互斥 */
    _syncHandSkillTooltip() {
        this._hideTooltip();
        const legacy = document.getElementById('ai-hand-skills');
        if (legacy) legacy.remove();

        const s = this.state;
        if (!s) return;

        if (s.isAdventure && this._npcHandFocusIndex >= 0 && Array.isArray(s.aiHand)) {
            const card = s.aiHand[this._npcHandFocusIndex];
            const showDefend = s.phase === 'PLAYER_PLAY';
            const showAttack = s.phase === 'PLAYER_DEFEND';
            if (card && (showDefend || showAttack)) {
                const charName = this._combatDisplayName(s.ai && s.ai.name);
                const adventureOpts = {
                    stage: s.adventureStage || s.stage || 1,
                    playerHandSize: (s.playerHand && s.playerHand.length) || 0,
                    incomingDamage: s.pendingDefenseDamage || 0
                };
                this._showTooltip(card, null, showDefend, { charName, adventureOpts });
                return;
            }
        }

        const canInteract = ['PLAYER_PLAY', 'PLAYER_DEFEND', 'PLAYER_FIVE_CHOICE',
            'PLAYER_SEVEN_CHOICE', 'SAIKI_THREE_CHOICE', 'SAIKI_SIX_JUDGE', 'PLAYER_DISCARD'].includes(s.phase);
        if (s.selectedCard >= 0 && canInteract && s.playerHand) {
            const card = s.playerHand[s.selectedCard];
            if (card) this._showTooltip(card, null, s.phase === 'PLAYER_DEFEND');
        }
    }

    _combatDisplayName(name) {
        return String(name || '').replace(/^AI\d*\s+/, '');
    }

    _updateAdventureNpcLabels(s) {
        const zone = document.querySelector('.ai-hand-zone > .zone-title');
        if (!zone) return;
        if (s && s.isAdventure) {
            const nm = this._combatDisplayName(s.ai && s.ai.name);
            zone.textContent = (nm || '对手') + ' 手牌';
        } else {
            zone.textContent = 'AI 手牌';
        }
    }

    _findHandCardElement(handEl, card) {
        if (!handEl || !card) return null;
        const wantId = cardId(card);
        const wantMatch = cardMatchKey(card);
        const nodes = Array.from(handEl.querySelectorAll('.card-canvas'));
        let match = nodes.find(el => el.dataset && el.dataset.cardId === wantId);
        if (match) return match;
        match = nodes.find(el => el.dataset && el.dataset.cardMatch === wantMatch);
        if (match) return match;
        return null;
    }

    _renderAIHand(options = {}) {
        const s = this.state;
        const container = document.getElementById('ai-hand');
        if (!container || !s) return;
        const canSelect = s.phase === 'OPPONENT_CARD_CHOICE' || (s.phase === 'PLAYER_SEVEN_CHOICE' && !s.chanFourSwapMode && !s.chanSevenKeepMode) || (s.phase === 'SAIKI_THREE_CHOICE' && !s.saikiThreeDrawn);
        const handSize = s.aiHandSize || 0;
        const hideTrailing = this._hideTrailingCount(options, 'ai');
        const revealMode = !!s.aiHand && Array.isArray(s.aiHand);
        const canPeekSkill = !!(s.isAdventure && revealMode && (s.phase === 'PLAYER_PLAY' || s.phase === 'PLAYER_DEFEND'));
        const aiHandKey = JSON.stringify([
            s.phase, handSize, revealMode, canSelect, s.selectedAICard,
            this._npcHandFocusIndex, hideTrailing,
            s.chanSevenKeepMode, s.chanSevenChosenCard ? cardId(s.chanSevenChosenCard) : null,
            revealMode ? s.aiHand.map(cardVisualKey) : null
        ]);
        const expectedChildren = handSize + (s.chanSevenKeepMode && s.chanSevenChosenCard ? 1 : 0);
        if (container.dataset.handRenderKey === aiHandKey && container.children.length === expectedChildren) return;
        container.dataset.handRenderKey = aiHandKey;
        container.innerHTML = '';
        if (!canPeekSkill) this._npcHandFocusIndex = -1;
        else if (this._npcHandFocusIndex >= handSize) this._npcHandFocusIndex = -1;

        for (let i = 0; i < handSize; i++) {
            const card = revealMode ? s.aiHand[i] : null;
            const focused = canPeekSkill && i === this._npcHandFocusIndex;
            const cv = revealMode ? renderCard(card, 40, 58, focused) : renderCardBack(40, 58);
            markNpcWhiteCard(cv, card);
            if (revealMode && card) {
                cv.dataset.cardId = cardId(card);
                cv.dataset.cardMatch = cardMatchKey(card);
            }
            cv.dataset.aiIndex = i;
            if (hideTrailing && i >= handSize - hideTrailing) cv.classList.add('card-draw-pending');
            if (canSelect) {
                cv.style.cursor = 'pointer'; cv.classList.add('selectable-ai-card');
                if (i === s.selectedAICard) cv.style.border = '3px solid #ffdc3c';
                cv.addEventListener('click', async () => {
                    await this._apiAction('chooseAICard', { index: parseInt(cv.dataset.aiIndex, 10) });
                });
            } else if (canPeekSkill) {
                cv.style.cursor = 'pointer';
                cv.classList.add('selectable-ai-card');
                if (focused) cv.style.border = '3px solid #a78bfa';
                cv.addEventListener('click', async () => {
                    const idx = parseInt(cv.dataset.aiIndex, 10);
                    this._npcHandFocusIndex = this._npcHandFocusIndex === idx ? -1 : idx;
                    const selected = this.state && this.state.selectedCard;
                    if (this._npcHandFocusIndex >= 0 && selected >= 0) {
                        const result = await Bridge.call('selectCard', { index: selected });
                        if (result && !result.error) this.state = result;
                    }
                    this.updateDisplay();
                });
            }
            container.appendChild(cv);
        }
        if (s.chanSevenKeepMode && s.chanSevenChosenCard) {
            const revealed = renderCard(s.chanSevenChosenCard, 50, 72, false);
            revealed.classList.add('ai-revealed-card');
            revealed.style.marginLeft = '8px';
            container.appendChild(revealed);
        }
    }

    _canUseAdventureCombatItem(s, def) {
        if (!s || !s.isAdventure || !def) return false;
        if (s.busy) return false;
        if (s.needColorChoice) return false;
        if (s.player && (s.player.blind || 0) > 0 && def.kind === 'consumable') return false;
        if (def.combatUse === 'attackMod') return false;
        const scene = def.useScene || 'combat';
        if (scene !== 'combat' && scene !== 'both') return false;
        if (def.combatUse === 'dodge' || def.defendOnly) {
            return s.phase === 'PLAYER_DEFEND' && !!s.pendingAttack;
        }
        if (def.combatUse === 'bind') {
            return s.phase === 'PLAYER_PLAY' && !s.bindUsedThisTurn;
        }
        if (def.combatUse === 'chameleonPaint') {
            return s.phase === 'PLAYER_PLAY';
        }
        // 仅在可选出牌/防御牌时（含不可防御跳过窗口）；其他子阶段不可用
        return s.phase === 'PLAYER_PLAY' || s.phase === 'PLAYER_DEFEND';
    }

    _showCardMasterChoice(onChoose) {
        if (document.getElementById('card-master-choice-dialog')) return;
        const overlay = document.createElement('div');
        overlay.id = 'card-master-choice-dialog';
        overlay.className = 'dialog-overlay';
        overlay.innerHTML = '<div class="dialog-box" style="max-width:360px">' +
            '<div class="dialog-title">卡牌大师</div>' +
            '<div class="dialog-body" style="color:rgba(255,255,255,0.8);font-size:0.85rem;margin-bottom:12px">选择一项效果</div>' +
            '<div class="dialog-buttons" style="display:flex;flex-direction:column;gap:6px">' +
            '<button class="ctrl-btn btn-play" id="cm-draw2" style="width:100%">抽取两张牌</button>' +
            '<button class="ctrl-btn btn-discard" id="cm-mulligan" style="width:100%">弃掉全部手牌并重抽同等数量</button>' +
            '<button class="ctrl-btn btn-skip" id="cm-cancel" style="width:100%">取消</button>' +
            '</div></div>';
        document.body.appendChild(overlay);
        const close = () => overlay.remove();
        overlay.querySelector('#cm-draw2').addEventListener('click', () => { close(); onChoose('draw2'); });
        overlay.querySelector('#cm-mulligan').addEventListener('click', () => { close(); onChoose('mulligan'); });
        overlay.querySelector('#cm-cancel').addEventListener('click', close);
        overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
    }

    _renderAdventureItemBar(s) {
        const bar = document.getElementById('adventure-item-bar');
        if (!bar) return;
        const advEngine = window.AdventureCombatBridge && window.AdventureCombatBridge.activeEngine && window.AdventureCombatBridge.activeEngine()._adventureEngine;
        if (!s.isAdventure || !advEngine) {
            bar.style.display = 'none';
            bar.dataset.itemBarKey = 'hidden';
            return;
        }
        const snap = advEngine.snapshot();
        const consumables = snap.consumables || [];
        const slots = snap.consumableSlots || 6;
        const inAttackMod = s.phase === 'ATTACK_MOD_CHOICE';
        const itemBarKey = JSON.stringify([
            s.phase, s.needColorChoice, s.busy, s.bindUsedThisTurn,
            s.pendingAttack ? [s.pendingAttack.damage, s.pendingAttack.unblock] : null,
            s.player && s.player.blind,
            this._selectedCombatItem, this._attackModSelectedItem,
            slots,
            consumables.map(item => item ? [item.name, item.displayName, item.description, item.icon] : null),
            (snap.accessories || []).map(item => item ? [item.name, item.displayName, item.description, item.icon] : null)
        ]);
        if (bar.dataset.itemBarKey === itemBarKey) return;
        bar.dataset.itemBarKey = itemBarKey;
        bar.style.display = 'flex';

        let html = '<div class="adv-item-bar-title">道具</div><div class="adv-combat-item-slots">';
        const prevItems = this._prevItemNames || (this._prevItemNames = []);
        const currentItemNames = [];
        for (let i = 0; i < slots; i++) {
            const item = consumables[i];
            if (!item) {
                html += '<div class="adv-combat-item-slot empty" title="空道具槽"></div>';
                continue;
            }
            currentItemNames.push(item.name);
            const def = window.AdventureRegistry.getItem(item.name);
            const isAttackModItem = def && def.combatUse === 'attackMod';
            const canUse = this._canUseAdventureCombatItem(s, def);
            const selectable = inAttackMod && this._isAttackModSelectableIndex(i, s);
            const selected = selectable && this._attackModSelectedItem === i;
            const itemSelected = !inAttackMod && canUse && this._selectedCombatItem === i;
            const isNew = !prevItems.includes(item.name);
            let cls = 'adv-combat-item-slot filled adv-combat-item';
            if (selectable) cls += ' attack-mod-selectable';
            if (selected) cls += ' attack-mod-selected';
            if (itemSelected) cls += ' item-selected';
            if (!canUse && !selectable) cls += ' disabled';
            if (isNew) cls += ' icon-appear';
            let modBadge = '';
            if (isAttackModItem && def.attackModUnblock) modBadge = '<span class="adv-combat-item-bonus">破防</span>';
            else if (isAttackModItem && def.attackModBonus) modBadge = '<span class="adv-combat-item-bonus">+' + def.attackModBonus + '</span>';
            html += '<button class="' + cls + '" data-item-index="' + i + '" title="' + (item.description || item.displayName) + '"' + ((!canUse && !selectable) ? ' disabled' : '') + '>' +
                (item.icon ? '<img src="' + item.icon + '" alt="' + item.displayName + '">' : '') +
                '<span class="adv-combat-item-name">' + item.displayName + '</span>' +
                modBadge +
                '</button>';
        }
        html += '</div>';

        const accessories = snap.accessories || [];
        const prevAccs = this._prevAccNames || (this._prevAccNames = []);
        const currentAccNames = accessories.map(a => a.name);
        if (accessories.length) {
            html += '<div class="adv-combat-acc-section"><div class="adv-item-bar-title">配饰</div><div class="adv-combat-acc-slots">';
            accessories.forEach((item) => {
                const tip = item.displayName + ' — ' + item.description;
                const animCls = !prevAccs.includes(item.name) ? ' icon-appear' : '';
                html += '<div class="adv-combat-acc-slot' + animCls + '" title="' + tip + '">' +
                    (item.icon ? '<img src="' + item.icon + '" alt="' + item.displayName + '">' : '') +
                    '</div>';
            });
            html += '</div></div>';
        }

        const removedItems = prevItems.filter(n => !currentItemNames.includes(n));
        const removedAccs = prevAccs.filter(n => !currentAccNames.includes(n));
        this._prevItemNames = currentItemNames;
        this._prevAccNames = currentAccNames;
        const hasRemoved = removedItems.length || removedAccs.length;
        if (hasRemoved) {
            bar.querySelectorAll('.adv-combat-item-slot.filled').forEach(el => {
                const title = el.getAttribute('title') || '';
                if (removedItems.some(n => { const d = window.AdventureRegistry.getItem(n); return d && title === (d.description || d.displayName); }))
                    el.classList.add('icon-disappear');
            });
            bar.querySelectorAll('.adv-combat-acc-slot').forEach(el => {
                const title = (el.getAttribute('title') || '').split(' — ')[0];
                if (removedAccs.some(n => { const d = window.AdventureRegistry.getItem(n); return d && d.displayName === title; }))
                    el.classList.add('icon-disappear');
            });
            setTimeout(() => { bar.innerHTML = html; this._bindItemBarEvents(bar, consumables, s, inAttackMod); }, 160);
        } else {
            bar.innerHTML = html;
            this._bindItemBarEvents(bar, consumables, s, inAttackMod);
        }
    }

    _bindItemBarEvents(bar, consumables, s, inAttackMod) {
        bar.querySelectorAll('[data-item-index]').forEach(btn => {
            btn.addEventListener('click', async () => {
                const idx = parseInt(btn.getAttribute('data-item-index'), 10);
                const item = consumables[idx];
                const def = item && window.AdventureRegistry.getItem(item.name);
                if (inAttackMod && def && def.combatUse === 'attackMod' && this._isAttackModSelectableIndex(idx, s)) {
                    this._attackModSelectedItem = (this._attackModSelectedItem === idx) ? null : idx;
                    this._renderAdventureItemBar(this.state);
                    const confirmBtn = document.getElementById('btn-attack-mod-confirm');
                    if (confirmBtn) confirmBtn.disabled = this._attackModSelectedItem == null;
                    return;
                }
                if (btn.classList.contains('disabled')) return;
                this._selectedCombatItem = (this._selectedCombatItem === idx) ? null : idx;
                this._renderAdventureItemBar(this.state);
                this._updateUseItemButton();
            });
        });
    }

    _updateUseItemButton() {
        const btn = document.getElementById('btn-use-item');
        if (!btn) return;
        const idx = this._selectedCombatItem;
        if (idx == null) { btn.disabled = true; btn.textContent = '使用道具'; return; }
        const advEngine = window.AdventureCombatBridge && window.AdventureCombatBridge.activeEngine && window.AdventureCombatBridge.activeEngine()._adventureEngine;
        const snap = advEngine && advEngine.snapshot();
        const item = snap && (snap.consumables || [])[idx];
        btn.disabled = false;
        btn.textContent = item ? '使用[' + item.displayName + ']' : '使用道具';
    }

    async _useSelectedCombatItem() {
        const idx = this._selectedCombatItem;
        if (idx == null) return;
        const s = this.state;
        const advEngine = window.AdventureCombatBridge && window.AdventureCombatBridge.activeEngine && window.AdventureCombatBridge.activeEngine()._adventureEngine;
        if (!advEngine || !s) return;
        const snap = advEngine.snapshot();
        const consumables = snap.consumables || [];
        const item = consumables[idx];
        const def = item && window.AdventureRegistry.getItem(item.name);
        if (!item || !def) { this._selectedCombatItem = null; return; }
        if (!this._canUseAdventureCombatItem(s, def)) return;
        const run = async (choice) => {
            const payload = { itemIndex: idx };
            if (choice != null) {
                if (Array.isArray(choice)) payload.choices = choice;
                else payload.choice = choice;
            }
            const result = await Bridge.call('useAdventureCombatItem', payload);
            if (result && !result.error) {
                this._prevState = this.state;
                this.state = result;
                if (result.events && result.events.length) {
                    await this._consumeEvents(result.events);
                }
                this.updateDisplay();
            }
        };
        this._selectedCombatItem = null;
        if (def.combatUse === 'cardMaster') {
            this._showCardMasterChoice(choice => { void run(choice); });
            return;
        }
        if (def.combatUse === 'purify') {
            const player = s.player;
            const oppKey = s.attackTarget || (s.activeAttacker === 'ai2' ? 'ai2' : 'ai');
            const opponent = s[oppKey] && s[oppKey].alive ? s[oppKey] : (s.ai && s.ai.alive ? s.ai : null);
            const hasBuff = ch => ch && ((ch.burn || 0) > 0 || (ch.bleed || 0) > 0 ||
                (ch.poison || 0) > 0 || (ch.blind || 0) > 0 || (ch.bomb || 0) > 0 || ch.frozen || (ch.guard || 0) > 0 || (ch.fly || 0) > 0 || (ch.crit || 0) > 0);
            if (!hasBuff(player) && !hasBuff(opponent)) return;
            this.dialogs.collectPurifyChoices(player, def.purifyCount || 1, choices => {
                if (!choices.length) return;
                void run(choices);
            }, { opponent });
            return;
        }
        if (def.combatUse === 'buffTransfer') {
            const player = s.player;
            const hasBuff = ch => ch && ((ch.burn || 0) > 0 || (ch.bleed || 0) > 0 ||
                (ch.poison || 0) > 0 || (ch.blind || 0) > 0 || (ch.bomb || 0) > 0 || ch.frozen || (ch.guard || 0) > 0 || (ch.fly || 0) > 0 || (ch.crit || 0) > 0);
            if (!hasBuff(player)) return;
            this.dialogs.showBuffTransferChoice(player, choice => { void run(choice); });
            return;
        }
        if (def.combatUse === 'chameleonPaint') {
            const groups = this._opponentCardGroups(s);
            if (!groups.some(group => group.cards && group.cards.length)) return;
            this.dialogs.showOpponentCardChoice(groups, choice => { void run(choice); }, '变色龙颜料 · 选择要暂借的牌');
            return;
        }
        await run(null);
    }

    _opponentCardGroups(s, onlyKey) {
        if (!s) return [];
        const keys = onlyKey ? [onlyKey] : (s.is1v2 ? ['ai', 'ai2'] : ['ai']);
        return keys.filter(key => s[key] && s[key].alive !== false).map(key => ({
            key,
            label: s[key].name ? `${s[key].name} · 手牌` : key,
            cards: Array.isArray(s[key + 'Hand']) ? s[key + 'Hand'] : (key === 'ai' && Array.isArray(s.aiHand) ? s.aiHand : [])
        }));
    }

    _updateAdventureInfo(s) {
        const bar = document.getElementById('adventure-info-bar');
        if (!bar) return;
        if (!s.isAdventure) {
            bar.style.display = 'none';
            bar.dataset.infoKey = 'hidden';
            return;
        }
        const infoKey = JSON.stringify([
            s.adventureGold,
            s.adventureBeastTokens || {},
            s.aiDeckCount,
            s.aiDiscardCount
        ]);
        if (bar.dataset.infoKey === infoKey) return;
        bar.dataset.infoKey = infoKey;
        bar.style.display = 'flex';
        const AC = window.AdventureCurrency;
        let html = '';
        if (AC && AC.GOLD_ICON && s.adventureGold != null) {
            html += '<span class="adv-info-currency"><img src="' + AC.GOLD_ICON + '" class="adv-info-icon" alt="金币">' + s.adventureGold + '</span>';
        }
        if (AC && AC.BEAST_ICON && s.adventureBeastTokens) {
            const tokens = s.adventureBeastTokens;
            for (const k of AC.ALL_BEAST_TYPES) {
                if (tokens[k] > 0) {
                    html += '<span class="adv-info-currency"><img src="' + AC.BEAST_ICON[k] + '" class="adv-info-icon" alt="' + (AC.BEAST_LABEL[k] || k) + '">' + tokens[k] + '</span>';
                }
            }
        }
        bar.innerHTML = html;

        const deckInfo = document.getElementById('ai-deck-info');
        if (deckInfo) {
            if (s.aiDeckCount != null) {
                deckInfo.style.display = '';
                deckInfo.innerHTML = '<span class="ai-deck-count">牌库 ' + s.aiDeckCount + '</span>' +
                    (s.aiDiscardCount != null ? '<span class="ai-discard-count">弃牌 ' + s.aiDiscardCount + '</span>' : '');
            } else {
                deckInfo.style.display = 'none';
            }
        }
    }

    _renderDiscardTop() {
        const s = this.state;
        const container = document.getElementById('discard-top');
        if (!container || !s) return;
        const key = s.discardTop ? cardVisualKey(s.discardTop) : 'empty';
        if (container.dataset.cardKey === key) return;
        container.dataset.cardKey = key;
        container.innerHTML = '';
        if (s.discardTop) {
            const cv = renderCard(s.discardTop, CARD_W - 10, CARD_H - 14, false);
            cv.classList.add('disabled'); cv.style.cursor = 'default';
            container.appendChild(cv);
        } else {
            container.innerHTML = '<span style="color:rgba(255,255,255,0.5);font-size:0.7rem">空</span>';
        }
    }

    _renderZones() {
        const s = this.state;
        const atkContainer = document.getElementById('atk-cards');
        const defContainer = document.getElementById('def-cards');

        const atkKey = s.atkCard ? JSON.stringify(s.atkCard) : 'empty';
        const defKey = s.defCard ? JSON.stringify(s.defCard) : 'empty';
        if (atkContainer.dataset.cardKey !== atkKey && s.atkCard) {
            atkContainer.innerHTML = '';
            const cv = renderCard(s.atkCard, CARD_W - 10, CARD_H - 14, false);
            cv.classList.add('zone-card');
            if (s.atkOwner && s.atkOwner !== 'player') markNpcWhiteCard(cv, s.atkCard);
            atkContainer.appendChild(cv);
            atkContainer.dataset.cardKey = atkKey;
            this._showCardSkillDesc('atk-desc', s.atkCard, s.atkOwner || 'player', false);
        } else if (atkContainer.dataset.cardKey !== 'empty' && !s.atkCard) {
            atkContainer.innerHTML = '<span style="color:rgba(255,255,255,0.5);font-size:0.7rem">等待出牌</span>';
            atkContainer.dataset.cardKey = 'empty';
            this._hideZoneDesc('atk-desc');
        }

        if (defContainer.dataset.cardKey !== defKey && s.defCard) {
            defContainer.innerHTML = '';
            const cv = renderCard(s.defCard, CARD_W - 10, CARD_H - 14, false);
            cv.classList.add('zone-card');
            if (s.defOwner && s.defOwner !== 'player') markNpcWhiteCard(cv, s.defCard);
            defContainer.appendChild(cv);
            defContainer.dataset.cardKey = defKey;
            this._showCardSkillDesc('def-desc', s.defCard, s.defOwner || 'player', true);
        } else if (defContainer.dataset.cardKey !== 'empty' && !s.defCard) {
            defContainer.innerHTML = '<span style="color:rgba(255,255,255,0.5);font-size:0.7rem">等待防御</span>';
            defContainer.dataset.cardKey = 'empty';
            this._hideZoneDesc('def-desc');
        }
    }

    _renderReveal() {
        const box = document.getElementById('reveal-cards');
        if (!box) return;
        // The state returned by the engine already contains the result of the
        // whole defense resolution.  Do not let that final snapshot paint a
        // judgment card while its preceding defense-card event is still being
        // animated; the reveal event itself owns the judgment area meanwhile.
        if (this._isConsumingEvents) return;
        const cards = this.state.revealCards || [];
        const key = JSON.stringify(cards);
        if (box.dataset.cardKey === key) return;
        box.innerHTML = '';
        if (!cards.length) box.innerHTML = '<span class="reveal-empty">等待判定</span>';
        for (const card of cards) {
            const cv = renderCard(card, CARD_W - 10, CARD_H - 14, false);
            cv.classList.add('revealed-card'); box.appendChild(cv);
        }
        box.dataset.cardKey = key;
    }


    // Turn controls and API actions are composed from ui_controls.js.
    // Event queue coordination is composed from ui_events.js.

    // Rendering and visual card animation are composed from ui_renderer.js.
    showError(msg) {
        const el = document.getElementById('error-hint');
        if (!el) return;
        el.textContent = msg; setTimeout(() => { el.textContent = ''; }, 2000);
    }

    _showGameOver() {
        this.dialogs.showGameOver(this.state, async () => {
            await Bridge.call('restart');
            this.state = null; this._prevState = null;
            if (this._pollInterval) clearInterval(this._pollInterval);
            this.gameScreen.classList.remove('active');
            this.selectScreen.classList.add('active');
            this._selectedPlayerChar = null; this._selectedAIChar = null;
            this._buildSelectScreen();
        });
    }

}

// Classic-script class declarations live in the global lexical scope, but are
// not exposed as properties on window. Adventure mode performs an explicit
// capability check before handing combat to the shared 1v1 UI, so export both
// classes deliberately.
window.AnimLayer = AnimLayer;
window.GameUI = GameUI;

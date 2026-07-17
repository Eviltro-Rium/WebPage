const CARD_W = 70, CARD_H = 100;
const CARD_COLORS = {
    RED: { top: '#ff1e28', bot: '#b3141c' },
    YELLOW: { top: '#ffc300', bot: '#b38a00' },
    BLUE: { top: '#0082ff', bot: '#005bb3' },
    GREEN: { top: '#00c83c', bot: '#008c2a' },
    BLACK: { top: '#3a3545', bot: '#22202a' },
    WHITE: { top: '#e8e8ed', bot: '#b8b8c2' }
};

const TAG_COLORS = {
    '[生命]': '#86efac', '[伤害]': '#fda4af', '[灼烧]': '#fdba74',
    '[冷冻]': '#93c5fd', '[流血]': '#fb7185', '[牌]': '#c4b5fd',
    '[战斗]': '#fcd34d', '[交换]': '#c4b5fd', '[洗入]': '#c4b5fd',
    '[净化]': '#ddd6fe', '[解冻]': '#bae6fd',
    '[红]': '#fda4af', '[黄]': '#fde047', '[蓝]': '#93c5fd',
    '[绿]': '#86efac', '[白]': '#f8fafc', '[黑]': '#cbd5e1',
    '[守护]': '#67e8f9'
};

const ICON_PATHS = {
    black: 'icons/card_icons/color_palette.png',
    potion: 'icons/card_icons/potion.png',
    draw_three: 'icons/card_icons/draw_cards.png',
    purify: 'icons/card_icons/purify.png',
    super_purify: 'icons/card_icons/super_purify.png',
    swap: 'icons/card_icons/swap_cards.png',
    shuffle: 'icons/card_icons/shuffle.png',
    burn: 'icons/buff_icons/burn.png',
    freeze: 'icons/buff_icons/freeze.png',
    bleed: 'icons/buff_icons/bleed.png',
    guard: 'icons/buff_icons/guard.png',
    sparkling: 'icons/ui_icons/sparkling.png'
};

const PHASE_NAMES = {
    PLAYER_PLAY: '出牌阶段', PLAYER_DISCARD: '弃牌阶段',
    PLAYER_DEFEND: '防御阶段', PLAYER_FIVE_CHOICE: '选择5效果',
    PLAYER_SEVEN_CHOICE: '选择对手牌', SAIKI_THREE_CHOICE: '选择对手牌',
    SAIKI_SIX_JUDGE: '判定选择', AI_TURN: 'AI回合', AI2_TURN: 'AI2回合',
    AI_DEFEND: 'AI防御中', CHAN_FIVE_REORDER: '排列牌库顶', OPPONENT_CARD_CHOICE: '选择对手手牌', GUARD_CHOICE: '选择守护', TARGET_CHOICE: '选择目标', GAME_OVER: '游戏结束'
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
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    c.className = 'card-canvas' + (selected ? ' selected' : '');
    const g = c.getContext('2d');
    const col = CARD_COLORS[card.color] || CARD_COLORS.BLACK;
    const hasChosen = card.chosenColor && (card.isBlack || card.isWhite);
    const chosenCol = hasChosen ? CARD_COLORS[card.chosenColor] : null;
    const useDarkInk = card.color === 'YELLOW' || card.color === 'WHITE';

    g.save(); g.beginPath(); roundRect(g, 2, 2, w - 5, h - 5, 10); g.clip();
    const grad = g.createLinearGradient(0, 0, w, h);
    grad.addColorStop(0, col.top); grad.addColorStop(1, col.bot);
    g.fillStyle = grad; g.fillRect(0, 0, w, h);

    if (hasChosen && card.isBlack) {
        g.globalAlpha = 0.4;
        const cg = g.createLinearGradient(0, 0, w, h);
        cg.addColorStop(0, chosenCol.top); cg.addColorStop(1, chosenCol.bot);
        g.fillStyle = cg; g.fillRect(0, 0, w, h); g.globalAlpha = 1;
        g.save(); g.translate(w / 2, h / 2); g.rotate(-0.5);
        const sw = w * 0.38, sh = h * 0.28;
        const sg = g.createLinearGradient(-sw, -sh / 2, sw, sh / 2);
        sg.addColorStop(0, lighten(chosenCol.top, 30)); sg.addColorStop(1, chosenCol.bot);
        g.fillStyle = sg; roundRect(g, -sw, -sh / 2, sw * 2, sh, 4); g.fill();
        g.fillStyle = 'rgba(255,255,255,0.15)'; g.fillRect(-sw, -sh / 2, sw * 2, sh * 0.35);
        g.restore();
        g.strokeStyle = 'rgba(0,0,0,0.1)'; g.lineWidth = 1;
        roundRect(g, 5, 5, w - 12, h - 12, 8); g.stroke();
    } else if (hasChosen && card.isWhite) {
        g.globalAlpha = 0.3;
        const cg = g.createLinearGradient(0, 0, w, h);
        cg.addColorStop(0, chosenCol.top); cg.addColorStop(1, chosenCol.bot);
        g.fillStyle = cg; g.fillRect(0, 0, w, h); g.globalAlpha = 1;
        const bandH = h * 0.16, bandY = h - bandH - 6;
        const bg = g.createLinearGradient(0, bandY, 0, bandY + bandH);
        bg.addColorStop(0, lighten(chosenCol.top, 30)); bg.addColorStop(1, chosenCol.bot);
        g.fillStyle = bg; roundRect(g, 5, bandY, w - 12, bandH, 5); g.fill();
        g.fillStyle = 'rgba(255,255,255,0.25)'; g.fillRect(5, bandY, w - 12, bandH / 2);
        const topH = h * 0.10, topY = 6;
        g.globalAlpha = 0.5; g.fillStyle = cg; roundRect(g, 5, topY, w - 12, topH, 5); g.fill();
        g.fillStyle = 'rgba(255,255,255,0.2)'; g.fillRect(5, topY, w - 12, topH / 2);
        g.globalAlpha = 1;
    }
    g.restore();

    if (hasChosen) {
        g.strokeStyle = chosenCol.top; g.lineWidth = 2.5; g.globalAlpha = 0.7;
        roundRect(g, 3, 3, w - 7, h - 7, 10); g.stroke(); g.globalAlpha = 1;
    } else {
        g.strokeStyle = 'rgba(255,255,255,0.6)'; g.lineWidth = 2;
        roundRect(g, 2, 2, w - 5, h - 5, 10); g.stroke();
    }
    const shine = g.createLinearGradient(0, 0, 0, h / 2);
    shine.addColorStop(0, 'rgba(255,255,255,0.25)'); shine.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = shine; g.beginPath(); roundRect(g, 4, 4, w - 10, h / 2, 8); g.fill();

    let iconName = null, textVal = null;
    if (card.isBlack) { iconName = card.shuffleToDeck ? 'shuffle' : card.drawTwo ? 'draw_three' : 'black'; }
    else if (card.superPurify) iconName = 'super_purify';
    else if (card.purify) iconName = 'purify';
    else if (card.potion) iconName = 'potion';
    else if (card.drawThree) iconName = 'draw_three';
    else if (card.swapHand) iconName = 'swap';
    else textVal = String(card.value);

    if (iconName) {
        const img = loadIcon(iconName);
        if (img.complete && img.naturalWidth > 0) {
            const iw = w * 0.45; g.drawImage(img, (w - iw) / 2, (h - iw) / 2, iw, iw);
        } else {
            g.font = `bold ${w * 0.35}px Arial`; g.textAlign = 'center'; g.textBaseline = 'middle';
            const label = card.isBlack ? (card.shuffleToDeck ? '洗' : card.drawTwo ? '+2' : '黑') :
                card.superPurify ? '超净' : card.purify ? '净' : card.potion ? '药' :
                card.drawThree ? '+3' : '换';
            g.fillStyle = useDarkInk ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.65)';
            g.fillText(label, w / 2 + 1, h / 2 + 1);
            g.fillStyle = useDarkInk ? '#172033' : '#fff'; g.fillText(label, w / 2, h / 2);
        }
    } else if (textVal) {
        const fs = w > 80 ? 42 : 32;
        g.font = `bold ${fs}px Arial`; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillStyle = useDarkInk ? 'rgba(255,255,255,0.75)' : 'rgba(0,0,0,0.65)';
        g.fillText(textVal, w / 2 + 1, h / 2 + 1);
        g.fillStyle = useDarkInk ? '#172033' : '#fff'; g.fillText(textVal, w / 2, h / 2);
    }

    let cornerIcon = null, cornerText = null;
    if (card.isBlack) cornerIcon = 'black';
    else if (card.superPurify) cornerIcon = 'super_purify';
    else if (card.purify) cornerIcon = 'purify';
    else if (card.potion) cornerIcon = 'potion';
    else if (card.swapHand) cornerIcon = 'swap';
    else if (card.drawThree) cornerIcon = 'draw_three';
    else cornerText = String(card.value);

    if (cornerIcon) {
        const img = loadIcon(cornerIcon);
        if (img.complete && img.naturalWidth > 0) g.drawImage(img, 4, 3, 14, 14);
    } else if (cornerText) {
        g.font = `bold ${w > 80 ? 13 : 10}px Arial`; g.textAlign = 'left'; g.textBaseline = 'top';
        g.fillStyle = useDarkInk ? '#172033' : 'rgba(255,255,255,0.95)';
        g.fillText(cornerText, 5, 3);
    }

    if (selected) {
        g.strokeStyle = 'rgba(160,80,220,0.7)'; g.lineWidth = 3;
        roundRect(g, 1, 1, w - 3, h - 3, 10); g.stroke();
        g.strokeStyle = 'rgba(160,80,220,0.25)'; g.lineWidth = 7;
        roundRect(g, 1, 1, w - 3, h - 3, 10); g.stroke();
    }
    return c;
}

function renderCardBack(w, h) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h; c.className = 'card-back-canvas';
    const g = c.getContext('2d');
    const grad = g.createLinearGradient(0, 0, w, h);
    grad.addColorStop(0, '#4682f0'); grad.addColorStop(1, '#1e50c8');
    g.fillStyle = grad; roundRect(g, 1, 1, w - 3, h - 3, 10); g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.5)'; g.lineWidth = 1.5;
    roundRect(g, 1, 1, w - 3, h - 3, 10); g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect(3, 3, w - 7, h / 2);
    g.strokeStyle = 'rgba(255,255,255,0.4)'; g.lineWidth = 1;
    roundRect(g, 6, 6, w - 14, h - 14, 7); g.stroke();
    const img = loadIcon('sparkling');
    if (img.complete && img.naturalWidth > 0) {
        const iw = w * 0.35; g.drawImage(img, (w - iw) / 2, (h - iw) / 2, iw, iw);
    } else {
        g.font = `bold ${w * 0.4}px Arial`; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillStyle = 'rgba(255,255,255,0.3)'; g.fillText('?', w / 2, h / 2);
    }
    return c;
}

function roundRect(ctx, x, y, w, h, r) {
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
    return `${card.color}_${card.value}_${card.isBlack}_${card.isWhite}_${card.potion}_${card.purify}_${card.superPurify}_${card.swapHand}_${card.shuffleToDeck}_${card.drawThree}_${card.chosenColor || ''}`;
}

class AnimLayer {
    constructor() { this.animating = false; }

    flyCard(card, fromEl, toEl, duration, arcHeight) {
        return new Promise(resolve => {
            const fromRect = fromEl.getBoundingClientRect();
            const toRect = toEl.getBoundingClientRect();
            const flyEl = document.createElement('div');
            flyEl.className = 'fly-card';
            const cv = renderCard(card, CARD_W, CARD_H, false);
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
                const ease = 1 - Math.pow(1 - t, 3);
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
                const ease = 1 - Math.pow(1 - t, 3);
                const x = sx + (ex - sx) * ease;
                const y = sy + (ey - sy) * ease - Math.sin(ease * Math.PI) * arc;
                const scale = 1 + 0.15 * Math.sin(ease * Math.PI);
                flyEl.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;
                flyEl.style.opacity = t < 0.1 ? t / 0.1 : t > 0.85 ? (1 - t) / 0.15 : 1;
                if (t < 1) requestAnimationFrame(tick);
                else { flyEl.remove(); resolve(); }
            };
            requestAnimationFrame(tick);
        });
    }

    async drawCards(count, isPlayer, targetEl) {
        const srcEl = document.getElementById('deck-area') || document.querySelector('.top-bar') || document.body;
        const promises = [];
        for (let i = 0; i < count; i++) {
            if (i) await new Promise(r => setTimeout(r, 115));
            const spread = Math.min(24, 72 / Math.max(1, count - 1));
            const offsetX = (i - (count - 1) / 2) * spread;
            promises.push(this.flyCardBack(srcEl, targetEl, 420, isPlayer ? 58 : 44, offsetX, isPlayer ? 2 : -2));
        }
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
                const ease = 1 - Math.pow(1 - t, 3);
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
        this._isPollingAI = false;
        this._isHandlingAction = false;
        this._isConsumingEvents = false;
        this._lastAnimatedAIDefenseKey = null;
        this._animatedPlayerDraws = 0;
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
                { name: 'Knight', hp: 80, type: '混沌', passive: '进攻前清除混沌；打出基础颜色数字牌获得对应混沌' }
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
        const charAvatar = { Ryan: 'avatars/Ryan.jpg', Leon: 'avatars/Leon.png', Chan: 'avatars/Chan.png', Saiki: 'avatars/Saiki.png', Blaze: 'avatars/Blaze.png', Serenity: 'avatars/Serenity.jpg', Moze: 'avatars/Moze.jpg', Knight: 'avatars/Knight.png' };

        this._assignMode = 1;
        this._selectedPlayerChar = null;
        this._selectedAIChar = null;
        this._selectedAI2Char = null;

        let html = `<div class="game-title">Furry Battle</div>`;
        html += `<div class="mode-toggle"><button class="mode-btn${!this._is1v2&&!this._isLord?' active':''}" id="mode-1v1">1v1 单挑</button><button class="mode-btn${this._is1v2&&!this._isLord?' active':''}" id="mode-1v2">1v2 双雄</button><button class="mode-btn${this._isLord?' active':''}" id="mode-lord">领主模式</button></div>`;
        html += `<div class="assign-bar"><button class="assign-btn active" id="assign-player" style="--ac:#3b82f6">玩家</button><button class="assign-btn" id="assign-bot1" style="--ac:#ef4444">Bot1</button>${(this._is1v2||this._isLord)?'<button class="assign-btn" id="assign-bot2" style="--ac:#a855f7">Bot2</button>':''}</div>`;
        html += `<div class="game-subtitle" id="assign-status">点击角色分配给 玩家</div>`;
        html += `<div class="select-section"><div class="char-grid" id="char-grid">`;
        for (const ch of chars) {
            const avatar = charAvatar[ch.name];
            const iconHtml = avatar ? `<img class="char-avatar" src="${avatar}" alt="${ch.name}">` : `<div class="char-icon" style="background:${charColors[ch.name] || '#888'}">${ch.name[0]}</div>`;
            html += `<div class="char-card" data-name="${ch.name}">${iconHtml}<div class="char-name">${ch.name}</div><div class="char-type">${ch.type}</div><div class="char-hp">HP: ${ch.hp}</div><div class="char-passive">${ch.passive}</div><div class="char-role-label"></div></div>`;
        }
        html += `</div></div>`;
        html += `<button class="start-btn" id="start-btn" disabled>开始对战</button>`;
        html += `<button class="start-btn rules-entry-btn" id="rules-entry-btn">规则介绍</button>`;
        html += `<button class="start-btn char-entry-btn" id="char-entry-btn">角色详情</button>`;
        this.selectScreen.innerHTML = html;

        const updateAssignBtns = () => {
            document.getElementById('assign-player').classList.toggle('active', this._assignMode === 1);
            document.getElementById('assign-bot1').classList.toggle('active', this._assignMode === 2);
            const b2 = document.getElementById('assign-bot2');
            if (b2) b2.classList.toggle('active', this._assignMode === 3);
            const labels = { 1: '玩家', 2: 'Bot1', 3: 'Bot2' };
            document.getElementById('assign-status').textContent = '点击角色分配给 ' + labels[this._assignMode];
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
            const ready = this._selectedPlayerChar && this._selectedAIChar && (!(this._is1v2||this._isLord) || this._selectedAI2Char);
            document.getElementById('start-btn').disabled = !ready;
            if (ready) {
                const s = this._selectedPlayerChar + ' (玩家)  vs  ' + this._selectedAIChar + ' (Bot1)';
                document.getElementById('assign-status').textContent = (this._is1v2||this._isLord) ? s + ' & ' + this._selectedAI2Char + ' (Bot2)' : s;
            }
        };

        document.getElementById('assign-player').addEventListener('click', () => { this._assignMode = 1; updateAssignBtns(); });
        document.getElementById('assign-bot1').addEventListener('click', () => { this._assignMode = 2; updateAssignBtns(); });
        const b2Btn = document.getElementById('assign-bot2');
        if (b2Btn) b2Btn.addEventListener('click', () => { this._assignMode = 3; updateAssignBtns(); });

        this.selectScreen.querySelectorAll('.char-card').forEach(el => {
            el.addEventListener('click', () => {
                const name = el.dataset.name;
                if (this._assignMode === 1) this._selectedPlayerChar = name;
                else if (this._assignMode === 2) this._selectedAIChar = name;
                else if (this._assignMode === 3) this._selectedAI2Char = name;
                updateCardStyles();
                checkReady();
            });
        });

        document.getElementById('start-btn').addEventListener('click', () => {
            console.log('[Start] isLord:', this._isLord, 'is1v2:', this._is1v2, 'player:', this._selectedPlayerChar, 'ai:', this._selectedAIChar, 'ai2:', this._selectedAI2Char);
            if (this._isLord) {
                if (this._selectedPlayerChar && this._selectedAIChar && this._selectedAI2Char) { console.log('[Start] calling _startGameLord, exists:', !!this._startGameLord); this._startGameLord ? this._startGameLord() : this._startGame1v2(); }
            } else if (this._is1v2) {
                if (this._selectedPlayerChar && this._selectedAIChar && this._selectedAI2Char) this._startGame1v2 ? this._startGame1v2() : this._startGame();
            } else {
                if (this._selectedPlayerChar && this._selectedAIChar) this._startGame();
            }
        });
        const mode1v1Btn = document.getElementById('mode-1v1');
        const mode1v2Btn = document.getElementById('mode-1v2');
        if (mode1v1Btn) mode1v1Btn.addEventListener('click', () => { this._is1v2 = false; this._isLord = false; this._selectedAI2Char = null; this._buildSelectScreen(); });
        if (mode1v2Btn) mode1v2Btn.addEventListener('click', () => { this._is1v2 = true; this._isLord = false; this._selectedAI2Char = null; this._buildSelectScreen(); });
        const modeLordBtn = document.getElementById('mode-lord');
        if (modeLordBtn) modeLordBtn.addEventListener('click', () => { this._is1v2 = false; this._isLord = true; this._selectedAI2Char = null; this._buildSelectScreen(); });
        const rulesBtn = document.getElementById('rules-entry-btn');
        if (rulesBtn) rulesBtn.addEventListener('click', () => {
            if (window.RulesPage) {
                window.RulesPage.build();
                this.selectScreen.classList.remove('active');
                document.getElementById('rules-screen').classList.add('active');
            }
        });
        const charBtn = document.getElementById('char-entry-btn');
        if (charBtn) charBtn.addEventListener('click', () => {
            if (window.CharDetailPage) {
                window.CharDetailPage.show(document.getElementById('char-detail-screen'));
                this.selectScreen.classList.remove('active');
            }
        });
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
        this._startPolling();
    }

    _startPolling() {
        if (this._pollInterval) clearInterval(this._pollInterval);
        this._pollInterval = setInterval(() => {
            if (this._isPollingAI || this._isHandlingAction) return;
            if (this.state && (this.state.phase === 'AI_TURN' || this.state.phase === 'AI_DEFEND' || this.state.phase === 'AI2_TURN' || this.state.busy)) {
                // All AI state changes must pass through the event-aware poller.
                // A plain state refresh can consume a newer event version without
                // playing/acknowledging that event, leaving settlement waiting forever.
                this._pollAI();
            }
        }, 500);
    }

    _buildGameScreen() {
        let html = `
            <div class="game-title">Furry Battle</div>
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
            <div class="player-hand-zone"><div class="zone-title">你的手牌</div>
                <div class="hand-row" id="player-hand"></div></div>
            <div class="action-desc" id="action-desc"></div>
            <div class="controls" id="controls"></div>`;
        this.gameScreen.innerHTML = html;
    }

    updateDisplay() {
        const s = this.state;
        if (!s || !s.player) return;
        const prev = this._prevState;

        document.getElementById('deck-info').textContent = `牌堆: ${s.deck}`;
        this._drawDeckIcon(s.deck);
        document.getElementById('turn-info').textContent = `回合 ${s.turn}`;
        document.getElementById('phase-info').textContent = s.phase === 'AI_DEFEND' && s.defenseSkipped ? '跳过防御' : (PHASE_NAMES[s.phase] || s.phase);

        this._updateHpBar('player', s.player);
        this._updateHpBar('ai', s.ai);
        this._updateBuffs('player', s.player);
        this._updateBuffs('ai', s.ai);
        document.getElementById('player-name').textContent = s.player.name;
        document.getElementById('ai-name').textContent = s.ai.name;
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

        if (s.pendingDialog === 'purify') {
            this.dialogs.showPurifyChoice(s.player, kind => this._apiAction('choosePurify', { kind }));
        } else if (s.pendingDialog === 'superPurify') {
            const targets = [{ key: 'player', label: '自己', ch: s.player }];
            if (s.ai && s.ai.alive) targets.push({ key: 'ai', label: s.ai.name + ' (对手)', ch: s.ai });
            if (s.is1v2 && s.ai2 && s.ai2.alive) targets.push({ key: 'ai2', label: s.ai2.name + ' (对手)', ch: s.ai2 });
            this.dialogs.showSuperPurifyChoice(targets, target => this._apiAction('chooseSuperPurifyTarget', { target }));
        } else if (s.pendingDialog === 'guard') {
            this.dialogs.showGuardChoice(s.player, s.pendingGuardDamage, stacks => this._apiAction('chooseGuard', { stacks }));
        }

        if (s.phase === 'GAME_OVER') this._showGameOver();
        this._prevState = JSON.parse(JSON.stringify(s));
    }

    _detectAndPlayAnimations(prev, curr) {
        const prevHandIds = (prev.playerHand || []).map(cardId);
        const currHandIds = (curr.playerHand || []).map(cardId);

        const unmatchedPrevious = [...prevHandIds];
        const drawnIds = [];
        for (const id of currHandIds) {
            const previousIndex = unmatchedPrevious.indexOf(id);
            if (previousIndex >= 0) unmatchedPrevious.splice(previousIndex, 1);
            else drawnIds.push(id);
        }


        const detectedDraws = Math.max(0, drawnIds.length - this._animatedPlayerDraws);
        this._animatedPlayerDraws = 0;
        if (detectedDraws > 0) {
            const handEl = document.getElementById('player-hand');
            if (handEl) {
                this.anim.drawCards(detectedDraws, true, handEl);
            }
        }


        const prevPlayerHp = prev.player ? prev.player.hp : 0;
        const currPlayerHp = curr.player ? curr.player.hp : 0;

        const prevAiHp = prev.ai ? prev.ai.hp : 0;
        const currAiHp = curr.ai ? curr.ai.hp : 0;

        if (curr.player && prev.player) {
            if (curr.player.guard > prev.player.guard) this.playFloatingText(`+${curr.player.guard - prev.player.guard}[守护]`, '#00bcd4', 'player');
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
            if (curr.ai.guard > prev.ai.guard) this.playFloatingText(`+${curr.ai.guard - prev.ai.guard}[守护]`, '#00bcd4', 'ai');
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
            el.src = `avatars/${charName}.png`;
            el.onerror = () => { el.src = `avatars/${charName}.jpg`; el.onerror = null; };
        }
    }

    _updateHpBar(prefix, ch) {
        const pct = Math.max(0, (ch.hp / ch.maxHp) * 100);
        const bar = document.getElementById(`${prefix}-hp-bar`);
        bar.style.width = pct + '%';
        bar.className = 'hp-bar-inner' + (pct <= 25 ? ' critical' : pct <= 50 ? ' low' : '');
        document.getElementById(`${prefix}-hp-text`).textContent = `${ch.hp}/${ch.maxHp}`;
    }

    _updateBuffs(prefix, ch) {
        const container = document.getElementById(`${prefix}-buffs`);
        let html = '';
        const buffs = [
            { key: 'burn', stacks: ch.burn, icon: 'burn' },
            { key: 'freeze', stacks: ch.frozen ? 1 : 0, icon: 'freeze' },
            { key: 'bleed', stacks: ch.bleed, icon: 'bleed' },
            { key: 'guard', stacks: ch.guard, icon: 'guard' },
            { key: 'chaos_red', stacks: ch.chaos_red ? 1 : 0, icon: 'chaos_red', hideCount: true, colorClass: 'chaos-red-buff' },
            { key: 'chaos_yellow', stacks: ch.chaos_yellow ? 1 : 0, icon: 'chaos_yellow', hideCount: true, colorClass: 'chaos-yellow-buff' },
            { key: 'chaos_blue', stacks: ch.chaos_blue ? 1 : 0, icon: 'chaos_blue', hideCount: true, colorClass: 'chaos-blue-buff' },
            { key: 'chaos_green', stacks: ch.chaos_green ? 1 : 0, icon: 'chaos_green', hideCount: true, colorClass: 'chaos-green-buff' }
        ];
        if (ch.bloodthirst) buffs.push({ key: 'bloodthirst', stacks: 1, path: 'icons/ui_icons/blood_thirsty.png', label: '嗜血', hideCount: true });
        for (const b of buffs) {
            if (b.stacks > 0) {
                const path = b.path || `icons/buff_icons/${b.icon}.png`;
                const title = b.label || ({ burn: '灼烧', freeze: '冷冻', bleed: '流血', guard: '守护', chaos_red: '混沌红', chaos_yellow: '混沌黄', chaos_blue: '混沌蓝', chaos_green: '混沌绿' }[b.key] || b.key);
                html += `<div class="buff-icon-wrap ${b.key === 'bloodthirst' ? 'bloodthirst-buff' : b.colorClass || ''}" title="${title}" aria-label="${title}"><img src="${path}" alt="${title}">${b.hideCount ? '' : `<span class="buff-count">${b.stacks}</span>`}${b.label ? `<span class="buff-name">${b.label}</span>` : ''}</div>`;
            }
        }
        container.innerHTML = html;
    }

    _renderPlayerHand() {
        const s = this.state;
        const container = document.getElementById('player-hand');
        container.innerHTML = '';
        this._hideTooltip();
        if (!s.playerHand) return;
        const canInteract = ['PLAYER_PLAY', 'PLAYER_DEFEND', 'PLAYER_FIVE_CHOICE',
            'PLAYER_SEVEN_CHOICE', 'SAIKI_THREE_CHOICE', 'SAIKI_SIX_JUDGE', 'PLAYER_DISCARD'].includes(s.phase);
        const isDefend = s.phase === 'PLAYER_DEFEND';
        for (let i = 0; i < s.playerHand.length; i++) {
            const card = s.playerHand[i];
            const sel = i === s.selectedCard || ((s.selectedCards || []).includes(i));
            const cv = renderCard(card, CARD_W, CARD_H, sel);
            if (!canInteract) cv.classList.add('disabled');
            cv.dataset.index = i;
            cv.addEventListener('click', async () => {
                if (cv.classList.contains('disabled')) return;
                const result = await Bridge.call('selectCard', { index: parseInt(cv.dataset.index) });
                if (result && !result.error) { this.state = result; this.updateDisplay(); }
            });
            if (sel && canInteract) {
                cv.addEventListener('mouseenter', () => this._showTooltip(card, cv, isDefend));
                cv.addEventListener('mouseleave', () => this._hideTooltip());
            }
            container.appendChild(cv);
        }
        if (s.selectedCard >= 0 && canInteract) {
            const card = s.playerHand[s.selectedCard];
            if (card) this._showTooltip(card, null, isDefend);
        }
        if (s.chanFiveCards && s.chanFiveCards.length > 0) {
            this.dialogs.showChanFiveDialog(s);
        }
    }

    _showTooltip(card, anchorEl, isDefend) {
        this._hideTooltip();
        const s = this.state;
        if (!s || !s.player) return;
        const charName = s.player.name.replace("AI ", "");
        const desc = getSkillDesc(charName, card, isDefend);
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

    _renderAIHand() {
        const s = this.state;
        const container = document.getElementById('ai-hand');
        container.innerHTML = '';
        const canSelect = s.phase === 'OPPONENT_CARD_CHOICE' || (s.phase === 'PLAYER_SEVEN_CHOICE' && !s.chanFourSwapMode && !s.chanSevenKeepMode) || (s.phase === 'SAIKI_THREE_CHOICE' && !s.saikiThreeDrawn);
        const handSize = s.aiHandSize || 0;
        for (let i = 0; i < handSize; i++) {
            const cv = renderCardBack(40, 58);
            if (canSelect) {
                cv.style.cursor = 'pointer'; cv.classList.add('selectable-ai-card');
                if (i === s.selectedAICard) cv.style.border = '3px solid #ffdc3c';
                cv.dataset.aiIndex = i;
                cv.addEventListener('click', async () => {
                    await this._apiAction('chooseAICard', { index: parseInt(cv.dataset.aiIndex) });
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

    _renderDiscardTop() {
        const s = this.state;
        const container = document.getElementById('discard-top');
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


    _renderControls() {
        const s = this.state;
        const container = document.getElementById('controls');
        container.classList.remove('controls-settling');
        let html = '';
        const phase = s.phase;
        const hasCard = s.selectedCard >= 0;
        const selectedCard = hasCard && s.playerHand ? s.playerHand[s.selectedCard] : null;
        const hasNumberCard = !!(selectedCard && selectedCard.isNumberCard);
        const hasDiscardCards = (s.selectedCards || []).length > 0;
        const hasAICard = s.selectedAICard >= 0;

        if (phase === 'PLAYER_PLAY') {
            if (s.needColorChoice) {
                html += `<span class="ctrl-hint">选择颜色</span>`;
                html += `<button class="ctrl-btn color-btn" id="btn-color-RED" style="background:#ff1e28">红</button>`;
                html += `<button class="ctrl-btn color-btn" id="btn-color-YELLOW" style="background:#ffc300">黄</button>`;
                html += `<button class="ctrl-btn color-btn" id="btn-color-BLUE" style="background:#0082ff">蓝</button>`;
                html += `<button class="ctrl-btn color-btn" id="btn-color-GREEN" style="background:#00c83c">绿</button>`;

            } else {
                html += `<button class="ctrl-btn btn-play" id="btn-play" ${!hasCard ? 'disabled' : ''}>出牌</button>`;
                html += `<button class="ctrl-btn btn-discard" id="btn-discard" ${s.hasPlayedThisTurn ? 'disabled' : ''}>弃牌</button>`;
                html += `<button class="ctrl-btn btn-end" id="btn-end">结束回合</button>`;
            }
        } else if (phase === 'PLAYER_DEFEND') {
            if (s.needColorChoice) {
                html += `<span class="ctrl-hint">黑牌选色</span>`;
                html += `<button class="ctrl-btn color-btn" id="btn-color-RED" style="background:#ff1e28">红</button>`;
                html += `<button class="ctrl-btn color-btn" id="btn-color-YELLOW" style="background:#ffc300">黄</button>`;
                html += `<button class="ctrl-btn color-btn" id="btn-color-BLUE" style="background:#0082ff">蓝</button>`;
                html += `<button class="ctrl-btn color-btn" id="btn-color-GREEN" style="background:#00c83c">绿</button>`;
            } else {
                if (s.hasPlayedBlackDefend) {
                    html += `<span class="ctrl-hint">搭桥完成：请选择一张数字≤3的牌触发防御技能</span>`;
                }
                html += `<button class="ctrl-btn btn-defend" id="btn-defend" ${!hasCard ? 'disabled' : ''}>防御</button>`;
                html += `<button class="ctrl-btn btn-skip" id="btn-skip">${s.hasPlayedBlackDefend ? '放弃防御' : '跳过'}</button>`;
            }
        } else if (phase === 'PLAYER_DISCARD') {
            html += `<span class="ctrl-hint">${s.forcedDiscard ? `手牌超限：需弃至 ${s.handLimit || 5} 张` : s.mayDiscardAfterSkill ? 'Ryan 3牌：可选择1张牌弃掉，也可取消' : '可同时选择多张牌弃掉'}</span>`;
            html += `<button class="ctrl-btn btn-discard" id="btn-confirm-discard" ${!hasDiscardCards ? 'disabled' : ''}>确认弃牌 (${(s.selectedCards || []).length})</button>`;
            if (!s.forcedDiscard) html += `<button class="ctrl-btn btn-skip" id="btn-cancel-discard">取消</button>`;
        } else if (phase === 'PLAYER_FIVE_CHOICE') {
            html += `<span class="ctrl-hint">请选择一张数字牌：恢复牌面生命，或造成1.5倍伤害</span>`;
            html += `<button class="ctrl-btn btn-play" id="btn-five-heal" ${!hasNumberCard ? 'disabled' : ''}>恢复${hasNumberCard ? ` ${selectedCard.value}` : ''}</button>`;
            html += `<button class="ctrl-btn btn-play" id="btn-five-damage" ${!hasNumberCard ? 'disabled' : ''}>进攻${hasNumberCard ? ` ${Math.ceil(selectedCard.value * 1.5)}` : ''}</button>`;
        } else if (phase === 'OPPONENT_CARD_CHOICE') {
            const skill = s.pendingOpponentSkill;
            html += `<span class="ctrl-hint">${skill ? `${skill.name} ${skill.value}牌：` : ''}点击一张对手手牌</span>`;
            html += `<button class="ctrl-btn btn-play" id="btn-opponent-confirm" ${!hasAICard ? 'disabled' : ''}>确认选择</button>`;
        } else if (phase === 'PLAYER_SEVEN_CHOICE') {
            if (s.chanFourSwapMode && s.chanFourSwapDrawn) {
                html += `<span class="ctrl-hint">4牌: ${cardLabel(s.chanFourSwapDrawn)}，选手牌交换或弃掉</span>`;
                html += `<button class="ctrl-btn btn-play" id="btn-four-swap" ${!hasCard ? 'disabled' : ''}>确认交换</button>`;
                html += `<button class="ctrl-btn btn-discard" id="btn-four-discard">弃掉+2伤害</button>`;
            } else if (s.chanSevenKeepMode && s.chanSevenChosenCard) {
                html += `<span class="ctrl-hint">7牌抽取: ${cardLabel(s.chanSevenChosenCard)}</span>`;
                html += `<button class="ctrl-btn btn-play" id="btn-seven-keep">加入手牌</button>`;
                html += `<button class="ctrl-btn btn-discard" id="btn-seven-discard">弃掉</button>`;
            } else {
                html += `<span class="ctrl-hint">点击AI手牌选择一张</span>`;
                html += `<button class="ctrl-btn btn-play" id="btn-seven-confirm" ${!hasAICard ? 'disabled' : ''}>确认选择</button>`;
            }
        } else if (phase === 'SAIKI_THREE_CHOICE') {
            if (s.saikiThreeDrawn) {
                html += `<span class="ctrl-hint">3牌抽取: ${cardLabel(s.saikiThreeDrawn)}</span>`;
                html += `<button class="ctrl-btn btn-play" id="btn-saiki-three-keep">加入手牌</button>`;
                html += `<button class="ctrl-btn btn-discard" id="btn-saiki-three-discard">弃掉</button>`;
            } else {
                html += `<span class="ctrl-hint">点击AI手牌选择一张</span>`;
                html += `<button class="ctrl-btn btn-play" id="btn-opponent-confirm" ${!hasAICard ? 'disabled' : ''}>确认选择</button>`;
            }
        } else if (phase === 'SAIKI_SIX_JUDGE') {
            const judgeType = s.pendingNumberJudge && s.pendingNumberJudge.type;
            html += `<span class="ctrl-hint">${judgeType === 'Moze' ? '选择一张数字牌转化为守护' : '选择一张数字牌计算伤害'}</span>`;
            html += `<button class="ctrl-btn btn-play" id="btn-saiki-six" ${!hasNumberCard ? 'disabled' : ''}>${judgeType === 'Moze' ? '确认守护判定' : '确认伤害判定'}</button>`;
        } else if (phase === 'TARGET_CHOICE') {
            html += `<span class="ctrl-hint">选择攻击目标</span>`;
            if (s.ai && s.ai.alive) html += `<button class="ctrl-btn btn-play" id="btn-target-0">${s.ai.name}</button>`;
            if (s.ai2 && s.ai2.alive) html += `<button class="ctrl-btn btn-play" id="btn-target-1">${s.ai2.name}</button>`;
        } else if (phase === 'GUARD_CHOICE') {
            html += `<span class="ctrl-hint">请选择要消耗的守护层数</span>`;
        } else if (phase === 'GAME_OVER') {
            html += `<button class="ctrl-btn btn-play" id="btn-restart">再来一局</button>`;
            html += `<button class="ctrl-btn btn-skip" id="btn-back-select">重新选择</button>`;
        } else if (phase === 'AI_TURN' || phase === 'AI_DEFEND' || phase === 'AI2_TURN') {
            html += `<span class="ctrl-hint">${phase === 'AI_DEFEND' && s.defenseSkipped ? '本技能分支未造成伤害，已跳过防御，正在结算...' : 'AI思考中...'}</span>`;
        }
        container.innerHTML = html;
        this._bindControls();
    }

    async _bindControls() {
        const bind = async (id, fn) => { const el = document.getElementById(id); if (el) el.addEventListener('click', fn); };
        bind('btn-play', async () => { await this._apiAction('doPlay'); });
        bind('btn-discard', async () => { await this._apiAction('doEnterDiscard'); });
        bind('btn-end', async () => { await this._apiAction('doEndTurn'); });
        bind('btn-defend', async () => { await this._apiAction('doDefend'); });
        bind('btn-skip', async () => { await this._apiAction('doSkipDefend'); });
        bind('btn-confirm-discard', async () => { await this._apiAction('doConfirmDiscard'); });
        bind('btn-cancel-discard', async () => { await this._apiAction('doCancelDiscard'); });
        bind('btn-five-heal', async () => { await this._apiAction('doFiveHeal'); });
        bind('btn-five-damage', async () => { await this._apiAction('doFiveDamage'); });
        bind('btn-seven-confirm', async () => { await this._apiAction('doSevenConfirm'); });
        bind('btn-opponent-confirm', async () => { await this._apiAction('doOpponentCardConfirm'); });
        bind('btn-seven-keep', async () => { await this._apiAction('doChanSevenKeep'); });
        bind('btn-seven-discard', async () => { await this._apiAction('doChanSevenDiscard'); });
        bind('btn-saiki-three-keep', async () => { await this._apiAction('doSaikiThreeKeep'); });
        bind('btn-saiki-three-discard', async () => { await this._apiAction('doSaikiThreeDiscard'); });
        bind('btn-four-discard', async () => { await this._apiAction('doChanFourDiscard'); });
        bind('btn-four-swap', async () => { await this._apiAction('doChanFourSwap'); });
        bind('btn-saiki-six', async () => { await this._apiAction('doSaikiSixConfirm'); });
        bind('btn-target-0', async () => { await this._apiAction('chooseTarget', { target: 0 }); });
        bind('btn-target-1', async () => { await this._apiAction('chooseTarget', { target: 1 }); });
        ['RED','YELLOW','BLUE','GREEN'].forEach(c => {
            bind('btn-color-' + c, async () => { await this._apiAction('chooseColor', { color: c }); });
        });

        const restartFn = async () => {
            await Bridge.call('restart');
            this.state = null; this._prevState = null;
            if (this._pollInterval) clearInterval(this._pollInterval);
            this.gameScreen.classList.remove('active');
            this.selectScreen.classList.add('active');
            this._selectedPlayerChar = null; this._selectedAIChar = null;
            this._buildSelectScreen();
        };
        bind('btn-restart', restartFn);
        bind('btn-back-select', restartFn);

        const menuBtn = document.getElementById('menu-btn');
        if (menuBtn) menuBtn.addEventListener('click', () => this._showGameMenu());
    }

    _showGameMenu() {
        const existing = document.getElementById('game-menu-overlay');
        if (existing) { existing.remove(); return; }
        const overlay = document.createElement('div');
        overlay.id = 'game-menu-overlay';
        overlay.className = 'game-menu-overlay';
        overlay.innerHTML = `
            <div class="game-menu-box">
                <div class="game-menu-title">菜单</div>
                <button class="game-menu-btn game-menu-skills" id="gm-skills">查看技能</button>
                <button class="game-menu-btn game-menu-quit" id="gm-quit">退出对局</button>
                <button class="game-menu-btn game-menu-cancel" id="gm-cancel">继续游戏</button>
            </div>`;
        document.body.appendChild(overlay);
        document.getElementById('gm-cancel').addEventListener('click', () => overlay.remove());
        overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
        document.getElementById('gm-skills').addEventListener('click', () => {
            overlay.remove();
            this._showSkillOverlay();
        });
        document.getElementById('gm-quit').addEventListener('click', async () => {
            overlay.remove();
            await Bridge.call('restart');
            this.state = null; this._prevState = null;
            if (this._pollInterval) clearInterval(this._pollInterval);
            this.gameScreen.classList.remove('active');
            this.selectScreen.classList.add('active');
            this._selectedPlayerChar = null; this._selectedAIChar = null;
            this._buildSelectScreen();
        });
    }

    _showSkillOverlay() {
        const existing = document.getElementById('skill-overlay');
        if (existing) { existing.remove(); return; }
        const s = this.state;
        if (!s || !s.player) return;
        const chars = [];
        chars.push({ name: s.player.name.replace(/^AI\d*\s+/, ''), label: '玩家', color: '#3b82f6' });
        chars.push({ name: s.ai.name.replace(/^AI\d*\s+/, ''), label: 'AI', color: '#ef4444' });
        if (s.ai2 && s.ai2.name) chars.push({ name: s.ai2.name.replace(/^AI\d*\s+/, ''), label: 'AI2', color: '#a855f7' });

        const overlay = document.createElement('div');
        overlay.id = 'skill-overlay';
        overlay.className = 'skill-overlay';
        let html = '<div class="skill-overlay-inner">';
        html += '<div class="skill-overlay-header"><button class="rules-back-btn" id="skill-back">&larr; 返回</button><h1 class="rules-title">角色技能</h1></div>';
        for (const ch of chars) {
            const atk = (SKILL_DATA && SKILL_DATA.attack && SKILL_DATA.attack[ch.name]) || [];
            const def = (SKILL_DATA && SKILL_DATA.defend && SKILL_DATA.defend[ch.name]) || [];
            if (!atk.length && !def.length) continue;
            html += `<div class="skill-overlay-char"><span class="skill-overlay-char-label" style="color:${ch.color}">${ch.label}：${ch.name}</span></div>`;
            html += '<div class="skill-grid">';
            const SKILL_GRID = [
                { atkKey: 0, defKey: 0, label: '1' }, { atkKey: 1, defKey: 1, label: '2' },
                { atkKey: 2, defKey: 2, label: '3' }, { atkKey: 7, defKey: 3, label: '0' },
                { atkKey: 3, defKey: -1, label: '4' }, { atkKey: 4, defKey: -1, label: '5' },
                { atkKey: 5, defKey: -1, label: '6' }, { atkKey: 6, defKey: -1, label: '7' }
            ];
            const stripPrefix = t => (t || '').replace(/^\d+\s*/, '');
            const colorize = t => {
                if (typeof parseSegments !== 'function') return t;
                const segs = parseSegments(t, '');
                return segs.map(sg => sg.color ? `<span style="color:${sg.color}">${sg.text}</span>` : sg.text).join('');
            };
            for (const row of SKILL_GRID) {
                const atkDesc = atk[row.atkKey] ? colorize(stripPrefix(atk[row.atkKey])) : '—';
                const defDesc = row.defKey >= 0 && def[row.defKey] ? colorize(stripPrefix(def[row.defKey])) : (row.defKey >= 0 ? '无防御效果' : '');
                html += `<div class="skill-row"><div class="skill-cell skill-atk">${atkDesc}</div><div class="skill-num">${row.label}</div>`;
                html += row.defKey >= 0 ? `<div class="skill-cell skill-def">${defDesc}</div>` : `<div class="skill-cell skill-def skill-no-def"></div>`;
                html += '</div>';
            }
            html += '</div>';
        }
        html += '</div>';
        overlay.innerHTML = html;
        document.body.appendChild(overlay);
        document.getElementById('skill-back').addEventListener('click', () => overlay.remove());
        overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
    }

    async _apiAction(method, params) {
        if (this._isHandlingAction) return;
        this._isHandlingAction = true;
        let shouldPollAI = false;
        const quickDecision = this._isDecisionAction(method);
        this._showActionPending(method);
        try {
            this._prevState = this.state ? JSON.parse(JSON.stringify(this.state)) : null;
            const result = await Bridge.call(method, params);
            if (result && !result.error) {
                this.state = result;
                const hasEvents = result.events && result.events.length > 0;
                const entersDecision = this._isInteractiveDecisionPhase(result.phase);
                this._showAcceptedControls(hasEvents);
                if (hasEvents) {
                    await this._consumeEvents(result.events, { fastFirstBatch: quickDecision || entersDecision });
                }
                this.updateDisplay();
                shouldPollAI = this.state.phase === 'AI_TURN' || this.state.phase === 'AI_DEFEND' || this.state.phase === 'AI2_TURN';
            } else if (result && result.error) {
                this.showError(result.error);
                this.updateDisplay();
            }
        } catch (error) {
            console.error('[Action] request failed', method, error);
            this.showError(error && error.message ? error.message : '操作失败，请重试');
            this.updateDisplay();
        } finally {
            this._isHandlingAction = false;
        }
        if (shouldPollAI) this._pollAI();
    }

    _isDecisionAction(method) {
        return new Set([
            'doDefend', 'doSkipDefend', 'doConfirmDiscard', 'doCancelDiscard',
            'doFiveHeal', 'doFiveDamage', 'doSevenConfirm', 'doOpponentCardConfirm',
            'doChanSevenKeep', 'doChanSevenDiscard', 'doSaikiThreeKeep',
            'doSaikiThreeDiscard', 'doChanFourDiscard', 'doChanFourSwap',
            'doSaikiSixConfirm', 'chooseTarget', 'chooseColor', 'choosePurify',
            'chooseSuperPurifyTarget', 'chooseGuard', 'chanFiveReorder'
        ]).has(method);
    }

    _isInteractiveDecisionPhase(phase) {
        return new Set([
            'PLAYER_FIVE_CHOICE', 'OPPONENT_CARD_CHOICE', 'PLAYER_SEVEN_CHOICE',
            'SAIKI_THREE_CHOICE', 'SAIKI_SIX_JUDGE', 'PLAYER_DISCARD',
            'CHAN_FIVE_REORDER', 'GUARD_CHOICE', 'TARGET_CHOICE'
        ]).has(phase);
    }

    _showAcceptedControls(settling) {
        const phaseInfo = document.getElementById('phase-info');
        if (phaseInfo && this.state) {
            phaseInfo.textContent = this.state.phase === 'AI_DEFEND' && this.state.defenseSkipped
                ? '跳过防御'
                : (PHASE_NAMES[this.state.phase] || this.state.phase);
        }
        this._renderControls();
        if (!settling) return;
        const container = document.getElementById('controls');
        if (!container) return;
        container.classList.add('controls-settling');
        container.querySelectorAll('button').forEach(button => { button.disabled = true; });

    }

    _showActionPending(method) {
        const container = document.getElementById('controls');
        if (!container) return;
        const labels = {
            doPlay: '正在出牌', doDefend: '正在结算防御', doSkipDefend: '正在跳过防御',
            doConfirmDiscard: '正在确认弃牌', doCancelDiscard: '正在返回出牌阶段',
            doFiveHeal: '正在确认恢复', doFiveDamage: '正在确认进攻',
            doOpponentCardConfirm: '正在展示所选卡牌', doSevenConfirm: '正在展示所选卡牌',
            doChanSevenKeep: '正在加入手牌', doChanSevenDiscard: '正在弃掉卡牌',
            doSaikiThreeKeep: '正在加入手牌', doSaikiThreeDiscard: '正在弃掉卡牌',
            doChanFourSwap: '正在交换卡牌', doChanFourDiscard: '正在弃牌并结算伤害',
            doSaikiSixConfirm: '正在结算数字判定', chooseTarget: '正在确认目标',
            chooseColor: '正在指定颜色', choosePurify: '正在执行净化', chooseSuperPurifyTarget: '正在执行超级净化',
            chooseGuard: '正在结算守护', chanFiveReorder: '正在确认牌库顺序',
            doEndTurn: '正在结束回合', doEnterDiscard: '正在进入弃牌阶段'
        };
        const label = labels[method] || '正在处理';
        container.innerHTML = `<span class="ctrl-pending"><span class="ctrl-spinner"></span>${label}...</span>`;
        const phaseInfo = document.getElementById('phase-info');
        if (phaseInfo) phaseInfo.textContent = label;
    }

    async _pollAI() {
        if (this._isPollingAI) return;
        this._isPollingAI = true;
        try {
          for (let i = 0; i < 80; i++) {
            await new Promise(r => setTimeout(r, 350));
            const newState = await Bridge.getState();
            if (!newState || newState.error) continue;

            if (newState.events && newState.events.length > 0) {
                this._prevState = this.state;
                this.state = newState;
                await this._consumeEvents(newState.events);
                this.updateDisplay();
                if (this.state.phase !== 'AI_TURN' && this.state.phase !== 'AI_DEFEND' && this.state.phase !== 'AI2_TURN') break;
                continue;
            }

            this._prevState = this.state;
            this.state = newState;
            this.updateDisplay();
            if (this.state.phase !== 'AI_TURN' && this.state.phase !== 'AI_DEFEND' && this.state.phase !== 'AI2_TURN') break;
          }
        } finally {
            this._isPollingAI = false;
        }
    }

    async _ackEvents(events) {
        const ids = (events || []).map(evt => Number(evt.id)).filter(Number.isFinite);
        if (!ids.length) return;
        await Bridge.call('clearEvents', { throughId: Math.max(...ids) });
    }

    async _consumeEvents(events, options = {}) {
        const wasConsumingEvents = this._isConsumingEvents;
        this._isConsumingEvents = true;
        let pending = [...(events || [])];
        const consumedIds = new Set();
        let batches = 0;
        try {
            while (pending.length && batches++ < 40) {
                const batch = pending.filter((evt, index) => {
                    const key = Number.isFinite(Number(evt.id)) ? `id:${evt.id}` : `batch:${batches}:${index}`;
                    if (consumedIds.has(key)) return false;
                    consumedIds.add(key);
                    return true;
                });
                if (!batch.length) {
                    await this._ackEvents(pending);
                    break;
                }
                try {
                    await this._playEvents(batch, !!options.fastFirstBatch && batches === 1);
                } catch (error) {
                    console.error('[Events] batch animation failed', error);
                    this.showError('动画异常已跳过，游戏继续');
                } finally {
                    // Even if a visual effect fails, acknowledge the batch so the same
                    // event cannot be replayed forever by the AI poller.
                    await this._ackEvents(batch);
                }
                const freshState = await Bridge.getState();
                if (!freshState || freshState.error) break;
                this.state = freshState;
                pending = freshState.events || [];
            }
            if (batches >= 40 && pending.length) {
                console.error('[Events] safety limit reached', pending);
                this.showError('事件过多，已切换为安全模式继续游戏');
            }
        } finally {
            this._isConsumingEvents = wasConsumingEvents;
        }
    }

    _isDefenseJudgmentEvent(evt) {
        const desc = String(evt && evt.desc || '');
        return !!evt && evt.type === 'reveal' && desc.includes('防御') && desc.includes('判定');
    }

    _aiDefenseAnimationKey(card, who) {
        return JSON.stringify([who || 'ai', card || null]);
    }

    _resetRevealBeforeDefenseJudgment() {
        const box = document.getElementById('reveal-cards');
        if (box) {
            box.innerHTML = '<span class="reveal-empty">等待防御技能判定</span>';
            box.dataset.cardKey = 'pending-defense-judgment';
        }
        this._hideZoneDesc('reveal-desc');
    }

    _animationOrder(events) {
        const ordered = [...(events || [])];
        for (let i = 0; i < ordered.length; i++) {
            const evt = ordered[i];
            if (evt.type !== 'reveal' || !String(evt.desc || '').includes('防御判定')) continue;
            const defenseIndex = ordered.findIndex((candidate, index) =>
                index > i && (candidate.type === 'aiDefend' || candidate.type === 'defend') && candidate.card
            );
            if (defenseIndex < 0) continue;
            const [defenseEvent] = ordered.splice(defenseIndex, 1);
            ordered.splice(i, 0, defenseEvent);
            i++;
        }
        return ordered;
    }

    async _playEvents(events, fast = false) {
        const wait = ms => new Promise(resolve => setTimeout(resolve, fast ? Math.max(60, Math.round(ms * 0.22)) : ms));
        const orderedEvents = this._animationOrder(events);
        if (orderedEvents.some(evt => this._isDefenseJudgmentEvent(evt))) {
            // Clear a judgment card that may have been painted from the final
            // state snapshot before the defense animation begins.
            this._resetRevealBeforeDefenseJudgment();
        }
        for (const evt of orderedEvents) {
            try {
              if (evt.type === 'aiPlay' && evt.card) {
                this._updateAttackerIndicator(evt.who || 'ai');
                await this._playAICardAnimation(evt.card, evt.who || 'ai');
                this._renderDiscardTop();
                await wait(600);
                this._showCardSkillDesc('atk-desc', evt.card, evt.who || 'ai', false);
                await wait(1400);
            } else if (evt.type === 'playerPlay' && evt.card) {
                this._updateAttackerIndicator('player');
                await this._playPlayerCardAnimation(evt.card);
                this._renderDiscardTop();
                await wait(400);
                this._showCardSkillDesc('atk-desc', evt.card, 'player', false);
                await wait(600);
            } else if (evt.type === 'itemEffect') {
                this._showZoneDesc('reveal-desc', evt.desc || '道具效果立即结算');
                if (evt.effect === 'swap') {
                    this._renderPlayerHand();
                    if (this.state && this.state.is1v2 && this._renderAIHand1v2) this._renderAIHand1v2();
                    else this._renderAIHand();
                    const playerHand = document.getElementById('player-hand');
                    const aiHand = document.getElementById(evt.target === 'ai2' || evt.who === 'ai2' ? 'ai2-hand' : 'ai-hand');
                    if (playerHand) playerHand.classList.add('hand-swap-pulse');
                    if (aiHand) aiHand.classList.add('hand-swap-pulse');
                    await wait(620);
                    if (playerHand) playerHand.classList.remove('hand-swap-pulse');
                    if (aiHand) aiHand.classList.remove('hand-swap-pulse');
                } else {
                    const side = evt.who === 'ai2' ? 'ai2' : evt.who === 'ai' ? 'ai' : 'player';
                    if (this.state[side]) {
                        this._updateHpBar(side, this.state[side]);
                        this._updateBuffs(side, this.state[side]);
                    }
                    await wait(380);
                }
            } else if (evt.type === 'aiDefend' && evt.card) {
                const who = evt.who || 'ai';

                const defenseKey = this._aiDefenseAnimationKey(evt.card, who);
                if (this._lastAnimatedAIDefenseKey !== defenseKey) {
                    await this._playAIDefendAnimation(evt.card, who);
                    this._lastAnimatedAIDefenseKey = defenseKey;
                }
                this._renderDiscardTop();
                await wait(600);
                this._showCardSkillDesc('def-desc', evt.card, who, true);
                await wait(800);
            } else if (evt.type === 'draw') {
                const drawTarget = evt.who === 'player' ? 'player-hand' : evt.who === 'ai2' ? 'ai2-hand' : 'ai-hand';
                const target = document.getElementById(drawTarget);
                this._showZoneDesc('reveal-desc', evt.desc || '抽牌');
                if (target) await this.anim.drawCards(evt.count || 1, evt.who === 'player', target);
                if (evt.who === 'player') this._animatedPlayerDraws += evt.count || 1;
                if (evt.who === 'player') this._renderPlayerHand();
                else if (this.state && this.state.is1v2) this._renderAIHand1v2 ? this._renderAIHand1v2() : this._renderAIHand();
                else this._renderAIHand();
                await wait(260);
            } else if (evt.type === 'reveal' && evt.card) {
                if (this._isDefenseJudgmentEvent(evt)) {
                    // Some backends can return the defense play and its reveal in
                    // adjacent polling batches.  If that happens, settle/animate
                    // the currently active AI defense card before revealing the
                    // judgment, and suppress the later duplicate defense event.
                    const defenseCard = this.state && this.state.defCard;
                    const defenseOwner = this.state && this.state.defOwner;
                    if (defenseCard && defenseOwner && defenseOwner !== 'player') {
                        const defenseKey = this._aiDefenseAnimationKey(defenseCard, defenseOwner);
                        if (this._lastAnimatedAIDefenseKey !== defenseKey) {
                            await this._playAIDefendAnimation(defenseCard, defenseOwner);
                            this._lastAnimatedAIDefenseKey = defenseKey;
                            await wait(600);
                            this._showCardSkillDesc('def-desc', defenseCard, defenseOwner, true);
                            await wait(800);
                        }
                    }
                }
                await this._playRevealAnimation(evt.card, evt.who);
                this._showZoneDesc('reveal-desc', evt.desc || '判定');
                if (evt.who === 'player') this._renderPlayerHand();
                await wait(1200);
            } else if (evt.type === 'lordDice' && Number.isFinite(Number(evt.roll))) {
                if (typeof this._playDiceAnimation === 'function') {
                    await this._playDiceAnimation(Number(evt.roll), evt.target);
                }
            } else if (evt.type === 'colorChoice') {
                this._showZoneDesc('reveal-desc', evt.desc || 'AI指定颜色');
                await wait(650);
            } else if (evt.type === 'defend' && evt.card) {

                await this._playPlayerDefendAnimation(evt.card);
                this._renderDiscardTop();
                await wait(500);
                this._showCardSkillDesc('def-desc', evt.card, 'player', true);
                await wait(800);
            } else if (evt.type === 'desc') {
                this._showZoneDesc('reveal-desc', evt.desc);
                await wait(1500);
            } else if (evt.type === 'clearZones') {
                this._clearZones();
            } else if (evt.type === 'hint') {
                this.showError(evt.desc || '');
                await wait(1500);
            } else if (evt.type === 'float') {
                this.playFloatingText(evt.desc || '', '', evt.who || 'player');
                await wait(400);
            } else if (evt.type === 'burnSettle') {
                this.playFloatingText(evt.desc || '', '#ff8800', evt.who || 'ai');
                const side = evt.who === 'player' ? 'player' : (evt.who === 'ai2' ? 'ai2' : 'ai');
                if (this.state[side]) { this._updateHpBar(side, this.state[side]); this._updateBuffs(side, this.state[side]); }
                if (evt.amount > 0) { this.shakeScreen(Math.min(evt.amount * 2, 10), 300); const hpEl = document.getElementById(side + '-hp-section'); if (hpEl) { const r = hpEl.getBoundingClientRect(); this.burstParticles(r.left + r.width / 2, r.top + r.height / 2, 'rgba(255,136,0,0.8)', Math.min(evt.amount * 3, 20)); } }
                await wait(500);
            } else if (evt.type === 'hurt') {
                this.playFloatingText(evt.desc || '', evt.bleed ? '#cc2222' : '#ff4444', evt.who || 'ai');
                const side = evt.who === 'player' ? 'player' : (evt.who === 'ai2' ? 'ai2' : 'ai');
                if (this.state[side]) { this._updateHpBar(side, this.state[side]); this._updateBuffs(side, this.state[side]); }
                if (evt.amount > 0) { this.shakeScreen(evt.who === 'player' ? Math.min(evt.amount * 2, 10) : Math.min(evt.amount, 6), evt.who === 'player' ? 300 : 200); if (evt.who === 'player') { const hpEl = document.getElementById('player-hp-section'); if (hpEl) { const r = hpEl.getBoundingClientRect(); this.burstParticles(r.left + r.width / 2, r.top + r.height / 2, 'rgba(255,60,60,0.8)', Math.min(evt.amount * 3, 20)); } } }
                await wait(400);
            } else if (evt.type === 'buff') {
                const colors = { burn: '#ff8800', bleed: '#cc2222', freeze: '#44aaff', guard: '#00bcd4' };
                this.playFloatingText(evt.desc || '', colors[evt.kind] || '#c4b5fd', evt.who || 'ai');
                const side = evt.who === 'player' ? 'player' : (evt.who === 'ai2' ? 'ai2' : 'ai');
                if (this.state[side]) { this._updateBuffs(side, this.state[side]); }
                await wait(350);
            } else if (evt.type === 'heal') {
                const color = evt.kind === 'drain' ? '#e040fb' : evt.kind === 'passive' ? '#b388ff' : '#44dd44';
                this.playFloatingText(evt.desc || '', color, evt.who || 'player');
                const side = evt.who === 'player' ? 'player' : (evt.who === 'ai2' ? 'ai2' : 'ai');
                if (this.state[side]) { this._updateHpBar(side, this.state[side]); this._updateBuffs(side, this.state[side]); }
                await wait(400);
            } else if (evt.type === 'gameOver') {
                this.playFloatingText(evt.desc || '游戏结束', '#ffd700', 'player');
                await wait(1500);
              }
            } catch (error) {
                console.error('[Animation] skipped event', evt && evt.id, error);
                this.showError('动画已跳过，游戏继续');
            }
        }
    }


    _showZoneDesc(id, desc) {
        const el = document.getElementById(id);
        if (!el) return;
        const segs = parseSegments(desc, '');
        el.innerHTML = '';
        for (const seg of segs) {
            const span = document.createElement('span');
            span.textContent = seg.text;
            if (seg.color) span.style.color = seg.color;
            el.appendChild(span);
        }
    }

    _showCardSkillDesc(id, card, owner, isDefend) {
        if (!card || !this.state) return;
        const participant = owner === 'ai2' ? this.state.ai2 : owner === 'ai' ? this.state.ai : this.state.player;
        if (!participant) return;
        const charName = participant.name.replace(/^AI\d*\s+/, '');
        const label = card.isItemCard
            ? (card.isBlack ? '黑牌' : card.isWhite ? '白牌' : '道具')
            : card.value;
        const skill = getSkillDesc(charName, card, isDefend) || (isDefend ? '执行防御效果' : '执行进攻效果');
        this._showZoneDesc(id, `${charName} · ${label}｜${skill}`);
    }



    _hideZoneDesc(id) {
        const el = document.getElementById(id);
        if (el) el.textContent = '';
    }

    _drawDeckIcon(count) {
        const c = document.getElementById('deck-icon');
        if (!c) return;
        const g = c.getContext('2d');
        g.clearRect(0, 0, 40, 52);
        const layers = Math.min(3, Math.ceil(count / 20));
        for (let i = layers - 1; i >= 0; i--) {
            const ox = i * 2, oy = i * 2;
            g.fillStyle = i === 0 ? '#4a5568' : '#2d3748';
            g.strokeStyle = '#718096'; g.lineWidth = 0.8;
            g.beginPath();
            g.roundRect(ox + 2, oy + 2, 32, 44, 3);
            g.fill(); g.stroke();
        }
        if (count > 0) {
            g.fillStyle = '#a0aec0'; g.font = 'bold 11px sans-serif';
            g.textAlign = 'center'; g.textBaseline = 'middle';
            g.fillText(count, 18, 24);
        } else {
            g.fillStyle = '#4a5568'; g.font = '9px sans-serif';
            g.textAlign = 'center'; g.textBaseline = 'middle';
            g.fillText('空', 18, 24);
        }
    }



    _clearZones() {
        if (this.state) { this.state.atkCard = null; this.state.defCard = null; }
        this._lastAnimatedAIDefenseKey = null;
        const atkContainer = document.getElementById('atk-cards');
        const defContainer = document.getElementById('def-cards');
        if (atkContainer) atkContainer.innerHTML = '<span style="color:rgba(255,255,255,0.5);font-size:0.7rem">等待出牌</span>';
        if (defContainer) defContainer.innerHTML = '<span style="color:rgba(255,255,255,0.5);font-size:0.7rem">等待防御</span>';
        if (atkContainer) atkContainer.dataset.cardKey = 'empty';
        if (defContainer) defContainer.dataset.cardKey = 'empty';
        const atkDesc = document.getElementById('atk-desc');
        const defDesc = document.getElementById('def-desc');
        if (atkDesc) atkDesc.textContent = '';
        if (defDesc) defDesc.textContent = '';
        const actionDesc = document.getElementById('action-desc');
        if (actionDesc) actionDesc.textContent = '';
    }

    async _playAICardAnimation(card, who = 'ai') {
        const aiHand = document.getElementById(who === 'ai2' ? 'ai2-hand' : 'ai-hand');
        const atkZone = document.getElementById('atk-cards');
        if (!aiHand || !atkZone) { await new Promise(r => setTimeout(r, 500)); return; }
        const sourceCard = aiHand.lastElementChild;
        if (sourceCard) sourceCard.style.visibility = 'hidden';
        try { await this.anim.flyCardBack(aiHand, atkZone, 440, 54); }
        finally { if (sourceCard) sourceCard.remove(); }
        this._settleZoneCard(atkZone, card);
    }

    async _playAIDefendAnimation(card, who = 'ai') {
        const aiHand = document.getElementById(who === 'ai2' ? 'ai2-hand' : 'ai-hand');
        const defZone = document.getElementById('def-cards');
        if (!aiHand || !defZone) return;
        const sourceCard = aiHand.lastElementChild;
        if (sourceCard) sourceCard.style.visibility = 'hidden';
        try { await this.anim.flyCardBack(aiHand, defZone, 440, 42); }
        finally { if (sourceCard) sourceCard.remove(); }
        this._settleZoneCard(defZone, card);
    }

    _settleZoneCard(zone, card) {
        zone.innerHTML = '';
        const settled = renderCard(card, CARD_W - 10, CARD_H - 14, false);
        settled.classList.add('zone-card', 'zone-card-land');
        zone.appendChild(settled);
        zone.dataset.cardKey = JSON.stringify(card);
    }

    async _playPlayerCardAnimation(card) {
        const playerHand = document.getElementById('player-hand');
        const atkZone = document.getElementById('atk-cards');
        if (!playerHand || !atkZone) { await new Promise(r => setTimeout(r, 500)); return; }
        const selectedIndex = this._prevState ? this._prevState.selectedCard : -1;
        const source = selectedIndex >= 0 && playerHand.children[selectedIndex]
            ? playerHand.children[selectedIndex]
            : playerHand;
        if (source !== playerHand) source.style.visibility = 'hidden';
        try { await this.anim.flyCard(card, source, atkZone, 430, 66); }
        finally { if (source !== playerHand) source.remove(); }
        this._settleZoneCard(atkZone, card);
    }

    async _playPlayerDefendAnimation(card) {
        const playerHand = document.getElementById('player-hand');
        const defZone = document.getElementById('def-cards');
        if (!playerHand || !defZone) { await new Promise(r => setTimeout(r, 400)); return; }
        const selectedIndex = this._prevState ? this._prevState.selectedCard : -1;
        const source = selectedIndex >= 0 && playerHand.children[selectedIndex]
            ? playerHand.children[selectedIndex]
            : playerHand;
        if (source !== playerHand) source.style.visibility = 'hidden';
        try { await this.anim.flyCard(card, source, defZone, 420, 48); }
        finally { if (source !== playerHand) source.remove(); }
        this._settleZoneCard(defZone, card);
    }

    async _playRevealAnimation(card, fromOwner) {
        const ownerEl = document.getElementById(fromOwner === 'player' ? 'player-hand' : fromOwner === 'ai2' ? 'ai2-hand' : fromOwner === 'ai' ? 'ai-hand' : 'deck-area');
        const toEl = document.getElementById('reveal-cards');
        if (!ownerEl || !toEl) return;
        const selectedIndex = fromOwner === 'player' && this._prevState ? this._prevState.selectedCard : -1;
        const fromEl = selectedIndex >= 0 && ownerEl.children[selectedIndex]
            ? ownerEl.children[selectedIndex]
            : ownerEl;
        if (fromEl !== ownerEl) fromEl.style.visibility = 'hidden';
        const flying = fromOwner === 'player'
            ? renderCard(card, CARD_W - 10, CARD_H - 14, false)
            : renderCardBack(CARD_W - 10, CARD_H - 14);
        flying.style.position='fixed'; flying.style.zIndex='9999'; flying.style.pointerEvents='none';
        flying.style.transition='left .42s ease-out, top .42s ease-out, transform .42s ease-out';
        const from=fromEl.getBoundingClientRect(),to=toEl.getBoundingClientRect();
        flying.style.left=(from.left+from.width/2-30)+'px'; flying.style.top=(from.top+from.height/2-43)+'px';
        document.body.appendChild(flying); await new Promise(r=>setTimeout(r,30));
        flying.style.left=(to.left+to.width/2-30)+'px'; flying.style.top=(to.top+to.height/2-43)+'px';
        flying.style.transform=fromOwner === 'player' ? 'scale(.9)' : 'rotateY(90deg) scale(.9)';
        await new Promise(r=>setTimeout(r,430)); flying.remove();
        if (fromEl !== ownerEl) fromEl.remove();
        toEl.innerHTML=''; const shown=renderCard(card,CARD_W-10,CARD_H-14,false);
        shown.classList.add('revealed-card'); toEl.appendChild(shown); toEl.dataset.cardKey=JSON.stringify([card]);
    }



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

    playFloatingText(text, color, target) {
        const el = document.createElement('div');
        el.className = 'floating-text';
        const segs = parseSegments(text, color);
        for (const seg of segs) {
            const span = document.createElement('span');
            span.className = 'ft-seg'; span.textContent = seg.text;
            span.style.color = seg.color; span.style.textShadow = '0 1px 3px rgba(0,0,0,0.3)';
            el.appendChild(span);
        }
        let hpId;
        if (target === 'player') hpId = 'player-hp-section';
        else if (target === 'ai2') hpId = 'ai2-hp-section';
        else hpId = 'ai-hp-section';
        const hpSection = document.getElementById(hpId);
        if (!hpSection) return;
        const rect = hpSection.getBoundingClientRect();
        el.style.left = (rect.left + rect.width / 2 - 60) + 'px';
        el.style.top = (rect.top - 10) + 'px';
        document.body.appendChild(el);
        setTimeout(() => el.remove(), 2100);
    }

    shakeScreen(intensity, duration) {
        const container = document.getElementById('game-container');
        if (!container) return;
        if (this._shakeTimer) cancelAnimationFrame(this._shakeTimer);
        const start = performance.now();
        const dur = duration || 300;
        const int = intensity || 5;
        const tick = (now) => {
            const elapsed = now - start;
            if (elapsed >= dur) { container.style.transform = ''; this._shakeTimer = null; return; }
            const decay = 1 - elapsed / dur;
            const dx = (Math.random() - 0.5) * 2 * int * decay;
            const dy = (Math.random() - 0.5) * 2 * int * decay;
            container.style.transform = `translate(${dx}px, ${dy}px)`;
            this._shakeTimer = requestAnimationFrame(tick);
        };
        this._shakeTimer = requestAnimationFrame(tick);
    }

    burstParticles(x, y, color, count) {
        const particles = [];
        for (let i = 0; i < (count || 12); i++) {
            const angle = (Math.PI * 2 * i) / (count || 12) + (Math.random() - 0.5) * 0.5;
            const speed = 40 + Math.random() * 80;
            const size = 3 + Math.random() * 4;
            const el = document.createElement('div');
            el.className = 'burst-particle';
            el.style.left = x + 'px'; el.style.top = y + 'px';
            el.style.width = size + 'px'; el.style.height = size + 'px';
            el.style.background = color;
            el.style.boxShadow = `0 0 ${size * 2}px ${color}`;
            document.body.appendChild(el);
            particles.push({ el, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life: 1 });
        }
        const start = performance.now();
        const dur = 600;
        const tick = (now) => {
            const dt = (now - start) / dur;
            if (dt >= 1) { particles.forEach(p => p.el.remove()); return; }
            for (const p of particles) {
                const px = parseFloat(p.el.style.left) + p.vx * 0.016;
                const py = parseFloat(p.el.style.top) + p.vy * 0.016;
                p.vy += 120 * 0.016; p.life = 1 - dt;
                p.el.style.left = px + 'px'; p.el.style.top = py + 'px';
                p.el.style.opacity = p.life; p.el.style.transform = `scale(${p.life})`;
            }
            requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
    }
}

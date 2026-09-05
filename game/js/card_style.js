/**
 * Modern minimalist card rendering for battle UI and adventure screens.
 */
(function () {
  const CARD_COLORS = {
    RED:    { fill: '#E5383B', dark: '#B91C1C', soft: '#FEE2E2', ink: '#7F1D1D' },
    YELLOW: { fill: '#FACC15', dark: '#CA8A04', soft: '#FEF3C7', ink: '#713F12' },
    BLUE:   { fill: '#2563EB', dark: '#1D4ED8', soft: '#DBEAFE', ink: '#1E3A8A' },
    GREEN:  { fill: '#16A34A', dark: '#15803D', soft: '#DCFCE7', ink: '#14532D' },
    BLACK:  { fill: '#2A2D34', dark: '#181A1F', soft: '#E7E9ED', ink: '#F8FAFC' },
    WHITE:  { fill: '#F0EDE5', dark: '#D4CFC4', soft: '#FCFBF7', ink: '#34373D' }
  };

  const COLOR_SHORT = { RED: '红', YELLOW: '黄', BLUE: '蓝', GREEN: '绿' };
  const CARD_RADIUS = 11;
  const RIM = 4;
  const ITEM_META = {
    shuffle:      { label: 'SHUFFLE', aria: '洗牌', fallback: '↻' },
    draw_two:     { label: 'DRAW 2', aria: '抽二', fallback: '+2' },
    draw_three:   { label: 'DRAW 3', aria: '抽三', fallback: '+3' },
    super_purify: { label: 'PURIFY+', aria: '超级净化', fallback: 'P+' },
    purify:       { label: 'PURIFY', aria: '净化', fallback: 'P' },
    potion:       { label: 'POTION', aria: '药剂', fallback: '+' },
    magic:        { label: 'PURPLE MAGIC', aria: '紫魔法', fallback: '✦' },
    green_magic:  { label: 'GREEN MAGIC', aria: '绿魔法', fallback: '✦' },
    swap:         { label: 'SWAP', aria: '换牌', fallback: '⇄' },
    wild:         { label: 'WILD', aria: '指定颜色', fallback: '◆' },
    trophyWhite:  { label: 'BURN TROPHY', aria: '灼伤战利白卡', fallback: '♨' }
  };
  const TROPHY_LABELS = {
    BurnTrophy: 'BURN TROPHY',
    PiercingTrophy: 'BLEED TROPHY',
    FreezeTrophy: 'FREEZE TROPHY',
    RussianRouletteTrophy: 'RUSSIAN ROULETTE',
    FlyTrophy: 'FLY TROPHY',
    LushTrophy: 'LUSH TROPHY',
    PoisonTrophy: 'POISON TROPHY',
    TimeBombTrophy: 'TIME BOMB',
    GuardTrophy: 'GUARD TROPHY',
    DisarmTrophy: 'DISARM TROPHY',
    ZeroTrophy: 'ZERO TROPHY'
  };

  const ASSET_ROOT = (() => {
    if (typeof document === 'undefined' || !document.currentScript || !document.currentScript.src) return '';
    return new URL('../', document.currentScript.src).href;
  })();

  function cardAssetUrl(path) {
    if (typeof window.gameAssetUrl === 'function') return window.gameAssetUrl(path);
    return ASSET_ROOT ? new URL(path, ASSET_ROOT).href : path;
  }

  const ICON_PATHS = {
    black: cardAssetUrl('icons/card_icons/color_palette.png'),
    potion: cardAssetUrl('icons/card_icons/potion.png'),
    magic: cardAssetUrl('icons/card_icons/purple_magic.png'),
    green_magic: cardAssetUrl('icons/card_icons/green_magic.png'),
    draw_three: cardAssetUrl('icons/card_icons/draw_cards.png'),
    purify: cardAssetUrl('icons/card_icons/purify.png'),
    super_purify: cardAssetUrl('icons/card_icons/super_purify.png'),
    swap: cardAssetUrl('icons/card_icons/swap_cards.png'),
    shuffle: cardAssetUrl('icons/card_icons/shuffle.png'),
    trophyWhite: cardAssetUrl('icons/buff_icons/burn.png'),
    trophy_BurnTrophy: cardAssetUrl('icons/buff_icons/burn.png'),
    trophy_PiercingTrophy: cardAssetUrl('icons/buff_icons/bleed.png'),
    trophy_FreezeTrophy: cardAssetUrl('icons/buff_icons/freeze.png'),
    trophy_TimeBombTrophy: cardAssetUrl('icons/buff_icons/time_bomb.png'),
    trophy_RussianRouletteTrophy: cardAssetUrl('icons/card_icons/Russian_roulette.png'),
    trophy_FlyTrophy: cardAssetUrl('icons/buff_icons/fly.png'),
    trophy_LushTrophy: cardAssetUrl('icons/buff_icons/lush.png'),
    trophy_PoisonTrophy: cardAssetUrl('icons/buff_icons/poison.png'),
    trophy_GuardTrophy: cardAssetUrl('icons/buff_icons/guard.png'),
    trophy_DisarmTrophy: cardAssetUrl('icons/card_icons/disarm.png'),
    trophy_ZeroTrophy: cardAssetUrl('icons/card_icons/zero.png')
  };

  const iconCache = {};
  const iconLoadPromises = Object.keys(ICON_PATHS).map(name => new Promise(resolve => {
    const img = new Image();
    img.onload = () => resolve();
    img.onerror = () => resolve();
    img.src = ICON_PATHS[name];
    iconCache[name] = img;
  }));

  function loadIcon(name) {
    return iconCache[name] || null;
  }

  function iconForCard(card) {
    const kind = itemKind(card);
    if (card.trophyWhite) return loadIcon('trophy_' + (card.trophyName || 'BurnTrophy')) || loadIcon('trophyWhite');
    return loadIcon(iconForKind(kind));
  }

  function normalizeCard(raw) {
    const c = raw || {};
    const isItemCard = c.isItemCard != null ? c.isItemCard : !!(
      c.potion || c.magic || c.greenMagic || c.magicColor || c.purify || c.superPurify || c.drawTwo || c.drawThree || c.swapHand || c.shuffleToDeck
      || c.trophyWhite
    );
    const isNumberCard = c.isNumberCard != null ? c.isNumberCard : (
      !isItemCard && typeof c.value === 'number' && c.value >= 0 && !c.isBlack
    );
    return Object.assign({}, c, { isItemCard, isNumberCard });
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  function lighten(hex, amt) {
    let r = parseInt(hex.slice(1, 3), 16) + amt;
    let g = parseInt(hex.slice(3, 5), 16) + amt;
    let b = parseInt(hex.slice(5, 7), 16) + amt;
    r = Math.min(255, Math.max(0, r)); g = Math.min(255, Math.max(0, g)); b = Math.min(255, Math.max(0, b));
    return `#${r.toString(16).padStart(2,'0')}${g.toString(16).padStart(2,'0')}${b.toString(16).padStart(2,'0')}`;
  }

  function itemKind(card) {
    if (card.trophyWhite) return 'trophyWhite';
    if (card.shuffleToDeck) return 'shuffle';
    if (card.drawTwo) return 'draw_two';
    if (card.superPurify) return 'super_purify';
    if (card.purify) return 'purify';
    if (card.potion) return 'potion';
    if (card.greenMagic || card.magicColor === 'green') return 'green_magic';
    if (card.magic || card.magicColor === 'purple') return 'magic';
    if (card.drawThree) return 'draw_three';
    if (card.swapHand) return 'swap';
    return 'wild';
  }

  function iconForKind(kind) {
    if (kind === 'draw_two') return 'draw_three';
    if (kind === 'wild') return 'black';
    return kind;
  }

  function cardDescription(card) {
    const color = { RED: '红色', YELLOW: '黄色', BLUE: '蓝色', GREEN: '绿色', BLACK: '黑色', WHITE: '白色' }[card.color] || '';
    const trophy = card.trophyWhite && typeof window !== 'undefined' && window.AdventureRegistry && card.trophyName
      ? window.AdventureRegistry.getItem(card.trophyName) : null;
    const content = card.isNumberCard ? `${card.value}点数字牌` : (trophy ? trophy.displayName : ITEM_META[itemKind(card)].aria + '牌');
    const chosen = card.chosenColor && COLOR_SHORT[card.chosenColor] ? `，指定${COLOR_SHORT[card.chosenColor]}色` : '';
    return color + content + chosen;
  }

  function renderCard(card, w, h, selected) {
    card = normalizeCard(card);
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    c.className = 'card-canvas' + (selected ? ' selected' : '');
    c.setAttribute('role', 'img');
    c.setAttribute('aria-label', cardDescription(card));
    if (selected) c.setAttribute('aria-selected', 'true');
    const g = c.getContext('2d');
    g.imageSmoothingEnabled = true;
    g.imageSmoothingQuality = 'high';
    const r = Math.min(CARD_RADIUS, w * 0.16);
    const col = CARD_COLORS[card.color] || CARD_COLORS.BLACK;
    const hasChosen = !!(card.chosenColor && (card.isBlack || card.isWhite));
    const chosenCol = hasChosen ? CARD_COLORS[card.chosenColor] : null;
    const surfaceCol = col;
    const isBlack = card.color === 'BLACK' || card.isBlack;
    const isLight = card.color === 'WHITE' || card.isWhite || card.color === 'YELLOW';
    const isSurfaceLight = isLight;
    const compact = w < 52;

    g.save();
    roundRect(g, 0.5, 0.5, w - 1, h - 1, r);
    g.clip();

    const grad = g.createLinearGradient(0, 0, w, h);
    grad.addColorStop(0, lighten(surfaceCol.fill, 7));
    grad.addColorStop(0.58, surfaceCol.fill);
    grad.addColorStop(1, surfaceCol.dark);
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);

    g.fillStyle = 'rgba(255,255,255,0.12)';
    g.fillRect(0, 0, w, Math.max(1, h * 0.018));

    g.restore();

    g.strokeStyle = 'rgba(14,18,24,0.48)'; g.lineWidth = 1;
    roundRect(g, 0.5, 0.5, w - 1, h - 1, r); g.stroke();
    g.strokeStyle = isSurfaceLight ? 'rgba(255,255,255,0.74)' : 'rgba(255,255,255,0.28)';
    g.lineWidth = 1;
    roundRect(g, 3, 3, w - 6, h - 6, Math.max(4, r - 3)); g.stroke();

    // A restrained gold rim distinguishes reusable trophy-white cards from
    // ordinary white/item cards without changing the card's color treatment.
    if (card.trophyWhite) {
      g.strokeStyle = '#D4A72C';
      g.lineWidth = 2;
      roundRect(g, 2, 2, w - 4, h - 4, Math.max(4, r - 2));
      g.stroke();
    }

    const centerX = w * 0.5;
    const centerY = h * 0.5;
    const ovalRX = w * 0.42;
    const ovalRY = h * 0.19;
    const ovalAngle = -Math.PI / 4;
    if (hasChosen) {
      g.save();
      g.globalAlpha = 0.12;
      g.fillStyle = chosenCol.fill;
      g.beginPath();
      g.ellipse(centerX, centerY, ovalRX * 1.15, ovalRY * 1.15, ovalAngle, 0, Math.PI * 2);
      g.fill();
      g.restore();
      const ovalGrad = g.createLinearGradient(
        centerX - ovalRX * 0.6, centerY - ovalRY * 0.6,
        centerX + ovalRX * 0.6, centerY + ovalRY * 0.6
      );
      ovalGrad.addColorStop(0, lighten(chosenCol.fill, 12));
      ovalGrad.addColorStop(1, chosenCol.dark);
      g.fillStyle = ovalGrad;
    } else {
      g.fillStyle = isBlack ? 'rgba(255,255,255,0.10)' : col.soft;
    }
    g.beginPath();
    g.ellipse(centerX, centerY, ovalRX, ovalRY, ovalAngle, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = isBlack ? 'rgba(255,255,255,0.14)' : 'rgba(30,35,42,0.10)';
    g.lineWidth = 1;
    g.beginPath();
    g.ellipse(centerX, centerY, ovalRX - 0.5, ovalRY - 0.5, ovalAngle, 0, Math.PI * 2);
    g.stroke();

    if (card.isNumberCard) {
      const value = String(card.value);
      const mainSize = Math.min(w * 0.43, ovalRY * 1.08);
      g.font = `700 ${mainSize}px "Inter", "Segoe UI", sans-serif`;
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillStyle = isBlack ? '#F7F8FA' : col.ink;
      g.fillText(value, centerX, centerY + h * 0.015);

      g.font = `700 ${Math.max(7, w * 0.13)}px "Inter", "Segoe UI", sans-serif`;
      g.textAlign = 'left'; g.textBaseline = 'top';
      g.fillStyle = isSurfaceLight ? 'rgba(35,39,46,0.78)' : 'rgba(255,255,255,0.88)';
      g.fillText(value, RIM + 3, RIM + 2);
    } else {
      const kind = itemKind(card);
      const meta = ITEM_META[kind];
      const icon = iconForCard(card);
      const isBwItem = card.isBlack || card.isWhite;
      const iconSize = isBwItem
        ? Math.min(w * 0.44, ovalRY * 1.12)
        : Math.min(w * 0.34, ovalRY * 0.95);
      const iconY = centerY - iconSize * (isBwItem ? 0.56 : 0.64);

      if (icon && icon.complete && icon.naturalWidth) {
        g.save();
        g.globalAlpha = isBlack ? 0.92 : 0.84;
        g.drawImage(icon, centerX - iconSize / 2, iconY, iconSize, iconSize);
        g.restore();
      } else {
        g.font = `700 ${Math.max(12, w * 0.25)}px "Inter", "Segoe UI Symbol", sans-serif`;
        g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillStyle = isBlack ? '#F7F8FA' : col.ink;
        g.fillText(meta.fallback, centerX, centerY - ovalRY * 0.12);
      }

      if (!compact) {
        g.font = `600 ${Math.max(6, w * 0.09)}px "Inter", "Segoe UI", sans-serif`;
        g.textAlign = 'center'; g.textBaseline = 'bottom';
        g.fillStyle = isBlack ? 'rgba(248,250,252,0.78)' : 'rgba(42,47,55,0.76)';
        const labelY = centerY + ovalRY * (isBwItem ? 0.82 : 0.72);
        g.fillText(card.trophyWhite ? (TROPHY_LABELS[card.trophyName] || 'TROPHY WHITE') : meta.label, centerX, labelY);
      }

      const cornerMark = (card.isBlack || card.isWhite) ? '◆' : meta.fallback;
      g.font = `600 ${Math.max(6, w * 0.105)}px "Inter", "Segoe UI Symbol", sans-serif`;
      g.textAlign = 'left'; g.textBaseline = 'top';
      g.fillStyle = isSurfaceLight ? 'rgba(35,39,46,0.76)' : 'rgba(255,255,255,0.84)';
      g.fillText(cornerMark, RIM + 3, RIM + 3);
    }

    return c;
  }

  function renderCardBack(w, h) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    c.className = 'card-back-canvas';
    c.setAttribute('role', 'img');
    c.setAttribute('aria-label', '卡牌背面');
    const g = c.getContext('2d');
    g.imageSmoothingEnabled = true;
    g.imageSmoothingQuality = 'high';
    const r = Math.min(CARD_RADIUS, w * 0.16);

    g.save();
    roundRect(g, 0.5, 0.5, w - 1, h - 1, r);
    g.clip();

    const grad = g.createLinearGradient(0, 0, w, h);
    grad.addColorStop(0, '#343943'); grad.addColorStop(1, '#1E222A');
    g.fillStyle = grad; g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(255,255,255,0.05)';
    g.fillRect(0, 0, w, Math.max(1, h * 0.02));

    g.restore();

    g.strokeStyle = 'rgba(10,12,16,0.55)'; g.lineWidth = 1;
    roundRect(g, 0.5, 0.5, w - 1, h - 1, r); g.stroke();
    g.strokeStyle = 'rgba(226,232,240,0.24)'; g.lineWidth = 1;
    roundRect(g, 4, 4, w - 8, h - 8, Math.max(4, r - 4)); g.stroke();

    const markW = w * 0.62;
    const markH = Math.max(14, h * 0.16);
    g.fillStyle = 'rgba(255,255,255,0.06)';
    g.beginPath();
    g.ellipse(w / 2, h / 2, markW / 2, markH / 2, -Math.PI / 4, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = 'rgba(226,232,240,0.18)'; g.lineWidth = 1;
    g.beginPath();
    g.ellipse(w / 2, h / 2, markW / 2 - 0.5, markH / 2 - 0.5, -Math.PI / 4, 0, Math.PI * 2);
    g.stroke();
    g.font = `650 ${Math.max(10, w * 0.2)}px "Inter", "Segoe UI", sans-serif`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = 'rgba(248,250,252,0.82)';
    g.fillText('FT', w / 2, h / 2 - (w >= 60 ? 3 : 0));
    if (w >= 60) {
      g.font = `500 ${Math.max(5, w * 0.07)}px "Inter", "Segoe UI", sans-serif`;
      g.fillStyle = 'rgba(226,232,240,0.52)';
      g.fillText('FURRY TRIAL', w / 2, h / 2 + h * 0.105);
    }

    return c;
  }

  window.CardStyle = {
    CARD_COLORS,
    COLOR_SHORT,
    normalizeCard,
    renderCard,
    renderCardBack,
    roundRect,
    cardIconsReady: Promise.all(iconLoadPromises)
  };
  window.renderCard = renderCard;
  window.renderCardBack = renderCardBack;
  window.cardIconsReady = window.CardStyle.cardIconsReady;
})();

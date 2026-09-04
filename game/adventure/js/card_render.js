/**
 * Adventure card render shim — delegates to shared CardStyle module.
 */
(function () {
  function renderCard(card, w, h, selected) {
    let canvas;
    if (window.CardStyle && window.CardStyle.renderCard) {
      canvas = window.CardStyle.renderCard(card, w, h, selected);
    } else {
      canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      canvas.className = 'card-canvas' + (selected ? ' selected' : '');
    }
    // Keep borrowed monster white cards marked in adventure-only renders too
    // (the adventure shim replaces the shared global renderCard function).
    if (typeof window.markNpcWhiteCard === 'function') return window.markNpcWhiteCard(canvas, card);
    return canvas;
  }

  window.renderCard = renderCard;
  window.CARD_W = 70;
  window.CARD_H = 100;
  if (window.CardStyle && window.CardStyle.cardIconsReady) {
    window.cardIconsReady = window.CardStyle.cardIconsReady;
  } else {
    window.cardIconsReady = Promise.resolve();
  }
})();

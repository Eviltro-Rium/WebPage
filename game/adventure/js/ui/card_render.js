/**
 * Adventure card render shim — delegates to shared CardStyle module.
 */
(function () {
  function renderCard(card, w, h, selected, opts) {
    if (window.CardStyle && window.CardStyle.renderCard) {
      return window.CardStyle.renderCard(card, w, h, selected, opts);
    }
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    canvas.className = 'card-canvas' + (selected ? ' selected' : '');
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

/**
 * Adventure card render shim — delegates to shared CardStyle module.
 */
(function () {
  function renderCard(card, w, h, selected) {
    if (window.CardStyle && window.CardStyle.renderCard) {
      return window.CardStyle.renderCard(card, w, h, selected);
    }
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    c.className = 'card-canvas' + (selected ? ' selected' : '');
    return c;
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

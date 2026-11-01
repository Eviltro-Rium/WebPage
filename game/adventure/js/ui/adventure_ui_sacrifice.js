(function () {
  Object.assign(window.AdventureUI.prototype, {
    _buildSacrificePage(snap) {
      const page = document.createElement('section');
      page.className = 'adv-reward-page adv-sacrifice-page';
      const hand = snap.playerPile && snap.playerPile.hand || [];
      const eligible = hand.map((card, index) => ({ card, index })).filter(({card}) => card.trophyWhite && card.isWhite && !card.isBlack && !card.borrowedMonster);
      const selected = eligible.find(({index}) => index === this._sacrificeCardIndex && this.eng.s.playerPile.hand[index] === this._sacrificeSelectedCard);
      const busy = !!this._sacrificeBusy;
      const remaining = snap.sacrificeUpgradesRemaining;
      const result = snap.roomInfo.sacrificeResult;
      page.innerHTML = '<div class="adv-sacrifice-heading"><img src="../icons/npc_icons/satan.webp" alt="撒旦"><div><h2>献祭房</h2><span class="adv-sacrifice-health" aria-live="polite">当前生命 ' + snap.player.hp + ' / ' + snap.player.maxHp + '</span></div></div>' +
        '<div class="adv-sacrifice-offers"><section class="adv-sacrifice-offer"><h3>献血祈愿</h3><p><strong>1/6</strong> 概率获得随机道具。</p>' +
        '<button class="adv-btn adv-btn-primary" id="adv-sacrifice-item"' + (busy || snap.consumables.length >= snap.consumableSlots ? ' disabled' : '') + '>献祭1点生命</button></section>' +
        '<section class="adv-sacrifice-offer"><h3>黑色淬炼</h3><p>手牌白卡升级为黑卡：效果不变，可指定颜色。</p>' +
        '<div class="adv-sacrifice-hand"></div>' + (!eligible.length ? '<p class="adv-sacrifice-empty">暂无可升级手牌</p>' : '') +
        '<p class="adv-sacrifice-note">本层剩余 ' + remaining + ' / 3 次升级</p>' +
        '<button class="adv-btn adv-btn-primary" id="adv-sacrifice-upgrade"' + (!selected || busy || remaining <= 0 ? ' disabled' : '') + '>确认升级 · 献祭5点生命</button></section></div>' +
        '<div class="adv-sacrifice-result" role="status"></div>' +
        '<p class="adv-sacrifice-note">生命不足仍可献祭；生命归零时，需复活十字保护。</p>' +
        '<button class="adv-btn" id="adv-sacrifice-leave"' + (busy ? ' disabled' : '') + '>返回地图</button>';
      const row = page.querySelector('.adv-sacrifice-hand');
      eligible.forEach(({card, index}) => {
        const button = document.createElement('button');
        button.className = 'adv-sacrifice-card' + (selected && selected.index === index ? ' selected' : '');
        button.dataset.sacrificeCard = String(index);
        button.disabled = busy || remaining <= 0;
        button.setAttribute('aria-pressed', String(!!selected && selected.index === index));
        button.appendChild(window.renderCard(card, 64, 92, false));
        row.appendChild(button);
      });
      if (result) {
        const output = page.querySelector('.adv-sacrifice-result');
        if (result.itemName) {
          const def = window.AdventureRegistry.getItem(result.itemName);
          if (def) { const icon = document.createElement('img'); icon.src = def.icon; icon.alt = def.displayName; output.appendChild(icon); }
        }
        const message = document.createElement('span'); message.textContent = result.message; output.appendChild(message);
        if (busy) output.classList.add('revealing');
      }
      return page;
    },
    async _handleSacrificeAction(button) {
      if (this._sacrificeBusy || this.eng.s.phase !== window.AdventurePhase.SACRIFICE) return;
      if (button.hasAttribute('data-sacrifice-card')) {
        const index = Number(button.dataset.sacrificeCard);
        this._sacrificeCardIndex = this._sacrificeCardIndex === index ? null : index;
        this._sacrificeSelectedCard = this.eng.s.playerPile.hand[this._sacrificeCardIndex];
        this.render();
        return;
      }
      if (button.id === 'adv-sacrifice-leave') {
        this._sacrificeCardIndex = null; this.eng.leaveSacrificeRoom(); this.render(); return;
      }
      if (button.id === 'adv-sacrifice-upgrade' && this.eng.s.playerPile.hand[this._sacrificeCardIndex] !== this._sacrificeSelectedCard) { this._toast('手牌已改变，请重新选择'); return; }
      const result = button.id === 'adv-sacrifice-upgrade'
        ? this.eng.sacrificeUpgradeTrophy(this._sacrificeCardIndex) : this.eng.sacrificeForItem();
      if (!result.ok) { this._toast(result.message); return; }
      this._sacrificeCardIndex = null;
      this._sacrificeSelectedCard = null;
      if (this.eng.isGameOver()) { this.render(); return; }
      this._sacrificeBusy = true;
      this.render();
      try {
        const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (!reduce) await window.FurryGame.CombatRuntime.wait(650, this, 'sacrifice-reveal');
      } finally { this._sacrificeBusy = false; this.render(); }
    }
  });
})();

(function () {
  const outcomes = [
    [1, 1, '异场景怪物', '遭遇其他场景同层怪物'],
    [2, 2, '异场景精英', '遭遇其他场景第3层精英'],
    [3, 3, '丢弃道具', '选择丢弃一个一次性道具'],
    [4, 4, '金币损失', '损失一半金币，向上取整'],
    [5, 6, '状态归零', '清除自身全部正面与负面状态'],
    [7, 8, '手牌重置', '全部手牌放入弃牌库，重新抽取3张'],
    [9, 10, '修复补给', '恢复10点生命，手牌补至上限'],
    [11, 11, '意外收获', '获得一个随机一次性道具'],
    [12, 12, '金币补给', '获得10金币']
  ];
  Object.assign(window.AdventureUI.prototype, {
    _buildGlitchPage(snap) {
      const page = document.createElement('section');
      page.className = 'adv-reward-page adv-glitch-page';
      const event = snap.roomInfo.glitchEvent;
      const rolled = event && event.status === 'rolled';
      const busy = !!(this._glitchRolling || this._glitchResolving);
      let html = '<div class="adv-glitch-heading"><img src="../icons/adventure_ui_icons/glitch_room.webp" alt=""><div><div class="adv-glitch-kicker">异常信号</div><h2>故障房间</h2></div></div>';
      const intro = !event ? '投掷12面骰，抽取一次故障事件。也可暂时离开，稍后回来再投。'
        : rolled ? '骰面已落定，事件即将触发。' : '本房事件已触发，离开或刷新均不会重抽。';
      html += '<p class="adv-glitch-intro">' + intro + '</p>';
      if (event) {
        html += '<div class="adv-glitch-die' + (busy ? ' rolling' : '') + '" aria-label="12面骰结果' + event.roll + '"><small>D12</small><strong>' + event.roll + '</strong></div>';
        if (event.adjusted) html += '<p class="adv-glitch-note">魔术师：' + event.originalRoll + ' → ' + event.roll + '（已消耗3点生命）</p>';
      }
      html += '<div class="adv-glitch-outcomes">';
      outcomes.forEach(([first, last, title, detail]) => {
        const range = first === last ? String(first) : first + '–' + last;
        const active = event && event.roll >= first && event.roll <= last;
        html += '<div class="adv-glitch-outcome' + (active ? ' active' : '') + '"><span>' + range + '</span><div><b>' + title + '</b><small>' + detail + '</small></div></div>';
      });
      html += '</div>';
      if (!event) {
        html += '<div class="adv-glitch-actions"><button class="adv-btn adv-btn-primary" id="adv-glitch-roll">投掷事件骰</button><button class="adv-btn" id="adv-glitch-leave">暂时离开</button></div>';
      } else if (rolled) {
        if (!busy && this.eng.hasAccessory('Magician') && this.eng.canAdjustGlitchDice()) {
          html += '<section class="magician-choice"><div class="magician-choice-head"><img src="../icons/items_icons/magician.webp" alt="" width="32" height="32"><div><h3>魔术师</h3><p>消耗 3 点生命 · 5秒内可调整</p></div></div>' +
            '<div class="dice-magician-actions" role="group" aria-label="调整骰面">' +
            '<button type="button" class="magician-option" id="adv-glitch-minus"' + (event.roll > 1 ? '' : ' disabled') + '><b>−1</b><small>' + (event.roll > 1 ? '改为 ' + (event.roll - 1) : '已到下限') + '</small></button>' +
            '<button type="button" class="magician-option magician-keep" id="adv-glitch-keep"><b>保留</b><small>不消耗生命</small></button>' +
            '<button type="button" class="magician-option" id="adv-glitch-plus"' + (event.roll < 12 ? '' : ' disabled') + '><b>+1</b><small>' + (event.roll < 12 ? '改为 ' + (event.roll + 1) : '已到上限') + '</small></button></div></section>';
        } else if (busy) {
          html += '<p class="adv-glitch-note">骰子判定中…</p>';
        }
      } else {
        html += '<p class="adv-glitch-result" role="status">' + event.message + '</p>';
        if (['discard', 'overflow'].includes(event.status)) {
          html += '<div class="adv-item-grid adv-item-discard-grid">';
          snap.consumables.forEach((item, index) => {
            html += '<button class="adv-item-slot filled adv-item-discard-slot" data-glitch-discard="' + index + '"><img class="adv-item-icon" src="' + item.icon + '" alt=""><div class="adv-item-name">' + item.displayName + '</div><span class="adv-item-discard-label">丢弃</span></button>';
          });
          html += '</div>';
        } else html += '<button class="adv-btn adv-btn-primary" id="adv-glitch-leave"' + (busy ? ' disabled' : '') + '>返回地图</button>';
      }
      html += '<p class="adv-glitch-note">每房仅能触发一次事件。遥控骰子无法改变事件骰。</p>';
      page.innerHTML = html;
      return page;
    },
    async _animateGlitchHand(arriving) {
      const zone = this.container.querySelector('#adv-hand-zone');
      const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (!zone || reduce) return;
      await Promise.all(Array.from(zone.children).map(card => new Promise(resolve => {
        if (!card.animate) { resolve(); return; }
        const frames = arriving
          ? [{opacity:0, transform:'translateY(14px) scale(.92)'}, {opacity:1, transform:'none'}]
          : [{opacity:1, transform:'none'}, {opacity:0, transform:'translateY(-16px) scale(.88)'}];
        let animation;
        const timer = setTimeout(() => { if (animation) animation.cancel(); resolve(); }, 650);
        const done = () => { clearTimeout(timer); resolve(); };
        try {
          animation = card.animate(frames, {duration:arriving ? 280 : 180, easing:'ease-out', fill:'forwards'});
          animation.onfinish = done; animation.oncancel = done;
        } catch (_) { done(); }
      })));
    },
    async _finishGlitchRoll() {
      if (this._glitchResolving) return;
      const event = this.eng.s && this.eng.currentRoom() && this.eng.currentRoom().glitchEvent;
      if (!event || event.status !== 'rolled') return;
      if (window.FurryGame && window.FurryGame.CombatRuntime) window.FurryGame.CombatRuntime.cancel(this, 'glitch-adjust');
      this._glitchAdjustWaiting = false;
      this._glitchResolving = true;
      try {
        const resetHand = Math.floor((event.roll - 1) / 2) === 3;
        if (resetHand) { this.render(); await this._animateGlitchHand(false); }
        const launched = this.eng.resolveGlitchEvent();
        if (launched && this.eng.s.phase === window.AdventurePhase.PLAYER_PLAY) {
          await this._startBridgeCombat();
          return;
        }
        this.render();
        if (resetHand) await this._animateGlitchHand(true);
      } finally {
        this._glitchResolving = false;
        if (this.eng.s.phase === window.AdventurePhase.GLITCH) this.render();
      }
    },
    _maybeAutoResolvePendingGlitchRoll() {
      if (this._glitchRolling || this._glitchResolving) return;
      const phase = this.eng && this.eng.s && this.eng.s.phase;
      if (phase !== window.AdventurePhase.GLITCH) return;
      const event = this.eng.currentRoom() && this.eng.currentRoom().glitchEvent;
      if (!event || event.status !== 'rolled') return;
      if (this.eng.canAdjustGlitchDice()) { this._startGlitchAdjustWindow(); return; }
      void this._finishGlitchRoll();
    },
    _startGlitchAdjustWindow() {
      if (this._glitchAdjustWaiting) return;
      this._glitchAdjustWaiting = true;
      window.FurryGame.CombatRuntime.schedule(this, () => {
        this._glitchAdjustWaiting = false;
        void this._finishGlitchRoll();
      }, 5000, 'glitch-adjust');
    },
    async _handleGlitchAction(button) {
      if (this._glitchRolling || this._glitchResolving) return;
      const id = button.id;
      if (id === 'adv-glitch-roll') {
        if (!this.eng.rollGlitchEvent()) return;
        this._glitchRolling = true;
        this.render();
        const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (!reduce) await new Promise(resolve => setTimeout(resolve, 600));
        this._glitchRolling = false;
        if (this.eng.canAdjustGlitchDice()) { this._startGlitchAdjustWindow(); this.render(); return; }
        await this._finishGlitchRoll();
        return;
      }
      if (id === 'adv-glitch-minus' || id === 'adv-glitch-plus') {
        if (!this.eng.adjustGlitchDice(id === 'adv-glitch-plus' ? 1 : -1)) return;
        await this._finishGlitchRoll();
        return;
      }
      if (id === 'adv-glitch-keep') { await this._finishGlitchRoll(); return; }
      if (id === 'adv-glitch-leave') this.eng.leaveGlitchRoom();
      else if (button.hasAttribute('data-glitch-discard')) this.eng.discardGlitchItem(Number(button.getAttribute('data-glitch-discard')));
      this.render();
    }
  });
})();

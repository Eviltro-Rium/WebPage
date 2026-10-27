(function () {
  const outcomes = [
    ['1–2', '遭遇异场景怪物', '同层怪物，独立结算战利品，无基础奖励与兽元结算'],
    ['3–4', '丢弃道具', '选择丢弃一个一次性道具'],
    ['5–6', '状态归零', '清除自身全部正面与负面状态'],
    ['7–8', '手牌重置', '全部手牌放入弃牌库，重新抽取3张'],
    ['9–10', '修复补给', '恢复10点生命，手牌补至上限'],
    ['11–12', '意外收获', '获得一个随机一次性道具']
  ];
  Object.assign(window.AdventureUI.prototype, {
    _buildGlitchPage(snap) {
      const page = document.createElement('section');
      page.className = 'adv-reward-page adv-glitch-page';
      const event = snap.roomInfo.glitchEvent;
      const rolled = event && event.status === 'rolled';
      const busy = !!this._glitchRolling;
      let html = '<div class="adv-glitch-heading"><img src="../icons/adventure_ui_icons/glitch_room.webp" alt=""><div><div class="adv-glitch-kicker">异常信号</div><h2>故障房间</h2></div></div>';
      const intro = !event ? '投掷12面骰，抽取一次故障事件。也可暂时离开，稍后回来再投。'
        : rolled ? '骰面已落定，事件即将触发。' : '本房事件已触发，离开或刷新均不会重抽。';
      html += '<p class="adv-glitch-intro">' + intro + '</p>';
      if (event) {
        html += '<div class="adv-glitch-die' + (busy ? ' rolling' : '') + '" aria-label="12面骰结果' + event.roll + '"><small>D12</small><strong>' + event.roll + '</strong></div>';
        if (event.adjusted) html += '<p class="adv-glitch-note">魔术师：' + event.originalRoll + ' → ' + event.roll + '（已消耗3点生命）</p>';
      }
      html += '<div class="adv-glitch-outcomes">';
      outcomes.forEach(([range, title, detail], index) => {
        const active = event && Math.floor((event.roll - 1) / 2) === index;
        html += '<div class="adv-glitch-outcome' + (active ? ' active' : '') + '"><span>' + range + '</span><div><b>' + title + '</b><small>' + detail + '</small></div></div>';
      });
      html += '</div>';
      if (!event) {
        html += '<div class="adv-glitch-actions"><button class="adv-btn adv-btn-primary" id="adv-glitch-roll">投掷事件骰</button><button class="adv-btn" id="adv-glitch-leave">暂时离开</button></div>';
      } else if (rolled) {
        if (!busy && this.eng.hasAccessory('Magician') && this.eng.canAdjustGlitchDice()) {
          html += '<div class="adv-glitch-actions"><button class="adv-btn" id="adv-glitch-minus"' + (event.roll > 1 ? '' : ' disabled') + '>−1</button><span>魔术师 · 消耗3点生命调整一次（须在事件触发前）</span><button class="adv-btn" id="adv-glitch-plus"' + (event.roll < 12 ? '' : ' disabled') + '>+1</button></div>';
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
        } else html += '<button class="adv-btn adv-btn-primary" id="adv-glitch-leave">返回地图</button>';
      }
      html += '<p class="adv-glitch-note">每房仅能触发一次事件。遥控骰子无法改变事件骰。</p>';
      page.innerHTML = html;
      return page;
    },
    async _finishGlitchRoll() {
      if (this._glitchResolving) return;
      const event = this.eng.s && this.eng.currentRoom() && this.eng.currentRoom().glitchEvent;
      if (!event || event.status !== 'rolled') return;
      this._glitchResolving = true;
      try {
        const launched = this.eng.resolveGlitchEvent();
        if (launched && this.eng.s.phase === window.AdventurePhase.PLAYER_PLAY) {
          await this._startBridgeCombat();
          return;
        }
        this.render();
      } finally {
        this._glitchResolving = false;
      }
    },
    _maybeAutoResolvePendingGlitchRoll() {
      if (this._glitchRolling || this._glitchResolving) return;
      const phase = this.eng && this.eng.s && this.eng.s.phase;
      if (phase !== window.AdventurePhase.GLITCH) return;
      const event = this.eng.currentRoom() && this.eng.currentRoom().glitchEvent;
      if (!event || event.status !== 'rolled') return;
      void this._finishGlitchRoll();
    },
    async _handleGlitchAction(button) {
      if (this._glitchRolling) return;
      const id = button.id;
      if (id === 'adv-glitch-roll') {
        if (!this.eng.rollGlitchEvent()) return;
        this._glitchRolling = true;
        this.render();
        const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (!reduce) await new Promise(resolve => setTimeout(resolve, 600));
        this._glitchRolling = false;
        await this._finishGlitchRoll();
        return;
      }
      if (id === 'adv-glitch-minus' || id === 'adv-glitch-plus') {
        if (!this.eng.adjustGlitchDice(id === 'adv-glitch-plus' ? 1 : -1)) return;
        await this._finishGlitchRoll();
        return;
      }
      if (id === 'adv-glitch-leave') this.eng.leaveGlitchRoom();
      else if (button.hasAttribute('data-glitch-discard')) this.eng.discardGlitchItem(Number(button.getAttribute('data-glitch-discard')));
      this.render();
    }
  });
})();

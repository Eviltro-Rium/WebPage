/* Table area rendering: discard top, attack/defend zones, judgment reveal,
 * error hints and the game-over dialog. */
(function (global) {
    const GameUI = global.GameUI;
    if (!GameUI) {
        console.error('[UI zones] GameUI must be loaded first');
        return;
    }
    Object.assign(GameUI.prototype, {
        _renderDiscardTop() {
            const s = this.state;
            const container = document.getElementById('discard-top');
            container.innerHTML = '';
            if (s.discardTop) {
                const cv = renderCard(s.discardTop, 60, 86, false);
                cv.classList.add('disabled'); cv.style.cursor = 'default';
                container.appendChild(cv);
            } else {
                container.innerHTML = '<span style="color:rgba(255,255,255,0.5);font-size:0.7rem">空</span>';
            }
        },

        _renderZones() {
            const s = this.state;
            const atkContainer = document.getElementById('atk-cards');
            const defContainer = document.getElementById('def-cards');

            const atkKey = s.atkCard ? JSON.stringify(s.atkCard) : 'empty';
            const defKey = s.defCard ? JSON.stringify(s.defCard) : 'empty';
            if (atkContainer.dataset.cardKey !== atkKey && s.atkCard) {
                atkContainer.innerHTML = '';
                const [zw, zh] = currentZoneCardSize();
                const cv = renderCard(s.atkCard, zw, zh, false, { isNpc: !!(s.atkOwner && s.atkOwner !== 'player') });
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
                const [zw, zh] = currentZoneCardSize();
                const cv = renderCard(s.defCard, zw, zh, false, { isNpc: !!(s.defOwner && s.defOwner !== 'player') });
                cv.classList.add('zone-card');
                defContainer.appendChild(cv);
                defContainer.dataset.cardKey = defKey;
                this._showCardSkillDesc('def-desc', s.defCard, s.defOwner || 'player', true);
            } else if (defContainer.dataset.cardKey !== 'empty' && !s.defCard) {
                defContainer.innerHTML = '<span style="color:rgba(255,255,255,0.5);font-size:0.7rem">等待防御</span>';
                defContainer.dataset.cardKey = 'empty';
                this._hideZoneDesc('def-desc');
            }
        },

        _renderReveal() {
            const box = document.getElementById('reveal-cards');
            if (!box) return;
            // The state returned by the engine already contains the result of the
            // whole defense resolution.  Do not let that final snapshot paint a
            // judgment card while its preceding defense-card event is still being
            // animated; the reveal event itself owns the judgment area meanwhile.
            if (this._isConsumingEvents) return;
            const cards = this.state.revealCards || [];
            const dice = this.state.diceRoll || null;
            const key = JSON.stringify({ cards, dice });
            if (box.dataset.cardKey === key) return;
            box.innerHTML = '';
            box.classList.toggle('reveal-multi', !dice && cards.length > 1);
            if (dice && Number.isFinite(Number(dice.value))) {
                box.innerHTML = '<div class="d12-result" aria-label="12面骰结果"><span class="d12-label">D12</span><strong>' + dice.value + '</strong></div>';
            } else {
                if (!cards.length) box.innerHTML = '<span class="reveal-empty">等待判定</span>';
                const cw = cards.length > 1 ? 52 : 60;
                const ch = cards.length > 1 ? 74 : 86;
                for (const card of cards) {
                    const cv = renderCard(card, cw, ch, false);
                    cv.classList.add('revealed-card'); box.appendChild(cv);
                }
            }
            box.dataset.cardKey = key;
        },

        showError(msg) {
            const el = document.getElementById('error-hint');
            if (!el) return;
            el.textContent = msg; setTimeout(() => { el.textContent = ''; }, 2000);
        },

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
    });
})(window);
/* Table area rendering: discard top, attack/defend zones, judgment reveal,
 * error hints and the game-over dialog. */
(function (global) {
    const GameUI = global.GameUI;
    if (!GameUI) {
        console.error('[UI zones] GameUI must be loaded first');
        return;
    }
    const schedule = (fn, ms) => {
        const runtime = global.FurryGame && global.FurryGame.CombatRuntime;
        return runtime ? runtime.schedule(null, fn, ms) : setTimeout(fn, ms);
    };
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

            // A black card remains selected in the hand while its color is
            // being chosen.  Hide any legacy/stale zone copy during that
            // transient state; the confirmed play event is the only point at
            // which the card should enter the table and animate.
            const pendingAttack = s.pendingBlackPlay && s.pendingBlackPlay.mode === 'attack';
            const pendingDefense = s.pendingBlackPlay && s.pendingBlackPlay.mode === 'defend';
            const visibleAtkCard = pendingAttack ? null : s.atkCard;
            const visibleDefCard = pendingDefense ? null : s.defCard;
            if (pendingAttack) this._hideZoneDesc('atk-desc');
            if (pendingDefense) this._hideZoneDesc('def-desc');
            const atkKey = visibleAtkCard ? JSON.stringify(visibleAtkCard) : 'empty';
            const defKey = visibleDefCard ? JSON.stringify(visibleDefCard) : 'empty';
            if (atkContainer.dataset.cardKey !== atkKey && visibleAtkCard) {
                atkContainer.innerHTML = '';
                const [zw, zh] = currentZoneCardSize();
                const cv = renderCard(visibleAtkCard, zw, zh, false, { isNpc: !!(s.isAdventure && s.atkOwner && s.atkOwner !== 'player') });
                cv.classList.add('zone-card');
                atkContainer.appendChild(cv);
                atkContainer.dataset.cardKey = atkKey;
                const atkOwner = s.atkOwner || s.activeAttacker || 'player';
                this._showCardSkillDesc('atk-desc', visibleAtkCard, atkOwner, false);
            } else if (atkContainer.dataset.cardKey !== 'empty' && !visibleAtkCard) {
                atkContainer.innerHTML = '<span style="color:rgba(255,255,255,0.5);font-size:0.7rem">等待出牌</span>';
                atkContainer.dataset.cardKey = 'empty';
                this._hideZoneDesc('atk-desc');
            }

            if (defContainer.dataset.cardKey !== defKey && visibleDefCard) {
                defContainer.innerHTML = '';
                const [zw, zh] = currentZoneCardSize();
                const cv = renderCard(visibleDefCard, zw, zh, false, { isNpc: !!(s.isAdventure && s.defOwner && s.defOwner !== 'player') });
                cv.classList.add('zone-card');
                defContainer.appendChild(cv);
                defContainer.dataset.cardKey = defKey;
                const defOwner = s.defOwner || (s.atkOwner === 'player' || s.activeAttacker === 'player'
                    ? (s.is1v2 ? (s.attackTarget || 'ai') : 'ai')
                    : 'player');
                this._showCardSkillDesc('def-desc', visibleDefCard, defOwner, true);
            } else if (defContainer.dataset.cardKey !== 'empty' && !visibleDefCard) {
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
            if (this._isConsumingEvents || (this.state.events||[]).some(evt=>evt.type==='reveal'||evt.type==='judgmentEnd')) return;
            const cards = this.state.revealCards || [];
            const dice = this.state.diceRoll || null;
            this._judgmentCards=cards;
            const key = JSON.stringify({ cards, dice });
            if (box.dataset.cardKey === key) return;
            box.innerHTML = '';
            box.classList.toggle('reveal-multi', !dice && cards.length > 1);
            if (!cards.length && dice && Number.isFinite(Number(dice.value))) {
                box.innerHTML = '<div class="d12-result" aria-label="12面骰结果"><span class="d12-label">D12</span><strong>' + dice.value + '</strong></div>';
            } else {
                if (!cards.length) box.innerHTML = '<span class="reveal-empty">等待判定</span>';
                const cw = cards.length > 1 ? 52 : 60;
                const ch = cards.length > 1 ? 74 : 86;
                for (const card of cards) {
                    const cv = renderCard(card, cw, ch, false);
                    cv.dataset.cardId=cardId(card);
                    cv.classList.add('revealed-card'); box.appendChild(cv);
                }
            }
            box.dataset.cardKey = key;
        },

        // Inline D12 decisions, no modal and no inventory-slot activation.
        _renderDiceControl() {
            const zone = document.getElementById('reveal-cards')?.closest('.reveal-zone');
            if (!zone) return;
            let panel = zone.querySelector('.dice-control-panel');
            const pending = this.state && this.state.pendingDiceControl;
            zone.classList.toggle('dice-control-active', !!pending);
            if (!pending) { if (panel) panel.remove(); return; }
            if (!panel) {
                panel = document.createElement('div');
                panel.className = 'dice-control-panel';
                zone.appendChild(panel);
            }
            const key = pending.presentedThrough + ':' + pending.diceIndex;
            if (panel.dataset.key === key) return;
            panel.dataset.key = key;
            panel.innerHTML = '<div class="dice-control-actions"><button type="button" data-keep>保留 ' + pending.value + '</button>' +
                '<button type="button" data-edit aria-expanded="false">遥控骰子</button></div>' +
                '<div class="dice-face-grid" hidden aria-label="选择骰面">' +
                Array.from({length:12},(_,i)=>'<button type="button" data-face="'+(i+1)+'">'+(i+1)+'</button>').join('') + '</div>';
            const submit = (use,value) => {
                if (this._isHandlingAction || this._isConsumingEvents) return;
                if (use) {
                    const face = zone.querySelector('.d12-result strong, .d12-die-face');
                    if (face) face.textContent = String(value);
                }
                panel.querySelectorAll('button').forEach(button => button.disabled = true);
                this._apiAction('chooseDiceControl',{use,value}).finally(() => {
                    if (panel.isConnected) panel.querySelectorAll('button').forEach(button => button.disabled = false);
                });
            };
            panel.querySelector('[data-keep]').onclick = () => submit(false);
            panel.querySelector('[data-edit]').onclick = event => {
                const grid = panel.querySelector('.dice-face-grid');
                grid.hidden = !grid.hidden;
                event.currentTarget.setAttribute('aria-expanded',String(!grid.hidden));
            };
            panel.querySelectorAll('[data-face]').forEach(button => {
                button.onclick = () => submit(true,Number(button.dataset.face));
            });
        },

        showError(msg) {
            const el = document.getElementById('error-hint');
            if (!el) return;
            el.textContent = msg; schedule(() => { el.textContent = ''; }, 2000);
        },

        _showGameOver() {
            const close = typeof this.onGameOverClose === 'function'
                ? action => this.onGameOverClose(action)
                : async () => {
                    await this._sessionDispatch('restart');
                    this.state = null; this._prevState = null;
                    if (this._pollInterval) clearInterval(this._pollInterval);
                    this.gameScreen.classList.remove('active');
                    this.selectScreen.classList.add('active');
                    this._selectedPlayerChar = null; this._selectedAIChar = null;
                    this._buildSelectScreen();
                };
            this.dialogs.showGameOver(this.state, close);
        }
    });
})(window);

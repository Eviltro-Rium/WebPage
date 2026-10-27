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
            const pendingLoot = this.state.pendingDiceControl && this.state.pendingDiceControl.purpose === 'trophyDrop';
            const dice = !pendingLoot && this.state.diceRoll && this.state.diceRoll.purpose !== 'trophyDrop' ? this.state.diceRoll : null;
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

        // Use the same full-width combat sheet as other player decisions.
        _renderDiceControl() {
            const zone = document.getElementById('reveal-cards')?.closest('.reveal-zone');
            let panel = document.getElementById('dice-control-dialog');
            const pending = this.state && this.state.pendingDiceControl;
            const isLoot = pending && pending.purpose === 'trophyDrop';
            if (!pending || (!zone && !isLoot)) {
                if (panel) panel.remove();
                this._trophyControlEvent = null;
                return;
            }
            const mode = pending.mode || 'remote';
            const key = pending.presentedThrough + ':' + pending.diceIndex + ':' + mode + ':' + pending.value;
            if (panel && panel.dataset.key === key && !!panel.closest('.trophy-settle-sheet') === !!isLoot) return;
            if (panel) panel.remove();
            panel = document.createElement('div');
            panel.id = 'dice-control-dialog';
            if (isLoot) {
                // The saved presentation restores monster rules and roll progress
                // even after the pending event has already been acknowledged.
                const evt = Object.assign({}, this._trophyControlEvent || {}, pending.presentation || {}, {
                    purpose: 'trophyDrop', value: pending.value, roll: pending.value, awaitControl: true
                });
                const overlay = this._showTrophySettlement(evt, true);
                panel.className = 'trophy-dice-control';
                overlay.querySelector('.trophy-settle-sheet').appendChild(panel);
            } else {
                panel.className = 'dialog-overlay dialog-sheet-overlay';
                document.body.appendChild(panel);
            }
            panel.dataset.key = key;
            const boxClass = isLoot ? 'dice-choice-box trophy-dice-choice' : 'dialog-box dialog-bottom-sheet dice-choice-box';
            const faceRoot = isLoot ? panel.closest('.trophy-settle-sheet').querySelector('.trophy-settle-die') : zone;
            const currentFace = Math.max(1, Math.min(12, Number(pending.value) || 1));
            let submitting = false;

            if (mode === 'magician') {
                const playerHp = this.state && this.state.player ? Number(this.state.player.hp) : 0;
                const canPayHp = playerHp > 3;
                const canMinus = currentFace > 1 && canPayHp;
                const canPlus = currentFace < 12 && canPayHp;
                const hpNote = canPayHp ? '每次 ±1 消耗 3 点生命。' : '生命 ≤3，只能保留原结果。';
                panel.innerHTML = '<div class="' + boxClass + '"><h3>魔术师</h3>' +
                    '<p>当前骰面：' + currentFace + '。可将结果 ±1（' + hpNote + '）</p>' +
                    '<div class="dice-magician-actions" aria-label="魔术师调整">' +
                    '<button type="button" class="choice-row" data-adjust="-1"' + (canMinus ? '' : ' disabled aria-disabled="true"') +
                    '>' + (canMinus ? '−1 → ' + (currentFace - 1) + '（−3❤️）' : (canPayHp ? '−1（已到下限）' : '−1（生命不足）')) + '</button>' +
                    '<button type="button" class="choice-row" data-adjust="1"' + (canPlus ? '' : ' disabled aria-disabled="true"') +
                    '>' + (canPlus ? '+1 → ' + (currentFace + 1) + '（−3❤️）' : (canPayHp ? '+1（已到上限）' : '+1（生命不足）')) + '</button>' +
                    '</div><button type="button" class="choice-row choice-secondary" data-keep>保留 ' + currentFace + '</button></div>';
                const submitAdjust = async (adjust) => {
                    if (submitting || this._isHandlingAction || this._isConsumingEvents) return;
                    if (adjust !== 0) {
                        const next = currentFace + adjust;
                        if (next < 1 || next > 12) return;
                    }
                    submitting = true;
                    if (adjust !== 0 && !isLoot) {
                        const face = faceRoot.querySelector('.d12-result strong, .d12-die-face');
                        if (face) face.textContent = String(currentFace + adjust);
                    }
                    panel.querySelectorAll('button').forEach(button => button.disabled = true);
                    try {
                        await this._apiAction('chooseDiceControl', { adjust });
                    } finally {
                        submitting = false;
                        if (panel.isConnected) panel.querySelectorAll('button').forEach(button => {
                            button.disabled = button.getAttribute('aria-disabled') === 'true';
                        });
                    }
                };
                panel.querySelector('[data-keep]').onclick = () => submitAdjust(0);
                panel.querySelectorAll('[data-adjust]').forEach(button => {
                    button.onclick = () => submitAdjust(Number(button.dataset.adjust));
                });
                return;
            }

            panel.innerHTML = '<div class="' + boxClass + '"><h3>遥控骰子</h3>' +
                '<p>当前骰面：' + currentFace + '。选择新骰面会消耗 1 个遥控骰子。</p>' +
                '<div class="dice-face-grid" aria-label="选择骰面">' +
                Array.from({length:12},(_,i)=>{
                    const face = i + 1;
                    const same = face === currentFace;
                    return '<button type="button" data-face="'+face+'"'+(same?' disabled aria-disabled="true" class="dice-face-current"':'')+
                        ' aria-label="'+(same?'当前骰面 '+face+'（不可选）':'改为 '+face)+'">'+face+'</button>';
                }).join('') +
                '</div><button type="button" class="choice-row choice-secondary" data-keep>保留 ' + currentFace + ' · 不使用</button></div>';
            const submit = async (use,value) => {
                // Wait for event playback to release the action lock before submitting.
                if (submitting || this._isHandlingAction || this._isConsumingEvents) return;
                if (use && Number(value) === currentFace) return;
                submitting = true;
                if (use && !isLoot) {
                    const face = faceRoot.querySelector('.d12-result strong, .d12-die-face');
                    if (face) face.textContent = String(value);
                }
                panel.querySelectorAll('button').forEach(button => button.disabled = true);
                try {
                    await this._apiAction('chooseDiceControl',{use,value});
                } finally {
                    submitting = false;
                    if (panel.isConnected) {
                        panel.querySelectorAll('button').forEach(button => {
                            const face = Number(button.dataset.face);
                            button.disabled = Number.isFinite(face) && face === currentFace;
                        });
                    }
                }
            };
            panel.querySelector('[data-keep]').onclick = () => submit(false);
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

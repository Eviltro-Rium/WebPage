/* Adventure in-combat item bar: consumable slots, accessory stacks and item
 * use flows that need extra choice dialogs. */
(function (global) {
    const GameUI = global.GameUI;
    if (!GameUI) {
        console.error('[UI adventure bar] GameUI must be loaded first');
        return;
    }
    const schedule = (fn, ms, owner = null, channel = 'ui-adventure-bar') => {
        const runtime = global.FurryGame && global.FurryGame.CombatRuntime;
        return runtime ? runtime.schedule(owner, fn, ms, channel) : setTimeout(fn, ms);
    };
    Object.assign(GameUI.prototype, {
        _canUseAdventureCombatItem(s, def) {
            if (!s || !s.isAdventure || !def) return false;
            if (s.busy) return false;
            if (s.needColorChoice) return false;
            if (s.player && (s.player.blind || 0) > 0 && def.kind === 'consumable') return false;
            if (def.combatUse === 'attackMod') return false;
            const scene = def.useScene || 'combat';
            if (scene !== 'combat' && scene !== 'both') return false;
            if (def.combatUse === 'dodge' || def.defendOnly) {
                return s.phase === 'PLAYER_DEFEND' && !!s.pendingAttack;
            }
            if (def.combatUse === 'bind') {
                return s.phase === 'PLAYER_PLAY' && !s.bindUsedThisTurn;
            }
            if (def.combatUse === 'chameleonPaint') {
                return s.phase === 'PLAYER_PLAY';
            }
            // 仅在可选出牌/防御牌时（含不可防御跳过窗口）；其他子阶段不可用
            return s.phase === 'PLAYER_PLAY' || s.phase === 'PLAYER_DEFEND';
        },

        _showCardMasterChoice(onChoose) {
            if (document.getElementById('card-master-choice-dialog')) return;
            const overlay = document.createElement('div');
            overlay.id = 'card-master-choice-dialog';
            overlay.className = 'dialog-overlay';
            overlay.innerHTML = '<div class="dialog-box" style="max-width:360px">' +
                '<div class="dialog-title">卡牌大师</div>' +
                '<div class="dialog-body" style="color:rgba(255,255,255,0.8);font-size:0.85rem;margin-bottom:12px">选择一项效果</div>' +
                '<div class="dialog-buttons" style="display:flex;flex-direction:column;gap:6px">' +
                '<button class="ctrl-btn btn-play" id="cm-draw2" style="width:100%">抽取两张牌</button>' +
                '<button class="ctrl-btn btn-discard" id="cm-mulligan" style="width:100%">弃掉全部手牌并重抽同等数量</button>' +
                '<button class="ctrl-btn btn-skip" id="cm-cancel" style="width:100%">取消</button>' +
                '</div></div>';
            document.body.appendChild(overlay);
            const close = () => overlay.remove();
            overlay.querySelector('#cm-draw2').addEventListener('click', () => { close(); onChoose('draw2'); });
            overlay.querySelector('#cm-mulligan').addEventListener('click', () => { close(); onChoose('mulligan'); });
            overlay.querySelector('#cm-cancel').addEventListener('click', close);
            overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
        },

        // Render crystal-ball choices with the same real card canvas and drag
        // ordering interaction used by Chan 5.
        _showCrystalBallChoice(cards, onChoose, onCancel) {
            if (document.getElementById('crystal-ball-choice-dialog')) return;
            const overlay = document.createElement('div'); overlay.id = 'crystal-ball-choice-dialog'; overlay.className = 'dialog-overlay';
            const box = document.createElement('div'); box.className = 'dialog-box'; box.style.maxWidth = '520px';
            box.innerHTML = '<div class="dialog-title">水晶球</div><div class="dialog-body" style="color:rgba(255,255,255,0.85);font-size:0.85rem;margin-bottom:12px">拖拽排序，最左侧为牌库顶</div>';
            const row = document.createElement('div'); row.className = 'chan-five-row crystal-ball-row';
            const order = cards.map((_, i) => i);
            const refresh = () => { const nodes = new Map([...row.children].map(node => [Number(node.dataset.sortIndex), node])); order.forEach(i => { if (nodes.get(i)) row.appendChild(nodes.get(i)); }); };
            cards.forEach((card, index) => {
                const node = renderCard(card, CARD_W, CARD_H, false); node.classList.add('crystal-ball-sort-card'); node.draggable = true; node.dataset.sortIndex = String(index);
                node.addEventListener('dragstart', event => { event.dataTransfer.setData('text/plain', String(index)); node.classList.add('dragging'); });
                node.addEventListener('dragend', () => node.classList.remove('dragging'));
                node.addEventListener('dragover', event => { event.preventDefault(); node.classList.add('drag-target'); });
                node.addEventListener('dragleave', () => node.classList.remove('drag-target'));
                node.addEventListener('drop', event => { event.preventDefault(); node.classList.remove('drag-target'); const from = Number(event.dataTransfer.getData('text/plain')); const fromPos = order.indexOf(from); const toPos = order.indexOf(index); if (fromPos >= 0 && toPos >= 0 && fromPos !== toPos) { order.splice(fromPos, 1); order.splice(toPos, 0, from); refresh(); } });
                row.appendChild(node);
            });
            box.appendChild(row);
            const actions = document.createElement('div'); actions.className = 'dialog-buttons';
            const reset = document.createElement('button'); reset.className = 'ctrl-btn btn-skip'; reset.textContent = '重置'; reset.onclick = () => { order.splice(0, order.length, ...cards.map((_, i) => i)); refresh(); };
            const confirm = document.createElement('button'); confirm.className = 'ctrl-btn btn-play'; confirm.textContent = '确认放回'; confirm.onclick = () => { overlay.remove(); onChoose(order.slice()); };
            const cancel = document.createElement('button'); cancel.className = 'ctrl-btn btn-skip'; cancel.textContent = '取消'; cancel.onclick = () => { overlay.remove(); if (onCancel) onCancel(); };
            actions.append(reset, confirm, cancel); box.appendChild(actions); overlay.appendChild(box); document.body.appendChild(overlay);
            overlay.addEventListener('click', event => { if (event.target === overlay) { overlay.remove(); if (onCancel) onCancel(); } });
        },

        _renderAdventureItemBar(s) {
            const bar = document.getElementById('adventure-item-bar');
            if (!bar) return;
            this._syncAdventureActionLayout(s);
            const activeBattle = window.AdventureBattleController && window.AdventureBattleController.activeEngine
                ? window.AdventureBattleController.activeEngine() : null;
            const advEngine = activeBattle && activeBattle._adventureEngine;
            if (!s.isAdventure) { bar.style.display = 'none'; return; }
            const snap = advEngine && typeof advEngine.snapshot === 'function'
                ? (advEngine.snapshot() || {})
                : {
                    consumables: s.adventureConsumables || [],
                    accessories: s.adventureAccessories || [],
                    consumableSlots: s.adventureConsumableSlots || 6
                };
            const consumables = snap.consumables || [];
            const slots = snap.consumableSlots || 6;
            bar.style.display = 'flex';
            const inAttackMod = s.phase === 'ATTACK_MOD_CHOICE';

            let html = '<div class="adv-item-bar-title">道具</div><div class="adv-combat-item-slots">';
            const prevItems = this._prevItemNames || (this._prevItemNames = []);
            const currentItemNames = [];
            for (let i = 0; i < slots; i++) {
                const item = consumables[i];
                if (!item) {
                    html += '<div class="adv-combat-item-slot empty" title="空道具槽"></div>';
                    continue;
                }
                currentItemNames.push(item.name);
                const def = window.AdventureRegistry.getItem(item.name);
                const isAttackModItem = def && def.combatUse === 'attackMod';
                const canUse = this._canUseAdventureCombatItem(s, def);
                const selectable = inAttackMod && this._isAttackModSelectableIndex(i, s);
                const selected = selectable && this._attackModSelectedItem === i;
                const itemSelected = !inAttackMod && canUse && this._selectedCombatItem === i;
                const isNew = !prevItems.includes(item.name);
                let cls = 'adv-combat-item-slot filled adv-combat-item';
                if (selectable) cls += ' attack-mod-selectable';
                if (selected) cls += ' attack-mod-selected';
                if (itemSelected) cls += ' item-selected';
                if (!canUse && !selectable) cls += ' disabled';
                if (isNew) cls += ' icon-appear';
                let modBadge = '';
                if (isAttackModItem && def.attackModUnblock) modBadge = '<span class="adv-combat-item-bonus">破防</span>';
                else if (isAttackModItem && def.attackModBonus) modBadge = '<span class="adv-combat-item-bonus">+' + def.attackModBonus + '</span>';
                html += '<button class="' + cls + '" data-item-index="' + i + '" title="' + (item.description || item.displayName) + '"' + ((!canUse && !selectable) ? ' disabled' : '') + '>' +
                    (item.icon ? '<img src="' + item.icon + '" alt="' + item.displayName + '">' : '') +
                    '<span class="adv-combat-item-name">' + item.displayName + '</span>' +
                    modBadge +
                    '</button>';
            }
            html += '</div>';

            const accessories = snap.accessories || [];
            const prevAccs = this._prevAccNames || (this._prevAccNames = []);
            const currentAccNames = accessories.map(a => a.name);
            const accGrouped = {};
            const accOrder = [];
            accessories.forEach((item) => {
                if (!item || !item.name) return;
                if (!accGrouped[item.name]) { accGrouped[item.name] = { item, count: 0 }; accOrder.push(item.name); }
                accGrouped[item.name].count++;
            });
            html += '<div class="adv-combat-acc-section"><div class="adv-item-bar-title">配饰</div><div class="adv-combat-acc-slots">';
            if (accOrder.length) {
                accOrder.forEach((name) => {
                    const g = accGrouped[name];
                    const item = g.item;
                    const tip = item.displayName + (g.count > 1 ? ' ×' + g.count : '') + ' — ' + item.description;
                    const animCls = !prevAccs.includes(item.name) ? ' icon-appear' : '';
                    const badge = g.count > 1 ? '<span class="adv-combat-acc-stack">×' + g.count + '</span>' : '';
                    html += '<div class="adv-combat-acc-slot' + animCls + '" data-acc-name="' + item.name + '" title="' + tip.replace(/"/g, '&quot;') + '">' +
                        (item.icon ? '<img src="' + item.icon + '" alt="' + item.displayName + '">' : '') +
                        badge +
                        '</div>';
                });
            } else {
                html += '<div class="adv-combat-acc-slot empty" title="暂无配饰">—</div>';
            }
            html += '</div></div>';

            const removedItems = prevItems.filter(n => !currentItemNames.includes(n));
            const removedAccs = prevAccs.filter(n => !currentAccNames.includes(n));
            this._prevItemNames = currentItemNames;
            this._prevAccNames = currentAccNames;
            const hasRemoved = removedItems.length || removedAccs.length;
            if (hasRemoved) {
                bar.querySelectorAll('.adv-combat-item-slot.filled').forEach(el => {
                    const title = el.getAttribute('title') || '';
                    if (removedItems.some(n => { const d = window.AdventureRegistry.getItem(n); return d && title === (d.description || d.displayName); }))
                        el.classList.add('icon-disappear');
                });
                bar.querySelectorAll('.adv-combat-acc-slot').forEach(el => {
                    const title = (el.getAttribute('title') || '').split(' — ')[0];
                    if (removedAccs.some(n => { const d = window.AdventureRegistry.getItem(n); return d && d.displayName === title; }))
                        el.classList.add('icon-disappear');
                });
                schedule(() => { bar.innerHTML = html; this._bindItemBarEvents(bar, consumables, s, inAttackMod); }, 160, this, 'item-render');
            } else {
                bar.innerHTML = html;
                this._bindItemBarEvents(bar, consumables, s, inAttackMod);
            }
        },

        _syncAdventureActionLayout(s) {
            const screen = this.gameScreen || document.getElementById("game-screen");
            if (!screen) return;
            const isAdventure = !!(s && s.isAdventure);
            screen.classList.toggle("adventure-combat-layout", isAdventure);
            if (!isAdventure) return;

            const hand = screen.querySelector(".player-hand-zone");
            const controls = screen.querySelector("#controls");
            const itemBar = screen.querySelector("#adventure-item-bar");
            if (!hand || !controls || !itemBar) return;

            // Keep adventure controls below the hand and inventory below controls.
            if (hand.nextElementSibling !== controls) hand.after(controls);
            if (controls.nextElementSibling !== itemBar) controls.after(itemBar);
        },

        _bindItemBarEvents(bar, consumables, s, inAttackMod) {
            bar.querySelectorAll('[data-item-index]').forEach(btn => {
                let clickTimer = null;
                const selectItem = () => {
                    const idx = parseInt(btn.getAttribute('data-item-index'), 10);
                    const item = consumables[idx];
                    const def = item && window.AdventureRegistry.getItem(item.name);
                    if (inAttackMod && def && def.combatUse === 'attackMod' && this._isAttackModSelectableIndex(idx, s)) {
                        this._attackModSelectedItem = (this._attackModSelectedItem === idx) ? null : idx;
                        this._renderAdventureItemBar(this.state);
                        const confirmBtn = document.getElementById('btn-attack-mod-confirm');
                        if (confirmBtn) confirmBtn.disabled = this._attackModSelectedItem == null;
                        return;
                    }
                    if (btn.classList.contains('disabled')) return;
                    this._selectedCombatItem = (this._selectedCombatItem === idx) ? null : idx;
                    this._renderAdventureItemBar(this.state);
                    this._updateUseItemButton();
                };
                btn.addEventListener('click', (event) => {
                    if (event.detail !== 1) return;
                    clickTimer = schedule(selectItem, 230, btn, 'item-click');
                });
                btn.addEventListener('dblclick', async (event) => {
                    event.preventDefault();
                    if (clickTimer) clearTimeout(clickTimer);
                    const idx = parseInt(btn.getAttribute('data-item-index'), 10);
                    const item = consumables[idx];
                    const def = item && window.AdventureRegistry.getItem(item.name);
                    if (btn.classList.contains('disabled') || (def && def.combatUse === 'attackMod')) return;
                    this._selectedCombatItem = idx;
                    await this._useSelectedCombatItem();
                });
            });
        },

        _updateUseItemButton() {
            const btn = document.getElementById('btn-use-item');
            if (!btn) return;
            const idx = this._selectedCombatItem;
            if (idx == null) { btn.disabled = true; btn.textContent = '使用道具'; return; }
            const advEngine = window.AdventureBattleController && window.AdventureBattleController.activeEngine && window.AdventureBattleController.activeEngine()._adventureEngine;
            const snap = advEngine && advEngine.snapshot();
            const item = snap && (snap.consumables || [])[idx];
            btn.disabled = false;
            btn.textContent = item ? '使用[' + item.displayName + ']' : '使用道具';
        },

        async _useSelectedCombatItem() {
            const idx = this._selectedCombatItem;
            if (idx == null) return;
            const s = this.state;
            const advEngine = window.AdventureBattleController && window.AdventureBattleController.activeEngine && window.AdventureBattleController.activeEngine()._adventureEngine;
            if (!advEngine || !s) return;
            const snap = advEngine.snapshot();
            const consumables = snap.consumables || [];
            const item = consumables[idx];
            const def = item && window.AdventureRegistry.getItem(item.name);
            if (!item || !def) { this._selectedCombatItem = null; return; }
            if (!this._canUseAdventureCombatItem(s, def)) return;
            const run = async (choice) => {
                if (this._isHandlingAction) return;
                this._isHandlingAction = true;
                try {
                    const payload = { itemIndex: idx };
                    if (choice != null) {
                        if (Array.isArray(choice)) payload.choices = choice;
                        else payload.choice = choice;
                    }
                    const result = await Bridge.call('useAdventureCombatItem', payload);
                    if (result && !result.error) {
                        this._prevState = this.state;
                        this.state = result;
                        if (result.events && result.events.length) {
                            await this._consumeEvents(result.events);
                        }
                        this.updateDisplay();
                    }
                } finally {
                    this._isHandlingAction = false;
                }
            };
            this._selectedCombatItem = null;
            if (def.combatUse === 'cardMaster') {
                this._showCardMasterChoice(choice => { void run(choice); });
                return;
            }
            if (def.combatUse === 'crystalBall') {
                const preview = await Bridge.call('useAdventureCombatItem', { itemIndex: idx });
                if (!preview || preview.error) return;
                this._prevState = this.state;
                this.state = preview;
                this.updateDisplay();
                if (Array.isArray(preview.crystalBallCards) && preview.crystalBallCards.length) {
                    this._showCrystalBallChoice(preview.crystalBallCards, order => { void run({ order }); }, async () => {
                        const cleared = await Bridge.call('useAdventureCombatItem', { itemIndex: idx, choice: { cancel: true } });
                        if (cleared && !cleared.error) { this.state = cleared; this.updateDisplay(); }
                    });
                }
                return;
            }
            if (def.combatUse === 'purify') {
                const player = s.player;
                const oppKey = s.attackTarget || (s.activeAttacker === 'ai2' ? 'ai2' : 'ai');
                const opponent = s[oppKey] && s[oppKey].alive ? s[oppKey] : (s.ai && s.ai.alive ? s.ai : null);
                const hasBuff = ch => ch && ((ch.burn || 0) > 0 || (ch.bleed || 0) > 0 ||
                    (ch.poison || 0) > 0 || (ch.blind || 0) > 0 || (ch.iceSeal || 0) > 0 || (ch.bomb || 0) > 0 || ch.frozen || (ch.guard || 0) > 0 || (ch.fly || 0) > 0 || (ch.lush || 0) > 0 || (ch.parasite || 0) > 0 || (ch.crit || 0) > 0);
                if (!hasBuff(player) && !hasBuff(opponent)) return;
                this.dialogs.collectPurifyChoices(player, def.purifyCount || 1, choices => {
                    if (!choices.length) return;
                    void run(choices);
                }, { opponent });
                return;
            }
            if (def.combatUse === 'buffTransfer') {
                const player = s.player;
                const oppKey = s.attackTarget || (s.activeAttacker === 'ai2' ? 'ai2' : 'ai');
                const opponent = s[oppKey] && s[oppKey].alive !== false ? s[oppKey] : (s.ai || null);
                const hasTransferable = ch => ch && ((ch.burn || 0) > 0 || (ch.bleed || 0) > 0 ||
                    (ch.poison || 0) > 0 || ch.frozen || (ch.guard || 0) > 0 || (ch.fly || 0) > 0 || (ch.crit || 0) > 0);
                if (!hasTransferable(player) && !hasTransferable(opponent)) return;
                this.dialogs.showBuffTransferChoice(player, choice => { void run(choice); }, { opponent });
                return;
            }
            if (def.combatUse === 'chameleonPaint') {
                const groups = this._opponentCardGroups(s);
                if (!groups.some(group => group.cards && group.cards.length)) return;
                this.dialogs.showOpponentCardChoice(groups, choice => { void run(choice); }, '变色龙颜料 · 选择要暂借的牌');
                return;
            }
            await run(null);
        },

        _opponentCardGroups(s, onlyKey) {
            if (!s) return [];
            const keys = onlyKey ? [onlyKey] : (s.is1v2 ? ['ai', 'ai2'] : ['ai']);
            return keys.filter(key => s[key] && s[key].alive !== false).map(key => ({
                key,
                label: s[key].name ? `${s[key].name} · 手牌` : key,
                cards: Array.isArray(s[key + 'Hand']) ? s[key + 'Hand'] : (key === 'ai' && Array.isArray(s.aiHand) ? s.aiHand : [])
            }));
        },

        _updateAdventureInfo(s) {
            const bar = document.getElementById('adventure-info-bar');
            if (!bar) return;
            if (!s.isAdventure) { bar.style.display = 'none'; return; }
            bar.style.display = 'flex';
            const AC = window.AdventureCurrency;
            let html = '';
            if (AC && AC.GOLD_ICON && s.adventureGold != null) {
                html += '<span class="adv-info-currency"><img src="' + AC.GOLD_ICON + '" class="adv-info-icon" alt="金币">' + s.adventureGold + '</span>';
            }
            if (AC && AC.BEAST_ICON && s.adventureBeastTokens) {
                const tokens = s.adventureBeastTokens;
                for (const k of AC.ALL_BEAST_TYPES) {
                    if (tokens[k] > 0) {
                        html += '<span class="adv-info-currency"><img src="' + AC.BEAST_ICON[k] + '" class="adv-info-icon" alt="' + (AC.BEAST_LABEL[k] || k) + '">' + tokens[k] + '</span>';
              }
            }
            }
            bar.innerHTML = html;

            const npcDeckInfo = document.getElementById('npc-deck-info');
            const hasNpcPile = s.isAdventure && (s.aiDeckCount != null || s.aiDiscardCount != null);
            const pileText = '怪物牌库: ' + (s.aiDeckCount != null ? s.aiDeckCount : 0) +
                ' | 怪物弃牌库: ' + (s.aiDiscardCount != null ? s.aiDiscardCount : 0);
            if (npcDeckInfo) {
                npcDeckInfo.style.display = hasNpcPile ? '' : 'none';
                npcDeckInfo.textContent = pileText;
            }
        }
    });
})(window);

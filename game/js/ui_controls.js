/* Interaction and turn-control mixins for the classic UI. */
(function (global) {
    const GameUI = global.GameUI;
    if (!GameUI) {
        console.error('[UI controls] GameUI must be loaded first');
        return;
    }
    Object.assign(GameUI.prototype, {
_renderControls() {
    const s = this.state;
    const container = document.getElementById('controls');
    container.classList.remove('controls-settling');
    let html = '';
    const phase = s.phase;
    const hasCard = s.selectedCard >= 0;
    const selectedCard = hasCard && s.playerHand ? s.playerHand[s.selectedCard] : null;
    const hasNumberCard = !!(selectedCard && selectedCard.isNumberCard);
    const hasDiscardCards = (s.selectedCards || []).length > 0;
    const hasAICard = s.selectedAICard >= 0;

    if (phase === 'PLAYER_PLAY') {
        if (s.needColorChoice) {
            html += `<span class="ctrl-hint">选择颜色</span>`;
            html += `<button class="ctrl-btn color-btn" id="btn-color-RED" style="background:#ff1e28">红</button>`;
            html += `<button class="ctrl-btn color-btn" id="btn-color-YELLOW" style="background:#ffc300">黄</button>`;
            html += `<button class="ctrl-btn color-btn" id="btn-color-BLUE" style="background:#0082ff">蓝</button>`;
            html += `<button class="ctrl-btn color-btn" id="btn-color-GREEN" style="background:#00c83c">绿</button>`;

        } else {
            html += `<button class="ctrl-btn btn-play" id="btn-play" ${!hasCard ? 'disabled' : ''}>出牌</button>`;
            html += `<button class="ctrl-btn btn-use-item" id="btn-use-item" ${this._selectedCombatItem == null ? 'disabled' : ''}>使用道具</button>`;
            if (s.demonPactAvailable) html += `<button class="ctrl-btn btn-demon-pact" id="btn-demon-pact">恶魔交易</button>`;
            html += `<button class="ctrl-btn btn-discard" id="btn-discard" ${s.hasPlayedThisTurn ? 'disabled' : ''}>弃牌</button>`;
            html += `<button class="ctrl-btn btn-end" id="btn-end">结束回合</button>`;
        }
    } else if (phase === 'PLAYER_DEFEND') {
        if (s.needColorChoice) {
            html += `<span class="ctrl-hint">黑牌选色</span>`;
            html += `<button class="ctrl-btn color-btn" id="btn-color-RED" style="background:#ff1e28">红</button>`;
            html += `<button class="ctrl-btn color-btn" id="btn-color-YELLOW" style="background:#ffc300">黄</button>`;
            html += `<button class="ctrl-btn color-btn" id="btn-color-BLUE" style="background:#0082ff">蓝</button>`;
            html += `<button class="ctrl-btn color-btn" id="btn-color-GREEN" style="background:#00c83c">绿</button>`;
        } else {
            if (s.unblockDefend) {
                html += `<span class="ctrl-hint" style="color:#fca5a5">无法防御！</span>`;
                html += `<button class="ctrl-btn btn-use-item" id="btn-use-item" ${this._selectedCombatItem == null ? 'disabled' : ''}>使用道具</button>`;
                if (s.demonPactAvailable) html += `<button class="ctrl-btn btn-demon-pact" id="btn-demon-pact">恶魔交易</button>`;
                html += `<button class="ctrl-btn btn-skip" id="btn-skip">跳过</button>`;
            } else {
                if (s.hasPlayedBlackDefend) {
                    html += `<span class="ctrl-hint">搭桥完成：请选择一张数字≤3的牌触发防御技能</span>`;
                }
                html += `<button class="ctrl-btn btn-defend" id="btn-defend" ${!hasCard ? 'disabled' : ''}>防御</button>`;
                html += `<button class="ctrl-btn btn-use-item" id="btn-use-item" ${this._selectedCombatItem == null ? 'disabled' : ''}>使用道具</button>`;
                if (s.demonPactAvailable) html += `<button class="ctrl-btn btn-demon-pact" id="btn-demon-pact">恶魔交易</button>`;
                html += `<button class="ctrl-btn btn-skip" id="btn-skip">${s.hasPlayedBlackDefend ? '放弃防御' : '跳过'}</button>`;
            }
        }
    } else if (phase === 'PLAYER_DISCARD') {
        html += `<span class="ctrl-hint">${s.forcedDiscard ? `手牌超限：需弃至 ${s.handLimit || 5} 张` : s.mayDiscardAfterSkill ? 'Ryan 3牌：可选择1张牌弃掉，也可取消' : '可同时选择多张牌弃掉'}</span>`;
        html += `<button class="ctrl-btn btn-discard" id="btn-confirm-discard" ${!hasDiscardCards ? 'disabled' : ''}>确认弃牌 (${(s.selectedCards || []).length})</button>`;
        if (!s.forcedDiscard) html += `<button class="ctrl-btn btn-skip" id="btn-cancel-discard">取消</button>`;
    } else if (phase === 'ATTACK_MOD_CHOICE') {
        const dmg = s.pendingAttack && s.pendingAttack.damage != null ? s.pendingAttack.damage : 0;
        const hasSelection = this._attackModSelectedItem != null;
        html += `<span class="ctrl-hint">已确认 ${dmg} 点伤害，请点击道具栏中的攻击修正道具选择</span>`;
        html += `<button class="ctrl-btn btn-play" id="btn-attack-mod-confirm" ${!hasSelection ? 'disabled' : ''}>确认修正</button>`;
        html += `<button class="ctrl-btn btn-skip" id="btn-attack-mod-skip">不修正</button>`;
    } else if (phase === 'PLAYER_FIVE_CHOICE') {
        html += `<span class="ctrl-hint">请选择一张数字牌：恢复牌面生命，或造成1.5倍伤害</span>`;
        html += `<button class="ctrl-btn btn-play" id="btn-five-heal" ${!hasNumberCard ? 'disabled' : ''}>恢复${hasNumberCard ? ` ${selectedCard.value}` : ''}</button>`;
        html += `<button class="ctrl-btn btn-play" id="btn-five-damage" ${!hasNumberCard ? 'disabled' : ''}>进攻${hasNumberCard ? ` ${Math.ceil(selectedCard.value * 1.5)}` : ''}</button>`;
    } else if (phase === 'OPPONENT_CARD_CHOICE') {
        const skill = s.pendingOpponentSkill;
        html += `<span class="ctrl-hint">${skill ? `${skill.name} ${skill.value}牌：` : ''}点击一张对手手牌</span>`;
        html += `<button class="ctrl-btn btn-play" id="btn-opponent-confirm" ${!hasAICard ? 'disabled' : ''}>确认选择</button>`;
    } else if (phase === 'PLAYER_SEVEN_CHOICE') {
        if (s.ottoFourPhase === 'selectOwn') {
            html += `<span class="ctrl-hint">4牌: 请选择自己的一张手牌</span>`;
            html += `<button class="ctrl-btn btn-play" id="btn-otto-four-confirm" ${!hasCard ? 'disabled' : ''}>确认出牌</button>`;
        } else if (s.ottoFourOpponentCard) {
            html += `<span class="ctrl-hint">4牌: 请选择自己的一张手牌同时翻开</span>`;
            html += `<button class="ctrl-btn btn-play" id="btn-otto-four-confirm" ${!hasCard ? 'disabled' : ''}>确认翻开</button>`;
        } else if (s.chanFourSwapMode && s.chanFourSwapDrawn) {
            html += `<span class="ctrl-hint">4牌: ${cardLabel(s.chanFourSwapDrawn)}，选手牌交换或弃掉</span>`;
            html += `<button class="ctrl-btn btn-play" id="btn-four-swap" ${!hasCard ? 'disabled' : ''}>确认交换</button>`;
            html += `<button class="ctrl-btn btn-discard" id="btn-four-discard">弃掉+2伤害</button>`;
        } else if (s.chanSevenKeepMode && s.chanSevenChosenCard) {
            html += `<span class="ctrl-hint">7牌抽取: ${cardLabel(s.chanSevenChosenCard)}</span>`;
            html += `<button class="ctrl-btn btn-play" id="btn-seven-keep">加入手牌</button>`;
            html += `<button class="ctrl-btn btn-discard" id="btn-seven-discard">弃掉</button>`;
        } else {
            html += `<span class="ctrl-hint">点击AI手牌选择一张</span>`;
            html += `<button class="ctrl-btn btn-play" id="btn-seven-confirm" ${!hasAICard ? 'disabled' : ''}>确认选择</button>`;
        }
    } else if (phase === 'SAIKI_THREE_CHOICE') {
        if (s.saikiThreeDrawn) {
            html += `<span class="ctrl-hint">3牌抽取: ${cardLabel(s.saikiThreeDrawn)}</span>`;
            html += `<button class="ctrl-btn btn-play" id="btn-saiki-three-keep">加入手牌</button>`;
            html += `<button class="ctrl-btn btn-discard" id="btn-saiki-three-discard">弃掉</button>`;
        } else {
            html += `<span class="ctrl-hint">点击AI手牌选择一张</span>`;
            html += `<button class="ctrl-btn btn-play" id="btn-opponent-confirm" ${!hasAICard ? 'disabled' : ''}>确认选择</button>`;
        }
    } else if (phase === 'SAIKI_SIX_JUDGE') {
        const judgeType = s.pendingNumberJudge && s.pendingNumberJudge.type;
        html += `<span class="ctrl-hint">${judgeType === 'Moze' ? '选择一张数字牌转化为守护' : '选择一张数字牌计算伤害'}</span>`;
        html += `<button class="ctrl-btn btn-play" id="btn-saiki-six" ${!hasNumberCard ? 'disabled' : ''}>${judgeType === 'Moze' ? '确认守护判定' : '确认伤害判定'}</button>`;
    } else if (phase === 'TARGET_CHOICE') {
        html += `<span class="ctrl-hint">选择攻击目标</span>`;
        if (s.ai && s.ai.alive) html += `<button class="ctrl-btn btn-play" id="btn-target-0">${s.ai.name}</button>`;
        if (s.ai2 && s.ai2.alive) html += `<button class="ctrl-btn btn-play" id="btn-target-1">${s.ai2.name}</button>`;
    } else if (phase === 'GUARD_CHOICE') {
        html += `<span class="ctrl-hint">请选择要消耗的守护层数</span>`;
    } else if (phase === 'GAME_OVER') {
        html += `<button class="ctrl-btn btn-play" id="btn-restart">再来一局</button>`;
        html += `<button class="ctrl-btn btn-skip" id="btn-back-select">重新选择</button>`;
    } else if (phase === 'AI_TURN' || phase === 'AI_DEFEND' || phase === 'AI2_TURN') {
        html += `<span class="ctrl-hint">${phase === 'AI_DEFEND' && s.defenseSkipped ? '本技能分支未造成伤害，已跳过防御，正在结算...' : (s.isAdventure ? '对手行动中...' : 'AI思考中...')}</span>`;
    }
    container.innerHTML = html;
    this._bindControls();
    this._updateUseItemButton();
},

async _bindControls() {
    const bind = async (id, fn) => { const el = document.getElementById(id); if (el) el.addEventListener('click', fn); };
    bind('btn-play', async () => { await this._apiAction('doPlay'); });
    bind('btn-discard', async () => { await this._apiAction('doEnterDiscard'); });
    bind('btn-end', async () => { await this._apiAction('doEndTurn'); });
    bind('btn-defend', async () => { await this._apiAction('doDefend'); });
    bind('btn-skip', async () => { await this._apiAction('doSkipDefend'); });
    bind('btn-attack-mod-confirm', () => { this._confirmAttackMod(); });
    bind('btn-attack-mod-skip', () => { this._skipAttackMod(); });
    bind('btn-use-item', async () => { await this._useSelectedCombatItem(); });
    bind('btn-demon-pact', async () => { await this._apiAction('useDemonPact'); });
    bind('btn-confirm-discard', async () => { await this._apiAction('doConfirmDiscard'); });
    bind('btn-cancel-discard', async () => { await this._apiAction('doCancelDiscard'); });
    bind('btn-five-heal', async () => { await this._apiAction('doFiveHeal'); });
    bind('btn-five-damage', async () => { await this._apiAction('doFiveDamage'); });
    bind('btn-seven-confirm', async () => { await this._apiAction('doSevenConfirm'); });
    bind('btn-otto-four-confirm', async () => { await this._apiAction('doOttoFourConfirm'); });
    bind('btn-opponent-confirm', async () => { await this._apiAction('doOpponentCardConfirm'); });
    bind('btn-seven-keep', async () => { await this._apiAction('doChanSevenKeep'); });
    bind('btn-seven-discard', async () => { await this._apiAction('doChanSevenDiscard'); });
    bind('btn-saiki-three-keep', async () => { await this._apiAction('doSaikiThreeKeep'); });
    bind('btn-saiki-three-discard', async () => { await this._apiAction('doSaikiThreeDiscard'); });
    bind('btn-four-discard', async () => { await this._apiAction('doChanFourDiscard'); });
    bind('btn-four-swap', async () => { await this._apiAction('doChanFourSwap'); });
    bind('btn-saiki-six', async () => { await this._apiAction('doSaikiSixConfirm'); });
    bind('btn-target-0', async () => { await this._apiAction('chooseTarget', { target: 0 }); });
    bind('btn-target-1', async () => { await this._apiAction('chooseTarget', { target: 1 }); });
    ['RED','YELLOW','BLUE','GREEN'].forEach(c => {
        bind('btn-color-' + c, async () => { await this._apiAction('chooseColor', { color: c }); });
    });

    const restartFn = async () => {
        await Bridge.call('restart');
        this.state = null; this._prevState = null;
        if (this._pollInterval) clearInterval(this._pollInterval);
        this.gameScreen.classList.remove('active');
        this.selectScreen.classList.add('active');
        this._selectedPlayerChar = null; this._selectedAIChar = null;
        this._buildSelectScreen();
    };
    bind('btn-restart', restartFn);
    bind('btn-back-select', restartFn);

    const menuBtn = document.getElementById('menu-btn');
    if (menuBtn && !menuBtn._menuBound) { menuBtn._menuBound = true; menuBtn.addEventListener('click', () => this._showGameMenu()); }
},

_showGameMenu() {
    const existing = document.getElementById('game-menu-overlay');
    if (existing) { this._closeGameMenu(existing); return; }
    const overlay = document.createElement('div');
    overlay.id = 'game-menu-overlay';
    overlay.className = 'game-menu-overlay';
    overlay.innerHTML = `
        <div class="game-menu-box">
            <div class="game-menu-title">⛭ 菜单</div>
            <button class="game-menu-btn game-menu-skills" id="gm-skills">📖 查看技能</button>
            <button class="game-menu-btn game-menu-quit" id="gm-quit">🚪 退出对局</button>
            <button class="game-menu-btn game-menu-cancel" id="gm-cancel">✕ 继续游戏</button>
        </div>`;
    document.body.appendChild(overlay);

    const doClose = () => this._closeGameMenu(overlay);

    document.getElementById('gm-cancel').addEventListener('click', doClose);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) doClose(); });

    const escHandler = (e) => { if (e.key === 'Escape') { doClose(); document.removeEventListener('keydown', escHandler); } };
    document.addEventListener('keydown', escHandler);

    document.getElementById('gm-skills').addEventListener('click', () => {
        overlay.remove();
        this._showSkillOverlay();
    });
    document.getElementById('gm-quit').addEventListener('click', async () => {
        overlay.remove();
        await Bridge.call('restart');
        this.state = null; this._prevState = null;
        if (this._pollInterval) clearInterval(this._pollInterval);
        this.gameScreen.classList.remove('active');
        this.selectScreen.classList.add('active');
        this._selectedPlayerChar = null; this._selectedAIChar = null;
        this._buildSelectScreen();
    });
},

_closeGameMenu(overlay) {
    if (!overlay) return;
    overlay.style.opacity = '0';
    overlay.style.transition = 'opacity 0.15s ease';
    const box = overlay.querySelector('.game-menu-box');
    if (box) { box.style.transform = 'scale(0.92) translateY(8px)'; box.style.opacity = '0'; box.style.transition = 'all 0.15s ease'; }
    setTimeout(() => overlay.remove(), 150);
},

_showSkillOverlay() {
    const existing = document.getElementById('skill-overlay');
    if (existing) { existing.remove(); return; }
    const s = this.state;
    if (!s || !s.player) return;
    const chars = [];
    chars.push({ name: s.player.name.replace(/^AI\d*\s+/, ''), label: '玩家', color: '#3b82f6' });
    chars.push({
        name: s.ai.name.replace(/^AI\d*\s+/, ''),
        label: s.isAdventure ? '对手' : 'AI',
        color: '#ef4444'
    });
    if (s.ai2 && s.ai2.name) {
        chars.push({
            name: s.ai2.name.replace(/^AI\d*\s+/, ''),
            label: s.isAdventure ? '对手2' : 'AI2',
            color: '#a855f7'
        });
    }

    const overlay = document.createElement('div');
    overlay.id = 'skill-overlay';
    overlay.className = 'skill-overlay';
    let html = '<div class="skill-overlay-inner">';
    html += '<div class="skill-overlay-header"><button class="rules-back-btn" id="skill-back">&larr; 返回</button><h1 class="rules-title">角色技能</h1></div>';
    for (const ch of chars) {
        const atk = (SKILL_DATA && SKILL_DATA.attack && SKILL_DATA.attack[ch.name]) || [];
        const def = (SKILL_DATA && SKILL_DATA.defend && SKILL_DATA.defend[ch.name]) || [];
        if (!atk.length && !def.length) continue;
        html += `<div class="skill-overlay-char"><span class="skill-overlay-char-label" style="color:${ch.color}">${ch.label}：${ch.name}</span></div>`;
        html += '<div class="skill-grid">';
        const SKILL_GRID = [
            { atkKey: 0, defKey: 0, label: '1' }, { atkKey: 1, defKey: 1, label: '2' },
            { atkKey: 2, defKey: 2, label: '3' }, { atkKey: 7, defKey: 3, label: '0' },
            { atkKey: 3, defKey: -1, label: '4' }, { atkKey: 4, defKey: -1, label: '5' },
            { atkKey: 5, defKey: -1, label: '6' }, { atkKey: 6, defKey: -1, label: '7' }
        ];
        const stripPrefix = t => (t || '').replace(/^\d+\s*/, '');
        const colorize = t => {
            if (typeof parseSegments !== 'function') return t;
            const segs = parseSegments(t, '');
            return segs.map(sg => sg.color ? `<span style="color:${sg.color}">${sg.text}</span>` : sg.text).join('');
        };
        for (const row of SKILL_GRID) {
            const atkDesc = atk[row.atkKey] ? colorize(stripPrefix(atk[row.atkKey])) : '—';
            const defDesc = row.defKey >= 0 && def[row.defKey] ? colorize(stripPrefix(def[row.defKey])) : (row.defKey >= 0 ? '无防御效果' : '');
            html += `<div class="skill-row"><div class="skill-cell skill-atk">${atkDesc}</div><div class="skill-num">${row.label}</div>`;
            html += row.defKey >= 0 ? `<div class="skill-cell skill-def">${defDesc}</div>` : `<div class="skill-cell skill-def skill-no-def"></div>`;
            html += '</div>';
        }
        html += '</div>';
    }
    html += '</div>';
    overlay.innerHTML = html;
    document.body.appendChild(overlay);
    document.getElementById('skill-back').addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
},

_getAvailableAttackMods(s) {
    const state = s || this.state;
    const advEngine = window.AdventureCombatBridge && window.AdventureCombatBridge.activeEngine &&
        window.AdventureCombatBridge.activeEngine()._adventureEngine;
    if (!advEngine || !state) return [];
    const consumables = (advEngine.snapshot().consumables) || [];
    const mod = state.pendingAttackMod || {};
    const defensible = !mod.skip && !mod.unblock;
    const attackMods = [];
    consumables.forEach((item, i) => {
        const def = window.AdventureRegistry.getItem(item.name);
        if (!def || def.combatUse !== 'attackMod') return;
        if (def.attackModUnblock && !defensible) return;
        attackMods.push({ index: i, item, def });
    });
    return attackMods;
},

_isAttackModSelectableIndex(index, s) {
    return this._getAvailableAttackMods(s).some(a => a.index === index);
},

async _ensureAttackModChoicePrompt(s) {
    if (this._attackModPromptOpen) return;
    const attackMods = this._getAvailableAttackMods(s);
    if (!attackMods.length) {
        this._attackModPromptOpen = true;
        const run = async () => {
            try {
                await this._apiAction('resolveAttackModChoice', { bonus: 0 });
            } finally {
                this._attackModPromptOpen = false;
            }
        };
        if (this._isHandlingAction) Promise.resolve().then(run);
        else await run();
        return;
    }
    if (!this._attackModActive) {
        this._attackModSelectedItem = null;
        this._attackModActive = true;
    }
},

_confirmAttackMod() {
    const attackMods = this._getAvailableAttackMods();
    const idx = this._attackModSelectedItem;
    if (idx == null) return;
    const am = attackMods.find(a => a.index === idx);
    if (!am) return;
    const advEngine = window.AdventureCombatBridge && window.AdventureCombatBridge.activeEngine &&
        window.AdventureCombatBridge.activeEngine()._adventureEngine;
    this._attackModPromptOpen = true;
    (async () => {
        try {
            if (advEngine && advEngine.s && Array.isArray(advEngine.s.consumables)) {
                advEngine.s.consumables.splice(idx, 1);
            }
            this._attackModSelectedItem = null;
            await this._apiAction('resolveAttackModChoice', {
                bonus: am.def.attackModBonus || 0,
                unblock: !!am.def.attackModUnblock
            });
        } finally {
            this._attackModPromptOpen = false;
        }
    })();
},

_skipAttackMod() {
    if (this._attackModPromptOpen) return;
    this._attackModPromptOpen = true;
    (async () => {
        try {
            this._attackModSelectedItem = null;
            await this._apiAction('resolveAttackModChoice', { bonus: 0 });
        } finally {
            this._attackModPromptOpen = false;
        }
    })();
},

async _apiAction(method, params) {
    if (this._isHandlingAction) return;
    this._isHandlingAction = true;
    let shouldPollAI = false;
    const quickDecision = this._isDecisionAction(method);
    this._showActionPending(method);
    try {
        this._prevState = this.state;
        const result = await Bridge.call(method, params);
        if (result && !result.error) {
            this.state = result;
            const hasEvents = result.events && result.events.length > 0;
            const entersDecision = this._isInteractiveDecisionPhase(result.phase);
            this._showAcceptedControls(hasEvents);
            if (hasEvents) {
                await this._consumeEvents(result.events, { fastFirstBatch: quickDecision || entersDecision });
            }
            this.updateDisplay();
            shouldPollAI = this.state.phase === 'AI_TURN' || this.state.phase === 'AI_DEFEND' || this.state.phase === 'AI2_TURN' || !!(this.state.events && this.state.events.length);
        } else if (result && result.error) {
            this.showError(result.error);
            this.updateDisplay();
        }
    } catch (error) {
        console.error('[Action] request failed', method, error);
        this.showError(error && error.message ? error.message : '操作失败，请重试');
        this.updateDisplay();
    } finally {
        this._isHandlingAction = false;
    }
    if (shouldPollAI) this._pollAI();
},

_isDecisionAction(method) {
    return new Set([
        'doDefend', 'doSkipDefend', 'doConfirmDiscard', 'doCancelDiscard',
        'doFiveHeal', 'doFiveDamage', 'doSevenConfirm', 'doOpponentCardConfirm',
        'doChanSevenKeep', 'doChanSevenDiscard', 'doSaikiThreeKeep',
        'doSaikiThreeDiscard', 'doChanFourDiscard', 'doChanFourSwap',
        'doSaikiSixConfirm', 'resolveAttackModChoice', 'chooseTarget', 'chooseColor', 'choosePurify',
        'chooseSuperPurifyTarget', 'chooseGuard', 'chanFiveReorder', 'choosePurifyCrystal', 'chooseMozeSeven'
    ]).has(method);
},

_isInteractiveDecisionPhase(phase) {
    return new Set([
        'PLAYER_FIVE_CHOICE', 'OPPONENT_CARD_CHOICE', 'PLAYER_SEVEN_CHOICE',
        'SAIKI_THREE_CHOICE', 'SAIKI_SIX_JUDGE', 'ATTACK_MOD_CHOICE', 'PLAYER_DISCARD',
        'CHAN_FIVE_REORDER', 'GUARD_CHOICE', 'TARGET_CHOICE', 'PURIFY_CRYSTAL_CHOICE'
    ]).has(phase);
},

_showAcceptedControls(settling) {
    const phaseInfo = document.getElementById('phase-info');
    if (phaseInfo && this.state) {
        phaseInfo.textContent = this.state.phase === 'AI_DEFEND' && this.state.defenseSkipped
            ? '跳过防御'
            : (PHASE_NAMES[this.state.phase] || this.state.phase);
    }
    this._renderControls();
    if (!settling) return;
    const container = document.getElementById('controls');
    if (!container) return;
    container.classList.add('controls-settling');
    container.querySelectorAll('button').forEach(button => { button.disabled = true; });

},

_showActionPending(method) {
    const container = document.getElementById('controls');
    if (!container) return;
    const labels = {
        doPlay: '正在出牌', doDefend: '正在结算防御', doSkipDefend: '正在跳过防御',
        doConfirmDiscard: '正在确认弃牌', doCancelDiscard: '正在返回出牌阶段',
        doFiveHeal: '正在确认恢复', doFiveDamage: '正在确认进攻',
        doOpponentCardConfirm: '正在展示所选卡牌', doSevenConfirm: '正在展示所选卡牌',
        doChanSevenKeep: '正在加入手牌', doChanSevenDiscard: '正在弃掉卡牌',
        doSaikiThreeKeep: '正在加入手牌', doSaikiThreeDiscard: '正在弃掉卡牌',
        doChanFourSwap: '正在交换卡牌', doChanFourDiscard: '正在弃牌并结算伤害',
        doSaikiSixConfirm: '正在结算数字判定', resolveAttackModChoice: '正在应用攻击修正', chooseTarget: '正在确认目标',
        chooseColor: '正在指定颜色', choosePurify: '正在执行净化', chooseSuperPurifyTarget: '正在执行超级净化', chooseMozeSeven: '正在结算 Moze 7牌',
        chooseGuard: '正在结算守护', chanFiveReorder: '正在确认牌库顺序',
        doEndTurn: '正在结束回合', doEnterDiscard: '正在进入弃牌阶段'
    };
    const label = labels[method] || '正在处理';
    container.innerHTML = `<span class="ctrl-pending"><span class="ctrl-spinner"></span>${label}...</span>`;
    const phaseInfo = document.getElementById('phase-info');
    if (phaseInfo) phaseInfo.textContent = label;
},

async _pollAI() {
    if (this._isPollingAI) return;
    this._isPollingAI = true;
    try {
      for (let i = 0; i < 80; i++) {
        await new Promise(r => setTimeout(r, 350));
        const newState = await Bridge.getState();
        if (!newState || newState.error) continue;

        if (newState.events && newState.events.length > 0) {
            this._prevState = this.state;
            this.state = newState;
            await this._consumeEvents(newState.events);
            this.updateDisplay();
            if (this.state.phase !== 'AI_TURN' && this.state.phase !== 'AI_DEFEND' && this.state.phase !== 'AI2_TURN') break;
            continue;
        }

        this._prevState = this.state;
        this.state = newState;
        const missingAIPlay = this._missingAIPlay(this._prevState, newState);
        if (missingAIPlay) {
            // Recover visually when a bridge poll returns the post-play state
            // after the aiPlay event was already acknowledged by another poll.
            await this._playAICardAnimation(newState.atkCard || null, missingAIPlay);
            this._renderDiscardTop();
        }
        this.updateDisplay();
        if (this.state.phase !== 'AI_TURN' && this.state.phase !== 'AI_DEFEND' && this.state.phase !== 'AI2_TURN') break;
      }
    } finally {
        this._isPollingAI = false;
    }
}
    });
})(window);


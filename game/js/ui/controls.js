/* Interaction and turn-control mixins for the classic UI. */
(function (global) {
    const GameUI = global.GameUI;
    if (!GameUI) {
        console.error('[UI controls] GameUI must be loaded first');
        return;
    }
    const schedule = (fn, ms, owner = null, channel = 'ui-controls') => {
        const runtime = global.FurryGame && global.FurryGame.CombatRuntime;
        return runtime ? runtime.schedule(owner, fn, ms, channel) : setTimeout(fn, ms);
    };
    Object.assign(GameUI.prototype, {
_renderControls() {
    const s = this.state;
    const container = document.getElementById('controls');
    container.classList.remove('controls-settling');
    let html = '';
    const phase = s.phase;
    const canAct = s.onlineCanAct !== false;
    const hasCard = s.selectedCard >= 0;
    const selectedCard = hasCard && s.playerHand ? s.playerHand[s.selectedCard] : null;
    const hasNumberCard = !!(selectedCard && selectedCard.isNumberCard);
    const hasDiscardCards = (s.selectedCards || []).length > 0;

    if (phase === 'PLAYER_PLAY' && canAct) {
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
    } else if (phase === 'PLAYER_DEFEND' && canAct) {
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
    } else if (phase === 'PLAYER_DISCARD' && canAct) {
        const discardHint = s.pendingVixrapsPassive
            ? 'Vixraps被动：必须弃掉1张牌，然后恢复2点生命并施加1层灼伤'
            : s.forcedDiscard
                ? `手牌超限：需弃至 ${s.handLimit || 5} 张`
                : s.mayDiscardAfterSkill
                    ? 'Ryan 3牌：可选择1张牌弃掉，也可取消'
                    : '可同时选择多张牌弃掉';
        html += `<span class="ctrl-hint">${discardHint}</span>`;
        html += `<button class="ctrl-btn btn-discard" id="btn-confirm-discard" ${!hasDiscardCards ? 'disabled' : ''}>确认弃牌 (${(s.selectedCards || []).length})</button>`;
        if (!s.forcedDiscard && !s.pendingVixrapsPassive) html += `<button class="ctrl-btn btn-skip" id="btn-cancel-discard">取消</button>`;
    } else if (phase === 'OPPONENT_CARD_CHOICE' && canAct && s.isAdventure) {
        const targetKey = s.opponentHandTarget || (s.is1v2 ? (s.attackTarget || 'ai') : 'ai');
        const target = s[targetKey];
        const chosen = Number.isInteger(Number(s.selectedAICard)) && Number(s.selectedAICard) >= 0;
        html += `<span class="ctrl-hint">${s.pendingOpponentSkill ? `${s.pendingOpponentSkill.name} ${s.pendingOpponentSkill.value}牌：` : ''}请选择${target && target.name || '对手'}的一张手牌</span>`;
        html += `<button class="ctrl-btn btn-play" id="btn-opponent-confirm" ${chosen ? '' : 'disabled'}>确认选择</button>`;
    } else if (phase === 'ATTACK_MOD_CHOICE' && canAct) {
        const dmg = s.pendingAttack && s.pendingAttack.damage != null ? s.pendingAttack.damage : 0;
        const hasSelection = this._attackModSelectedItem != null;
        html += `<span class="ctrl-hint">已确认 ${dmg} 点伤害，请点击道具栏中的攻击修正道具选择</span>`;
        html += `<button class="ctrl-btn btn-play" id="btn-attack-mod-confirm" ${!hasSelection ? 'disabled' : ''}>确认修正</button>`;
        html += `<button class="ctrl-btn btn-skip" id="btn-attack-mod-skip">不修正</button>`;
    } else if (phase === 'CRIT_CHOICE' && canAct) {
        const dmg = s.pendingCritChoice && s.pendingCritChoice.damage != null
            ? s.pendingCritChoice.damage
            : (s.pendingAttack && s.pendingAttack.damage) || 0;
        const stacks = (s.player && s.player.crit) || 0;
        html += `<span class="ctrl-hint">伤害 ${dmg} 点（>4），可消耗1层暴击变为不可防御（剩余 ${stacks}）</span>`;
        html += `<button class="ctrl-btn btn-play" id="btn-crit-use">使用暴击</button>`;
        html += `<button class="ctrl-btn btn-skip" id="btn-crit-skip">不使用</button>`;
    } else if (phase === 'PLAYER_FIVE_CHOICE' && canAct) {
        html += `<span class="ctrl-hint">请选择一张数字牌：恢复牌面生命，或造成1.5倍伤害</span>`;
        html += `<button class="ctrl-btn btn-play" id="btn-five-heal" ${!hasNumberCard ? 'disabled' : ''}>恢复${hasNumberCard ? ` ${selectedCard.value}` : ''}</button>`;
        html += `<button class="ctrl-btn btn-play" id="btn-five-damage" ${!hasNumberCard ? 'disabled' : ''}>进攻${hasNumberCard ? ` ${Math.ceil(selectedCard.value * 1.5)}` : ''}</button>`;
    } else if (phase === 'PLAYER_SEVEN_CHOICE' && canAct) {
        if (s.chanFourSwapMode && s.chanFourSwapDrawn) {
            html += `<span class="ctrl-hint">4牌: ${cardLabel(s.chanFourSwapDrawn)}，选手牌交换或弃掉</span>`;
            html += `<button class="ctrl-btn btn-play" id="btn-four-swap" ${!hasCard ? 'disabled' : ''}>确认交换</button>`;
            html += `<button class="ctrl-btn btn-discard" id="btn-four-discard">弃掉+2伤害</button>`;
        } else if (s.chanSevenKeepMode && s.chanSevenChosenCard) {
            html += `<span class="ctrl-hint">7牌抽取: ${cardLabel(s.chanSevenChosenCard)}</span>`;
            html += `<button class="ctrl-btn btn-play" id="btn-seven-keep">加入手牌</button>`;
            html += `<button class="ctrl-btn btn-discard" id="btn-seven-discard">弃掉</button>`;
        }
    } else if (phase === 'SAIKI_THREE_CHOICE' && canAct) {
        if (s.saikiThreeDrawn) {
            html += `<span class="ctrl-hint">3牌抽取: ${cardLabel(s.saikiThreeDrawn)}</span>`;
            html += `<button class="ctrl-btn btn-play" id="btn-saiki-three-keep">加入手牌</button>`;
            html += `<button class="ctrl-btn btn-discard" id="btn-saiki-three-discard">弃掉</button>`;
        }
    } else if (phase === 'SAIKI_SIX_JUDGE' && canAct) {
        const judgeType = s.pendingNumberJudge && s.pendingNumberJudge.type;
        html += `<span class="ctrl-hint">${judgeType === 'Moze' ? '选择一张数字牌转化为守护' : '选择一张数字牌计算伤害'}</span>`;
        html += `<button class="ctrl-btn btn-play" id="btn-saiki-six" ${!hasNumberCard ? 'disabled' : ''}>${judgeType === 'Moze' ? '确认守护判定' : '确认伤害判定'}</button>`;
    } else if (phase === 'TARGET_CHOICE' && canAct) {
        html += `<span class="ctrl-hint">选择攻击目标</span>`;
        if (s.ai && s.ai.alive) html += `<button class="ctrl-btn btn-play" id="btn-target-0">${s.ai.name}</button>`;
        if (s.ai2 && s.ai2.alive) html += `<button class="ctrl-btn btn-play" id="btn-target-1">${s.ai2.name}</button>`;
    } else if (phase === 'GUARD_CHOICE' && canAct) {
        html += `<span class="ctrl-hint">请选择要消耗的守护层数</span>`;
    } else if (phase === 'GAME_OVER') {
        if (s.isOnline) {
            html += `<button class="ctrl-btn btn-play" id="btn-online-room">返回房间</button>`;
            html += `<button class="ctrl-btn btn-skip" id="btn-online-home">返回主页</button>`;
        } else {
            html += `<button class="ctrl-btn btn-play" id="btn-restart">再来一局</button>`;
            html += `<button class="ctrl-btn btn-skip" id="btn-back-select">重新选择</button>`;
        }
    } else if (phase === 'AI_TURN' || phase === 'AI_DEFEND' || phase === 'AI2_TURN' || !canAct) {
        const waitingLabel = phase === 'AI_DEFEND' && s.defenseSkipped
            ? '本技能分支未造成伤害，已跳过防御，正在结算...'
            : (s.isAdventure || s.isOnline ? '对手思考中...' : 'AI思考中...');
        html += `<span class="ctrl-hint">${waitingLabel}</span>`;
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
    bind('btn-crit-use', async () => { await this._apiAction('resolveCritChoice', { use: true }); });
    bind('btn-crit-skip', async () => { await this._apiAction('resolveCritChoice', { use: false }); });
    bind('btn-use-item', async () => { await this._useSelectedCombatItem(); });
    bind('btn-demon-pact', async () => { await this._apiAction('useDemonPact'); });
    bind('btn-confirm-discard', async () => { await this._apiAction('doConfirmDiscard'); });
    bind('btn-cancel-discard', async () => { await this._apiAction('doCancelDiscard'); });
    bind('btn-opponent-confirm', async () => { await this._apiAction('doOpponentCardConfirm'); });
    bind('btn-five-heal', async () => { await this._apiAction('doFiveHeal'); });
    bind('btn-five-damage', async () => { await this._apiAction('doFiveDamage'); });
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
        if (typeof this.onBattleExit === 'function') {
            await this.onBattleExit();
            return;
        }
        await this._sessionDispatch('restart');
        this.state = null; this._prevState = null;
        if (this._pollInterval) clearInterval(this._pollInterval);
        this.gameScreen.classList.remove('active');
        this.selectScreen.classList.add('active');
        this._selectedPlayerChar = null; this._selectedAIChar = null;
        this._buildSelectScreen();
    };
    const onlineGameOverFn = async action => {
        if (typeof this.onGameOverClose === 'function') {
            await this.onGameOverClose(action);
            return;
        }
        await restartFn();
    };
    bind('btn-restart', restartFn);
    bind('btn-back-select', restartFn);
    bind('btn-online-room', () => onlineGameOverFn('room'));
    bind('btn-online-home', () => onlineGameOverFn('home'));

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
            <button class="game-menu-btn game-menu-skills" id="gm-skills">📖 查看角色技能</button>
            <button class="game-menu-btn game-menu-quit" id="gm-quit">🚪 退出游戏</button>
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
        if (typeof this.onBattleExit === 'function') {
            await this.onBattleExit();
            return;
        }
        await this._sessionDispatch('restart');
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
    schedule(() => overlay.remove(), 150, this, 'error-overlay');
},

_showSkillOverlay() {
    const existing = document.getElementById('skill-overlay');
    if (existing) { existing.remove(); return; }
    const s = this.state;
    if (!s || !s.player) return;
    const advEngine = window.AdventureBattleController && window.AdventureBattleController.activeEngine &&
      window.AdventureBattleController.activeEngine()._adventureEngine;
    const stage = (advEngine && advEngine.s && advEngine.s.stage) || s.stage || 1;
    const chars = [];
    chars.push({ name: s.player.name.replace(/^AI\d*\s+/, ''), label: '玩家', color: '#3b82f6', isNpc: false });
    chars.push({
        name: s.ai.name.replace(/^AI\d*\s+/, ''),
        label: s.isAdventure || s.isOnline || !s.is1v2 ? '敌人' : 'AI',
        color: '#ef4444',
        isNpc: !!s.isAdventure,
        stage
    });
    if (s.ai2 && s.ai2.name) {
        chars.push({
            name: s.ai2.name.replace(/^AI\d*\s+/, ''),
            label: s.isAdventure || s.isOnline || !s.is1v2 ? '敌人2' : 'AI2',
            color: '#a855f7',
            isNpc: !!s.isAdventure,
            stage
        });
    }

    const overlay = document.createElement('div');
    overlay.id = 'skill-overlay';
    overlay.className = 'skill-overlay';
    let html = '<div class="skill-overlay-inner">';
    html += '<div class="skill-overlay-header"><button class="rules-back-btn" id="skill-back">&larr; 返回</button><h1 class="rules-title">角色技能</h1></div>';
    const PLAYER_SKILL_GRID = [
        { atkKey: 0, defKey: 0, label: '1' }, { atkKey: 1, defKey: 1, label: '2' },
        { atkKey: 2, defKey: 2, label: '3' }, { atkKey: 7, defKey: 3, label: '0' },
        { atkKey: 3, defKey: -1, label: '4' }, { atkKey: 4, defKey: -1, label: '5' },
        { atkKey: 5, defKey: -1, label: '6' }, { atkKey: 6, defKey: -1, label: '7' }
    ];
    const NPC_SKILL_GRID = [
        { atkKey: 0, defKey: 0, label: '1' }, { atkKey: 1, defKey: 1, label: '2' },
        { atkKey: 2, defKey: 2, label: '3' }, { atkKey: 7, defKey: 3, label: '0' },
        { atkKey: 3, defKey: -1, label: '4' }, { atkKey: 4, defKey: -1, label: '5' },
        { atkKey: 5, defKey: -1, label: '6' }
    ];
    const stripPrefix = t => (t || '').replace(/^\d+\s*/, '');
    const colorize = t => {
        t = String(t || '').replace(/\[牌\]/g, '🃏');
        if (typeof parseSegments !== 'function') return t;
        const segs = parseSegments(t, '');
        return segs.map(sg => sg.color ? `<span style="color:${sg.color}">${sg.text}</span>` : sg.text).join('');
    };
    for (const ch of chars) {
        let atk = (SKILL_DATA && SKILL_DATA.attack && SKILL_DATA.attack[ch.name]) || [];
        let def = (SKILL_DATA && SKILL_DATA.defend && SKILL_DATA.defend[ch.name]) || [];
        if (ch.stage && ch.stage > 1 && SKILL_DATA) {
            const modTable = (SKILL_DATA.castleStageMods && SKILL_DATA.castleStageMods[ch.name]) ||
                (SKILL_DATA.forestStageMods && SKILL_DATA.forestStageMods[ch.name]);
            if (modTable && modTable[ch.stage]) {
                if (modTable[ch.stage].attack) atk = modTable[ch.stage].attack;
                if (modTable[ch.stage].defend) def = modTable[ch.stage].defend;
            }
        }
        let dynAtk = null, dynDef = null;
        if (!atk.length && !def.length && ch.isNpc) {
            const fn = window.AdventureMonsterBridge && window.AdventureMonsterBridge.getAdventureNpcSkillDesc;
            if (fn) {
                const mkCard = vv => ({ value: vv, isNumberCard: true, isItemCard: false, isBlack: false, isWhite: false });
                const st = ch.stage || 1;
                for (const vv of [1, 2, 3, 4, 5, 6, 0]) {
                    const aDesc = fn(ch.name, mkCard(vv), false, { stage: st });
                    const dDesc = fn(ch.name, mkCard(vv), true, { stage: st });
                    if (aDesc && aDesc !== '无进攻效果') { if (!dynAtk) dynAtk = {}; dynAtk[vv] = aDesc; }
                    if (dDesc && dDesc !== '无防御效果') { if (!dynDef) dynDef = {}; dynDef[vv] = dDesc; }
                }
            }
        }
        if (!atk.length && !def.length && !dynAtk && !dynDef) continue;
        const labelExtra = (ch.stage && ch.stage > 1) ? (' (第' + ch.stage + '层)') : '';
        html += `<div class="skill-overlay-char"><span class="skill-overlay-char-label" style="color:${ch.color}">${ch.label}：${ch.name}${labelExtra}</span></div>`;
        html += '<div class="skill-grid">';
        const npcMod = ch.isNpc && window.AdventureRegistry
            ? (window.AdventureRegistry.getMonster(ch.name) || window.AdventureRegistry.getBoss(ch.name))
            : null;
        const includeZero = !!(npcMod && npcMod.whiteZeros) || !!(dynAtk && dynAtk[0]) || !!(dynDef && dynDef[0]);
        const canDefendHigh = !!(npcMod && npcMod.canDefendHigh);
        const grid = ch.isNpc
            ? NPC_SKILL_GRID.filter(row => row.label !== '0' || includeZero)
            : PLAYER_SKILL_GRID;
        for (const row of grid) {
            const rv = parseInt(row.label, 10);
            let atkDesc, defDesc;
            const hasDefSlot = ch.isNpc
                ? (['1', '2', '3', '0'].includes(row.label) || (canDefendHigh && ['4', '5', '6'].includes(row.label)))
                : (row.defKey >= 0);
            if (dynAtk) atkDesc = dynAtk[rv] ? colorize(dynAtk[rv]) : '—';
            else atkDesc = atk[row.atkKey] ? colorize(stripPrefix(atk[row.atkKey])) : '—';
            if (dynDef) defDesc = hasDefSlot ? (dynDef[rv] ? colorize(dynDef[rv]) : '无防御效果') : '';
            else defDesc = hasDefSlot && def[row.defKey] ? colorize(stripPrefix(def[row.defKey])) : (hasDefSlot ? '无防御效果' : '');
            html += `<div class="skill-row"><div class="skill-cell skill-atk">${atkDesc}</div><div class="skill-num">${row.label}</div>`;
            html += hasDefSlot ? `<div class="skill-cell skill-def">${defDesc}</div>` : `<div class="skill-cell skill-def skill-no-def"></div>`;
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
    const advEngine = window.AdventureBattleController && window.AdventureBattleController.activeEngine &&
      window.AdventureBattleController.activeEngine()._adventureEngine;
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
    const advEngine = window.AdventureBattleController && window.AdventureBattleController.activeEngine &&
      window.AdventureBattleController.activeEngine()._adventureEngine;
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
    if (this._isHandlingAction || this._isSelectingCard || this._isConsumingEvents) return;
    this._isHandlingAction = true;
    let shouldPollAI = false;
    const quickDecision = this._isDecisionAction(method);
    this._showActionPending(method);
    try {
        // In an online match selection is local UI state.  Collapse the old
        // selectCard -> doPlay/doDefend round trip into one authoritative
        // command while retaining the legacy methods for offline modes and
        // older peers.
        let dispatchMethod = method;
        let dispatchParams = params || {};
        if (this.state && this.state.isOnline && this.state.onlineCanAct !== false
            && (method === 'doPlay' || method === 'doDefend')) {
            const index = Number(this.state.selectedCard);
            const card = Array.isArray(this.state.playerHand) && Number.isInteger(index)
                ? this.state.playerHand[index] : null;
            if (card && typeof cardId === 'function') {
                dispatchMethod = method === 'doPlay' ? 'playCard' : 'defendCard';
                dispatchParams = Object.assign({}, dispatchParams, { cardId: cardId(card), index });
            }
        }
        this._prevState = this.state;
        const result = typeof this._sessionDispatch === 'function'
            ? await this._sessionDispatch(dispatchMethod, dispatchParams)
            : await Bridge.call(dispatchMethod, dispatchParams);
        if (result && !result.error) {
            this.state = result;
            const hasEvents = result.events && result.events.length > 0;
            const entersDecision = this._isInteractiveDecisionPhase(result.phase);
            this._showAcceptedControls(hasEvents);
            if (typeof this._onlineResultSink === 'function' && this.state.isOnline) {
                // OnlineUI is the sole owner of authoritative snapshot
                // application and event playback. This prevents a local
                // action and a remote push from racing two independent
                // _consumeEvents() calls.
                const presented = await this._onlineResultSink(result, quickDecision || entersDecision);
                if (presented) this.state = presented;
            } else {
                if (hasEvents) {
                    await this._consumeEvents(result.events, { fastFirstBatch: quickDecision || entersDecision });
                }
                this.updateDisplay();
            }
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
        'doFiveHeal', 'doFiveDamage',
        'doChanSevenKeep', 'doChanSevenDiscard', 'doSaikiThreeKeep',
        'doSaikiThreeDiscard', 'doChanFourDiscard', 'doChanFourSwap',
        'doSaikiSixConfirm', 'resolveAttackModChoice', 'resolveCritChoice', 'chooseTarget', 'chooseColor', 'choosePurify',
        'chooseSuperPurifyTarget', 'chooseGuard', 'chanFiveReorder', 'choosePurifyCrystal', 'chooseMozeSeven',
        'chooseAICard', 'doOpponentCardConfirm'
    ]).has(method);
},

_isInteractiveDecisionPhase(phase) {
    return new Set([
        'PLAYER_FIVE_CHOICE', 'PLAYER_SEVEN_CHOICE',
        'SAIKI_THREE_CHOICE', 'SAIKI_SIX_JUDGE', 'ATTACK_MOD_CHOICE', 'CRIT_CHOICE', 'PLAYER_DISCARD',
        'CHAN_FIVE_REORDER', 'GUARD_CHOICE', 'TARGET_CHOICE', 'PURIFY_CRYSTAL_CHOICE', 'OPPONENT_CARD_CHOICE'
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
        doChanSevenKeep: '正在加入手牌', doChanSevenDiscard: '正在弃掉卡牌',
        doSaikiThreeKeep: '正在加入手牌', doSaikiThreeDiscard: '正在弃掉卡牌',
        doChanFourSwap: '正在交换卡牌', doChanFourDiscard: '正在弃牌并结算伤害',
        doSaikiSixConfirm: '正在结算数字判定', resolveAttackModChoice: '正在应用攻击修正', resolveCritChoice: '正在结算暴击选择', chooseTarget: '正在确认目标',
        chooseColor: '正在指定颜色', choosePurify: '正在执行净化', chooseSuperPurifyTarget: '正在执行超级净化', chooseMozeSeven: '正在结算 Moze 7牌',
        chooseGuard: '正在结算守护', chanFiveReorder: '正在确认牌库顺序',
        chooseAICard: '正在选择对手手牌', doOpponentCardConfirm: '正在处理对手手牌',
        doEndTurn: '正在结束回合', doEnterDiscard: '正在进入弃牌阶段'
    };
    const label = labels[method] || '正在处理';
    container.innerHTML = `<span class="ctrl-pending"><span class="ctrl-spinner"></span>${label}...</span>`;
    const phaseInfo = document.getElementById('phase-info');
    if (phaseInfo) phaseInfo.textContent = label;
},

async _pollAI() {
    if (this._isPollingAI || this._isConsumingEvents || this._isHandlingAction) return;
    this._isPollingAI = true;
    try {
      for (let i = 0; i < 80; i++) {
        if (this._isConsumingEvents || this._isHandlingAction) break;
        await (global.FurryGame && global.FurryGame.CombatRuntime
            ? global.FurryGame.CombatRuntime.wait(350)
            : new Promise(r => setTimeout(r, 350)));
        if (this._isConsumingEvents || this._isHandlingAction) break;
        const newState = typeof this._sessionGetState === 'function'
            ? await this._sessionGetState()
            : await Bridge.getState();
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


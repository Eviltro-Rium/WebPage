/* Battle screen scaffolding: layout build, master updateDisplay pass and
 * state-diff animations. */
(function (global) {
    const GameUI = global.GameUI;
    if (!GameUI) {
        console.error('[UI combat screen] GameUI must be loaded first');
        return;
    }
    Object.assign(GameUI.prototype, {
        _buildGameScreen() {
            const s = this.state || {};
            const sceneLabels = { castle: '城堡', desert: '沙漠', forest: '森林', ocean: '冻洋', volcano: '火山' };
            const sceneName = sceneLabels[s.adventureScene] || '';
            const stageNum = s.adventureStage || s.stage || 1;
            const titleText = s.isAdventure ? 'Furry Trial 冒险' : 'Furry Battle';
            let html = `
                <div class="game-title">${titleText}</div>
                <div class="top-bar">
                    <div class="deck-area" id="deck-area">
                        <canvas id="deck-icon" width="40" height="52"></canvas>
                        <span class="deck-info" id="deck-info">牌堆: 0</span>
                    </div>
                    <div class="npc-deck-info" id="npc-deck-info" style="display:none"></div>
                    <span class="phase-info" id="phase-info">出牌阶段</span>
                    <span class="turn-info" id="turn-info">回合 1</span>
                    <button class="menu-btn" id="menu-btn">☰</button>
                </div>
                <div class="hp-section" id="ai-hp-section">
                    <span class="attacker-indicator">进攻方</span>
                    <span class="defender-indicator">防守方</span>
                    <img class="hp-avatar" id="ai-avatar" src="" alt="">
                    <span class="hp-name" id="ai-name">AI</span>
                    <div class="hp-bar-outer"><div class="hp-bar-inner" id="ai-hp-bar" style="width:100%"></div>
                    <span class="hp-text" id="ai-hp-text">100/100</span></div>
                    <div class="buff-icons" id="ai-buffs"></div>
                </div>
                <div class="ai-area">
                    <div class="ai-hands-stack">
                        <div class="ai-hand-zone" data-owner="ai">
                            <div class="zone-title">对手I</div>
                            <div class="ai-hand-row" id="ai-hand"></div>
                        </div>
                        <div class="ai-hand-zone" data-owner="ai2" hidden>
                            <div class="zone-title">对手II</div>
                            <div class="ai-hand-row" id="ai2-hand"></div>
                        </div>
                    </div>

                    <div class="play-zone"><div class="play-zone-row">
                        <div class="attack-zone"><div class="zone-title">进攻</div>
                            <div class="zone-cards" id="atk-cards"><span style="color:rgba(255,255,255,0.5);font-size:0.7rem">等待出牌</span></div>
                            <div class="zone-desc" id="atk-desc"></div></div>
                        <div class="defend-zone"><div class="zone-title">防御</div>
                            <div class="zone-cards" id="def-cards"><span style="color:rgba(255,255,255,0.5);font-size:0.7rem">等待防御</span></div>
                            <div class="zone-desc" id="def-desc"></div></div>
                    </div></div>
                    <div class="reveal-zone"><div class="zone-title">判定</div>
                        <div class="reveal-card-area" id="reveal-cards"><span class="reveal-empty">等待判定</span></div>
                        <div class="reveal-desc" id="reveal-desc"></div></div>
                    <div class="discard-zone"><div class="zone-title">弃牌库顶</div>
                        <div class="discard-card-area" id="discard-top"></div></div>
                </div>
                <div class="hp-section" id="player-hp-section">
                    <span class="attacker-indicator">进攻方</span>
                    <span class="defender-indicator">防守方</span>
                    <img class="hp-avatar" id="player-avatar" src="" alt="">
                    <span class="hp-name" id="player-name">你</span>
                    <div class="hp-bar-outer"><div class="hp-bar-inner" id="player-hp-bar" style="width:100%"></div>
                    <span class="hp-text" id="player-hp-text">70/70</span></div>
                    <div class="buff-icons" id="player-buffs"></div>
                </div>
                <div class="error-hint" id="error-hint"></div>
                <div class="adventure-info-bar" id="adventure-info-bar" style="display:none"></div>
                <div class="player-hand-zone"><div class="zone-title">你的</div>
                    <div class="hand-row" id="player-hand"></div></div>
                <div class="adventure-item-bar" id="adventure-item-bar" style="display:none"></div>
                <div class="action-desc" id="action-desc"></div>
                <div class="controls" id="controls"></div>`;
            this.gameScreen.innerHTML = html;
        },

        updateDisplay() {
            const s = this.state;
            if (!s || !s.player) return;
            const prev = this._prevState;
            if (prev && prev.phase !== s.phase) this._selectedCombatItem = null;

            document.getElementById('deck-info').textContent = s.isAdventure
                ? `牌堆: ${s.deck} | 弃牌库: ${s.discard != null ? s.discard : 0}`
                : `牌堆: ${s.deck}`;
            this._drawDeckIcon(s.deck);
            document.getElementById('turn-info').textContent = `回合 ${s.turn}`;
            let phaseText = s.phase === 'AI_DEFEND' && s.defenseSkipped ? '跳过防御' : (PHASE_NAMES[s.phase] || s.phase);
            if (s.isAdventure) phaseText = String(phaseText).replace(/AI2/g, '对手2').replace(/AI/g, '对手');
            document.getElementById('phase-info').textContent = phaseText;

            this._updateHpBar('player', s.player);
            this._updateHpBar('ai', s.ai);
            this._updateBuffs('player', s.player);
            this._updateBuffs('ai', s.ai);
            document.getElementById('player-name').textContent = this._combatDisplayName(s.player.name);
            document.getElementById('ai-name').textContent = this._combatDisplayName(s.ai.name);
            this._updateAvatar('player', s.player.name);
            this._updateAvatar('ai', s.ai.name);
            const activeAttacker = s.activeAttacker || (['AI_TURN', 'PLAYER_DEFEND', 'GUARD_CHOICE'].includes(s.phase) ? 'ai' : 'player');
            this._updateAttackerIndicator(activeAttacker);

            const skipStateDiffAnimations = !!this._skipStateDiffAnimations;
            this._skipStateDiffAnimations = false;
            if (prev) this._detectAndPlayAnimations(prev, s, { skipEventBacked: skipStateDiffAnimations });

            this._renderPlayerHand();
            this._renderAIHand();
            this._renderDiscardTop();
            this._renderZones();
            this._renderReveal();
            this._renderControls();
            this._updateAdventureInfo(s);
            this._renderAdventureItemBar(s);
            this._updateAdventureNpcLabels(s);

            if (s.pendingDialog === 'purify') {
                this.dialogs.showPurifyChoice(s.player, picked => {
                    const kind = picked && picked.kind ? picked.kind : picked;
                    this._apiAction('choosePurify', { kind });
                });
            } else if (s.pendingDialog === 'superPurify') {
                const targets = [{ key: 'player', label: '自己', ch: s.player }];
                if (s.ai && s.ai.alive) targets.push({ key: 'ai', label: s.ai.name + ' (对手)', ch: s.ai });
                if (s.is1v2 && s.ai2 && s.ai2.alive) targets.push({ key: 'ai2', label: s.ai2.name + ' (对手)', ch: s.ai2 });
                this.dialogs.showSuperPurifyChoice(targets, target => this._apiAction('chooseSuperPurifyTarget', { target }));
            } else if (s.pendingDialog === 'guard') {
                this.dialogs.showGuardChoice(s.player, s.pendingGuardDamage, choice => {
                    if (choice && typeof choice === 'object') {
                        if (choice.action === 'fly') return this._apiAction('chooseFly');
                        if (choice.action === 'guard') return this._apiAction('chooseGuard', { stacks: choice.stacks });
                        return this._apiAction('chooseGuard', { stacks: 0 });
                    }
                    return this._apiAction('chooseGuard', { stacks: choice });
                });
            } else if (s.pendingDialog === 'flyRetry') {
                this.dialogs.showFlyRetryChoice(s.player, s.pendingGuardDamage, again => this._apiAction('chooseFlyContinue', { again }));
            } else if (s.pendingDialog === 'purifyCrystal') {
                const oppKey = s.is1v2 ? (s.attackTarget || 'ai') : 'ai';
                const opponent = s[oppKey];
                this.dialogs.showPurifyChoice(s.player, picked => {
                    this._apiAction('choosePurifyCrystal', { choice: picked });
             }, { opponent, allowOpponent: true });
            } else if (s.pendingDialog === 'mozeSeven') {
                const targets = [{ key: 'player', label: '自己（清除负面）', ch: s.player }];
                if (s.ai && s.ai.alive) targets.push({ key: 'ai', label: (s.ai.name || '对手') + '（清除正面）', ch: s.ai });
                this.dialogs.showSuperPurifyChoice(targets, target => this._apiAction('chooseMozeSeven', { choice: { target } }), 'Moze 7牌 · 选择目标');
            } else if (s.pendingDialog === 'trophyDisarm') {
                const pending = s.pendingTrophyDisarm || {};
                this.dialogs.showOpponentCardChoice(this._opponentCardGroups(s, pending.targetKey), choice => this._apiAction('chooseTrophyDisarm', choice), '缴械 · 选择要弃掉的手牌');
            }

            if (s.phase === 'ATTACK_MOD_CHOICE') this._ensureAttackModChoicePrompt(s);
            else { this._attackModPromptOpen = false; this._attackModActive = false; }

            if (s.phase === 'GAME_OVER') this._showGameOver();
            this._prevState = s;
        },

        _detectAndPlayAnimations(prev, curr, options = {}) {
            // Draw fly-ins are owned exclusively by 'draw' events. Speculative
            // detection here raced with hand re-render and caused duplicate cards.
            this._animatedPlayerDraws = 0;
            const skipEventBacked = !!options.skipEventBacked;

            if (curr.player && prev.player) {
                // Adventure also needs state-diff floats when no event batch covered the gain
                // (events still take priority via skipEventBacked).
                if (!skipEventBacked && curr.player.guard > prev.player.guard) this.playFloatingText(`+${curr.player.guard - prev.player.guard}[守护]`, '#00bcd4', 'player');
                if (!skipEventBacked && (curr.player.fly || 0) > (prev.player.fly || 0)) this.playFloatingText(`+${(curr.player.fly || 0) - (prev.player.fly || 0)}[飞翔]`, '#a5b4fc', 'player');
                if (!skipEventBacked && (curr.player.crit || 0) > (prev.player.crit || 0)) this.playFloatingText(`+${(curr.player.crit || 0) - (prev.player.crit || 0)}[暴击]`, '#fbbf24', 'player');
                if (!skipEventBacked && (curr.player.lush || 0) > (prev.player.lush || 0)) this.playFloatingText(`+${(curr.player.lush || 0) - (prev.player.lush || 0)}[茂盛]`, '#4ade80', 'player');
                if (!skipEventBacked && (curr.player.parasite || 0) > (prev.player.parasite || 0)) this.playFloatingText(`+${(curr.player.parasite || 0) - (prev.player.parasite || 0)}[寄生]`, '#86efac', 'player');
                if (curr.player.bloodthirst && !prev.player.bloodthirst) this.playFloatingText('[嗜血触发]', '#ff315f', 'player');
                if (!curr.player.bloodthirst && prev.player.bloodthirst) this.playFloatingText('[退出嗜血]', '#f5b6c5', 'player');
                if (!skipEventBacked && curr.player.chaos_red && !prev.player.chaos_red) this.playFloatingText('[混沌-红]', '#ff4444', 'player');
                if (!skipEventBacked && curr.player.chaos_yellow && !prev.player.chaos_yellow) this.playFloatingText('[混沌-黄]', '#ffcc00', 'player');
                if (!skipEventBacked && curr.player.chaos_blue && !prev.player.chaos_blue) this.playFloatingText('[混沌-蓝]', '#4488ff', 'player');
                if (!skipEventBacked && curr.player.chaos_green && !prev.player.chaos_green) this.playFloatingText('[混沌-绿]', '#44cc44', 'player');
                const playerChaosReset = (prev.player.chaos_red && !curr.player.chaos_red)
                    || (prev.player.chaos_yellow && !curr.player.chaos_yellow)
                    || (prev.player.chaos_blue && !curr.player.chaos_blue)
                    || (prev.player.chaos_green && !curr.player.chaos_green);
                if (!skipEventBacked && playerChaosReset) this.playFloatingText('[混沌重制]', '#c084fc', 'player');
            }
            if (curr.ai && prev.ai) {
                if (!skipEventBacked && curr.ai.guard > prev.ai.guard) this.playFloatingText(`+${curr.ai.guard - prev.ai.guard}[守护]`, '#00bcd4', 'ai');
                if (!skipEventBacked && (curr.ai.fly || 0) > (prev.ai.fly || 0)) this.playFloatingText(`+${(curr.ai.fly || 0) - (prev.ai.fly || 0)}[飞翔]`, '#a5b4fc', 'ai');
                if (!skipEventBacked && (curr.ai.crit || 0) > (prev.ai.crit || 0)) this.playFloatingText(`+${(curr.ai.crit || 0) - (prev.ai.crit || 0)}[暴击]`, '#fbbf24', 'ai');
                if (!skipEventBacked && (curr.ai.lush || 0) > (prev.ai.lush || 0)) this.playFloatingText(`+${(curr.ai.lush || 0) - (prev.ai.lush || 0)}[茂盛]`, '#4ade80', 'ai');
                if (!skipEventBacked && (curr.ai.parasite || 0) > (prev.ai.parasite || 0)) this.playFloatingText(`+${(curr.ai.parasite || 0) - (prev.ai.parasite || 0)}[寄生]`, '#86efac', 'ai');
                if (curr.ai.bloodthirst && !prev.ai.bloodthirst) this.playFloatingText('[嗜血触发]', '#ff315f', 'ai');
                if (!curr.ai.bloodthirst && prev.ai.bloodthirst) this.playFloatingText('[退出嗜血]', '#f5b6c5', 'ai');
                if (!skipEventBacked && curr.ai.chaos_red && !prev.ai.chaos_red) this.playFloatingText('[混沌-红]', '#ff4444', 'ai');
                if (!skipEventBacked && curr.ai.chaos_yellow && !prev.ai.chaos_yellow) this.playFloatingText('[混沌-黄]', '#ffcc00', 'ai');
                if (!skipEventBacked && curr.ai.chaos_blue && !prev.ai.chaos_blue) this.playFloatingText('[混沌-蓝]', '#4488ff', 'ai');
                if (!skipEventBacked && curr.ai.chaos_green && !prev.ai.chaos_green) this.playFloatingText('[混沌-绿]', '#44cc44', 'ai');
                const aiChaosReset = (prev.ai.chaos_red && !curr.ai.chaos_red)
                    || (prev.ai.chaos_yellow && !curr.ai.chaos_yellow)
                    || (prev.ai.chaos_blue && !curr.ai.chaos_blue)
                    || (prev.ai.chaos_green && !curr.ai.chaos_green);
                if (!skipEventBacked && aiChaosReset) this.playFloatingText('[混沌重制]', '#c084fc', 'ai');
            }
        }
    });
})(window);
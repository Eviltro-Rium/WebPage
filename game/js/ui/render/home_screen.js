/* Home / character-select screen rendering. */
(function (global) {
    const GameUI = global.GameUI;
    if (!GameUI) {
        console.error('[UI home] GameUI must be loaded first');
        return;
    }
    Object.assign(GameUI.prototype, {
        _buildSelectScreen() {
            // Adventure NPCs are registered in CharacterRegistry so the shared
            // the battle controller can use them, but they must never be selectable as
            // player characters.  Check both the marker and the adventure
            // registries because HTTP character lists may omit custom fields.
            const chars = (this.characters || []).filter(ch => {
                if (ch && ch.adventureNpc) return false;
                const name = ch && ch.name;
                return !(window.AdventureRegistry && name &&
                    (window.AdventureRegistry.getMonster(name) || window.AdventureRegistry.getBoss(name)));
            });
            const charColors = { Ryan: '#e74c3c', Leon: '#3498db', Chan: '#2ecc71',
                Saiki: '#9b59b6', Blaze: '#e67e22', Serenity: '#1abc9c', Moze: '#7f8c8d', Knight: '#8e44ad' };
            const charAvatar = { Ryan: 'avatars/Ryan.jpg', Leon: 'avatars/Leon.png', Chan: 'avatars/Chan.png', Saiki: 'avatars/Saiki.png', Blaze: 'avatars/Blaze.png', Serenity: 'avatars/Serenity.jpg', Moze: 'avatars/Moze.jpg', Knight: 'avatars/Knight.png', Otto: 'avatars/Otto.png' };

            let html = `<div class="home-shell${this._modeChosen ? ' home-shell-select' : ''}">`;
            html += `<header class="home-hero"><div class="game-title">Furry Trial</div>`;
            html += `<p class="home-tagline">${this._modeChosen ? (this._isAdventure ? '选择你的冒险主角' : '分配角色并开始对战') : '回合制卡牌对战 · 冒险启程'}</p></header>`;

            if (!this._modeChosen) {
                html += `<div class="home-panel home-panel-menu">`;
                html += `<button class="home-cta home-cta-adventure${this._isAdventure?' active':''}" id="adventure-start-btn" type="button">`;
                html += `<span class="home-cta-glow" aria-hidden="true"></span><span class="home-cta-icon" aria-hidden="true">⚔</span>`;
                html += `<span class="home-cta-copy"><span class="home-cta-label">开始冒险</span><span class="home-cta-hint">Roguelike 地牢探索</span></span></button>`;
                html += `<button class="home-online-btn" id="online-start-btn" type="button"><span class="home-online-dot" aria-hidden="true"></span><span><strong>在线对决</strong><small>WebRTC P2P · 小规模测试</small></span><span class="home-online-arrow" aria-hidden="true">→</span></button>`;
                html += `<div class="home-section-label">单机对战模式</div>`;
                html += `<div class="mode-toggle home-mode-grid"><button class="mode-btn home-mode-btn${!this._is1v2&&!this._isLord&&!this._isAdventure?' active':''}" id="mode-1v1" type="button"><span class="home-mode-name">1v1</span><span class="home-mode-desc">单挑</span></button>`;
                html += `<button class="mode-btn home-mode-btn${this._is1v2&&!this._isLord?' active':''}" id="mode-1v2" type="button"><span class="home-mode-name">1v2</span><span class="home-mode-desc">双雄</span></button>`;
                html += `<button class="mode-btn home-mode-btn${this._isLord?' active':''}" id="mode-lord" type="button"><span class="home-mode-name">领主</span><span class="home-mode-desc">模式</span></button></div>`;
                html += `<div class="home-section-label">资料库</div>`;
                html += `<div class="home-secondary-row">`;
                html += `<button class="home-secondary-btn rules-entry-btn" id="rules-entry-btn" type="button"><span class="home-secondary-icon" aria-hidden="true">📖</span><span>规则介绍</span></button>`;
                html += `<button class="home-secondary-btn char-entry-btn" id="char-entry-btn" type="button"><span class="home-secondary-icon" aria-hidden="true">🎭</span><span>角色详情</span></button>`;
                html += `<button class="home-secondary-btn codex-entry-btn" id="codex-entry-btn" type="button"><span class="home-secondary-icon" aria-hidden="true">🗺</span><span>冒险图鉴</span></button>`;
                html += `</div></div></div>`;
                this.selectScreen.innerHTML = html;
                const m1 = document.getElementById('mode-1v1');
                const m2 = document.getElementById('mode-1v2');
                const mL = document.getElementById('mode-lord');
                if (m1) m1.addEventListener('click', () => { this._is1v2 = false; this._isLord = false; this._isAdventure = false; this._modeChosen = true; this._resetSelection(); this._buildSelectScreen(); });
                if (m2) m2.addEventListener('click', () => { this._is1v2 = true; this._isLord = false; this._isAdventure = false; this._modeChosen = true; this._resetSelection(); this._buildSelectScreen(); });
                if (mL) mL.addEventListener('click', () => { this._is1v2 = false; this._isLord = true; this._isAdventure = false; this._modeChosen = true; this._resetSelection(); this._buildSelectScreen(); });
                const advBtn = document.getElementById('adventure-start-btn');
                if (advBtn) advBtn.addEventListener('click', () => { this._is1v2 = false; this._isLord = false; this._isAdventure = true; this._modeChosen = true; this._resetSelection(); this._buildSelectScreen(); });
                const onlineBtn = document.getElementById('online-start-btn');
                if (onlineBtn) onlineBtn.addEventListener('click', () => { window.location.href = 'online_game/index.html'; });
                const rulesBtn0 = document.getElementById('rules-entry-btn');
                if (rulesBtn0) rulesBtn0.addEventListener('click', () => {
                    if (window.RulesPage) { window.RulesPage.build(); this.selectScreen.classList.remove('active'); document.getElementById('rules-screen').classList.add('active'); }
                });
                const charBtn0 = document.getElementById('char-entry-btn');
                if (charBtn0) charBtn0.addEventListener('click', () => {
                    if (window.CharDetailPage) { window.CharDetailPage.show(document.getElementById('char-detail-screen')); this.selectScreen.classList.remove('active'); }
                });
                const codexBtn0 = document.getElementById('codex-entry-btn');
                if (codexBtn0) codexBtn0.addEventListener('click', () => {
                    if (window.AdventureCodex) { window.AdventureCodex.show(document.getElementById('char-detail-screen')); this.selectScreen.classList.remove('active'); }
                });
                return;
            }

            html += `<div class="home-panel home-panel-select">`;
            html += `<button class="back-to-mode-btn" id="back-to-mode" type="button"><span aria-hidden="true">←</span> 返回模式选择</button>`;
            if (this._isAdventure) {
                html += `<div class="game-subtitle home-assign-status" id="assign-status">选择主角</div>`;
            } else {
                html += `<div class="assign-bar home-assign-bar"><button class="assign-btn active" id="assign-player" style="--ac:#3b82f6" type="button">玩家</button><button class="assign-btn" id="assign-bot1" style="--ac:#ef4444" type="button">Bot1</button>${(this._is1v2||this._isLord)?'<button class="assign-btn" id="assign-bot2" style="--ac:#a855f7" type="button">Bot2</button>':''}</div>`;
                html += `<div class="game-subtitle home-assign-status" id="assign-status">点击角色分配给 玩家</div>`;
            }
            html += `<div class="select-section"><div class="char-grid" id="char-grid">`;
            for (const ch of chars) {
                const avatar = charAvatar[ch.name];
                const iconHtml = avatar ? `<img class="char-avatar" src="${gameAssetUrl(avatar)}" alt="${ch.name}">` : `<div class="char-icon" style="background:${charColors[ch.name] || '#888'}">${ch.name[0]}</div>`;
                html += `<div class="char-card" data-name="${ch.name}">${iconHtml}<div class="char-name">${ch.name}</div><div class="char-type">${ch.type}</div><div class="char-hp">HP: ${ch.hp}</div><div class="char-passive">${ch.passive}</div><div class="char-role-label"></div></div>`;
            }
            html += `</div></div>`;
            html += `<button class="start-btn home-start-btn" id="start-btn" type="button" disabled><span class="home-start-shine" aria-hidden="true"></span>开始游戏</button>`;
            if (this._isAdventure) {
                html += `<button class="start-btn home-test-btn" id="adventure-test-btn" type="button" disabled>进入测试</button>`;
            }
            html += `</div></div>`;

            this.selectScreen.innerHTML = html;

            const updateAssignBtns = () => {
                const ap = document.getElementById('assign-player');
                if (ap) ap.classList.toggle('active', this._assignMode === 1);
                const b1 = document.getElementById('assign-bot1');
                if (b1) b1.classList.toggle('active', this._assignMode === 2);
                const b2 = document.getElementById('assign-bot2');
                if (b2) b2.classList.toggle('active', this._assignMode === 3);
                const labels = { 1: '玩家', 2: 'Bot1', 3: 'Bot2' };
                const status = document.getElementById('assign-status');
                if (status && !this._isAdventure) status.textContent = '点击角色分配给 ' + labels[this._assignMode];
            };

            const updateCardStyles = () => {
                this.selectScreen.querySelectorAll('.char-card').forEach(el => {
                    const name = el.dataset.name;
                    const isPlayer = this._selectedPlayerChar === name;
                    const isBot = this._selectedAIChar === name;
                    const isBot2 = this._selectedAI2Char === name;
                    el.classList.remove('role-player', 'role-bot', 'role-bot2');
                    if (isPlayer) el.classList.add('role-player');
                    if (isBot) el.classList.add('role-bot');
                    if (isBot2) el.classList.add('role-bot2');
                    const label = el.querySelector('.char-role-label');
                    const parts = [];
                    if (isPlayer) parts.push('玩家');
                    if (isBot) parts.push('Bot1');
                    if (isBot2) parts.push('Bot2');
                    label.textContent = parts.join(' & ');
                });
            };

            const checkReady = () => {
                const ready = this._isAdventure ? !!this._selectedPlayerChar : (this._selectedPlayerChar && this._selectedAIChar && (!(this._is1v2||this._isLord) || this._selectedAI2Char));
                document.getElementById('start-btn').disabled = !ready;
                const testBtn = document.getElementById('adventure-test-btn');
                if (testBtn) testBtn.disabled = !ready;
                if (ready && !this._isAdventure) {
                    const s = this._selectedPlayerChar + ' (玩家)  vs  ' + this._selectedAIChar + ' (Bot1)';
                    document.getElementById('assign-status').textContent = (this._is1v2||this._isLord) ? s + ' & ' + this._selectedAI2Char + ' (Bot2)' : s;
                }
            };

            const apBtn = document.getElementById('assign-player');
            if (apBtn) apBtn.addEventListener('click', () => { this._assignMode = 1; updateAssignBtns(); });
            const b1Btn = document.getElementById('assign-bot1');
            if (b1Btn) b1Btn.addEventListener('click', () => { this._assignMode = 2; updateAssignBtns(); });
            const b2Btn = document.getElementById('assign-bot2');
            if (b2Btn) b2Btn.addEventListener('click', () => { this._assignMode = 3; updateAssignBtns(); });

            this.selectScreen.querySelectorAll('.char-card').forEach(el => {
                el.addEventListener('click', () => {
                    const name = el.dataset.name;
                    if (this._isAdventure) {
                        this._selectedPlayerChar = name;
                    } else if (this._assignMode === 1) this._selectedPlayerChar = name;
                    else if (this._assignMode === 2) this._selectedAIChar = name;
                    else if (this._assignMode === 3) this._selectedAI2Char = name;
                    updateCardStyles();
                    checkReady();
                });
            });

            document.getElementById('start-btn').addEventListener('click', () => {
                if (this._isAdventure) {
                    if (this._selectedPlayerChar) window.location.href = 'adventure/adventure.html?char=' + encodeURIComponent(this._selectedPlayerChar);
                    return;
                }
                console.log('[Start] isLord:', this._isLord, 'is1v2:', this._is1v2, 'player:', this._selectedPlayerChar, 'ai:', this._selectedAIChar, 'ai2:', this._selectedAI2Char);
                if (this._isLord) {
                    if (this._selectedPlayerChar && this._selectedAIChar && this._selectedAI2Char) { console.log('[Start] calling _startGameLord, exists:', !!this._startGameLord); this._startGameLord ? this._startGameLord() : this._startGame1v2(); }
                } else if (this._is1v2) {
                    if (this._selectedPlayerChar && this._selectedAIChar && this._selectedAI2Char) this._startGame1v2 ? this._startGame1v2() : this._startGame();
                } else {
                    if (this._selectedPlayerChar && this._selectedAIChar) this._startGame();
                }
            });
            const testBtn = document.getElementById('adventure-test-btn');
            if (testBtn) testBtn.addEventListener('click', () => {
                if (this._isAdventure && this._selectedPlayerChar) {
                    window.location.href = 'adventure/adventure.html?char=' + encodeURIComponent(this._selectedPlayerChar) + '&test=1';
                }
            });
            const mode1v1Btn = document.getElementById('mode-1v1');
            const mode1v2Btn = document.getElementById('mode-1v2');
            if (mode1v1Btn) mode1v1Btn.addEventListener('click', () => { this._is1v2 = false; this._isLord = false; this._isAdventure = false; this._resetSelection(); this._buildSelectScreen(); });
            if (mode1v2Btn) mode1v2Btn.addEventListener('click', () => { this._is1v2 = true; this._isLord = false; this._isAdventure = false; this._resetSelection(); this._buildSelectScreen(); });
            const modeLordBtn = document.getElementById('mode-lord');
            if (modeLordBtn) modeLordBtn.addEventListener('click', () => { this._is1v2 = false; this._isLord = true; this._isAdventure = false; this._resetSelection(); this._buildSelectScreen(); });
            const backBtn = document.getElementById('back-to-mode');
            if (backBtn) backBtn.addEventListener('click', () => { this._modeChosen = false; this._isAdventure = false; this._buildSelectScreen(); });

            const adventureBtn = document.getElementById('adventure-start-btn');
            if (adventureBtn) adventureBtn.addEventListener('click', () => {
                this._is1v2 = false; this._isLord = false; this._isAdventure = true; this._resetSelection(); this._buildSelectScreen();
            });

            // 屏幕断点变化（移动/桌面切换、设备旋转）时重绘，避免卡牌尺寸与CSS不一致
            if (typeof window !== 'undefined' && window.matchMedia) {
                const mq = window.matchMedia('(max-width: 768px)');
                const onChange = () => {
                    // 清掉 handRenderKey / zone cardKey 让下次 updateDisplay 强制重渲染
                    const ph = document.getElementById('player-hand');
                    if (ph) delete ph.dataset.handRenderKey;
                    const atk = document.getElementById('atk-cards');
                    if (atk) delete atk.dataset.cardKey;
                    const def = document.getElementById('def-cards');
                    if (def) delete def.dataset.cardKey;
                    if (this.state) this.updateDisplay();
                };
                if (mq.addEventListener) mq.addEventListener('change', onChange);
                else if (mq.addListener) mq.addListener(onChange);
                window.addEventListener('resize', onChange);
            }
        },

        _resetSelection() {
            this._assignMode = 1;
            this._selectedPlayerChar = null;
            this._selectedAIChar = null;
            this._selectedAI2Char = null;
        }
    });
})(window);

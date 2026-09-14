/* Status rendering: HP bars, avatars, buff icon rows and attacker/defender
 * indicators. */
(function (global) {
    const GameUI = global.GameUI;
    if (!GameUI) {
        console.error('[UI status] GameUI must be loaded first');
        return;
    }
    Object.assign(GameUI.prototype, {
        _updateAttackerIndicator(who) {
            const s = this.state || {};
            const is1v2 = !!s.is1v2;
            const fallback = s.activeAttacker || (['AI_TURN', 'PLAYER_DEFEND', 'GUARD_CHOICE'].includes(s.phase) ? 'ai' : 'player');
            const attacker = ['player', 'ai', 'ai2'].includes(who) ? who : fallback;
            const defender = attacker === 'player'
                ? (is1v2 ? (s.attackTarget || (s.ai && s.ai.alive ? 'ai' : 'ai2')) : 'ai')
                : 'player';
            const sections = {
                player: document.getElementById('player-hp-section'),
                ai: document.getElementById('ai-hp-section'),
                ai2: document.getElementById('ai2-hp-section')
            };
            Object.keys(sections).forEach(key => {
                const section = sections[key];
                if (!section) return;
                section.classList.toggle('active-attacker', key === attacker);
                section.classList.toggle('active-defender', key === defender);
                section.classList.toggle('selected-target', is1v2 && attacker === 'player' && key === defender);
            });
        },

        _updateAvatar(prefix, name) {
            const el = document.getElementById(`${prefix}-avatar`);
            if (!el) return;
            const charName = (name || '').replace(/^AI\d*\s+/, '');
            if (charName && charName !== el.dataset.char) {
                el.dataset.char = charName;
                const monsterDef = window.AdventureRegistry && window.AdventureRegistry.getMonster(charName);
                const bossDef = window.AdventureRegistry && window.AdventureRegistry.getBoss(charName);
                const advDef = monsterDef || bossDef;
                if (advDef && advDef.icon) {
                    el.src = gameAssetUrl(advDef.icon.replace(/^\.\.\//, ''));
                    el.onerror = () => { el.src = gameAssetUrl(`avatars/${charName}.png`); el.onerror = () => { el.src = gameAssetUrl(`avatars/${charName}.jpg`); el.onerror = null; }; };
                } else {
                    el.src = gameAssetUrl(`avatars/${charName}.png`);
                    el.onerror = () => { el.src = gameAssetUrl(`avatars/${charName}.jpg`); el.onerror = null; };
                }
            }
        },

        _updateHpBar(prefix, ch) {
            if (!ch) return;
            const key = `${ch.hp}/${ch.maxHp}`;
            const bar = document.getElementById(`${prefix}-hp-bar`);
            const text = document.getElementById(`${prefix}-hp-text`);
            if (!bar || !text || bar.dataset.hpKey === key) return;
            bar.dataset.hpKey = key;
            const pct = Math.max(0, (ch.hp / ch.maxHp) * 100);
            bar.style.width = pct + '%';
            bar.className = 'hp-bar-inner' + (pct <= 25 ? ' critical' : pct <= 50 ? ' low' : '');
            text.textContent = key;
        },

        _updateBuffs(prefix, ch) {
            const container = document.getElementById(`${prefix}-buffs`);
            if (!container) return;
            const renderTimers = this._buffRenderTimers || (this._buffRenderTimers = {});
            // Cancelling a pending disappear flush without rewriting the DOM leaves
            // stale icons (e.g. lush) on screen when the next pass early-returns.
            let cancelledPending = false;
            if (renderTimers[prefix]) {
                clearTimeout(renderTimers[prefix]);
                renderTimers[prefix] = null;
                cancelledPending = true;
            }
            const prevKeys = this._prevBuffKeys || (this._prevBuffKeys = {});
            const prevSet = new Set(prevKeys[prefix] || []);
            const currentKeys = [];
            const currentStacks = {};
            let html = '';
            const buffs = [
                { key: 'burn', stacks: ch.burn, icon: 'burn', colorClass: 'burn-buff' },
                { key: 'freeze', stacks: ch.frozen ? 1 : 0, icon: 'freeze', colorClass: 'freeze-buff' },
                { key: 'bleed', stacks: ch.bleed, icon: 'bleed', colorClass: 'bleed-buff' },
                { key: 'poison', stacks: ch.poison || 0, icon: 'poison', colorClass: 'poison-buff' },
                { key: 'blind', stacks: ch.blind || 0, icon: 'blind', colorClass: 'blind-buff', hideCount: true },
                { key: 'iceSeal', stacks: ch.iceSeal || 0, icon: 'ice_seal', colorClass: 'ice-seal-buff', hideCount: true },
                { key: 'bomb', stacks: ch.bomb || 0, icon: 'time_bomb', colorClass: 'bomb-mark', hideCount: false },
                { key: 'hypothermia', stacks: ch.hypothermia || 0, icon: 'hypothermia', colorClass: 'hypothermia-buff', hideCount: false },
                { key: 'guard', stacks: ch.guard, icon: 'guard', colorClass: 'guard-buff' },
                { key: 'fly', stacks: ch.fly || 0, icon: 'fly', colorClass: 'fly-buff' },
                { key: 'lush', stacks: ch.lush || 0, icon: 'lush', colorClass: 'lush-buff' },
                { key: 'parasite', stacks: ch.parasite || 0, icon: 'parasite', colorClass: 'parasite-buff' },
                { key: 'crit', stacks: ch.crit || 0, icon: 'crit' },
                { key: 'diving', stacks: ch.diving ? 1 : 0, icon: 'diving', colorClass: 'diving-buff', hideCount: true },
                { key: 'chaos_red', stacks: ch.chaos_red ? 1 : 0, icon: 'chaos_red', hideCount: true, colorClass: 'chaos-red-buff' },
                { key: 'chaos_yellow', stacks: ch.chaos_yellow ? 1 : 0, icon: 'chaos_yellow', hideCount: true, colorClass: 'chaos-yellow-buff' },
                { key: 'chaos_blue', stacks: ch.chaos_blue ? 1 : 0, icon: 'chaos_blue', hideCount: true, colorClass: 'chaos-blue-buff' },
                { key: 'chaos_green', stacks: ch.chaos_green ? 1 : 0, icon: 'chaos_green', hideCount: true, colorClass: 'chaos-green-buff' }
            ];
            if (ch.bloodthirst) buffs.push({ key: 'bloodthirst', stacks: 1, path: gameAssetUrl('icons/ui_icons/blood_thirsty.png'), colorClass: 'bloodthirst-buff', hideCount: true });
            if (ch.bindMark) buffs.push({ key: 'bind', stacks: 1, path: gameAssetUrl('icons/items_icons/binding.png'), colorClass: 'bind-mark', hideCount: true });
            for (const b of buffs) {
                if (b.stacks > 0) {
                    currentKeys.push(b.key);
                    currentStacks[b.key] = b.stacks;
                    const path = b.path || gameAssetUrl(`icons/buff_icons/${b.icon}.png`);
                    const title = ({ burn: '灼烧', freeze: '冷冻', bleed: '流血', poison: '中毒', blind: '致盲', iceSeal: '冰封', bomb: '定时炸弹', hypothermia: '失温', guard: '守护', fly: '飞翔', lush: '茂盛', parasite: '寄生', crit: '暴击', diving: '潜水', bloodthirst: '嗜血', bind: '捆缚', chaos_red: '混沌红', chaos_yellow: '混沌黄', chaos_blue: '混沌蓝', chaos_green: '混沌绿' }[b.key] || b.key);
                    const animCls = !prevSet.has(b.key) ? ' icon-appear' : '';
                    const specialClass = b.key === 'bloodthirst' ? 'bloodthirst-buff' : b.key === 'bind' ? 'bind-mark' : b.key === 'bomb' ? 'bomb-mark' : b.colorClass || '';
                    html += `<div class="buff-icon-wrap ${specialClass}${animCls}" data-buff-key="${b.key}" title="${title}" aria-label="${title}"><img src="${path}" alt="${title}">${b.hideCount ? '' : `<span class="buff-count">${b.stacks}</span>`}</div>`;
                }
            }
            const currentSet = new Set(currentKeys);
            const removed = [...prevSet].filter(k => !currentSet.has(k));
            const prevStacks = (this._prevBuffStacks || (this._prevBuffStacks = {}))[prefix] || {};
            let stacksChanged = currentKeys.length !== prevSet.size;
            if (!stacksChanged) {
                for (const k of currentKeys) {
                    if (!prevSet.has(k) || prevStacks[k] !== currentStacks[k]) { stacksChanged = true; break; }
                }
            }
            prevKeys[prefix] = currentKeys;
            (this._prevBuffStacks || (this._prevBuffStacks = {}))[prefix] = currentStacks;
            if (!stacksChanged && !removed.length) {
                if (cancelledPending) container.innerHTML = html;
                return;
            }
            if (removed.length) {
                container.querySelectorAll('.buff-icon-wrap').forEach(el => {
                    const title = el.getAttribute('title');
                    const keyMap = {
                        '灼烧': 'burn', '冷冻': 'freeze', '流血': 'bleed', '中毒': 'poison', '致盲': 'blind', '冰封': 'iceSeal',
                        '炸弹': 'bomb', '失温': 'hypothermia', '守护': 'guard', '飞翔': 'fly', '茂盛': 'lush', '寄生': 'parasite', '暴击': 'crit',
                        '潜水': 'diving', '嗜血': 'bloodthirst', '捆缚': 'bind',
                        '混沌红': 'chaos_red', '混沌黄': 'chaos_yellow', '混沌蓝': 'chaos_blue', '混沌绿': 'chaos_green'
                    };
                    const key = Object.keys(keyMap).find(k => title === k);
                    if (key && removed.includes(keyMap[key])) el.classList.add('icon-disappear');
                });
                const expectedKeys = currentKeys.slice();
                const expectedStacks = Object.assign({}, currentStacks);
                renderTimers[prefix] = setTimeout(() => {
                    renderTimers[prefix] = null;
                    const latestKeys = (this._prevBuffKeys && this._prevBuffKeys[prefix]) || [];
                    const latestStacks = (this._prevBuffStacks && this._prevBuffStacks[prefix]) || {};
                    if (JSON.stringify(latestKeys) !== JSON.stringify(expectedKeys) ||
                        JSON.stringify(latestStacks) !== JSON.stringify(expectedStacks)) return;
                    container.innerHTML = html;
                }, 160);
            } else {
                container.innerHTML = html;
            }
        },

        _flashBuffIcon(prefix, kind) {
            const container = document.getElementById(`${prefix}-buffs`);
            if (!container || !kind) return;
            const icon = Array.from(container.querySelectorAll('.buff-icon-wrap'))
                .find(el => el.dataset && el.dataset.buffKey === kind);
            if (!icon) return;
            const key = `${prefix}:${kind}`;
            const timers = this._buffFlashTimers || (this._buffFlashTimers = {});
            if (timers[key]) clearTimeout(timers[key]);
            icon.classList.remove('buff-trigger-flash');
            // Force a reflow so consecutive triggers always replay the animation.
            void icon.offsetWidth;
            icon.classList.add('buff-trigger-flash');
            timers[key] = setTimeout(() => {
                icon.classList.remove('buff-trigger-flash');
                timers[key] = null;
            }, 620);
        }
    });
})(window);
/* Status rendering: HP bars, avatars, buff icon rows and attacker/defender
 * indicators. */
(function (global) {
    const GameUI = global.GameUI;
    if (!GameUI) {
        console.error('[UI status] GameUI must be loaded first');
        return;
    }
    const statusRegistry = global.FurryGame && (global.FurryGame.StatusService || global.FurryGame.StatusRegistry);
    const schedule = (fn, ms, owner = null, channel = 'ui-status') => {
        const runtime = global.FurryGame && global.FurryGame.CombatRuntime;
        return runtime ? runtime.schedule(owner, fn, ms, channel) : setTimeout(fn, ms);
    };
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
                    el.onerror = () => {
                        el.src = gameAssetUrl(`avatars/${charName}.webp`);
                        el.onerror = null;
                    };
                } else {
                    el.src = gameAssetUrl(`avatars/${charName}.webp`);
                    el.onerror = null;
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
            const uiOverrides = {
                burn: { colorClass: 'burn-buff' }, freeze: { colorClass: 'freeze-buff' },
                bleed: { colorClass: 'bleed-buff' }, poison: { colorClass: 'poison-buff' },
                blind: { colorClass: 'blind-buff' }, iceSeal: { colorClass: 'ice-seal-buff' },
                hypnosis: { colorClass: 'hypnosis-buff' }, sleep: { colorClass: 'sleep-buff' },
                bomb: { colorClass: 'bomb-mark' }, hypothermia: { colorClass: 'hypothermia-buff' },
                guard: { colorClass: 'guard-buff' }, fly: { colorClass: 'fly-buff' },
                lush: { colorClass: 'lush-buff' }, parasite: { colorClass: 'parasite-buff' },
                crit: { colorClass: 'crit-buff' },
                diving: { colorClass: 'diving-buff' }, bloodthirst: { colorClass: 'bloodthirst-buff' },
                bind: { colorClass: 'bind-mark' }, chaos_red: { colorClass: 'chaos-red-buff' },
                chaos_yellow: { colorClass: 'chaos-yellow-buff' }, chaos_blue: { colorClass: 'chaos-blue-buff' },
                chaos_green: { colorClass: 'chaos-green-buff' }
            };
            const buffs = statusRegistry
                ? statusRegistry.list(ch).map(def => Object.assign({
                    key: def.id,
                    stacks: statusRegistry.amount(ch, def.id),
                    path: gameAssetUrl(`icons/${def.icon}`),
                    hideCount: !def.stack,
                    label: def.mark ? `${def.label}（印记，不可净化）` : def.label
                }, uiOverrides[def.id] || {}))
                : [
                    { key: 'burn', stacks: ch.burn, icon: 'burn', label: '灼烧', colorClass: 'burn-buff' },
                    { key: 'freeze', stacks: ch.frozen ? 1 : 0, icon: 'freeze', label: '冷冻', colorClass: 'freeze-buff' },
                    { key: 'bleed', stacks: ch.bleed, icon: 'bleed', label: '流血', colorClass: 'bleed-buff' },
                    { key: 'poison', stacks: ch.poison || 0, icon: 'poison', label: '中毒', colorClass: 'poison-buff' }
                ];
            for (const b of buffs) {
                if (b.stacks > 0) {
                    currentKeys.push(b.key);
                    currentStacks[b.key] = b.stacks;
                    const path = b.path || gameAssetUrl(`icons/buff_icons/${b.icon}.webp`);
                    const title = b.label || b.key;
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
                    const key = el.dataset && el.dataset.buffKey;
                    if (key && removed.includes(key)) el.classList.add('icon-disappear');
                });
                const expectedKeys = currentKeys.slice();
                const expectedStacks = Object.assign({}, currentStacks);
                renderTimers[prefix] = schedule(() => {
                    renderTimers[prefix] = null;
                    const latestKeys = (this._prevBuffKeys && this._prevBuffKeys[prefix]) || [];
                    const latestStacks = (this._prevBuffStacks && this._prevBuffStacks[prefix]) || {};
                    if (JSON.stringify(latestKeys) !== JSON.stringify(expectedKeys) ||
                        JSON.stringify(latestStacks) !== JSON.stringify(expectedStacks)) return;
                    container.innerHTML = html;
                }, 160, this, `buff-render-${prefix}`);
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
            timers[key] = schedule(() => {
                icon.classList.remove('buff-trigger-flash');
                timers[key] = null;
            }, 620, this, `buff-flash-${key}`);
        }
    });
})(window);

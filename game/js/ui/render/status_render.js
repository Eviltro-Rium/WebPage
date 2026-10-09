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
        _stateAttackerKey(s, who) {
            const state = s || {};
            if (['player', 'ai', 'ai2'].includes(who)) return who;
            const defending = ['AI_TURN', 'AI2_TURN', 'PLAYER_DEFEND', 'GUARD_CHOICE'].includes(state.phase);
            if (defending && ['player', 'ai', 'ai2'].includes(state.atkOwner)) return state.atkOwner;
            if (['player', 'ai', 'ai2'].includes(state.activeAttacker)) return state.activeAttacker;
            return defending ? 'ai' : 'player';
        },
        _updateAttackerIndicator(who) {
            const s = this.state || {};
            const is1v2 = !!s.is1v2;
            const attacker = this._stateAttackerKey(s, who);
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
            const prevKeys = this._prevBuffKeys || (this._prevBuffKeys = {});
            const prevSet = new Set(prevKeys[prefix] || []);
            const currentKeys = [];
            let html = '';
            const uiOverrides = {
                burn: { colorClass: 'burn-buff' }, freeze: { colorClass: 'freeze-buff' },
                bleed: { colorClass: 'bleed-buff' }, poison: { colorClass: 'poison-buff' },
                blind: { colorClass: 'blind-buff' }, iceSeal: { colorClass: 'ice-seal-buff' },
                hypnosis: { colorClass: 'hypnosis-buff' }, sleep: { colorClass: 'sleep-buff' },
                thorns: { colorClass: 'thorns-buff' },
                sandblind: { colorClass: 'sandblind-buff' },
                quicksand: { colorClass: 'sandblind-buff' },
                bomb: { colorClass: 'bomb-mark' }, hypothermia: { colorClass: 'hypothermia-buff' },
                guard: { colorClass: 'guard-buff' }, fly: { colorClass: 'fly-buff' },
                lush: { colorClass: 'lush-buff' }, parasite: { colorClass: 'parasite-buff' },
                crit: { colorClass: 'crit-buff' }, magmaVein: { colorClass: 'magma-vein-buff' },
                diving: { colorClass: 'diving-buff' }, scorch: { colorClass: 'scorch-buff' }, bloodthirst: { colorClass: 'bloodthirst-buff' },
                bind: { colorClass: 'bind-mark' }, taunt: { colorClass: 'mock-mark' }, chaos_red: { colorClass: 'chaos-red-buff' },
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
                    { key: 'burn', stacks: ch.burn, icon: 'burn', label: '灼伤', colorClass: 'burn-buff' },
                    { key: 'freeze', stacks: ch.frozen ? 1 : 0, icon: 'freeze', label: '冷冻', colorClass: 'freeze-buff' },
                    { key: 'bleed', stacks: ch.bleed, icon: 'bleed', label: '流血', colorClass: 'bleed-buff' },
                    { key: 'poison', stacks: ch.poison || 0, icon: 'poison', label: '中毒', colorClass: 'poison-buff' }
                ];
            for (const b of buffs) {
                if (b.stacks > 0) {
                    currentKeys.push(b.key);
                    const path = b.path || gameAssetUrl(`icons/buff_icons/${b.icon}.webp`);
                    const title = b.label || b.key;
                    const animCls = !prevSet.has(b.key) ? ' icon-appear' : '';
                    let specialClass = b.key === 'bloodthirst' ? 'bloodthirst-buff' : b.key === 'bind' ? 'bind-mark' : b.key === 'bomb' ? 'bomb-mark' : b.key === 'taunt' ? 'mock-mark' : b.colorClass || '';
                    let markName = '';
                    if (b.key === 'bloodthirst') markName = '嗜血';
                    else if (b.key === 'bind') markName = '捆缚';
                    else if (b.key === 'taunt') {
                        const mc = String(ch && (ch.mockAttackColor || ch.tauntColor) || '').toUpperCase();
                        if (mc === 'RED') specialClass += ' mock-mark-red';
                        else if (mc === 'YELLOW') specialClass += ' mock-mark-yellow';
                        else if (mc === 'BLUE') specialClass += ' mock-mark-blue';
                        else if (mc === 'GREEN') specialClass += ' mock-mark-green';
                        const colorTip = ({ RED: '红', YELLOW: '黄', BLUE: '蓝', GREEN: '绿' })[mc] || '';
                        markName = colorTip ? ('嘲弄' + colorTip) : '嘲弄';
                    }
                    const trailing = markName
                        ? `<span class="buff-name">${markName}</span>`
                        : (b.hideCount ? '' : `<span class="buff-count">${b.stacks}</span>`);
                    html += `<div class="buff-icon-wrap ${specialClass}${animCls}" data-buff-key="${b.key}" title="${title}" aria-label="${title}"><img src="${path}" alt="${title}">${trailing}</div>`;
                }
            }
            prevKeys[prefix] = currentKeys;
            const dom = global.FurryGame && global.FurryGame.RenderDOM;
            if (dom) dom.patchMarkup(container,html);
            else if (container._renderMarkup !== html) { container.innerHTML=html;container._renderMarkup=html; }
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

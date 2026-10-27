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
    function npcPassiveText(name, definition, stage) {
        const notes = (global.AdventureMonsterNotes && global.AdventureMonsterNotes[name]) || [];
        const lines = notes.filter(note => note.title === '被动').flatMap(note => note.lines || [])
            .map(line => String(line).replace(/\*\*/g, '').trim())
            .filter(line => {
                const match = line.match(/^Stage\s+([\d/]+)\s*[:：]/i);
                return !match || match[1].split('/').map(Number).includes(Number(stage) || 1);
            }).map(line => line.replace(/^Stage\s+[\d/]+\s*[:：]\s*/i, '').replace(/[。；]$/, ''));
        const add = text => { if (!lines.some(line => line.includes(text))) lines.push(text); };
        if (definition.firstStrike && !lines.some(line => /先手/.test(line))) add('先手攻击');
        if (definition.initialLush && !lines.some(line => /茂盛/.test(line))) add('初始[茂盛]' + definition.initialLush + '层');
        if (definition.noAttack) add(definition.attackSkipDescription || '不主动进攻');
        if (definition.immuneFreeze && !lines.some(line => /冷冻/.test(line))) add('免疫[冷冻]');
        if (definition.immuneHypothermia && !lines.some(line => /失温/.test(line))) add('免疫[失温]');
        if (definition.poisonImmune && !lines.some(line => /中毒/.test(line))) add('免疫[中毒]');
        if (definition.canDefendHigh) add('可用高点数牌防御');
        if (definition.handLimit && definition.handLimit < 4 && global.AdventureRegistry.getMonster(name)) add('手牌上限' + definition.handLimit);
        return lines.join('；');
    }
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
            // In 1v2/challenge rooms, only highlight a defender when a target
            // is actually selected. Falling back to NPC1 made the badge jump
            // upward after attackTarget was cleared.
            let defender = null;
            if (attacker === 'player') {
                if (is1v2) defender = (s.attackTarget === 'ai' || s.attackTarget === 'ai2') ? s.attackTarget : null;
                else defender = 'ai';
            } else if (attacker === 'ai' || attacker === 'ai2') {
                defender = 'player';
            }
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

        _updateNpcPassive(prefix, name, definition) {
            const section = document.getElementById(`${prefix}-hp-section`);
            if (!section) return;
            let details = section.querySelector('.npc-hp-details');
            if (!definition || prefix === 'player') {
                section.classList.remove('npc-hp-section');
                if (details) {
                    const bar = details.querySelector('.hp-bar-outer');
                    if (bar) details.before(bar);
                    details.remove();
                }
                return;
            }
            section.classList.add('npc-hp-section');
            if (!details) {
                const bar = section.querySelector('.hp-bar-outer');
                if (!bar) return;
                details = document.createElement('div'); details.className = 'npc-hp-details';
                bar.before(details); details.appendChild(bar);
                const passive = document.createElement('p'); passive.className = 'npc-passive';
                details.appendChild(passive);
            }
            const text = npcPassiveText(name, definition, this.state && (this.state.adventureStage || this.state.stage));
            const passive = details.querySelector('.npc-passive');
            passive.textContent = text ? '被动：' + text : '';
            passive.hidden = !text;
        },

        _updateAvatar(prefix, name) {
            const el = document.getElementById(`${prefix}-avatar`);
            if (!el) return;
            const charName = (name || '').replace(/^AI\d*\s+/, '');
            const registry = global.AdventureRegistry;
            const definition = registry && (registry.getMonster(charName) || registry.getBoss(charName));
            this._updateNpcPassive(prefix, charName, definition);
            el.classList.toggle('npc-avatar', !!definition);
            if (charName && charName !== el.dataset.char) {
                el._avatarHit = null; el.classList.remove('avatar-hit');
                el.dataset.char = charName;
                const src = definition && definition.icon
                    ? gameAssetUrl(definition.icon.replace(/^\.\.\//, ''))
                    : gameAssetUrl(`avatars/${charName}.webp`);
                el.dataset.normalSrc = src;
                el.dataset.hitSrc = definition && definition.icon
                    ? src.replace(/\.webp(?:\?.*)?$/, '_hit.webp?v=20261027-portraits') : '';
                el.src = src;
                if (el.dataset.hitSrc && typeof this._preloadHitPortrait === 'function') this._preloadHitPortrait(el.dataset.hitSrc);
                el.onerror = definition ? () => {
                    el._avatarHit = null; el.classList.remove('avatar-hit');
                    el.dataset.hitSrc = '';
                    el.dataset.normalSrc = gameAssetUrl(`avatars/${charName}.webp`);
                    el.src = el.dataset.normalSrc; el.onerror = null;
                } : null;
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
                bind: { colorClass: 'bind-mark' }, taunt: { colorClass: 'taunt-mark' }, chaos_red: { colorClass: 'chaos-red-buff' },
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
                    let title = b.label || b.key;
                    const animCls = !prevSet.has(b.key) ? ' icon-appear' : '';
                    const specialClass = b.key === 'bloodthirst' ? 'bloodthirst-buff' : b.key === 'bind' ? 'bind-mark' : b.key === 'taunt' ? 'taunt-mark' : b.key === 'bomb' ? 'bomb-mark' : b.colorClass || '';
                    let countHtml = '';
                    if (b.key === 'thorns') {
                        // Remaining attack-turn triggers (engine: thornsTriggersLeft). Stacks stay at 1.
                        const left = ch.thornsTriggersLeft;
                        if (left != null) {
                            title = `${title}（本回合还可触发${left}次）`;
                            countHtml = `<span class="buff-count buff-count-tr" data-thorns-left="${left}">${left}</span>`;
                        }
                    } else if (b.key === 'bomb') {
                        // Countdown lives in the top-right, same corner as thorns remaining.
                        title = `${title}（倒计时${b.stacks}）`;
                        countHtml = `<span class="buff-count buff-count-tr buff-count-bomb">${b.stacks}</span>`;
                    } else if (!b.hideCount) {
                        countHtml = `<span class="buff-count">${b.stacks}</span>`;
                    }
                    let nameHtml = '';
                    if (b.key === 'bloodthirst') nameHtml = '<span class="buff-name">嗜血</span>';
                    else if (b.key === 'bind') nameHtml = '<span class="buff-name">捆缚</span>';
                    else if (b.key === 'taunt') {
                        const emoji = ({ RED: '🔴', YELLOW: '🟡', BLUE: '🔵', GREEN: '🟢' })[String(ch.mockAttackColor || '').toUpperCase()] || '';
                        nameHtml = emoji ? `<span class="buff-name buff-name-taunt">${emoji}</span>` : '<span class="buff-name">嘲弄</span>';
                        if (emoji) title = `${title}（无效${emoji}）`;
                    }
                    html += `<div class="buff-icon-wrap ${specialClass}${animCls}" data-buff-key="${b.key}" title="${title}" aria-label="${title}"><img src="${path}" alt="${title}">${nameHtml}${countHtml}</div>`;
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

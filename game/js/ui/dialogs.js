const statusIconPath = name => {
    const folder = (name === 'blood_thirsty' || name === 'binding') ? 'items_icons' : 'buff_icons';
    return window.gameAssetUrl ? window.gameAssetUrl(`icons/${folder}/${name}.webp`) : `icons/${folder}/${name}.webp`;
};
const statusRegistry = window.FurryGame && (window.FurryGame.StatusService || window.FurryGame.StatusRegistry);
const statusIcon = def => {
    if (!def || !def.icon) return '';
    return window.gameAssetUrl ? window.gameAssetUrl(`icons/${def.icon}`) : `icons/${def.icon}`;
};
const snapshotStatuses = entity => {
    if (!entity || !statusRegistry) return entity || {};
    const snapshot = {};
    statusRegistry.all.forEach(def => { snapshot[def.property] = entity[def.property]; });
    return snapshot;
};

class DialogManager {
    constructor(apiActionFn) {
        this._apiAction = apiActionFn;
        this._chanFiveOrder = null;
    }

    /**
     * Keep combat decision dialogs owned by the active local player.  Online
     * snapshots are broadcast to both clients, so a pending dialog must not be
     * mounted by the non-actor; stale overlays are also removed when the
     * decision changes, preventing a purify overlay from blocking card-choice
     * skills (or vice versa).
     */
    syncCombatDialog(pendingDialog, canAct = true, phase = null) {
        const desired = {
            purify: 'purify-choice-dialog',
            purifyCrystal: 'purify-choice-dialog',
            superPurify: 'super-purify-choice-dialog',
            mozeSeven: 'super-purify-choice-dialog',
            guard: 'guard-choice-dialog',
            flyRetry: 'fly-retry-choice-dialog',
            trophyDisarm: 'opponent-card-choice-dialog',
            trophyPurify: 'purify-choice-dialog'
        }[pendingDialog] || (phase === 'CHAN_FIVE_REORDER' ? 'chan-five-dialog' : null);
        const ids = [
            'purify-choice-dialog', 'super-purify-choice-dialog',
            'guard-choice-dialog', 'fly-retry-choice-dialog',
            'opponent-card-choice-dialog', 'chan-five-dialog'
        ];
        ids.forEach(id => {
            const el = document.getElementById(id);
            if (!el) return;
            // The opponent-card dialog is also used by non-combat item flows
            // (for example chameleon paint). Keep those overlays while the
            // same flow is active, but replace one immediately when a combat
            // trophy-disarm decision needs the shared dialog id.
            if (id === 'opponent-card-choice-dialog' && el.dataset.combatDecision !== 'trophyDisarm') {
                if (desired === id) el.remove();
                return;
            }
            if (!canAct || id !== desired) el.remove();
        });
    }

    showChanFiveDialog(s) {
        if (document.getElementById('chan-five-dialog')) return;
        this._chanFiveOrder = s.chanFiveCards.map((_, i) => i);
        const overlay = document.createElement('div');
        overlay.id = 'chan-five-dialog';
        overlay.className = 'dialog-overlay';
        overlay.dataset.combatDecision = 'chanFive';
        const box = document.createElement('div');
        box.className = 'dialog-box';
        box.innerHTML = `<h3>5 排序牌库顶</h3><div style="font-size:0.75rem;color:#dbeafe;margin-bottom:10px">拖拽排序，最左=最顶</div>`;
        const row = document.createElement('div');
        row.className = 'chan-five-row';
        row.id = 'chan-five-row';
        row.style.marginBottom = '14px';
        for (let i = 0; i < s.chanFiveCards.length; i++) {
            const card = s.chanFiveCards[i];
            const cv = renderCard(card, CARD_W, CARD_H, false);
            cv.draggable = true; cv.dataset.sortIndex = i;
            cv.addEventListener('dragstart', e => { e.dataTransfer.setData('text/plain', cv.dataset.sortIndex); cv.style.opacity = '0.4'; });
            cv.addEventListener('dragend', () => { cv.style.opacity = '1'; });
            cv.addEventListener('dragover', e => { e.preventDefault(); cv.style.borderLeft = '3px solid #ffdc3c'; });
            cv.addEventListener('dragleave', () => { cv.style.borderLeft = ''; });
            cv.addEventListener('drop', e => {
                e.preventDefault(); cv.style.borderLeft = '';
                const from = parseInt(e.dataTransfer.getData('text/plain'));
                const to = parseInt(cv.dataset.sortIndex);
                if (from !== to) {
                    const arr = this._chanFiveOrder;
                    const fromPos = arr.indexOf(from);
                    const toPos = arr.indexOf(to);
                    const val = arr.splice(fromPos, 1)[0];
                    arr.splice(toPos, 0, val);
                    this._refreshChanFiveDisplay();
                }
            });
            row.appendChild(cv);
        }
        box.appendChild(row);
        const reset = document.createElement('button');
        reset.className = 'ctrl-btn btn-skip'; reset.style.marginRight = '8px'; reset.textContent = '重置';
        reset.addEventListener('click', () => { this._chanFiveOrder = s.chanFiveCards.map((_,i)=>i); this._refreshChanFiveDisplay(); });
        box.appendChild(reset);
        const btn = document.createElement('button');
        btn.className = 'start-btn';
        btn.style.margin = '0';
        btn.textContent = '确认排序';
        btn.addEventListener('click', async () => {
            if (this._chanFiveOrder) {
                overlay.remove();
                await this._apiAction('chanFiveReorder', { order: this._chanFiveOrder.join(',') });
                this._chanFiveOrder = null;
            }
        });
        box.appendChild(btn);
        overlay.appendChild(box);
        document.body.appendChild(overlay);
    }

    _refreshChanFiveDisplay() {
        const row = document.getElementById('chan-five-row');
        if (!row) return;
        const cards = new Map([...row.children].map(card => [parseInt(card.dataset.sortIndex), card]));
        cards.forEach(c => row.removeChild(c));
        for (const idx of this._chanFiveOrder) row.appendChild(cards.get(idx));
    }

    showGameOver(s, onClose) {
        if (document.getElementById('game-over-overlay')) return;
        const allAIsDefeated = !s.ai.alive && (!s.is1v2 || !s.ai2 || !s.ai2.alive);
        const playerWon = s.player.alive && allAIsDefeated;
        const online = !!s.isOnline;
        const overlay = document.createElement('div');
        overlay.id = 'game-over-overlay'; overlay.className = 'game-over-overlay';
        overlay.innerHTML = `<div class="game-over-box">
            <h2>${playerWon ? '胜利!' : '败北...'}</h2>
            <div class="winner-text">${playerWon ? s.player.name : (s.is1v2 ? 'AI阵营' : s.ai.name)}赢得了比赛</div>
${online ? '            <button id="btn-online-room-overlay">返回房间</button>' : ''}
            <button id="btn-back-select-overlay">${online ? '返回主页' : '重新选择'}</button></div>`;
        document.body.appendChild(overlay);
        const closeFn = async action => {
            overlay.remove();
            if (onClose) await onClose(online ? action : undefined);
        };
        if (online) document.getElementById('btn-online-room-overlay').addEventListener('click', () => closeFn('room'));
        document.getElementById('btn-back-select-overlay').addEventListener('click', () => closeFn('home'));
    }

    showOpponentCardChoice(groups, onChoose, title = '选择一张对手手牌') {
        if (document.getElementById('opponent-card-choice-dialog')) return;
        const overlay = document.createElement('div');
        overlay.id = 'opponent-card-choice-dialog';
        overlay.className = 'dialog-overlay';
        if (String(title).startsWith('缴械')) overlay.dataset.combatDecision = 'trophyDisarm';
        const box = document.createElement('div');
        box.className = 'dialog-box';
        box.innerHTML = `<h3>${title}</h3>`;
        const list = document.createElement('div');
        list.style.display = 'flex'; list.style.flexDirection = 'column'; list.style.gap = '14px'; list.style.marginTop = '12px';
        let count = 0;
        for (const group of (groups || [])) {
            if (!group || !Array.isArray(group.cards) || !group.cards.length) continue;
            const section = document.createElement('div');
            const heading = document.createElement('div');
            heading.textContent = group.label || group.key;
            heading.style.cssText = 'font-weight:700;margin-bottom:6px;color:#dbeafe';
            section.appendChild(heading);
            const row = document.createElement('div');
            row.style.display = 'flex'; row.style.flexWrap = 'wrap'; row.style.gap = '8px';
            group.cards.forEach((card, index) => {
                const btn = document.createElement('button');
                btn.className = 'card-choice';
                btn.type = 'button';
                if (typeof renderCard === 'function') {
                    const cv = renderCard(card, 54, 78, false);
                    btn.appendChild(cv);
                }
                else btn.innerHTML = `<span>${card.value || '?'}</span>`;
                btn.addEventListener('click', () => { overlay.remove(); if (onChoose) onChoose({ target: group.key, index }); });
                row.appendChild(btn); count++;
            });
            section.appendChild(row); list.appendChild(section);
        }
        if (!count) {
            const empty = document.createElement('div'); empty.textContent = '对手没有可选择的手牌'; empty.style.color = '#94a3b8'; list.appendChild(empty);
        }
        box.appendChild(list); overlay.appendChild(box); document.body.appendChild(overlay);
    }

    collectPurifyChoices(ch, maxCount, onDone, extra) {
        extra = extra || {};
        const selfSnap = snapshotStatuses(ch);
        const opp = extra.opponent || null;
        const oppSnap = opp ? snapshotStatuses(opp) : null;
        const hasAny = snap => statusRegistry
            ? statusRegistry.list(snap, def => def.cleanse !== 'never').length > 0
            : snap && (snap.burn > 0 || snap.bleed > 0 || snap.poison > 0 || snap.thorns > 0 || snap.sandblind > 0 || snap.blind > 0 || snap.bomb > 0 || snap.frozen || snap.iceSeal > 0 ||
                snap.guard > 0 || snap.fly > 0 || snap.crit > 0 || snap.lush > 0 || snap.parasite > 0 ||
                snap.diving || snap.scorch || snap.hypothermia > 0);
        const applyLocal = (snap, kind) => {
            if (statusRegistry && statusRegistry.clear(snap, kind)) return;
            if (kind === 'burn') snap.burn = Math.max(0, snap.burn - 1);
            else if (kind === 'bleed') snap.bleed = Math.max(0, snap.bleed - 1);
            else if (kind === 'poison') snap.poison = Math.max(0, snap.poison - 1);
            else if (kind === 'thorns') snap.thorns = 0;
            else if (kind === 'sandblind') snap.sandblind = Math.max(0, (snap.sandblind || 0) - 1);
            else if (kind === 'blind') snap.blind = 0;
            else if (kind === 'bomb') snap.bomb = 0;
            else if (kind === 'freeze') snap.frozen = false;
            else if (kind === 'iceSeal') snap.iceSeal = 0;
            else if (kind === 'guard') snap.guard = Math.max(0, snap.guard - 1);
            else if (kind === 'fly') snap.fly = Math.max(0, snap.fly - 1);
            else if (kind === 'crit') snap.crit = Math.max(0, snap.crit - 1);
            else if (kind === 'lush') snap.lush = Math.max(0, snap.lush - 1);
            else if (kind === 'parasite') snap.parasite = Math.max(0, snap.parasite - 1);
            else if (kind === 'diving') snap.diving = false;
            else if (kind === 'scorch') snap.scorch = false;
            else if (kind === 'hypothermia') snap.hypothermia = 0;
        };
        const choices = [];
        const step = () => {
            if (choices.length >= maxCount || (!hasAny(selfSnap) && !hasAny(oppSnap))) {
                onDone(choices);
                return;
            }
            this.showPurifyChoice(selfSnap, picked => {
                if (picked.done) { onDone(choices); return; }
                choices.push(picked);
                applyLocal(picked.who === 'opp' ? oppSnap : selfSnap, picked.kind);
                step();
            }, { opponent: oppSnap, allowOpponent: !!oppSnap, used: choices.length, total: maxCount });
        };
        if (!hasAny(selfSnap) && !hasAny(oppSnap)) { onDone([]); return; }
        step();
    }

    showPurifyChoice(ch, onChoose, extra) {
        extra = extra || {};
        if (document.getElementById('purify-choice-dialog')) return;
        const overlay = document.createElement('div');
        overlay.id = 'purify-choice-dialog'; overlay.className = 'dialog-overlay';
        overlay.dataset.combatDecision = 'purify';
        const box = document.createElement('div'); box.className = 'dialog-box compact-choice-box';
        box.innerHTML = '<h3>净化 · 选择移除一层 Buff</h3>';
        const list = document.createElement('div'); list.className = 'choice-list';
        let closed = false;
        const finish = async payload => {
            if (closed) return;
            closed = true;
            overlay.remove();
            await onChoose(payload);
        };
        const addGroup = (snap, who, prefix) => {
            if (!snap) return;
            const rows = statusRegistry
                ? statusRegistry.list(snap, def => def.cleanse !== 'never').map(def => [
                    def.id,
                    `${def.label}${def.stack && statusRegistry.amount(snap, def.id) > 1 ? ` ×${statusRegistry.amount(snap, def.id)}` : ''}`,
                    def
                ])
                : (() => {
                    const legacy = [];
                    if (snap.burn > 0) legacy.push(['burn', `灼伤 ×${snap.burn}`, 'burn']);
                    if (snap.frozen) legacy.push(['freeze', '冷冻', 'freeze']);
                    if (snap.bleed > 0) legacy.push(['bleed', `流血 ×${snap.bleed}`, 'bleed']);
                    if (snap.poison > 0) legacy.push(['poison', `中毒 ×${snap.poison}`, 'poison']);
                    if (snap.thorns > 0) legacy.push(['thorns', `荆棘 ×${snap.thorns}`, 'thorns']);
                    if (snap.sandblind > 0) legacy.push(['sandblind', `沙盲 ×${snap.sandblind}`, 'sandblind']);
                    if (snap.blind > 0) legacy.push(['blind', '致盲', 'blind']);
                    if (snap.iceSeal > 0) legacy.push(['iceSeal', '冰封', 'ice_seal']);
                    if (snap.bomb > 0) legacy.push(['bomb', `炸弹 ×${snap.bomb}`, 'poison']);
                    if (snap.guard > 0) legacy.push(['guard', `守护 ×${snap.guard}`, 'guard']);
                    if (snap.fly > 0) legacy.push(['fly', `飞翔 ×${snap.fly}`, 'guard']);
                    if (snap.crit > 0) legacy.push(['crit', `暴击 ×${snap.crit}`, 'crit']);
                    if (snap.lush > 0) legacy.push(['lush', `茂盛 ×${snap.lush}`, 'lush']);
                    if (snap.parasite > 0) legacy.push(['parasite', `寄生 ×${snap.parasite}`, 'parasite']);
                    if (snap.diving) legacy.push(['diving', '潜水', 'diving']);
                    if (snap.hypothermia > 0) legacy.push(['hypothermia', `失温 ×${snap.hypothermia}`, 'hypothermia']);
                    return legacy;
                })();
            for (const [kind, label, icon] of rows) {
                const btn = document.createElement('button');
                btn.className = 'choice-row';
                const iconPath = statusRegistry ? statusIcon(icon) : statusIconPath(icon);
                btn.innerHTML = `<img src="${iconPath}" alt=""><span>${prefix}${label}</span>`;
                btn.addEventListener('click', async () => { await finish({ who, kind }); });
                list.appendChild(btn);
            }
        };
        addGroup(ch, 'self', extra.allowOpponent ? '自己 · ' : '');
        if (extra.allowOpponent) addGroup(extra.opponent, 'opp', '对手 · ');
        const doneBtn = document.createElement('button');
        doneBtn.className = 'choice-row choice-done-btn';
        doneBtn.innerHTML = `<span>完成（已净化${extra.used || 0}/${extra.total || 1}次，提前结束）</span>`;
        doneBtn.addEventListener('click', async () => { await finish({ done: true }); });
        list.appendChild(doneBtn);
        box.appendChild(list); overlay.appendChild(box); document.body.appendChild(overlay);
    }

    showSuperPurifyChoice(targets, onChoose, title = '超级净化 · 选择目标') {
        if (document.getElementById('super-purify-choice-dialog')) return;
        const overlay = document.createElement('div');
        overlay.id = 'super-purify-choice-dialog'; overlay.className = 'dialog-overlay';
        overlay.dataset.combatDecision = 'superPurify';
        const box = document.createElement('div'); box.className = 'dialog-box compact-choice-box';
        const heading = document.createElement('h3');
        heading.textContent = title;
        box.appendChild(heading);
        const list = document.createElement('div'); list.className = 'choice-list';
        const buffIcon = name => statusIconPath(name);
        for (const t of targets) {
            const btn = document.createElement('button'); btn.className = 'choice-row';
            const buffs = [];
            if (statusRegistry) {
                statusRegistry.list(t.ch).forEach(def => {
                    const amount = statusRegistry.amount(t.ch, def.id);
                    const suffix = def.stack && amount > 1 ? `×${amount}` : '';
                    buffs.push(`<img src="${statusIcon(def)}" alt="" style="width:20px;height:20px;vertical-align:middle"><span>${def.label}${suffix}</span>`);
                });
            } else {
            if (t.ch.burn > 0) buffs.push(`<img src="${buffIcon('burn')}" alt="" style="width:20px;height:20px;vertical-align:middle"><span>灼伤×${t.ch.burn}</span>`);
            if (t.ch.bleed > 0) buffs.push(`<img src="${buffIcon('bleed')}" alt="" style="width:20px;height:20px;vertical-align:middle"><span>流血×${t.ch.bleed}</span>`);
            if (t.ch.blind > 0) buffs.push(`<img src="${buffIcon('blind')}" alt="" style="width:20px;height:20px;vertical-align:middle"><span>致盲</span>`);
            if (t.ch.poison > 0) buffs.push(`<img src="${buffIcon('poison')}" alt="" style="width:20px;height:20px;vertical-align:middle"><span>中毒×${t.ch.poison}</span>`);
            if ((t.ch.thorns || 0) > 0) buffs.push(`<img src="${buffIcon('thorns')}" alt="" style="width:20px;height:20px;vertical-align:middle"><span>荆棘×${t.ch.thorns}</span>`);
            if ((t.ch.sandblind || 0) > 0) buffs.push(`<img src="${buffIcon('sandblind')}" alt="" style="width:20px;height:20px;vertical-align:middle"><span>沙盲×${t.ch.sandblind}</span>`);
            if (t.ch.frozen) buffs.push(`<img src="${buffIcon('freeze')}" alt="" style="width:20px;height:20px;vertical-align:middle"><span>冷冻</span>`);
            if ((t.ch.iceSeal || 0) > 0) buffs.push(`<img src="${buffIcon('ice_seal')}" alt="" style="width:20px;height:20px;vertical-align:middle"><span>冰封</span>`);
            if (t.ch.bomb > 0) buffs.push(`<img src="${buffIcon('time_bomb')}" alt="" style="width:20px;height:20px;vertical-align:middle"><span>定时炸弹×${t.ch.bomb}</span>`);
            if ((t.ch.hypothermia || 0) > 0) buffs.push(`<img src="${buffIcon('hypothermia')}" alt="" style="width:20px;height:20px;vertical-align:middle"><span>失温×${t.ch.hypothermia}</span>`);
            if (t.ch.guard > 0) buffs.push(`<img src="${buffIcon('guard')}" alt="" style="width:20px;height:20px;vertical-align:middle"><span>守护×${t.ch.guard}</span>`);
            if (t.ch.fly > 0) buffs.push(`<img src="${buffIcon('fly')}" alt="" style="width:20px;height:20px;vertical-align:middle"><span>飞翔×${t.ch.fly}</span>`);
            if (t.ch.crit > 0) buffs.push(`<img src="${buffIcon('crit')}" alt="" style="width:20px;height:20px;vertical-align:middle"><span>暴击×${t.ch.crit}</span>`);
            if (t.ch.lush > 0) buffs.push(`<img src="${buffIcon('lush')}" alt="" style="width:20px;height:20px;vertical-align:middle"><span>茂盛×${t.ch.lush}</span>`);
            if (t.ch.diving) buffs.push(`<img src="${buffIcon('diving')}" alt="" style="width:20px;height:20px;vertical-align:middle"><span>潜水</span>`);
            if ((t.ch.parasite || 0) > 0) buffs.push(`<img src="${buffIcon('parasite')}" alt="" style="width:20px;height:20px;vertical-align:middle"><span>寄生×${t.ch.parasite}</span>`);
            if (t.ch.bloodthirst) buffs.push(`<img src="${buffIcon('blood_thirsty')}" alt="" style="width:20px;height:20px;vertical-align:middle"><span>嗜血</span>`);
            if (t.ch.bindMark) buffs.push(`<img src="${buffIcon('binding')}" alt="" style="width:20px;height:20px;vertical-align:middle"><span>捆缚</span>`);
            for (const [key, label] of [['chaos_red', '混沌·红'], ['chaos_yellow', '混沌·黄'], ['chaos_blue', '混沌·蓝'], ['chaos_green', '混沌·绿']]) {
                if (t.ch[key]) buffs.push(`<img src="${buffIcon(key)}" alt="" style="width:20px;height:20px;vertical-align:middle"><span>${label}</span>`);
            }
            }
            const buffText = buffs.length ? buffs.join(' ') : '无buff';
            btn.innerHTML = `<span style="font-weight:700">${t.label}</span><span style="color:#aaa;font-size:0.85rem;margin-left:8px">${buffText}</span>`;
            btn.addEventListener('click', async () => { overlay.remove(); await onChoose(t.key); });
            list.appendChild(btn);
        }
        box.appendChild(list); overlay.appendChild(box); document.body.appendChild(overlay);
    }

    showBuffTransferChoice(ch, onChoose, extra) {
        extra = extra || {};
        if (document.getElementById('buff-transfer-choice-dialog')) return;
        const overlay = document.createElement('div');
        overlay.id = 'buff-transfer-choice-dialog';
        overlay.className = 'dialog-overlay';
        const box = document.createElement('div');
        box.className = 'dialog-box compact-choice-box buff-transfer-box';
        box.innerHTML = '<h3>魔法转移 · 选择转移一层 Buff</h3>';
        const columns = document.createElement('div');
        columns.className = 'buff-transfer-columns';
        let closed = false;
        const finish = async payload => {
            if (closed) return;
            closed = true;
            overlay.remove();
            await onChoose(payload);
        };
        const buildColumn = (target, from, title) => {
            const col = document.createElement('div');
            col.className = 'buff-transfer-col';
            const heading = document.createElement('div');
            heading.className = 'buff-transfer-col-title';
            heading.textContent = title;
            col.appendChild(heading);
            const list = document.createElement('div');
            list.className = 'choice-list';
            if (!target) {
                const empty = document.createElement('p');
                empty.className = 'buff-transfer-empty';
                empty.textContent = '无可转移 buff';
                list.appendChild(empty);
                col.appendChild(list);
                return col;
            }
            const rows = statusRegistry
                ? statusRegistry.list(target, def => !!def.transferable)
                    .map(def => [def.id, `${def.label}${def.stack && statusRegistry.amount(target, def.id) > 1 ? ` ×${statusRegistry.amount(target, def.id)}` : ''}`, def])
                : (() => {
                    const legacy = [];
                    if (target.burn > 0) legacy.push(['burn', `灼伤 ×${target.burn}`, 'burn']);
                    if (target.bleed > 0) legacy.push(['bleed', `流血 ×${target.bleed}`, 'bleed']);
                    if ((target.poison || 0) > 0) legacy.push(['poison', `中毒 ×${target.poison}`, 'poison']);
                    if (target.frozen) legacy.push(['freeze', '冷冻', 'freeze']);
                    if ((target.blind || 0) > 0) legacy.push(['blind', '致盲', 'blind']);
                    if ((target.bomb || 0) > 0) legacy.push(['bomb', `定时炸弹 ×${target.bomb}`, 'time_bomb']);
                    if ((target.iceSeal || 0) > 0) legacy.push(['iceSeal', '冰封', 'ice_seal']);
                    if ((target.hypothermia || 0) > 0) legacy.push(['hypothermia', `失温 ×${target.hypothermia}`, 'hypothermia']);
                    if (target.hypnosis) legacy.push(['hypnosis', '催眠', 'sleepy_1']);
                    if (target.sleep) legacy.push(['sleep', '沉睡', 'sleepy_2']);
                    if ((target.thorns || 0) > 0) legacy.push(['thorns', '荆棘', 'thorns']);
                    if ((target.sandblind || 0) > 0) legacy.push(['sandblind', `沙盲 ×${target.sandblind}`, 'sandblind']);
                    if (target.guard > 0) legacy.push(['guard', `守护 ×${target.guard}`, 'guard']);
                    if ((target.fly || 0) > 0) legacy.push(['fly', `飞翔 ×${target.fly}`, 'fly']);
                    if ((target.crit || 0) > 0) legacy.push(['crit', `暴击 ×${target.crit}`, 'crit']);
                    if ((target.lush || 0) > 0) legacy.push(['lush', `茂盛 ×${target.lush}`, 'lush']);
                    if ((target.parasite || 0) > 0) legacy.push(['parasite', `寄生 ×${target.parasite}`, 'parasite']);
                    if (target.diving) legacy.push(['diving', '潜水', 'diving']);
                    for (const [key, label, icon] of [
                        ['chaos_red', '混沌·红', 'chaos_red'],
                        ['chaos_yellow', '混沌·黄', 'chaos_yellow'],
                        ['chaos_blue', '混沌·蓝', 'chaos_blue'],
                        ['chaos_green', '混沌·绿', 'chaos_green']
                    ]) {
                        if (target[key]) legacy.push([key, label, icon]);
                    }
                    return legacy;
                })();
            if (!rows.length) {
                const empty = document.createElement('p');
                empty.className = 'buff-transfer-empty';
                empty.textContent = '无可转移 buff';
                list.appendChild(empty);
            } else {
                for (const [kind, label, icon] of rows) {
                    const btn = document.createElement('button');
                    btn.className = 'choice-row';
                    const iconPath = statusRegistry ? statusIcon(icon) : statusIconPath(icon);
                    btn.innerHTML = `<img src="${iconPath}" alt=""><span>${label}</span>`;
                    btn.addEventListener('click', async () => { await finish({ from, kind }); });
                    list.appendChild(btn);
                }
            }
            col.appendChild(list);
            return col;
        };
        columns.appendChild(buildColumn(ch, 'self', '自己'));
        columns.appendChild(buildColumn(extra.opponent || null, 'opp', '对手'));
        box.appendChild(columns);
        overlay.appendChild(box);
        document.body.appendChild(overlay);
    }

    showGuardChoice(ch, damage, onChoose) {
        this.showGuardOrFlyChoice(ch, damage, onChoose);
    }

    showGuardOrFlyChoice(ch, damage, onChoose) {
        this._showAvoidanceChoice(ch, damage, onChoose, false);
    }

    showFlyRetryChoice(ch, damage, onChoose) {
        this._showAvoidanceChoice(ch, damage, onChoose, true);
    }

    _showAvoidanceChoice(ch, damage, onChoose, retry) {
        const id = retry ? 'fly-retry-choice-dialog' : 'guard-choice-dialog';
        if (document.getElementById(id)) return;
        const overlay = document.createElement('div');
        overlay.id = id; overlay.className = 'dialog-overlay';
        overlay.dataset.combatDecision = retry ? 'flyRetry' : 'guard';
        const box = document.createElement('div');
        box.className = 'dialog-box compact-choice-box avoidance-choice-box';
        const title = document.createElement('h3');
        title.textContent = retry ? '飞翔失败 · 选择下一步' : '选择伤害减免';
        box.appendChild(title);
        const summary = document.createElement('p'); summary.className = 'dialog-summary';
        summary.innerHTML = '剩余伤害 <strong>' + damage + '</strong><span>守护 ' + (ch.guard || 0) + ' · 飞翔 ' + (ch.fly || 0) + '</span>';
        box.appendChild(summary);
        const list = document.createElement('div'); list.className = 'choice-list';
        let submitted = false;
        const submit = async payload => {
            if (submitted) return; submitted = true;
            overlay.remove(); await onChoose(payload);
        };
        const icon = name => window.gameAssetUrl ? window.gameAssetUrl('icons/buff_icons/' + name + '.webp') : 'icons/buff_icons/' + name + '.webp';
        const addButton = (text, action, image, extraClass = '') => {
            const button = document.createElement('button'); button.type = 'button';
            button.className = 'choice-row ' + extraClass;
            if (image) { const img = document.createElement('img'); img.src = icon(image); img.alt = ''; button.appendChild(img); }
            const label = document.createElement('span'); label.textContent = text; button.appendChild(label);
            button.addEventListener('click', action); list.appendChild(button); return button;
        };
        if ((ch.fly || 0) > 0) addButton(retry ? '再次尝试飞翔 · 1–6成功' : '使用飞翔 · 1–6成功', () => submit({action:'fly'}), 'fly');
        const max = Math.min(Math.floor(ch.guard || 0), Math.ceil(Math.max(0, damage)));
        if (max > 0) {
            const panel = document.createElement('section'); panel.className = 'guard-layer-control';
            const label = document.createElement('label'); label.htmlFor = id + '-layers'; label.textContent = '消耗守护层数';
            const value = document.createElement('output'); value.htmlFor = label.htmlFor;
            const input = document.createElement('input'); input.type = 'range'; input.id = label.htmlFor;
            input.min = '1'; input.max = String(max); input.step = '1'; input.value = String(max);
            const preview = document.createElement('p'); preview.className = 'guard-damage-preview';
            const update = () => { value.textContent = input.value + ' 层'; preview.textContent = '减免后伤害：' + Math.max(0, damage - Number(input.value)); };
            input.addEventListener('input', update); update();
            panel.append(label, value, input, preview); list.appendChild(panel);
            addButton('确认使用守护', () => submit({action:'guard', stacks:Number(input.value)}), 'guard', 'choice-primary');
        }
        addButton(retry ? '不再躲避，承受伤害' : '不使用减免', () => submit({action:'none'}), null, 'choice-secondary');
        box.appendChild(list); overlay.appendChild(box); document.body.appendChild(overlay);
    }

}

/**
 * Make a combat / adventure .dialog-box movable by its title so players can
 * peek at HP, hands, and the board underneath the lighter overlay.
 */
function makeDialogDraggable(box) {
    if (!box || box.nodeType !== 1 || box.dataset.dragBound === '1') return box;
    if (!box.classList.contains('dialog-box') && !box.classList.contains('game-over-box')) return box;
    box.dataset.dragBound = '1';
    box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true');
    const title = box.querySelector('.dialog-title, h3, h2');
    if (title) {
        if (!title.id) title.id = 'dialog-heading-' + (window.__dialogHeadingId = (window.__dialogHeadingId || 0) + 1);
        box.setAttribute('aria-labelledby', title.id);
    }
    box.classList.add('dialog-draggable');

    const handle = box.querySelector('.dialog-title, h3') || box;
    handle.classList.add('dialog-drag-handle');
    if (!handle.getAttribute('title')) handle.setAttribute('title', '拖动可移动弹窗');

    let dragging = false;
    let startX = 0;
    let startY = 0;
    let originLeft = 0;
    let originTop = 0;
    let pointerId = null;
    let dragWidth = 0, dragHeight = 0;

    const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

    const pinFixed = () => {
        const rect = box.getBoundingClientRect();
        box.style.position = 'fixed';
        box.style.left = rect.left + 'px';
        box.style.top = rect.top + 'px';
        box.style.right = 'auto';
        box.style.bottom = 'auto';
        box.style.margin = '0';
        box.style.transform = 'none';
        return rect;
    };

    const onPointerDown = (event) => {
        if (event.button != null && event.button !== 0) return;
        if (event.target.closest('button, input, select, textarea, a, label, .chan-five-row, .crystal-ball-row, [draggable="true"]')) return;
        if (handle !== box && !handle.contains(event.target)) return;
        const rect = pinFixed();
        dragging = true;
        pointerId = event.pointerId;
        startX = event.clientX;
        startY = event.clientY;
        originLeft = rect.left;
        originTop = rect.top;
        dragWidth = rect.width; dragHeight = rect.height;
        box.classList.add('dialog-dragging');
        handle.classList.add('dialog-dragging');
        try { handle.setPointerCapture(event.pointerId); } catch (_) {}
        event.preventDefault();
    };

    const onPointerMove = (event) => {
        if (!dragging || (pointerId != null && event.pointerId !== pointerId)) return;
        const dx = event.clientX - startX;
        const dy = event.clientY - startY;
        const width = dragWidth;
        const height = dragHeight;
        const left = clamp(originLeft + dx, 8 - Math.min(80, width * 0.4), window.innerWidth - Math.min(width, 80) - 8);
        const top = clamp(originTop + dy, 8, window.innerHeight - Math.min(height, 48) - 8);
        box.style.left = left + 'px';
        box.style.top = top + 'px';
    };

    const onPointerUp = (event) => {
        if (!dragging || (pointerId != null && event.pointerId !== pointerId)) return;
        dragging = false;
        pointerId = null;
        box.classList.remove('dialog-dragging');
        handle.classList.remove('dialog-dragging');
        try { handle.releasePointerCapture(event.pointerId); } catch (_) {}
    };

    handle.addEventListener('pointerdown', onPointerDown);
    handle.addEventListener('pointermove', onPointerMove);
    handle.addEventListener('pointerup', onPointerUp);
    handle.addEventListener('pointercancel', onPointerUp);
    return box;
}

function bindDialogDragOnNode(node) {
    if (!node || node.nodeType !== 1) return;
    if (node.classList.contains('dialog-box') || node.classList.contains('game-over-box')) {
        makeDialogDraggable(node);
    }
    if (typeof node.querySelectorAll === 'function') {
        node.querySelectorAll('.dialog-box, .game-over-box').forEach(makeDialogDraggable);
    }
}

(function installDialogDragObserver() {
    if (typeof document === 'undefined') return;
    const boot = () => {
        document.querySelectorAll('.dialog-box, .game-over-box').forEach(makeDialogDraggable);
        if (window.__dialogDragObserver) return;
        const observer = new MutationObserver((mutations) => {
            for (const mutation of mutations) {
                mutation.addedNodes.forEach(bindDialogDragOnNode);
            }
        });
        observer.observe(document.documentElement, { childList: true, subtree: true });
        window.__dialogDragObserver = observer;
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
})();

window.makeDialogDraggable = makeDialogDraggable;

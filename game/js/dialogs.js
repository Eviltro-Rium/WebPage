class DialogManager {
    constructor(apiActionFn) {
        this._apiAction = apiActionFn;
        this._chanFiveOrder = null;
    }

    showChanFiveDialog(s) {
        if (document.getElementById('chan-five-dialog')) return;
        this._chanFiveOrder = s.chanFiveCards.map((_, i) => i);
        const overlay = document.createElement('div');
        overlay.id = 'chan-five-dialog';
        overlay.className = 'dialog-overlay';
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
        const overlay = document.createElement('div');
        overlay.id = 'game-over-overlay'; overlay.className = 'game-over-overlay';
        overlay.innerHTML = `<div class="game-over-box">
            <h2>${playerWon ? '胜利!' : '败北...'}</h2>
            <div class="winner-text">${playerWon ? s.player.name : (s.is1v2 ? 'AI阵营' : s.ai.name)}赢得了比赛</div>
            <button id="btn-restart-overlay">再来一局</button>
            <button id="btn-back-select-overlay">重新选择</button></div>`;
        document.body.appendChild(overlay);
        const closeFn = async () => {
            overlay.remove();
            if (onClose) onClose();
        };
        document.getElementById('btn-restart-overlay').addEventListener('click', closeFn);
        document.getElementById('btn-back-select-overlay').addEventListener('click', closeFn);
    }

    showColorChoice(onChoose) {
        if (document.getElementById('color-choice-dialog')) return;
        const overlay = document.createElement('div');
        overlay.id = 'color-choice-dialog';
        overlay.className = 'dialog-overlay';
        const box = document.createElement('div');
        box.className = 'dialog-box';
        box.innerHTML = `<h3>选择颜色</h3>`;
        const row = document.createElement('div');
        row.style.display = 'flex'; row.style.gap = '12px'; row.style.marginTop = '12px';
        const colors = [
            { key: 'RED', label: '红', bg: '#E31837', ink: '#FFFFFF' },
            { key: 'YELLOW', label: '黄', bg: '#FFCD00', ink: '#1A1A1A' },
            { key: 'BLUE', label: '蓝', bg: '#0072BB', ink: '#FFFFFF' },
            { key: 'GREEN', label: '绿', bg: '#00A651', ink: '#FFFFFF' }
        ];
        for (const c of colors) {
            const btn = document.createElement('button');
            btn.className = 'color-choice-btn';
            btn.style.setProperty('--cc-bg', c.bg);
            btn.style.setProperty('--cc-ink', c.ink);
            btn.textContent = c.label;
            btn.addEventListener('click', async () => {
                overlay.remove();
                if (onChoose) onChoose(c.key);
            });
            row.appendChild(btn);
        }
        box.appendChild(row);
        overlay.appendChild(box);
        document.body.appendChild(overlay);
    }

    collectPurifyChoices(ch, maxCount, onDone, extra) {
        extra = extra || {};
        const selfSnap = {
            burn: ch.burn || 0, bleed: ch.bleed || 0, poison: ch.poison || 0, bomb: ch.bomb || 0, frozen: !!ch.frozen,
            guard: ch.guard || 0, fly: ch.fly || 0, crit: ch.crit || 0
        };
        const opp = extra.opponent || null;
        const oppSnap = opp ? {
            burn: opp.burn || 0, bleed: opp.bleed || 0, poison: opp.poison || 0, bomb: opp.bomb || 0, frozen: !!opp.frozen,
            guard: opp.guard || 0, fly: opp.fly || 0, crit: opp.crit || 0
        } : null;
        const hasAny = snap => snap && (snap.burn > 0 || snap.bleed > 0 || snap.poison > 0 || snap.bomb > 0 || snap.frozen ||
            snap.guard > 0 || snap.fly > 0 || snap.crit > 0);
        const applyLocal = (snap, kind) => {
            if (kind === 'burn') snap.burn = Math.max(0, snap.burn - 1);
            else if (kind === 'bleed') snap.bleed = Math.max(0, snap.bleed - 1);
            else if (kind === 'poison') snap.poison = Math.max(0, snap.poison - 1);
            else if (kind === 'bomb') snap.bomb = 0;
            else if (kind === 'freeze') snap.frozen = false;
            else if (kind === 'guard') snap.guard = Math.max(0, snap.guard - 1);
            else if (kind === 'fly') snap.fly = Math.max(0, snap.fly - 1);
            else if (kind === 'crit') snap.crit = Math.max(0, snap.crit - 1);
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
        const box = document.createElement('div'); box.className = 'dialog-box compact-choice-box';
        box.innerHTML = '<h3>净化 · 选择移除一层 Buff</h3>';
        const list = document.createElement('div'); list.className = 'choice-list';
        const addGroup = (snap, who, prefix) => {
            if (!snap) return;
            const rows = [];
            if (snap.burn > 0) rows.push(['burn', `灼烧 ×${snap.burn}`, 'burn']);
            if (snap.frozen) rows.push(['freeze', '冷冻', 'freeze']);
            if (snap.bleed > 0) rows.push(['bleed', `流血 ×${snap.bleed}`, 'bleed']);
            if (snap.poison > 0) rows.push(['poison', `中毒 ×${snap.poison}`, 'poison']);
            if (snap.bomb > 0) rows.push(['bomb', `炸弹 ×${snap.bomb}`, 'poison']);
            if (snap.guard > 0) rows.push(['guard', `守护 ×${snap.guard}`, 'guard']);
            if (snap.fly > 0) rows.push(['fly', `飞翔 ×${snap.fly}`, 'guard']);
            if (snap.crit > 0) rows.push(['crit', `暴击 ×${snap.crit}`, 'crit']);
            for (const [kind, label, icon] of rows) {
                const btn = document.createElement('button');
                btn.className = 'choice-row';
                const iconPath = window.gameAssetUrl ? window.gameAssetUrl(`icons/buff_icons/${icon}.png`) : `icons/buff_icons/${icon}.png`;
                btn.innerHTML = `<img src="${iconPath}" alt=""><span>${prefix}${label}</span>`;
                btn.addEventListener('click', async () => { overlay.remove(); await onChoose({ who, kind }); });
                list.appendChild(btn);
            }
        };
        addGroup(ch, 'self', extra.allowOpponent ? '自己 · ' : '');
        if (extra.allowOpponent) addGroup(extra.opponent, 'opp', '对手 · ');
        const doneBtn = document.createElement('button');
        doneBtn.className = 'choice-row choice-done-btn';
        doneBtn.innerHTML = `<span>完成（已净化${extra.used || 0}/${extra.total || 1}次，提前结束）</span>`;
        doneBtn.addEventListener('click', async () => { overlay.remove(); await onChoose({ done: true }); });
        list.appendChild(doneBtn);
        box.appendChild(list); overlay.appendChild(box); document.body.appendChild(overlay);
    }

    showSuperPurifyChoice(targets, onChoose) {
        if (document.getElementById('super-purify-choice-dialog')) return;
        const overlay = document.createElement('div');
        overlay.id = 'super-purify-choice-dialog'; overlay.className = 'dialog-overlay';
        const box = document.createElement('div'); box.className = 'dialog-box compact-choice-box';
        box.innerHTML = '<h3>超级净化 · 选择目标</h3>';
        const list = document.createElement('div'); list.className = 'choice-list';
        const buffIcon = name => window.gameAssetUrl ? window.gameAssetUrl(`icons/buff_icons/${name}.png`) : `icons/buff_icons/${name}.png`;
        for (const t of targets) {
            const btn = document.createElement('button'); btn.className = 'choice-row';
            const buffs = [];
            if (t.ch.burn > 0) buffs.push(`<img src="${buffIcon('burn')}" alt="" style="width:20px;height:20px;vertical-align:middle"><span>灼烧×${t.ch.burn}</span>`);
            if (t.ch.bleed > 0) buffs.push(`<img src="${buffIcon('bleed')}" alt="" style="width:20px;height:20px;vertical-align:middle"><span>流血×${t.ch.bleed}</span>`);
            if (t.ch.poison > 0) buffs.push(`<img src="${buffIcon('poison')}" alt="" style="width:20px;height:20px;vertical-align:middle"><span>中毒×${t.ch.poison}</span>`);
            if (t.ch.frozen) buffs.push(`<img src="${buffIcon('freeze')}" alt="" style="width:20px;height:20px;vertical-align:middle"><span>冷冻</span>`);
            if (t.ch.guard > 0) buffs.push(`<img src="${buffIcon('guard')}" alt="" style="width:20px;height:20px;vertical-align:middle"><span>守护×${t.ch.guard}</span>`);
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
        box.className = 'dialog-box compact-choice-box';
        box.innerHTML = '<h3>魔法转移 · 选择转移一层 Buff</h3>';
        const list = document.createElement('div');
        list.className = 'choice-list';
        const addRows = (target, from, prefix) => {
            if (!target) return;
            const rows = [];
            if (target.burn > 0) rows.push(['burn', `灼烧 ×${target.burn}`, 'burn']);
            if (target.bleed > 0) rows.push(['bleed', `流血 ×${target.bleed}`, 'bleed']);
            if ((target.poison || 0) > 0) rows.push(['poison', `中毒 ×${target.poison}`, 'poison']);
            if (target.frozen) rows.push(['freeze', '冷冻', 'freeze']);
            if (target.guard > 0) rows.push(['guard', `守护 ×${target.guard}`, 'guard']);
            if ((target.fly || 0) > 0) rows.push(['fly', `飞翔 ×${target.fly}`, 'guard']);
            if ((target.crit || 0) > 0) rows.push(['crit', `暴击 ×${target.crit}`, 'crit']);
            for (const [kind, label, icon] of rows) {
                const btn = document.createElement('button');
                btn.className = 'choice-row';
                const iconPath = window.gameAssetUrl ? window.gameAssetUrl(`icons/buff_icons/${icon}.png`) : `icons/buff_icons/${icon}.png`;
                btn.innerHTML = `<img src="${iconPath}" alt=""><span>${prefix}${label}</span>`;
                btn.addEventListener('click', async () => { overlay.remove(); await onChoose({ from, kind }); });
                list.appendChild(btn);
            }
        };
        addRows(ch, 'self', '');
        box.appendChild(list);
        overlay.appendChild(box);
        document.body.appendChild(overlay);
    }

    showGuardChoice(ch, damage, onChoose) {
        this.showGuardOrFlyChoice(ch, damage, onChoose);
    }

    showGuardOrFlyChoice(ch, damage, onChoose) {
        if (document.getElementById('guard-choice-dialog')) return;
        const overlay=document.createElement('div'); overlay.id='guard-choice-dialog'; overlay.className='dialog-overlay';
        const box=document.createElement('div'); box.className='dialog-box compact-choice-box';
        const fly = ch.fly || 0;
        const guard = ch.guard || 0;
        box.innerHTML=`<h3>即将受到 ${damage} 点伤害</h3>`;
        const list=document.createElement('div'); list.className='choice-list';
        const addBtn = (html, payload) => {
            const btn=document.createElement('button'); btn.className='choice-row';
            btn.innerHTML=html;
            btn.addEventListener('click',async()=>{overlay.remove();await onChoose(payload)});
            list.appendChild(btn);
        };
        const flyIcon = window.gameAssetUrl ? window.gameAssetUrl('icons/buff_icons/fly.png') : 'icons/buff_icons/fly.png';
        const guardIcon = window.gameAssetUrl ? window.gameAssetUrl('icons/buff_icons/guard.png') : 'icons/buff_icons/guard.png';
        if (fly > 0) {
            addBtn(`<img src="${flyIcon}" alt=""><span>使用 1 层飞翔躲避（50%，剩余 ${fly - 1}）</span>`, { action: 'fly' });
        }
        if (guard > 0) {
            const max=Math.min(guard,damage);
            for(let i=1;i<=max;i++){
                addBtn(`<img src="${guardIcon}" alt=""><span>使用 ${i} 层守护（剩余伤害 ${damage-i}）</span>`, { action: 'guard', stacks: i });
            }
        }
        addBtn(`<span>不使用</span>`, { action: 'none' });
        box.appendChild(list);overlay.appendChild(box);document.body.appendChild(overlay);
    }

    showFlyRetryChoice(ch, damage, onChoose) {
        if (document.getElementById('fly-retry-choice-dialog')) return;
        const overlay=document.createElement('div'); overlay.id='fly-retry-choice-dialog'; overlay.className='dialog-overlay';
        const box=document.createElement('div'); box.className='dialog-box compact-choice-box';
        box.innerHTML=`<h3>飞翔躲避失败 · 仍将受到 ${damage} 点伤害</h3>`;
        const list=document.createElement('div'); list.className='choice-list';
        const addBtn = (label, again) => {
            const btn=document.createElement('button'); btn.className='choice-row';
            btn.innerHTML=`<span>${label}</span>`;
            btn.addEventListener('click',async()=>{overlay.remove();await onChoose(again)});
            list.appendChild(btn);
        };
        if ((ch.fly || 0) > 0) addBtn(`继续使用 1 层飞翔躲避（剩余 ${ch.fly}）`, true);
        addBtn('不再躲避，承受伤害', false);
        box.appendChild(list);overlay.appendChild(box);document.body.appendChild(overlay);
    }
}

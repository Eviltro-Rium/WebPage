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
            { key: 'RED', label: '红', bg: '#ff1e28' },
            { key: 'YELLOW', label: '黄', bg: '#ffc300' },
            { key: 'BLUE', label: '蓝', bg: '#0082ff' },
            { key: 'GREEN', label: '绿', bg: '#00c83c' }
        ];
        for (const c of colors) {
            const btn = document.createElement('button');
            btn.className = 'color-choice-btn';
            btn.style.background = c.bg;
            btn.style.color = '#fff';
            btn.style.border = 'none';
            btn.style.borderRadius = '8px';
            btn.style.padding = '10px 20px';
            btn.style.fontSize = '1rem';
            btn.style.cursor = 'pointer';
            btn.style.fontWeight = 'bold';
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

    showPurifyChoice(ch, onChoose) {
        if (document.getElementById('purify-choice-dialog')) return;
        const overlay = document.createElement('div');
        overlay.id = 'purify-choice-dialog'; overlay.className = 'dialog-overlay';
        const box = document.createElement('div'); box.className = 'dialog-box compact-choice-box';
        box.innerHTML = '<h3>净化 · 选择移除一层 Buff</h3>';
        const choices = [];
        if (ch.burn > 0) choices.push(['burn', `灼烧 ×${ch.burn}`, 'burn']);
        if (ch.frozen) choices.push(['freeze', '冷冻', 'freeze']);
        if (ch.bleed > 0) choices.push(['bleed', `流血 ×${ch.bleed}`, 'bleed']);
        const list = document.createElement('div'); list.className = 'choice-list';
        for (const [kind,label,icon] of choices) {
            const btn = document.createElement('button'); btn.className = 'choice-row';
            btn.innerHTML = `<img src="icons/buff_icons/${icon}.png" alt=""><span>${label}</span>`;
            btn.addEventListener('click', async()=>{ overlay.remove(); await onChoose(kind); });
            list.appendChild(btn);
        }
        box.appendChild(list); overlay.appendChild(box); document.body.appendChild(overlay);
    }

    showSuperPurifyChoice(targets, onChoose) {
        if (document.getElementById('super-purify-choice-dialog')) return;
        const overlay = document.createElement('div');
        overlay.id = 'super-purify-choice-dialog'; overlay.className = 'dialog-overlay';
        const box = document.createElement('div'); box.className = 'dialog-box compact-choice-box';
        box.innerHTML = '<h3>超级净化 · 选择目标</h3>';
        const list = document.createElement('div'); list.className = 'choice-list';
        for (const t of targets) {
            const btn = document.createElement('button'); btn.className = 'choice-row';
            const buffs = [];
            if (t.ch.burn > 0) buffs.push(`灼烧×${t.ch.burn}`);
            if (t.ch.bleed > 0) buffs.push(`流血×${t.ch.bleed}`);
            if (t.ch.frozen) buffs.push('冷冻');
            if (t.ch.guard > 0) buffs.push(`守护×${t.ch.guard}`);
            const buffText = buffs.length ? buffs.join(' ') : '无buff';
            btn.innerHTML = `<span style="font-weight:700">${t.label}</span><span style="color:#aaa;font-size:0.85rem;margin-left:8px">${buffText}</span>`;
            btn.addEventListener('click', async () => { overlay.remove(); await onChoose(t.key); });
            list.appendChild(btn);
        }
        box.appendChild(list); overlay.appendChild(box); document.body.appendChild(overlay);
    }

    showGuardChoice(ch, damage, onChoose) {
        if (document.getElementById('guard-choice-dialog')) return;
        const overlay=document.createElement('div'); overlay.id='guard-choice-dialog'; overlay.className='dialog-overlay';
        const box=document.createElement('div'); box.className='dialog-box compact-choice-box';
        box.innerHTML=`<h3>守护 ×${ch.guard} · 即将受到 ${damage} 点伤害</h3>`;
        const list=document.createElement('div'); list.className='choice-list';
        const max=Math.min(ch.guard,damage);
        for(let i=0;i<=max;i++){
            const use=i,btn=document.createElement('button'); btn.className='choice-row';
            btn.innerHTML=`<img src="icons/buff_icons/guard.png" alt=""><span>${use===0?'不使用守护':`使用 ${use} 层（剩余伤害 ${damage-use}）`}</span>`;
            btn.addEventListener('click',async()=>{overlay.remove();await onChoose(use)});list.appendChild(btn);
        }
        box.appendChild(list);overlay.appendChild(box);document.body.appendChild(overlay);
    }
}

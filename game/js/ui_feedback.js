/*
 * Combat feedback adapter.
 *
 * This module owns presentation-only effects: target lane mapping, floating
 * text, hit flashes, screen shake and particles. Keeping these methods out of
 * ui.js makes new combat events easier to add without touching card rendering
 * or turn controls.
 */
(function (global) {
    const GameUI = global.GameUI;
    if (!GameUI) {
        console.error('[UI feedback] GameUI must be loaded first');
        return;
    }

    const proto = GameUI.prototype;

    proto._eventSide = function (who) {
        if (who === 'player') return 'player';
        if (who === 'ai2') return 'ai2';
        if (who === 'enemy' || who === 'ai') return 'ai';
        return who || 'ai';
    };

    proto._playHitFeedback = function (side, amount, color = 'rgba(255,60,60,0.86)') {
        amount = Math.max(0, Number(amount) || 0);
        if (!amount) return;
        side = this._eventSide(side);

        const isPlayer = side === 'player';
        this.shakeScreen(isPlayer ? Math.min(amount * 2, 10) : Math.min(amount, 6), isPlayer ? 300 : 220);

        const hpSection = document.getElementById(`${side}-hp-section`);
        if (!hpSection) return;
        hpSection.classList.remove('combatant-hit');
        void hpSection.offsetWidth;
        hpSection.classList.add('combatant-hit');
        hpSection.addEventListener('animationend', () => hpSection.classList.remove('combatant-hit'), { once: true });

        const rect = hpSection.getBoundingClientRect();
        this.burstParticles(
            rect.left + rect.width / 2,
            rect.top + rect.height / 2,
            color,
            Math.min(amount * 3, 20)
        );
    };

    proto.playFloatingText = function (text, color, target) {
        target = target === 'player' || target === 'ai2' ? target : 'ai';
        const layouts = [
            { x: 0, y: 0 },
            { x: -48, y: -28 },
            { x: 48, y: -28 },
            { x: -68, y: -58 },
            { x: 68, y: -58 },
            { x: 0, y: -86 }
        ];
        const active = (this._floatingTextLanes[target] || []).filter(entry => entry.el.isConnected);
        this._floatingTextLanes[target] = active;
        if (active.length >= layouts.length) {
            const oldest = active.shift();
            if (oldest && oldest.el) oldest.el.remove();
        }
        const used = new Set(active.map(entry => entry.lane));
        const lane = layouts.findIndex((_, index) => !used.has(index));
        const layout = layouts[Math.max(0, lane)];

        const el = document.createElement('div');
        el.className = 'floating-text';
        el.dataset.target = target;
        el.dataset.lane = String(lane);
        const segs = parseSegments(text, color);
        for (const seg of segs) {
            const span = document.createElement('span');
            span.className = 'ft-seg'; span.textContent = seg.text;
            span.style.color = seg.color; span.style.textShadow = '0 1px 3px rgba(0,0,0,0.3)';
            el.appendChild(span);
        }
        const hpId = target === 'player' ? 'player-hp-section' : target === 'ai2' ? 'ai2-hp-section' : 'ai-hp-section';
        const hpSection = document.getElementById(hpId);
        if (!hpSection) return;
        const rect = hpSection.getBoundingClientRect();
        const laneY = rect.top < 150 ? Math.abs(layout.y) : layout.y;
        const centerX = rect.left + rect.width / 2 + layout.x;
        const top = Math.max(12, Math.min(window.innerHeight - 72, rect.top + rect.height / 2 - 14 + laneY));
        el.style.left = Math.max(72, Math.min(window.innerWidth - 72, centerX)) + 'px';
        el.style.top = top + 'px';
        el.style.setProperty('--float-drift-x', `${layout.x === 0 ? 0 : layout.x > 0 ? 12 : -12}px`);
        document.body.appendChild(el);
        active.push({ el, lane });
        setTimeout(() => {
            el.remove();
            this._floatingTextLanes[target] = (this._floatingTextLanes[target] || [])
                .filter(entry => entry.el !== el && entry.el.isConnected);
        }, 1850);
    };

    proto.shakeScreen = function (intensity, duration) {
        const container = document.getElementById('game-container');
        if (!container) return;
        if (this._shakeTimer) cancelAnimationFrame(this._shakeTimer);
        const start = performance.now();
        const dur = duration || 300;
        const int = intensity || 5;
        const tick = (now) => {
            const elapsed = now - start;
            if (elapsed >= dur) { container.style.transform = ''; this._shakeTimer = null; return; }
            const decay = 1 - elapsed / dur;
            const dx = (Math.random() - 0.5) * 2 * int * decay;
            const dy = (Math.random() - 0.5) * 2 * int * decay;
            container.style.transform = `translate(${dx}px, ${dy}px)`;
            this._shakeTimer = requestAnimationFrame(tick);
        };
        this._shakeTimer = requestAnimationFrame(tick);
    };

    proto.burstParticles = function (x, y, color, count) {
        const particles = [];
        for (let i = 0; i < (count || 12); i++) {
            const angle = (Math.PI * 2 * i) / (count || 12) + (Math.random() - 0.5) * 0.5;
            const speed = 40 + Math.random() * 80;
            const size = 3 + Math.random() * 4;
            const el = document.createElement('div');
            el.className = 'burst-particle';
            el.style.left = x + 'px'; el.style.top = y + 'px';
            el.style.width = size + 'px'; el.style.height = size + 'px';
            el.style.background = color;
            el.style.boxShadow = `0 0 ${size * 2}px ${color}`;
            document.body.appendChild(el);
            particles.push({ el, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life: 1 });
        }
        const start = performance.now();
        const dur = 600;
        const tick = (now) => {
            const dt = (now - start) / dur;
            if (dt >= 1) { particles.forEach(p => p.el.remove()); return; }
            for (const p of particles) {
                const px = parseFloat(p.el.style.left) + p.vx * 0.016;
                const py = parseFloat(p.el.style.top) + p.vy * 0.016;
                p.vy += 120 * 0.016; p.life = 1 - dt;
                p.el.style.left = px + 'px'; p.el.style.top = py + 'px';
                p.el.style.opacity = p.life; p.el.style.transform = `scale(${p.life})`;
            }
            requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
    };
})(window);

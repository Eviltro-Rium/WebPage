/* Ambient background particles for the home screen. */
(function (global) {
    const GameUI = global.GameUI;
    if (!GameUI) {
        console.error('[UI particles] GameUI must be loaded first');
        return;
    }
    const random = () => global.FurryGame && global.FurryGame.CombatRuntime
        ? global.FurryGame.CombatRuntime.random() : Math.random();
    Object.assign(GameUI.prototype, {
        _initParticles() {
            // Online/home screens can be mounted more than once. Reuse the
            // existing canvas instead of creating a second animation loop.
            if (document.getElementById('particles-canvas')) return;
            const canvas = document.createElement('canvas');
            canvas.id = 'particles-canvas';
            document.body.prepend(canvas);
            const ctx = canvas.getContext('2d');
            const particles = [];
            for (let i = 0; i < 15; i++) {
                particles.push({ x: random() * 1200, y: random() * 800,
                    size: 2 + random() * 3, phase: random() * 360, speed: 0.5 + random() * 1.5 });
            }
            let width = 0, height = 0, raf = 0, running = true;
            const resize = () => {
                width = Math.max(1, window.innerWidth || document.documentElement.clientWidth || 1);
                height = Math.max(1, window.innerHeight || document.documentElement.clientHeight || 1);
                // Resizing the backing store clears the canvas, so only do it
                // when the viewport actually changed.
                if (canvas.width !== width || canvas.height !== height) {
                    canvas.width = width; canvas.height = height;
                }
            };
            const frame = () => {
                if (!running) return;
                const now = Date.now(); ctx.clearRect(0, 0, width, height);
                for (const p of particles) {
                    const px = (p.x + now / 40 * p.speed) % (width + 40) - 20;
                    const py = (p.y + Math.sin(now / 2000 + p.phase) * 15) % height;
                    const alpha = 0.06 + 0.04 * Math.sin(now / 1500 + p.phase);
                    ctx.fillStyle = `rgba(255,255,255,${alpha})`;
                    ctx.beginPath(); ctx.arc(px, py, p.size, 0, Math.PI * 2); ctx.fill();
                }
                raf = requestAnimationFrame(frame);
            };
            const onVisibility = () => {
                running = document.visibilityState !== 'hidden';
                if (running && !raf) { resize(); frame(); }
            };
            resize();
            window.addEventListener('resize', resize, { passive: true });
            document.addEventListener('visibilitychange', onVisibility);
            canvas._stopParticles = () => {
                running = false;
                if (raf) cancelAnimationFrame(raf);
                raf = 0;
                window.removeEventListener('resize', resize);
                document.removeEventListener('visibilitychange', onVisibility);
            };
            if (running) frame();
        }
    });
})(window);

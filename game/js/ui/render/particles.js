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
            const canvas = document.createElement('canvas');
            canvas.id = 'particles-canvas';
            document.body.prepend(canvas);
            const ctx = canvas.getContext('2d');
            const particles = [];
            for (let i = 0; i < 15; i++) {
                particles.push({ x: random() * 1200, y: random() * 800,
                    size: 2 + random() * 3, phase: random() * 360, speed: 0.5 + random() * 1.5 });
            }
            function animate() {
                canvas.width = window.innerWidth; canvas.height = window.innerHeight;
                const now = Date.now(); ctx.clearRect(0, 0, canvas.width, canvas.height);
                for (const p of particles) {
                    const px = (p.x + now / 40 * p.speed) % (canvas.width + 40) - 20;
                    const py = (p.y + Math.sin(now / 2000 + p.phase) * 15) % canvas.height;
                    const alpha = 0.06 + 0.04 * Math.sin(now / 1500 + p.phase);
                    ctx.fillStyle = `rgba(255,255,255,${alpha})`;
                    ctx.beginPath(); ctx.arc(px, py, p.size, 0, Math.PI * 2); ctx.fill();
                }
                requestAnimationFrame(animate);
            }
            animate();
        }
    });
})(window);

/* 主页相册控制与一次性入场，不依赖 WebGL 或外部库。 */
(function () {
  'use strict';
  document.querySelectorAll('[data-gallery-protect]').forEach(function (root) {
    root.addEventListener('contextmenu', function (event) { event.preventDefault(); });
    root.addEventListener('dragstart', function (event) { event.preventDefault(); });
  });

  var gallery = document.querySelector('.gallery-cylinder');
  var toggle = document.querySelector('.home-gallery-toggle');
  var reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  function pauseGallery(paused) {
    if (!gallery || !toggle) return;
    gallery.classList.toggle('is-paused', paused);
    toggle.setAttribute('aria-pressed', String(paused));
    toggle.textContent = paused ? '播放相册' : '暂停相册';
  }
  if (toggle && gallery) {
    pauseGallery(reducedMotion.matches);
    toggle.addEventListener('click', function () {
      gallery.classList.add('user-started');
      pauseGallery(!gallery.classList.contains('is-paused'));
    });
  }

  // 内容默认可见；不支持观察器或减少动态效果时，保持完整静态页面。
  if (reducedMotion.matches || !('IntersectionObserver' in window)) return;
  var observer = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('home-reveal');
      observer.unobserve(entry.target);
    });
  }, { threshold: 0.08 });
  document.querySelectorAll('.section-title, .home-work, .section-content > p, .contact-list li, .thanks-subtitle').forEach(function (element, index) {
    element.style.setProperty('--home-delay', (index % 3) * 65 + 'ms');
    observer.observe(element);
  });
})();

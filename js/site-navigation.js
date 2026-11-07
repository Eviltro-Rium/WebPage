/* 静态页面共用背景宿主；正文使用独立文档，保留原页脚本生命周期。 */
(function () {
  'use strict';
  var pages = ['index.html', 'projects.html', 'materials.html', 'launchpad.html', 'guestbook.html'];
  var current = new URL(location.href);
  // Cloudflare / Pages 会将 foo.html 规范化为 foo，首页规范化为目录根。
  function pageName(url) {
    var name = url.pathname.split('/').pop() || 'index.html';
    return name.includes('.') ? name : name + '.html';
  }
  function sameView(left, right) {
    try {
      var a = new URL(left), b = new URL(right);
      return a.origin === b.origin && new URL('.', a).pathname === new URL('.', b).pathname &&
        pageName(a) === pageName(b) && a.search === b.search && a.hash === b.hash;
    } catch (error) { return false; }
  }
  var filename = pageName(current);
  var inView = window.parent !== window && window.name === 'rium-site-content';
  if (inView) {
    window.RiumSiteView = true;
    document.documentElement.classList.add('shared-background-view');
    document.addEventListener('rium-theme-transition', function (event) {
      parent.postMessage({ type: 'rium-theme-transition', detail: event.detail }, '*');
    });
    document.addEventListener('rium-theme-change', function (event) {
      parent.postMessage({ type: 'rium-theme-change', detail: event.detail }, '*');
    });
    document.addEventListener('DOMContentLoaded', function () {
      document.dispatchEvent(new CustomEvent('rium-scene-ready'));
      parent.postMessage({
        type: 'rium-view-ready', url: location.href, title: document.title,
        theme: document.documentElement.getAttribute('data-theme')
      }, '*');
    });
    // 导航在文档解析时就可用，不等待字体、播放器等资源完成。
    document.addEventListener('click', function (event) {
        var link = event.target.closest && event.target.closest('a[href]');
        if (!link || event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || link.hasAttribute('download') || (link.target && link.target !== '_self')) return;
        var url = new URL(link.href, location.href);
        if (url.pathname === location.pathname && url.hash && url.search === location.search) return;
        if (url.origin === current.origin && url.pathname.slice(0, url.pathname.lastIndexOf('/')) === current.pathname.slice(0, current.pathname.lastIndexOf('/')) && pages.includes(pageName(url))) {
          event.preventDefault();
          parent.postMessage({ type: 'rium-navigate', url: url.href }, '*');
        } else { link.target = '_top'; }
    });
    return;
  }
  if (pages.includes(filename)) {
    var host = new URL('site-shell.html', current);
    host.searchParams.set('view', current.href);
    location.replace(host.href);
    return;
  }
  if (filename !== 'site-shell.html') return;
  document.addEventListener('DOMContentLoaded', function () {
    var frame = document.getElementById('site-content');
    var base = new URL('.', current);
    function allowed(url) {
      return url.origin === base.origin && new URL('.', url).pathname === base.pathname && pages.includes(pageName(url));
    }
    var desiredHref = null;
    var pendingHref = null;
    var leaveTimer = 0;
    var recoveryTimer = 0;
    var enterTimer = 0;
    var generation = 0;
    var reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    function reveal() {
      window.clearTimeout(recoveryTimer);
      frame.classList.remove('is-leaving', 'is-loading');
      frame.removeAttribute('aria-busy');
      if (!reducedMotion.matches) {
        frame.classList.add('is-entering');
        enterTimer = window.setTimeout(function () { frame.classList.remove('is-entering'); }, 360);
      }
    }
    function load(url, historyMode) {
      if (!allowed(url) || sameView(url.href, desiredHref)) return;
      var first = desiredHref === null;
      desiredHref = url.href;
      var request = ++generation;
      window.clearTimeout(leaveTimer);
      window.clearTimeout(recoveryTimer);
      window.clearTimeout(enterTimer);
      frame.classList.remove('is-entering');
      if (!first && !reducedMotion.matches) frame.classList.add('is-leaving');
      frame.setAttribute('aria-busy', 'true');
      // 退场期间连续点击只保留最后一个目的地，不加载中间页。
      leaveTimer = window.setTimeout(function () {
        if (request !== generation) return;
        pendingHref = url.href;
        frame.classList.add('is-loading');
        frame.src = url.href;
        if (historyMode) {
          try { history[historyMode]({ riumView: url.href }, '', url.href); }
          catch (error) { history[historyMode]({ riumView: url.href }, '', '#page=' + encodeURIComponent(url.href)); }
        }
        // 网络失败不能永久把正文留在透明状态。
        recoveryTimer = window.setTimeout(function () {
          if (request === generation) reveal();
        }, 8000);
      }, first || reducedMotion.matches ? 0 : 140);
    }
    var initial;
    try { initial = new URL((current.hash.startsWith('#page=') ? decodeURIComponent(current.hash.slice(6)) : current.searchParams.get('view')) || 'index.html', base); } catch (error) { initial = new URL('index.html', base); }
    if (!allowed(initial)) initial = new URL('index.html', base);
    load(initial, 'replaceState');
    window.addEventListener('message', function (event) {
      if (event.source !== frame.contentWindow || !event.data) return;
      var data = event.data;
      if (data.type === 'rium-view-ready') {
        if (sameView(data.url, pendingHref) && sameView(data.url, desiredHref)) {
          // file:// 下宿主和正文可能读取各自的存储，以即将显示的正文为准。
          if ((data.theme === 'light' || data.theme === 'dark') &&
              (document.documentElement.dataset.theme !== data.theme ||
               document.documentElement.classList.contains('theme-animating'))) {
            document.documentElement.dataset.theme = data.theme;
            document.documentElement.classList.remove('theme-animating');
            document.dispatchEvent(new CustomEvent('rium-theme-change', { detail: { theme: data.theme } }));
          }
          if (typeof data.title === 'string') document.title = data.title;
          reveal();
        }
      } else if (data.type === 'rium-navigate') {
        try { load(new URL(data.url), 'pushState'); } catch (error) { /* 无效导航保留当前页。 */ }
      } else if (data.type === 'rium-theme-transition' || data.type === 'rium-theme-change') {
        var detail = data.detail || {};
        var theme = data.type === 'rium-theme-transition' ? detail.to : detail.theme;
        if (theme === 'light' || theme === 'dark') {
          document.documentElement.setAttribute('data-theme', theme);
          if (data.type === 'rium-theme-transition') {
            document.documentElement.classList.add('theme-animating');
          } else {
            document.documentElement.classList.remove('theme-animating');
          }
          document.dispatchEvent(new CustomEvent(data.type, { detail: detail }));
        }
      }
    });
    frame.addEventListener('load', function () {
      try { document.title = frame.contentDocument.title; } catch (error) { /* file:// 下标题沿用宿主。 */ }
    });
    window.addEventListener('popstate', function (event) {
      try { load(new URL(event.state && event.state.riumView || location.href), null); } catch (error) { /* 保留当前页。 */ }
    });
  });
})();

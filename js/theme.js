(function () {
  "use strict";

  var STORAGE_KEY = "rium-theme";
  var TRANSITION_MS = 1500;
  var transitionRaf = 0;

  function getTheme() {
    return document.documentElement.getAttribute("data-theme") === "dark"
      ? "dark"
      : "light";
  }

  function readSavedTheme() {
    try {
      return window.localStorage.getItem(STORAGE_KEY);
    } catch (e) {
      return null;
    }
  }

  function saveTheme(theme) {
    try {
      window.localStorage.setItem(STORAGE_KEY, theme);
    } catch (e) {
      /* Storage can be unavailable in private browsing. */
    }
  }

  function setThemeAttribute(theme) {
    var normalized = theme === "dark" ? "dark" : "light";
    document.documentElement.setAttribute("data-theme", normalized);
    document.documentElement.style.colorScheme = normalized;
  }

  function syncGiscusTheme(theme) {
    var frame = document.querySelector("iframe.giscus-frame");
    if (!frame || !frame.contentWindow) return;
    frame.contentWindow.postMessage(
      {
        giscus: {
          setConfig: {
            theme: theme === "dark" ? "dark" : "light_high_contrast"
          }
        }
      },
      "https://giscus.app"
    );
  }

  function updateThemeToggleUI(theme) {
    var isDark = theme === "dark";
    var buttons = document.querySelectorAll("[data-theme-toggle]");
    Array.prototype.forEach.call(buttons, function (button) {
      var icon = button.querySelector(".theme-toggle-icon");
      var label = button.querySelector(".theme-toggle-label");
      button.setAttribute("aria-label", isDark ? "切换至浅色主题" : "切换至深色主题");
      button.setAttribute("title", isDark ? "切换至浅色主题" : "切换至深色主题");
      button.setAttribute("aria-pressed", String(isDark));
      if (icon) icon.textContent = isDark ? "☀️" : "🌙";
      if (label) label.textContent = isDark ? "浅色" : "深色";
    });
    syncGiscusTheme(theme);
  }

  function setThemeToggleDisabled(disabled) {
    var buttons = document.querySelectorAll("[data-theme-toggle]");
    Array.prototype.forEach.call(buttons, function (button) {
      button.disabled = disabled;
    });
  }

  function easeInOutSine(t) {
    return -(Math.cos(Math.PI * t) - 1) / 2;
  }

  function dispatchTransition(from, to, progress) {
    document.dispatchEvent(new CustomEvent("rium-theme-transition", {
      detail: { from: from, to: to, progress: progress }
    }));
  }

  function dispatchThemeChange(theme) {
    document.dispatchEvent(new CustomEvent("rium-theme-change", {
      detail: { theme: theme }
    }));
  }

  function animateTheme(from, to) {
    cancelAnimationFrame(transitionRaf);
    var root = document.documentElement;
    root.classList.add("theme-animating");
    setThemeAttribute(to);
    updateThemeToggleUI(to);
    setThemeToggleDisabled(true);

    var started = performance.now();
    function step(now) {
      var raw = Math.min((now - started) / TRANSITION_MS, 1);
      dispatchTransition(from, to, easeInOutSine(raw));
      if (raw < 1) {
        transitionRaf = requestAnimationFrame(step);
        return;
      }
      root.classList.remove("theme-animating");
      saveTheme(to);
      setThemeToggleDisabled(false);
      dispatchThemeChange(to);
    }

    transitionRaf = requestAnimationFrame(step);
  }

  function applyTheme(theme, animated) {
    var next = theme === "dark" ? "dark" : "light";
    var current = getTheme();
    if (current === next) {
      updateThemeToggleUI(next);
      return next;
    }
    if (animated && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      animateTheme(current, next);
      return next;
    }
    cancelAnimationFrame(transitionRaf);
    document.documentElement.classList.remove("theme-animating");
    setThemeAttribute(next);
    saveTheme(next);
    updateThemeToggleUI(next);
    dispatchThemeChange(next);
    return next;
  }

  function toggleTheme() {
    return applyTheme(getTheme() === "dark" ? "light" : "dark", true);
  }

  function init() {
    var saved = readSavedTheme();
    if (saved === "dark" || saved === "light") {
      setThemeAttribute(saved);
    } else {
      setThemeAttribute(getTheme());
    }
    updateThemeToggleUI(getTheme());
    window.setTimeout(function () {
      syncGiscusTheme(getTheme());
    }, 600);

    var buttons = document.querySelectorAll("[data-theme-toggle]");
    Array.prototype.forEach.call(buttons, function (button) {
      button.addEventListener("click", toggleTheme);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();

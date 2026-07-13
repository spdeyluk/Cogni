// Clear segmented picker: one glass indicator that slides between options.
// The indicator is positioned instantly so it never flies in on page mount,
// refresh, or WebView restore.
(() => {
  const CONTAINERS = [
    ".nback-preset-row",
    ".rrt-preset-row",
    ".time-preset-row",
    ".interval-presets",
    ".profile-view-switch",
    ".profile-timeframe-control",
    ".leaderboard-timeframe-switch"
  ].join(", ");

  function setVars(el, rect) {
    el.style.setProperty("--seg-x", `${rect.x}px`);
    el.style.setProperty("--seg-y", `${rect.y}px`);
    el.style.setProperty("--seg-w", `${rect.w}px`);
    el.style.setProperty("--seg-h", `${rect.h}px`);
  }

  function setVarsWithoutMotion(el, rect) {
    el.style.setProperty("--seg-anim", "none");
    setVars(el, rect);
  }

  function sync(container) {
    // Only single-select rows get the sliding pill; multi-select rows keep
    // their per-button highlight.
    const actives = container.querySelectorAll(":scope > button.active, :scope > button[aria-pressed='true']");
    if (actives.length !== 1 || !actives[0].offsetWidth) {
      container.classList.remove("seg-sliding");
      delete container.dataset.segReady;
      return;
    }
    const active = actives[0];
    const target = {
      x: active.offsetLeft,
      y: active.offsetTop,
      w: active.offsetWidth,
      h: active.offsetHeight
    };
    const activeKey = [...container.children].indexOf(active);
    container.classList.add("seg-sliding");
    if (!container.dataset.segReady) {
      setVarsWithoutMotion(container, target);
      container.dataset.segReady = "1";
    } else if (container.dataset.segActiveKey === String(activeKey)) {
      setVarsWithoutMotion(container, target);
    } else {
      setVarsWithoutMotion(container, target);
    }
    container.dataset.segActiveKey = String(activeKey);
  }

  let queued = false;
  function queueSync() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      document.querySelectorAll(CONTAINERS).forEach(sync);
    });
  }

  new MutationObserver(queueSync).observe(document.documentElement, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ["class", "aria-pressed"]
  });
  window.addEventListener("resize", queueSync);
  window.addEventListener("load", queueSync);
  if (document.fonts?.ready) document.fonts.ready.then(queueSync);
  queueSync();
})();

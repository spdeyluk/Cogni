// One-time local data reset: wipes all Cogni app state (profile, progress,
// coins, quests) the first time a build with a new RESET_TOKEN launches, so
// the app starts as a brand-new user. Bump RESET_TOKEN to trigger another
// reset; leave it alone otherwise.
(() => {
  var RESET_TOKEN = "20260710-new-user";
  var MARKER_KEY = "cogni.localDataResetToken";
  try {
    if (localStorage.getItem(MARKER_KEY) === RESET_TOKEN) return;
    var keys = [];
    for (var i = 0; i < localStorage.length; i += 1) keys.push(localStorage.key(i));
    keys.forEach(function (key) {
      if (key.indexOf("cogni.") === 0 || key.indexOf("brainer.") === 0) {
        localStorage.removeItem(key);
      }
    });
    sessionStorage.clear();
    localStorage.setItem(MARKER_KEY, RESET_TOKEN);
  } catch (error) {
    // Storage unavailable; nothing to reset.
  }
})();

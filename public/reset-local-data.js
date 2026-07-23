// One-time local data reset: wipes all Cogni app state (profile, progress,
// coins, quests) the first time a build with a new RESET_TOKEN launches, so
// the app starts as a brand-new user. Bump RESET_TOKEN to trigger another
// reset; leave it alone otherwise.
(() => {
  var RESET_TOKEN = "20260723-ob-v3-test3";
  var MARKER_KEY = "cogni.localDataResetToken";
  // Carry any device data left under the temporary "mindcare." key prefix
  // back to "cogni." before anything reads or resets it.
  try {
    for (var m = localStorage.length - 1; m >= 0; m -= 1) {
      var oldKey = localStorage.key(m);
      if (oldKey && oldKey.indexOf("mindcare.") === 0) {
        var newKey = "cogni." + oldKey.slice(9);
        if (localStorage.getItem(newKey) === null) {
          localStorage.setItem(newKey, localStorage.getItem(oldKey));
        }
        localStorage.removeItem(oldKey);
      }
    }
  } catch (error) {
    // Storage unavailable; nothing to migrate.
  }
  try {
    if (localStorage.getItem(MARKER_KEY) === RESET_TOKEN) return;
    var keys = [];
    for (var i = 0; i < localStorage.length; i += 1) keys.push(localStorage.key(i));
    keys.forEach(function (key) {
      if (key.indexOf("cogni.") === 0 || key.indexOf("mindcare.") === 0 || key.indexOf("brainer.") === 0) {
        localStorage.removeItem(key);
      }
    });
    sessionStorage.clear();
    localStorage.setItem(MARKER_KEY, RESET_TOKEN);
  } catch (error) {
    // Storage unavailable; nothing to reset.
  }
})();

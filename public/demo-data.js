// DEV ONLY: seeds fake training history (calendar days, sessions, XP) so the
// profile calendar and improvement graphs have something to show. Seeds once
// per SEED_TOKEN and only on top of empty progress; delete this file and its
// script tag in index.html to ship without demo data.
(() => {
  var SEED_TOKEN = "20260712-demo-v2";
  var MARKER_KEY = "cogni.demoDataSeedToken";
  var PROGRESS_KEY = "brainer.exerciseProgress.v1";
  var XP_KEY = "cogni.xpProgress.v1";
  try {
    if (localStorage.getItem(MARKER_KEY) === SEED_TOKEN) return;
    var existing = JSON.parse(localStorage.getItem(PROGRESS_KEY) || "null");
    var hasSessions = Boolean(existing && existing.sessions && existing.sessions.length);
    var isDemoData = hasSessions && String(existing.sessions[0].id || "").indexOf("demo-") === 0;
    // Real training data is never overwritten; stale demo seeds are refreshed.
    if (hasSessions && !isDemoData) {
      localStorage.setItem(MARKER_KEY, SEED_TOKEN);
      return;
    }

    function dateKey(date) {
      var year = date.getFullYear();
      var month = String(date.getMonth() + 1).padStart(2, "0");
      var day = String(date.getDate()).padStart(2, "0");
      return year + "-" + month + "-" + day;
    }

    var exerciseIds = ["nback", "rrt", "cct", "ict"];
    var days = {};
    var sessions = [];

    // Last ~4 months: mostly trained with rest days sprinkled in, sparser in
    // the oldest weeks, always trained over the last 5 days so a streak shows.
    var specs = [];
    for (var offset = 111; offset >= 0; offset -= 1) {
      var rest = offset > 4 && (offset % 9 === 2 || offset % 7 === 5 || (offset > 70 && offset % 3 === 0));
      specs.push({ offset: offset, minutes: rest ? 0 : 6 + ((offset * 13) % 26) });
    }
    var trained = specs.filter(function (spec) { return spec.minutes > 0; });

    trained.forEach(function (spec, index) {
      var date = new Date();
      date.setDate(date.getDate() - spec.offset);
      var key = dateKey(date);
      var t = index / Math.max(1, trained.length - 1); // 0 oldest -> 1 newest
      var first = exerciseIds[index % exerciseIds.length];
      var second = exerciseIds[(index + 1) % exerciseIds.length];
      var perDay = {};
      perDay[first] = { durationMs: Math.round(spec.minutes * 0.6 * 60000) };
      perDay[second] = { durationMs: Math.round(spec.minutes * 0.4 * 60000) };
      days[key] = perDay;

      var sessionsForDay = spec.minutes >= 20 ? 2 : 1;
      for (var s = 0; s < sessionsForDay; s += 1) {
        var wobble = ((index * 7 + s * 3) % 10) / 100; // deterministic jitter
        var overall = Math.min(0.9, 0.3 + t * 0.45 + wobble / 2);
        var startedAt = new Date(date);
        startedAt.setHours(18 + s, 12, 0, 0);
        var endedAt = new Date(startedAt.getTime() + Math.round((spec.minutes / sessionsForDay) * 60000));
        sessions.push({
          id: "demo-" + key + "-" + s,
          exerciseId: s === 0 ? first : second,
          status: "completed",
          completedTrials: 18 + ((index + s) % 3) * 6,
          durationMs: Math.round((spec.minutes / sessionsForDay) * 60000),
          rawAccuracy: Math.min(0.97, 0.55 + t * 0.35 + wobble - 0.045),
          avgAnswerSpeedMs: Math.round(1500 - t * 550 + wobble * 700),
          difficultyWeight: {
            overall: overall,
            factors: [
              { label: "Level", value: Math.min(1, overall * 1.1) },
              { label: "Pace", value: Math.max(0.1, overall * 0.8) },
              { label: "Distractors", value: Math.max(0.05, overall * 0.6) }
            ]
          },
          startedAt: startedAt.toISOString(),
          endedAt: endedAt.toISOString()
        });
      }
    });

    localStorage.setItem(PROGRESS_KEY, JSON.stringify({ days: days, sessions: sessions }));
    localStorage.setItem(XP_KEY, JSON.stringify({ totalXp: sessions.length * 55, events: [] }));
    localStorage.setItem(MARKER_KEY, SEED_TOKEN);
  } catch (error) {
    // Storage unavailable; skip demo data.
  }
})();

/**
 * Grain Godown — offline keeper (service worker)
 *
 * This small file is what lets the app open with no internet at all.
 * It keeps a copy of the app itself (and the Urdu font) on the phone.
 *
 * It never touches your Google Sheet: anything going to script.google.com
 * is left alone and goes straight to the internet, so saving and syncing
 * work exactly as before.
 *
 * When you upload a new index.html to GitHub, the phone picks it up by
 * itself the next time it is opened with internet.
 */

var VER = 'gg-1';
var CORE = ['./', './index.html', './manifest.json'];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(VER).then(function (c) {
      // one by one, so a missing file never breaks the whole thing
      return Promise.all(CORE.map(function (u) { return c.add(u).catch(function () { }); }));
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) { return k === VER ? null : caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

function isFont(u) { return u.host === 'fonts.googleapis.com' || u.host === 'fonts.gstatic.com'; }

// the app page: try the internet first (so a new version arrives), fall back to the saved copy
function pageFirst(req) {
  var saved = caches.match(req, { ignoreSearch: true });
  var live = fetch(req).then(function (res) {
    if (res && res.ok) { var copy = res.clone(); caches.open(VER).then(function (c) { c.put(req, copy); }); }
    return res;
  });
  return new Promise(function (resolve) {
    var done = false;
    function give(r) { if (!done && r) { done = true; resolve(r); } }
    // slow signal: don't make the shopkeeper wait, show the saved copy
    var slow = setTimeout(function () { saved.then(give); }, 3500);
    live.then(function (r) { clearTimeout(slow); give(r); }, function () {
      clearTimeout(slow);
      saved.then(function (r) {
        if (r) { give(r); return; }
        caches.match('./index.html').then(function (r2) {
          give(r2 || new Response(
            '<!doctype html><meta charset="utf-8"><body style="font-family:system-ui;padding:24px;line-height:1.6">' +
            'No internet, and this app is not saved on the phone yet.<br>Open it once with internet.</body>',
            { headers: { 'Content-Type': 'text/html; charset=utf-8' } }));
        });
      });
    });
  });
}

// icons, font files: use the saved copy at once, refresh it quietly in the background
function savedFirst(req) {
  return caches.match(req, { ignoreSearch: true }).then(function (hit) {
    var live = fetch(req).then(function (res) {
      if (res && (res.ok || res.type === 'opaque')) { var copy = res.clone(); caches.open(VER).then(function (c) { c.put(req, copy); }); }
      return res;
    });
    if (hit) { live.catch(function () { }); return hit; }
    return live.catch(function () { return hit; });
  });
}

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;                       // saving to the Sheet: never touched
  var u;
  try { u = new URL(req.url); } catch (err) { return; }
  var mine = u.origin === self.location.origin;
  if (!mine && !isFont(u)) return;                        // Google Sheet and everything else: straight through
  if (req.mode === 'navigate' || (mine && /(^|\/)(index\.html)?$/.test(u.pathname))) { e.respondWith(pageFirst(req)); return; }
  e.respondWith(savedFirst(req));
});

// The site moved to Cloudflare Pages. Old addresses (GitHub Pages, and a static-assets Worker
// created by mistake) forward to the new one, keeping the in-app route (#/play/…).
(function () {
  var NEW = 'https://jev-game-theory-arena.pages.dev/';
  var old = ['ouchengliu.github.io', 'jev-game-theory-arena.avasarff-westing.workers.dev'];
  if (old.indexOf(location.hostname) !== -1) location.replace(NEW + location.hash);
})();

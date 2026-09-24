// Deployment configuration. Safe to commit: it contains NO secrets.
// The Jev API key lives only inside the Cloudflare Worker (see /worker).
export const CONFIG = {
  // e.g. 'https://jev-game-theory-proxy.<your-subdomain>.workers.dev/decide'
  // Leave empty to run fully offline with the built-in bots.
  proxyUrl: '',
  // Cloudflare Turnstile site key (public). Leave empty to disable the human check.
  turnstileSiteKey: '',
  requestTimeoutMs: 8000,
  repoUrl: 'https://github.com/your-name/jev-game-theory',
};

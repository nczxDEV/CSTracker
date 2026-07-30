export default () => ({
  port: parseInt(process.env.PORT || '3000', 10),
  // Only bind the server to localhost (not the LAN) - see main.ts.
  host: process.env.HOST || '127.0.0.1',
  faceit: {
    apiKey: process.env.FACEIT_API_KEY,
    baseUrl: process.env.FACEIT_API_BASE_URL || 'https://open.faceit.com/data/v4',
  },
  steam: {
    apiKey: process.env.STEAM_API_KEY,
    baseUrl: process.env.STEAM_API_BASE_URL || 'https://api.steampowered.com',
  },
  leetify: {
    // Official Leetify Public CS API (api-public-docs.cs-prod.leetify.com)
    // - obtain a key at leetify.com/app/developer, set via the Setup
    // Wizard (Control Panel) or LEETIFY_API_KEY below. The base URL
    // defaults to Leetify's real, official endpoint - no longer a
    // feature-flagged stub (see LeetifyClient for the Developer
    // Guidelines this integration follows: "Data Provided by Leetify"
    // attribution required everywhere Leetify data is shown, metrics
    // shown exactly as returned/never rescaled, no data retention).
    apiKey: process.env.LEETIFY_API_KEY || undefined,
    baseUrl: process.env.LEETIFY_API_BASE_URL || 'https://api-public.cs-prod.leetify.com',
  },
  // "Bejelentkezés FACEIT-tel" (AuthModule / FaceitOAuthService) - FACEIT
  // Connect OAuth2 (Authorization Code + PKCE), a SEPARATE identity
  // service from the FACEIT Data API above (different credentials,
  // different base domain). Unlike `faecit.apiKey` (each END USER's own
  // personal Data API key, entered via the Setup Wizard), these
  // clientId/clientSecret belong to the CS Tracker APP ITSELF (created
  // once, in the FACEIT Developer Portal's App Studio -> OAuth2 Clients
  // section) and ship baked into the app's own `.env` - never entered by
  // the end user.
  faceitOAuth: {
    clientId: process.env.FACEIT_OAUTH_CLIENT_ID || undefined,
    clientSecret: process.env.FACEIT_OAUTH_CLIENT_SECRET || undefined,
    // Must exactly match the Redirect URI registered on the FACEIT
    // OAuth2 Client. If a public HTTPS passthrough is used (FACEIT
    // requires an https:// redirect URI, even during local development -
    // see BUILD.md "FACEIT OAuth setup" for the redirectmeto.com-based
    // workaround and how to replace it with a self-hosted one before
    // shipping), this is the PUBLIC (https) URL registered with FACEIT,
    // not the local backend's own callback path.
    redirectUri: process.env.FACEIT_OAUTH_REDIRECT_URI || undefined,
    authorizeUrl: process.env.FACEIT_OAUTH_AUTHORIZE_URL || 'https://accounts.faceit.com/oauth/authorize',
    tokenUrl: process.env.FACEIT_OAUTH_TOKEN_URL || 'https://api.faceit.com/auth/v1/oauth/token',
    userInfoUrl: process.env.FACEIT_OAUTH_USERINFO_URL || 'https://api.faceit.com/auth/v1/resources/userinfo',
  },
  database: {
    // Single SQLite file for the notes / saved-players / settings tables
    // (previously separate JSON files without file locking - see DatabaseModule).
    path: process.env.DATABASE_PATH || './data/app.db',
  },
  cache: {
    ttlSeconds: parseInt(process.env.CACHE_TTL_SECONDS || '600', 10),
    redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
  },
  rateLimit: {
    ttlSeconds: parseInt(process.env.RATE_LIMIT_TTL_SECONDS || '60', 10),
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '30', 10),
  },
  cors: {
    // Comma-separated list - by default only the Tauri client's typical
    // origins are allowed, we do NOT open this up to arbitrary sites.
    allowedOrigins: (
      process.env.CORS_ALLOWED_ORIGINS ||
      // IMPORTANT: the packaged (production) Tauri v2 webview does NOT load
      // the UI from `http://localhost` - it uses a custom internal origin
      // that differs per OS:
      //   - Windows: `https://tauri.localhost` (secure context by default;
      //     `http://tauri.localhost` only if `dangerousUseHttpScheme` is set)
      //   - macOS / Linux: `tauri://localhost`
      // If these origins are missing from this list, EVERY request the
      // Control Panel makes to this backend is blocked by the browser as a
      // CORS violation, which the UI shows as "backend unreachable" even
      // though the backend is actually running. The `http://localhost:*`
      // entries only cover `tauri dev` when a dev server is used.
      'tauri://localhost,https://tauri.localhost,http://tauri.localhost,http://localhost:1420,http://localhost:5173,http://localhost:3000'
    )
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  },
});

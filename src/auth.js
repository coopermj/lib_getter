const cookieSession = require('cookie-session');

const isProduction = process.env.NODE_ENV === 'production';
if (isProduction && !process.env.SESSION_SECRET) {
  throw new Error('SESSION_SECRET must be set in production');
}

const sessionMiddleware = cookieSession({
  name: 'session',
  secret: process.env.SESSION_SECRET || 'dev-secret',
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  secure: isProduction,
  httpOnly: true,
  sameSite: 'lax', // blocks cross-site POSTs from carrying the session (CSRF)
});

function requireAuth(req, res, next) {
  if (req.session && req.session.authenticated) return next();
  // Background fetch() calls identify themselves; answer them with 401 instead of a redirect
  if (req.get('X-Requested-With') === 'fetch') return res.status(401).send('Session expired');
  res.redirect('/login');
}

// ── Login rate limiting ───────────────────────────────────────────────────────
// A single shared password on the public internet needs brute-force protection.
// Per-IP sliding window kept in memory; fine for a single-instance app.

const LOGIN_MAX_ATTEMPTS = Number(process.env.LOGIN_MAX_ATTEMPTS) || 10;
const LOGIN_WINDOW_MS    = (Number(process.env.LOGIN_WINDOW_MINUTES) || 15) * 60 * 1000;
const attempts = new Map(); // ip → [timestamps]

function loginRateLimit(req, res, next) {
  const now  = Date.now();
  const list = (attempts.get(req.ip) || []).filter(t => now - t < LOGIN_WINDOW_MS);
  if (list.length >= LOGIN_MAX_ATTEMPTS) {
    const retryAfter = Math.ceil((list[0] + LOGIN_WINDOW_MS - now) / 1000);
    res.set('Retry-After', String(retryAfter));
    return res.status(429).render('login', {
      error: `Too many login attempts. Try again in ${Math.ceil(retryAfter / 60)} minute(s).`,
    });
  }
  list.push(now);
  attempts.set(req.ip, list);
  // Let the route clear the counter on success
  res.locals.clearLoginAttempts = () => attempts.delete(req.ip);
  next();
}

// Periodically drop stale entries so the map can't grow without bound
setInterval(() => {
  const now = Date.now();
  for (const [ip, list] of attempts) {
    const live = list.filter(t => now - t < LOGIN_WINDOW_MS);
    if (live.length) attempts.set(ip, live); else attempts.delete(ip);
  }
}, LOGIN_WINDOW_MS).unref();

module.exports = { sessionMiddleware, requireAuth, loginRateLimit };

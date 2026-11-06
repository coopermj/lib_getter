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
  res.redirect('/login');
}

module.exports = { sessionMiddleware, requireAuth };

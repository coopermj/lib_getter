const express = require('express');
const router = express.Router();

router.get('/login', (req, res) => {
  if (req.session && req.session.authenticated) return res.redirect('/');
  res.render('login', { error: null });
});

router.post('/login', (req, res) => {
  const expected = process.env.MASTER_PASSWORD;
  if (!expected) {
    return res.render('login', { error: 'Server misconfiguration: MASTER_PASSWORD is not set.' });
  }
  const supplied = (req.body.password || '').trim();
  if (supplied && supplied === expected) {
    req.session.authenticated = true;
    return res.redirect('/');
  }
  res.render('login', { error: 'Invalid password' });
});

router.post('/logout', (req, res) => {
  req.session = null;
  res.redirect('/login');
});

module.exports = router;

const express = require('express');
const router  = express.Router();
const { dashboardLocals } = require('./dashboard');

router.get('/', (req, res) => {
  res.render('dashboard', dashboardLocals({ status: req.query.status }));
});

module.exports = router;

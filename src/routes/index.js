const express = require('express');
const router  = express.Router();
const { getBooks } = require('../db');

router.get('/', (req, res) => {
  res.render('dashboard', { books: getBooks() });
});

module.exports = router;

const express = require('express');
const path    = require('path');
const { sessionMiddleware, requireAuth } = require('./auth');

const app = express();

app.set('trust proxy', 1); // trust Railway's HTTPS reverse proxy
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.urlencoded({ extended: false }));
app.use(sessionMiddleware);

// Public routes
app.use(require('./routes/auth'));

// Protected routes
app.use('/',          requireAuth, require('./routes/index'));
app.use('/books',     requireAuth, require('./routes/books'));
app.use('/libraries', requireAuth, require('./routes/libraries'));

// Global error handler — must have 4 parameters for Express to recognize it as an error handler
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).send('<p class="text-red-500 p-4">Something went wrong. Check server logs.</p>');
});

module.exports = app;

const express = require('express');
const path    = require('path');
const { sessionMiddleware, requireAuth } = require('./auth');

const app = express();

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

module.exports = app;

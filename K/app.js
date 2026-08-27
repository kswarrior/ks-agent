const express = require('express');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;

app.set('view engine', 'ejs');
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Routes
const indexRouter = require('./routes/index');
const aboutRouter = require('./routes/about');
const statsRouter = require('./routes/stats');
const docsRouter = require('./routes/docs');

app.use('/', indexRouter);
app.use('/about', aboutRouter);
app.use('/stats', statsRouter);
app.use('/docs', docsRouter);

// 404
app.use((req, res) => {
  res.status(404).render('error', { title: '404', message: 'Page not found' });
});

app.listen(PORT, () => console.log(`KS Warrior site running on http://localhost:${PORT}`));
module.exports = app;
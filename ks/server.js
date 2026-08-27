const express = require('express');
const expressLayouts = require('express-ejs-layouts');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(expressLayouts);
app.set('layout', 'layout');
app.set('layout extractScripts', true);
app.set('layout extractStyles', true);

// Routes
app.get('/', (req, res) => res.render('dashboard', { page: 'dashboard' }));
app.get('/about', (req, res) => res.render('about', { page: 'about' }));
app.get('/dashboard', (req, res) => res.render('dashboard', { page: 'dashboard' }));
app.get('/hosting', (req, res) => res.render('hosting', { page: 'hosting' }));

app.listen(PORT, () => {
  console.log(`Server running ✓ http://localhost:${PORT}`);
});
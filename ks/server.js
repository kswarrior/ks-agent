const express = require('express');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));

// Routes
app.get('/', (req, res) => res.render('dashboard', { page: 'dashboard' }));
app.get('/about', (req, res) => res.render('about', { page: 'about' }));
app.get('/dashboard', (req, res) => res.render('dashboard', { page: 'dashboard' }));

app.listen(PORT, () => {
  console.log(`Server running ✓ http://localhost:${PORT}`);
});
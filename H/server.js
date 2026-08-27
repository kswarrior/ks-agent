const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// View engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Static files
app.use(express.static(path.join(__dirname, 'public')));

// Routes
app.get('/', (req, res) => res.render('dashboard', { page: 'home' }));

app.get('/dashboard', (req, res) => res.render('dashboard', { page: 'dashboard' }));
app.get('/docs', (req, res) => res.render('docs', { page: 'docs' }));
app.get('/docs/getting-started', (req, res) => res.render('docs-getting-started', { page: 'docs' }));
app.get('/docs/api', (req, res) => res.render('docs-api', { page: 'docs' }));
app.get('/docs/components', (req, res) => res.render('docs-components', { page: 'docs' }));

// Start server
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
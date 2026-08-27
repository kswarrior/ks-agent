const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => res.redirect('/dashboard'));

app.get('/dashboard', (req, res) => {
  res.render('dashboard', { page: 'dashboard', title: 'Dashboard' });
});

app.get('/docs', (req, res) => {
  res.render('docs', { page: 'docs', title: 'Docs Home' });
});

app.get('/docs/section', (req, res) => {
  res.render('docs-section', { page: 'docs-section', title: 'Section' });
});

app.get('/docs/introduction', (req, res) => {
  res.render('docs-introduction', { page: 'docs-intro', title: 'Introduction' });
});

app.get('/docs/getting-started', (req, res) => {
  res.render('docs-getting-started', { page: 'docs-getting-started', title: 'Getting Started' });
});

app.get('/docs/api', (req, res) => {
  res.render('docs-api', { page: 'docs-api', title: 'API Reference' });
});

app.get('/docs/faq', (req, res) => {
  res.render('docs-faq', { page: 'docs-faq', title: 'FAQ' });
});

app.get('/docs/releases', (req, res) => {
  res.render('docs-releases', { page: 'docs-releases', title: 'Releases' });
});

app.get('/docs/changelog', (req, res) => {
  res.render('docs-changelog', { page: 'docs-changelog', title: 'Changelog' });
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
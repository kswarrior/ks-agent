const express = require('express');
const path = require('path');

const app = express();
const PORT = 3005;

// Set EJS as templating engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Serve static files from public directory
app.use(express.static(path.join(__dirname, 'public')));

// Helper to get section slug from path
function getSectionFromPath(reqPath) {
  if (!reqPath.startsWith('/docs/')) return null;
  return reqPath.replace('/docs/', '');
}

// Routes
app.get('/', (req, res) => {
  res.render('dashboard', {
    title: 'Dashboard — KS Docs',
    currentPage: 'dashboard',
    currentSection: null
  });
});

app.get('/docs/introduction', (req, res) => {
  res.render('docs/introduction', {
    title: 'Introduction — KS Docs',
    currentPage: 'docs',
    currentSection: 'introduction'
  });
});

app.get('/docs/getting-started', (req, res) => {
  res.render('docs/getting-started', {
    title: 'Getting Started — KS Docs',
    currentPage: 'docs',
    currentSection: 'getting-started'
  });
});

app.get('/docs/api-reference', (req, res) => {
  res.render('docs/api-reference', {
    title: 'API Reference — KS Docs',
    currentPage: 'docs',
    currentSection: 'api-reference'
  });
});

app.get('/docs/configuration', (req, res) => {
  res.render('docs/configuration', {
    title: 'Configuration — KS Docs',
    currentPage: 'docs',
    currentSection: 'configuration'
  });
});

app.get('/docs/deployment', (req, res) => {
  res.render('docs/deployment', {
    title: 'Deployment — KS Docs',
    currentPage: 'docs',
    currentSection: 'deployment'
  });
});

app.get('/docs/faq', (req, res) => {
  res.render('docs/faq', {
    title: 'FAQ — KS Docs',
    currentPage: 'docs',
    currentSection: 'faq'
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).render('docs/introduction', {
    title: 'Page Not Found — KS Docs',
    currentPage: 'docs',
    currentSection: 'introduction'
  });
});

app.listen(PORT, () => {
  console.log(`KS Docs website running at http://localhost:${PORT}`);
});
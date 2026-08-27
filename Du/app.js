const express = require('express');
const path = require('path');
const app = express();
const PORT = 3000;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));

app.use((req, res, next) => {
  res.locals.pageTitle = 'Dashboard';
  res.locals.sidebarActive = null;
  next();
});

app.get('/', (req, res) => {
  res.locals.pageTitle = 'Dashboard';
  res.locals.sidebarActive = 'dashboard';
  res.render('index', {
    stats: [
      { label: 'Total Users', value: '1,245', color: '#4f46e5' },
      { label: 'Documents', value: '368', color: '#059669' },
      { label: 'Page Views', value: '52.4K', color: '#d97706' },
      { label: 'Active Sessions', value: '89', color: '#dc2626' },
    ],
    recentActivity: [
      { user: 'Alice', action: 'updated Getting Started guide', time: '5 min ago' },
      { user: 'Bob', action: 'created API Reference', time: '22 min ago' },
      { user: 'Carol', action: 'commented on Installation', time: '1 hour ago' },
      { user: 'Dave', action: 'deleted old changelog', time: '3 hours ago' },
    ],
    docsSection: [
      { title: 'Getting Started', pages: 4, updated: 'Today' },
      { title: 'API Reference', pages: 12, updated: 'Yesterday' },
      { title: 'Installation', pages: 3, updated: '2 days ago' },
      { title: 'Tutorials', pages: 8, updated: '1 week ago' },
    ]
  });
});

app.get('/docs', (req, res) => {
  res.locals.pageTitle = 'Documentation';
  res.locals.sidebarActive = 'docs';
  res.render('docs/index', {
    sections: [
      {
        title: 'Getting Started',
        description: 'Introduction and quick-start guide to the platform.',
        pages: [
          { title: 'Introduction', url: '/docs/introduction' },
          { title: 'Quick Start', url: '/docs/quick-start' },
          { title: 'Installation', url: '/docs/installation' },
          { title: 'Configuration', url: '/docs/configuration' },
        ]
      },
      {
        title: 'Core Concepts',
        description: 'Fundamental concepts and architecture overview.',
        pages: [
          { title: 'Routing', url: '/docs/routing' },
          { title: 'Middleware', url: '/docs/middleware' },
          { title: 'Controllers', url: '/docs/controllers' },
          { title: 'Models', url: '/docs/models' },
        ]
      },
      {
        title: 'API Reference',
        description: 'Complete API documentation with examples.',
        pages: [
          { title: 'Requests', url: '/docs/api-requests' },
          { title: 'Responses', url: '/docs/api-responses' },
          { title: 'Errors', url: '/docs/api-errors' },
          { title: 'Authentication', url: '/docs/auth' },
        ]
      },
      {
        title: 'Guides',
        description: 'In-depth guides for advanced usage.',
        pages: [
          { title: 'Testing', url: '/docs/testing' },
          { title: 'Deployment', url: '/docs/deployment' },
          { title: 'Security', url: '/docs/security' },
          { title: 'Performance', url: '/docs/performance' },
        ]
      }
    ]
  });
});

app.get('/docs/:section', (req, res) => {
  const section = req.params.section;
  res.locals.pageTitle = `Docs — ${section}`;
  res.locals.sidebarActive = 'docs';
  res.render('docs/section', {
    section,
    content: `<p><strong>Welcome to the ${section} documentation page.</strong></p>
              <p>This is a placeholder for detailed documentation content. In a real application,
              you would load this from markdown files or a database.</p>
              <h3>Overview</h3>
              <p>This section covers everything you need to know about ${section}. Lorem ipsum dolor sit amet,
              consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.</p>
              <h3>Example Code</h3>
              <pre style="background:#1e293b;color:#e2e8f0;padding:1rem;border-radius:6px;overflow:auto;"><code>const app = require('express')();
app.get('/${section}', (req, res) => {
  res.send('Hello from ${section}!');
});
app.listen(3000);</code></pre>`
  });
});

app.use((req, res) => {
  res.status(404);
  res.render('404', { url: req.url });
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
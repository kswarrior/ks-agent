import express from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

app.set('view engine', 'ejs');
app.set('views', join(__dirname, 'views'));
app.use(express.static(join(__dirname, 'public')));

// EJS Layout plugin (ejs-mate style)
const ejs = require('ejs');

const originalRenderFile = ejs.__express;
ejs.__express = function (path, options, ...args) {
  options = options || {};
  const fn = ejs.fileLoader(join(__dirname, 'views', path));
  if (typeof fn === 'function') return fn(options, ...args);
  return originalRenderFile(path, options, ...args);
};

app.engine('ejs', ejs.__express);

const docsData = [
  {
    id: 'getting-started',
    title: 'Getting Started',
    description: 'Introduction and installation guide',
    content: 'Welcome to the documentation! This guide will help you get started with our project. Follow the steps below to set up your environment and begin building amazing things.'
  },
  {
    id: 'api-reference',
    title: 'API Reference',
    description: 'Complete API documentation',
    content: 'The API Reference provides detailed information about all available endpoints, parameters, and response formats. Use this section to integrate with our services effectively.'
  },
  {
    id: 'authentication',
    title: 'Authentication',
    description: 'Learn how to secure your requests',
    content: 'Authentication is crucial for protecting your data. This section covers OAuth 2.0, API keys, and best practices for securely authenticating your applications.'
  },
  {
    id: 'database',
    title: 'Database',
    description: 'Database configuration and models',
    content: 'Learn how to configure and interact with your database. This section covers schema design, migrations, queries, and optimization techniques.'
  },
  {
    id: 'deployment',
    title: 'Deployment',
    description: 'Deploy your application to production',
    content: 'Ready to go live? This guide covers deployment strategies, environment configuration, CI/CD pipelines, and monitoring solutions for production applications.'
  },
  {
    id: 'troubleshooting',
    title: 'Troubleshooting',
    description: 'Common issues and solutions',
    content: 'Encountering problems? Check our comprehensive troubleshooting guide for solutions to common issues, error messages, and performance optimization tips.'
  }
];

app.get('/docs', (req, res) => {
  res.render('docs/index', { 
    title: 'Documentation',
    docs: docsData,
    activeDoc: null
  });
});

app.get('/docs/:id', (req, res) => {
  const doc = docsData.find(d => d.id === req.params.id);
  if (!doc) {
    return res.status(404).render('docs/not-found', { title: 'Not Found' });
  }
  res.render('docs/page', { 
    title: doc.title,
    doc,
    activeDoc: doc.id,
    docs: docsData
  });
});

app.get('/dashboard', (req, res) => {
  res.render('dashboard', { title: 'Dashboard' });
});

app.get('/', (req, res) => {
  res.render('index', { title: 'Home' });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
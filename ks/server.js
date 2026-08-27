const express = require('express');
const path = require('path');

const app = express();
const PORT = 3000;

// Block sensitive files before static serving
app.use((req, res, next) => {
  const blocked = ['/server.js', '/package.json', '/package-lock.json'];
  if (blocked.includes(req.path) || req.path.startsWith('/node_modules')) {
    return res.status(404).send('Not found');
  }
  next();
});

// Serve static files from the current directory
app.use(express.static(path.join(__dirname), {
  dotfiles: 'ignore',
  index: ['index.html']
}));

// Start server
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
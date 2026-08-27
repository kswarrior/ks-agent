const express = require('express');
const path = require('path');

const app = express();
const PORT = 3000;

// Serve static files from the current directory, but block sensitive files
app.use(express.static(path.join(__dirname), {
  dotfiles: 'ignore',
  index: ['index.html'],
  setHeaders(res, filePath) {
    if (filePath.endsWith('server.js') || filePath.includes('node_modules')) {
      res.statusCode = 404;
    }
  }
}));
// Block direct access to sensitive files
app.use('/server.js', (req, res) => res.status(404).send('Not found'));
app.use('/package.json', (req, res) => res.status(404).send('Not found'));
app.use('/package-lock.json', (req, res) => res.status(404).send('Not found'));

// Start server
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
const express = require('express');
const app = express();
const port = 3002;

app.get('/', (req, res) => {
  res.send('<h1>Hello World</h1>');
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
}).on('error', (err) => {
  console.error('Server error:', err);
});
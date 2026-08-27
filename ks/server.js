const express = require('express');
const app = express();
const port = 3000;

app.set('view engine', 'ejs');
app.set('views', './views');
app.use(express.static('public'));

app.get('/', (req, res) => {
  res.render('dashboard', { title: 'KS Docs Dashboard' });
});

app.get('/api', (req, res) => {
  res.render('api', { title: 'API Documentation' });
});

app.get('/guides', (req, res) => {
  res.render('guides', { title: 'Guides' });
});

app.listen(port, () => {
  console.log(`KS Docs website running at http://localhost:${port}`);
});
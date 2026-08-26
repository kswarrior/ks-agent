const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.get('/', (req, res) => {
  res.render('index', { title: 'Hello World', message: 'Hello from EJS!' });
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});